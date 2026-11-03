import React, { useEffect, useState } from 'react';
import { View, StyleSheet, useWindowDimensions, TouchableOpacity, Text, BackHandler, Platform } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { canOpen, isPrivileged, menuFor, SCREEN_TITLE, SidebarScreen } from '../config/navConfig';
import { COLOR, SPACE, FONT_SIZE, FONT_WEIGHT, CONTROL, BREAKPOINT } from '../theme';
import AdminScreen from './AdminScreen';
import StoresScreen from './StoresScreen';
import InventoryScreen from './InventoryScreen';
import POSScreen from './POSScreen';
import SalesHistoryScreen from './SalesHistoryScreen';
import ReportsScreen from './ReportsScreen';
import DashboardScreen from './DashboardScreen';
import UsersScreen from './UsersScreen';
import RolesScreen from './RolesScreen';
import TenantConfigScreen from './TenantConfigScreen';
import DynamicFormScreen from './DynamicFormScreen';

const AdminDashboard = () => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= BREAKPOINT.desktop;

  const { roles, canManageUsers, permissions, fullAccess } = useAuth();
  const access = { roles, canManageUsers, permissions, fullAccess };
  const params = useLocalSearchParams<{ s?: string }>();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Primera pantalla del menú de este usuario (antes era siempre 'dashboard', aunque
  // su menú no lo incluyera).
  const home: SidebarScreen = menuFor(access)[0]?.key ?? 'sales';
  // N-02: la pantalla activa vive en la URL (/admin?s=inventory): sobrevive a la recarga
  // y se puede compartir. Una pantalla que este usuario no puede abrir cae en home.
  const activeScreen: SidebarScreen = canOpen(access, params.s) ? params.s : home;
  const go = (screen: SidebarScreen) => router.setParams({ s: screen });

  // N-02: en Android, atrás vuelve al inicio del panel en vez de cerrar la app.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (drawerOpen) { setDrawerOpen(false); return true; }
      if (activeScreen !== home) { go(home); return true; }
      return false;
    });
    return () => sub.remove();
  }, [activeScreen, home, drawerOpen]);

  // K-01: el panel es solo para root y staff con canManageUsers, aunque se llegue
  // escribiendo la URL. (El backend igual valida cada endpoint.)
  if (!isPrivileged(access)) return <Redirect href="/" />;

  return (
    // N-04: respeta el notch en mobile.
    <SafeAreaView style={styles.container} edges={isDesktop ? [] : ['top']}>

        {/* Sidebar fijo en desktop */}
        {isDesktop && (
          <Sidebar
            active={activeScreen}
            onSelect={go}
            visible={false}
            onClose={() => {}}
          />
        )}

        {/* Área de contenido */}
        <View style={styles.content}>

          {/* Topbar mobile */}
          {!isDesktop && (
            <View style={styles.topbar}>
              <TouchableOpacity
                onPress={() => setDrawerOpen(true)}
                style={styles.menuBtn}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Abrir menú"
              >
                <MaterialCommunityIcons name="menu" size={24} color={COLOR.ink} />
              </TouchableOpacity>
              <Text style={styles.topbarTitle}>
                {SCREEN_TITLE[activeScreen] ?? 'Menú'}
              </Text>
            </View>
          )}

          {/* Pantalla activa */}
          {activeScreen === 'dashboard'    && <DashboardScreen />}
          {activeScreen === 'users'        && <UsersScreen />}
          {activeScreen === 'roles'        && <RolesScreen />}
          {activeScreen === 'finance'      && <AdminScreen />}
          {activeScreen === 'operations'   && <DynamicFormScreen />}
          {activeScreen === 'inventory'    && <InventoryScreen />}
          {activeScreen === 'stores'       && <StoresScreen />}
          {activeScreen === 'sales'        && <POSScreen />}
          {activeScreen === 'salesHistory' && <SalesHistoryScreen />}
          {activeScreen === 'reports'      && <ReportsScreen />}
          {activeScreen === 'tenantConfig' && <TenantConfigScreen />}
        </View>

        {/* Drawer mobile */}
        {!isDesktop && (
          <Sidebar
            active={activeScreen}
            onSelect={go}
            visible={drawerOpen}
            onClose={() => setDrawerOpen(false)}
          />
        )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLOR.bg,
  },
  content: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: COLOR.bg,
  },
  // Fondo neutro, no dorado: visible en todas las pantallas del mobile,
  // un fondo sólido en COLOR.brand rompería la regla 60-30-10.
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLOR.surface,
    paddingHorizontal: SPACE.s4,
    paddingVertical: SPACE.s3,
    height: CONTROL.appBarH,
    gap: SPACE.s3,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.border,
  },
  menuBtn:     { padding: SPACE.s1 },
  topbarTitle: {
    fontSize: FONT_SIZE.h2,
    fontWeight: FONT_WEIGHT.bold as any,
    color: COLOR.ink,
  },
});

export default AdminDashboard;
