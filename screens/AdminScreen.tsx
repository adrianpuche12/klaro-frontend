// =============================================================================
// AdminScreen.tsx  ·  screens/AdminScreen.tsx
// Panel de operaciones + reportes. Refactor completo.
// MIGRACIÓN DE API: usa /api/v3/operations (+ /summary, /export) con axios del
// AuthContext. NO uses /api/operations/all ni /transactions ni fetch().
// Sin emojis, sin inline styles, sin hex. FlatList paginada (lotes de 20).
// =============================================================================
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity, Modal, ActivityIndicator,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLOR, SPACE, FONT_SIZE, FONT_WEIGHT, RADIUS, CONTROL, SHADOW } from '../theme';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { REACT_APP_API_URL } from '../config';

// ---- Tipos (ajustá a tu modelo real del backend v3) ----
type OpType = 'CLOSING' | 'SALE' | 'SUPPLIER' | 'SALARY' | 'GASTO_ADMIN' | 'TRANSACTION';
type Period = 'hoy' | 'semana' | 'mes' | 'custom';
type Sort = 'recent' | 'oldest' | 'amount_desc' | 'amount_asc';

interface Operation {
  id: string;
  type: OpType;
  storeName: string;
  user: string;
  time: string;        // "14:30"
  amount: number;      // positivo; el signo se deriva de income/expense
  hasReceipt?: boolean;
  // ...campos de desglose según tipo
  detail?: Record<string, string | number>;
}
interface Summary { totalIncome: number; totalExpense: number; totalCount: number; totalCash: number; totalCard: number; }

const INCOME_TYPES: OpType[] = ['SALE', 'CLOSING'];
const L = (n: number) => `L ${n.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const Lk = (n: number) => `L ${Math.round(n).toLocaleString('es-HN')}`;

const TYPE_META: Record<OpType, { label: string; icon: string; cls: any }> = {
  CLOSING:     { label: 'Cierre de caja',          icon: 'cash-register',  cls: 'closing' },
  SALE:        { label: 'Venta',                   icon: 'cart',           cls: 'sale' },
  SUPPLIER:    { label: 'Pago a proveedor',        icon: 'truck-delivery', cls: 'supplier' },
  SALARY:      { label: 'Salario',                 icon: 'account-cash',   cls: 'salary' },
  GASTO_ADMIN: { label: 'Gasto administrativo',    icon: 'receipt',        cls: 'gasto' },
  TRANSACTION: { label: 'Transacción',             icon: 'swap-horizontal',cls: 'sale' },
};

const TYPE_FILTERS: { key: OpType | 'ALL'; label: string; icon: string; color: string }[] = [
  { key: 'ALL', label: 'Todos', icon: 'view-list-outline', color: COLOR.ink2 },
  { key: 'CLOSING', label: 'Cierre', icon: 'cash-register', color: COLOR.income },
  { key: 'SALE', label: 'Venta', icon: 'cart-outline', color: COLOR.info },
  { key: 'SUPPLIER', label: 'Proveedor', icon: 'truck-delivery', color: COLOR.warn },
  { key: 'SALARY', label: 'Salario', icon: 'account-cash', color: COLOR.inkMute },
  { key: 'GASTO_ADMIN', label: 'Gasto', icon: 'receipt', color: COLOR.expense },
];

// Derivá un rango {from,to} ISO según el período. (Implementá con tu util de fechas real.)
function rangeFor(period: Period): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  const start = new Date(now);
  if (period === 'hoy') start.setHours(0, 0, 0, 0);
  else if (period === 'semana') start.setDate(now.getDate() - 7);
  else if (period === 'mes') start.setMonth(now.getMonth() - 1);
  return { from: start.toISOString(), to };
}

interface Props { onBack?: () => void; storeId?: string; multiStore?: boolean; }

export default function AdminScreen({ onBack, storeId, multiStore }: Props = {}) {
  useAuth(); // asegura que el interceptor de axios esté activo
  const api = { get: (url: string, cfg?: any) => axios.get(`${REACT_APP_API_URL}${url}`, cfg) };

  const [period, setPeriod] = useState<Period>('semana');
  const [type, setType] = useState<OpType | 'ALL'>('ALL');
  const [sort] = useState<Sort>('recent');
  const [filtersOpen, setFiltersOpen] = useState(true);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [ops, setOps] = useState<Operation[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [selected, setSelected] = useState<Operation | null>(null);

  const { from, to } = useMemo(() => rangeFor(period), [period]);

  // ---- Summary (KPIs) ----
  const loadSummary = useCallback(async () => {
    const res = await api.get('/api/v3/operations/summary', { params: { from, to, storeId } });
    setSummary(res.data);
  }, [api, from, to, storeId]);

  // ---- Lista paginada ----
  const loadOps = useCallback(async (nextPage: number, replace: boolean) => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await api.get('/api/v3/operations', {
        params: { from, to, type: type === 'ALL' ? undefined : type, storeId, sort, page: nextPage, size: 20 },
      });
      const items: Operation[] = res.data.content ?? res.data; // ajustá a la forma real de tu respuesta
      setOps(prev => (replace ? items : [...prev, ...items]));
      setHasMore(items.length === 20);
      setPage(nextPage);
    } finally {
      setLoading(false);
    }
  }, [api, from, to, type, storeId, sort, loading]);

  useEffect(() => { loadSummary(); loadOps(0, true); /* eslint-disable-next-line */ }, [from, to, type, storeId]);

  // ---- Export real del backend ----
  const doExport = async (format: 'PDF' | 'EXCEL' | 'CSV') => {
    setExportOpen(false);
    // El backend devuelve el archivo; abrilo/descargalo con tu util (Linking / FileSystem).
    const url = `/api/v3/operations/export?format=${format}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` +
      (type !== 'ALL' ? `&type=${type}` : '') + (storeId ? `&storeId=${storeId}` : '');
    await api.get(url, { responseType: 'blob' }); // <-- conectá tu apertura/guardado de archivo real
  };

  const balance = summary ? summary.totalIncome - summary.totalExpense : 0;

  const renderOp = ({ item }: { item: Operation }) => {
    const meta = TYPE_META[item.type];
    const income = INCOME_TYPES.includes(item.type);
    return (
      <TouchableOpacity style={styles.op} onPress={() => setSelected(item)} activeOpacity={0.7}>
        <View style={[styles.opIco, (styles as any)[`ico_${meta.cls}`]]}>
          <MaterialCommunityIcons name={meta.icon} size={20} color={iconColor(item.type)} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.opType}>{meta.label}</Text>
          <View style={styles.opMeta}>
            <MaterialCommunityIcons name="store-outline" size={12} color={COLOR.inkMute} />
            <Text style={styles.opMetaTxt}>{item.storeName}</Text>
          </View>
          <Text style={styles.opMetaTxt}>{item.user} · {item.time}</Text>
        </View>
        <View style={styles.opRight}>
          <Text style={[styles.opAmt, income ? styles.amtInc : styles.amtExp]}>
            {income ? '+' : '−'}{L(item.amount)}
          </Text>
          {item.hasReceipt && (
            <View style={styles.opCam}>
              <MaterialCommunityIcons name="camera" size={13} color={COLOR.info} />
              <Text style={styles.opCamTxt}>Comprobante</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const header = (
    <>
      {/* Filtros */}
      <View style={styles.filters}>
        <TouchableOpacity style={styles.filtersHead} onPress={() => setFiltersOpen(o => !o)}>
          <Text style={styles.filtersTitle}>Filtros</Text>
          <View style={styles.flex} />
          <Text style={styles.filtersToggle}>{filtersOpen ? 'Ocultar' : 'Mostrar'}</Text>
          <MaterialCommunityIcons name={filtersOpen ? 'chevron-up' : 'chevron-down'} size={15} color={COLOR.info} />
        </TouchableOpacity>

        {filtersOpen && (
          <>
            <Text style={styles.filtLabel}>PERÍODO</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {([['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['custom', 'Personalizado']] as [Period, string][]).map(([k, l]) => (
                <TouchableOpacity key={k} style={[styles.chip, period === k && styles.chipOn]} onPress={() => setPeriod(k)}>
                  <Text style={[styles.chipTxt, period === k && styles.chipTxtOn]}>{l}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.filtLabel}>TIPO DE OPERACIÓN</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {TYPE_FILTERS.map(t => {
                const on = type === t.key;
                return (
                  <TouchableOpacity key={t.key} style={[styles.chip, styles.typeChip, on && styles.chipOn]} onPress={() => setType(t.key)}>
                    <MaterialCommunityIcons name={t.icon} size={14} color={on ? COLOR.inkOnBrand : t.color} />
                    <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}
      </View>

      {/* KPIs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kpis}>
        <View style={styles.kpi}>
          <MaterialCommunityIcons name={balance >= 0 ? 'trending-up' : 'trending-down'} size={18} color={balance >= 0 ? COLOR.income : COLOR.expense} style={styles.kIco} />
          <Text style={styles.kLbl}>BALANCE NETO</Text>
          <Text style={[styles.kVal, balance >= 0 ? styles.kInc : styles.kExp]}>{summary ? `${balance >= 0 ? '+' : '−'}${Lk(Math.abs(balance))}` : '—'}</Text>
          <Text style={styles.kSub}>{periodLabel(period)}</Text>
        </View>
        <View style={styles.kpi}>
          <MaterialCommunityIcons name="arrow-down-circle-outline" size={18} color={COLOR.income} style={styles.kIco} />
          <Text style={styles.kLbl}>INGRESOS</Text>
          <Text style={[styles.kVal, styles.kInc]}>{summary ? Lk(summary.totalIncome) : '—'}</Text>
        </View>
        <View style={styles.kpi}>
          <MaterialCommunityIcons name="arrow-up-circle-outline" size={18} color={COLOR.expense} style={styles.kIco} />
          <Text style={styles.kLbl}>EGRESOS</Text>
          <Text style={[styles.kVal, styles.kExp]}>{summary ? Lk(summary.totalExpense) : '—'}</Text>
        </View>
        <View style={styles.kpi}>
          <MaterialCommunityIcons name="file-document-outline" size={18} color={COLOR.info} style={styles.kIco} />
          <Text style={styles.kLbl}>OPERACIONES</Text>
          <Text style={[styles.kVal, styles.kInk]}>{summary ? String(summary.totalCount) : '—'}</Text>
          <Text style={styles.kSub}>{periodLabel(period)}</Text>
        </View>
      </ScrollView>

      <Text style={styles.listHead}>{summary ? `${summary.totalCount} operaciones` : 'Cargando…'}</Text>
    </>
  );

  return (
    <View style={styles.container}>
      <View style={styles.appbar}>
        <TouchableOpacity style={styles.iconBtn} onPress={onBack}>
          <MaterialCommunityIcons name="chevron-left" size={24} color={COLOR.ink} />
        </TouchableOpacity>
        <Text style={styles.appbarTitle}>Operaciones</Text>
        <TouchableOpacity style={styles.exportBtn} onPress={() => setExportOpen(true)}>
          <MaterialCommunityIcons name="download-outline" size={16} color={COLOR.info} />
          <Text style={styles.exportTxt}>Exportar</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={ops}
        renderItem={renderOp}
        keyExtractor={item => item.id}
        ListHeaderComponent={header}
        onEndReachedThreshold={0.4}
        onEndReached={() => { if (hasMore && !loading) loadOps(page + 1, false); }}
        ListFooterComponent={loading ? <ActivityIndicator color={COLOR.brand} style={styles.footSpin} /> : null}
        ListEmptyComponent={!loading ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="file-search-outline" size={64} color={COLOR.inkMute} />
            <Text style={styles.emptyTxt}>Sin operaciones en este período</Text>
          </View>
        ) : null}
      />

      {/* Bottom sheet de export */}
      <Modal transparent visible={exportOpen} animationType="slide" onRequestClose={() => setExportOpen(false)}>
        <View style={styles.sheetOv}>
          <TouchableOpacity style={styles.sheetBackdrop} onPress={() => setExportOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Exportar reporte</Text>
            <ExportRow icon="file-pdf-box" color={COLOR.expense} name="PDF" sub="Reporte completo con formato" onPress={() => doExport('PDF')} />
            <ExportRow icon="microsoft-excel" color={COLOR.income} name="Excel" sub="Planilla editable (.xlsx)" onPress={() => doExport('EXCEL')} />
            <ExportRow icon="file-delimited-outline" color={COLOR.info} name="CSV" sub="Datos separados por comas" onPress={() => doExport('CSV')} />
          </View>
        </View>
      </Modal>

      {/* Modal de desglose */}
      <BreakdownModal op={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

function iconColor(t: OpType): string {
  switch (t) {
    case 'CLOSING': return COLOR.income;
    case 'SALE': case 'TRANSACTION': return COLOR.info;
    case 'SUPPLIER': return COLOR.warn;
    case 'SALARY': return COLOR.inkMute;
    case 'GASTO_ADMIN': return COLOR.expense;
  }
}
function periodLabel(p: Period) { return p === 'hoy' ? 'Hoy' : p === 'semana' ? 'Esta semana' : p === 'mes' ? 'Este mes' : 'Personalizado'; }

function ExportRow({ icon, color, name, sub, onPress }: { icon: string; color: string; name: string; sub: string; onPress: () => void; }) {
  return (
    <TouchableOpacity style={styles.expRow} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={24} color={color} />
      <View style={styles.flex}><Text style={styles.expName}>{name}</Text><Text style={styles.expSub}>{sub}</Text></View>
      <MaterialCommunityIcons name="chevron-right" size={18} color={COLOR.inkMute} />
    </TouchableOpacity>
  );
}

function BreakdownModal({ op, onClose }: { op: Operation | null; onClose: () => void; }) {
  if (!op) return null;
  const meta = TYPE_META[op.type];
  const detail = op.detail ?? {};
  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetOv}>
        <TouchableOpacity style={styles.sheetBackdrop} onPress={onClose} />
        <View style={[styles.sheet, styles.bdSheet]}>
          <View style={styles.handle} />
          <View style={styles.bdHead}>
            <View style={styles.flex}>
              <Text style={styles.bdTitle}>{meta.label}</Text>
              {detail.ref ? <Text style={styles.bdSub}>{String(detail.ref)}</Text> : null}
            </View>
            <TouchableOpacity style={styles.bdX} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={16} color={COLOR.ink2} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.bdBody}>
            {Object.entries(detail).filter(([k]) => k !== 'ref').map(([k, v]) => (
              <View key={k} style={styles.bdRow}>
                <Text style={styles.bdL}>{k}</Text>
                <Text style={styles.bdV}>{String(v)}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.bg },
  flex: { flex: 1 },

  appbar: { height: 56, flexDirection: 'row', alignItems: 'center', gap: SPACE.s2, paddingHorizontal: SPACE.s3, backgroundColor: COLOR.surface, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  iconBtn: { width: 40, height: 40, borderRadius: RADIUS.full, justifyContent: 'center', alignItems: 'center' },
  appbarTitle: { flex: 1, fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s1, height: CONTROL.buttonSmH, paddingHorizontal: SPACE.s3, borderRadius: RADIUS.r2, borderWidth: 1, borderColor: COLOR.info },
  exportTxt: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold, color: COLOR.info },

  filters: { paddingVertical: SPACE.s3, borderBottomWidth: 1, borderBottomColor: COLOR.border, backgroundColor: COLOR.surface },
  filtersHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.s4, paddingBottom: SPACE.s2 },
  filtersTitle: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink },
  filtersToggle: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold, color: COLOR.info, marginRight: 4 },
  filtLabel: { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.semibold, color: COLOR.inkMute, paddingHorizontal: SPACE.s4, paddingTop: SPACE.s2, paddingBottom: 4, letterSpacing: 0.4 },

  chips: { gap: SPACE.s2, paddingHorizontal: SPACE.s4 },
  chip: { height: CONTROL.chipH, paddingHorizontal: SPACE.s3, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLOR.border, backgroundColor: COLOR.surface, justifyContent: 'center' },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s1 },
  chipOn: { backgroundColor: COLOR.brand, borderColor: COLOR.brand },
  chipTxt: { fontSize: FONT_SIZE.label, color: COLOR.ink2 },
  chipTxtOn: { color: COLOR.inkOnBrand, fontWeight: FONT_WEIGHT.semibold },

  kpis: { gap: SPACE.s3, padding: SPACE.s4 },
  kpi: { minWidth: 138, backgroundColor: COLOR.surface, borderWidth: 1, borderColor: COLOR.border, borderRadius: RADIUS.r3, padding: SPACE.s4, ...SHADOW.sm },
  kIco: { position: 'absolute', top: SPACE.s3, right: SPACE.s3 },
  kLbl: { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.semibold, color: COLOR.inkMute, letterSpacing: 0.5 },
  kVal: { fontSize: FONT_SIZE.amount, fontWeight: FONT_WEIGHT.bold, fontFamily: 'JetBrainsMono', marginTop: SPACE.s2 },
  kSub: { fontSize: FONT_SIZE.caption, color: COLOR.inkMute, marginTop: 2 },
  kInc: { color: COLOR.income }, kExp: { color: COLOR.expense }, kInk: { color: COLOR.ink },

  listHead: { fontSize: FONT_SIZE.label, color: COLOR.ink2, paddingHorizontal: SPACE.s4, paddingVertical: SPACE.s2 },

  op: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.s3, padding: SPACE.s4, backgroundColor: COLOR.surface, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  opIco: { width: 40, height: 40, borderRadius: RADIUS.full, justifyContent: 'center', alignItems: 'center' },
  ico_closing: { backgroundColor: COLOR.incomeTint },
  ico_sale: { backgroundColor: COLOR.infoTint },
  ico_supplier: { backgroundColor: COLOR.warnTint },
  ico_salary: { backgroundColor: COLOR.surface2 },
  ico_gasto: { backgroundColor: COLOR.expenseTint },
  opType: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.semibold, color: COLOR.ink },
  opMeta: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s1, marginTop: 3 },
  opMetaTxt: { fontSize: FONT_SIZE.caption, color: COLOR.inkMute },
  opRight: { alignItems: 'flex-end' },
  opAmt: { fontSize: FONT_SIZE.amount, fontWeight: FONT_WEIGHT.bold, fontFamily: 'JetBrainsMono' },
  amtInc: { color: COLOR.income }, amtExp: { color: COLOR.expense },
  opCam: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  opCamTxt: { fontSize: FONT_SIZE.caption, color: COLOR.info },

  footSpin: { paddingVertical: SPACE.s5 },
  empty: { paddingVertical: SPACE.s8, alignItems: 'center' },
  emptyTxt: { fontSize: FONT_SIZE.h3, color: COLOR.inkMute, marginTop: SPACE.s3 },

  // sheets
  sheetOv: { flex: 1, justifyContent: 'flex-end', backgroundColor: COLOR.overlay },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { backgroundColor: COLOR.surface, borderTopLeftRadius: RADIUS.r4, borderTopRightRadius: RADIUS.r4, paddingBottom: SPACE.s5 },
  bdSheet: { maxHeight: '80%' },
  handle: { width: 40, height: 4, borderRadius: RADIUS.full, backgroundColor: COLOR.border2, alignSelf: 'center', marginTop: SPACE.s3, marginBottom: SPACE.s3 },
  sheetTitle: { fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink, paddingHorizontal: SPACE.s4, paddingBottom: SPACE.s3 },

  expRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s4, paddingVertical: SPACE.s4, paddingHorizontal: SPACE.s4, borderTopWidth: 1, borderTopColor: COLOR.border },
  expName: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.semibold, color: COLOR.ink },
  expSub: { fontSize: FONT_SIZE.caption, color: COLOR.inkMute },

  bdHead: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: SPACE.s4, paddingBottom: SPACE.s3 },
  bdTitle: { fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink },
  bdSub: { fontSize: FONT_SIZE.caption, color: COLOR.inkMute, fontFamily: 'JetBrainsMono', marginTop: 2 },
  bdX: { width: 32, height: 32, borderRadius: RADIUS.full, backgroundColor: COLOR.surface2, justifyContent: 'center', alignItems: 'center' },
  bdBody: { paddingHorizontal: SPACE.s4 },
  bdRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  bdL: { fontSize: FONT_SIZE.label, color: COLOR.inkMute },
  bdV: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.medium, color: COLOR.ink },
});
