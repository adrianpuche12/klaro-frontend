import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, useWindowDimensions, RefreshControl,
} from 'react-native';
import { Button } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import axios from 'axios';
import { REACT_APP_API_URL } from '../config';
import { COLOR, SPACE, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOW, BREAKPOINT } from '../theme';
import { formatTime } from '../utils/format';
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
}

interface DashboardData {
  stores: StoreDashboard[];
  totalActiveShifts: number;
  totalSalesToday: number;
  totalAmountToday: number;
  totalLowStockAlerts: number;
}


// ─── DashboardScreen ──────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const money = useMoney();
  const API = REACT_APP_API_URL;
  const { width } = useWindowDimensions();
  const isDesktop = width >= BREAKPOINT.desktop;

  const [data, setData]             = useState<DashboardData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await axios.get<DashboardData>(`${API}/api/v2/dashboard`);
      setData(res.data);
    } catch {
      setError('No se pudo cargar el dashboard.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh cada 30 segundos
  useEffect(() => {
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (loading) return <ActivityIndicator size="large" color={COLOR.brand} style={{ flex: 1, marginTop: 60 }} />;
  if (error)   return <View style={styles.centered}><Text style={styles.errorText}>{error}</Text><Button onPress={load}>Reintentar</Button></View>;
  if (!data)   return null;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLOR.brand} />}
    >

      {/* ── Encabezado ── */}
      <View style={styles.greetRow}>
        <View>
          <Text style={styles.greetTitle}>Resumen del sistema</Text>
          <Text style={styles.greetSub}>Actualización automática cada 30 segundos</Text>
        </View>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={load}
          accessibilityRole="button"
          accessibilityLabel="Actualizar dashboard"
        >
          <MaterialCommunityIcons name="refresh" size={20} color={COLOR.ink2} />
        </TouchableOpacity>
      </View>

      {/* ── KPIs globales ── */}
      <View style={[styles.kpiRow, isDesktop && styles.kpiRowDesktop]}>
        <KpiCard icon="store-outline"         label="Locales activos" value={String(data.stores.length)} />
        <KpiCard icon="clock-outline"         label="Turnos abiertos" value={String(data.totalActiveShifts)} highlight={data.totalActiveShifts > 0} />
        <KpiCard icon="cart-outline"          label="Ventas hoy"      value={String(data.totalSalesToday)} />
        <KpiCard icon="cash-multiple"         label="Total del día"   value={money(data.totalAmountToday)} />
        <KpiCard icon="alert-circle-outline"  label="Alertas stock"   value={String(data.totalLowStockAlerts)} warn={data.totalLowStockAlerts > 0} />
      </View>

      {/* ── Tarjetas por local ── */}
      <Text style={styles.sectionTitle}>Estado por local</Text>
      <View style={[styles.storeGrid, isDesktop && styles.storeGridDesktop]}>
        {data.stores.map(store => (
          <View key={store.storeId} style={styles.storeCard}>

            {/* Header de la tarjeta */}
            <View style={styles.storeCardHead}>
              <Text style={styles.storeName}>{store.storeName}</Text>
              <View style={[styles.shiftBadge, store.hasActiveShift ? styles.shiftOpen : styles.shiftClosed]}>
                <Text style={styles.shiftBadgeText}>
                  {store.hasActiveShift ? '● Turno abierto' : '○ Sin turno'}
                </Text>
              </View>
            </View>

            {/* Info del turno — altura fija para que la fila de stats quede alineada */}
            <View style={styles.shiftInfoBox}>
              {store.hasActiveShift && store.shiftCode ? (
                <View style={styles.shiftInfo}>
                  <Text style={styles.shiftCode}>{store.shiftCode}</Text>
                  <Text style={styles.shiftMeta}>
                    {store.shiftUsername}  ·  desde {store.shiftOpenedAt ? formatTime(store.shiftOpenedAt) : '—'}
                  </Text>
                </View>
              ) : (
                <Text style={styles.noShiftText}>No hay turno activo para este local</Text>
              )}
            </View>

            {/* Stats del turno */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{store.shiftSalesCount}</Text>
                <Text style={styles.statLabel}>Ventas</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{money(store.shiftSalesTotal)}</Text>
                <Text style={styles.statLabel}>Total turno</Text>
              </View>
            </View>

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
        ))}
      </View>
    </ScrollView>
  );
}

// ─── KpiCard (componente interno) ─────────────────────────────────────────────

const KpiCard = ({ icon, label, value, highlight, warn }: {
  icon: string; label: string; value: string; highlight?: boolean; warn?: boolean;
}) => (
  <View style={[styles.kpiCard, highlight && styles.kpiCardHL, warn && styles.kpiCardWarn]}>
    <MaterialCommunityIcons
      name={icon}
      size={24}
      color={warn ? COLOR.warn : (highlight ? COLOR.income : COLOR.ink2)}
    />
    <Text style={styles.kpiValue}>{value}</Text>
    <Text style={styles.kpiLabel}>{label}</Text>
  </View>
);

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:             { flex: 1, backgroundColor: COLOR.bg },
  content:          { padding: SPACE.s4, gap: SPACE.s4 },
  centered:         { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SPACE.s3 },
  errorText:        { color: COLOR.expense, fontWeight: FONT_WEIGHT.bold as any, fontSize: FONT_SIZE.body },

  // Saludo
  greetRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greetTitle:       { fontSize: FONT_SIZE.h1, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink, letterSpacing: -0.5 },
  greetSub:         { fontSize: FONT_SIZE.label, color: COLOR.inkMute, fontWeight: FONT_WEIGHT.medium as any, marginTop: 2 },
  refreshBtn:       { width: 40, height: 40, borderRadius: RADIUS.full, backgroundColor: COLOR.surface, borderWidth: 1, borderColor: COLOR.border, justifyContent: 'center', alignItems: 'center' },

  // KPIs globales
  kpiRow:           { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s2 },
  kpiRowDesktop:    { flexWrap: 'nowrap' },
  kpiCard:          { flex: 1, minWidth: 100, backgroundColor: COLOR.surface, borderRadius: RADIUS.r3, borderWidth: 1, borderColor: COLOR.border, padding: SPACE.s4, alignItems: 'center', gap: SPACE.s1, ...SHADOW.sm },
  kpiCardHL:        { borderColor: COLOR.incomeBorder, backgroundColor: COLOR.incomeTint },
  kpiCardWarn:      { borderColor: COLOR.warnBorder, backgroundColor: COLOR.warnTint },
  kpiValue:         { fontSize: FONT_SIZE.amount, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink, letterSpacing: -0.5 },
  kpiLabel:         { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.inkMute, textAlign: 'center' },

  // Sección
  sectionTitle:     { fontSize: FONT_SIZE.h2, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },

  // Grid de locales
  storeGrid:        { gap: SPACE.s3 },
  storeGridDesktop: { flexDirection: 'row', flexWrap: 'wrap' },

  // Tarjeta de local
  storeCard:        { flex: 1, minWidth: 280, backgroundColor: COLOR.surface, borderRadius: RADIUS.r4, borderWidth: 1, borderColor: COLOR.border, padding: SPACE.s4, gap: SPACE.s3, ...SHADOW.sm },
  storeCardHead:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  storeName:        { fontSize: FONT_SIZE.h2, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },

  shiftBadge:       { borderRadius: RADIUS.r2, paddingHorizontal: SPACE.s2 + 2, paddingVertical: 4 },
  shiftOpen:        { backgroundColor: COLOR.incomeTint },
  shiftClosed:      { backgroundColor: COLOR.surface2 },
  shiftBadgeText:   { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.ink2 },

  shiftInfoBox:     { minHeight: 44, justifyContent: 'center' },
  shiftInfo:        { gap: 2 },
  shiftCode:        { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  shiftMeta:        { fontSize: FONT_SIZE.caption, color: COLOR.inkMute, fontWeight: FONT_WEIGHT.medium as any },
  noShiftText:      { fontSize: FONT_SIZE.label, color: COLOR.inkDisabled, fontWeight: FONT_WEIGHT.medium as any },

  statsRow:         { flexDirection: 'row', backgroundColor: COLOR.bgAlt, borderRadius: RADIUS.r2, padding: SPACE.s3 },
  statItem:         { flex: 1, alignItems: 'center', gap: 2 },
  statDivider:      { width: 1, backgroundColor: COLOR.border, marginVertical: 2 },
  statValue:        { fontSize: FONT_SIZE.h2, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  statLabel:        { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.inkMute },

  inventoryRow:     { gap: SPACE.s1, marginTop: 'auto' as any },
  inventoryStat:    { flexDirection: 'row', alignItems: 'center', gap: SPACE.s2, backgroundColor: COLOR.bgAlt, borderRadius: RADIUS.r2, padding: SPACE.s2 },
  inventoryStatWarn:{ backgroundColor: COLOR.warnTint, borderWidth: 1, borderColor: COLOR.warnBorder },
  inventoryText:    { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.ink2 },
});
