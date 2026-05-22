import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput as RNTextInput, ActivityIndicator, Modal,
  useWindowDimensions, Pressable,
} from 'react-native';
import { Button, TextInput, Snackbar, IconButton } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import axios from 'axios';
import { REACT_APP_API_URL } from '../config';
import { useStore } from '../context/StoreContext';
import ConfirmDialog from '../components/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { COLOR, SPACE, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOW, CONTROL } from '../theme';
import { formatHnl } from '../utils/format';
import { stockColor } from '../utils/stockStatus';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Store       { id: number; name: string; active: boolean }
interface Category    { id: number; name: string; active: boolean; parentId: number | null; children: Category[]; productCount: number }
interface StockItem   { stockId: number; productId: number; productName: string; productSku: string; productType: string; productActive: boolean; price: number; quantity: number; minStock: number; lowStock: boolean; categoryName: string; categoryPath: string; categoryId: number | null; storeId: number; updatedAt: string }
interface Movement    { id: number; type: string; quantity: number; reason: string | null; notes: string | null; username: string | null; productId: number; productName: string; storeId: number; createdAt: string }
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

// Cuenta productos de forma recursiva
const countProducts = (cat: Category): number =>
  cat.productCount + cat.children.reduce((s, c) => s + countProducts(c), 0);

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

  const totalCount = categories.reduce((s, c) => s + countProducts(c), 0);
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
              {cat.productCount}
            </Text>
          </View>

          {/* Acciones — solo visibles al hover/selección */}
          {showActions && (
            <View style={styles.catActions}>
              {cat.children.length === 0 && (
                <IconButton icon="plus" size={14} iconColor={COLOR.income} onPress={() => onNewChild(cat.id)} style={{ margin: 0 }} />
              )}
              <IconButton icon="pencil" size={14} iconColor={COLOR.ink2} onPress={() => onEdit(cat)} style={{ margin: 0 }} />
              <IconButton
                icon={cat.active ? 'toggle-switch' : 'toggle-switch-off'}
                size={14}
                iconColor={cat.active ? COLOR.income : COLOR.inkDisabled}
                onPress={() => onToggle(cat)}
                style={{ margin: 0 }}
              />
              <IconButton icon="trash-can" size={14} iconColor={COLOR.expense} onPress={() => onDelete(cat)} style={{ margin: 0 }} />
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
          <IconButton icon="chevron-up"   size={14} iconColor={COLOR.inkMute} onPress={collapseAll} style={{ margin: 0 }} />
          <IconButton icon="chevron-down" size={14} iconColor={COLOR.inkMute} onPress={expandAll}   style={{ margin: 0 }} />
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
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const { roles } = useAuth();
  const isAdmin = roles.includes('admin');

  const { stores, selectedStore, setSelectedStore } = useStore();
  const storeId = selectedStore?.id ?? null;
  const [categories, setCategories]       = useState<Category[]>([]);
  const [stock, setStock]                 = useState<StockItem[]>([]);
  const [summary, setSummary]             = useState<Summary | null>(null);
  const [loading, setLoading]             = useState(false);
  const [search, setSearch]               = useState('');
  const [selectedCat, setSelectedCat]     = useState<number | null>(null);
  const [showCatPanel, setShowCatPanel]   = useState(true);
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

  const loadMovements = useCallback(async () => {
    if (!storeId) return;
    setLoadingMov(true);
    try {
      const res = await axios.get<Movement[]>(`${API}/api/v2/stores/${storeId}/stock/movements`);
      setMovements(res.data);
    } catch { setSnackbar('Error al cargar movimientos'); }
    finally { setLoadingMov(false); }
  }, [storeId]);

  const handleViewChange = (view: 'stock' | 'movements') => {
    setActiveView(view);
    if (view === 'movements') loadMovements();
  };

  // ── Filtrado ─────────────────────────────────────────────────────────────────

  // Recoge todos los nombres de una categoría y sus descendientes
  const allCatNames = (cat: Category): string[] =>
    [cat.name, ...cat.children.flatMap(allCatNames)];

  const filtered = stock.filter(item => {
    // Filtro por búsqueda
    if (search) {
      const q = search.toLowerCase();
      if (!item.productName.toLowerCase().includes(q) &&
          !(item.productSku || '').toLowerCase().includes(q)) return false;
    }

    // Filtro por categoría seleccionada
    if (selectedCat !== null) {
      const cat = findCat(categories, selectedCat);
      if (!cat) return false;

      // Si el producto no tiene categoría → no mostrar cuando hay filtro activo
      if (!item.categoryPath) return false;

      // El path del producto debe contener la categoría seleccionada o alguna de sus hijas
      const validNames = allCatNames(cat);
      const pathParts  = item.categoryPath.split(' > ');
      const matches    = pathParts.some(part => validNames.includes(part));
      if (!matches) return false;
    }

    return true;
  });

  function findCat(cats: Category[], id: number): Category | null {
    for (const c of cats) { if (c.id === id) return c; const f = findCat(c.children, id); if (f) return f; }
    return null;
  }

  // ── Ajuste de stock ──────────────────────────────────────────────────────────

  const handleAdjust = async () => {
    if (!adjustItem || !adjustQty || Number(adjustQty) <= 0) { setSnackbar('Ingresá una cantidad válida'); return; }
    setAdjustSaving(true);
    try {
      await axios.post(`${API}/api/v2/stores/${storeId}/stock/adjustment`, {
        productId: adjustItem.productId, type: adjustType,
        quantity: Number(adjustQty), reason: adjustReason, username: 'admin',
      });
      setSnackbar(`Stock ${adjustType === 'ENTRADA' ? 'agregado' : 'descontado'} correctamente`);
      setAdjustItem(null); setAdjustQty(''); setAdjustReason('');
      loadAll();
    } catch (e: any) {
      setSnackbar(e.response?.data?.error || 'Error al ajustar stock');
    } finally { setAdjustSaving(false); }
  };

  // ── CRUD Producto ─────────────────────────────────────────────────────────────

  const openCreateProduct = () => {
    setEditProduct(null);
    setProductForm(EMPTY_PRODUCT);
    setCatPickerLabel('');
    setProductModal(true);
  };

  const openEditProduct = (item: StockItem) => {
    setEditProduct(item);
    setProductForm({ name: item.productName, sku: item.productSku || '', type: item.productType, price: String(item.price), minStock: String(item.minStock), description: '', categoryId: item.categoryId ? String(item.categoryId) : '' });
    setCatPickerLabel(item.categoryPath || '');
    setProductModal(true);
  };

  const handleSaveProduct = async () => {
    if (!productForm.name || !productForm.price) { setSnackbar('Nombre y precio son obligatorios'); return; }
    setProductSaving(true);
    try {
      const body = { name: productForm.name, sku: productForm.sku, type: productForm.type, price: Number(productForm.price), minStock: Number(productForm.minStock), description: productForm.description, categoryId: productForm.categoryId ? Number(productForm.categoryId) : null };
      if (editProduct) {
        await axios.put(`${API}/api/v2/products/${editProduct.productId}`, body);
        setSnackbar('Producto actualizado');
      } else {
        await axios.post(`${API}/api/v2/stores/${storeId}/products`, body);
        setSnackbar('Producto creado');
      }
      setProductModal(false); loadAll();
    } catch (e: any) { setSnackbar(e.response?.data?.error || 'Error al guardar'); }
    finally { setProductSaving(false); }
  };

  const handleToggleProduct = (item: StockItem) => {
    askConfirm(
      item.productActive ? 'Desactivar producto' : 'Activar producto',
      `¿${item.productActive ? 'Desactivar' : 'Activar'} "${item.productName}"?`,
      async () => {
        try { await axios.put(`${API}/api/v2/products/${item.productId}/toggle`); loadAll(); }
        catch { setSnackbar('Error al cambiar estado'); }
        finally { setConfirmDlg(null); }
      }
    );
  };

  const handleDeleteProduct = (item: StockItem) => {
    askConfirm(
      'Eliminar producto',
      `¿Eliminar "${item.productName}"? Esta acción no se puede deshacer.`,
      async () => {
        try { await axios.delete(`${API}/api/v2/products/${item.productId}`); setSnackbar('Producto eliminado'); loadAll(); }
        catch { setSnackbar('No se puede eliminar — el producto tiene historial'); }
        finally { setConfirmDlg(null); }
      }
    );
  };

  // ── CRUD Categorías ──────────────────────────────────────────────────────────

  const openNewCat = (parentId: number | null = null) => {
    setEditCat(null); setCatParentId(parentId); setCatName(''); setCatDesc(''); setCatModal(true);
  };

  const openEditCat = (cat: Category) => {
    setEditCat(cat); setCatParentId(cat.parentId); setCatName(cat.name); setCatDesc(''); setCatModal(true);
  };

  const handleSaveCat = async () => {
    if (!catName.trim()) { setSnackbar('El nombre es obligatorio'); return; }
    if (!storeId) { setSnackbar('Seleccioná un local primero'); return; }
    setCatSaving(true);
    try {
      if (editCat) {
        await axios.put(`${API}/api/v2/categories/${editCat.id}`, { name: catName, description: catDesc });
      } else if (catParentId) {
        await axios.post(`${API}/api/v2/stores/${storeId}/categories/${catParentId}/children`, { name: catName, description: catDesc });
      } else {
        await axios.post(`${API}/api/v2/stores/${storeId}/categories`, { name: catName, description: catDesc });
      }
      setCatModal(false); loadAll();
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Error al guardar categoría';
      setSnackbar(msg);
    }
    finally { setCatSaving(false); }
  };

  const handleDeleteCat = (cat: Category) => {
    askConfirm(
      'Eliminar categoría',
      `¿Eliminar "${cat.name}"? Se eliminará junto con sus subcategorías.`,
      async () => {
        try { await axios.delete(`${API}/api/v2/categories/${cat.id}`); setSnackbar('Categoría eliminada'); loadAll(); }
        catch { setSnackbar('No se puede eliminar — tiene subcategorías o productos activos'); }
        finally { setConfirmDlg(null); }
      }
    );
  };

  const handleToggleCat = async (cat: Category) => {
    try { await axios.put(`${API}/api/v2/categories/${cat.id}/toggle`); loadAll(); }
    catch { setSnackbar('Error al cambiar estado de categoría'); }
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

  const renderMovementRow = (m: Movement) => (
    <View key={m.id} style={styles.movRow}>
      <View style={[styles.movTypeBadge, { backgroundColor: movTypeColor(m.type) + '18' }]}>
        <Text style={[styles.movTypeText, { color: movTypeColor(m.type) }]}>{movTypeLabel(m.type)}</Text>
      </View>
      <View style={styles.movInfo}>
        <Text style={styles.movProduct} numberOfLines={1}>{m.productName}</Text>
        {m.reason ? <Text style={styles.movReason} numberOfLines={1}>{m.reason}</Text> : null}
      </View>
      <Text style={[styles.movQty, { color: (m.type === 'ENTRADA' || m.type === 'AJUSTE') ? COLOR.income : COLOR.expense }]}>
        {m.type === 'ENTRADA' ? '+' : '-'}{m.quantity}
      </Text>
      <Text style={styles.movDate}>
        {new Date(m.createdAt).toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit' })}{'\n'}
        {new Date(m.createdAt).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })}
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
      <Text style={styles.rowPrice}>{formatHnl(item.price)}</Text>

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
          onPress={() => { setAdjustType('ENTRADA'); setAdjustItem(item); }}
        >
          <Text style={styles.adjustBtnText}>{isAdmin ? 'Ajustar' : 'Agregar'}</Text>
        </TouchableOpacity>

        {/* Acciones de admin: editar, toggle, eliminar */}
        {isAdmin && <IconButton icon="pencil" size={18} iconColor={COLOR.ink2} onPress={() => openEditProduct(item)} style={styles.actionIcon} />}
        {isAdmin && (
          <IconButton
            icon={item.productActive ? 'toggle-switch' : 'toggle-switch-off'}
            size={18}
            iconColor={item.productActive ? COLOR.income : COLOR.inkDisabled}
            onPress={() => handleToggleProduct(item)}
            style={styles.actionIcon}
          />
        )}
        {isAdmin && <IconButton icon="trash-can" size={18} iconColor={COLOR.expense} onPress={() => handleDeleteProduct(item)} style={styles.actionIcon} />}
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
          {/* Selector de local — solo admin (usuario ya tiene su local asignado) */}
          {isAdmin ? (
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
              {isAdmin && (
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
              <KpiCard icon="cash-multiple" title="Valor estimado" value={formatHnl(summary.estimatedValue)} />
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
          {!isDesktop && (
            <IconButton icon="filter-variant" size={22} iconColor={COLOR.ink} onPress={() => setShowCatPanel(v => !v)} />
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
                  onSelect={setSelectedCat}
                  onNew={() => openNewCat(null)}
                  onEdit={openEditCat}
                  onDelete={handleDeleteCat}
                  onNewChild={(parentId) => openNewCat(parentId)}
                  onToggle={handleToggleCat}
                  isAdmin={isAdmin}
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
      <Modal visible={!!adjustItem} transparent animationType="fade" onRequestClose={() => setAdjustItem(null)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>
              {adjustType === 'ENTRADA' ? 'Agregar stock' : 'Descontar stock'}
            </Text>
            <Text style={styles.modalSub}>{adjustItem?.productName}</Text>
            <Text style={styles.modalStock}>Stock actual: <Text style={{ fontWeight: '900' }}>{adjustItem?.quantity}</Text></Text>

            {/* Selector de tipo — solo admin ve SALIDA */}
            <View style={styles.typeRow}>
              {(isAdmin ? (['ENTRADA', 'SALIDA'] as const) : (['ENTRADA'] as const)).map(t => (
                <Button key={t} mode="contained" onPress={() => setAdjustType(t)}
                  buttonColor={adjustType === t ? (t === 'ENTRADA' ? COLOR.income : COLOR.expense) : COLOR.bg}
                  textColor={adjustType === t ? COLOR.white : COLOR.ink2} style={{ flex: 1, borderRadius: RADIUS.r2 }}>
                  {t === 'ENTRADA' ? 'Entrada' : 'Salida'}
                </Button>
              ))}
            </View>

            <TextInput label="Cantidad *" value={adjustQty} onChangeText={setAdjustQty} keyboardType="numeric" mode="outlined" style={styles.input} />
            <TextInput label="Motivo" value={adjustReason} onChangeText={setAdjustReason} mode="outlined" style={styles.input} />

            <View style={styles.modalActions}>
              <Button mode="outlined" onPress={() => setAdjustItem(null)} style={{ flex: 1 }}>Cancelar</Button>
              <Button mode="contained" onPress={handleAdjust} loading={adjustSaving}
                buttonColor={adjustType === 'ENTRADA' ? COLOR.income : COLOR.expense} style={{ flex: 1 }}>
                Confirmar
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal producto ── */}
      <Modal visible={productModal} transparent animationType="fade" onRequestClose={() => setProductModal(false)}>
        <View style={styles.overlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}>
            <View style={[styles.modal, { width: '100%', maxWidth: 480 }]}>
              <Text style={styles.modalTitle}>{editProduct ? 'Editar Producto' : 'Nuevo Producto'}</Text>

              <TextInput label="Nombre *" value={productForm.name} onChangeText={v => setProductForm({ ...productForm, name: v })} mode="outlined" style={styles.input} />
              <TextInput label="SKU (código)" value={productForm.sku} onChangeText={v => setProductForm({ ...productForm, sku: v })} mode="outlined" style={styles.input} />
              <TextInput label="Precio *" value={productForm.price} onChangeText={v => setProductForm({ ...productForm, price: v })} keyboardType="numeric" mode="outlined" style={styles.input} />
              <TextInput label="Stock mínimo (alerta)" value={productForm.minStock} onChangeText={v => setProductForm({ ...productForm, minStock: v })} keyboardType="numeric" mode="outlined" style={styles.input} />

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

              <TextInput label="Descripción" value={productForm.description} onChangeText={v => setProductForm({ ...productForm, description: v })} mode="outlined" style={styles.input} multiline numberOfLines={2} />

              <View style={styles.modalActions}>
                <Button mode="outlined" onPress={() => setProductModal(false)} style={{ flex: 1 }}>Cancelar</Button>
                <Button mode="contained" onPress={handleSaveProduct} loading={productSaving} buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} style={{ flex: 1 }}>Guardar</Button>
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
              <Button mode="contained" onPress={handleSaveCat} loading={catSaving} buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} style={{ flex: 1 }}>Guardar</Button>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={!!confirmDlg}
        title={confirmDlg?.title ?? ''}
        message={confirmDlg?.message ?? ''}
        confirmLabel="Sí, confirmar"
        onConfirm={() => confirmDlg?.onConfirm()}
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
  adjustBtn:          { backgroundColor: COLOR.brand, borderRadius: RADIUS.r1, paddingHorizontal: SPACE.s2, paddingVertical: 6, marginRight: SPACE.s1 },
  adjustBtnText:      { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
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
