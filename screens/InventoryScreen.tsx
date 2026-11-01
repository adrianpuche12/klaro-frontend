import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput as RNTextInput, ActivityIndicator, Modal,
  useWindowDimensions, Pressable,
} from 'react-native';
import { Button, TextInput, Snackbar, IconButton, HelperText } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import axios from 'axios';
import { REACT_APP_API_URL } from '../config';
import { useStore } from '../context/StoreContext';
import ConfirmDialog from '../components/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { COLOR, SPACE, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOW, CONTROL } from '../theme';
import { stockColor } from '../utils/stockStatus';
import { useMoney } from '../context/TenantConfigContext';
import { APP_LOCALE, formatTime, tzOptions } from '../utils/format';
import { parseQty, parseCount, parseMoney } from '../utils/parseInput';
import { descendantIds, findCat, countProductsDeep } from '../utils/categories';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Store       { id: number; name: string; active: boolean }
interface Category    { id: number; name: string; description?: string | null; active: boolean; parentId: number | null; children: Category[]; productCount: number }
interface StockItem   { stockId: number; productId: number; productName: string; productSku: string; productType: string; productActive: boolean; price: number; quantity: number; minStock: number; lowStock: boolean; categoryName: string; categoryPath: string; categoryId: number | null; storeId: number; updatedAt: string }
interface Movement    { id: number; type: string; quantity: number; reason: string | null; notes: string | null; username: string | null; performedBy?: string | null; source?: string | null; productId: number; productName: string; storeId: number; createdAt: string }
interface Summary     { totalProducts: number; activeProducts: number; lowStockCount: number; categoryCount: number; estimatedValue: number }
interface ProductForm { name: string; sku: string; type: string; price: string; minStock: string; description: string; categoryId: string }

const EMPTY_PRODUCT: ProductForm = { name: '', sku: '', type: 'SIMPLE', price: '', minStock: '0', description: '', categoryId: '' };

// Aplana el árbol de categorías en lista plana con path completo
const flattenCategories = (cats: Category[], prefix = ''): { id: number; label: string; depth: number }[] => {
  const result: { id: number; label: string; depth: number }[] = [];
  for (const cat of cats) {
    const label = prefix ? `${prefix} > ${cat.name}` : cat.name;
    result.push({ id: cat.id, label, depth: prefix.split('>').length - 1 });
    if (cat.children?.length) result.push(...flattenCategories(cat.children, label));
  }
  return result;
};

// ─── Árbol de categorías — rediseñado ────────────────────────────────────────

// Filtra el árbol preservando estructura
const filterTree = (cats: Category[], q: string): Category[] => {
  if (!q) return cats;
  const ql = q.toLowerCase();
  return cats.map(c => {
    const matchesSelf = c.name.toLowerCase().includes(ql);
    const filteredChildren = filterTree(c.children, ql);
    if (matchesSelf || filteredChildren.length > 0) return { ...c, children: filteredChildren };
    return null;
  }).filter((c): c is Category => c !== null);
};

const CategoryTree = ({ categories, selected, onSelect, onNew, onEdit, onDelete, onNewChild, onToggle, isAdmin = true }: {
  categories: Category[];
  selected: number | null;
  onSelect: (id: number | null) => void;
  onNew: () => void;
  onEdit: (cat: Category) => void;
  onDelete: (cat: Category) => void;
  onNewChild: (parentId: number) => void;
  onToggle: (cat: Category) => void;
  isAdmin?: boolean;
}) => {
  const [open, setOpen]             = useState<Set<number>>(new Set());
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [catFilter, setCatFilter]   = useState('');

  const toggleOpen = (id: number) => setOpen(prev => {
    const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s;
  });
  const collapseAll = () => setOpen(new Set());
  const expandAll = () => {
    const all = new Set<number>();
    const walk = (cats: Category[]) => cats.forEach(c => { all.add(c.id); walk(c.children); });
    walk(categories);
    setOpen(all);
  };

  // Auto-expandir padres de los matches al filtrar
  useEffect(() => {
    if (!catFilter) return;
    const q = catFilter.toLowerCase();
    const matchedAncestors = new Set<number>();
    const walk = (cats: Category[], ancestors: number[]) => {
      for (const c of cats) {
        if (c.name.toLowerCase().includes(q)) ancestors.forEach(a => matchedAncestors.add(a));
        walk(c.children, [...ancestors, c.id]);
      }
    };
    walk(categories, []);
    setOpen(prev => new Set([...prev, ...matchedAncestors]));
  }, [catFilter, categories]);

  const totalCount = categories.reduce((s, c) => s + countProductsDeep(c), 0);
  const visibleCats = filterTree(categories, catFilter);

  const renderNode = (cat: Category, depth = 0): React.ReactElement => {
    const isSelected   = selected === cat.id;
    const isHovered    = hoveredRow === cat.id;
    const showActions  = isAdmin && (isHovered || isSelected);
    const isInactive   = !cat.active;

    return (
      <View key={cat.id}>
        <Pressable
          onHoverIn={() => setHoveredRow(cat.id)}
          onHoverOut={() => setHoveredRow(null)}
          onPress={() => onSelect(isSelected ? null : cat.id)}
          style={[styles.catRow, isSelected && styles.catRowSelected]}
        >
          {/* Chevron expandir */}
          {cat.children.length > 0 ? (
            <TouchableOpacity onPress={() => toggleOpen(cat.id)} hitSlop={8}>
              <MaterialCommunityIcons
                name={open.has(cat.id) ? 'chevron-down' : 'chevron-right'}
                size={14}
                color={COLOR.inkMute}
              />
            </TouchableOpacity>
          ) : <View style={{ width: 14 }} />}

          {/* Icono folder/tag */}
          <MaterialCommunityIcons
            name={cat.children.length > 0 ? 'folder-outline' : 'tag-outline'}
            size={14}
            color={isSelected ? COLOR.brandDeep : COLOR.inkMute}
            style={{ marginRight: 4 }}
          />

          {/* Nombre */}
          <Text
            style={[
              styles.catName,
              isSelected && styles.catNameSelected,
              isInactive && styles.catNameInactive,
            ]}
            numberOfLines={1}
          >
            {cat.name}
          </Text>

          {/* Contador */}
          <View style={[styles.catCount, isSelected && styles.catCountSelected]}>
            <Text style={[styles.catCountText, isSelected && styles.catCountTextSelected]}>
              {/* I-13: suma las subcategorías (antes una categoría padre con productos solo en sus hijas mostraba 0) */}
              {countProductsDeep(cat)}
            </Text>
          </View>

          {/* Acciones — solo visibles al hover/selección */}
          {showActions && (
            <View style={styles.catActions}>
              {cat.children.length === 0 && (
                <IconButton icon="plus" size={18} iconColor={COLOR.income} onPress={() => onNewChild(cat.id)} style={{ margin: 0 }} accessibilityLabel="Nueva subcategoría" />
              )}
              <IconButton icon="pencil" size={18} iconColor={COLOR.ink2} onPress={() => onEdit(cat)} style={{ margin: 0 }} accessibilityLabel="Editar" />
              <IconButton
                icon={cat.active ? 'toggle-switch' : 'toggle-switch-off'}
                size={18}
                iconColor={cat.active ? COLOR.income : COLOR.inkDisabled}
                onPress={() => onToggle(cat)}
                style={{ margin: 0 }}
                accessibilityLabel={cat.active ? 'Desactivar' : 'Activar'}
              />
              <IconButton icon="trash-can" size={18} iconColor={COLOR.expense} onPress={() => onDelete(cat)} style={{ margin: 0 }} accessibilityLabel="Eliminar" />
            </View>
          )}
        </Pressable>

        {/* Hijos con guía visual de indentación */}
        {open.has(cat.id) && cat.children.length > 0 && (
          <View style={styles.catChildren}>
            {cat.children.map(c => renderNode(c, depth + 1))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>

      {/* Header: título + badge + acciones globales */}
      <View style={styles.catpanelHead}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.catpanelTitle}>Categorías</Text>
          <View style={styles.catpanelBadge}>
            <Text style={styles.catpanelBadgeText}>{flattenCategories(categories).length}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 0 }}>
          <IconButton icon="chevron-up"   size={18} iconColor={COLOR.inkMute} onPress={collapseAll} style={{ margin: 0 }} accessibilityLabel="Contraer todas" />
          <IconButton icon="chevron-down" size={18} iconColor={COLOR.inkMute} onPress={expandAll}   style={{ margin: 0 }} accessibilityLabel="Expandir todas" />
        </View>
      </View>

      {/* Buscador inline */}
      <View style={styles.catpanelSearch}>
        <RNTextInput
          value={catFilter}
          onChangeText={setCatFilter}
          placeholder="Filtrar categorías…"
          placeholderTextColor={COLOR.inkDisabled}
          style={styles.catSearchInput}
        />
      </View>

      {/* Botón nueva categoría — dashed outline */}
      {isAdmin && (
        <TouchableOpacity style={styles.newCatBtn} onPress={onNew}>
          <MaterialCommunityIcons name="plus" size={14} color={COLOR.inkMute} />
          <Text style={styles.newCatBtnText}>Nueva categoría</Text>
        </TouchableOpacity>
      )}

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Fila "Todas" */}
        <TouchableOpacity
          style={[styles.catRow, styles.catRowTodas, selected === null && styles.catRowTodasSelected]}
          onPress={() => onSelect(null)}
        >
          <View style={{ width: 14 }} />
          <MaterialCommunityIcons name="layers-outline" size={14} color={selected === null ? COLOR.brandDeep : COLOR.inkMute} style={{ marginRight: 4 }} />
          <Text style={[styles.catName, styles.catNameTodas, selected === null && styles.catNameSelected]}>Todas</Text>
          <View style={[styles.catCount, selected === null && styles.catCountSelected]}>
            <Text style={[styles.catCountText, selected === null && styles.catCountTextSelected]}>{totalCount}</Text>
          </View>
        </TouchableOpacity>

        {visibleCats.map(c => renderNode(c))}
      </ScrollView>
    </View>
  );
};

// ─── KPI Card ────────────────────────────────────────────────────────────────

const KpiCard = ({ icon, title, value, sub, warn }: { icon: string; title: string; value: string; sub?: string; warn?: boolean }) => (
  <View style={[styles.kpi, warn && styles.kpiWarn]}>
    <MaterialCommunityIcons name={icon} size={26} color={warn ? COLOR.warn : COLOR.ink2} />
    <View>
      <Text style={styles.kpiTitle}>{title}</Text>
      <Text style={[styles.kpiValue, warn && { color: COLOR.warn }]}>{value}</Text>
      {sub ? <Text style={styles.kpiSub}>{sub}</Text> : null}
    </View>
  </View>
);

// ─── Screen principal ─────────────────────────────────────────────────────────

const InventoryScreen = () => {
  const money = useMoney();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const { roles, canManageUsers, permissions, userName } = useAuth();
  // I-01 (Revisión 04), adaptado al modelo SPRINT-14 (root / staff + canManageUsers +
  // permissions, ver config/navConfig.ts):
  //  - root puede todo, siempre (no depende de que AuthContext le haya puesto canManageUsers).
  //  - staff con canManageUsers: gestiona según los módulos de su Role. CATALOG habilita
  //    crear/editar/activar/borrar productos y categorías; INVENTORY habilita las salidas
  //    de stock. permissions === null es el caso legacy (acceso total), igual que navConfig.
  //  - staff sin canManageUsers (cajero): solo ve el stock y registra entradas ("Agregar").
  // Si las entradas del cajero deberían requerir un permiso propio es una decisión de
  // producto pendiente (ver BUGS.md "Para decidir"); no se cambia acá.
  const isRoot = roles.includes('root');
  const hasModule = (m: string) => permissions === null || permissions.includes(m);
  const isManager      = isRoot || canManageUsers;                       // selector de local, vista de gestión
  const canEditCatalog = isRoot || (canManageUsers && hasModule('CATALOG'));
  const canAdjustOut   = isRoot || (canManageUsers && hasModule('INVENTORY'));

  const { stores, selectedStore, setSelectedStore } = useStore();
  const storeId = selectedStore?.id ?? null;
  const [categories, setCategories]       = useState<Category[]>([]);
  const [stock, setStock]                 = useState<StockItem[]>([]);
  const [summary, setSummary]             = useState<Summary | null>(null);
  const [loading, setLoading]             = useState(false);
  const [search, setSearch]               = useState('');
  const [selectedCat, setSelectedCat]     = useState<number | null>(null);
  // I-11: en celular el panel de categorías arranca cerrado (tapaba la lista).
  const [showCatPanel, setShowCatPanel]   = useState(width >= 900);
  const [topExpanded, setTopExpanded]     = useState(true);
  const [snackbar, setSnackbar]           = useState('');
  const [activeView, setActiveView]       = useState<'stock' | 'movements'>('stock');
  const [movements, setMovements]         = useState<Movement[]>([]);
  const [loadingMov, setLoadingMov]       = useState(false);

  // ConfirmDialog
  const [confirmDlg, setConfirmDlg] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const askConfirm = (title: string, message: string, onConfirm: () => void) =>
    setConfirmDlg({ title, message, onConfirm });

  // Modales
  const [adjustItem, setAdjustItem]       = useState<StockItem | null>(null);
  const [adjustType, setAdjustType]       = useState<'ENTRADA' | 'SALIDA'>('ENTRADA');
  const [adjustQty, setAdjustQty]         = useState('');
  const [adjustReason, setAdjustReason]   = useState('');
  const [adjustSaving, setAdjustSaving]   = useState(false);

  const [productModal, setProductModal]     = useState(false);
  const [editProduct, setEditProduct]       = useState<StockItem | null>(null);
  const [productForm, setProductForm]       = useState<ProductForm>(EMPTY_PRODUCT);
  const [productSaving, setProductSaving]   = useState(false);
  const [catPickerOpen, setCatPickerOpen]   = useState(false);
  const [catPickerLabel, setCatPickerLabel] = useState('');
  // I-18: el listado de stock no trae la descripción y el PUT del backend la reemplaza
  // siempre (ausente o '' → la pisa). Al editar se trae el producto completo; mientras no
  // se haya podido leer y el usuario no la haya escrito, no se deja guardar.
  const [descStatus, setDescStatus]         = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [descTouched, setDescTouched]       = useState(false);
  const descTouchedRef                      = useRef(false);
  const editingProductId                    = useRef<number | null>(null);
  const markDescTouched = (v: boolean) => { descTouchedRef.current = v; setDescTouched(v); };

  // Categorías modal
  const [catModal, setCatModal]           = useState(false);
  const [editCat, setEditCat]             = useState<Category | null>(null);
  const [catParentId, setCatParentId]     = useState<number | null>(null);
  const [catName, setCatName]             = useState('');
  const [catDesc, setCatDesc]             = useState('');
  const [catSaving, setCatSaving]         = useState(false);

  const API = REACT_APP_API_URL;

  // ── Carga datos ──────────────────────────────────────────────────────────────

  // El local viene del StoreContext global (selector en el Sidebar)

  const loadAll = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const [stockRes, summaryRes, catRes] = await Promise.all([
        axios.get<StockItem[]>(`${API}/api/v2/stores/${storeId}/stock`),
        axios.get<Summary>(`${API}/api/v2/stores/${storeId}/stock/summary`),
        axios.get<Category[]>(`${API}/api/v2/stores/${storeId}/categories`),
      ]);
      setStock(stockRes.data);
      setSummary(summaryRes.data);
      setCategories(catRes.data);
    } catch { setSnackbar('Error al cargar inventario'); }
    finally { setLoading(false); }
  }, [storeId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // I-09: el local de la última consulta de movimientos; una respuesta tardía de otro
  // local se descarta (si no, se veían los movimientos del local anterior con el nombre del nuevo).
  const movStoreRef = useRef<number | null>(null);
  const loadMovements = useCallback(async () => {
    movStoreRef.current = storeId;
    if (!storeId) { setMovements([]); return; }
    setLoadingMov(true);
    try {
      const res = await axios.get<Movement[]>(`${API}/api/v2/stores/${storeId}/stock/movements`);
      if (movStoreRef.current !== storeId) return;
      setMovements(res.data);
    } catch {
      if (movStoreRef.current !== storeId) return;
      setSnackbar('Error al cargar movimientos');
    }
    finally { if (movStoreRef.current === storeId) setLoadingMov(false); }
  }, [storeId]);

  const handleViewChange = (view: 'stock' | 'movements') => {
    setActiveView(view);
    if (view === 'movements') loadMovements();
  };

  // I-09: si se está en Historial y se cambia de local, recargar los movimientos.
  useEffect(() => {
    if (activeView === 'movements') loadMovements();
    else setMovements([]);
  }, [storeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // I-10: las categorías son por local; al cambiar de local se limpia el filtro y la búsqueda.
  useEffect(() => { setSelectedCat(null); setSearch(''); }, [storeId]);

  // ── Filtrado ─────────────────────────────────────────────────────────────────

  // I-06: el filtro por categoría compara ids (antes nombres del categoryPath, y dos
  // categorías "Frías" en padres distintos se mezclaban). Se calcula una vez por render.
  const selectedCatNode = selectedCat !== null ? findCat(categories, selectedCat) : null;
  const selectedCatIds  = selectedCatNode ? new Set(descendantIds(selectedCatNode)) : null;

  const filtered = stock.filter(item => {
    // Filtro por búsqueda
    if (search) {
      const q = search.toLowerCase();
      if (!item.productName.toLowerCase().includes(q) &&
          !(item.productSku || '').toLowerCase().includes(q)) return false;
    }

    // Filtro por categoría seleccionada
    if (selectedCat !== null) {
      // Sin categoría, o una categoría que ya no existe en este local → no se muestra.
      if (!selectedCatIds || item.categoryId == null) return false;
      if (!selectedCatIds.has(item.categoryId)) return false;
    }

    return true;
  });

  // Mensaje de error: el del backend si viene; si no, distinguir corte de red de error del servidor (I-15).
  const errorMsg = (e: any, fallback: string) =>
    e?.response?.data?.error ?? e?.response?.data?.message ?? (e?.response ? fallback : 'Sin conexión con el servidor');

  // ── Ajuste de stock ──────────────────────────────────────────────────────────

  // I-07: abrir siempre con el modal limpio (antes quedaba la cantidad del producto anterior).
  const openAdjust = (item: StockItem) => {
    setAdjustType('ENTRADA'); setAdjustQty(''); setAdjustReason(''); setAdjustItem(item);
  };
  const closeAdjust = () => { if (!adjustSaving) setAdjustItem(null); };

  const handleAdjust = async () => {
    if (!adjustItem || !storeId || adjustSaving) return;
    // I-04: entero > 0 ("1,5", "abc", "2.5" ya no pasan como NaN).
    const qty = parseQty(adjustQty);
    if (qty === null) { setSnackbar('Ingresá una cantidad entera mayor a 0'); return; }
    // Defensa en profundidad: la UI solo ofrece Salida a quien puede, pero se revalida acá.
    if (adjustType === 'SALIDA' && !canAdjustOut) { setSnackbar('No tenés permiso para descontar stock'); return; }
    if (adjustType === 'SALIDA' && qty > adjustItem.quantity) {
      setSnackbar(`No podés descontar más de ${adjustItem.quantity} (stock actual)`); return;
    }
    setAdjustSaving(true);
    try {
      await axios.post(`${API}/api/v2/stores/${storeId}/stock/adjustment`, {
        productId: adjustItem.productId, type: adjustType,
        // I-03: el usuario real de la sesión (antes 'admin' fijo). Si no hay userName se
        // manda null y el backend usa el usuario del token.
        quantity: qty, reason: adjustReason.trim() || null, username: userName ?? null,
      });
      setSnackbar(`Stock ${adjustType === 'ENTRADA' ? 'agregado' : 'descontado'} correctamente`);
      setAdjustItem(null); setAdjustQty(''); setAdjustReason('');
      loadAll();
    } catch (e: any) {
      setSnackbar(errorMsg(e, 'Error al ajustar stock'));
    } finally { setAdjustSaving(false); }
  };

  // ── CRUD Producto ─────────────────────────────────────────────────────────────

  const openCreateProduct = () => {
    editingProductId.current = null;
    setEditProduct(null);
    setProductForm(EMPTY_PRODUCT);
    setCatPickerLabel('');
    setDescStatus('ok'); markDescTouched(false);
    setProductModal(true);
  };

  // I-18: GET /api/v2/products/{id} devuelve la descripción (ProductResponseDTO).
  const loadProductDescription = async (productId: number) => {
    setDescStatus('loading');
    try {
      const { data } = await axios.get(`${API}/api/v2/products/${productId}`);
      if (editingProductId.current !== productId) return; // se cerró o se abrió otro producto
      // Si el usuario ya escribió algo mientras cargaba, no se pisa lo que escribió.
      if (!descTouchedRef.current) setProductForm(f => ({ ...f, description: data?.description ?? '' }));
      setDescStatus('ok');
    } catch {
      if (editingProductId.current !== productId) return;
      setDescStatus('error');
    }
  };

  const openEditProduct = (item: StockItem) => {
    editingProductId.current = item.productId;
    setEditProduct(item);
    setProductForm({ name: item.productName, sku: item.productSku || '', type: item.productType, price: String(item.price ?? ''), minStock: String(item.minStock ?? 0), description: '', categoryId: item.categoryId ? String(item.categoryId) : '' });
    setCatPickerLabel(item.categoryPath || '');
    markDescTouched(false);
    setProductModal(true);
    loadProductDescription(item.productId);
  };

  const closeProductModal = () => {
    if (productSaving) return;
    editingProductId.current = null;
    setProductModal(false);
  };

  const handleSaveProduct = async () => {
    if (productSaving) return;
    if (!canEditCatalog) { setSnackbar('No tenés permiso para modificar productos'); return; }
    // I-20: sin local elegido se mandaba POST /stores/null/products.
    if (!editProduct && !storeId) { setSnackbar('Seleccioná un local primero'); return; }
    // I-05: precio con coma o con símbolo, negativo o "abc"; stock mínimo entero >= 0.
    const name     = productForm.name.trim();
    const price    = parseMoney(productForm.price);
    const minStock = productForm.minStock.trim() === '' ? 0 : parseCount(productForm.minStock);
    if (!name) { setSnackbar('El nombre es obligatorio'); return; }
    if (price === null) { setSnackbar('Precio inválido. Ejemplo: 120.50'); return; }
    if (minStock === null) { setSnackbar('El stock mínimo debe ser un número entero'); return; }
    // I-18: el PUT reemplaza la descripción siempre; si no se pudo leer la actual y el
    // usuario no la escribió, guardar la borraría.
    if (editProduct && !descTouched && descStatus !== 'ok') {
      setSnackbar(descStatus === 'loading'
        ? 'Esperá a que termine de cargar el producto'
        : 'No se pudo leer la descripción actual. Reintentá antes de guardar');
      return;
    }
    setProductSaving(true);
    try {
      const body = { name, sku: productForm.sku.trim(), type: productForm.type, price, minStock, description: productForm.description, categoryId: productForm.categoryId ? Number(productForm.categoryId) : null };
      if (editProduct) {
        await axios.put(`${API}/api/v2/products/${editProduct.productId}`, body);
        setSnackbar('Producto actualizado');
      } else {
        await axios.post(`${API}/api/v2/stores/${storeId}/products`, body);
        setSnackbar('Producto creado');
      }
      editingProductId.current = null;
      setProductModal(false); loadAll();
    } catch (e: any) { setSnackbar(errorMsg(e, 'No se pudo guardar el producto')); }
    finally { setProductSaving(false); }
  };

  // I-02: el diálogo se cierra antes de ejecutar (ver onConfirm del ConfirmDialog), así que
  // los handlers ya no lo cierran en el finally.
  const handleToggleProduct = (item: StockItem) => {
    askConfirm(
      item.productActive ? 'Desactivar producto' : 'Activar producto',
      `¿${item.productActive ? 'Desactivar' : 'Activar'} "${item.productName}"?`,
      async () => {
        try { await axios.put(`${API}/api/v2/products/${item.productId}/toggle`); loadAll(); }
        catch (e: any) { setSnackbar(errorMsg(e, 'No se pudo cambiar el estado del producto')); }
      }
    );
  };

  const handleDeleteProduct = (item: StockItem) => {
    askConfirm(
      'Eliminar producto',
      `¿Eliminar "${item.productName}"? Esta acción no se puede deshacer.`,
      async () => {
        try { await axios.delete(`${API}/api/v2/products/${item.productId}`); setSnackbar('Producto eliminado'); loadAll(); }
        catch (e: any) { setSnackbar(errorMsg(e, 'No se pudo eliminar el producto')); }
      }
    );
  };

  // ── CRUD Categorías ──────────────────────────────────────────────────────────

  const openNewCat = (parentId: number | null = null) => {
    setEditCat(null); setCatParentId(parentId); setCatName(''); setCatDesc(''); setCatModal(true);
  };

  // I-19: el árbol de GET /stores/{id}/categories ya trae la descripción
  // (CategoryResponseDTO); antes se abría con '' y el PUT la borraba.
  const openEditCat = (cat: Category) => {
    setEditCat(cat); setCatParentId(cat.parentId); setCatName(cat.name); setCatDesc(cat.description ?? ''); setCatModal(true);
  };

  const handleSaveCat = async () => {
    if (catSaving) return;
    if (!canEditCatalog) { setSnackbar('No tenés permiso para modificar categorías'); return; }
    if (!catName.trim()) { setSnackbar('El nombre es obligatorio'); return; }
    if (!storeId) { setSnackbar('Seleccioná un local primero'); return; }
    setCatSaving(true);
    try {
      const body = { name: catName.trim(), description: catDesc };
      if (editCat) {
        await axios.put(`${API}/api/v2/categories/${editCat.id}`, body);
      } else if (catParentId) {
        await axios.post(`${API}/api/v2/stores/${storeId}/categories/${catParentId}/children`, body);
      } else {
        await axios.post(`${API}/api/v2/stores/${storeId}/categories`, body);
      }
      setCatModal(false); loadAll();
    } catch (err: any) {
      setSnackbar(errorMsg(err, 'No se pudo guardar la categoría'));
    }
    finally { setCatSaving(false); }
  };

  const handleDeleteCat = (cat: Category) => {
    askConfirm(
      'Eliminar categoría',
      `¿Eliminar "${cat.name}"? Se eliminará junto con sus subcategorías.`,
      async () => {
        try {
          await axios.delete(`${API}/api/v2/categories/${cat.id}`); setSnackbar('Categoría eliminada');
          if (selectedCat !== null && descendantIds(cat).includes(selectedCat)) setSelectedCat(null);
          loadAll();
        }
        catch (e: any) { setSnackbar(errorMsg(e, 'No se pudo eliminar la categoría')); }
      }
    );
  };

  const handleToggleCat = async (cat: Category) => {
    try { await axios.put(`${API}/api/v2/categories/${cat.id}/toggle`); loadAll(); }
    catch (e: any) { setSnackbar(errorMsg(e, 'No se pudo cambiar el estado de la categoría')); }
  };

  // ── Movimientos ──────────────────────────────────────────────────────────────

  const movTypeColor = (type: string) => {
    switch (type) {
      case 'ENTRADA': return COLOR.income;
      case 'SALIDA':  return COLOR.expense;
      case 'AJUSTE':  return COLOR.info;
      case 'VENTA':   return COLOR.movementSale;
      default:        return COLOR.ink2;
    }
  };

  const movTypeLabel = (type: string) => {
    switch (type) {
      case 'ENTRADA': return '↑ Entrada';
      case 'SALIDA':  return '↓ Salida';
      case 'AJUSTE':  return '⟳ Ajuste';
      case 'VENTA':   return '$ Venta';
      default:        return type;
    }
  };

  // I-08: en el backend (InventoryService.adjust) solo SALIDA descuenta; ENTRADA y AJUSTE
  // suman y `quantity` se guarda siempre positiva (@Min(1)). Se usa el signo de quantity
  // si algún día viniera negativa, y si no, el del tipo.
  const movSign = (m: Movement): 1 | -1 =>
    m.quantity < 0 ? -1 : m.type === 'SALIDA' || m.type === 'VENTA' ? -1 : 1;
  // Las ventas llegan como SALIDA con source = 'SALE' (SalesService.deductStock).
  const movKind = (m: Movement) => (m.source === 'SALE' ? 'VENTA' : m.type);
  const movWho  = (m: Movement) => m.username || m.performedBy || '';

  const renderMovementRow = (m: Movement) => (
    <View key={m.id} style={styles.movRow}>
      <View style={[styles.movTypeBadge, { backgroundColor: movTypeColor(movKind(m)) + '18' }]}>
        <Text style={[styles.movTypeText, { color: movTypeColor(movKind(m)) }]}>{movTypeLabel(movKind(m))}</Text>
      </View>
      <View style={styles.movInfo}>
        <Text style={styles.movProduct} numberOfLines={1}>{m.productName}</Text>
        {/* I-03: quién hizo el movimiento (username; performedBy como respaldo) + motivo */}
        {movWho(m) || m.reason ? (
          <Text style={styles.movReason} numberOfLines={1}>
            {[movWho(m), m.reason].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.movQty, { color: movSign(m) > 0 ? COLOR.income : COLOR.expense }]}>
        {movSign(m) > 0 ? '+' : '-'}{Math.abs(m.quantity)}
      </Text>
      <Text style={styles.movDate}>
        {new Date(m.createdAt).toLocaleDateString(APP_LOCALE, { day: '2-digit', month: '2-digit', ...tzOptions() })}{'\n'}
        {formatTime(m.createdAt)}
      </Text>
    </View>
  );

  // ── Render fila de producto ──────────────────────────────────────────────────

  const renderRow = (item: StockItem) => (
    <View key={item.stockId} style={[styles.row, !item.productActive && styles.rowInactive]}>

      {/* Info del producto */}
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={1}>{item.productName}</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 2 }}>
          {item.productSku ? <Text style={styles.rowSku}>{item.productSku}</Text> : null}
          {item.categoryPath ? <Text style={styles.rowCat} numberOfLines={1}>· {item.categoryPath}</Text> : null}
        </View>
      </View>

      {/* Precio */}
      <Text style={styles.rowPrice}>{money(item.price)}</Text>

      {/* Stock badge */}
      <View style={[styles.stockBadge, { backgroundColor: stockColor(item) + '18' }]}>
        <Text style={[styles.stockNum, { color: stockColor(item) }]}>{item.quantity}</Text>
        <Text style={[styles.stockMin, { color: stockColor(item) }]}>/ {item.minStock}</Text>
      </View>

      {/* Acciones */}
      <View style={styles.rowActions}>
        {/* Botón agregar/ajustar stock — siempre visible */}
        <TouchableOpacity
          style={styles.adjustBtn}
          onPress={() => openAdjust(item)}
          accessibilityLabel={`${canAdjustOut ? 'Ajustar' : 'Agregar'} stock de ${item.productName}`}
        >
          <Text style={styles.adjustBtnText}>{canAdjustOut ? 'Ajustar' : 'Agregar'}</Text>
        </TouchableOpacity>

        {/* Acciones de catálogo (root, o staff con canManageUsers + CATALOG): editar, toggle, eliminar */}
        {canEditCatalog && <IconButton icon="pencil" size={18} iconColor={COLOR.ink2} onPress={() => openEditProduct(item)} style={styles.actionIcon} accessibilityLabel="Editar producto" />}
        {canEditCatalog && (
          <IconButton
            icon={item.productActive ? 'toggle-switch' : 'toggle-switch-off'}
            size={18}
            iconColor={item.productActive ? COLOR.income : COLOR.inkDisabled}
            onPress={() => handleToggleProduct(item)}
            style={styles.actionIcon}
            accessibilityLabel={item.productActive ? 'Desactivar producto' : 'Activar producto'}
          />
        )}
        {canEditCatalog && <IconButton icon="trash-can" size={18} iconColor={COLOR.expense} onPress={() => handleDeleteProduct(item)} style={styles.actionIcon} accessibilityLabel="Eliminar producto" />}
      </View>
    </View>
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Inventario</Text>
          {/* Selector de local — root o staff con canManageUsers (el cajero ya tiene su local asignado) */}
          {isManager ? (
            <View style={styles.storeSelector}>
              {stores.map(s => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.storeChip, selectedStore?.id === s.id && styles.storeChipActive]}
                  onPress={() => setSelectedStore(s)}
                >
                  <Text style={[styles.storeChipText, selectedStore?.id === s.id && styles.storeChipTextActive]}>
                    {s.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text style={{ fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink2 }}>
              {selectedStore?.name}
            </Text>
          )}
        </View>
        <View style={styles.headerRight}>
          {/* Tabs Stock / Historial */}
          <View style={styles.viewTabs}>
            <TouchableOpacity
              style={[styles.viewTab, activeView === 'stock' && styles.viewTabActive]}
              onPress={() => handleViewChange('stock')}
            >
              <Text style={[styles.viewTabText, activeView === 'stock' && styles.viewTabTextActive]}>Stock</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewTab, activeView === 'movements' && styles.viewTabActive]}
              onPress={() => handleViewChange('movements')}
            >
              <Text style={[styles.viewTabText, activeView === 'movements' && styles.viewTabTextActive]}>Historial</Text>
            </TouchableOpacity>
          </View>

          {activeView === 'stock' && (
            <>
              <Button mode="outlined" onPress={() => setTopExpanded(v => !v)}
                textColor={COLOR.ink2} style={{ borderColor: COLOR.border, borderRadius: RADIUS.r2 }}
                labelStyle={{ fontSize: FONT_SIZE.caption }}>
                {topExpanded ? 'Cerrar' : 'Resumen'}
              </Button>
              {canEditCatalog && (
                <Button mode="contained" onPress={openCreateProduct} buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} style={{ borderRadius: RADIUS.r2 }}>
                  + Nuevo producto
                </Button>
              )}
            </>
          )}
        </View>
      </View>

      {/* ── Sección colapsable: alerta + KPIs (solo en vista stock) ── */}
      {activeView === 'stock' && topExpanded && (
        <>
          {summary && summary.lowStockCount > 0 && (
            <View style={styles.alertBanner}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color={COLOR.warn} />
          <Text style={styles.alertText}>{summary.lowStockCount} producto{summary.lowStockCount > 1 ? 's' : ''} con stock bajo — revisá el inventario</Text>
            </View>
          )}
          {summary && (
            <View style={styles.kpis}>
              <KpiCard icon="package-variant" title="Productos activos" value={String(summary.activeProducts)} sub={`de ${summary.totalProducts} totales`} />
              <KpiCard icon="alert-circle-outline" title="Stock bajo" value={String(summary.lowStockCount)} warn={summary.lowStockCount > 0} />
              <KpiCard icon="folder-outline" title="Categorías" value={String(summary.categoryCount)} />
              <KpiCard icon="cash-multiple" title="Valor estimado" value={money(summary.estimatedValue)} />
            </View>
          )}
        </>
      )}

      {/* ── Buscador (solo en vista stock) ── */}
      {activeView === 'stock' && (
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <MaterialCommunityIcons name="magnify" size={18} color={COLOR.inkMute} style={{ marginRight: SPACE.s1 }} />
            <RNTextInput
              placeholder="Buscar producto por nombre o SKU..."
              placeholderTextColor={COLOR.inkDisabled}
              value={search}
              onChangeText={setSearch}
              style={styles.searchInput}
            />
          </View>
          {/* I-11: categoría activa visible junto al buscador, con × para quitarla */}
          {selectedCatNode && (
            <View style={styles.catChip}>
              <Text style={styles.catChipText} numberOfLines={1}>{selectedCatNode.name}</Text>
              <TouchableOpacity onPress={() => setSelectedCat(null)} hitSlop={8} accessibilityLabel="Quitar filtro de categoría">
                <MaterialCommunityIcons name="close" size={14} color={COLOR.brandDeep} />
              </TouchableOpacity>
            </View>
          )}
          {!isDesktop && (
            <IconButton icon="filter-variant" size={22} iconColor={COLOR.ink} onPress={() => setShowCatPanel(v => !v)} accessibilityLabel={showCatPanel ? 'Ocultar categorías' : 'Mostrar categorías'} />
          )}
        </View>
      )}

      {/* ── Layout principal ── */}
      {activeView === 'stock' ? (
        <View style={[styles.main, isDesktop && styles.mainDesktop]}>

          {/* Sidebar categorías */}
          {(isDesktop || showCatPanel) && (
            <View style={[styles.catPanel, !isDesktop && styles.catPanelMobile, isDesktop && width < 1100 && { width: 300 }]}>
              {loading ? <ActivityIndicator color={COLOR.brand} style={{ marginTop: 20 }} /> : (
                <CategoryTree
                  categories={categories}
                  selected={selectedCat}
                  onSelect={(id) => { setSelectedCat(id); if (!isDesktop) setShowCatPanel(false); }}
                  onNew={() => openNewCat(null)}
                  onEdit={openEditCat}
                  onDelete={handleDeleteCat}
                  onNewChild={(parentId) => openNewCat(parentId)}
                  onToggle={handleToggleCat}
                  isAdmin={canEditCatalog}
                />
              )}
            </View>
          )}

          {/* Lista de productos */}
          <View style={{ flex: 1 }}>
            {loading ? (
              <ActivityIndicator size="large" color={COLOR.brand} style={{ marginTop: 40 }} />
            ) : filtered.length === 0 ? (
              <Text style={styles.empty}>No hay productos para mostrar.</Text>
            ) : (
              <ScrollView>
                {/* Header tabla (solo desktop) */}
                {isDesktop && (
                  <View style={[styles.row, styles.rowHeader]}>
                    <View style={styles.rowInfo}>
                      <Text style={styles.colHeader}>Producto</Text>
                    </View>
                    <View style={{ width: 80, alignItems: 'flex-end' }}>
                      <Text style={styles.colHeader}>Precio</Text>
                    </View>
                    <View style={{ width: 90, alignItems: 'center' }}>
                      <Text style={styles.colHeader}>Stock / Mín</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 180 }}>
                      <Text style={styles.colHeader}>Acciones</Text>
                    </View>
                  </View>
                )}
                {filtered.map(renderRow)}
              </ScrollView>
            )}
          </View>
        </View>
      ) : (
        /* ── Vista Historial de Movimientos ── */
        <View style={{ flex: 1 }}>
          {loadingMov ? (
            <ActivityIndicator size="large" color={COLOR.brand} style={{ marginTop: 40 }} />
          ) : movements.length === 0 ? (
            <Text style={styles.empty}>No hay movimientos registrados aún.</Text>
          ) : (
            <ScrollView>
              {/* Header tabla (solo desktop) */}
              {isDesktop && (
                <View style={[styles.movRow, styles.rowHeader]}>
                  <View style={{ width: 90 }}><Text style={styles.colHeader}>Tipo</Text></View>
                  <View style={{ flex: 1 }}><Text style={styles.colHeader}>Producto</Text></View>
                  <View style={{ width: 60, alignItems: 'flex-end' }}><Text style={styles.colHeader}>Cant.</Text></View>
                  <View style={{ width: 72, alignItems: 'center' }}><Text style={styles.colHeader}>Fecha</Text></View>
                </View>
              )}
              {movements.map(renderMovementRow)}
            </ScrollView>
          )}
        </View>
      )}

      {/* ── Modal ajuste de stock ── */}
      <Modal visible={!!adjustItem} transparent animationType="fade" onRequestClose={closeAdjust}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>
              {adjustType === 'ENTRADA' ? 'Agregar stock' : 'Descontar stock'}
            </Text>
            <Text style={styles.modalSub}>{adjustItem?.productName}</Text>
            <Text style={styles.modalStock}>Stock actual: <Text style={{ fontWeight: '900' }}>{adjustItem?.quantity}</Text></Text>

            {/* Selector de tipo — SALIDA solo para root o staff con canManageUsers + INVENTORY */}
            <View style={styles.typeRow}>
              {(canAdjustOut ?(['ENTRADA', 'SALIDA'] as const) : (['ENTRADA'] as const)).map(t => (
                <Button key={t} mode="contained" onPress={() => setAdjustType(t)}
                  buttonColor={adjustType === t ? (t === 'ENTRADA' ? COLOR.income : COLOR.expense) : COLOR.bg}
                  textColor={adjustType === t ? COLOR.white : COLOR.ink2} style={{ flex: 1, borderRadius: RADIUS.r2 }}>
                  {t === 'ENTRADA' ? 'Entrada' : 'Salida'}
                </Button>
              ))}
            </View>

            <TextInput label="Cantidad *" value={adjustQty} onChangeText={setAdjustQty} keyboardType="number-pad" mode="outlined" style={styles.input} />
            {adjustType === 'SALIDA' && (
              <HelperText type="info" visible style={styles.helperTight}>Máximo {adjustItem?.quantity ?? 0}</HelperText>
            )}
            <TextInput label="Motivo" value={adjustReason} onChangeText={setAdjustReason} mode="outlined" style={styles.input} />

            <View style={styles.modalActions}>
              <Button mode="outlined" onPress={closeAdjust} disabled={adjustSaving} style={{ flex: 1 }}>Cancelar</Button>
              <Button mode="contained" onPress={handleAdjust} loading={adjustSaving} disabled={adjustSaving}
                buttonColor={adjustType === 'ENTRADA' ? COLOR.income : COLOR.expense} style={{ flex: 1 }}>
                Confirmar
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal producto ── */}
      <Modal visible={productModal} transparent animationType="fade" onRequestClose={closeProductModal}>
        <View style={styles.overlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}>
            <View style={[styles.modal, { width: '100%', maxWidth: 480 }]}>
              <Text style={styles.modalTitle}>{editProduct ? 'Editar Producto' : 'Nuevo Producto'}</Text>

              <TextInput label="Nombre *" value={productForm.name} onChangeText={v => setProductForm({ ...productForm, name: v })} mode="outlined" style={styles.input} />
              <TextInput label="SKU (código)" value={productForm.sku} onChangeText={v => setProductForm({ ...productForm, sku: v })} mode="outlined" style={styles.input} />
              <TextInput label="Precio *" value={productForm.price} onChangeText={v => setProductForm({ ...productForm, price: v })} keyboardType="decimal-pad" mode="outlined" style={styles.input} />
              <TextInput label="Stock mínimo (alerta)" value={productForm.minStock} onChangeText={v => setProductForm({ ...productForm, minStock: v })} keyboardType="number-pad" mode="outlined" style={styles.input} />

              {/* Tipo */}
              <Text style={styles.fieldLabel}>Tipo</Text>
              <View style={styles.typeRow}>
                {['SIMPLE', 'FABRICATED'].map(t => (
                  <Button key={t} mode="contained" onPress={() => setProductForm({ ...productForm, type: t })}
                    buttonColor={productForm.type === t ? COLOR.brand : COLOR.bg}
                    textColor={productForm.type === t ? COLOR.inkOnBrand : COLOR.ink2} style={{ flex: 1, borderRadius: RADIUS.r2 }}>
                    {t === 'SIMPLE' ? 'Simple' : 'Fabricado'}
                  </Button>
                ))}
              </View>

              {/* Selector de categoría */}
              <Text style={styles.fieldLabel}>Categoría</Text>
              <TouchableOpacity
                style={styles.catPickerBtn}
                onPress={() => setCatPickerOpen(true)}
              >
                <Text style={catPickerLabel ? styles.catPickerValue : styles.catPickerPlaceholder} numberOfLines={1}>
                  {catPickerLabel || 'Seleccionar categoría...'}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={18} color={COLOR.ink2} />
              </TouchableOpacity>

              <TextInput
                label={editProduct && descStatus === 'loading' && !descTouched ? 'Descripción (cargando…)' : 'Descripción'}
                value={productForm.description}
                onChangeText={v => { markDescTouched(true); setProductForm(f => ({ ...f, description: v })); }}
                mode="outlined" style={styles.input} multiline numberOfLines={2}
              />
              {editProduct && descStatus === 'error' && !descTouched && (
                <View style={styles.descError}>
                  <HelperText type="error" visible style={{ flex: 1 }}>No se pudo leer la descripción actual.</HelperText>
                  <Button compact mode="text" onPress={() => loadProductDescription(editProduct.productId)}>Reintentar</Button>
                </View>
              )}

              <View style={styles.modalActions}>
                <Button mode="outlined" onPress={closeProductModal} disabled={productSaving} style={{ flex: 1 }}>Cancelar</Button>
                <Button mode="contained" onPress={handleSaveProduct} loading={productSaving} disabled={productSaving} buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} style={{ flex: 1 }}>Guardar</Button>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Picker de categoría (dentro del modal producto) ── */}
      <Modal visible={catPickerOpen} transparent animationType="fade" onRequestClose={() => setCatPickerOpen(false)}>
        <View style={styles.overlay}>
          <View style={[styles.modal, { maxHeight: '80%' }]}>
            <Text style={styles.modalTitle}>Seleccionar categoría</Text>
            <ScrollView style={{ marginVertical: 8 }}>
              {/* Opción sin categoría */}
              <TouchableOpacity
                style={[styles.catPickerItem, !productForm.categoryId && styles.catPickerItemActive]}
                onPress={() => { setProductForm({ ...productForm, categoryId: '' }); setCatPickerLabel(''); setCatPickerOpen(false); }}
              >
                <Text style={styles.catPickerItemText}>Sin categoría</Text>
              </TouchableOpacity>
              {/* Lista de categorías aplanada */}
              {flattenCategories(categories).map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.catPickerItem, productForm.categoryId === String(cat.id) && styles.catPickerItemActive, { paddingLeft: 16 + cat.depth * 16 }]}
                  onPress={() => { setProductForm({ ...productForm, categoryId: String(cat.id) }); setCatPickerLabel(cat.label); setCatPickerOpen(false); }}
                >
                  <Text style={styles.catPickerItemText} numberOfLines={1}>{cat.label}</Text>
                  {productForm.categoryId === String(cat.id) && <MaterialCommunityIcons name="check" size={16} color={COLOR.brand} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Button mode="outlined" onPress={() => setCatPickerOpen(false)} style={{ marginTop: 8 }}>Cancelar</Button>
          </View>
        </View>
      </Modal>

      {/* ── Modal categoría ── */}
      <Modal visible={catModal} transparent animationType="fade" onRequestClose={() => setCatModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>
              {editCat ? 'Editar categoría' : catParentId ? 'Nueva subcategoría' : 'Nueva categoría'}
            </Text>
            {catParentId && !editCat && (
              <Text style={styles.modalSub}>Subcategoría de: {findCat(categories, catParentId)?.name}</Text>
            )}
            <TextInput label="Nombre *" value={catName} onChangeText={setCatName} mode="outlined" style={styles.input} />
            <TextInput label="Descripción" value={catDesc} onChangeText={setCatDesc} mode="outlined" style={styles.input} />
            <View style={styles.modalActions}>
              <Button mode="outlined" onPress={() => setCatModal(false)} style={{ flex: 1 }}>Cancelar</Button>
              <Button mode="contained" onPress={handleSaveCat} loading={catSaving} disabled={catSaving} buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} style={{ flex: 1 }}>Guardar</Button>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={!!confirmDlg}
        title={confirmDlg?.title ?? ''}
        message={confirmDlg?.message ?? ''}
        confirmLabel="Sí, confirmar"
        // I-02: cerrar primero y después ejecutar (antes un doble toque mandaba dos pedidos:
        // dos toggles dejaban el producto como estaba).
        onConfirm={() => { const fn = confirmDlg?.onConfirm; setConfirmDlg(null); fn?.(); }}
        onCancel={() => setConfirmDlg(null)}
      />
      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar('')} duration={2500}>{snackbar}</Snackbar>
    </View>
  );
};

// ─── Estilos ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: COLOR.bg },

  // Header
  header:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: SPACE.s2, padding: SPACE.s4, backgroundColor: COLOR.surface, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  headerLeft:         { flexDirection: 'column', gap: SPACE.s2 },
  headerTitle:        { fontSize: FONT_SIZE.h1, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  headerRight:        { flexDirection: 'row', alignItems: 'center', gap: SPACE.s2, flexWrap: 'wrap' },
  storeSelector:      { flexDirection: 'row', gap: SPACE.s2, flexWrap: 'wrap' },
  storeChip:          { paddingHorizontal: SPACE.s4, paddingVertical: 7, borderRadius: RADIUS.full, backgroundColor: COLOR.bg, borderWidth: 1, borderColor: COLOR.border },
  storeChipActive:    { backgroundColor: COLOR.brand, borderColor: COLOR.brandDark },
  storeChipText:      { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.ink2 },
  storeChipTextActive:{ color: COLOR.ink, fontWeight: FONT_WEIGHT.bold as any },

  // Alert
  alertBanner:        { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.warnTint, borderBottomWidth: 1, borderBottomColor: COLOR.warnBorder, padding: SPACE.s2, paddingHorizontal: SPACE.s4 },
  alertText:          { color: COLOR.warn, fontWeight: FONT_WEIGHT.semibold as any, fontSize: FONT_SIZE.label },

  // KPIs
  kpis:               { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s2, padding: SPACE.s3 },
  kpi:                { flex: 1, minWidth: 140, backgroundColor: COLOR.surface, borderRadius: RADIUS.r3, borderWidth: 1, borderColor: COLOR.border, padding: SPACE.s4, flexDirection: 'row', alignItems: 'center', gap: SPACE.s3, ...SHADOW.sm },
  kpiWarn:            { borderColor: COLOR.warnBorder, backgroundColor: COLOR.warnTint },
  kpiIcon:            { fontSize: 26 },
  kpiTitle:           { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.inkMute, marginBottom: 2 },
  kpiValue:           { fontSize: FONT_SIZE.amount, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink, letterSpacing: -0.5 },
  kpiSub:             { fontSize: FONT_SIZE.caption, color: COLOR.inkMute, marginTop: 2 },

  // Search
  searchRow:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.s3, paddingVertical: SPACE.s2, gap: SPACE.s2 },
  searchBox:          { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.surface, borderRadius: RADIUS.r2, borderWidth: 1, borderColor: COLOR.border, paddingHorizontal: SPACE.s3, height: CONTROL.inputH - 8 },
  searchInput:        { flex: 1, fontSize: FONT_SIZE.body, color: COLOR.ink, outlineStyle: 'none' } as any,
  catChip:            { flexDirection: 'row', alignItems: 'center', gap: SPACE.s1, maxWidth: 200, backgroundColor: COLOR.brandTint, borderWidth: 1, borderColor: COLOR.brand, borderRadius: RADIUS.full, paddingHorizontal: SPACE.s3, paddingVertical: 6 },
  catChipText:        { flexShrink: 1, fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.brandDeep },

  // Layout principal
  main:               { flex: 1, flexDirection: 'column' },
  mainDesktop:        { flexDirection: 'row' },

  // Categorías — panel
  catPanel:           { width: 340, backgroundColor: COLOR.surface, borderRightWidth: 1, borderRightColor: COLOR.border, ...SHADOW.sm },
  catPanelMobile:     { width: '100%', maxHeight: 280, borderRightWidth: 0, borderBottomWidth: 1, borderBottomColor: COLOR.border },

  // Header del panel
  catpanelHead:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.s4, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  catpanelTitle:      { fontSize: 15, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink, letterSpacing: -0.15 },
  catpanelBadge:      { backgroundColor: COLOR.brandTint, paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.full },
  catpanelBadgeText:  { fontSize: 11, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.brandDeep },

  // Buscador
  catpanelSearch:     { paddingHorizontal: SPACE.s3, paddingVertical: SPACE.s2, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  catSearchInput:     { backgroundColor: COLOR.bgAlt, borderRadius: RADIUS.r2, paddingHorizontal: SPACE.s3, paddingVertical: 7, fontSize: FONT_SIZE.label, color: COLOR.ink, borderWidth: 1, borderColor: COLOR.border },

  // Filas del árbol
  catRow:             { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: SPACE.s2, borderRadius: RADIUS.r2, marginHorizontal: SPACE.s2, marginVertical: 1, gap: 4 },
  catRowSelected:     { backgroundColor: COLOR.brandTint },
  catRowTodas:        { backgroundColor: COLOR.surface2, marginBottom: 4 },
  catRowTodasSelected:{ backgroundColor: COLOR.brandTint2 },

  // Nombre
  catName:            { flex: 1, fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.ink2 },
  catNameSelected:    { color: COLOR.ink, fontWeight: FONT_WEIGHT.bold as any },
  catNameTodas:       { fontWeight: FONT_WEIGHT.bold as any },
  catNameInactive:    { opacity: 0.45, textDecorationLine: 'line-through' as any },

  // Contador badge (fuente mono)
  catCount:           { backgroundColor: COLOR.bg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: RADIUS.full, minWidth: 26, alignItems: 'center' },
  catCountSelected:   { backgroundColor: COLOR.surface },
  catCountText:       { fontFamily: 'JetBrainsMono-Regular', fontSize: 11, fontWeight: '700', color: COLOR.inkMute, textAlign: 'center' },
  catCountTextSelected:{ color: COLOR.brandDeep },

  // Acciones inline
  catActions:         { flexDirection: 'row', gap: 0, marginLeft: 2 },

  // Guía visual de hijos
  catChildren:        { marginLeft: 17, paddingLeft: 14, borderLeftWidth: 1, borderLeftColor: COLOR.catGuide },

  // Botón nueva categoría — dashed outline
  newCatBtn:          { margin: SPACE.s2, padding: SPACE.s3, backgroundColor: COLOR.surface, borderWidth: 1.5, borderColor: COLOR.border2, borderStyle: 'dashed', borderRadius: RADIUS.r2, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  newCatBtnText:      { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.medium as any, color: COLOR.inkMute },

  // Filas de productos
  empty:              { textAlign: 'center', marginTop: 40, color: COLOR.inkMute, fontSize: FONT_SIZE.body },
  rowHeader:          { backgroundColor: COLOR.surface2, borderBottomWidth: 2, borderBottomColor: COLOR.border },
  colHeader:          { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink2 } as any,
  row:                { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.surface, borderBottomWidth: 1, borderBottomColor: COLOR.border, paddingHorizontal: SPACE.s2, paddingVertical: SPACE.s2, gap: SPACE.s2 },
  rowInactive:        { opacity: 0.5 },
  rowInfo:            { flex: 1, minWidth: 0 },
  rowName:            { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  rowSku:             { fontSize: FONT_SIZE.caption, color: COLOR.inkMute, fontWeight: FONT_WEIGHT.semibold as any },
  rowCat:             { fontSize: FONT_SIZE.caption, color: COLOR.inkDisabled, marginTop: 1 },
  rowPrice:           { width: 80, fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink, textAlign: 'right' },
  stockBadge:         { flexDirection: 'row', alignItems: 'baseline', borderRadius: RADIUS.r1, paddingHorizontal: SPACE.s2, paddingVertical: SPACE.s1, gap: 2, width: 90, justifyContent: 'center' },
  stockNum:           { fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.bold as any },
  stockMin:           { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.semibold as any },
  rowActions:         { flexDirection: 'row', alignItems: 'center', gap: 2 },
  // Tint + borde, no relleno sólido: este botón está "siempre visible" en cada
  // fila de la tabla, así que el dorado sólido rompería la regla 60-30-10 al
  // repetirse en toda la lista (mismo criterio que Roles/POS).
  adjustBtn:          { backgroundColor: COLOR.brandTint, borderWidth: 1, borderColor: COLOR.brand, borderRadius: RADIUS.r1, paddingHorizontal: SPACE.s2, paddingVertical: 6, marginRight: SPACE.s1 },
  adjustBtnText:      { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.brandDeep },
  actionIcon:         { margin: 0 },

  // View tabs (Stock / Historial)
  viewTabs:           { flexDirection: 'row', backgroundColor: COLOR.bg, borderRadius: RADIUS.r2, padding: 3, gap: 2 },
  viewTab:            { paddingHorizontal: SPACE.s4, paddingVertical: 6, borderRadius: RADIUS.r1 },
  viewTabActive:      { backgroundColor: COLOR.surface, ...SHADOW.sm },
  viewTabText:        { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.inkMute },
  viewTabTextActive:  { color: COLOR.ink, fontWeight: FONT_WEIGHT.bold as any },

  // Filas de movimiento
  movRow:             { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.surface, borderBottomWidth: 1, borderBottomColor: COLOR.border, paddingHorizontal: SPACE.s2, paddingVertical: SPACE.s2, gap: SPACE.s2 },
  movTypeBadge:       { width: 84, borderRadius: RADIUS.r1, paddingHorizontal: SPACE.s2, paddingVertical: SPACE.s1, alignItems: 'center' },
  movTypeText:        { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold as any },
  movInfo:            { flex: 1, minWidth: 0 },
  movProduct:         { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  movReason:          { fontSize: FONT_SIZE.caption, color: COLOR.inkMute, marginTop: 2 },
  movQty:             { width: 52, fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold as any, textAlign: 'right' },
  movDate:            { width: 58, fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.inkMute, textAlign: 'center' },

  // Modales
  overlay:            { flex: 1, backgroundColor: COLOR.overlay, justifyContent: 'center', alignItems: 'center' },
  modal:              { backgroundColor: COLOR.surface, borderRadius: RADIUS.r4, padding: SPACE.s5, width: '92%', maxWidth: 460 },
  modalTitle:         { fontSize: FONT_SIZE.h1, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink, marginBottom: SPACE.s1 },
  modalSub:           { fontSize: FONT_SIZE.label, color: COLOR.ink2, fontWeight: FONT_WEIGHT.semibold as any, marginBottom: SPACE.s1 },
  modalStock:         { fontSize: FONT_SIZE.label, color: COLOR.inkMute, marginBottom: SPACE.s4 },
  typeRow:            { flexDirection: 'row', gap: SPACE.s2, marginBottom: SPACE.s3 },
  input:              { marginBottom: SPACE.s2 },
  helperTight:        { marginTop: -SPACE.s2 },
  descError:          { flexDirection: 'row', alignItems: 'center', marginTop: -SPACE.s2 },
  fieldLabel:         { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.inkMute, marginBottom: SPACE.s2 },
  catPickerBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: COLOR.border2, borderRadius: RADIUS.r2, paddingHorizontal: SPACE.s4, paddingVertical: SPACE.s3, marginBottom: SPACE.s2, backgroundColor: COLOR.surface },
  catPickerValue:     { flex: 1, fontSize: FONT_SIZE.body, color: COLOR.ink, fontWeight: FONT_WEIGHT.medium as any },
  catPickerPlaceholder: { flex: 1, fontSize: FONT_SIZE.body, color: COLOR.inkDisabled },
  catPickerItem:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, paddingHorizontal: SPACE.s4, borderRadius: RADIUS.r1 },
  catPickerItemActive:{ backgroundColor: COLOR.brandTint },
  catPickerItemText:  { fontSize: FONT_SIZE.body, color: COLOR.ink, fontWeight: FONT_WEIGHT.medium as any, flex: 1 },
  modalActions:       { flexDirection: 'row', gap: SPACE.s2, marginTop: SPACE.s2 },

  // Product card disabled / in-cart
  productCardDisabled: { opacity: 0.45, backgroundColor: COLOR.bgAlt },
  inCartBadge:         { backgroundColor: COLOR.income, borderRadius: RADIUS.r1, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  inCartBadgeText:     { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.white },
  outOfStockBadge:     { backgroundColor: COLOR.expense, borderRadius: RADIUS.r1, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  outOfStockBadgeText: { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.white },
  pcBottomInactive:    { height: 30, justifyContent: 'center' },
  pcTapHint:           { fontSize: FONT_SIZE.caption, color: COLOR.inkDisabled, fontWeight: FONT_WEIGHT.semibold as any },
});

export default InventoryScreen;
