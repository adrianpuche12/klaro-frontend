import React, { useState } from 'react';
import { View, StyleSheet, useWindowDimensions, TouchableOpacity, Text } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Sidebar, { SidebarScreen } from '../components/Sidebar';
import { StoreProvider } from '../context/StoreContext';
import { UIPreferencesProvider } from '../context/UIPreferencesContext';
import { COLOR, SPACE, FONT_SIZE, FONT_WEIGHT, CONTROL, BREAKPOINT } from '../theme';
import AdminScreen from './AdminScreen';
import StoresScreen from './StoresScreen';
import InventoryScreen from './InventoryScreen';
import POSScreen from './POSScreen';
import SalesHistoryScreen from './SalesHistoryScreen';
import DashboardScreen from './DashboardScreen';
import UsersScreen from './UsersScreen';
import TenantConfigScreen from './TenantConfigScreen';

const SCREEN_TITLE: Record<SidebarScreen, string> = {
  dashboard:    'Dashboard',
  operations:   'Operaciones',
  inventory:    'Inventario',
  stores:       'Locales',
  salesHistory: 'Historial ventas',
  users:        'Usuarios',
  sales:        'Ventas',
  tenantConfig: 'Configuración',
};

const AdminDashboard = () => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= BREAKPOINT.desktop;

  const [activeScreen, setActiveScreen] = useState<SidebarScreen>('dashboard');
  const [drawerOpen, setDrawerOpen]     = useState(false);

  return (
    <UIPreferencesProvider>
    <StoreProvider>
      <View style={styles.container}>

        {/* Sidebar fijo en desktop */}
        {isDesktop && (
          <Sidebar
            active={activeScreen}
            onSelect={setActiveScreen}
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
          {activeScreen === 'operations'   && <AdminScreen />}
          {activeScreen === 'inventory'    && <InventoryScreen />}
          {activeScreen === 'stores'       && <StoresScreen />}
          {activeScreen === 'sales'        && <POSScreen />}
          {activeScreen === 'salesHistory' && <SalesHistoryScreen />}
          {activeScreen === 'tenantConfig' && <TenantConfigScreen />}
        </View>

        {/* Drawer mobile */}
        {!isDesktop && (
          <Sidebar
            active={activeScreen}
            onSelect={setActiveScreen}
            visible={drawerOpen}
            onClose={() => setDrawerOpen(false)}
          />
        )}
      </View>
    </StoreProvider>
    </UIPreferencesProvider>
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
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLOR.brand,
    paddingHorizontal: SPACE.s4,
    paddingVertical: SPACE.s3,
    height: CONTROL.appBarH,
    gap: SPACE.s3,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.brandDark,
  },
  menuBtn:     { padding: SPACE.s1 },
  topbarTitle: {
    fontSize: FONT_SIZE.h2,
    fontWeight: FONT_WEIGHT.bold as any,
    color: COLOR.ink,
  },
});

export default AdminDashboard;
