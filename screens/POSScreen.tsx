import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput as RNTextInput, ActivityIndicator, Modal,
  useWindowDimensions,
} from 'react-native';
import { Button, Snackbar } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import ConfirmDialog from '../components/ConfirmDialog';
import { COLOR, SPACE, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOW } from '../theme';
import axios from 'axios';
import { REACT_APP_API_URL } from '../config';
import { useStore, Store } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { stockColor } from '../utils/stockStatus';
import { useMoney } from '../context/TenantConfigContext';
import { APP_LOCALE, formatTime } from '../utils/format';
import { BRAND_NAME } from '../constants/brand';
import Ticket, { CartItem } from './pos/Ticket';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Shift {
  id: number; code: string; username: string; status: string;
  storeId: number; storeName: string; openedAt: string;
}
interface Category { id: number; name: string; active: boolean; children: Category[]; productCount: number; }
interface StockItem {
  stockId: number; productId: number; productName: string; productSku: string;
  productType: string; productActive: boolean; price: number; quantity: number;
  minStock: number; lowStock: boolean; categoryPath: string; categoryId: number | null;
}
interface SaleRecord {
  id: number; shiftId: number; username: string; saleDate: string; status: string;
  subtotal: number; isv: number; total: number; createdAt: string;
  items: { id: number; productId: number; productName: string; unitPrice: number; quantity: number; subtotal: number; }[];
}
interface ProductSummaryItem { productId: number; productName: string; quantity: number; subtotal: number; }
interface DailySummary {
  date: string; storeId: number; storeName: string; totalSales: number;
  totalSubtotal: number; totalIsv: number; totalAmount: number;
  productSummary: ProductSummaryItem[];
}

const ISV = 0; // ISV deshabilitado por solicitud del cliente

// Aplana categorías para chips
const flatCats = (cats: Category[]): Category[] => {
  const out: Category[] = [];
  for (const c of cats) { out.push(c); if (c.children?.length) out.push(...flatCats(c.children)); }
  return out;
};

// ─── POSScreen ────────────────────────────────────────────────────────────────

export default function POSScreen({ hideStoreSelector = false }: { hideStoreSelector?: boolean }) {
  const money = useMoney();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const { selectedStore, stores, setSelectedStore, loadingStores, storesError, refreshStores } = useStore();
  const { userName, logout } = useAuth();
  const storeId = selectedStore?.id ?? null;
  const API     = REACT_APP_API_URL;

  // ── Estado base ───────────────────────────────────────────────────────────

  const [shift, setShift]             = useState<Shift | null>(null);
  const [loadingShift, setLoadingShift] = useState(true);
  // P-07: un error de red al consultar el turno NO es "sin turno activo".
  const [shiftError, setShiftError]   = useState(false);
  // P-03: evita doble POST al abrir turno o confirmar el cierre.
  const [shiftBusy, setShiftBusy]     = useState(false);
  const [categories, setCategories]   = useState<Category[]>([]);
  const [stock, setStock]             = useState<StockItem[]>([]);
  const [loading, setLoading]         = useState(false);
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [search, setSearch]           = useState('');

  // Selección y cantidad pendiente (no se agrega al carrito hasta click en Agregar)
  const [selectedId, setSelectedId]   = useState<number | null>(null);
  const [pendingQty, setPendingQty]   = useState(1);

  // Carrito: array fijo — solo se puede eliminar, no editar qty (P-14: decisión de producto pendiente)
  const [cart, setCart]               = useState<CartItem[]>([]);
  const [snackbar, setSnackbar]       = useState('');
  const [submitting, setSubmitting]   = useState(false);

  // Tab del POS
  const [posTab, setPosTab]               = useState<'nueva' | 'ventas'>('nueva');
  // P-11: única fuente para los KPIs del turno y el contador de la pestaña
  // (antes había un KPI optimista aparte que se desfasaba del listado).
  const [shiftSales, setShiftSales]       = useState<SaleRecord[]>([]);
  const [loadingSales, setLoadingSales]   = useState(false);
  const [cancellingId, setCancellingId]   = useState<number | null>(null);
  const [confirmDlg, setConfirmDlg]       = useState<{
    title: string; message: string; onConfirm: () => void; confirmLabel?: string; confirmColor?: string;
  } | null>(null);
  const askConfirm = (
    title: string, message: string, onConfirm: () => void,
    opts?: { confirmLabel?: string; confirmColor?: string },
  ) => setConfirmDlg({ title, message, onConfirm, ...opts });

  // Modales
  const [openShiftModal, setOpenShiftModal] = useState(false);
  const [closingModal, setClosingModal]     = useState(false);
  const [summary, setSummary]               = useState<DailySummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [closingDone, setClosingDone]       = useState(false);
  // En nativo el Snackbar queda detrás del Modal: el error del cierre se muestra dentro del modal.
  const [closingError, setClosingError]     = useState<string | null>(null);

  // P-10: local y turno "vigentes". Una respuesta que llega tarde de otro local/turno se descarta.
  const storeRef   = useRef(storeId);
  const shiftIdRef = useRef<number | null>(null);
  useEffect(() => { storeRef.current = storeId; }, [storeId]);
  useEffect(() => { shiftIdRef.current = shift?.id ?? null; }, [shift]);

  // P-11: KPIs derivados del listado del servidor (mismo dato que el contador de la pestaña).
  const kpiCount = shiftSales.length;
  const kpiTotal = shiftSales.reduce((s, v) => s + Number(v.total ?? 0), 0);

  /** P-12: el usuario que audita la operación no se inventa ("empleada"). Sin usuario no hay sesión válida. */
  const requireUser = (): string | null => {
    if (userName) return userName;
    setSnackbar('Tu sesión no es válida. Volvé a ingresar.');
    logout();
    return null;
  };

  // ── Cargar turno y catálogo ───────────────────────────────────────────────

  const loadShift = useCallback(async () => {
    // P-08: sin local no hay nada que cargar; antes loadingShift quedaba en true para siempre.
    if (!storeId) { setShift(null); setShiftError(false); setLoadingShift(false); return; }
    const reqStore = storeId;
    setLoadingShift(true);
    setShiftError(false);
    try {
      const res = await axios.get<Shift | ''>(`${API}/api/v2/shifts/active/${storeId}`, { timeout: 15000 });
      if (storeRef.current !== reqStore) return;
      // ShiftController.getActiveShift responde 204 sin cuerpo cuando no hay turno abierto.
      setShift(res.status === 204 || !res.data ? null : res.data);
    } catch (e: any) {
      if (storeRef.current !== reqStore) return;
      setShift(null);
      // 404 se trata como "sin turno" por compatibilidad; cualquier otro error (red,
      // timeout, 5xx, 403) bloquea con "No pudimos verificar el turno" (P-07).
      if (e?.response?.status !== 404) setShiftError(true);
    } finally {
      if (storeRef.current === reqStore) setLoadingShift(false);
    }
  }, [storeId]);

  const loadCatalog = useCallback(async () => {
    if (!storeId) return;
    const reqStore = storeId;
    setLoading(true);
    try {
      const [catRes, stockRes] = await Promise.all([
        axios.get<Category[]>(`${API}/api/v2/stores/${storeId}/categories`),
        axios.get<StockItem[]>(`${API}/api/v2/stores/${storeId}/stock`),
      ]);
      if (storeRef.current !== reqStore) return; // P-10
      setCategories(catRes.data);
      setStock(stockRes.data.filter(s => s.productActive));
    } catch {
      if (storeRef.current === reqStore) setSnackbar('Error al cargar catálogo');
    } finally {
      if (storeRef.current === reqStore) setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { loadShift(); }, [loadShift]);
  useEffect(() => {
    // Cambio de local: se descarta lo del local anterior antes de cargar el nuevo (P-10).
    setStock([]); setCategories([]); setSelectedCat(null);
    loadCatalog(); setCart([]); setSelectedId(null); setPendingQty(1);
  }, [loadCatalog]);

  const loadShiftSales = useCallback(async () => {
    if (!shift) return;
    const reqShift = shift.id;
    setLoadingSales(true);
    try {
      const res = await axios.get<SaleRecord[]>(`${API}/api/v2/shifts/${shift.id}/sales`);
      if (shiftIdRef.current !== reqShift) return; // P-10
      // P-11: una venta anulada se BORRA en el backend (SalesService.cancelSale ->
      // saleRepository.delete) y SaleStatus solo tiene OPEN/CONFIRMED: no hace falta filtrar.
      setShiftSales(res.data ?? []);
    } catch { /* silencioso: se conservan los datos anteriores */ }
    finally { setLoadingSales(false); }
  }, [shift]);

  // Carga ventas/KPIs al activarse el turno
  useEffect(() => {
    if (shift) loadShiftSales();
    else setShiftSales([]);
  }, [shift]);

  const handleSwitchTab = (tab: 'nueva' | 'ventas') => {
    setPosTab(tab);
    if (tab === 'ventas') loadShiftSales();
  };

  const handleCancelSale = (saleId: number) => {
    askConfirm(
      'Anular venta',
      '¿Anular esta venta? El stock descontado será revertido automáticamente.',
      async () => {
        setCancellingId(saleId);
        try {
          await axios.delete(`${API}/api/v2/sales/${saleId}`);
          setShiftSales(prev => prev.filter(s => s.id !== saleId)); // los KPIs derivados bajan solos
          setSnackbar('Venta anulada');
          loadCatalog();
        } catch (e: any) { setSnackbar(e.response?.data?.error || 'Error al anular'); }
        finally { setCancellingId(null); }
      },
      { confirmLabel: 'Sí, anular', confirmColor: COLOR.expense },
    );
  };

  // P-09: cambiar de local con productos cargados pide confirmación (antes el
  // useEffect de loadCatalog vaciaba el carrito sin avisar).
  const changeStore = (s: Store) => {
    if (s.id === selectedStore?.id) return;
    if (cart.length === 0) { setSelectedStore(s); return; }
    const n = cart.reduce((acc, i) => acc + i.qty, 0);
    askConfirm(
      'Cambiar de local',
      `Se va a descartar la venta en curso (${n} ${n === 1 ? 'artículo' : 'artículos'}).`,
      () => setSelectedStore(s),
      { confirmLabel: 'Cambiar de local', confirmColor: COLOR.warn },
    );
  };

  // ── Filtrado ──────────────────────────────────────────────────────────────

  function allCatIds(cat: Category): number[] {
    return [cat.id, ...cat.children.flatMap(allCatIds)];
  }
  function findCat(cats: Category[], id: number): Category | null {
    for (const c of cats) { if (c.id === id) return c; const f = findCat(c.children, id); if (f) return f; }
    return null;
  }

  const filtered = stock.filter(item => {
    if (search) {
      const q = search.toLowerCase();
      if (!item.productName.toLowerCase().includes(q) && !(item.productSku || '').toLowerCase().includes(q)) return false;
    }
    if (selectedCat !== null) {
      const cat = findCat(categories, selectedCat);
      if (!cat || !item.categoryId) return false;
      if (!allCatIds(cat).includes(item.categoryId)) return false;
    }
    return true;
  });

  // ── Carrito ───────────────────────────────────────────────────────────────

  // Estimación local: el total real (impuestos/recargos del tenant) lo calcula el
  // backend y se informa al confirmar la venta (P-06).
  const cartSubtotal  = cart.reduce((s, i) => s + i.subtotal, 0);
  const cartISV       = cartSubtotal * ISV;
  const cartTotal     = cartSubtotal + cartISV;
  const cartItemCount = cart.reduce((s, i) => s + i.qty, 0);

  const isInCart = (productId: number) => cart.some(c => c.productId === productId);

  // Seleccionar producto (solo si no está ya en el carrito)
  const selectProduct = (item: StockItem) => {
    if (isInCart(item.productId)) {
      setSnackbar('Ya está en el carrito. Eliminalo para cambiar la cantidad.');
      return;
    }
    setSelectedId(item.productId);
    setPendingQty(1);
  };

  // Confirmar adición al carrito
  const addToCart = () => {
    const item = stock.find(s => s.productId === selectedId);
    if (!item || pendingQty < 1) return;
    // P-04: nunca más de lo que hay en stock (el backend además aborta la venta entera).
    if (pendingQty > item.quantity) { setSnackbar(`Solo hay ${item.quantity} en stock`); return; }
    setCart(prev => [...prev, { productId: item.productId, productName: item.productName, price: item.price, qty: pendingQty, subtotal: item.price * pendingQty }]);
    setSelectedId(null);
    setPendingQty(1);
  };

  const removeFromCart = (productId: number) =>
    setCart(prev => prev.filter(c => c.productId !== productId));

  const clearCart = () => { setCart([]); setSelectedId(null); setPendingQty(1); };

  // ── Abrir turno ───────────────────────────────────────────────────────────

  const handleOpenShift = async () => {
    if (!storeId || shiftBusy) return;
    const username = requireUser();
    if (!username) return;
    setShiftBusy(true);
    try {
      const res = await axios.post<Shift>(`${API}/api/v2/stores/${storeId}/shifts`, { username });
      setShift(res.data);
      setShiftError(false);
      setOpenShiftModal(false);
      setSnackbar(`Turno ${res.data.code} abierto`);
    } catch (e: any) { setSnackbar(e.response?.data?.error || 'Error al abrir turno'); }
    finally { setShiftBusy(false); }
  };

  // ── Confirmar venta ───────────────────────────────────────────────────────

  const handleSubmitSale = async () => {
    if (!shift || cart.length === 0 || submitting) return;
    const username = requireUser();
    if (!username) return;
    setSubmitting(true);
    try {
      const res = await axios.post<SaleRecord>(`${API}/api/v2/shifts/${shift.id}/sales`, {
        username,
        items: cart.map(i => ({ productId: i.productId, quantity: i.qty })),
      });
      clearCart();
      // P-06: aviso con el total que registró el servidor, en la moneda de la empresa.
      setSnackbar(`Venta registrada · ${money(res.data?.total ?? cartTotal)}`);
      loadCatalog();
      loadShiftSales(); // P-11: KPIs y contador desde el servidor, no optimistas
    } catch (e: any) { setSnackbar(e.response?.data?.error || 'Error al registrar venta'); }
    finally { setSubmitting(false); }
  };

  // ── Cierre de turno ───────────────────────────────────────────────────────

  const openClosing = async () => {
    if (!shift) return;
    setLoadingSummary(true);
    setClosingModal(true);
    setClosingDone(false);
    setClosingError(null);
    try {
      const res = await axios.get<DailySummary>(`${API}/api/v2/shifts/${shift.id}/summary`);
      setSummary(res.data);
    } catch { setSnackbar('Error al cargar resumen'); setClosingModal(false); }
    finally { setLoadingSummary(false); }
  };

  const handleConfirmClosing = async () => {
    if (!shift || shiftBusy) return;
    const username = requireUser();
    if (!username) return;
    setShiftBusy(true);
    setClosingError(null);
    try {
      await axios.post(`${API}/api/v2/shifts/${shift.id}/closing`, { username });
      // El turno se limpia recién al tocar "Aceptar" (aceptarCierre): con setShift(null) acá, la pantalla
      // pasaba enseguida a "sin turno" y el cajero nunca veía la confirmación "Turno cerrado" (lo encontró el E2E).
      setClosingDone(true);
      clearCart();
    } catch (e: any) { setClosingError(e.response?.data?.error || 'Error al confirmar cierre'); }
    finally { setShiftBusy(false); }
  };

  const aceptarCierre = () => {
    setClosingModal(false);
    setClosingDone(false);
    setShift(null);
  };

  // Chips de local (solo admin). Reusados en "sin turno", "error de turno" y encabezado.
  const storeChips = !hideStoreSelector && stores.length > 0 ? (
    <View style={styles.localChips}>
      {stores.map(s => (
        <TouchableOpacity
          key={s.id}
          style={[styles.localChip, selectedStore?.id === s.id && styles.localChipActive]}
          onPress={() => changeStore(s)}
          accessibilityRole="button"
          accessibilityState={{ selected: selectedStore?.id === s.id }}
        >
          <Text style={[styles.localChipText, selectedStore?.id === s.id && styles.localChipTextActive]}>{s.name}</Text>
        </TouchableOpacity>
      ))}
    </View>
  ) : null;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  // ── P-08: sin local elegido (antes: spinner infinito) ─────────────────────

  if (!storeId) return (
    <View style={styles.noShift}>
      {loadingStores ? (
        <ActivityIndicator size="large" color={COLOR.brand} />
      ) : storesError ? (
        <>
          <MaterialCommunityIcons name="wifi-off" size={52} color={COLOR.warn} />
          <Text style={styles.noShiftTitle}>No se pudieron cargar los locales</Text>
          <Text style={styles.noShiftSub}>Revisá la conexión e intentá de nuevo.</Text>
          <Button mode="contained" onPress={() => { refreshStores(); }} buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} style={{ borderRadius: RADIUS.r2 }}>
            Reintentar
          </Button>
        </>
      ) : (
        <>
          <MaterialCommunityIcons name="store-off-outline" size={52} color={COLOR.inkDisabled} />
          <Text style={styles.noShiftTitle}>Elegí un local</Text>
          <Text style={styles.noShiftSub}>
            {stores.length === 0 ? 'No hay locales activos. Pedí al administrador que active uno.' : 'No hay un local activo seleccionado.'}
          </Text>
          {storeChips}
        </>
      )}
    </View>
  );

  if (loadingShift) return <ActivityIndicator size="large" color={COLOR.brand} style={{ flex: 1, marginTop: 60 }} />;

  // ── P-07: no se pudo verificar el turno (red/servidor) ────────────────────
  // No se ofrece "Abrir turno": el local podría tener uno abierto.

  if (shiftError) return (
    <View style={styles.noShift}>
      <MaterialCommunityIcons name="wifi-off" size={52} color={COLOR.warn} />
      <Text style={styles.noShiftTitle}>No pudimos verificar el turno</Text>
      <Text style={styles.noShiftSub}>Revisá la conexión. No abras otro turno hasta confirmar.</Text>
      {storeChips}
      <Button mode="contained" onPress={() => { loadShift(); }} buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} style={{ borderRadius: RADIUS.r2 }}>
        Reintentar
      </Button>
    </View>
  );

  // ── Sin turno activo ──────────────────────────────────────────────────────

  if (!shift) return (
    <View style={styles.noShift}>
      <MaterialCommunityIcons name="clock-outline" size={52} color={COLOR.inkDisabled} />
      <Text style={styles.noShiftTitle}>Sin turno activo</Text>
      <Text style={styles.noShiftSub}>Abrí un turno para comenzar a registrar ventas</Text>

      {/* Selector de local — solo para admin. El cajero ve en qué local está (P-01). */}
      {hideStoreSelector
        ? <Text style={styles.noShiftStore}>Local: {selectedStore?.name ?? '—'}</Text>
        : storeChips}

      <Button mode="contained" onPress={() => setOpenShiftModal(true)} buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} style={{ borderRadius: RADIUS.r2 }} labelStyle={{ fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.black as any }}>
        Abrir turno
      </Button>

      <Modal visible={openShiftModal} transparent animationType="fade" onRequestClose={() => !shiftBusy && setOpenShiftModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Abrir turno</Text>
            <Text style={styles.modalSub}>Local: <Text style={{ fontWeight: '900' }}>{selectedStore?.name ?? '—'}</Text></Text>
            <Text style={styles.modalSub}>Atiende: <Text style={{ fontWeight: '900' }}>{userName ?? '—'}</Text></Text>
            <View style={styles.modalActions}>
              <Button mode="outlined" onPress={() => setOpenShiftModal(false)} disabled={shiftBusy} style={{ flex: 1 }}>Cancelar</Button>
              <Button mode="contained" onPress={handleOpenShift} loading={shiftBusy} disabled={shiftBusy} buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} style={{ flex: 1 }}>Confirmar</Button>
            </View>
          </View>
        </View>
      </Modal>

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar('')} duration={2500}>{snackbar}</Snackbar>
    </View>
  );

  // ── POS activo ────────────────────────────────────────────────────────────

  const allFlat = flatCats(categories).filter(c => c.active);

  return (
    <View style={styles.root}>

      {/* ══ HEADER ══ */}
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.headerBrand}>{shift.storeName ?? BRAND_NAME}</Text>
          <Text style={styles.headerShift} numberOfLines={1}>● {shift.code} · {shift.username}</Text>
        </View>

        {/* Selector de local — oculto para empleados (hideStoreSelector=true). P-09: confirma si hay carrito. */}
        {storeChips}

        <Button mode="outlined" onPress={openClosing} textColor={COLOR.expense} style={{ borderColor: COLOR.expense, borderRadius: RADIUS.r1 }} labelStyle={{ fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.black as any }}>
          Cerrar turno
        </Button>
      </View>

      {/* ══ KPIs del turno ══ */}
      <View style={styles.kpiBar}>
        <View style={styles.kpiItem}>
          <Text style={styles.kpiLabel}>Ventas del turno</Text>
          <Text style={styles.kpiValue}>{kpiCount}</Text>
        </View>
        <View style={styles.kpiDivider} />
        <View style={styles.kpiItem}>
          <Text style={styles.kpiLabel}>Total acumulado</Text>
          <Text style={styles.kpiValue}>{money(kpiTotal)}</Text>
        </View>
        <View style={styles.kpiDivider} />
        <View style={styles.kpiItem}>
          {/* P-17: el código del turno ya está en el encabezado; acá va la hora de apertura. */}
          <Text style={styles.kpiLabel}>Abierto a las</Text>
          <Text style={styles.kpiValue} numberOfLines={1}>{shift.openedAt ? formatTime(shift.openedAt) : '—'}</Text>
        </View>
      </View>

      {/* ══ TABS: Nueva venta / Ventas del turno ══ */}
      <View style={styles.tabBar}>
        <TouchableOpacity style={[styles.posTab, posTab === 'nueva' && styles.posTabActive]} onPress={() => handleSwitchTab('nueva')}>
          <Text style={[styles.posTabText, posTab === 'nueva' && styles.posTabTextActive]}>Nueva venta</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.posTab, posTab === 'ventas' && styles.posTabActive]} onPress={() => handleSwitchTab('ventas')}>
          <Text style={[styles.posTabText, posTab === 'ventas' && styles.posTabTextActive]}>
            Ventas del turno{shiftSales.length > 0 ? ` (${shiftSales.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ══ CHIPS DE CATEGORÍA (solo en tab nueva venta) ══ */}
      {posTab === 'nueva' && <View style={styles.chipsBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}>
          <TouchableOpacity style={[styles.catChip, selectedCat === null && styles.catChipActive]} onPress={() => setSelectedCat(null)}>
            <Text style={[styles.catChipText, selectedCat === null && styles.catChipTextActive]}>Todas</Text>
          </TouchableOpacity>
          {allFlat.map(c => (
            <TouchableOpacity key={c.id} style={[styles.catChip, selectedCat === c.id && styles.catChipActive]} onPress={() => setSelectedCat(selectedCat === c.id ? null : c.id)}>
              <Text style={[styles.catChipText, selectedCat === c.id && styles.catChipTextActive]}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>}

      {/* ══ BUSCADOR (solo en tab nueva venta) ══ */}
      {posTab === 'nueva' && <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={18} color={COLOR.inkMute} style={{ marginRight: SPACE.s1 }} />
          <RNTextInput
            placeholder="Buscar producto por nombre o código..." placeholderTextColor={COLOR.inkDisabled}
            value={search} onChangeText={setSearch} style={styles.searchInput}
          />
          {search ? <TouchableOpacity onPress={() => setSearch('')}><MaterialCommunityIcons name="close-circle" size={18} color={COLOR.inkDisabled} /></TouchableOpacity> : null}
        </View>
        {/* Conteo de productos + local */}
        <Text style={styles.catalogMeta}>Productos activos · {selectedStore?.name}  <Text style={styles.catalogCount}>{filtered.length} productos</Text></Text>
      </View>}

      {/* ══ LAYOUT PRINCIPAL ══ */}
      {posTab === 'nueva' && <View style={[styles.main, isDesktop && styles.mainDesktop]}>

        {/* Grilla de productos */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.grid}>
          {loading
            ? <ActivityIndicator color={COLOR.brand} style={{ marginTop: 40 }} />
            : filtered.length === 0
              ? <Text style={styles.empty}>No hay productos en esta categoría.</Text>
              : filtered.map(item => {
                  const isSelected  = selectedId === item.productId;
                  const inCart      = isInCart(item.productId);
                  const outOfStock  = item.quantity === 0;
                  return (
                    <TouchableOpacity
                      key={item.productId}
                      activeOpacity={outOfStock ? 1 : 0.85}
                      disabled={outOfStock}
                      onPress={() => selectProduct(item)}
                      style={[
                        styles.productCard,
                        isSelected  && styles.productCardSelected,
                        inCart      && styles.productCardInCart,
                        outOfStock  && styles.productCardDisabled,
                      ]}
                    >
                      {/* Badges de estado */}
                      {inCart && (
                        <View style={styles.inCartBadge}>
                          <Text style={styles.inCartBadgeText}>En carrito</Text>
                        </View>
                      )}
                      {outOfStock && (
                        <View style={styles.outOfStockBadge}>
                          <Text style={styles.outOfStockBadgeText}>Sin stock</Text>
                        </View>
                      )}

                      {/* Fila 1: info + precio */}
                      <View style={styles.pcTop}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.pcName} numberOfLines={2}>{item.productName}</Text>
                          {item.productSku ? <Text style={styles.pcCode}>{item.productSku}</Text> : null}
                        </View>
                        <Text style={styles.pcPrice}>{money(item.price)}</Text>
                      </View>

                      {/* Fila 2: stock */}
                      <Text style={[styles.pcStock, { color: stockColor(item) }]}>
                        Stock: {item.quantity}
                      </Text>

                      {/* Fila 3: qty controls + Agregar (solo cuando está seleccionado) */}
                      {isSelected ? (
                        <View>
                          <View style={styles.pcBottom}>
                            <View style={styles.qtyControl}>
                              <TouchableOpacity
                                style={[styles.qtyBtn, pendingQty <= 1 && styles.qtyBtnDisabled]}
                                onPress={() => setPendingQty(q => Math.max(1, q - 1))}
                                disabled={pendingQty <= 1}
                                accessibilityRole="button"
                                accessibilityLabel="Restar uno"
                              >
                                <Text style={styles.qtyBtnText}>−</Text>
                              </TouchableOpacity>
                              <Text style={styles.qtyNum}>{pendingQty}</Text>
                              {/* P-04: tope = stock disponible */}
                              <TouchableOpacity
                                style={[styles.qtyBtn, pendingQty >= item.quantity && styles.qtyBtnDisabled]}
                                onPress={() => setPendingQty(q => Math.min(item.quantity, q + 1))}
                                disabled={pendingQty >= item.quantity}
                                accessibilityRole="button"
                                accessibilityLabel="Sumar uno"
                              >
                                <Text style={styles.qtyBtnText}>+</Text>
                              </TouchableOpacity>
                            </View>
                            <TouchableOpacity style={styles.addBtn} onPress={addToCart} accessibilityRole="button">
                              <Text style={styles.addBtnText}>Agregar</Text>
                            </TouchableOpacity>
                          </View>
                          {pendingQty >= item.quantity && <Text style={[styles.pcStock, styles.qtyMax]}>Máx. {item.quantity}</Text>}
                        </View>
                      ) : (
                        /* Estado inactivo */
                        <View style={styles.pcBottomInactive}>
                          <Text style={[styles.pcTapHint, outOfStock && { color: COLOR.expense }]}>
                            {outOfStock ? 'No disponible' : inCart ? 'En carrito' : 'Toca para seleccionar'}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })
          }
        </ScrollView>

        {/* ══ TICKET ══ */}
        {isDesktop
          ? <View style={styles.ticketDesktop}><Ticket cart={cart} subtotal={cartSubtotal} total={cartTotal} itemCount={cartItemCount} onRemove={removeFromCart} onClear={clearCart} onSubmit={handleSubmitSale} submitting={submitting} full /></View>
          : <View style={styles.ticketMobile}><Ticket cart={cart} subtotal={cartSubtotal} total={cartTotal} itemCount={cartItemCount} onRemove={removeFromCart} onClear={clearCart} onSubmit={handleSubmitSale} submitting={submitting} full={false} /></View>
        }
      </View>}

      {/* ══ TAB VENTAS DEL TURNO ══ */}
      {posTab === 'ventas' && (
        <View style={{ flex: 1 }}>
          {loadingSales ? (
            <ActivityIndicator color={COLOR.brand} size="large" style={{ marginTop: 40 }} />
          ) : (
            <ScrollView contentContainerStyle={{ padding: 12, gap: 10 }}>
              {shiftSales.length === 0 ? (
                <View style={styles.salesEmpty}>
                  <MaterialCommunityIcons name="receipt" size={40} color={COLOR.inkDisabled} />
                  <Text style={styles.salesEmptyText}>Todavía no hay ventas en este turno.</Text>
                  <Text style={styles.salesEmptySub}>Registrá una venta y aparecerá aquí.</Text>
                </View>
              ) : (
                <>
                  {/* Resumen del turno */}
                  <View style={styles.salesSummary}>
                    <Text style={styles.salesSummaryText}>
                      {shiftSales.length} venta{shiftSales.length !== 1 ? 's' : ''}
                    </Text>
                    <Text style={styles.salesSummaryTotal}>
                      {money(shiftSales.reduce((s, v) => s + v.total, 0))}
                    </Text>
                  </View>

                  {/* Lista de ventas (más reciente primero) */}
                  {[...shiftSales].reverse().map(sale => (
                    <View key={sale.id} style={styles.saleCard}>
                      {/* Header de la venta */}
                      <View style={styles.saleCardHead}>
                        <Text style={styles.saleCardTime}>
                          {formatTime(sale.createdAt)}
                        </Text>
                        <Text style={styles.saleCardTotal}>{money(sale.total)}</Text>
                        <TouchableOpacity
                          style={[styles.cancelBtn, cancellingId === sale.id && { opacity: 0.5 }]}
                          onPress={() => handleCancelSale(sale.id)}
                          disabled={cancellingId === sale.id}
                        >
                          <Text style={styles.cancelBtnText}>
                            {cancellingId === sale.id ? '...' : 'Anular'}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* Items de la venta */}
                      <View style={styles.saleCardItems}>
                        {sale.items.map(item => (
                          <Text key={item.id} style={styles.saleCardItem} numberOfLines={1}>
                            · {item.productName} × {item.quantity}  <Text style={{ color: COLOR.ink2 }}>{money(item.subtotal)}</Text>
                          </Text>
                        ))}
                      </View>

                      <View style={styles.saleCardFooter}>
                        <Text style={styles.saleCardFooterText}>Total: {money(sale.total)}</Text>
                      </View>
                    </View>
                  ))}
                </>
              )}
            </ScrollView>
          )}
        </View>
      )}

      {/* ══ MODAL CIERRE DE TURNO ══ */}
      <Modal visible={closingModal} transparent animationType="slide" onRequestClose={() => closingDone ? aceptarCierre() : !shiftBusy && setClosingModal(false)}>
        <View style={styles.overlay}>
          <View style={[styles.modal, { maxWidth: 520, maxHeight: '92%' }]}>
            {closingDone ? (
              <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                <MaterialCommunityIcons name="check-circle-outline" size={52} color={COLOR.income} />
                <Text style={[styles.modalTitle, { textAlign: 'center', marginTop: 12 }]}>Turno cerrado</Text>
                <Text style={{ color: COLOR.ink2, textAlign: 'center', marginTop: 8 }}>El cierre fue registrado en el sistema financiero.</Text>
                <Button mode="contained" buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} style={{ marginTop: 20, borderRadius: RADIUS.r2 }} onPress={aceptarCierre}>Aceptar</Button>
              </View>
            ) : loadingSummary ? (
              <ActivityIndicator color={COLOR.brand} style={{ margin: 40 }} />
            ) : summary ? (
              <>
                <Text style={styles.modalTitle}>Cierre de turno</Text>
                <Text style={styles.modalSub}>{selectedStore?.name} · {shift.code}</Text>

                <ScrollView style={{ maxHeight: 260, marginVertical: 12 }}>
                  <View style={styles.sumRow}>
                    <Text style={[styles.sumCell, styles.sumHeader, { flex: 1 }]}>Producto</Text>
                    <Text style={[styles.sumCell, styles.sumHeader, { width: 46, textAlign: 'center' }]}>Cant.</Text>
                    <Text style={[styles.sumCell, styles.sumHeader, { width: 88, textAlign: 'right' }]}>Subtotal</Text>
                  </View>
                  {summary.productSummary.map((p, i) => (
                    <View key={i} style={styles.sumRow}>
                      <Text style={[styles.sumCell, { flex: 1 }]} numberOfLines={1}>{p.productName}</Text>
                      <Text style={[styles.sumCell, { width: 46, textAlign: 'center' }]}>{p.quantity}</Text>
                      <Text style={[styles.sumCell, { width: 88, textAlign: 'right' }]}>{money(p.subtotal)}</Text>
                    </View>
                  ))}
                </ScrollView>

                <View style={styles.sumDivider} />
                <View style={{ gap: 4 }}>
                  <View style={styles.sumTotalRow}><Text style={styles.sumLabel}>Subtotal</Text><Text style={styles.sumValue}>{money(summary.totalSubtotal)}</Text></View>
                  <View style={[styles.sumTotalRow, { borderTopWidth: 2, borderTopColor: COLOR.ink, marginTop: 6, paddingTop: 6 }]}>
                    {/* P-13: el resumen es del turno (SalesService.getDailySummary filtra por shiftId), no del día del local. */}
                    <Text style={{ fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.black as any, color: COLOR.ink }}>Total del turno</Text>
                    <Text style={{ fontSize: FONT_SIZE.h2, fontWeight: FONT_WEIGHT.black as any, color: COLOR.ink }}>{money(summary.totalAmount)}</Text>
                  </View>
                  <Text style={{ fontSize: FONT_SIZE.caption, color: COLOR.ink2, marginTop: 4 }}>{summary.totalSales} venta{summary.totalSales !== 1 ? 's' : ''} registrada{summary.totalSales !== 1 ? 's' : ''}</Text>
                </View>

                <Text style={styles.closingWarn}>Esta acción no se puede deshacer</Text>
                {closingError && <Text style={styles.closingError}>{closingError}</Text>}

                <View style={styles.modalActions}>
                  <Button mode="outlined" onPress={() => setClosingModal(false)} disabled={shiftBusy} style={{ flex: 1 }}>Cancelar</Button>
                  {/* P-03: un solo POST /closing aunque se toque dos veces */}
                  <Button mode="contained" buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} style={{ flex: 1 }} onPress={handleConfirmClosing} loading={shiftBusy} disabled={shiftBusy}>Confirmar cierre</Button>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={!!confirmDlg}
        title={confirmDlg?.title ?? ''}
        message={confirmDlg?.message ?? ''}
        confirmLabel={confirmDlg?.confirmLabel ?? 'Confirmar'}
        confirmColor={confirmDlg?.confirmColor ?? COLOR.expense}
        // P-02: cerrar el diálogo ANTES de ejecutar; antes quedaba abierto y un segundo
        // toque mandaba otro DELETE sobre la venta ya anulada.
        onConfirm={() => { const fn = confirmDlg?.onConfirm; setConfirmDlg(null); fn?.(); }}
        onCancel={() => setConfirmDlg(null)}
      />
      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar('')} duration={2500}>{snackbar}</Snackbar>
    </View>
  );
}

// ─── Estilos POSScreen ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: COLOR.bg },

  // Sin turno
  noShift:        { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACE.s8, gap: SPACE.s4 },
  noShiftTitle:   { fontSize: FONT_SIZE.h1, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  noShiftSub:     { fontSize: FONT_SIZE.label, color: COLOR.inkMute, textAlign: 'center' },
  noShiftStore:   { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },

  // Header
  header:         { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: SPACE.s2, padding: SPACE.s3, backgroundColor: COLOR.brand, borderBottomWidth: 1, borderBottomColor: COLOR.brandDark },
  headerBrand:    { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.extrabold as any, color: COLOR.ink, letterSpacing: -0.5 },
  headerShift:    { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.ink2, marginTop: 2 },

  // Local chips
  localChips:     { flexDirection: 'row', gap: SPACE.s2 },
  localChip:      { paddingHorizontal: SPACE.s3, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: 'rgba(255,255,255,0.5)', borderWidth: 1, borderColor: COLOR.brandDark },
  localChipActive:{ backgroundColor: COLOR.ink, borderColor: COLOR.ink },
  localChipText:  { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink2 },
  localChipTextActive: { color: COLOR.brand, fontWeight: FONT_WEIGHT.bold as any },

  // KPIs bar del turno
  kpiBar:         { flexDirection: 'row', backgroundColor: COLOR.ink, paddingHorizontal: SPACE.s4, paddingVertical: SPACE.s2 },
  kpiItem:        { flex: 1, alignItems: 'center' },
  // P-15: antes 10 px en inkDisabled sobre ink (contraste insuficiente)
  kpiLabel:       { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.inkOnDark, marginBottom: 2 },
  kpiValue:       { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.brand },
  kpiDivider:     { width: 1, backgroundColor: COLOR.ink2, marginVertical: 2 },

  // Tabs POS
  tabBar:         { flexDirection: 'row', backgroundColor: COLOR.surface, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  posTab:         { flex: 1, paddingVertical: 11, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: COLOR.transparent },
  posTabActive:   { borderBottomColor: COLOR.brand },
  posTabText:     { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.inkMute },
  posTabTextActive: { color: COLOR.ink, fontWeight: FONT_WEIGHT.bold as any },

  // Tab Ventas del turno
  salesEmpty:     { alignItems: 'center', paddingVertical: 48, gap: SPACE.s2 },
  salesEmptyText: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  salesEmptySub:  { fontSize: FONT_SIZE.label, color: COLOR.inkMute },
  salesSummary:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLOR.brandTint, borderRadius: RADIUS.r3, padding: SPACE.s4, borderWidth: 1, borderColor: COLOR.brandTint2 },
  salesSummaryText: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink2 },
  salesSummaryTotal: { fontSize: FONT_SIZE.h2, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  saleCard:       { backgroundColor: COLOR.surface, borderRadius: RADIUS.r3, borderWidth: 1, borderColor: COLOR.border, padding: SPACE.s3, gap: SPACE.s2, ...SHADOW.sm },
  saleCardHead:   { flexDirection: 'row', alignItems: 'center', gap: SPACE.s2 },
  saleCardTime:   { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink, flex: 1 },
  saleCardTotal:  { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  cancelBtn:      { backgroundColor: COLOR.expenseTint, borderRadius: RADIUS.r1, paddingHorizontal: SPACE.s2, paddingVertical: 5, borderWidth: 1, borderColor: COLOR.expenseBorder },
  cancelBtnText:  { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.expense },
  saleCardItems:  { gap: 2, paddingLeft: SPACE.s1 },
  saleCardItem:   { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.medium as any, color: COLOR.ink2 },
  saleCardFooter: { borderTopWidth: 1, borderTopColor: COLOR.border, paddingTop: SPACE.s1 },
  saleCardFooterText: { fontSize: FONT_SIZE.caption, color: COLOR.inkMute, fontWeight: FONT_WEIGHT.semibold as any },

  // Chips categoría
  chipsBar:       { backgroundColor: COLOR.surface, borderBottomWidth: 1, borderBottomColor: COLOR.border, paddingVertical: SPACE.s2 },
  catChip:        { paddingHorizontal: SPACE.s3, paddingVertical: 5, borderRadius: RADIUS.r2, backgroundColor: COLOR.surface, borderWidth: 1, borderColor: COLOR.border },
  catChipActive:  { backgroundColor: COLOR.brand, borderColor: COLOR.brandDark },
  catChipText:    { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.ink2 },
  catChipTextActive: { color: COLOR.ink, fontWeight: FONT_WEIGHT.bold as any },

  // Buscador
  searchWrap:     { backgroundColor: COLOR.surface, padding: SPACE.s2, borderBottomWidth: 1, borderBottomColor: COLOR.border, gap: SPACE.s2 },
  searchBox:      { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.bg, borderRadius: RADIUS.r2, paddingHorizontal: SPACE.s3, height: 40 },
  searchInput:    { flex: 1, fontSize: FONT_SIZE.label, color: COLOR.ink, outlineStyle: 'none' } as any,
  catalogMeta:    { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  catalogCount:   { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.inkMute },

  // Layout
  main:           { flex: 1 },
  mainDesktop:    { flexDirection: 'row' },

  // Grilla de productos
  grid:           { flexDirection: 'row', flexWrap: 'wrap', padding: SPACE.s2, gap: SPACE.s2 },
  empty:          { width: '100%', textAlign: 'center', color: COLOR.inkMute, marginTop: 40 },

  // Product card
  productCard:         { flex: 1, minWidth: 150, maxWidth: 220, backgroundColor: COLOR.surface, borderRadius: RADIUS.r3, borderWidth: 1, borderColor: COLOR.border, padding: SPACE.s2, gap: SPACE.s2, ...SHADOW.sm },
  productCardSelected: { borderColor: COLOR.brand, borderWidth: 2, backgroundColor: COLOR.brandTint },
  productCardInCart:   { borderColor: COLOR.income, borderWidth: 1.5, backgroundColor: COLOR.incomeTint },
  productCardDisabled: { opacity: 0.45, backgroundColor: COLOR.bgAlt },
  inCartBadge:         { backgroundColor: COLOR.income, borderRadius: RADIUS.r1, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  inCartBadgeText:     { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.white },
  outOfStockBadge:     { backgroundColor: COLOR.expense, borderRadius: RADIUS.r1, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  outOfStockBadgeText: { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.white },
  pcBottomInactive:    { height: 30, justifyContent: 'center' },
  pcTapHint:           { fontSize: FONT_SIZE.caption, color: COLOR.inkDisabled, fontWeight: FONT_WEIGHT.semibold as any },
  pcTop:          { flexDirection: 'row', gap: SPACE.s2 },
  pcName:         { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink, lineHeight: 16 },
  pcCode:         { fontSize: FONT_SIZE.caption, color: COLOR.inkMute, fontWeight: FONT_WEIGHT.semibold as any, marginTop: 2 },
  pcPrice:        { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  pcStock:        { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.semibold as any },
  // flexWrap: con los botones de 40 px (P-16) "Agregar" baja de línea en tarjetas angostas.
  pcBottom:       { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.s2 },

  // Qty control (en card) — P-16: 40×40 para pantallas táctiles (antes 26×28)
  qtyControl:     { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLOR.border2, borderRadius: RADIUS.r1, overflow: 'hidden', height: 40 },
  qtyBtn:         { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', backgroundColor: COLOR.surface },
  qtyBtnDisabled: { opacity: 0.35 },
  qtyBtnText:     { fontSize: 18, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink, lineHeight: 20 },
  qtyNum:         { width: 30, textAlign: 'center', fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  qtyMax:         { color: COLOR.warn, marginTop: SPACE.s1 },

  // Agregar button — tint + borde, no relleno sólido: "Confirmar venta" es la
  // única acción de la pantalla que debe llevar el dorado sólido (regla 60-30-10).
  addBtn:         { flex: 1, minWidth: 72, height: 40, backgroundColor: COLOR.brandTint, borderWidth: 1, borderColor: COLOR.brand, borderRadius: RADIUS.r2, justifyContent: 'center', alignItems: 'center' },
  addBtnText:     { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.brandDeep },

  // Ticket
  ticketDesktop:  { width: 340, backgroundColor: COLOR.surface, borderLeftWidth: 1, borderLeftColor: COLOR.border },
  ticketMobile:   { backgroundColor: COLOR.surface, borderTopWidth: 1, borderTopColor: COLOR.border },

  // Modal cierre
  sumRow:         { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  sumCell:        { fontSize: FONT_SIZE.caption, color: COLOR.ink, fontWeight: FONT_WEIGHT.medium as any },
  sumHeader:      { fontWeight: FONT_WEIGHT.bold as any, color: COLOR.inkMute, fontSize: FONT_SIZE.caption },
  sumDivider:     { height: 1, backgroundColor: COLOR.border, marginVertical: SPACE.s2 },
  sumTotalRow:    { flexDirection: 'row', justifyContent: 'space-between' },
  sumLabel:       { fontSize: FONT_SIZE.label, color: COLOR.inkMute, fontWeight: FONT_WEIGHT.semibold as any },
  sumValue:       { fontSize: FONT_SIZE.label, color: COLOR.inkMute, fontWeight: FONT_WEIGHT.semibold as any },
  closingWarn:    { fontSize: FONT_SIZE.caption, color: COLOR.warn, fontWeight: FONT_WEIGHT.semibold as any, textAlign: 'center', marginVertical: SPACE.s2 },
  closingError:   { fontSize: FONT_SIZE.label, color: COLOR.expense, fontWeight: FONT_WEIGHT.semibold as any, textAlign: 'center', backgroundColor: COLOR.expenseTint, borderRadius: RADIUS.r2, padding: SPACE.s2 },

  // Modales genéricos
  overlay:        { flex: 1, backgroundColor: COLOR.overlay, justifyContent: 'center', alignItems: 'center' },
  modal:          { backgroundColor: COLOR.surface, borderRadius: RADIUS.r4, padding: SPACE.s5, width: '92%', maxWidth: 460 },
  modalTitle:     { fontSize: FONT_SIZE.h1, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink, marginBottom: SPACE.s1 },
  modalSub:       { fontSize: FONT_SIZE.label, color: COLOR.ink2, fontWeight: FONT_WEIGHT.medium as any, marginBottom: SPACE.s1 },
  modalActions:   { flexDirection: 'row', gap: SPACE.s2, marginTop: SPACE.s4 },
});
