// UserDashboard.tsx — orquestador del cajero (rol user)
// Gestiona navegación, turno activo y ventas del turno.
import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, useWindowDimensions, ActivityIndicator } from 'react-native';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import POSScreen from './POSScreen';
import InventoryScreen from './InventoryScreen';
import SalesHistoryScreen from './SalesHistoryScreen';
import DynamicFormScreen from './DynamicFormScreen';
import { COLOR, BREAKPOINT } from '../theme';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { REACT_APP_API_URL } from '../config';

import UserDashboardView from './UserDashboardView';

type SidebarKey = 'dashboard' | 'ventas' | 'inventario' | 'historial' | 'operaciones' | 'usuarios' | 'locales' | 'configuracion';

function formatHora(dt: string): string {
  try { return new Date(dt).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
}

export default function UserDashboard() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= BREAKPOINT.desktop;
  const { userName, logout } = useAuth();
  const { selectedStore } = useStore();

  const [activeScreen, setActiveScreen] = useState<SidebarKey>('dashboard');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [turno, setTurno] = useState<any>(null);
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date().toLocaleDateString('es-HN', { weekday: 'short', day: 'numeric', month: 'short' });
  const firstName = (userName ?? 'Usuario').split('.')[0];
  const firstName_ = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  const loadTurno = useCallback(async () => {
    if (!selectedStore) return;
    setLoading(true);
    try {
      const shiftRes = await axios.get(`${REACT_APP_API_URL}/api/v2/shifts/active/${selectedStore.id}`)
        .catch(e => e.response?.status === 204 ? { data: null } : Promise.reject(e));
      const shift = shiftRes.data;
      if (!shift?.id) { setTurno({ abierto: false }); setSales([]); return; }

      const abierto = new Date(shift.startTime ?? shift.createdAt);
      const ahora = new Date();
      const mins = Math.round((ahora.getTime() - abierto.getTime()) / 60000);
      const activo = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;

      setTurno({
        abierto: true,
        desde: abierto.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }),
        activo,
        ventas: shift.salesCount ?? 0,
        total: Number(shift.totalAmount ?? 0),
        id: shift.id,
      });

      const salesRes = await axios.get(`${REACT_APP_API_URL}/api/v2/shifts/${shift.id}/sales`);
      setSales((salesRes.data ?? []).slice(0, 5).map((s: any) => ({
        id: String(s.id),
        hora: formatHora(s.createdAt),
        desc: (s.items ?? []).map((i: any) => i.productName ?? i.nombre).join(', ') || 'Venta',
        monto: Number(s.total ?? 0),
      })));
    } catch (e) {
      console.error('[UserDashboard] loadTurno error', e);
      setTurno({ abierto: false });
    } finally {
      setLoading(false);
    }
  }, [selectedStore?.id]);

  useEffect(() => { if (activeScreen === 'dashboard') loadTurno(); }, [activeScreen, selectedStore?.id]);

  const handleAbrirTurno = async () => {
    if (!selectedStore) return;
    await axios.post(`${REACT_APP_API_URL}/api/v2/stores/${selectedStore.id}/shifts`, { username: userName ?? 'user' });
    loadTurno();
  };

  const handleCerrarTurno = async () => {
    if (!turno?.id) return;
    await axios.put(`${REACT_APP_API_URL}/api/v2/shifts/${turno.id}/close`);
    loadTurno();
  };

  const navigate = (key: SidebarKey) => {
    setActiveScreen(key);
    if (!isDesktop) setDrawerOpen(false);
  };

  const renderScreen = () => {
    switch (activeScreen) {
      case 'dashboard':
        return loading && !turno ? (
          <View style={styles.loader}><ActivityIndicator size="large" color={COLOR.brand} /></View>
        ) : (
          <UserDashboardView
            firstName={firstName_}
            fecha={today}
            storeName={selectedStore?.name ?? '—'}
            turno={turno ?? { abierto: false }}
            sales={sales}
            onMenu={() => setDrawerOpen(true)}
            onBell={() => {}}
            onStorePress={() => {}}
            onVentas={() => navigate('ventas')}
            onInventario={() => navigate('inventario')}
            onAbrirTurno={handleAbrirTurno}
            onCerrarTurno={handleCerrarTurno}
            onVerHistorial={() => navigate('historial')}
          />
        );
      case 'ventas':    return <POSScreen onMenu={() => setDrawerOpen(true)} />;
      case 'inventario':return <InventoryScreen />;
      case 'historial': return <SalesHistoryScreen />;
      case 'operaciones':return <DynamicFormScreen />;
      default:          return null;
    }
  };

  return (
    <View style={styles.container}>
      {isDesktop && (
        <Sidebar open={false} onClose={() => {}} role="user" username={userName ?? '—'}
          active={activeScreen} onNavigate={navigate} onLogout={logout} />
      )}
      <View style={styles.content}>{renderScreen()}</View>
      {!isDesktop && (
        <Sidebar open={drawerOpen} onClose={() => setDrawerOpen(false)} role="user"
          username={userName ?? '—'} active={activeScreen} onNavigate={navigate} onLogout={logout} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', backgroundColor: COLOR.bg },
  content: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
