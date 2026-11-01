import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, useWindowDimensions, RefreshControl, AppState, Platform,
} from 'react-native';
import { Button } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import axios from 'axios';
import { REACT_APP_API_URL } from '../config';
import { COLOR, SPACE, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOW, BREAKPOINT } from '../theme';
import { formatDate, formatTime } from '../utils/format';
import { useMoney } from '../context/TenantConfigContext';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface StoreDashboard {
  storeId: number;
  storeName: string;
  hasActiveShift: boolean;
  shiftCode: string | null;
  shiftUsername: string | null;
  shiftOpenedAt: string | null;
  shiftSalesCount: number;
  shiftSalesTotal: number;
  totalProducts: number;
  lowStockCount: number;
  estimatedValue: number;
  /**
   * D-03 (opcional, mejora sugerida al backend): ventas del día completo del local,
   * todos los turnos. Si el backend no los manda, la tarjeta muestra solo el turno.
   */
  todaySalesCount?: number | null;
  todaySalesTotal?: number | null;
}

interface DashboardData {
  stores: StoreDashboard[];
  totalActiveShifts: number;
  totalSalesToday: number;
  totalAmountToday: number;
  totalLowStockAlerts: number;
}

const REFRESH_MS = 30_000;
/** D-05: a partir de cuántas horas un turno abierto se marca como "probablemente olvidado". */
const STALE_SHIFT_HOURS = 12;

const isStaleShift = (iso: string | null) =>
  !!iso && Date.now() - new Date(iso).getTime() > STALE_SHIFT_HOURS * 3_600_000;

const isSameDay = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

/** D-05: hora sola si el turno es de hoy; fecha + hora si viene de otro día. */
const shiftSince = (iso: string) =>
  isSameDay(iso) ? formatTime(iso) : `${formatDate(iso)} ${formatTime(iso)}`;

/** D-02: false cuando la pestaña (web) o la app (nativo) no está visible. */
function useIsForeground() {
  const [fg, setFg] = useState(true);
  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return;
      const onChange = () => setFg(document.visibilityState === 'visible');
      onChange();
      document.addEventListener('visibilitychange', onChange);
      return () => document.removeEventListener('visibilitychange', onChange);
    }
    const sub = AppState.addEventListener('change', s => setFg(s === 'active'));
    return () => sub.remove();
  }, []);
  return fg;
}

// ─── DashboardScreen ──────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const money = useMoney();
  const API = REACT_APP_API_URL;
  const { width } = useWindowDimensions();
  const isDesktop = width >= BREAKPOINT.desktop;
  const foreground = useIsForeground();

  const [data, setData]             = useState<DashboardData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState('');
  const [updatedAt, setUpdatedAt]   = useState<Date | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    // D-07: si ya hay un pedido en curso (intervalo + botón), no se lanza otro;
    // antes el más lento podía pisar al más nuevo.
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await axios.get<DashboardData>(`${API}/api/v2/dashboard`, { timeout: 15000 });
      setData(res.data);
      setError('');
      setUpdatedAt(new Date());
    } catch {
      // D-01: si ya hay datos se mantienen y se avisa con un banner (antes un corte
      // de 1 s reemplazaba toda la pantalla por el error).
      setError('No se pudo actualizar el dashboard.');
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  // D-02: el refresco automático solo corre con la app/pestaña visible. Al montar y
  // al volver a primer plano se pide enseguida.
  useEffect(() => {
    if (!foreground) return;
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [foreground, load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (loading) return <ActivityIndicator size="large" color={COLOR.brand} style={{ flex: 1, marginTop: 60 }} />;

  // Solo sin datos previos se muestra la pantalla de error completa (D-01).
  if (!data) return (
    <View style={styles.centered}>
      <MaterialCommunityIcons name="cloud-off-outline" size={44} color={COLOR.inkDisabled} />
      <Text style={styles.errorText}>{error || 'No se pudo cargar el dashboard.'}</Text>
      <Button mode="contained" buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} onPress={load}>Reintentar</Button>
    </View>
  );

  const staleShifts = data.stores.filter(s => s.hasActiveShift && isStaleShift(s.shiftOpenedAt));

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLOR.brand} />}
    >

      {/* ── Encabezado ── */}
      <View style={styles.greetRow}>
        <View style={styles.flex}>
          <Text style={styles.greetTitle}>Resumen del sistema</Text>
          {/* D-06: hora real de la última actualización */}
          <Text style={styles.greetSub}>
            {updatedAt ? `Actualizado a las ${formatTime(updatedAt.toISOString())}` : 'Actualizando…'}
            {foreground ? ' · cada 30 s' : ' · en pausa'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={onRefresh}
          disabled={refreshing}
          accessibilityRole="button"
          accessibilityLabel="Actualizar dashboard"
        >
          {/* D-07: el botón muestra que está cargando */}
          {refreshing
            ? <ActivityIndicator size="small" color={COLOR.ink2} />
            : <MaterialCommunityIcons name="refresh" size={20} color={COLOR.ink2} />}
        </TouchableOpacity>
      </View>

      {/* D-01: falló el refresco pero quedan los últimos datos */}
      {!!error && (
        <View style={[styles.banner, styles.bannerWarn]} accessibilityLiveRegion="polite">
          <MaterialCommunityIcons name="wifi-off" size={16} color={COLOR.warn} />
          <Text style={styles.bannerText}>{error} Mostrando los últimos datos.</Text>
        </View>
      )}

      {/* D-05: aviso de turnos que probablemente quedaron sin cerrar */}
      {staleShifts.length > 0 && (
        <View style={[styles.banner, styles.bannerWarn]}>
          <MaterialCommunityIcons name="clock-alert-outline" size={16} color={COLOR.warn} />
          <Text style={styles.bannerText}>
            {staleShifts.length === 1
              ? `El turno de ${staleShifts[0].storeName} lleva más de ${STALE_SHIFT_HOURS} h abierto.`
              : `${staleShifts.length} turnos llevan más de ${STALE_SHIFT_HOURS} h abiertos.`}
            {' '}Revisá que se haya hecho el cierre.
          </Text>
        </View>
      )}

      {/* ── KPIs globales ── D-03: cada etiqueta dice de qué período es el número */}
      <View style={styles.kpiRow}>
        <KpiCard icon="store-outline"         label="Locales activos"          value={String(data.stores.length)} />
        <KpiCard icon="clock-outline"         label="Turnos abiertos"          value={String(data.totalActiveShifts)} highlight={data.totalActiveShifts > 0} />
        <KpiCard icon="cart-outline"          label="Ventas de hoy (todos)"    value={String(data.totalSalesToday)} />
        <KpiCard icon="cash-multiple"         label="Vendido hoy (todos)"      value={money(data.totalAmountToday)} wide={isDesktop} />
        <KpiCard icon="alert-circle-outline"  label="Productos con stock bajo" value={String(data.totalLowStockAlerts)} warn={data.totalLowStockAlerts > 0} />
      </View>

      {/* ── Tarjetas por local ── */}
      <Text style={styles.sectionTitle}>Estado por local</Text>

      {data.stores.length === 0 ? (
        // D-08: estado vacío
        <View style={styles.emptyBox}>
          <MaterialCommunityIcons name="store-off-outline" size={36} color={COLOR.inkDisabled} />
          <Text style={styles.emptyText}>Todavía no hay locales activos.</Text>
        </View>
      ) : (
        <View style={[styles.storeGrid, isDesktop && styles.storeGridDesktop]}>
          {data.stores.map(store => {
            const stale = store.hasActiveShift && isStaleShift(store.shiftOpenedAt);
            // D-03: el día completo del local solo si el backend lo manda.
            const hasToday = store.todaySalesCount != null && store.todaySalesTotal != null;
            return (
              <View key={store.storeId} style={[styles.storeCard, stale && styles.storeCardStale]}>

                {/* Header de la tarjeta */}
                <View style={styles.storeCardHead}>
                  <Text style={styles.storeName} numberOfLines={1}>{store.storeName}</Text>
                  <View style={[styles.shiftBadge, store.hasActiveShift ? (stale ? styles.shiftStale : styles.shiftOpen) : styles.shiftClosed]}>
                    <View style={[styles.dot, { backgroundColor: store.hasActiveShift ? (stale ? COLOR.warn : COLOR.income) : COLOR.inkDisabled }]} />
                    <Text style={styles.shiftBadgeText}>
                      {store.hasActiveShift ? (stale ? `Abierto hace +${STALE_SHIFT_HOURS} h` : 'Turno abierto') : 'Sin turno'}
                    </Text>
                  </View>
                </View>

                {/* Info del turno — altura fija para que la fila de stats quede alineada */}
                <View style={styles.shiftInfoBox}>
                  {store.hasActiveShift && store.shiftCode ? (
                    <View style={styles.shiftInfo}>
                      <Text style={styles.shiftCode}>{store.shiftCode}</Text>
                      <Text style={[styles.shiftMeta, stale && { color: COLOR.warn }]}>
                        {store.shiftUsername}  ·  desde {store.shiftOpenedAt ? shiftSince(store.shiftOpenedAt) : '—'}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.noShiftText}>No hay turno activo para este local</Text>
                  )}
                </View>

                {/* D-03: día completo (si viene del backend) */}
                {hasToday && (
                  <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>{store.todaySalesCount}</Text>
                      <Text style={styles.statLabel}>Ventas de hoy</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{money(store.todaySalesTotal)}</Text>
                      <Text style={styles.statLabel}>Vendido hoy</Text>
                    </View>
                  </View>
                )}

                {/* D-03: estas cifras son del turno abierto, no del día */}
                {store.hasActiveShift ? (
                  <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>{store.shiftSalesCount}</Text>
                      <Text style={styles.statLabel}>Ventas del turno</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{money(store.shiftSalesTotal)}</Text>
                      <Text style={styles.statLabel}>Total del turno</Text>
                    </View>
                  </View>
                ) : (
                  <View style={[styles.statsRow, styles.statsRowEmpty]}>
                    <Text style={styles.statLabel}>Las ventas del turno aparecen cuando se abre un turno.</Text>
                  </View>
                )}

                {/* Inventario */}
                <View style={styles.inventoryRow}>
                  <View style={[styles.inventoryStat, store.lowStockCount > 0 && styles.inventoryStatWarn]}>
                    <MaterialCommunityIcons
                      name={store.lowStockCount > 0 ? 'alert-circle-outline' : 'package-variant'}
                      size={16}
                      color={store.lowStockCount > 0 ? COLOR.warn : COLOR.ink2}
                    />
                    <Text style={[styles.inventoryText, store.lowStockCount > 0 && { color: COLOR.warn }]}>
                      {store.lowStockCount > 0
                        ? `${store.lowStockCount} producto${store.lowStockCount !== 1 ? 's' : ''} con stock bajo`
                        : `${store.totalProducts} productos · stock OK`}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

// ─── KpiCard (componente interno) ─────────────────────────────────────────────

const KpiCard = ({ icon, label, value, highlight, warn, wide }: {
  icon: string; label: string; value: string; highlight?: boolean; warn?: boolean; wide?: boolean;
}) => (
  <View style={[styles.kpiCard, wide && styles.kpiCardWide, highlight && styles.kpiCardHL, warn && styles.kpiCardWarn]}>
    <MaterialCommunityIcons
      name={icon}
      size={24}
      color={warn ? COLOR.warn : (highlight ? COLOR.income : COLOR.ink2)}
    />
    {/* D-04: el número se ajusta al ancho de la tarjeta en vez de desbordar */}
    <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    <Text style={styles.kpiLabel}>{label}</Text>
  </View>
);

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex:             { flex: 1 },
  root:             { flex: 1, backgroundColor: COLOR.bg },
  content:          { padding: SPACE.s4, gap: SPACE.s4 },
  centered:         { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SPACE.s3, padding: SPACE.s6 },
  errorText:        { color: COLOR.ink2, fontWeight: FONT_WEIGHT.semibold as any, fontSize: FONT_SIZE.body, textAlign: 'center' },

  // Saludo
  greetRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.s3 },
  greetTitle:       { fontSize: FONT_SIZE.h1, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink, letterSpacing: -0.5 },
  greetSub:         { fontSize: FONT_SIZE.label, color: COLOR.inkMute, fontWeight: FONT_WEIGHT.medium as any, marginTop: 2 },
  refreshBtn:       { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: COLOR.surface, borderWidth: 1, borderColor: COLOR.border, justifyContent: 'center', alignItems: 'center' },

  // Avisos (D-01, D-05)
  banner:           { flexDirection: 'row', alignItems: 'center', gap: SPACE.s2, backgroundColor: COLOR.surface, borderWidth: 1, borderColor: COLOR.border, borderRadius: RADIUS.r2, padding: SPACE.s3 },
  bannerWarn:       { backgroundColor: COLOR.warnTint, borderColor: COLOR.warnBorder },
  bannerText:       { flex: 1, fontSize: FONT_SIZE.label, color: COLOR.ink, fontWeight: FONT_WEIGHT.medium as any },

  // KPIs globales — D-04: las tarjetas pasan de fila en vez de achicarse hasta desbordar
  kpiRow:           { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s2 },
  kpiCard:          { flexGrow: 1, flexBasis: 150, backgroundColor: COLOR.surface, borderRadius: RADIUS.r3, borderWidth: 1, borderColor: COLOR.border, padding: SPACE.s4, alignItems: 'center', gap: SPACE.s1, ...SHADOW.sm },
  kpiCardWide:      { flexBasis: 200 },
  kpiCardHL:        { borderColor: COLOR.incomeBorder, backgroundColor: COLOR.incomeTint },
  kpiCardWarn:      { borderColor: COLOR.warnBorder, backgroundColor: COLOR.warnTint },
  kpiValue:         { fontSize: FONT_SIZE.amount, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink, letterSpacing: -0.5, maxWidth: '100%' },
  kpiLabel:         { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.inkMute, textAlign: 'center' },

  // Sección
  sectionTitle:     { fontSize: FONT_SIZE.h2, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  emptyBox:         { alignItems: 'center', gap: SPACE.s2, padding: SPACE.s6, backgroundColor: COLOR.surface, borderRadius: RADIUS.r3, borderWidth: 1, borderColor: COLOR.border },
  emptyText:        { fontSize: FONT_SIZE.body, color: COLOR.inkMute },

  // Grid de locales
  storeGrid:        { gap: SPACE.s3 },
  storeGridDesktop: { flexDirection: 'row', flexWrap: 'wrap' },

  // Tarjeta de local
  storeCard:        { flexGrow: 1, flexBasis: 300, backgroundColor: COLOR.surface, borderRadius: RADIUS.r4, borderWidth: 1, borderColor: COLOR.border, padding: SPACE.s4, gap: SPACE.s3, ...SHADOW.sm },
  storeCardStale:   { borderColor: COLOR.warnBorder, backgroundColor: COLOR.warnTint },
  storeCardHead:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.s2 },
  storeName:        { flex: 1, fontSize: FONT_SIZE.h2, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },

  shiftBadge:       { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: RADIUS.r2, paddingHorizontal: SPACE.s2 + 2, paddingVertical: 4 },
  shiftOpen:        { backgroundColor: COLOR.incomeTint },
  shiftStale:       { backgroundColor: COLOR.surface, borderWidth: 1, borderColor: COLOR.warnBorder },
  shiftClosed:      { backgroundColor: COLOR.surface2 },
  dot:              { width: 8, height: 8, borderRadius: 4 },
  shiftBadgeText:   { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.ink2 },

  shiftInfoBox:     { minHeight: 44, justifyContent: 'center' },
  shiftInfo:        { gap: 2 },
  shiftCode:        { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  shiftMeta:        { fontSize: FONT_SIZE.caption, color: COLOR.inkMute, fontWeight: FONT_WEIGHT.medium as any },
  noShiftText:      { fontSize: FONT_SIZE.label, color: COLOR.inkMute, fontWeight: FONT_WEIGHT.medium as any },

  statsRow:         { flexDirection: 'row', backgroundColor: COLOR.bgAlt, borderRadius: RADIUS.r2, padding: SPACE.s3, minHeight: 64, alignItems: 'center' },
  statsRowEmpty:    { justifyContent: 'center' },
  statItem:         { flex: 1, alignItems: 'center', gap: 2, minWidth: 0 },
  statDivider:      { width: 1, alignSelf: 'stretch', backgroundColor: COLOR.border, marginVertical: 2 },
  statValue:        { fontSize: FONT_SIZE.h2, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink, maxWidth: '100%' },
  statLabel:        { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.inkMute, textAlign: 'center' },

  inventoryRow:     { gap: SPACE.s1, marginTop: 'auto' as any },
  inventoryStat:    { flexDirection: 'row', alignItems: 'center', gap: SPACE.s2, backgroundColor: COLOR.bgAlt, borderRadius: RADIUS.r2, padding: SPACE.s2 },
  inventoryStatWarn:{ backgroundColor: COLOR.warnTint, borderWidth: 1, borderColor: COLOR.warnBorder },
  inventoryText:    { flex: 1, fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.ink2 },
});
