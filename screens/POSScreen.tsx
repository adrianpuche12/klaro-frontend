import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput as RNTextInput, ActivityIndicator, Modal,
  useWindowDimensions, Platform,
} from 'react-native';
import { Button, Snackbar } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import ConfirmDialog from '../components/ConfirmDialog';
import { COLOR, SPACE, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOW, CONTROL } from '../theme';
import axios from 'axios';
import { REACT_APP_API_URL } from '../config';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { formatHnl } from '../utils/format';

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
interface CartItem { productId: number; productName: string; price: number; qty: number; subtotal: number; }
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
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const { selectedStore, stores, setSelectedStore } = useStore();
  const { userName } = useAuth();
  const storeId = selectedStore?.id ?? null;
  const API     = REACT_APP_API_URL;

  // ── Estado base ───────────────────────────────────────────────────────────

  const [shift, setShift]             = useState<Shift | null>(null);
  const [loadingShift, setLoadingShift] = useState(true);
  const [categories, setCategories]   = useState<Category[]>([]);
  const [stock, setStock]             = useState<StockItem[]>([]);
  const [loading, setLoading]         = useState(false);
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [search, setSearch]           = useState('');

  // KPIs del turno (ventas confirmadas + total acumulado)
  const [kpiCount, setKpiCount]       = useState(0);
  const [kpiTotal, setKpiTotal]       = useState(0);

  // Selección y cantidad pendiente (no se agrega al carrito hasta click en Agregar)
  const [selectedId, setSelectedId]   = useState<number | null>(null);
  const [pendingQty, setPendingQty]   = useState(1);

  // Carrito: array fijo — solo se puede eliminar, no editar qty
  const [cart, setCart]               = useState<CartItem[]>([]);
  const [snackbar, setSnackbar]       = useState('');
  const [submitting, setSubmitting]   = useState(false);

  // Tab del POS
  const [posTab, setPosTab]               = useState<'nueva' | 'ventas'>('nueva');
  const [shiftSales, setShiftSales]       = useState<SaleRecord[]>([]);
  const [loadingSales, setLoadingSales]   = useState(false);
  const [cancellingId, setCancellingId]   = useState<number | null>(null);
  const [confirmDlg, setConfirmDlg]       = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const askConfirm = (title: string, message: string, onConfirm: () => void) =>
    setConfirmDlg({ title, message, onConfirm });

  // Modales
  const [openShiftModal, setOpenShiftModal] = useState(false);
  const [closingModal, setClosingModal]     = useState(false);
  const [summary, setSummary]               = useState<DailySummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [closingDone, setClosingDone]       = useState(false);

  // ── Cargar turno y catálogo ───────────────────────────────────────────────

  const loadShift = useCallback(async () => {
    if (!storeId) return;
    setLoadingShift(true);
    try {
      const res = await axios.get<Shift>(`${API}/api/v2/shifts/active/${storeId}`);
      setShift(res.data ?? null);
    } catch { setShift(null); }
    finally { setLoadingShift(false); }
  }, [storeId]);

  const loadCatalog = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const [catRes, stockRes] = await Promise.all([
        axios.get<Category[]>(`${API}/api/v2/stores/${storeId}/categories`),
        axios.get<StockItem[]>(`${API}/api/v2/stores/${storeId}/stock`),
      ]);
      setCategories(catRes.data);
      setStock(stockRes.data.filter(s => s.productActive));
    } catch { setSnackbar('Error al cargar catálogo'); }
    finally { setLoading(false); }
  }, [storeId]);

  useEffect(() => { loadShift(); }, [loadShift]);
  useEffect(() => { loadCatalog(); setCart([]); setSelectedId(null); setPendingQty(1); }, [loadCatalog]);

  const loadShiftSales = useCallback(async () => {
    if (!shift) return;
    setLoadingSales(true);
    try {
      const res = await axios.get<SaleRecord[]>(`${API}/api/v2/shifts/${shift.id}/sales`);
      setShiftSales(res.data);
      // Actualiza KPIs con datos reales del servidor
      setKpiCount(res.data.length);
      setKpiTotal(res.data.reduce((s, v) => s + v.total, 0));
    } catch { /* silencioso */ }
    finally { setLoadingSales(false); }
  }, [shift]);

  // Carga KPIs al activarse el turno
  useEffect(() => {
    if (shift) loadShiftSales();
    else { setKpiCount(0); setKpiTotal(0); }
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
          const cancelled = shiftSales.find(s => s.id === saleId);
          await axios.delete(`${API}/api/v2/sales/${saleId}`);
          setShiftSales(prev => prev.filter(s => s.id !== saleId));
          if (cancelled) {
            setKpiCount(prev => Math.max(0, prev - 1));
            setKpiTotal(prev => Math.max(0, prev - cancelled.total));
          }
          loadCatalog();
        } catch (e: any) { setSnackbar(e.response?.data?.error || 'Error al anular'); }
        finally { setCancellingId(null); }
      }
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
    setCart(prev => [...prev, { productId: item.productId, productName: item.productName, price: item.price, qty: pendingQty, subtotal: item.price * pendingQty }]);
    setSelectedId(null);
    setPendingQty(1);
  };

  const removeFromCart = (productId: number) =>
    setCart(prev => prev.filter(c => c.productId !== productId));

  const clearCart = () => { setCart([]); setSelectedId(null); setPendingQty(1); };

  // ── Abrir turno ───────────────────────────────────────────────────────────

  const handleOpenShift = async () => {
    if (!storeId) return;
    try {
      const res = await axios.post<Shift>(`${API}/api/v2/stores/${storeId}/shifts`, { username: userName ?? 'empleada' });
      setShift(res.data);
      setOpenShiftModal(false);
      setSnackbar(`Turno ${res.data.code} abierto`);
    } catch (e: any) { setSnackbar(e.response?.data?.error || 'Error al abrir turno'); }
  };

  // ── Confirmar venta ───────────────────────────────────────────────────────

  const handleSubmitSale = async () => {
    if (!shift || cart.length === 0) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/v2/shifts/${shift.id}/sales`, {
        username: userName ?? 'empleada',
        items: cart.map(i => ({ productId: i.productId, quantity: i.qty })),
      });
      // Actualiza KPIs localmente (optimista, sin esperar al servidor)
      const saleTotal = cartTotal;
      setKpiCount(prev => prev + 1);
      setKpiTotal(prev => prev + saleTotal);
      clearCart();
      loadCatalog();
      if (posTab === 'ventas') loadShiftSales();
    } catch (e: any) { setSnackbar(e.response?.data?.error || 'Error al registrar venta'); }
    finally { setSubmitting(false); }
  };

  // ── Cierre de turno ───────────────────────────────────────────────────────

  const openClosing = async () => {
    if (!shift) return;
    setLoadingSummary(true);
    setClosingModal(true);
    setClosingDone(false);
    try {
      const res = await axios.get<DailySummary>(`${API}/api/v2/shifts/${shift.id}/summary`);
      setSummary(res.data);
    } catch { setSnackbar('Error al cargar resumen'); setClosingModal(false); }
    finally { setLoadingSummary(false); }
  };

  const handleConfirmClosing = async () => {
    if (!shift) return;
    try {
      await axios.post(`${API}/api/v2/shifts/${shift.id}/closing`, { username: userName ?? 'empleada' });
      setClosingDone(true);
      setShift(null);
      clearCart();
    } catch (e: any) { setSnackbar(e.response?.data?.error || 'Error al confirmar cierre'); }
  };

  // ── Stock color ───────────────────────────────────────────────────────────

  const stockColor = (item: StockItem) =>
    item.quantity === 0 ? COLOR.expense : item.lowStock ? COLOR.warn : COLOR.income;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (loadingShift) return <ActivityIndicator size="large" color={COLOR.brand} style={{ flex: 1, marginTop: 60 }} />;

  // ── Sin turno activo ──────────────────────────────────────────────────────

  if (!shift) return (
    <View style={styles.noShift}>
      <MaterialCommunityIcons name="clock-outline" size={52} color={COLOR.inkDisabled} />
      <Text style={styles.noShiftTitle}>Sin turno activo</Text>
      <Text style={styles.noShiftSub}>Abrí un turno para comenzar a registrar ventas</Text>

      {/* Selector de local — solo para admin */}
      {!hideStoreSelector && (
        <View style={styles.localChips}>
          {stores.map(s => (
            <TouchableOpacity key={s.id} style={[styles.localChip, selectedStore?.id === s.id && styles.localChipActive]} onPress={() => setSelectedStore(s)}>
              <Text style={[styles.localChipText, selectedStore?.id === s.id && styles.localChipTextActive]}>{s.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Button mode="contained" onPress={() => setOpenShiftModal(true)} buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} style={{ borderRadius: RADIUS.r2 }} labelStyle={{ fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.black as any }}>
        Abrir turno
      </Button>

      <Modal visible={openShiftModal} transparent animationType="fade" onRequestClose={() => setOpenShiftModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Abrir turno</Text>
            <Text style={styles.modalSub}>Local: <Text style={{ fontWeight: '900' }}>{selectedStore?.name ?? '—'}</Text></Text>
            <Text style={styles.modalSub}>Empleada: <Text style={{ fontWeight: '900' }}>{userName ?? '—'}</Text></Text>
            <View style={styles.modalActions}>
              <Button mode="outlined" onPress={() => setOpenShiftModal(false)} style={{ flex: 1 }}>Cancelar</Button>
              <Button mode="contained" onPress={handleOpenShift} buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} style={{ flex: 1 }}>Confirmar</Button>
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
          <Text style={styles.headerBrand}>{shift.store?.name ?? 'Klaro'}</Text>
          <Text style={styles.headerShift} numberOfLines={1}>● {shift.code} · {shift.username}</Text>
        </View>

        {/* Selector de local — oculto para empleados (hideStoreSelector=true) */}
        {!hideStoreSelector && (
          <View style={styles.localChips}>
            {stores.map(s => (
              <TouchableOpacity key={s.id} style={[styles.localChip, selectedStore?.id === s.id && styles.localChipActive]} onPress={() => setSelectedStore(s)}>
                <Text style={[styles.localChipText, selectedStore?.id === s.id && styles.localChipTextActive]}>{s.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

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
          <Text style={styles.kpiValue}>{formatHnl(kpiTotal)}</Text>
        </View>
        <View style={styles.kpiDivider} />
        <View style={styles.kpiItem}>
          <Text style={styles.kpiLabel}>Turno</Text>
          <Text style={styles.kpiValue} numberOfLines={1}>{shift?.code ?? '—'}</Text>
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
                        <Text style={styles.pcPrice}>{formatHnl(item.price)}</Text>
                      </View>

                      {/* Fila 2: stock */}
                      <Text style={[styles.pcStock, { color: stockColor(item) }]}>
                        Stock: {item.quantity}
                      </Text>

                      {/* Fila 3: qty controls + Agregar (solo cuando está seleccionado) */}
                      {isSelected ? (
                        <View style={styles.pcBottom}>
                          <View style={styles.qtyControl}>
                            <TouchableOpacity style={styles.qtyBtn} onPress={() => setPendingQty(q => Math.max(1, q - 1))}>
                              <Text style={styles.qtyBtnText}>−</Text>
                            </TouchableOpacity>
                            <Text style={styles.qtyNum}>{pendingQty}</Text>
                            <TouchableOpacity style={styles.qtyBtn} onPress={() => setPendingQty(q => q + 1)}>
                              <Text style={styles.qtyBtnText}>+</Text>
                            </TouchableOpacity>
                          </View>
                          <TouchableOpacity style={styles.addBtn} onPress={addToCart}>
                            <Text style={styles.addBtnText}>Agregar</Text>
                          </TouchableOpacity>
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
          ? <View style={styles.ticketDesktop}><Ticket cart={cart} subtotal={cartSubtotal} isv={cartISV} total={cartTotal} itemCount={cartItemCount} onRemove={removeFromCart} onClear={clearCart} onSubmit={handleSubmitSale} submitting={submitting} full /></View>
          : <View style={styles.ticketMobile}><Ticket cart={cart} subtotal={cartSubtotal} isv={cartISV} total={cartTotal} itemCount={cartItemCount} onRemove={removeFromCart} onClear={clearCart} onSubmit={handleSubmitSale} submitting={submitting} full={false} /></View>
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
                  <MaterialCommunityIcons name="receipt-text-outline" size={40} color={COLOR.inkDisabled} />
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
                      {formatHnl(shiftSales.reduce((s, v) => s + v.total, 0))}
                    </Text>
                  </View>

                  {/* Lista de ventas (más reciente primero) */}
                  {[...shiftSales].reverse().map(sale => (
                    <View key={sale.id} style={styles.saleCard}>
                      {/* Header de la venta */}
                      <View style={styles.saleCardHead}>
                        <Text style={styles.saleCardTime}>
                          {new Date(sale.createdAt).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                        <Text style={styles.saleCardTotal}>{formatHnl(sale.total)}</Text>
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
                            · {item.productName} × {item.quantity}  <Text style={{ color: COLOR.ink2 }}>{formatHnl(item.subtotal)}</Text>
                          </Text>
                        ))}
                      </View>

                      <View style={styles.saleCardFooter}>
                        <Text style={styles.saleCardFooterText}>Total: {formatHnl(sale.total)}</Text>
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
      <Modal visible={closingModal} transparent animationType="slide" onRequestClose={() => !closingDone && setClosingModal(false)}>
        <View style={styles.overlay}>
          <View style={[styles.modal, { maxWidth: 520, maxHeight: '92%' }]}>
            {closingDone ? (
              <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                <MaterialCommunityIcons name="check-circle-outline" size={52} color={COLOR.income} />
                <Text style={[styles.modalTitle, { textAlign: 'center', marginTop: 12 }]}>Turno cerrado</Text>
                <Text style={{ color: COLOR.ink2, textAlign: 'center', marginTop: 8 }}>El cierre fue registrado en el sistema financiero.</Text>
                <Button mode="contained" buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} style={{ marginTop: 20, borderRadius: RADIUS.r2 }} onPress={() => setClosingModal(false)}>Aceptar</Button>
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
                      <Text style={[styles.sumCell, { width: 88, textAlign: 'right' }]}>{formatHnl(p.subtotal)}</Text>
                    </View>
                  ))}
                </ScrollView>

                <View style={styles.sumDivider} />
                <View style={{ gap: 4 }}>
                  <View style={styles.sumTotalRow}><Text style={styles.sumLabel}>Subtotal</Text><Text style={styles.sumValue}>{formatHnl(summary.totalSubtotal)}</Text></View>
                  <View style={[styles.sumTotalRow, { borderTopWidth: 2, borderTopColor: COLOR.ink, marginTop: 6, paddingTop: 6 }]}>
                    <Text style={{ fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.black as any, color: COLOR.ink }}>Total del día</Text>
                    <Text style={{ fontSize: FONT_SIZE.h2, fontWeight: FONT_WEIGHT.black as any, color: COLOR.ink }}>{formatHnl(summary.totalAmount)}</Text>
                  </View>
                  <Text style={{ fontSize: FONT_SIZE.caption, color: COLOR.ink2, marginTop: 4 }}>{summary.totalSales} venta{summary.totalSales !== 1 ? 's' : ''} registrada{summary.totalSales !== 1 ? 's' : ''}</Text>
                </View>

                <Text style={styles.closingWarn}>Esta acción no se puede deshacer</Text>

                <View style={styles.modalActions}>
                  <Button mode="outlined" onPress={() => setClosingModal(false)} style={{ flex: 1 }}>Cancelar</Button>
                  <Button mode="contained" buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} style={{ flex: 1 }} onPress={handleConfirmClosing}>Confirmar cierre</Button>
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
        confirmLabel="Sí, anular"
        confirmColor={COLOR.expense}
        onConfirm={() => confirmDlg?.onConfirm()}
        onCancel={() => setConfirmDlg(null)}
      />
      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar('')} duration={2500}>{snackbar}</Snackbar>
    </View>
  );
}

// ─── Ticket (componente interno) ──────────────────────────────────────────────

function Ticket({ cart, subtotal, isv, total, itemCount, onRemove, onClear, onSubmit, submitting, full }: {
  cart: CartItem[];
  subtotal: number; isv: number; total: number; itemCount: number;
  onRemove: (id: number) => void;
  onClear: () => void;
  onSubmit: () => void;
  submitting: boolean;
  full: boolean;
}) {
  return (
    <View style={tkStyles.root}>
      <View style={tkStyles.head}>
        <Text style={tkStyles.title}>Venta actual</Text>
        {itemCount > 0 && <View style={tkStyles.badge}><Text style={tkStyles.badgeText}>{itemCount} artículos</Text></View>}
      </View>

      {full && (
        cart.length === 0
          ? <View style={tkStyles.empty}><Text style={tkStyles.emptyText}>La venta actual está vacía.</Text></View>
          : <ScrollView style={{ flex: 1 }}>
              {cart.map(item => (
                <View key={item.productId} style={tkStyles.item}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={tkStyles.itemName} numberOfLines={1}>{item.productName}</Text>
                    <Text style={tkStyles.itemCode}>{item.qty} × {formatHnl(item.price)}</Text>
                  </View>
                  <Text style={tkStyles.itemSub}>{formatHnl(item.subtotal)}</Text>
                  <TouchableOpacity onPress={() => onRemove(item.productId)} style={tkStyles.deleteBtn} accessibilityRole="button" accessibilityLabel="Quitar del carrito">
                    <MaterialCommunityIcons name="trash-can-outline" size={18} color={COLOR.expense} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
      )}

      {/* Totales */}
      <View style={tkStyles.totals}>
        <View style={tkStyles.totalLine}><Text style={tkStyles.totalLabel}>Subtotal</Text><Text style={tkStyles.totalValue}>{formatHnl(subtotal)}</Text></View>
        <View style={[tkStyles.totalLine, tkStyles.totalFinal]}>
          <Text style={tkStyles.totalLabelFinal}>TOTAL</Text>
          <Text style={tkStyles.totalAmount}>{formatHnl(total)}</Text>
        </View>
      </View>

      {/* Acciones */}
      <View style={tkStyles.actions}>
        <Button mode="contained" onPress={onSubmit} loading={submitting} disabled={cart.length === 0 || submitting}
          buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} style={{ borderRadius: RADIUS.r2 }} labelStyle={{ fontWeight: FONT_WEIGHT.black as any }}>
          Confirmar venta
        </Button>
        {cart.length > 0 && (
          <Button mode="outlined" onPress={onClear} style={{ borderRadius: RADIUS.r2, marginTop: 6 }} textColor={COLOR.ink2}>
            Cancelar venta
          </Button>
        )}
      </View>

      {full && cart.length > 0 && (
        <View style={tkStyles.audit}>
          <Text style={tkStyles.auditText}>El sistema calcula precios, impuestos y totales automáticamente. Al confirmar se descuenta el stock.</Text>
        </View>
      )}
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
  kpiLabel:       { fontSize: FONT_SIZE.caption - 1, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.inkDisabled, marginBottom: 2 },
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
  pcBottom:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.s2 },

  // Qty control (en card)
  qtyControl:     { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLOR.border2, borderRadius: RADIUS.r1, overflow: 'hidden', height: 28 },
  qtyBtn:         { width: 26, height: 28, justifyContent: 'center', alignItems: 'center', backgroundColor: COLOR.surface },
  qtyBtnText:     { fontSize: 16, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink, lineHeight: 18 },
  qtyNum:         { width: 30, textAlign: 'center', fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },

  // Agregar button
  addBtn:         { flex: 1, height: 30, backgroundColor: COLOR.brand, borderRadius: RADIUS.r2, justifyContent: 'center', alignItems: 'center' },
  addBtnText:     { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },

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

  // Modales genéricos
  overlay:        { flex: 1, backgroundColor: COLOR.overlay, justifyContent: 'center', alignItems: 'center' },
  modal:          { backgroundColor: COLOR.surface, borderRadius: RADIUS.r4, padding: SPACE.s5, width: '92%', maxWidth: 460 },
  modalTitle:     { fontSize: FONT_SIZE.h1, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink, marginBottom: SPACE.s1 },
  modalSub:       { fontSize: FONT_SIZE.label, color: COLOR.ink2, fontWeight: FONT_WEIGHT.medium as any, marginBottom: SPACE.s1 },
  modalActions:   { flexDirection: 'row', gap: SPACE.s2, marginTop: SPACE.s4 },
});

// ─── Estilos Ticket ───────────────────────────────────────────────────────────

const tkStyles = StyleSheet.create({
  root:           { flex: 1, padding: SPACE.s3, flexDirection: 'column' },
  head:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.s2 },
  title:          { fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  badge:          { backgroundColor: COLOR.brandTint, borderRadius: RADIUS.r2, paddingHorizontal: SPACE.s2, paddingVertical: SPACE.s1 },
  badgeText:      { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.brandDeep },
  empty:          { padding: SPACE.s4, borderRadius: RADIUS.r3, backgroundColor: COLOR.bg, alignItems: 'center' },
  emptyText:      { color: COLOR.inkMute, fontWeight: FONT_WEIGHT.medium as any, fontSize: FONT_SIZE.label },

  item:           { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLOR.border, gap: SPACE.s2, minHeight: 46 },
  itemName:       { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  itemCode:       { fontSize: FONT_SIZE.caption, color: COLOR.inkMute, fontWeight: FONT_WEIGHT.medium as any },
  itemSub:        { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink, width: 70, textAlign: 'right' },
  deleteBtn:      { marginLeft: SPACE.s2, padding: SPACE.s1 },

  totals:         { paddingTop: SPACE.s2, gap: SPACE.s1, borderTopWidth: 1, borderTopColor: COLOR.border, marginTop: SPACE.s2 },
  totalLine:      { flexDirection: 'row', justifyContent: 'space-between' },
  totalFinal:     { borderTopWidth: 1, borderTopColor: COLOR.border, paddingTop: SPACE.s2, marginTop: SPACE.s1 },
  totalLabel:     { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.medium as any, color: COLOR.inkMute },
  totalValue:     { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.medium as any, color: COLOR.inkMute },
  totalLabelFinal:{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  totalAmount:    { fontSize: FONT_SIZE.amountHero - 10, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink, letterSpacing: -1 },

  actions:        { marginTop: SPACE.s2 },
  audit:          { marginTop: SPACE.s2, backgroundColor: COLOR.brandTint, borderWidth: 1, borderColor: COLOR.brandTint2, borderRadius: RADIUS.r3, padding: SPACE.s2 },
  auditText:      { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.medium as any, color: COLOR.ink2 },
});
