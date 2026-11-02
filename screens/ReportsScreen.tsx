import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLOR, SPACE, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOW } from '../theme';
import { useStore, Store } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { companyToday, formatDate } from '../utils/format';
import { downloadReport, ReportFormat } from '../utils/downloadReport';

/**
 * Informes descargables (PDF, Excel, CSV) — etapa 7 del análisis crítico.
 *
 * Cada informe declara el módulo que lo habilita; la pantalla solo muestra los que el usuario
 * puede pedir, y el backend vuelve a validar (permiso + local + alcance del cajero).
 * Con `store` (pantalla del cajero) el local queda fijo y el informe trae solo sus ventas.
 */
type ReportDef = {
  key: string;
  title: string;
  description: string;
  icon: string;
  path: string;
  modules: string[];
  file: string;
  /** El informe de operaciones no se puede pedir para "todos los locales" con locales acotados. */
};

const REPORTS: ReportDef[] = [
  {
    key: 'sales', title: 'Ventas', icon: 'receipt',
    description: 'Cada venta con fecha y hora, turno, cajero, medio de pago, impuestos y total. Totales en efectivo y tarjeta.',
    path: '/api/v3/reports/sales', modules: ['SALES_HISTORY'], file: 'ventas',
  },
  {
    key: 'products', title: 'Productos vendidos', icon: 'trophy-outline',
    description: 'Cantidad e importe por producto, de mayor a menor (los más vendidos primero).',
    path: '/api/v3/reports/products-sold', modules: ['SALES_HISTORY'], file: 'productos-vendidos',
  },
  {
    key: 'operations', title: 'Operaciones', icon: 'clipboard-text-outline',
    description: 'Cierres, pagos a proveedores, sueldos, gastos, transacciones y depósitos, con totales por tipo.',
    path: '/api/v3/operations/export', modules: ['OPERATIONS'], file: 'operaciones',
  },
];

const FORMATS: { key: ReportFormat; label: string; icon: string }[] = [
  { key: 'PDF', label: 'PDF', icon: 'file-pdf-box' },
  { key: 'EXCEL', label: 'Excel', icon: 'file-excel-box' },
  { key: 'CSV', label: 'CSV', icon: 'file-delimited-outline' },
];

/** "yyyy-mm-dd" ± días, sobre fechas de calendario (sin zonas horarias). */
const addDays = (ymd: string, days: number): string => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
};
const firstOfMonth = (ymd: string) => ymd.slice(0, 8) + '01';
const prevMonthRange = (ymd: string): [string, string] => {
  const end = addDays(firstOfMonth(ymd), -1);
  return [firstOfMonth(end), end];
};
const VALID_YMD = /^\d{4}-\d{2}-\d{2}$/;

type Preset = 'today' | 'week' | 'month' | 'prevMonth' | 'custom';

export default function ReportsScreen({ store: fixedStore }: { store?: Store | null }) {
  const { roles, permissions } = useAuth();
  const { stores } = useStore();
  const isRoot = roles.includes('root');
  const fullAccess = isRoot || permissions === null;

  const today = companyToday();
  const [preset, setPreset] = useState<Preset>('month');
  const [from, setFrom] = useState(firstOfMonth(today));
  const [to, setTo] = useState(today);
  const [storeId, setStoreId] = useState<number | null>(fixedStore?.id ?? stores[0]?.id ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const visibleReports = useMemo(
    () => REPORTS.filter(r => fullAccess || r.modules.some(m => (permissions ?? []).includes(m))),
    [fullAccess, permissions],
  );

  const applyPreset = (p: Preset) => {
    setPreset(p);
    setMessage(null);
    if (p === 'today') { setFrom(today); setTo(today); }
    if (p === 'week') { setFrom(addDays(today, -6)); setTo(today); }
    if (p === 'month') { setFrom(firstOfMonth(today)); setTo(today); }
    if (p === 'prevMonth') { const [a, b] = prevMonthRange(today); setFrom(a); setTo(b); }
  };

  const rangeError =
    !VALID_YMD.test(from) || !VALID_YMD.test(to) ? 'Usá el formato AAAA-MM-DD.'
      : from > to ? 'La fecha "desde" es posterior a "hasta".'
        : null;
  const storeError = !fixedStore && storeId === null && !fullAccess ? 'Elegí un local.' : null;

  const download = async (r: ReportDef, format: ReportFormat) => {
    if (rangeError || storeError || busy) return;
    const id = `${r.key}-${format}`;
    setBusy(id);
    setMessage(null);
    try {
      await downloadReport(r.path, { storeId: storeId ?? undefined, from, to }, format, `${r.file}-${from}-al-${to}`);
      setMessage({ kind: 'ok', text: `${r.title}: informe generado.` });
    } catch (e: any) {
      setMessage({ kind: 'error', text: e?.message ?? 'No se pudo generar el informe.' });
    } finally {
      setBusy(null);
    }
  };

  if (visibleReports.length === 0) {
    return (
      <View style={styles.empty}>
        <MaterialCommunityIcons name="file-lock-outline" size={40} color={COLOR.inkDisabled} />
        <Text style={styles.emptyText}>Tu rol no tiene informes habilitados.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Informes</Text>
      <Text style={styles.subtitle}>Elegí el período y el local, y descargá en PDF, Excel o CSV.</Text>

      {/* Período */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Período</Text>
        <View style={styles.chips}>
          {([['today', 'Hoy'], ['week', 'Últimos 7 días'], ['month', 'Este mes'], ['prevMonth', 'Mes anterior'], ['custom', 'Otro']] as [Preset, string][])
            .map(([k, label]) => (
              <TouchableOpacity key={k} style={[styles.chip, preset === k && styles.chipOn]} onPress={() => applyPreset(k)}
                accessibilityRole="button" accessibilityState={{ selected: preset === k }}>
                <Text style={[styles.chipText, preset === k && styles.chipTextOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
        </View>
        {preset === 'custom' ? (
          <View style={styles.dates}>
            <View style={styles.dateField}>
              <Text style={styles.label}>Desde</Text>
              <TextInput style={styles.input} value={from} onChangeText={setFrom} placeholder="AAAA-MM-DD" maxLength={10} />
            </View>
            <View style={styles.dateField}>
              <Text style={styles.label}>Hasta</Text>
              <TextInput style={styles.input} value={to} onChangeText={setTo} placeholder="AAAA-MM-DD" maxLength={10} />
            </View>
          </View>
        ) : (
          <Text style={styles.rangeText}>{formatDate(from)} al {formatDate(to)}</Text>
        )}
        {!!rangeError && <Text style={styles.error}>{rangeError}</Text>}
      </View>

      {/* Local */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Local</Text>
        {fixedStore ? (
          <Text style={styles.rangeText}>{fixedStore.name} · solo tus ventas</Text>
        ) : (
          <View style={styles.chips}>
            {fullAccess && (
              <TouchableOpacity style={[styles.chip, storeId === null && styles.chipOn]} onPress={() => setStoreId(null)}>
                <Text style={[styles.chipText, storeId === null && styles.chipTextOn]}>Todos los locales</Text>
              </TouchableOpacity>
            )}
            {stores.map(s => (
              <TouchableOpacity key={s.id} style={[styles.chip, storeId === s.id && styles.chipOn]} onPress={() => setStoreId(s.id)}>
                <Text style={[styles.chipText, storeId === s.id && styles.chipTextOn]}>{s.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {!!storeError && <Text style={styles.error}>{storeError}</Text>}
      </View>

      {!!message && (
        <View style={[styles.banner, message.kind === 'error' ? styles.bannerError : styles.bannerOk]}>
          <MaterialCommunityIcons name={message.kind === 'error' ? 'alert-circle-outline' : 'check-circle-outline'} size={18}
            color={message.kind === 'error' ? COLOR.expense : COLOR.income} />
          <Text style={styles.bannerText}>{message.text}</Text>
        </View>
      )}

      {/* Informes */}
      {visibleReports.map(r => (
        <View key={r.key} style={styles.card}>
          <View style={styles.reportHead}>
            <MaterialCommunityIcons name={r.icon} size={22} color={COLOR.brandDark} />
            <Text style={styles.reportTitle}>{r.title}</Text>
          </View>
          <Text style={styles.reportDesc}>{r.description}</Text>
          <View style={styles.formats}>
            {FORMATS.map(f => {
              const id = `${r.key}-${f.key}`;
              const disabled = !!rangeError || !!storeError || (!!busy && busy !== id);
              return (
                <TouchableOpacity key={f.key} style={[styles.formatBtn, disabled && styles.formatBtnDisabled]}
                  onPress={() => download(r, f.key)} disabled={disabled || busy === id}
                  accessibilityRole="button" accessibilityLabel={`Descargar ${r.title} en ${f.label}`}>
                  {busy === id
                    ? <ActivityIndicator size="small" color={COLOR.ink} />
                    : <MaterialCommunityIcons name={f.icon} size={18} color={COLOR.ink} />}
                  <Text style={styles.formatText}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR.bg },
  content: { padding: SPACE.s4, gap: SPACE.s3, maxWidth: 900, width: '100%', alignSelf: 'center' },
  title: { fontSize: FONT_SIZE.h2, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  subtitle: { fontSize: FONT_SIZE.label, color: COLOR.inkMute, marginBottom: SPACE.s2 },
  card: {
    backgroundColor: COLOR.surface, borderRadius: RADIUS.r3, borderWidth: 1, borderColor: COLOR.border,
    padding: SPACE.s4, gap: SPACE.s2, ...SHADOW.sm,
  },
  cardTitle: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s2 },
  chip: {
    paddingHorizontal: SPACE.s3, paddingVertical: SPACE.s2, borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: COLOR.border, backgroundColor: COLOR.surface, minHeight: 36, justifyContent: 'center',
  },
  chipOn: { backgroundColor: COLOR.brand, borderColor: COLOR.brand },
  chipText: { fontSize: FONT_SIZE.label, color: COLOR.ink },
  chipTextOn: { color: COLOR.inkOnBrand, fontWeight: FONT_WEIGHT.semibold as any },
  dates: { flexDirection: 'row', gap: SPACE.s3, flexWrap: 'wrap' },
  dateField: { flexGrow: 1, minWidth: 140, gap: 4 },
  label: { fontSize: FONT_SIZE.caption, color: COLOR.inkMute },
  input: {
    borderWidth: 1, borderColor: COLOR.border, borderRadius: RADIUS.r2, paddingHorizontal: SPACE.s3,
    paddingVertical: SPACE.s2, fontSize: FONT_SIZE.body, color: COLOR.ink, backgroundColor: COLOR.surface,
  },
  rangeText: { fontSize: FONT_SIZE.body, color: COLOR.ink },
  error: { fontSize: FONT_SIZE.caption, color: COLOR.expense },
  banner: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s2, padding: SPACE.s3, borderRadius: RADIUS.r2, borderWidth: 1 },
  bannerOk: { backgroundColor: COLOR.incomeTint, borderColor: COLOR.income },
  bannerError: { backgroundColor: COLOR.expenseTint, borderColor: COLOR.expense },
  bannerText: { flex: 1, fontSize: FONT_SIZE.label, color: COLOR.ink },
  reportHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s2 },
  reportTitle: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  reportDesc: { fontSize: FONT_SIZE.label, color: COLOR.inkMute },
  formats: { flexDirection: 'row', gap: SPACE.s2, flexWrap: 'wrap', marginTop: SPACE.s1 },
  formatBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACE.s3, minHeight: 40,
    borderRadius: RADIUS.r2, borderWidth: 1, borderColor: COLOR.border, backgroundColor: COLOR.bgAlt,
  },
  formatBtnDisabled: { opacity: 0.5 },
  formatText: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.ink },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE.s2, padding: SPACE.s5 },
  emptyText: { fontSize: FONT_SIZE.body, color: COLOR.inkMute },
});
