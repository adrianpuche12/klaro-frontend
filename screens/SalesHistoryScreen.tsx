// =============================================================================
// SalesHistoryScreen.tsx  ·  screens/SalesHistoryScreen.tsx
// Historial de ventas con filtros de período, resumen, filas expandibles.
// Sin emojis, sin inline styles, sin hex. FlatList con keyExtractor.
// Reemplazá los tipos/datos genéricos por tu modelo real SIN cambiar la lógica.
// =============================================================================
import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, ScrollView,
  TouchableOpacity, LayoutAnimation, Platform, UIManager, ActivityIndicator,
} from 'react-native';
import axios from 'axios';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLOR, SPACE, FONT_SIZE, FONT_WEIGHT, RADIUS, CONTROL, SHADOW } from '../theme';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { REACT_APP_API_URL } from '../config';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Period = 'turno' | 'hoy' | 'semana' | 'mes';
type Metodo = 'efectivo' | 'tarjeta';
type Estado = 'activa' | 'cancelada';

interface SaleItem { nombre: string; cantidad: number; precioUnit: number; }
interface Sale {
  id: string;            // V-20260602-0047
  hora: string;          // "14:30"
  metodo: Metodo;
  estado: Estado;
  usuario: string;
  local: string;
  total: number;
  subtotal: number;
  impuesto: number;
  items: SaleItem[];
  resumenProductos: string; // "Pollo entero ×2, Refresco ×2"
}

interface Summary { total: number; cantidad: number; efectivo: number; tarjeta: number; }

const PERIODS: { key: Period; label: string }[] = [
  { key: 'turno', label: 'Turno actual' },
  { key: 'hoy', label: 'Hoy' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'mes', label: 'Este mes' },
];

const L = (n: number) => `L ${n.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  sales: Sale[];
  summary: Summary;
  isAdmin: boolean;
  onBack: () => void;
  onLoadMore?: () => void;
  onCancelSale?: (saleId: string) => void;
  hasMore?: boolean;
}

function SalesHistoryView({
  sales, summary, isAdmin, onBack, onLoadMore, onCancelSale, hasMore,
}: Props) {
  const [period, setPeriod] = useState<Period>('turno');
  const [openId, setOpenId] = useState<string | null>(sales[0]?.id ?? null);

  const toggle = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenId(prev => (prev === id ? null : id));
  };

  const header = useMemo(() => (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {PERIODS.map(p => (
          <TouchableOpacity
            key={p.key}
            style={[styles.chip, period === p.key && styles.chipOn]}
            onPress={() => setPeriod(p.key)}
          >
            <Text style={[styles.chipTxt, period === p.key && styles.chipTxtOn]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.summary}>
        <Text style={styles.sumLbl}>RESUMEN DEL PERÍODO</Text>
        <Text style={styles.sumAmt}>{L(summary.total)}</Text>
        <Text style={styles.sumSub}>en {summary.cantidad} ventas</Text>
        <View style={styles.split}>
          <View style={styles.splitItem}>
            <MaterialCommunityIcons name="cash" size={14} color={COLOR.inkMute} />
            <Text style={styles.splitTxt}>Efectivo {L(summary.efectivo)}</Text>
          </View>
          <View style={styles.splitItem}>
            <MaterialCommunityIcons name="credit-card-outline" size={14} color={COLOR.inkMute} />
            <Text style={styles.splitTxt}>Tarjeta {L(summary.tarjeta)}</Text>
          </View>
        </View>
      </View>
    </>
  ), [period, summary]);

  const renderItem = ({ item }: { item: Sale }) => {
    const open = openId === item.id;
    const cancelada = item.estado === 'cancelada';
    return (
      <View style={styles.sale}>
        <TouchableOpacity activeOpacity={0.7} style={styles.saleHead} onPress={() => toggle(item.id)}>
          <View style={styles.l1}>
            <Text style={styles.time}>{item.hora}</Text>
            <View style={styles.pillPay}>
              <MaterialCommunityIcons name={item.metodo === 'efectivo' ? 'cash' : 'credit-card-outline'} size={13} color={COLOR.info} />
              <Text style={styles.pillPayTxt}>{item.metodo === 'efectivo' ? 'EFECTIVO' : 'TARJETA'}</Text>
            </View>
            <View style={[styles.pillState, cancelada ? styles.pillCancel : styles.pillActive]}>
              <Text style={cancelada ? styles.pillCancelTxt : styles.pillActiveTxt}>
                {cancelada ? 'CANCELADA' : 'ACTIVA'}
              </Text>
            </View>
          </View>

          <View style={styles.l2}>
            <View style={styles.who}>
              <MaterialCommunityIcons name="account-outline" size={12} color={COLOR.inkMute} />
              <Text style={styles.whoTxt}>{item.usuario}</Text>
            </View>
            <View style={styles.who}>
              <MaterialCommunityIcons name="store-outline" size={12} color={COLOR.inkMute} />
              <Text style={styles.whoTxt}>{item.local}</Text>
            </View>
            <Text style={[styles.amt, cancelada && styles.amtCancel]}>{L(item.total)}</Text>
          </View>

          <Text style={styles.prods} numberOfLines={1}>{item.resumenProductos}</Text>
        </TouchableOpacity>

        {open && (
          <View style={styles.detail}>
            <Text style={styles.detailId}>DETALLE DE VENTA #{item.id}</Text>
            {item.items.map((it, i) => (
              <View key={i} style={styles.ditem}>
                <Text style={styles.dName}>{it.nombre}</Text>
                <Text style={styles.dQty}>×{it.cantidad} · {L(it.precioUnit)}</Text>
                <Text style={styles.dSt}>{L(it.cantidad * it.precioUnit)}</Text>
              </View>
            ))}
            <View style={styles.dsep} />
            <View style={styles.dtot}><Text style={styles.dtotL}>Subtotal</Text><Text style={styles.dtotV}>{L(item.subtotal)}</Text></View>
            <View style={styles.dtot}><Text style={styles.dtotL}>ISV 15%</Text><Text style={styles.dtotV}>{L(item.impuesto)}</Text></View>
            <View style={styles.dtot}><Text style={styles.grandL}>Total</Text><Text style={styles.grandV}>{L(item.total)}</Text></View>
            {isAdmin && !cancelada && (
              <TouchableOpacity style={styles.cancelBtn} onPress={() => onCancelSale?.(item.id)}>
                <Text style={styles.cancelTxt}>Cancelar venta</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.appbar}>
        <TouchableOpacity style={styles.back} onPress={onBack}>
          <MaterialCommunityIcons name="chevron-left" size={24} color={COLOR.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>Historial de ventas</Text>
      </View>

      <FlatList
        data={sales}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        ListHeaderComponent={header}
        ListFooterComponent={
          hasMore ? (
            <TouchableOpacity style={styles.loadMore} onPress={onLoadMore}>
              <Text style={styles.loadMoreTxt}>Cargar más</Text>
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="receipt-text-outline" size={64} color={COLOR.inkMute} />
            <Text style={styles.emptyTxt}>Sin ventas en este período</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.bg },

  appbar: {
    height: 56, flexDirection: 'row', alignItems: 'center', gap: SPACE.s2,
    paddingHorizontal: SPACE.s3, backgroundColor: COLOR.surface,
    borderBottomWidth: 1, borderBottomColor: COLOR.border,
  },
  back: { width: 40, height: 40, borderRadius: RADIUS.full, justifyContent: 'center', alignItems: 'center' },
  title: { flex: 1, fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink },

  chips: { gap: SPACE.s2, paddingHorizontal: SPACE.s4, paddingVertical: SPACE.s3 },
  chip: {
    height: CONTROL.chipH, paddingHorizontal: SPACE.s4, borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: COLOR.border, backgroundColor: COLOR.surface, justifyContent: 'center',
  },
  chipOn: { backgroundColor: COLOR.brand, borderColor: COLOR.brand },
  chipTxt: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold, color: COLOR.ink2 },
  chipTxtOn: { color: COLOR.inkOnBrand },

  summary: {
    marginHorizontal: SPACE.s4, marginBottom: SPACE.s3,
    backgroundColor: COLOR.surface, borderWidth: 1, borderColor: COLOR.border,
    borderLeftWidth: 4, borderLeftColor: COLOR.income, borderRadius: RADIUS.r3,
    padding: SPACE.s4, ...SHADOW.sm,
  },
  sumLbl: { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.semibold, color: COLOR.inkMute, letterSpacing: 0.5 },
  sumAmt: { fontSize: 34, fontWeight: FONT_WEIGHT.bold, color: COLOR.income, fontFamily: 'JetBrainsMono', marginTop: SPACE.s1 },
  sumSub: { fontSize: FONT_SIZE.label, color: COLOR.ink2 },
  split: { flexDirection: 'row', gap: SPACE.s4, marginTop: SPACE.s3, paddingTop: SPACE.s3, borderTopWidth: 1, borderTopColor: COLOR.border },
  splitItem: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s1 },
  splitTxt: { fontSize: FONT_SIZE.caption, color: COLOR.ink2 },

  sale: { backgroundColor: COLOR.surface, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  saleHead: { padding: SPACE.s4 },
  l1: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s2 },
  time: { fontSize: FONT_SIZE.label, color: COLOR.inkMute, fontFamily: 'JetBrainsMono' },
  pillPay: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s1, paddingVertical: 2, paddingHorizontal: SPACE.s2, borderRadius: RADIUS.full, backgroundColor: COLOR.infoTint },
  pillPayTxt: { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.semibold, color: COLOR.info },
  pillState: { marginLeft: 'auto', paddingVertical: 2, paddingHorizontal: SPACE.s2, borderRadius: RADIUS.full },
  pillActive: { backgroundColor: COLOR.incomeTint },
  pillCancel: { backgroundColor: COLOR.expenseTint },
  pillActiveTxt: { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.semibold, color: COLOR.income },
  pillCancelTxt: { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.semibold, color: COLOR.expense },

  l2: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s4, marginTop: SPACE.s2 },
  who: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s1 },
  whoTxt: { fontSize: FONT_SIZE.caption, color: COLOR.inkMute },
  amt: { marginLeft: 'auto', fontSize: FONT_SIZE.amount, fontWeight: FONT_WEIGHT.bold, color: COLOR.income, fontFamily: 'JetBrainsMono' },
  amtCancel: { color: COLOR.inkMute, textDecorationLine: 'line-through' },
  prods: { fontSize: FONT_SIZE.caption, color: COLOR.inkMute, marginTop: SPACE.s2 },

  detail: { backgroundColor: COLOR.bg, padding: SPACE.s4, borderTopWidth: 1, borderTopColor: COLOR.border },
  detailId: { fontSize: FONT_SIZE.caption, color: COLOR.inkMute, fontFamily: 'JetBrainsMono', marginBottom: SPACE.s3 },
  ditem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: SPACE.s2 },
  dName: { flex: 1, fontSize: FONT_SIZE.label, color: COLOR.ink },
  dQty: { fontSize: FONT_SIZE.label, color: COLOR.inkMute, fontFamily: 'JetBrainsMono' },
  dSt: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold, color: COLOR.ink, fontFamily: 'JetBrainsMono', minWidth: 74, textAlign: 'right' },
  dsep: { height: 1, backgroundColor: COLOR.border2, marginVertical: SPACE.s2 },
  dtot: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  dtotL: { fontSize: FONT_SIZE.label, color: COLOR.ink2 },
  dtotV: { fontSize: FONT_SIZE.label, color: COLOR.ink2, fontFamily: 'JetBrainsMono' },
  grandL: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink },
  grandV: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink, fontFamily: 'JetBrainsMono' },
  cancelBtn: {
    marginTop: SPACE.s3, height: CONTROL.buttonSmH, borderRadius: RADIUS.r2,
    borderWidth: 1, borderColor: COLOR.expense, justifyContent: 'center', alignItems: 'center',
  },
  cancelTxt: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold, color: COLOR.expense },

  loadMore: {
    alignSelf: 'center', marginVertical: SPACE.s4, paddingVertical: SPACE.s2, paddingHorizontal: SPACE.s5,
    borderRadius: RADIUS.r2, borderWidth: 1, borderColor: COLOR.border2, backgroundColor: COLOR.surface,
  },
  loadMoreTxt: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold, color: COLOR.ink2 },

  empty: { paddingVertical: SPACE.s8, alignItems: 'center' },
  emptyTxt: { fontSize: FONT_SIZE.h3, color: COLOR.inkMute, marginTop: SPACE.s3 },
});

// ─── Connected wrapper (default export) ──────────────────────────────────────
// Obtiene el turno activo y sus ventas del backend. Pasa datos al componente puro.

function formatHora(dt: string | undefined): string {
  if (!dt) return '—';
  try { return new Date(dt).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
}

export default function SalesHistoryScreen() {
  const { selectedStore } = useStore();
  const { roles, userName } = useAuth();
  const isAdmin = roles.includes('admin') || roles.includes('root');

  const [sales, setSales]     = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [shiftId, setShiftId] = useState<number | null>(null);

  const summary: Summary = useMemo(() => {
    const total    = sales.filter(s => s.estado === 'activa').reduce((a, s) => a + s.total, 0);
    const efectivo = sales.filter(s => s.estado === 'activa' && s.metodo === 'efectivo').reduce((a, s) => a + s.total, 0);
    const tarjeta  = sales.filter(s => s.estado === 'activa' && s.metodo === 'tarjeta').reduce((a, s) => a + s.total, 0);
    return { total, cantidad: sales.filter(s => s.estado === 'activa').length, efectivo, tarjeta };
  }, [sales]);

  const fetchSales = async () => {
    if (!selectedStore) return;
    setLoading(true);
    try {
      // 1. Turno activo del local
      const shiftRes = await axios.get(
        `${REACT_APP_API_URL}/api/v2/shifts/active/${selectedStore.id}`,
      );
      if (shiftRes.status === 204 || !shiftRes.data?.id) {
        setSales([]); setLoading(false); return;
      }
      const sid: number = shiftRes.data.id;
      setShiftId(sid);

      // 2. Ventas del turno
      const { data } = await axios.get(`${REACT_APP_API_URL}/api/v2/shifts/${sid}/sales`);
      const mapped: Sale[] = data.map((s: any) => ({
        id:               String(s.id),
        hora:             formatHora(s.createdAt),
        metodo:           (s.paymentMethod ?? 'efectivo').toLowerCase() === 'tarjeta' ? 'tarjeta' : 'efectivo',
        estado:           (s.status ?? 'ACTIVE').toUpperCase() === 'CANCELLED' ? 'cancelada' : 'activa',
        usuario:          s.username ?? '—',
        local:            s.storeName ?? selectedStore.name,
        total:            Number(s.total ?? 0),
        subtotal:         Number(s.subtotal ?? 0),
        impuesto:         Number(s.isv ?? 0),
        items:            (s.items ?? []).map((it: any) => ({
          nombre:     it.productName ?? it.nombre ?? '—',
          cantidad:   it.quantity ?? it.cantidad ?? 1,
          precioUnit: Number(it.unitPrice ?? it.precio ?? 0),
        })),
        resumenProductos: (s.items ?? [])
          .map((it: any) => `${it.productName ?? it.nombre} ×${it.quantity ?? it.cantidad}`)
          .join(', '),
      }));
      setSales(mapped);
    } catch (e) {
      console.error('[SalesHistoryScreen] fetch error', e);
      setSales([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSales(); }, [selectedStore?.id]);

  const handleCancel = async (saleId: string) => {
    try {
      await axios.delete(`${REACT_APP_API_URL}/api/v2/sales/${saleId}`);
      fetchSales();
    } catch (e) {
      console.error('[SalesHistoryScreen] cancel error', e);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLOR.bg }}>
        <ActivityIndicator size="large" color={COLOR.brand} />
      </View>
    );
  }

  return (
    <SalesHistoryView
      sales={sales}
      summary={summary}
      isAdmin={isAdmin}
      onBack={() => {}}
      onCancelSale={handleCancel}
      hasMore={false}
    />
  );
}
