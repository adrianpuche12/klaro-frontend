// =============================================================================
// InventoryScreen.tsx  ·  screens/InventoryScreen.tsx
// Consulta de stock + alertas + ajuste. Rediseño visual.
// Sin emojis, sin inline styles, sin hex. FlatList con keyExtractor.
// Conservá tus fuentes de datos reales (productos, roles, API de ajuste) — abajo
// uso nombres genéricos (product.nombre, product.stock, etc.); reemplazá por los
// nombres reales de tu modelo SIN cambiar la lógica.
// =============================================================================
import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, ScrollView,
  TouchableOpacity, Modal, ActivityIndicator,
} from 'react-native';
import axios from 'axios';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLOR, SPACE, FONT_SIZE, FONT_WEIGHT, RADIUS, CONTROL, SHADOW } from '../theme';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { REACT_APP_API_URL } from '../config';

type StockState = 'normal' | 'low' | 'out';
type Filter = 'todos' | 'bajo' | 'sin' | 'normal';

// Reemplazá por tu tipo real de producto.
interface Product {
  id: string;
  nombre: string;
  categoria: string;
  stock: number;
  minStock: number;
  maxStock: number;
  icon?: string;
}

function stockState(p: Product): StockState {
  if (p.stock === 0) return 'out';
  if (p.stock <= p.minStock) return 'low';
  return 'normal';
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'bajo', label: 'Stock bajo' },
  { key: 'sin', label: 'Sin stock' },
  { key: 'normal', label: 'Normal' },
];

interface Props {
  products: Product[];
  isAdmin: boolean;                       // admin/root ven "Ajustar"
  onBack: () => void;
  onAdjust: (productId: string, tipo: 'entrada' | 'salida', cantidad: number, motivo: string) => void;
}

function InventoryView({ products, isAdmin, onBack, onAdjust }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('todos');
  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null);

  const lowCount = useMemo(
    () => products.filter(p => stockState(p) === 'low').length,
    [products],
  );

  const visible = useMemo(() => {
    return products.filter(p => {
      const q = query.trim().toLowerCase();
      if (q && !p.nombre.toLowerCase().includes(q)) return false;
      const s = stockState(p);
      if (filter === 'bajo') return s === 'low';
      if (filter === 'sin') return s === 'out';
      if (filter === 'normal') return s === 'normal';
      return true;
    });
  }, [products, query, filter]);

  const renderItem = ({ item }: { item: Product }) => {
    const s = stockState(item);
    const pct = Math.min(item.stock / Math.max(item.maxStock, 1), 1) * 100;
    return (
      <View style={[styles.prod, s === 'low' && styles.prodLow, s === 'out' && styles.prodOut]}>
        <View style={styles.prodTop}>
          <View style={styles.catIco}>
            <MaterialCommunityIcons name={item.icon || 'food'} size={20} color={COLOR.brandDeep} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.prodName}>{item.nombre}</Text>
            <Text style={styles.prodCat}>Categoría: {item.categoria}</Text>
          </View>
        </View>

        <View style={styles.stockRow}>
          <Text style={[styles.stk, s === 'normal' && styles.stkNormal, s === 'low' && styles.stkLow, s === 'out' && styles.stkOut]}>
            {s === 'out' ? 'Sin stock' : `Stock: ${item.stock}`}
          </Text>
          <Text style={styles.min}>Mínimo: {item.minStock}</Text>
          {isAdmin && (
            <TouchableOpacity style={styles.adjustBtn} onPress={() => setAdjustTarget(item)}>
              <Text style={styles.adjustTxt}>Ajustar</Text>
            </TouchableOpacity>
          )}
        </View>

        <View>
          <View style={styles.bar}>
            <View style={[
              styles.barFill,
              { width: `${pct}%` },
              s === 'normal' && styles.barNormal,
              s === 'low' && styles.barLow,
              s === 'out' && styles.barOut,
            ]} />
          </View>
          <Text style={styles.barCap}>{item.stock} / {item.maxStock}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* AppBar */}
      <View style={styles.appbar}>
        <TouchableOpacity style={styles.back} onPress={onBack}>
          <MaterialCommunityIcons name="chevron-left" size={24} color={COLOR.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>Inventario</Text>
        {isAdmin && (
          <TouchableOpacity style={styles.appAct}>
            <MaterialCommunityIcons name="plus-circle-outline" size={16} color={COLOR.info} />
            <Text style={styles.appActTxt}>Ajustar</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Buscador */}
      <View style={styles.search}>
        <MaterialCommunityIcons name="magnify" size={18} color={COLOR.inkMute} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar producto…"
          placeholderTextColor={COLOR.inkDisabled}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />
      </View>

      {/* Chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.chip, filter === f.key && styles.chipOn]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.chipTxt, filter === f.key && styles.chipTxtOn]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Banner de alerta */}
      {lowCount > 0 && (
        <TouchableOpacity style={styles.banner} onPress={() => setFilter('bajo')}>
          <MaterialCommunityIcons name="alert-circle-outline" size={20} color={COLOR.warn} />
          <Text style={styles.bannerTxt}>{lowCount} productos con stock bajo</Text>
        </TouchableOpacity>
      )}

      {/* Lista */}
      {visible.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="package-variant-closed-remove" size={64} color={COLOR.inkMute} />
          <Text style={styles.emptyTxt}>
            {query ? `Sin resultados para "${query}"` : 'Sin productos'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={visible}
          renderItem={renderItem}
          keyExtractor={item => item.id}
        />
      )}

      {/* Modal de ajuste */}
      <AdjustModal
        product={adjustTarget}
        onClose={() => setAdjustTarget(null)}
        onSave={(tipo, cantidad, motivo) => {
          if (adjustTarget) onAdjust(adjustTarget.id, tipo, cantidad, motivo);
          setAdjustTarget(null);
        }}
      />
    </View>
  );
}

// ---- Modal de ajuste de stock ----
function AdjustModal({
  product, onClose, onSave,
}: {
  product: Product | null;
  onClose: () => void;
  onSave: (tipo: 'entrada' | 'salida', cantidad: number, motivo: string) => void;
}) {
  const [tipo, setTipo] = useState<'entrada' | 'salida'>('entrada');
  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState('');

  if (!product) return null;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOv}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Ajustar stock</Text>
          <Text style={styles.modalProd}>{product.nombre}</Text>
          <Text style={styles.modalCur}>Stock actual: <Text style={styles.modalCurB}>{product.stock}</Text> unidades</Text>

          <Text style={styles.mLbl}>Tipo de ajuste</Text>
          <View style={styles.toggle}>
            <TouchableOpacity
              style={[styles.tgBtn, tipo === 'entrada' && styles.tgIn]}
              onPress={() => setTipo('entrada')}
            >
              <MaterialCommunityIcons name="plus" size={15} color={tipo === 'entrada' ? COLOR.income : COLOR.ink2} />
              <Text style={[styles.tgTxt, tipo === 'entrada' && styles.tgTxtIn]}>Entrada</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tgBtn, tipo === 'salida' && styles.tgOut]}
              onPress={() => setTipo('salida')}
            >
              <MaterialCommunityIcons name="minus" size={15} color={tipo === 'salida' ? COLOR.expense : COLOR.ink2} />
              <Text style={[styles.tgTxt, tipo === 'salida' && styles.tgTxtOut]}>Salida</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.mLbl}>Cantidad</Text>
          <TextInput
            style={styles.qty}
            value={cantidad}
            onChangeText={setCantidad}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={COLOR.inkDisabled}
          />

          <Text style={styles.mLbl}>Motivo</Text>
          <TextInput
            style={styles.reason}
            value={motivo}
            onChangeText={setMotivo}
            placeholder="Compra a proveedor, merma, corrección…"
            placeholderTextColor={COLOR.inkDisabled}
          />

          <View style={styles.mActions}>
            <TouchableOpacity style={[styles.mBtn, styles.mCancel]} onPress={onClose}>
              <Text style={styles.mCancelTxt}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.mBtn, tipo === 'entrada' ? styles.mSaveIn : styles.mSaveOut]}
              onPress={() => onSave(tipo, parseInt(cantidad || '0', 10), motivo)}
            >
              <Text style={styles.mSaveTxt}>Guardar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.bg },
  flex: { flex: 1 },

  appbar: {
    height: 56, flexDirection: 'row', alignItems: 'center', gap: SPACE.s2,
    paddingHorizontal: SPACE.s3, backgroundColor: COLOR.surface,
    borderBottomWidth: 1, borderBottomColor: COLOR.border,
  },
  back: { width: 40, height: 40, borderRadius: RADIUS.full, justifyContent: 'center', alignItems: 'center' },
  title: { flex: 1, fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink },
  appAct: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.s1,
    height: CONTROL.buttonSmH, paddingHorizontal: SPACE.s3,
    borderRadius: RADIUS.r2, borderWidth: 1, borderColor: COLOR.info,
  },
  appActTxt: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold, color: COLOR.info },

  search: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.s2,
    marginHorizontal: SPACE.s4, marginTop: SPACE.s3, height: 44,
    borderWidth: 1, borderColor: COLOR.border2, borderRadius: RADIUS.r2,
    backgroundColor: COLOR.surface, paddingHorizontal: SPACE.s3,
  },
  searchInput: { flex: 1, fontSize: FONT_SIZE.body, color: COLOR.ink },

  chips: { gap: SPACE.s2, paddingHorizontal: SPACE.s4, paddingVertical: SPACE.s3 },
  chip: {
    height: CONTROL.chipH, paddingHorizontal: SPACE.s4, borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: COLOR.border, backgroundColor: COLOR.surface,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: COLOR.brand, borderColor: COLOR.brand },
  chipTxt: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold, color: COLOR.ink2 },
  chipTxtOn: { color: COLOR.inkOnBrand },

  banner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.s2,
    marginHorizontal: SPACE.s4, marginVertical: SPACE.s2, padding: SPACE.s3,
    backgroundColor: COLOR.warnTint, borderWidth: 1, borderColor: COLOR.warnBorder,
    borderLeftWidth: 4, borderLeftColor: COLOR.warn, borderRadius: RADIUS.r2,
  },
  bannerTxt: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.medium, color: COLOR.warn },

  prod: {
    backgroundColor: COLOR.surface, borderBottomWidth: 1, borderBottomColor: COLOR.border,
    padding: SPACE.s4, gap: SPACE.s3,
  },
  prodLow: { borderLeftWidth: 4, borderLeftColor: COLOR.warn },
  prodOut: { borderLeftWidth: 4, borderLeftColor: COLOR.expense, backgroundColor: COLOR.expenseTint },
  prodTop: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s3 },
  catIco: {
    width: 40, height: 40, borderRadius: RADIUS.full, backgroundColor: COLOR.brandTint,
    justifyContent: 'center', alignItems: 'center',
  },
  prodName: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.semibold, color: COLOR.ink },
  prodCat: { fontSize: FONT_SIZE.caption, color: COLOR.inkMute, marginTop: 2 },

  stockRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s4 },
  stk: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.medium },
  stkNormal: { color: COLOR.income },
  stkLow: { color: COLOR.warn },
  stkOut: { color: COLOR.expense },
  min: { fontSize: FONT_SIZE.caption, color: COLOR.inkMute },
  adjustBtn: { marginLeft: 'auto', paddingVertical: SPACE.s1, paddingHorizontal: SPACE.s2, borderRadius: RADIUS.r1 },
  adjustTxt: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold, color: COLOR.info },

  bar: { height: 4, borderRadius: RADIUS.full, backgroundColor: COLOR.border, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: RADIUS.full },
  barNormal: { backgroundColor: COLOR.income },
  barLow: { backgroundColor: COLOR.warn },
  barOut: { backgroundColor: COLOR.expense },
  barCap: { fontSize: FONT_SIZE.caption, color: COLOR.inkMute, marginTop: 3 },

  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACE.s6 },
  emptyTxt: { fontSize: FONT_SIZE.h3, color: COLOR.inkMute, marginTop: SPACE.s3, textAlign: 'center' },

  // Modal
  modalOv: { flex: 1, backgroundColor: 'rgba(31,27,22,0.45)', justifyContent: 'center', padding: SPACE.s4 },
  modal: { backgroundColor: COLOR.surface, borderRadius: RADIUS.r4, padding: SPACE.s5, ...SHADOW.lg },
  modalTitle: { fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink },
  modalProd: { fontSize: FONT_SIZE.body, color: COLOR.ink2, marginTop: SPACE.s1, marginBottom: SPACE.s4 },
  modalCur: { fontSize: FONT_SIZE.label, color: COLOR.inkMute, marginBottom: SPACE.s4 },
  modalCurB: { color: COLOR.ink, fontWeight: FONT_WEIGHT.bold },
  mLbl: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold, color: COLOR.ink2, marginBottom: SPACE.s2 },
  toggle: { flexDirection: 'row', gap: SPACE.s2, marginBottom: SPACE.s4 },
  tgBtn: {
    flex: 1, height: CONTROL.buttonSmH, borderRadius: RADIUS.r2, borderWidth: 1, borderColor: COLOR.border2,
    backgroundColor: COLOR.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.s1,
  },
  tgIn: { backgroundColor: COLOR.incomeTint, borderColor: COLOR.income },
  tgOut: { backgroundColor: COLOR.expenseTint, borderColor: COLOR.expense },
  tgTxt: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold, color: COLOR.ink2 },
  tgTxtIn: { color: COLOR.income },
  tgTxtOut: { color: COLOR.expense },
  qty: {
    height: 64, borderWidth: 1, borderColor: COLOR.border2, borderRadius: RADIUS.r2,
    textAlign: 'center', fontFamily: 'JetBrainsMono', fontSize: 34, fontWeight: FONT_WEIGHT.bold,
    color: COLOR.ink, backgroundColor: COLOR.surface, marginBottom: SPACE.s4,
  },
  reason: {
    height: CONTROL.inputH, borderWidth: 1, borderColor: COLOR.border2, borderRadius: RADIUS.r2,
    paddingHorizontal: SPACE.s3, fontSize: FONT_SIZE.body, color: COLOR.ink,
    backgroundColor: COLOR.surface, marginBottom: SPACE.s5,
  },
  mActions: { flexDirection: 'row', gap: SPACE.s2 },
  mBtn: { flex: 1, height: CONTROL.buttonSmH, borderRadius: RADIUS.r2, justifyContent: 'center', alignItems: 'center' },
  mCancel: { borderWidth: 1, borderColor: COLOR.border2, backgroundColor: COLOR.surface },
  mCancelTxt: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink2 },
  mSaveIn: { backgroundColor: COLOR.income },
  mSaveOut: { backgroundColor: COLOR.expense },
  mSaveTxt: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold, color: COLOR.white },
});

// ─── Connected wrapper (default export) ──────────────────────────────────────
// Obtiene datos reales del backend y los pasa al componente puro InventoryView.

export default function InventoryScreen() {
  const { selectedStore } = useStore();
  const { roles, userName } = useAuth();
  const isAdmin = roles.includes('admin') || roles.includes('root');

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading]   = useState(true);

  const fetchStock = async () => {
    if (!selectedStore) return;
    try {
      const { data } = await axios.get(
        `${REACT_APP_API_URL}/api/v2/stores/${selectedStore.id}/stock`,
      );
      const mapped: Product[] = data.map((item: any) => ({
        id:        String(item.productId),
        nombre:    item.productName,
        categoria: item.categoryName ?? 'Sin categoría',
        stock:     item.quantity ?? 0,
        minStock:  item.minStock ?? 0,
        maxStock:  Math.max((item.minStock ?? 0) * 3, (item.quantity ?? 0) * 2, 100),
        icon:      'food',
      }));
      setProducts(mapped);
    } catch (e) {
      console.error('[InventoryScreen] fetch error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStock(); }, [selectedStore?.id]);

  const handleAdjust = async (
    productId: string,
    tipo: 'entrada' | 'salida',
    cantidad: number,
    motivo: string,
  ) => {
    if (!selectedStore) return;
    await axios.post(
      `${REACT_APP_API_URL}/api/v2/stores/${selectedStore.id}/stock/adjustment`,
      {
        productId: Number(productId),
        type:      tipo === 'entrada' ? 'IN' : 'OUT',
        quantity:  cantidad,
        reason:    motivo,
        username:  userName ?? 'unknown',
        source:    'MANUAL',
      },
    );
    fetchStock();
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLOR.bg }}>
        <ActivityIndicator size="large" color={COLOR.brand} />
      </View>
    );
  }

  return (
    <InventoryView
      products={products}
      isAdmin={isAdmin}
      onBack={() => {}}
      onAdjust={handleAdjust}
    />
  );
}
