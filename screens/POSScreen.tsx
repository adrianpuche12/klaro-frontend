// =============================================================================
// POSScreen.tsx  ·  screens/POSScreen.tsx
// Punto de venta — la pantalla más usada. Rediseño visual completo.
// LÓGICA PRESERVADA: búsqueda, carrito, métodos de pago, createSale().
// Sin emojis, sin inline styles, sin hex. Conectá tus datos/handlers reales
// donde están marcados (productos, carrito, createSale) — NO cambies su comportamiento.
// =============================================================================
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, ScrollView,
  TouchableOpacity, Modal, useWindowDimensions, Animated, ActivityIndicator,
} from 'react-native';
import axios from 'axios';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLOR, SPACE, FONT_SIZE, FONT_WEIGHT, RADIUS, CONTROL, SHADOW } from '../theme';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { REACT_APP_API_URL } from '../config';

type Metodo = 'EFECTIVO' | 'TARJETA';

interface Product { id: string; nombre: string; precio: number; stock: number; minStock: number; categoria: string; icon?: string; }
interface CartLine { product: Product; cantidad: number; }

const L = (n: number) => `L ${n.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ISV_RATE = 0.15; // ajustá según tu config de impuestos

interface Props {
  products: Product[];
  categories: string[];
  storeName: string;
  turnoId: string;
  onMenu: () => void;
  onCreateSale: (lines: CartLine[], metodo: Metodo) => Promise<void>;
  onGoToHistory: () => void;
}

function POSView({
  products, categories, storeName, turnoId, onMenu, onCreateSale, onGoToHistory,
}: Props) {
  const { width } = useWindowDimensions();
  const numColumns = width >= 1024 ? 4 : width >= 768 ? 3 : 2;

  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('Todos');
  const [cart, setCart] = useState<Record<string, number>>({});   // productId -> cantidad
  const [metodo, setMetodo] = useState<Metodo>('EFECTIVO');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ total: number; metodo: Metodo; count: number } | null>(null);

  const visible = useMemo(() => products.filter(p => {
    const q = query.trim().toLowerCase();
    if (q && !p.nombre.toLowerCase().includes(q)) return false;
    if (cat !== 'Todos' && p.categoria !== cat) return false;
    return true;
  }), [products, query, cat]);

  const lines: CartLine[] = useMemo(
    () => Object.entries(cart).filter(([, q]) => q > 0)
      .map(([id, q]) => ({ product: products.find(p => p.id === id)!, cantidad: q }))
      .filter(l => l.product),
    [cart, products],
  );
  const count = lines.reduce((s, l) => s + l.cantidad, 0);
  const subtotal = lines.reduce((s, l) => s + l.product.precio * l.cantidad, 0);
  const isv = subtotal * ISV_RATE;
  const total = subtotal + isv;

  const add = useCallback((id: string) => setCart(c => ({ ...c, [id]: (c[id] || 0) + 1 })), []);
  const sub = useCallback((id: string) => setCart(c => ({ ...c, [id]: Math.max(0, (c[id] || 0) - 1) })), []);
  const clear = () => { setCart({}); setSheetOpen(false); };

  const confirm = async () => {
    if (lines.length === 0) return;
    setSubmitting(true);
    try {
      await onCreateSale(lines, metodo);          // <-- tu lógica real de venta
      setSuccess({ total, metodo, count });
      setCart({});
      setSheetOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const renderCard = ({ item }: { item: Product }) => {
    const qty = cart[item.id] || 0;
    const oos = item.stock <= 0;
    const low = item.stock <= item.minStock && !oos;
    return (
      <View style={[styles.card, oos && styles.cardOos]}>
        <View style={styles.cardImg}>
          <MaterialCommunityIcons name={item.icon || 'food'} size={30} color={COLOR.brandDeep} />
        </View>
        <Text style={styles.cardName} numberOfLines={2}>{item.nombre}</Text>
        <Text style={[styles.cardStock, low && styles.cardStockLow]}>
          {oos ? 'Sin stock' : `Stock: ${item.stock} unidades`}
        </Text>
        <Text style={styles.cardPrice}>{L(item.precio)}</Text>
        {qty > 0 ? (
          <View style={styles.stepper}>
            <TouchableOpacity style={styles.stepBtn} onPress={() => sub(item.id)}>
              <MaterialCommunityIcons name="minus" size={18} color={COLOR.brandDark} />
            </TouchableOpacity>
            <Text style={styles.stepN}>{qty}</Text>
            <TouchableOpacity style={styles.stepBtn} onPress={() => add(item.id)}>
              <MaterialCommunityIcons name="plus" size={18} color={COLOR.brandDark} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.addBtn, oos && styles.addBtnDisabled]}
            onPress={() => !oos && add(item.id)}
            disabled={oos}
          >
            <MaterialCommunityIcons name="plus" size={15} color={oos ? COLOR.inkDisabled : COLOR.inkOnBrand} />
            <Text style={[styles.addTxt, oos && styles.addTxtDisabled]}>{oos ? 'Sin stock' : 'Agregar'}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* AppBar */}
      <View style={styles.appbar}>
        <TouchableOpacity style={styles.iconBtn} onPress={onMenu}>
          <MaterialCommunityIcons name="menu" size={24} color={COLOR.ink} />
        </TouchableOpacity>
        <Text style={styles.appbarTitle}>POS · {storeName}</Text>
      </View>

      {/* Buscador */}
      <View style={styles.search}>
        <MaterialCommunityIcons name="magnify" size={20} color={COLOR.inkMute} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar producto..."
          placeholderTextColor={COLOR.inkDisabled}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />
      </View>

      {/* Categorías */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {['Todos', ...categories].map(c => (
          <TouchableOpacity key={c} style={[styles.chip, cat === c && styles.chipOn]} onPress={() => setCat(c)}>
            <Text style={[styles.chipTxt, cat === c && styles.chipTxtOn]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Grid */}
      <FlatList
        data={visible}
        renderItem={renderCard}
        keyExtractor={item => item.id}
        numColumns={numColumns}
        key={numColumns}
        columnWrapperStyle={numColumns > 1 ? styles.col : undefined}
        contentContainerStyle={styles.grid}
      />

      {/* FAB carrito */}
      {count > 0 && (
        <TouchableOpacity style={styles.fab} activeOpacity={0.9} onPress={() => setSheetOpen(true)}>
          <View>
            <MaterialCommunityIcons name="cart" size={22} color={COLOR.inkOnBrand} />
            <View style={styles.fabBadge}><Text style={styles.fabBadgeTxt}>{count}</Text></View>
          </View>
          <Text style={styles.fabTxt}>{count} productos · {L(total)}</Text>
          <MaterialCommunityIcons name="chevron-right" size={20} color={COLOR.inkOnBrand} style={styles.fabArrow} />
        </TouchableOpacity>
      )}

      {/* Bottom sheet carrito */}
      <Modal transparent visible={sheetOpen} animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <View style={styles.sheetOv}>
          <TouchableOpacity style={styles.sheetBackdrop} onPress={() => setSheetOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Carrito</Text>
              <Text style={styles.turno}>Turno #{turnoId}</Text>
              {lines.length > 0 && (
                <TouchableOpacity onPress={clear}><Text style={styles.clear}>Limpiar</Text></TouchableOpacity>
              )}
            </View>

            <ScrollView style={styles.sheetItems}>
              {lines.map(l => (
                <View key={l.product.id} style={styles.cItem}>
                  <View style={styles.flex}>
                    <Text style={styles.cName}>{l.product.nombre}</Text>
                    <Text style={styles.cSub}>{L(l.product.precio)} c/u</Text>
                  </View>
                  <View style={styles.stepperSm}>
                    <TouchableOpacity style={styles.stepBtn} onPress={() => sub(l.product.id)}>
                      <MaterialCommunityIcons name="minus" size={18} color={COLOR.brandDark} />
                    </TouchableOpacity>
                    <Text style={styles.stepN}>{l.cantidad}</Text>
                    <TouchableOpacity style={styles.stepBtn} onPress={() => add(l.product.id)}>
                      <MaterialCommunityIcons name="plus" size={18} color={COLOR.brandDark} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.cAmt}>{L(l.product.precio * l.cantidad)}</Text>
                </View>
              ))}
            </ScrollView>

            <View style={styles.sheetFoot}>
              <View style={styles.totRow}><Text style={styles.totL}>Subtotal</Text><Text style={styles.totV}>{L(subtotal)}</Text></View>
              <View style={styles.totRow}><Text style={styles.totL}>ISV 15%</Text><Text style={styles.totV}>{L(isv)}</Text></View>
              <View style={[styles.totRow, styles.grandRow]}><Text style={styles.grandL}>Total</Text><Text style={styles.grandV}>{L(total)}</Text></View>

              <View style={styles.payToggle}>
                {(['EFECTIVO', 'TARJETA'] as Metodo[]).map(m => (
                  <TouchableOpacity key={m} style={[styles.payBtn, metodo === m && styles.payBtnOn]} onPress={() => setMetodo(m)}>
                    <MaterialCommunityIcons name={m === 'EFECTIVO' ? 'cash' : 'credit-card-outline'} size={17} color={metodo === m ? COLOR.inkOnBrand : COLOR.ink2} />
                    <Text style={[styles.payTxt, metodo === m && styles.payTxtOn]}>{m === 'EFECTIVO' ? 'Efectivo' : 'Tarjeta'}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.confirmBtn, (submitting || lines.length === 0) && styles.confirmDisabled]}
                onPress={confirm}
                disabled={submitting || lines.length === 0}
              >
                <MaterialCommunityIcons name="check" size={18} color={COLOR.white} />
                <Text style={styles.confirmTxt}>Confirmar venta · {L(total)}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de éxito */}
      <SuccessModal data={success} onNew={() => setSuccess(null)} onHistory={() => { setSuccess(null); onGoToHistory(); }} />
    </View>
  );
}

function SuccessModal({ data, onNew, onHistory }: {
  data: { total: number; metodo: Metodo; count: number } | null;
  onNew: () => void; onHistory: () => void;
}) {
  const scale = React.useRef(new Animated.Value(0.7)).current;
  React.useEffect(() => {
    if (data) { scale.setValue(0.7); Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6 }).start(); }
  }, [data, scale]);
  if (!data) return null;
  return (
    <Modal transparent visible animationType="fade">
      <View style={styles.succOv}>
        <Animated.View style={[styles.succ, { transform: [{ scale }] }]}>
          <View style={styles.succIco}><MaterialCommunityIcons name="check-circle" size={64} color={COLOR.income} /></View>
          <Text style={styles.succTitle}>Venta registrada</Text>
          <Text style={styles.succAmt}>{L(data.total)}</Text>
          <View style={styles.succPill}><Text style={styles.succPillTxt}>{data.metodo}</Text></View>
          <Text style={styles.succMeta}>Productos: {data.count} · Vuelto: L 0.00</Text>
          <TouchableOpacity style={styles.succPrimary} onPress={onNew}><Text style={styles.succPrimaryTxt}>Nueva venta</Text></TouchableOpacity>
          <TouchableOpacity style={styles.succOutline} onPress={onHistory}><Text style={styles.succOutlineTxt}>Ver en historial</Text></TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.bg },
  flex: { flex: 1 },

  appbar: {
    height: 56, flexDirection: 'row', alignItems: 'center', gap: SPACE.s2, paddingHorizontal: SPACE.s3,
    backgroundColor: COLOR.surface, borderBottomWidth: 1, borderBottomColor: COLOR.border,
  },
  iconBtn: { width: 40, height: 40, borderRadius: RADIUS.full, justifyContent: 'center', alignItems: 'center' },
  appbarTitle: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold, color: COLOR.ink },

  search: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.s2, marginHorizontal: SPACE.s4, marginTop: SPACE.s3,
    height: 48, borderWidth: 1, borderColor: COLOR.border, borderRadius: RADIUS.r2, backgroundColor: COLOR.surface, paddingHorizontal: SPACE.s3,
  },
  searchInput: { flex: 1, fontSize: FONT_SIZE.body, color: COLOR.ink },

  chips: { gap: SPACE.s2, paddingHorizontal: SPACE.s4, paddingVertical: SPACE.s3 },
  chip: { height: CONTROL.chipH, paddingHorizontal: SPACE.s3, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLOR.border, backgroundColor: COLOR.surface, justifyContent: 'center' },
  chipOn: { backgroundColor: COLOR.brand, borderColor: COLOR.brand },
  chipTxt: { fontSize: FONT_SIZE.label, color: COLOR.ink2 },
  chipTxtOn: { color: COLOR.inkOnBrand, fontWeight: FONT_WEIGHT.semibold },

  grid: { padding: SPACE.s4, paddingBottom: 96 },
  col: { gap: SPACE.s3 },
  card: { flex: 1, backgroundColor: COLOR.surface, borderWidth: 1, borderColor: COLOR.border, borderRadius: RADIUS.r3, padding: SPACE.s3, marginBottom: SPACE.s3, ...SHADOW.sm },
  cardOos: { opacity: 0.5 },
  cardImg: { width: 60, height: 60, borderRadius: RADIUS.r2, backgroundColor: COLOR.brandTint, justifyContent: 'center', alignItems: 'center', marginBottom: SPACE.s2 },
  cardName: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold, color: COLOR.ink, minHeight: 36 },
  cardStock: { fontSize: FONT_SIZE.caption, color: COLOR.inkMute, marginTop: 2 },
  cardStockLow: { color: COLOR.expense },
  cardPrice: { fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink, marginVertical: SPACE.s2 },
  addBtn: { height: CONTROL.buttonSmH, borderRadius: RADIUS.r2, backgroundColor: COLOR.brand, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.s1 },
  addBtnDisabled: { backgroundColor: COLOR.surface2 },
  addTxt: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold, color: COLOR.inkOnBrand },
  addTxtDisabled: { color: COLOR.inkDisabled },

  stepper: { height: CONTROL.buttonSmH, backgroundColor: COLOR.brandTint, borderRadius: RADIUS.full, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.s1 },
  stepperSm: { width: 108, height: CONTROL.buttonSmH, backgroundColor: COLOR.brandTint, borderRadius: RADIUS.full, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.s1 },
  stepBtn: { width: 32, height: 32, borderRadius: RADIUS.full, justifyContent: 'center', alignItems: 'center' },
  stepN: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, color: COLOR.brandDeep },

  fab: {
    position: 'absolute', left: SPACE.s4, right: SPACE.s4, bottom: SPACE.s4, height: 58,
    backgroundColor: COLOR.brand, borderRadius: RADIUS.r4, flexDirection: 'row', alignItems: 'center',
    gap: SPACE.s3, paddingHorizontal: SPACE.s4, ...SHADOW.lg,
  },
  fabBadge: { position: 'absolute', top: -7, right: -9, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: RADIUS.full, backgroundColor: COLOR.ink, justifyContent: 'center', alignItems: 'center' },
  fabBadgeTxt: { color: COLOR.white, fontSize: 10, fontWeight: FONT_WEIGHT.bold },
  fabTxt: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, color: COLOR.inkOnBrand },
  fabArrow: { marginLeft: 'auto' },

  sheetOv: { flex: 1, justifyContent: 'flex-end', backgroundColor: COLOR.overlay },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { maxHeight: '82%', backgroundColor: COLOR.surface, borderTopLeftRadius: RADIUS.r4, borderTopRightRadius: RADIUS.r4 },
  handle: { width: 40, height: 4, borderRadius: RADIUS.full, backgroundColor: COLOR.border2, alignSelf: 'center', marginTop: SPACE.s3, marginBottom: SPACE.s2 },
  sheetHead: { flexDirection: 'row', alignItems: 'baseline', gap: SPACE.s2, paddingHorizontal: SPACE.s4, paddingBottom: SPACE.s3, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  sheetTitle: { fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink },
  turno: { fontSize: FONT_SIZE.caption, color: COLOR.inkMute },
  clear: { marginLeft: 'auto', color: COLOR.expense, fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold },
  sheetItems: { paddingHorizontal: 0 },
  cItem: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s2, padding: SPACE.s4, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  cName: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.semibold, color: COLOR.ink },
  cSub: { fontSize: FONT_SIZE.caption, color: COLOR.inkMute, marginTop: 2 },
  cAmt: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink, fontFamily: 'JetBrainsMono', minWidth: 78, textAlign: 'right' },

  sheetFoot: { borderTopWidth: 1, borderTopColor: COLOR.border, padding: SPACE.s4, backgroundColor: COLOR.surface },
  totRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totL: { fontSize: FONT_SIZE.body, color: COLOR.ink2 },
  totV: { fontSize: FONT_SIZE.body, color: COLOR.ink2, fontFamily: 'JetBrainsMono' },
  grandRow: { marginTop: SPACE.s2, paddingTop: SPACE.s3, borderTopWidth: 1, borderTopColor: COLOR.border },
  grandL: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink },
  grandV: { fontSize: 32, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink, fontFamily: 'JetBrainsMono' },

  payToggle: { flexDirection: 'row', gap: SPACE.s2, marginVertical: SPACE.s4 },
  payBtn: { flex: 1, height: 48, borderRadius: RADIUS.r2, borderWidth: 1, borderColor: COLOR.border, backgroundColor: COLOR.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.s1 },
  payBtnOn: { backgroundColor: COLOR.brand, borderColor: COLOR.brandDark },
  payTxt: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink2 },
  payTxtOn: { color: COLOR.inkOnBrand },

  confirmBtn: { height: CONTROL.buttonH, borderRadius: RADIUS.r2, backgroundColor: COLOR.income, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.s2 },
  confirmDisabled: { opacity: 0.5 },
  confirmTxt: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, color: COLOR.white },

  succOv: { flex: 1, justifyContent: 'center', backgroundColor: COLOR.overlay, padding: SPACE.s5 },
  succ: { backgroundColor: COLOR.surface, borderRadius: RADIUS.r4, padding: SPACE.s6, alignItems: 'center', ...SHADOW.lg },
  succIco: { width: 88, height: 88, borderRadius: RADIUS.full, backgroundColor: COLOR.incomeTint, justifyContent: 'center', alignItems: 'center', marginBottom: SPACE.s4 },
  succTitle: { fontSize: FONT_SIZE.h1, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink },
  succAmt: { fontSize: 32, fontWeight: FONT_WEIGHT.bold, color: COLOR.income, fontFamily: 'JetBrainsMono', marginVertical: SPACE.s2 },
  succPill: { paddingHorizontal: SPACE.s3, paddingVertical: 3, borderRadius: RADIUS.full, backgroundColor: COLOR.info },
  succPillTxt: { color: COLOR.white, fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold },
  succMeta: { fontSize: FONT_SIZE.label, color: COLOR.ink2, marginVertical: SPACE.s4 },
  succPrimary: { width: '100%', height: CONTROL.buttonH, borderRadius: RADIUS.r2, backgroundColor: COLOR.brand, justifyContent: 'center', alignItems: 'center' },
  succPrimaryTxt: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, color: COLOR.inkOnBrand },
  succOutline: { width: '100%', height: CONTROL.buttonH, borderRadius: RADIUS.r2, borderWidth: 1, borderColor: COLOR.info, justifyContent: 'center', alignItems: 'center', marginTop: SPACE.s2 },
  succOutlineTxt: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, color: COLOR.info },
});

// ─── Connected wrapper (default export) ──────────────────────────────────────
export default function POSScreen({ onMenu, onGoToHistory }: { onMenu?: () => void; onGoToHistory?: () => void } = {}) {
  const { selectedStore } = useStore();
  const { userName } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [shiftId, setShiftId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedStore) return;
    Promise.all([
      axios.get(`${REACT_APP_API_URL}/api/v2/stores/${selectedStore.id}/stock`),
      axios.get(`${REACT_APP_API_URL}/api/v2/shifts/active/${selectedStore.id}`).catch(() => ({ data: null, status: 204 })),
    ]).then(([stockRes, shiftRes]) => {
      const mapped: Product[] = (stockRes.data ?? []).map((item: any) => ({
        id:        String(item.productId),
        nombre:    item.productName,
        precio:    Number(item.price ?? 0),
        stock:     item.quantity ?? 0,
        minStock:  item.minStock ?? 0,
        categoria: item.categoryName ?? 'General',
        icon:      'food',
      })).filter((p: Product) => p.stock > 0 || true);
      setProducts(mapped);
      const cats = [...new Set(mapped.map((p: Product) => p.categoria))].filter(Boolean);
      setCategories(cats);
      if (shiftRes.data?.id) setShiftId(shiftRes.data.id);
    }).catch(console.error).finally(() => setLoading(false));
  }, [selectedStore?.id]);

  const handleCreateSale = async (lines: CartLine[], metodo: Metodo) => {
    if (!shiftId) throw new Error('No hay turno activo');
    await axios.post(`${REACT_APP_API_URL}/api/v2/shifts/${shiftId}/sales`, {
      paymentMethod: metodo,
      username: userName ?? 'unknown',
      items: lines.map(l => ({ productId: Number(l.product.id), quantity: l.cantidad })),
    });
  };

  if (loading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLOR.bg }}>
      <ActivityIndicator size="large" color={COLOR.brand} />
    </View>
  );

  return (
    <POSView
      products={products}
      categories={categories}
      storeName={selectedStore?.name ?? '—'}
      turnoId={shiftId ? String(shiftId) : '—'}
      onMenu={onMenu ?? (() => {})}
      onCreateSale={handleCreateSale}
      onGoToHistory={onGoToHistory ?? (() => {})}
    />
  );
}
