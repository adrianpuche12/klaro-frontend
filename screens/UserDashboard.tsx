import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, Modal } from 'react-native';
import { ActivityIndicator, IconButton } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import axios from 'axios';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { REACT_APP_API_URL } from '../config';
import { COLOR, SPACE, RADIUS, FONT_SIZE, FONT_WEIGHT, BREAKPOINT } from '../theme';
import POSScreen from './POSScreen';
import InventoryScreen from './InventoryScreen';
import SalesHistoryScreen from './SalesHistoryScreen';
import DynamicFormScreen from './DynamicFormScreen';

type UserScreen = 'sales' | 'inventory' | 'salesHistory' | 'operaciones';

const MENU: { key: UserScreen; label: string; icon: string }[] = [
  { key: 'sales',        label: 'Ventas',           icon: 'cart-outline' },
  { key: 'inventory',    label: 'Inventario',        icon: 'package-variant' },
  { key: 'salesHistory', label: 'Mis ventas',        icon: 'receipt-text-outline' },
  { key: 'operaciones',  label: 'Operaciones',       icon: 'clipboard-text-outline' },
];

// ─── Sidebar del usuario ──────────────────────────────────────────────────────

const UserSidebar = ({ active, onSelect, onClose, isDesktop }: {
  active: UserScreen; onSelect: (s: UserScreen) => void;
  onClose: () => void; isDesktop: boolean;
}) => {
  const { logout, userName } = useAuth();
  return (
    <View style={styles.sidebar}>
      <View style={styles.sidebarHeader}>
        <View>
          <Text style={styles.brandText}>Belopia</Text>
          <Text style={styles.brandSub}>{userName}</Text>
        </View>
        {!isDesktop && (
          <IconButton icon="close" size={20} iconColor={COLOR.ink} onPress={onClose} style={{ margin: 0 }} />
        )}
      </View>

      <View style={styles.menuScroll}>
        {MENU.map(item => (
          <TouchableOpacity
            key={item.key}
            style={[styles.menuItem, active === item.key && styles.menuItemActive]}
            onPress={() => { onSelect(item.key); if (!isDesktop) onClose(); }}
          >
            <MaterialCommunityIcons
              name={item.icon}
              size={20}
              color={active === item.key ? COLOR.brandDeep : COLOR.ink2}
            />
            <Text style={[styles.menuLabel, active === item.key && styles.menuLabelActive]}>
              {item.label}
            </Text>
            {active === item.key && <View style={styles.activeBar} />}
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
        <MaterialCommunityIcons name="logout" size={18} color={COLOR.expense} />
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  );
};

// ─── Contenido interno (necesita StoreContext activo) ─────────────────────────

const UserContent = () => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= BREAKPOINT.desktop;
  const { userName } = useAuth();
  const { stores, setSelectedStore, loadingStores } = useStore();

  const [active, setActive]         = useState<UserScreen>('sales');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [ready, setReady]           = useState(false);

  useEffect(() => {
    if (loadingStores) return;
    if (stores.length === 0 || !userName) {
      if (stores[0]) setSelectedStore(stores[0]);
      setReady(true);
      return;
    }
    axios.get(`${REACT_APP_API_URL}/api/v2/users/by-username/${userName}`)
      .then(res => {
        const store = stores.find(s => s.id === res.data.storeId);
        if (store) setSelectedStore(store);
        else if (stores[0]) setSelectedStore(stores[0]);
      })
      .catch(() => { if (stores[0]) setSelectedStore(stores[0]); })
      .finally(() => setReady(true));
  }, [userName, stores, loadingStores]);

  const screenTitle = MENU.find(m => m.key === active)?.label ?? '';

  if (!ready) return <ActivityIndicator size="large" color={COLOR.brand} style={{ flex: 1, marginTop: 60 }} />;

  if (stores.length === 0) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
      <Text style={{ fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink, textAlign: 'center' }}>
        Sin locales asignados
      </Text>
      <Text style={{ fontSize: FONT_SIZE.body, color: COLOR.inkMute, textAlign: 'center', marginTop: 8 }}>
        Pedí al administrador que te asigne un local.
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {isDesktop && (
        <UserSidebar active={active} onSelect={setActive} onClose={() => {}} isDesktop />
      )}

      <View style={styles.content}>
        {!isDesktop && (
          <View style={styles.topbar}>
            <TouchableOpacity
              onPress={() => setDrawerOpen(true)}
              style={styles.menuBtn}
              accessibilityRole="button"
              accessibilityLabel="Abrir menú"
            >
              <MaterialCommunityIcons name="menu" size={24} color={COLOR.ink} />
            </TouchableOpacity>
            <Text style={styles.topbarTitle}>{screenTitle}</Text>
          </View>
        )}

        {active === 'sales'        && <POSScreen />}
        {active === 'inventory'    && <InventoryScreen />}
        {active === 'salesHistory' && <SalesHistoryScreen />}
        {active === 'operaciones'  && <DynamicFormScreen />}
      </View>

      {!isDesktop && (
        <Modal visible={drawerOpen} transparent animationType="slide" onRequestClose={() => setDrawerOpen(false)}>
          <View style={styles.drawerOverlay}>
            <UserSidebar active={active} onSelect={setActive} onClose={() => setDrawerOpen(false)} isDesktop={false} />
            <TouchableOpacity style={styles.drawerBg} onPress={() => setDrawerOpen(false)} />
          </View>
        </Modal>
      )}
    </View>
  );
};

// ─── UserDashboard (punto de entrada) ─────────────────────────────────────────

const UserDashboard = () => <UserContent />;

export default UserDashboard;

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:       { flex: 1, flexDirection: 'row', backgroundColor: COLOR.bg },
  content:         { flex: 1, flexDirection: 'column' },

  sidebar:         { width: 220, backgroundColor: COLOR.surface, borderRightWidth: 1, borderRightColor: COLOR.border, flexDirection: 'column' },
  sidebarHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACE.s3, borderBottomWidth: 1, borderBottomColor: COLOR.brandDark, backgroundColor: COLOR.brand },
  brandText:       { fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.black as any, color: COLOR.ink },
  brandSub:        { fontSize: FONT_SIZE.caption, color: COLOR.inkMute, fontWeight: FONT_WEIGHT.semibold as any, marginTop: 2 },

  menuScroll:      { flex: 1, paddingTop: SPACE.s2 },
  menuItem:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.s4, paddingVertical: SPACE.s3, marginHorizontal: SPACE.s2, borderRadius: RADIUS.r2, marginBottom: 2, position: 'relative', gap: SPACE.s3 },
  menuItemActive:  { backgroundColor: COLOR.brandTint },
  menuLabel:       { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink2, flex: 1 },
  menuLabelActive: { color: COLOR.ink, fontWeight: FONT_WEIGHT.black as any },
  activeBar:       { position: 'absolute', left: 0, top: 6, bottom: 6, width: 4, backgroundColor: COLOR.brand, borderRadius: RADIUS.full },

  logoutBtn:       { flexDirection: 'row', alignItems: 'center', gap: SPACE.s2, padding: SPACE.s4, borderTopWidth: 1, borderTopColor: COLOR.border },
  logoutText:      { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.expense },

  topbar:          { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.brand, paddingHorizontal: SPACE.s3, paddingVertical: SPACE.s3, gap: SPACE.s3 },
  menuBtn:         { padding: SPACE.s1 },
  topbarTitle:     { fontSize: FONT_SIZE.h2, fontWeight: FONT_WEIGHT.black as any, color: COLOR.ink },

  drawerOverlay:   { flex: 1, flexDirection: 'row' },
  drawerBg:        { flex: 1, backgroundColor: COLOR.overlay },
});
