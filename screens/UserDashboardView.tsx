// =============================================================================
// UserDashboard.tsx  ·  screens/UserDashboard.tsx
// Dashboard del cajero (rol user). Punto de entrada post-login.
// Sin emojis, sin inline styles, sin hex. Conectá tus datos reales (turno, ventas)
// por props/hooks; NO cambies su lógica.
// =============================================================================
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLOR, SPACE, FONT_SIZE, FONT_WEIGHT, RADIUS, CONTROL, SHADOW } from '../theme';

interface SaleMini { id: string; hora: string; desc: string; monto: number; }
interface Turno { abierto: boolean; desde?: string; activo?: string; ventas?: number; total?: number; }

const L = (n: number) => `L ${n.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  firstName: string;
  fecha: string;            // "Lun 2 Jun"
  storeName: string;
  turno: Turno;
  sales: SaleMini[];
  onMenu: () => void;
  onBell: () => void;
  onStorePress: () => void;
  onVentas: () => void;
  onInventario: () => void;
  onAbrirTurno: () => void;
  onCerrarTurno: () => void;
  onVerHistorial: () => void;
}

export default function UserDashboardView(p: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.appbar}>
        <TouchableOpacity style={styles.menuBtn} onPress={p.onMenu}><MaterialCommunityIcons name="menu" size={24} color={COLOR.ink} /></TouchableOpacity>
        <Text style={styles.brand}>BELOPIA</Text>
        <View style={styles.appbarRight}>
          <TouchableOpacity onPress={p.onBell}><MaterialCommunityIcons name="bell-outline" size={22} color={COLOR.ink2} /></TouchableOpacity>
          <TouchableOpacity style={styles.storeChip} onPress={p.onStorePress}>
            <MaterialCommunityIcons name="store-outline" size={13} color={COLOR.inkMute} />
            <Text style={styles.storeChipTxt}>{p.storeName.replace('Sucursal ', '')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView>
        <View style={styles.greet}>
          <Text style={styles.greetTitle}>Buen día, {p.firstName}</Text>
          <Text style={styles.greetDate}>{p.fecha}</Text>
        </View>
        <Text style={styles.greetSub}>Local: {p.storeName}</Text>

        {/* Turno */}
        {p.turno.abierto ? (
          <View style={styles.turnoCard}>
            <View style={styles.turnoH}><View style={styles.dotIncome} /><Text style={styles.turnoLbl}>TURNO ACTIVO</Text></View>
            <View style={styles.turnoSep} />
            <Text style={styles.turnoMeta}>Abierto desde las {p.turno.desde} · {p.turno.activo}</Text>
            <View style={styles.turnoRow}>
              <Text style={styles.turnoKpi}>{p.turno.ventas} ventas</Text>
              <Text style={styles.turnoAmt}>{L(p.turno.total ?? 0)}</Text>
              <TouchableOpacity style={styles.btnDangerO} onPress={p.onCerrarTurno}><Text style={styles.btnDangerOTxt}>Cerrar turno</Text></TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={[styles.turnoCard, styles.turnoEmpty]}>
            <View style={styles.turnoH}><View style={styles.dotWarn} /><Text style={styles.turnoLblWarn}>SIN TURNO ABIERTO</Text></View>
            <Text style={styles.turnoEmptyTxt}>Abrí un turno para empezar a registrar ventas.</Text>
            <TouchableOpacity style={styles.btnFull} onPress={p.onAbrirTurno}><Text style={styles.btnFullTxt}>Abrir turno</Text></TouchableOpacity>
          </View>
        )}

        {/* Acceso rápido */}
        <Text style={styles.sectionLbl}>Acceso rápido</Text>
        <View style={styles.qaGrid}>
          <TouchableOpacity style={[styles.qa, styles.qaBrand]} onPress={p.onVentas}>
            <MaterialCommunityIcons name="point-of-sale" size={40} color={COLOR.inkOnBrand} />
            <Text style={styles.qaTitleBrand}>Ventas</Text>
            <Text style={styles.qaSubBrand}>Registrar venta</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.qa, styles.qaSurface]} onPress={p.onInventario}>
            <MaterialCommunityIcons name="package-variant-closed" size={40} color={COLOR.info} />
            <Text style={styles.qaTitle}>Inventario</Text>
            <Text style={styles.qaSub}>Ver stock</Text>
          </TouchableOpacity>
        </View>

        {/* Ventas del turno */}
        <Text style={styles.sectionLbl}>Ventas del turno</Text>
        <View style={styles.miniList}>
          {p.sales.length === 0 ? (
            <Text style={styles.miniEmpty}>Aún no hay ventas en este turno</Text>
          ) : p.sales.map(s => (
            <View key={s.id} style={styles.miniSale}>
              <Text style={styles.miniTime}>{s.hora}</Text>
              <Text style={styles.miniDesc} numberOfLines={1}>{s.desc}</Text>
              <Text style={styles.miniAmt}>{L(s.monto)}</Text>
            </View>
          ))}
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

  turnoCard: { margin: SPACE.s4, backgroundColor: COLOR.surface, borderWidth: 1, borderColor: COLOR.incomeTint, borderLeftWidth: 4, borderLeftColor: COLOR.income, borderRadius: RADIUS.r3, padding: SPACE.s4, ...SHADOW.sm },
  turnoEmpty: { borderColor: COLOR.warnTint, borderLeftColor: COLOR.warn },
  turnoH: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s2 },
  dotIncome: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLOR.income },
  dotWarn: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLOR.warn },
  turnoLbl: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold, color: COLOR.income, letterSpacing: 0.5 },
  turnoLblWarn: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold, color: COLOR.warn, letterSpacing: 0.5 },
  turnoSep: { height: 1, backgroundColor: COLOR.border, marginVertical: SPACE.s3 },
  turnoMeta: { fontSize: FONT_SIZE.label, color: COLOR.ink2 },
  turnoRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.s4, marginTop: SPACE.s3 },
  turnoKpi: { fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.semibold, color: COLOR.ink },
  turnoAmt: { fontSize: FONT_SIZE.amount, fontWeight: FONT_WEIGHT.bold, color: COLOR.income, fontFamily: 'JetBrainsMono' },
  btnDangerO: { marginLeft: 'auto', height: CONTROL.buttonSmH, paddingHorizontal: SPACE.s4, borderRadius: RADIUS.r2, borderWidth: 1, borderColor: COLOR.expense, justifyContent: 'center' },
  btnDangerOTxt: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold, color: COLOR.expense },
  turnoEmptyTxt: { fontSize: FONT_SIZE.body, color: COLOR.inkMute, marginVertical: SPACE.s3 },
  btnFull: { height: CONTROL.buttonH, borderRadius: RADIUS.r2, backgroundColor: COLOR.brand, justifyContent: 'center', alignItems: 'center' },
  btnFullTxt: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, color: COLOR.inkOnBrand },

  sectionLbl: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold, color: COLOR.ink2, paddingHorizontal: SPACE.s4, paddingTop: SPACE.s4, paddingBottom: SPACE.s3 },
  qaGrid: { flexDirection: 'row', gap: SPACE.s3, paddingHorizontal: SPACE.s4 },
  qa: { flex: 1, borderRadius: RADIUS.r3, padding: SPACE.s4, ...SHADOW.sm },
  qaBrand: { backgroundColor: COLOR.brand },
  qaSurface: { backgroundColor: COLOR.surface, borderWidth: 1, borderColor: COLOR.border },
  qaTitleBrand: { fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.bold, color: COLOR.inkOnBrand, marginTop: SPACE.s3 },
  qaSubBrand: { fontSize: FONT_SIZE.caption, color: COLOR.brandDeep, marginTop: 2 },
  qaTitle: { fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink, marginTop: SPACE.s3 },
  qaSub: { fontSize: FONT_SIZE.caption, color: COLOR.ink2, marginTop: 2 },

  miniList: { paddingHorizontal: SPACE.s4, paddingBottom: SPACE.s5 },
  miniSale: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s3, paddingVertical: SPACE.s3, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  miniTime: { fontSize: FONT_SIZE.label, color: COLOR.inkMute, fontFamily: 'JetBrainsMono' },
  miniDesc: { flex: 1, fontSize: FONT_SIZE.label, color: COLOR.ink2 },
  miniAmt: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold, color: COLOR.income, fontFamily: 'JetBrainsMono' },
  miniEmpty: { fontSize: FONT_SIZE.label, color: COLOR.inkMute, textAlign: 'center', paddingVertical: SPACE.s5 },
});
