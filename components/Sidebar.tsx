// =============================================================================
// Sidebar.tsx  ·  components/Sidebar.tsx
// Drawer de navegación. Mobile: overlay animado. Desktop (>=900): fijo a la izq.
// Sin emojis, sin inline styles, sin hex. Conservá tu navegación real (onNavigate)
// y el rol del usuario (de useAuth) — solo cambia la presentación.
// =============================================================================
import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, useWindowDimensions, ScrollView,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLOR, SPACE, FONT_SIZE, FONT_WEIGHT, RADIUS, SHADOW } from '../theme';

type Role = 'root' | 'admin' | 'user';
type Key = 'dashboard' | 'ventas' | 'inventario' | 'historial' | 'operaciones' | 'usuarios' | 'locales' | 'configuracion';

const ITEMS: { key: Key; icon: string; label: string }[] = [
  { key: 'dashboard',    icon: 'view-dashboard-outline',            label: 'Dashboard' },
  { key: 'ventas',       icon: 'point-of-sale',                     label: 'Ventas' },
  { key: 'inventario',   icon: 'package-variant-closed',            label: 'Inventario' },
  { key: 'historial',    icon: 'history',                           label: 'Historial' },
  { key: 'operaciones',  icon: 'file-document-multiple-outline',    label: 'Operaciones' },
  { key: 'usuarios',     icon: 'account-group-outline',             label: 'Usuarios' },
  { key: 'locales',      icon: 'store-outline',                     label: 'Locales' },
  { key: 'configuracion',icon: 'cog-outline',                       label: 'Configuración' },
];

const MENU_ROOT: Key[]  = ['dashboard', 'ventas', 'inventario', 'historial', 'operaciones', 'usuarios', 'locales', 'configuracion'];
const MENU_ADMIN: Key[] = ['dashboard', 'ventas', 'inventario', 'historial', 'operaciones', 'usuarios'];
const MENU_USER: Key[]  = ['ventas', 'inventario'];

function menuFor(role: Role): Key[] {
  return role === 'root' ? MENU_ROOT : role === 'admin' ? MENU_ADMIN : MENU_USER;
}

interface Props {
  open: boolean;
  onClose: () => void;
  role: Role;
  username: string;
  active: Key;
  onNavigate: (key: Key) => void;
  onLogout: () => void;
}

export default function Sidebar({ open, onClose, role, username, active, onNavigate, onLogout }: Props) {
  const { width } = useWindowDimensions();
  const fixed = width >= 900;
  const drawerW = fixed ? 280 : Math.min(width * 0.85, 300);
  const tx = useRef(new Animated.Value(fixed ? 0 : -drawerW)).current;

  useEffect(() => {
    if (fixed) return;
    Animated.timing(tx, { toValue: open ? 0 : -drawerW, duration: 240, useNativeDriver: false }).start();
  }, [open, fixed, drawerW, tx]);

  const keys = menuFor(role);

  const Panel = (
    <View style={[styles.panel, { width: drawerW }, fixed && styles.panelFixed]}>
      {/* Branding */}
      <View style={styles.head}>
        <View style={styles.logo}><MaterialCommunityIcons name="store-outline" size={20} color={COLOR.inkOnBrand} /></View>
        <Text style={styles.brand}>BELOPIA</Text>
      </View>

      {/* Usuario */}
      <View style={styles.userBox}>
        <View style={styles.avatar}><MaterialCommunityIcons name="account" size={22} color={COLOR.brandDeep} /></View>
        <View style={styles.flex}>
          <Text style={styles.username}>{username}</Text>
          <View style={[styles.roleBadge, roleStyle(role).box]}>
            <Text style={[styles.roleTxt, roleStyle(role).txt]}>{role}</Text>
          </View>
        </View>
      </View>

      {/* Menú */}
      <ScrollView style={styles.menu} contentContainerStyle={styles.menuContent}>
        <Text style={styles.sectionLbl}>NAVEGACIÓN</Text>
        {ITEMS.filter(it => keys.includes(it.key)).map(it => {
          const on = it.key === active;
          return (
            <TouchableOpacity key={it.key} style={[styles.item, on && styles.itemActive]} onPress={() => onNavigate(it.key)}>
              <MaterialCommunityIcons name={it.icon} size={20} color={on ? COLOR.brandDeep : COLOR.inkMute} />
              <Text style={[styles.itemTxt, on && styles.itemTxtActive]}>{it.label}</Text>
            </TouchableOpacity>
          );
        })}

        <View style={styles.sep} />

        <TouchableOpacity style={styles.item} onPress={onLogout}>
          <MaterialCommunityIcons name="logout" size={20} color={COLOR.expense} />
          <Text style={[styles.itemTxt, styles.logoutTxt]}>Cerrar sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  if (fixed) return Panel;

  // Mobile: overlay + drawer animado
  if (!open) return <Animated.View pointerEvents="none" style={[styles.overlay, { opacity: 0 }]} />;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <Animated.View style={[styles.drawerWrap, { transform: [{ translateX: tx }] }]}>
        {Panel}
      </Animated.View>
    </View>
  );
}

function roleStyle(role: Role) {
  if (role === 'root') return { box: styles.badgeRoot, txt: styles.badgeRootTxt };
  if (role === 'admin') return { box: styles.badgeAdmin, txt: styles.badgeAdminTxt };
  return { box: styles.badgeUser, txt: styles.badgeUserTxt };
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: COLOR.overlay },
  drawerWrap: { position: 'absolute', top: 0, bottom: 0, left: 0 },

  panel: { flex: 1, backgroundColor: COLOR.surface, borderRightWidth: 1, borderRightColor: COLOR.border, ...SHADOW.lg },
  panelFixed: { ...SHADOW.sm },

  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s3, paddingHorizontal: SPACE.s5, paddingVertical: SPACE.s6, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  logo: { width: 40, height: 40, borderRadius: RADIUS.r2, backgroundColor: COLOR.brand, justifyContent: 'center', alignItems: 'center' },
  brand: { fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink, letterSpacing: 2 },

  userBox: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s3, padding: SPACE.s4, backgroundColor: COLOR.bg, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  avatar: { width: 40, height: 40, borderRadius: RADIUS.full, backgroundColor: COLOR.brandTint, justifyContent: 'center', alignItems: 'center' },
  username: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.semibold, color: COLOR.ink },
  roleBadge: { alignSelf: 'flex-start', marginTop: 3, paddingHorizontal: SPACE.s2, paddingVertical: 1, borderRadius: RADIUS.full, borderWidth: 1 },
  roleTxt: { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.medium },
  badgeRoot: { backgroundColor: COLOR.expenseTint, borderColor: COLOR.expense }, badgeRootTxt: { color: COLOR.expense },
  badgeAdmin: { backgroundColor: COLOR.infoTint, borderColor: COLOR.info }, badgeAdminTxt: { color: COLOR.info },
  badgeUser: { backgroundColor: COLOR.brandTint, borderColor: COLOR.brand }, badgeUserTxt: { color: COLOR.brandDeep },

  menu: { flex: 1 },
  menuContent: { paddingHorizontal: SPACE.s3, paddingTop: SPACE.s4 },
  sectionLbl: { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.semibold, color: COLOR.inkMute, letterSpacing: 1.5, paddingHorizontal: SPACE.s2, marginBottom: SPACE.s2 },
  item: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s3, height: 48, borderRadius: RADIUS.r2, paddingHorizontal: SPACE.s3 },
  itemActive: { backgroundColor: COLOR.brandTint, borderLeftWidth: 3, borderLeftColor: COLOR.brand, paddingLeft: SPACE.s3 - 3 },
  itemTxt: { fontSize: FONT_SIZE.body, color: COLOR.ink2 },
  itemTxtActive: { color: COLOR.brandDeep, fontWeight: FONT_WEIGHT.semibold },
  sep: { height: 1, backgroundColor: COLOR.border, marginVertical: SPACE.s3, marginHorizontal: SPACE.s2 },
  logoutTxt: { color: COLOR.expense },
});
