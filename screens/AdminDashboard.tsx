// AdminDashboard.tsx — orquestador completo admin/root
// Gestiona navegación, drawer y datos reales del backend.
import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, useWindowDimensions, ActivityIndicator } from 'react-native';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import AdminScreen from './AdminScreen';
import StoresScreen from './StoresScreen';
import InventoryScreen from './InventoryScreen';
import POSScreen from './POSScreen';
import SalesHistoryScreen from './SalesHistoryScreen';
import UsersScreen from './UsersScreen';
import TenantConfigScreen from './TenantConfigScreen';
import { COLOR, BREAKPOINT } from '../theme';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { REACT_APP_API_URL } from '../config';

// Tipos del nuevo Sidebar
type SidebarKey = 'dashboard' | 'ventas' | 'inventario' | 'historial' | 'operaciones' | 'usuarios' | 'locales' | 'configuracion';

// Vista del dashboard — componente puro generado por Claude Design
import AdminDashboardView from './AdminDashboardView';

export default function AdminDashboard() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= BREAKPOINT.desktop;
  const { roles, userName, logout } = useAuth();
  const { selectedStore } = useStore();

  const isRoot = roles.includes('root');
  const role = isRoot ? 'root' : roles.includes('admin') ? 'admin' : 'user';

  const [activeScreen, setActiveScreen] = useState<SidebarKey>('dashboard');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // KPI data
  const [kpis, setKpis] = useState<any>(null);
  const [kpisLoading, setKpisLoading] = useState(true);
  const [activity, setActivity] = useState<any[]>([]);
  const [tenantName, setTenantName] = useState('Mi negocio');

  const today = new Date().toLocaleDateString('es-HN', { weekday: 'short', day: 'numeric', month: 'short' });

  const loadDashboard = useCallback(async () => {
    setKpisLoading(true);
    try {
      const [dashRes, cfgRes, opsRes] = await Promise.allSettled([
        axios.get(`${REACT_APP_API_URL}/api/v2/dashboard`),
        axios.get(`${REACT_APP_API_URL}/api/v3/tenant/config`),
        axios.get(`${REACT_APP_API_URL}/api/v3/operations`, { params: { page: 0, size: 3, sort: 'DATE_DESC' } }),
      ]);

      if (dashRes.status === 'fulfilled') {
        const d = dashRes.value.data;
        setKpis({
          ventasHoy: Number(d.totalAmountToday ?? 0),
          transacciones: d.totalSalesToday ?? 0,
          cierresHechos: d.totalActiveShifts ?? 0,
          cierresTotal: (d.stores ?? []).length,
          stockBajo: d.totalLowStockAlerts ?? 0,
        });
      }
      if (cfgRes.status === 'fulfilled' && cfgRes.value.data?.companyName) {
        setTenantName(cfgRes.value.data.companyName);
      }
      if (opsRes.status === 'fulfilled') {
        const ops = Array.isArray(opsRes.value.data) ? opsRes.value.data : (opsRes.value.data?.content ?? []);
        setActivity(ops.slice(0, 3).map((op: any) => ({
          id: String(op.id),
          hora: op.date ? new Date(op.date).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }) : '—',
          desc: op.description ?? op.type ?? '—',
          monto: Number(op.amount ?? 0),
          income: ['SALE', 'CLOSING'].includes(op.type),
        })));
      }
    } catch (e) {
      console.error('[AdminDashboard] loadDashboard error', e);
    } finally {
      setKpisLoading(false);
    }
  }, []);

  useEffect(() => { if (activeScreen === 'dashboard') loadDashboard(); }, [activeScreen]);

  const navigate = (key: SidebarKey) => {
    setActiveScreen(key);
    if (!isDesktop) setDrawerOpen(false);
  };

  const renderScreen = () => {
    switch (activeScreen) {
      case 'dashboard':
        return kpisLoading && !kpis ? (
          <View style={styles.loader}><ActivityIndicator size="large" color={COLOR.brand} /></View>
        ) : (
          <AdminDashboardView
            tenantName={tenantName}
            fecha={today}
            isRoot={isRoot}
            loading={kpisLoading}
            kpis={kpis}
            activity={activity}
            onMenu={() => setDrawerOpen(true)}
            onBell={() => {}}
            onStorePress={() => {}}
            onNavigate={(key) => navigate(key as SidebarKey)}
            onVerTodas={() => navigate('operaciones')}
          />
        );
      case 'operaciones':   return <AdminScreen />;
      case 'inventario':    return <InventoryScreen />;
      case 'locales':       return <StoresScreen />;
      case 'ventas':        return <POSScreen onMenu={() => setDrawerOpen(true)} />;
      case 'historial':     return <SalesHistoryScreen />;
      case 'usuarios':      return <UsersScreen />;
      case 'configuracion': return <TenantConfigScreen />;
      default:              return null;
    }
  };

  return (
    <View style={styles.container}>
      {isDesktop && (
        <Sidebar
          open={false}
          onClose={() => {}}
          role={role}
          username={userName ?? '—'}
          active={activeScreen}
          onNavigate={navigate}
          onLogout={logout}
        />
      )}

      <View style={styles.content}>
        {renderScreen()}
      </View>

      {!isDesktop && (
        <Sidebar
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          role={role}
          username={userName ?? '—'}
          active={activeScreen}
          onNavigate={navigate}
          onLogout={logout}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', backgroundColor: COLOR.bg },
  content: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
