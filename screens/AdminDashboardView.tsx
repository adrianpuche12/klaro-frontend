// =============================================================================
// AdminDashboard.tsx  ·  screens/AdminDashboard.tsx
// Dashboard de admin/root. KPIs del día + navegación de gestión + actividad.
// Sin emojis, sin inline styles, sin hex. Conectá tus datos reales (KPIs, actividad).
// Mientras cargan los KPIs, mostrá skeletons (incluido).
// =============================================================================
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLOR, SPACE, FONT_SIZE, FONT_WEIGHT, RADIUS, SHADOW } from '../theme';

interface Kpis { ventasHoy: number; transacciones: number; cierresHechos: number; cierresTotal: number; stockBajo: number; }
interface ActItem { id: string; hora: string; desc: string; monto: number; income: boolean; }

const L = (n: number) => `L ${n.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const Lk = (n: number) => `L ${Math.round(n).toLocaleString('es-HN')}`;

interface NavRow { key: string; icon: string; label: string; rootOnly?: boolean; }
const NAV: NavRow[] = [
  { key: 'historial',   icon: 'history',                        label: 'Historial de ventas' },
  { key: 'operaciones', icon: 'file-document-multiple-outline', label: 'Panel de operaciones' },
  { key: 'inventario',  icon: 'package-variant-closed',         label: 'Gestión de inventario' },
  { key: 'usuarios',    icon: 'account-group-outline',          label: 'Usuarios del sistema' },
  { key: 'locales',     icon: 'store-outline',                  label: 'Gestión de locales', rootOnly: true },
  { key: 'config',      icon: 'cog-outline',                    label: 'Configuración del negocio', rootOnly: true },
];

interface Props {
  tenantName: string;
  fecha: string;
  isRoot: boolean;
  loading: boolean;
  kpis: Kpis | null;
  activity: ActItem[];
  onMenu: () => void;
  onBell: () => void;
  onStorePress: () => void;
  onNavigate: (key: string) => void;
  onVerTodas: () => void;
}

export default function AdminDashboardView(p: Props) {
  const { width } = useWindowDimensions();
  const k = p.kpis;

  return (
    <View style={styles.container}>
      <View style={styles.appbar}>
        <TouchableOpacity style={styles.menuBtn} onPress={p.onMenu}><MaterialCommunityIcons name="menu" size={24} color={COLOR.ink} /></TouchableOpacity>
        <Text style={styles.brand}>BELOPIA</Text>
        <View style={styles.appbarRight}>
          <TouchableOpacity onPress={p.onBell}><MaterialCommunityIcons name="bell-outline" size={22} color={COLOR.ink2} /></TouchableOpacity>
          <TouchableOpacity style={styles.storeChip} onPress={p.onStorePress}>
            <MaterialCommunityIcons name="store-outline" size={13} color={COLOR.inkMute} />
            <Text style={styles.storeChipTxt}>Todos</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView>
        <View style={styles.greet}>
          <Text style={styles.greetTitle}>Panel de control</Text>
          <Text style={styles.greetDate}>{p.fecha}</Text>
        </View>
        <Text style={styles.greetSub}>{p.tenantName}</Text>

        {/* KPIs */}
        <View style={styles.kpis}>
          {p.loading || !k ? (
            <>
              <View style={styles.kpi}><View style={[styles.skel, styles.skLbl]} /><View style={[styles.skel, styles.skVal]} /></View>
              <View style={styles.kpi}><View style={[styles.skel, styles.skLbl]} /><View style={[styles.skel, styles.skVal]} /></View>
              <View style={styles.kpi}><View style={[styles.skel, styles.skLbl]} /><View style={[styles.skel, styles.skVal]} /></View>
            </>
          ) : (
            <>
              <View style={styles.kpi}>
                <MaterialCommunityIcons name="trending-up" size={20} color={COLOR.income} style={styles.kIco} />
                <Text style={styles.kLbl}>VENTAS HOY</Text>
                <Text style={styles.kHero}>{Lk(k.ventasHoy)}</Text>
                <Text style={styles.kSub}>{k.transacciones} transacciones</Text>
              </View>
              <View style={styles.kpi}>
                <MaterialCommunityIcons name="cash-register" size={20} color={COLOR.warn} style={styles.kIco} />
                <Text style={styles.kLbl}>CIERRES HOY</Text>
                <Text style={styles.kBig}>{k.cierresHechos} / {k.cierresTotal}</Text>
                <Text style={[styles.kSub, (k.cierresTotal - k.cierresHechos) > 0 && styles.kSubWarn]}>{k.cierresTotal - k.cierresHechos} pendientes</Text>
              </View>
              <View style={styles.kpi}>
                <MaterialCommunityIcons name="alert-circle-outline" size={20} color={k.stockBajo > 0 ? COLOR.expense : COLOR.income} style={styles.kIco} />
                <Text style={styles.kLbl}>STOCK BAJO</Text>
                <Text style={[styles.kBig, k.stockBajo > 0 ? styles.kExp : styles.kInc]}>{k.stockBajo}</Text>
                <Text style={styles.kSub}>productos</Text>
              </View>
            </>
          )}
        </View>

        {/* Navegación de gestión */}
        <Text style={styles.sectionLbl}>Acciones de gestión</Text>
        <View style={styles.navCard}>
          {NAV.filter(n => !n.rootOnly || p.isRoot).map((n, i, arr) => (
            <TouchableOpacity key={n.key} style={[styles.navItem, i === arr.length - 1 && styles.navItemLast]} onPress={() => p.onNavigate(n.key)}>
              <MaterialCommunityIcons name={n.icon} size={24} color={COLOR.info} />
              <Text style={styles.navTxt}>{n.label}</Text>
              <MaterialCommunityIcons name="chevron-right" size={16} color={COLOR.inkMute} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Actividad reciente */}
        <Text style={styles.sectionLbl}>Actividad reciente</Text>
        <View style={styles.miniList}>
          {p.activity.slice(0, 3).map(a => (
            <View key={a.id} style={styles.miniSale}>
              <Text style={styles.miniTime}>{a.hora}</Text>
              <Text style={styles.miniDesc} numberOfLines={1}>{a.desc}</Text>
              <Text style={[styles.miniAmt, !a.income && styles.miniAmtExp]}>{a.income ? '+' : '−'}{Lk(a.monto)}</Text>
            </View>
          ))}
          <TouchableOpacity onPress={p.onVerTodas}><Text style={styles.verTodas}>Ver todas →</Text></TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.bg },
  appbar: { height: 56, flexDirection: 'row', alignItems: 'center', gap: SPACE.s3, paddingHorizontal: SPACE.s4, backgroundColor: COLOR.surface, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  menuBtn: { width: 40, height: 40, marginLeft: -8, justifyContent: 'center', alignItems: 'center' },
  brand: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink, letterSpacing: 2 },
  appbarRight: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: SPACE.s4 },
  storeChip: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s1, height: 32, paddingHorizontal: SPACE.s3, borderWidth: 1, borderColor: COLOR.border2, borderRadius: RADIUS.full },
  storeChipTxt: { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.semibold, color: COLOR.ink2 },

  greet: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: SPACE.s4, paddingTop: SPACE.s5 },
  greetTitle: { fontSize: FONT_SIZE.h1, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink },
  greetDate: { marginLeft: 'auto', fontSize: FONT_SIZE.label, color: COLOR.inkMute },
  greetSub: { fontSize: FONT_SIZE.label, color: COLOR.ink2, paddingHorizontal: SPACE.s4, paddingTop: SPACE.s1 },

  kpis: { flexDirection: 'row', gap: SPACE.s3, padding: SPACE.s4 },
  kpi: { flex: 1, backgroundColor: COLOR.surface, borderWidth: 1, borderColor: COLOR.border, borderRadius: RADIUS.r3, padding: SPACE.s4, ...SHADOW.sm },
  kIco: { position: 'absolute', top: SPACE.s3, right: SPACE.s3 },
  kLbl: { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.semibold, color: COLOR.inkMute, letterSpacing: 0.5 },
  kHero: { fontSize: 32, fontWeight: FONT_WEIGHT.bold, color: COLOR.income, fontFamily: 'JetBrainsMono', marginTop: SPACE.s2 },
  kBig: { fontSize: FONT_SIZE.h1, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink, marginTop: SPACE.s2 },
  kExp: { color: COLOR.expense }, kInc: { color: COLOR.income },
  kSub: { fontSize: FONT_SIZE.caption, color: COLOR.inkMute, marginTop: 2 },
  kSubWarn: { color: COLOR.warn },

  skel: { backgroundColor: COLOR.surface2, borderRadius: RADIUS.r1 },
  skLbl: { height: 10, width: '70%' },
  skVal: { height: 22, width: '90%', marginTop: SPACE.s3 },

  sectionLbl: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold, color: COLOR.ink2, paddingHorizontal: SPACE.s4, paddingTop: SPACE.s4, paddingBottom: SPACE.s2 },
  navCard: { marginHorizontal: SPACE.s4, backgroundColor: COLOR.surface, borderWidth: 1, borderColor: COLOR.border, borderRadius: RADIUS.r3, overflow: 'hidden', ...SHADOW.sm },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s3, height: 56, paddingHorizontal: SPACE.s4, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  navItemLast: { borderBottomWidth: 0 },
  navTxt: { flex: 1, fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.medium, color: COLOR.ink },

  miniList: { paddingHorizontal: SPACE.s4, paddingBottom: SPACE.s6 },
  miniSale: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s3, paddingVertical: SPACE.s3, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  miniTime: { fontSize: FONT_SIZE.label, color: COLOR.inkMute, fontFamily: 'JetBrainsMono' },
  miniDesc: { flex: 1, fontSize: FONT_SIZE.label, color: COLOR.ink2 },
  miniAmt: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold, color: COLOR.income, fontFamily: 'JetBrainsMono' },
  miniAmtExp: { color: COLOR.expense },
  verTodas: { fontSize: FONT_SIZE.label, color: COLOR.info, textAlign: 'right', paddingTop: SPACE.s3 },
});
