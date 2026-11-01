import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Button } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLOR, SPACE, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOW, CONTROL } from '../theme';
import { formatDate, formatTime } from '../utils/format';
import axios from 'axios';
import { REACT_APP_API_URL } from '../config';
import { useStore, Store } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { useMoney } from '../context/TenantConfigContext';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ShiftRecord {
  id: number;
  code: string;
  username: string;
  status: string;
  storeId: number;
  storeName: string;
  openedAt: string;
  closedAt: string | null;
  /** Opcionales: si el backend los agrega al listado, se muestran sin abrir el turno (H-06). */
  salesCount?: number;
  totalAmount?: number;
}

interface ProductSummaryItem {
  productId: number;
  productName: string;
  quantity: number;
  subtotal: number;
}

interface ShiftSummary {
  date: string;
  storeId: number;
  storeName: string;
  totalSales: number;
  totalSubtotal: number;
  totalIsv: number;
  totalAmount: number;
  productSummary: ProductSummaryItem[];
}

// ─── Constantes y utilidades ──────────────────────────────────────────────────

const PAGE_SIZE = 20;
const REQUEST_TIMEOUT = 15000;
const STALE_SHIFT_HOURS = 12;
/**
 * Con `mine` el filtro por cajero es del lado del cliente (el backend hoy ignora
 * `?username=`), así que una página puede no traer ningún turno propio. Se piden
 * páginas seguidas hasta encontrar alguno, con este tope por cada carga.
 */
const MAX_PAGES_PER_LOAD = 5;

// H-08: tabla de estados con valor por defecto. El backend (ShiftStatus) hoy solo
// tiene OPEN y CLOSED; cualquier otro valor futuro se muestra tal cual, neutro.
const STATUS: Record<string, { label: string; bg: string; dot: string }> = {
  OPEN:   { label: 'Abierto', bg: COLOR.incomeTint, dot: COLOR.income },
  CLOSED: { label: 'Cerrado', bg: COLOR.surface2,   dot: COLOR.inkDisabled },
};
const statusOf = (s: string) => STATUS[s] ?? { label: s || 'Sin estado', bg: COLOR.surface2, dot: COLOR.inkMute };

// H-07: se compara con el mismo formato de fecha que se muestra (APP_LOCALE).
const sameDay = (a: string, b: string) => formatDate(a) === formatDate(b);
const isStale = (sh: ShiftRecord) =>
  sh.status === 'OPEN' && Date.now() - new Date(sh.openedAt).getTime() > STALE_SHIFT_HOURS * 3_600_000;

const normUser = (u: string | null | undefined) => (u ?? '').trim().toLowerCase();

interface Props {
  /**
   * H-01: `mine` = vista "Mis ventas" del cajero. Sin selector de local (no puede
   * cambiar el local global del POS), sin columna de usuario y solo sus turnos.
   */
  mine?: boolean;
  /**
   * Solo con `mine`: local asignado al cajero (lo resuelve UserDashboard desde su
   * perfil). Si se omite, se usa el local seleccionado del StoreContext.
   */
  store?: Store | null;
}

// ─── SalesHistoryScreen ───────────────────────────────────────────────────────

export default function SalesHistoryScreen({ mine = false, store }: Props) {
  const money = useMoney();
  const API = REACT_APP_API_URL;
  const { stores, selectedStore, setSelectedStore, loadingStores } = useStore();
  const { userName } = useAuth();

  // Con `mine` se usa el local asignado (si UserDashboard lo pasa); nunca el que
  // haya quedado elegido en el contexto por otro camino.
  const currentStore: Store | null = mine && store !== undefined ? store : selectedStore;
  const storeId = currentStore?.id ?? null;
  const me = normUser(userName);

  const [shifts, setShifts]           = useState<ShiftRecord[]>([]);
  const [loading, setLoading]         = useState(false);
  const [refreshing, setRefreshing]   = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError]     = useState(false);
  const [hasMore, setHasMore]         = useState(true);
  const [page, setPage]               = useState(0);
  const [expanded, setExpanded]       = useState<Record<number, boolean>>({});
  const [summaries, setSummaries]     = useState<Record<number, ShiftSummary>>({});
  const [loadingSum, setLoadingSum]   = useState<Record<number, boolean>>({});
  const [sumError, setSumError]       = useState<Record<number, boolean>>({});
  const [error, setError]             = useState('');

  // H-02: cada carga inicial abre una "generación". Toda respuesta (primera página,
  // "cargar más" o resumen) de una generación anterior se descarta, así un cambio de
  // local (o un refresco) en medio de una carga nunca mezcla turnos de dos locales.
  const genRef = useRef(0);

  /**
   * Trae turnos desde `startPage`. Con `mine` filtra por el usuario logueado
   * (además de mandar `?username=` por si el backend lo soporta en el futuro) y
   * sigue pidiendo páginas hasta encontrar alguno propio o llegar al tope.
   */
  const fetchFrom = useCallback(async (sid: number, startPage: number) => {
    const collected: ShiftRecord[] = [];
    let p = startPage;
    let more = true;
    for (let i = 0; i < (mine ? MAX_PAGES_PER_LOAD : 1); i++) {
      const res = await axios.get<ShiftRecord[]>(
        `${API}/api/v2/stores/${sid}/shifts?page=${p}&size=${PAGE_SIZE}` +
          (mine && userName ? `&username=${encodeURIComponent(userName)}` : ''),
        { timeout: REQUEST_TIMEOUT },
      );
      const rows = Array.isArray(res.data) ? res.data : [];
      more = rows.length === PAGE_SIZE;
      // Permisos: el cajero nunca ve turnos ajenos, aunque el backend los devuelva.
      // Sin usuario conocido, con `mine` no se muestra ninguno.
      collected.push(...(mine ? rows.filter(r => !!me && normUser(r.username) === me) : rows));
      if (collected.length > 0 || !more) break;
      p += 1;
    }
    return { rows: collected, lastPage: p, hasMore: more };
  }, [API, mine, userName, me]);

  // ── Cargar turnos del local (primera página) ─────────────────────────────

  const loadShifts = useCallback(async () => {
    const gen = ++genRef.current;
    setShifts([]);
    setExpanded({});
    setSummaries({});
    setSumError({});
    setLoadingSum({});
    setMoreError(false);
    setLoadingMore(false);
    setError('');
    if (!storeId) { setLoading(false); setHasMore(false); return; }
    setLoading(true);
    try {
      const r = await fetchFrom(storeId, 0);
      if (genRef.current !== gen) return;
      setShifts(r.rows);
      setPage(r.lastPage);
      setHasMore(r.hasMore);
    } catch {
      if (genRef.current === gen) setError('No se pudo cargar el historial de turnos.');
    } finally {
      if (genRef.current === gen) setLoading(false);
    }
  }, [storeId, fetchFrom]);

  useEffect(() => { loadShifts(); }, [loadShifts]);

  // ── Cargar más turnos ─────────────────────────────────────────────────────

  const loadMore = async () => {
    if (!storeId || loadingMore || !hasMore) return;
    const gen = genRef.current;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const r = await fetchFrom(storeId, page + 1);
      if (genRef.current !== gen) return; // H-02
      setShifts(prev => [...prev, ...r.rows]);
      setPage(r.lastPage);
      setHasMore(r.hasMore);
    } catch {
      if (genRef.current === gen) setMoreError(true); // H-03: antes era silencioso
    } finally {
      if (genRef.current === gen) setLoadingMore(false);
    }
  };

  const onRefresh = async () => { setRefreshing(true); await loadShifts(); setRefreshing(false); };

  // ── Expandir turno y cargar resumen ──────────────────────────────────────

  const loadSummary = async (id: number) => {
    const gen = genRef.current;
    setLoadingSum(prev => ({ ...prev, [id]: true }));
    setSumError(prev => ({ ...prev, [id]: false }));
    try {
      const res = await axios.get<ShiftSummary>(`${API}/api/v2/shifts/${id}/summary`, { timeout: REQUEST_TIMEOUT });
      if (genRef.current !== gen) return;
      setSummaries(prev => ({ ...prev, [id]: res.data }));
    } catch {
      if (genRef.current === gen) setSumError(prev => ({ ...prev, [id]: true })); // H-04
    } finally {
      if (genRef.current === gen) setLoadingSum(prev => ({ ...prev, [id]: false }));
    }
  };

  const toggleShift = (shift: ShiftRecord) => {
    const isOpen = !!expanded[shift.id];
    setExpanded(prev => ({ ...prev, [shift.id]: !isOpen }));
    if (!isOpen && !summaries[shift.id] && !loadingSum[shift.id]) loadSummary(shift.id);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const title = mine ? 'Mis ventas' : 'Historial de ventas';

  const renderBody = () => {
    if (!currentStore) {
      if (loadingStores) return <ActivityIndicator size="large" color={COLOR.brand} style={styles.loader} />;
      return (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="store-alert-outline" size={40} color={COLOR.inkDisabled} />
          <Text style={styles.emptyText}>
            {mine
              ? 'No pudimos confirmar en qué local trabajás. Pedí al administrador que te asigne uno.'
              : 'No hay un local seleccionado.'}
          </Text>
        </View>
      );
    }

    if (loading) return <ActivityIndicator size="large" color={COLOR.brand} style={styles.loader} />;

    if (error) {
      // H-05: con reintento (antes solo un texto rojo, sin forma de recuperar)
      return (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="cloud-off-outline" size={40} color={COLOR.inkDisabled} />
          <Text style={styles.emptyText}>{error}</Text>
          <Button
            mode="contained"
            buttonColor={COLOR.brand}
            textColor={COLOR.inkOnBrand}
            style={styles.retryBtn}
            onPress={loadShifts}
          >
            Reintentar
          </Button>
        </View>
      );
    }

    if (shifts.length === 0 && !hasMore) {
      return (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="receipt" size={40} color={COLOR.inkDisabled} />
          <Text style={styles.emptyText}>
            {mine ? 'Todavía no tenés turnos registrados en este local.' : 'No hay turnos registrados para este local.'}
          </Text>
        </View>
      );
    }

    return (
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLOR.brand} />}
      >
        {shifts.length === 0 && (
          <Text style={styles.noSalesText}>
            {mine ? 'No hay turnos tuyos en los más recientes del local.' : 'No hay turnos en esta página.'}
          </Text>
        )}

        {shifts.map(shift => {
          const isOpen  = !!expanded[shift.id];
          const summary = summaries[shift.id];
          const st      = statusOf(shift.status);
          const stale   = isStale(shift);
          // H-06: total en la fila si viene del backend o apenas se abrió el turno una vez.
          const total   = shift.totalAmount ?? summary?.totalAmount;
          const label   = stale ? `Abierto hace +${STALE_SHIFT_HOURS} h` : st.label;

          return (
            <View key={shift.id} style={[styles.shiftCard, stale && styles.shiftCardStale]}>

              {/* ── Fila principal del turno ── */}
              <TouchableOpacity
                style={styles.shiftRow}
                onPress={() => toggleShift(shift)}
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                accessibilityLabel={`Turno ${shift.code}, ${label}${total != null ? `, total ${money(total)}` : ''}`}
              >
                <View style={styles.flex}>
                  <View style={styles.shiftCodeRow}>
                    <Text style={styles.shiftCode}>{shift.code}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: stale ? COLOR.warnTint : st.bg }]}>
                      <View style={[styles.dot, { backgroundColor: stale ? COLOR.warn : st.dot }]} />
                      <Text style={styles.statusText}>{label}</Text>
                    </View>
                  </View>
                  {/* H-07: si cerró otro día, también se muestra la fecha de cierre */}
                  <Text style={styles.shiftMeta}>
                    {formatDate(shift.openedAt)}  ·  {formatTime(shift.openedAt)}
                    {shift.closedAt
                      ? ` — ${sameDay(shift.openedAt, shift.closedAt) ? '' : `${formatDate(shift.closedAt)} `}${formatTime(shift.closedAt)}`
                      : ''}
                    {!mine && ` · ${shift.username}`}
                  </Text>
                </View>
                {total != null && <Text style={styles.rowTotal}>{money(total)}</Text>}
                <MaterialCommunityIcons name={isOpen ? 'chevron-up' : 'chevron-down'} size={20} color={COLOR.inkMute} />
              </TouchableOpacity>

              {/* ── Detalle expandible ── */}
              {isOpen && (
                <View style={styles.detail}>
                  {loadingSum[shift.id] ? (
                    <ActivityIndicator color={COLOR.brand} style={styles.sumLoader} />
                  ) : sumError[shift.id] ? (
                    // H-04: reintento visible sin cerrar y volver a abrir la tarjeta
                    <View style={styles.sumErr}>
                      <Text style={styles.noSalesText}>No se pudo cargar el resumen.</Text>
                      <TouchableOpacity onPress={() => loadSummary(shift.id)} accessibilityRole="button">
                        <Text style={styles.retryLink}>Reintentar</Text>
                      </TouchableOpacity>
                    </View>
                  ) : summary && summary.totalSales > 0 ? (
                    <>
                      {/* Tabla de productos */}
                      <View style={styles.detailHeader}>
                        <Text style={[styles.detailCol, styles.flex]}>Producto</Text>
                        <Text style={[styles.detailCol, styles.colQty]}>Cant.</Text>
                        <Text style={[styles.detailCol, styles.colSub]}>Subtotal</Text>
                      </View>
                      {summary.productSummary.map((p, i) => (
                        <View key={`${p.productId}-${i}`} style={styles.detailRow}>
                          <Text style={[styles.detailCell, styles.flex]} numberOfLines={1}>{p.productName}</Text>
                          <Text style={[styles.detailCell, styles.colQty]}>{p.quantity}</Text>
                          <Text style={[styles.detailCell, styles.colSub]}>{money(p.subtotal)}</Text>
                        </View>
                      ))}

                      {/* Totales */}
                      <View style={styles.detailTotals}>
                        <View style={styles.totalLine}>
                          <Text style={styles.totalLabel}>{summary.totalSales} venta{summary.totalSales !== 1 ? 's' : ''}</Text>
                          <Text style={styles.totalLabel}>Subtotal: {money(summary.totalSubtotal)}</Text>
                        </View>
                        <View style={[styles.totalLine, styles.totalFinal]}>
                          <Text style={styles.totalFinalLabel}>Total del turno</Text>
                          <Text style={styles.totalFinalAmount}>{money(summary.totalAmount)}</Text>
                        </View>
                      </View>
                    </>
                  ) : summary ? (
                    <Text style={styles.noSalesText}>Turno sin ventas registradas.</Text>
                  ) : null}
                </View>
              )}
            </View>
          );
        })}

        {/* ── Cargar más ── */}
        {hasMore && (
          <TouchableOpacity
            style={styles.loadMoreBtn}
            onPress={loadMore}
            disabled={loadingMore}
            accessibilityRole="button"
          >
            {loadingMore
              ? <ActivityIndicator size="small" color={COLOR.brand} />
              : (
                <Text style={[styles.loadMoreText, moreError && styles.loadMoreError]}>
                  {moreError ? 'No se pudieron cargar más. Tocá para reintentar.' : 'Cargar más turnos'}
                </Text>
              )}
          </TouchableOpacity>
        )}
        {!hasMore && shifts.length > 0 && (
          <Text style={styles.noMoreText}>Fin del historial</Text>
        )}
      </ScrollView>
    );
  };

  return (
    <View style={styles.root}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headTop}>
          <Text style={styles.headerTitle}>{title}</Text>
          {/* H-01: el cajero ve su local como etiqueta, no como selector */}
          {mine && currentStore && (
            <View style={styles.storePill} accessibilityLabel={`Local: ${currentStore.name}`}>
              <MaterialCommunityIcons name="store-outline" size={13} color={COLOR.ink2} />
              <Text style={styles.storePillText}>{currentStore.name}</Text>
            </View>
          )}
        </View>
        {/* H-01: el cajero NO ve el selector (cambiaría el local global del POS).
            H-12: scroll horizontal, y se oculta si hay un solo local. */}
        {!mine && stores.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storeChips}>
            {stores.map(s => {
              const on = selectedStore?.id === s.id;
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.chip, on && styles.chipActive]}
                  onPress={() => { if (!on) setSelectedStore(s); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.chipText, on && styles.chipTextActive]}>{s.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* ── Contenido ── */}
      {renderBody()}
    </View>
  );
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex:           { flex: 1 },
  root:           { flex: 1, backgroundColor: COLOR.bg },
  loader:         { marginTop: 40 },

  header:         { gap: SPACE.s3, padding: SPACE.s4, backgroundColor: COLOR.surface, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  headTop:        { flexDirection: 'row', alignItems: 'center', gap: SPACE.s2, flexWrap: 'wrap' },
  headerTitle:    { fontSize: FONT_SIZE.h1, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink, flex: 1 },
  storePill:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLOR.bgAlt, borderRadius: RADIUS.full, paddingHorizontal: SPACE.s3, paddingVertical: 5 },
  storePillText:  { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.ink2 },
  // H-12: chips en scroll horizontal (antes se salían de la pantalla con 4+ locales)
  storeChips:     { gap: SPACE.s2 },
  chip:           { height: CONTROL.chipH, justifyContent: 'center', paddingHorizontal: SPACE.s4, borderRadius: RADIUS.full, backgroundColor: COLOR.bg, borderWidth: 1, borderColor: COLOR.border },
  chipActive:     { backgroundColor: COLOR.brand, borderColor: COLOR.brandDark },
  chipText:       { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.ink2 },
  chipTextActive: { color: COLOR.ink, fontWeight: FONT_WEIGHT.bold as any },

  empty:          { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SPACE.s3, padding: SPACE.s8 },
  emptyText:      { fontSize: FONT_SIZE.body, color: COLOR.inkMute, fontWeight: FONT_WEIGHT.semibold as any, textAlign: 'center' },
  retryBtn:       { borderRadius: RADIUS.r2 },

  list:           { padding: SPACE.s4, gap: SPACE.s2 },

  // H-14: botón de 48 px de alto mínimo
  loadMoreBtn:    { margin: SPACE.s4, minHeight: 48, padding: SPACE.s3, borderRadius: RADIUS.r2, borderWidth: 1, borderColor: COLOR.border, alignItems: 'center', justifyContent: 'center', backgroundColor: COLOR.surface },
  loadMoreText:   { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.ink2, textAlign: 'center' },
  loadMoreError:  { color: COLOR.expense },
  noMoreText:     { textAlign: 'center', color: COLOR.inkMute, fontSize: FONT_SIZE.caption, padding: SPACE.s4 },

  shiftCard:      { backgroundColor: COLOR.surface, borderRadius: RADIUS.r3, borderWidth: 1, borderColor: COLOR.border, overflow: 'hidden', ...SHADOW.sm },
  shiftCardStale: { borderColor: COLOR.warnBorder },
  shiftRow:       { flexDirection: 'row', alignItems: 'center', padding: SPACE.s4, gap: SPACE.s3, minHeight: 64 },
  shiftCodeRow:   { flexDirection: 'row', alignItems: 'center', gap: SPACE.s2, marginBottom: SPACE.s1, flexWrap: 'wrap' },
  shiftCode:      { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  shiftMeta:      { fontSize: FONT_SIZE.caption, color: COLOR.inkMute, fontWeight: FONT_WEIGHT.medium as any },
  rowTotal:       { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },

  statusBadge:    { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: RADIUS.r2, paddingHorizontal: SPACE.s2, paddingVertical: 3 },
  dot:            { width: 7, height: 7, borderRadius: 4 },
  statusText:     { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink2 },

  detail:         { borderTopWidth: 1, borderTopColor: COLOR.border, padding: SPACE.s4, backgroundColor: COLOR.bgAlt },
  sumLoader:      { margin: 12 },
  sumErr:         { alignItems: 'center', gap: SPACE.s1 },
  retryLink:      { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.info, padding: SPACE.s2 },

  detailHeader:   { flexDirection: 'row', paddingBottom: SPACE.s2, borderBottomWidth: 1, borderBottomColor: COLOR.border, marginBottom: SPACE.s1 },
  detailRow:      { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  detailCol:      { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.inkMute },
  detailCell:     { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.medium as any, color: COLOR.ink },
  colQty:         { width: 44, textAlign: 'center' },
  colSub:         { width: 96, textAlign: 'right' },

  detailTotals:   { marginTop: SPACE.s2, gap: SPACE.s1 },
  totalLine:      { flexDirection: 'row', justifyContent: 'space-between' },
  totalFinal:     { borderTopWidth: 2, borderTopColor: COLOR.ink, paddingTop: SPACE.s2, marginTop: SPACE.s1 },
  totalLabel:     { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.inkMute },
  totalFinalLabel:{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  totalFinalAmount:{ fontSize: FONT_SIZE.h2, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },

  noSalesText:    { fontSize: FONT_SIZE.label, color: COLOR.inkMute, fontWeight: FONT_WEIGHT.semibold as any, textAlign: 'center', padding: SPACE.s2 },
});
