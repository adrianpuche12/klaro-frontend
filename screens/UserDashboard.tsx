import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, Modal, BackHandler, Platform } from 'react-native';
import { ActivityIndicator, Button, IconButton } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import axios from 'axios';
import { useStore, Store } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { REACT_APP_API_URL } from '../config';
import { BRAND_NAME } from '../constants/brand';
import ConfirmDialog from '../components/ConfirmDialog';
import { COLOR, SPACE, RADIUS, FONT_SIZE, FONT_WEIGHT, BREAKPOINT, CONTROL } from '../theme';
import AppText from '../components/ui/AppText';
import POSScreen from './POSScreen';
import InventoryScreen from './InventoryScreen';
import SalesHistoryScreen from './SalesHistoryScreen';
import ReportsScreen from './ReportsScreen';
import DynamicFormScreen from './DynamicFormScreen';
import DashboardScreen from './DashboardScreen';
import AdminScreen from './AdminScreen';

type UserScreen = 'dashboard' | 'sales' | 'inventory' | 'salesHistory' | 'reports' | 'finance' | 'operaciones';

// Mapea cada item de menú al/los módulo(s) de permisos que lo habilitan
// (SPRINT-09/SPRINT-14). Mismo catálogo que PermissionModule en el backend /
// MODULES en constants/permissionModules.ts. "Inventario" cubre INVENTORY+
// CATALOG y "Finanzas" cubre TRANSACTIONS+SALARY_PAYMENTS+SUPPLIER_PAYMENTS
// porque hoy son pantallas compartidas -- ver Sidebar.tsx (mismo agrupamiento
// para el dashboard de staff privilegiado).
const MENU: { key: UserScreen; label: string; icon: string; modules: string[] }[] = [
  { key: 'dashboard',    label: 'Dashboard',   icon: 'view-dashboard-outline',    modules: ['DASHBOARD'] },
  { key: 'sales',        label: 'Ventas',      icon: 'cart-outline',              modules: ['POS'] },
  { key: 'inventory',    label: 'Inventario',  icon: 'package-variant',           modules: ['INVENTORY', 'CATALOG'] },
  { key: 'salesHistory', label: 'Mis ventas',  icon: 'receipt',      modules: ['SALES_HISTORY'] },
  { key: 'reports',      label: 'Informes',    icon: 'file-chart-outline',        modules: ['SALES_HISTORY', 'OPERATIONS'] },
  { key: 'finance',      label: 'Finanzas',    icon: 'cash-multiple',             modules: ['TRANSACTIONS', 'SALARY_PAYMENTS', 'SUPPLIER_PAYMENTS'] },
  { key: 'operaciones',  label: 'Operaciones', icon: 'clipboard-text-outline',    modules: ['OPERATIONS'] },
];

/** Perfil del usuario: acá solo se usa para el local asignado (P-01). */
interface UserProfile {
  storeId?: number | null;
  accessibleStoreIds?: number[];
}

/**
 * Filtra el menú según el acceso que resolvió AuthContext. fullAccess es la excepción
 * legacy confirmada por el servidor (PermissionGuard.isLegacy en el backend). Con Role
 * asignado, "permissions vacío" significa CERO módulos, no todos.
 * Falla cerrada: antes el menú salía de una consulta propia del perfil y, si fallaba
 * (red, timeout, 5xx), profile quedaba null = menú completo. Ahora un error deja
 * permissions = [] y el layout muestra "No pudimos cargar tus permisos".
 */
function visibleMenuFor(access: { fullAccess: boolean; permissions: string[] }): typeof MENU {
  if (access.fullAccess) return MENU;
  return MENU.filter(item => item.modules.some(m => access.permissions.includes(m)));
}

/** U-02: ¿el valor de ?s= es una sección del menú visible de este usuario? */
const isMenuScreen = (menu: typeof MENU, v?: string): v is UserScreen => menu.some(m => m.key === v);

// ─── Sidebar del usuario ──────────────────────────────────────────────────────

const UserSidebar = ({ menu, active, onSelect, onClose, isDesktop, store }: {
  menu: typeof MENU; active: UserScreen | null; onSelect: (s: UserScreen) => void;
  onClose: () => void; isDesktop: boolean;
  /** U-05: local asignado al cajero (P-01). null mientras no se confirma; nunca stores[0]. */
  store: Store | null;
}) => {
  const { logout, userName } = useAuth();
  const [askLogout, setAskLogout] = useState(false);
  return (
    <View style={styles.sidebar}>
      <View style={styles.sidebarHeader}>
        <View style={styles.flex}>
          {/* U-06: nombre de la app desde constants/brand.ts */}
          <Text style={styles.brandText}>{BRAND_NAME}</Text>
          <Text style={styles.brandSub} numberOfLines={1}>{userName}</Text>
          {/* U-05: el cajero siempre ve en qué local está vendiendo */}
          {store && (
            <View style={styles.storePill}>
              <MaterialCommunityIcons name="store-outline" size={13} color={COLOR.ink} />
              <Text style={styles.storePillText} numberOfLines={1}>{store.name}</Text>
            </View>
          )}
        </View>
        {!isDesktop && (
          <IconButton icon="close" size={20} iconColor={COLOR.ink} onPress={onClose} style={{ margin: 0 }} accessibilityLabel="Cerrar menú" />
        )}
      </View>

      <View style={styles.menuScroll}>
        {menu.length === 0 && (
          <AppText variant="caption" style={{ paddingHorizontal: SPACE.s4 }}>
            Sin módulos asignados todavía.
          </AppText>
        )}
        {menu.map(item => {
          const on = active === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.menuItem, on && styles.menuItemActive]}
              onPress={() => { onSelect(item.key); if (!isDesktop) onClose(); }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <MaterialCommunityIcons
                name={item.icon}
                size={20}
                color={on ? COLOR.brandDeep : COLOR.ink2}
              />
              <Text style={[styles.menuLabel, on && styles.menuLabelActive]}>
                {item.label}
              </Text>
              {on && <View style={styles.activeBar} />}
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={() => setAskLogout(true)} accessibilityRole="button">
        <MaterialCommunityIcons name="logout" size={18} color={COLOR.expense} />
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>

      {/* U-02 (= N-03): confirmar antes de salir; una venta a medio cargar se pierde */}
      <ConfirmDialog
        visible={askLogout}
        title="¿Cerrar sesión?"
        message="Si tenés una venta a medio cargar, se va a perder."
        confirmLabel="Cerrar sesión"
        onConfirm={() => { setAskLogout(false); logout(); }}
        onCancel={() => setAskLogout(false)}
      />
    </View>
  );
};

// ─── Contenido interno (necesita StoreContext activo) ─────────────────────────

const UserContent = () => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= BREAKPOINT.desktop;
  const { userName, permissions, fullAccess } = useAuth();
  const { stores, selectedStore, setSelectedStore, loadingStores, refreshStores } = useStore();
  const params = useLocalSearchParams<{ s?: string }>();

  const [profile, setProfile]         = useState<UserProfile | null>(null);
  // P-01: estado de la consulta del perfil. null = consultando.
  const [profileStatus, setProfileStatus] = useState<'ok' | 'notFound' | 'error' | null>(null);
  const [attempt, setAttempt]         = useState(0);
  const [drawerOpen, setDrawerOpen]   = useState(false);
  const [ready, setReady]             = useState(false);

  // El perfil (permisos, businessRole, local principal) se resuelve una sola
  // vez por sesión, independiente de si el tenant tiene locales o no —
  // antes esto estaba encadenado a "esperar locales", lo que ocultaba la
  // navbar entera cuando stores.length === 0 (ver incidente 07-Sep-2026).
  // `attempt` permite reintentar desde la pantalla de bloqueo del POS (P-01).
  // U-04: el nombre de usuario va codificado (espacio, '#', '/').
  useEffect(() => {
    if (!userName) { setReady(true); return; }
    setProfileStatus(null);
    axios.get(`${REACT_APP_API_URL}/api/v2/users/by-username/${encodeURIComponent(userName)}`, { timeout: 15000 })
      .then(res => { setProfile(res.data); setProfileStatus('ok'); })
      // 404 = sin fila en app_users (AppUserController.findByUsername). Cualquier otro
      // error (red, timeout, 5xx) es "no sabemos", y no se puede vender a ciegas.
      .catch(e => setProfileStatus(e?.response?.status === 404 ? 'notFound' : 'error'))
      .finally(() => setReady(true));
  }, [userName, attempt]);

  // P-01: local del cajero. Solo el que le asignó el administrador (local principal o,
  // si no tiene, el primero activo de sus locales accesibles). NUNCA stores[0]: antes,
  // si la consulta fallaba o no tenía local, vendía en el primer local sin verlo
  // (el POS oculta el selector con hideStoreSelector).
  const assignedStore = useMemo(() => {
    if (profileStatus !== 'ok' || !profile) return null;
    return stores.find(s => s.id === profile.storeId)
      ?? stores.find(s => (profile.accessibleStoreIds ?? []).includes(s.id))
      ?? null;
  }, [profileStatus, profile, stores]);

  useEffect(() => {
    if (assignedStore && selectedStore?.id !== assignedStore.id) setSelectedStore(assignedStore);
  }, [assignedStore, selectedStore, setSelectedStore]);

  const posStoreError: string | null =
    profileStatus === 'error'
      ? 'No pudimos confirmar en qué local trabajás. Revisá la conexión e intentá de nuevo.'
      : profileStatus === 'notFound' || (profileStatus === 'ok' && !loadingStores && !assignedStore)
        ? 'Tu usuario no tiene un local activo asignado. Pedí al administrador que te asigne uno.'
        : null;
  const posStoreReady = !!assignedStore && selectedStore?.id === assignedStore.id;
  const retryPosStore = () => { refreshStores(); setAttempt(a => a + 1); };

  const visibleMenu = visibleMenuFor({ fullAccess, permissions });

  // U-02 (= N-02): la sección vive en la URL (/?s=inventory) → sobrevive a la recarga.
  // Derivado durante el render, sin estado extra (ver "05. Estandares de Codigo
  // Frontend" en el vault). Solo vale una sección del menú VISIBLE: un ?s= escrito
  // a mano que este usuario no tiene habilitado cae en la primera de su menú.
  const home: UserScreen | null = visibleMenu[0]?.key ?? null;
  const active: UserScreen | null = isMenuScreen(visibleMenu, params.s) ? params.s : home;
  const go = (s: UserScreen) => router.setParams({ s });

  // U-01: el POS queda montado (oculto) una vez abierto → pasar a Inventario o a
  // "Mis ventas" ya no vacía el carrito. Las demás secciones se montan a demanda.
  // (`|| active === 'sales'` evita un render en blanco antes de que corra el Effect.)
  const [posOpened, setPosOpened] = useState(false);
  useEffect(() => { if (active === 'sales') setPosOpened(true); }, [active]);
  const posMounted = posOpened || active === 'sales';

  // U-02 (= N-02): en Android, atrás cierra el menú o vuelve al inicio antes de salir.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (drawerOpen) { setDrawerOpen(false); return true; }
      if (home && active !== home) { go(home); return true; }
      return false;
    });
    return () => sub.remove();
  }, [active, home, drawerOpen]);

  const screenTitle = visibleMenu.find(m => m.key === active)?.label ?? BRAND_NAME;
  const noStores = !loadingStores && stores.length === 0;

  // El menú ya no depende de este fetch: si falla, solo se bloquea el POS (P-01).
  // Si falló el perfil de acceso, ni se llega acá (AccessErrorScreen en el layout).
  if (!ready) {
    return <ActivityIndicator size="large" color={COLOR.brand} style={{ flex: 1, marginTop: 60 }} />;
  }

  return (
    // U-02 (= N-04): respeta el notch en mobile, igual que AdminDashboard.
    <SafeAreaView style={styles.container} edges={isDesktop ? [] : ['top']}>
      {isDesktop && (
        <UserSidebar menu={visibleMenu} active={active} onSelect={go} onClose={() => {}} isDesktop store={assignedStore} />
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
            <Text style={styles.topbarTitle} numberOfLines={1}>{screenTitle}</Text>
          </View>
        )}

        {visibleMenu.length === 0 ? (
          <View style={styles.emptyState}>
            <AppText variant="title" centered>Sin módulos asignados</AppText>
            <AppText variant="description" centered style={{ marginTop: 8 }}>
              Pedí al administrador que te asigne acceso a algún módulo.
            </AppText>
          </View>
        ) : noStores ? (
          // U-06: stores vacío = no hay NINGÚN local activo que este usuario pueda usar
          // (P10: StoreContext ya filtra por sus locales permitidos).
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="store-alert-outline" size={48} color={COLOR.warn} />
            <AppText variant="title" centered style={{ marginTop: SPACE.s3 }}>No hay locales activos</AppText>
            <AppText variant="description" centered style={{ marginTop: 8 }}>
              Pedí al administrador que active un local y te lo asigne.
            </AppText>
          </View>
        ) : (
          <>
            {active === 'dashboard'    && <DashboardScreen />}
            {/* U-01: el POS no se desmonta al cambiar de sección: se oculta con display:none.
                Solo se monta con el local asignado confirmado (P-01). */}
            {posMounted && posStoreReady && !posStoreError && (
              <View style={[styles.flex, active !== 'sales' && styles.hidden]}>
                <POSScreen hideStoreSelector />
              </View>
            )}
            {active === 'sales' && (
              posStoreError ? (
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons name="store-alert-outline" size={48} color={COLOR.warn} />
                  <AppText variant="title" centered style={{ marginTop: SPACE.s3 }}>No se pudo abrir el punto de venta</AppText>
                  <AppText variant="description" centered style={{ marginTop: SPACE.s2 }}>{posStoreError}</AppText>
                  <Button
                    mode="contained"
                    buttonColor={COLOR.brand}
                    textColor={COLOR.inkOnBrand}
                    style={{ marginTop: SPACE.s4, borderRadius: RADIUS.r2 }}
                    onPress={retryPosStore}
                  >
                    Reintentar
                  </Button>
                </View>
              ) : !posStoreReady ? (
                <ActivityIndicator size="large" color={COLOR.brand} style={{ flex: 1, marginTop: 60 }} />
              ) : null
            )}
            {active === 'inventory'    && <InventoryScreen />}
            {active === 'salesHistory' && <SalesHistoryScreen mine store={assignedStore} />}
            {active === 'reports'      && <ReportsScreen store={assignedStore} />}
            {active === 'finance'      && <AdminScreen />}
            {active === 'operaciones'  && <DynamicFormScreen />}
          </>
        )}
      </View>

      {!isDesktop && (
        // U-02 (= N-07): 'fade' en vez de 'slide': el menú lateral ya no sube desde abajo.
        <Modal visible={drawerOpen} transparent animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
          <View style={styles.drawerOverlay}>
            <UserSidebar menu={visibleMenu} active={active} onSelect={go} onClose={() => setDrawerOpen(false)} isDesktop={false} store={assignedStore} />
            <TouchableOpacity style={styles.drawerBg} onPress={() => setDrawerOpen(false)} accessibilityLabel="Cerrar menú" />
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
};

// ─── UserDashboard (punto de entrada) ─────────────────────────────────────────

const UserDashboard = () => <UserContent />;

export default UserDashboard;

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex:            { flex: 1 },
  hidden:          { display: 'none' },
  container:       { flex: 1, flexDirection: 'row', backgroundColor: COLOR.bg },
  content:         { flex: 1, flexDirection: 'column' },

  // U-06: mismo ancho que el sidebar del admin (260 px)
  sidebar:         { width: 260, backgroundColor: COLOR.surface, borderRightWidth: 1, borderRightColor: COLOR.border, flexDirection: 'column' },
  // Fondo neutro, no dorado (regla 60-30-10) -- ver mismo criterio en Sidebar.tsx/AdminDashboard.tsx
  sidebarHeader:   { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACE.s2, padding: SPACE.s3, borderBottomWidth: 1, borderBottomColor: COLOR.border, backgroundColor: COLOR.surface },
  brandText:       { fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.black as any, color: COLOR.ink },
  brandSub:        { fontSize: FONT_SIZE.caption, color: COLOR.inkMute, fontWeight: FONT_WEIGHT.semibold as any, marginTop: 2 },
  // U-05: local del cajero
  storePill:       { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', maxWidth: '100%', marginTop: SPACE.s2, backgroundColor: COLOR.brandTint, borderRadius: RADIUS.full, paddingHorizontal: SPACE.s2, paddingVertical: 3 },
  storePillText:   { flexShrink: 1, fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },

  menuScroll:      { flex: 1, paddingTop: SPACE.s2 },
  // U-06: 48 px mínimos de área táctil
  menuItem:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.s4, paddingVertical: SPACE.s3, marginHorizontal: SPACE.s2, borderRadius: RADIUS.r2, marginBottom: 2, position: 'relative', gap: SPACE.s3, minHeight: 48 },
  menuItemActive:  { backgroundColor: COLOR.brandTint },
  menuLabel:       { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink2, flex: 1 },
  menuLabelActive: { color: COLOR.ink, fontWeight: FONT_WEIGHT.black as any },
  activeBar:       { position: 'absolute', left: 0, top: 6, bottom: 6, width: 4, backgroundColor: COLOR.brand, borderRadius: RADIUS.full },

  logoutBtn:       { flexDirection: 'row', alignItems: 'center', gap: SPACE.s2, padding: SPACE.s4, borderTopWidth: 1, borderTopColor: COLOR.border, minHeight: 52 },
  logoutText:      { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.expense },

  topbar:          { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.surface, borderBottomWidth: 1, borderBottomColor: COLOR.border, paddingHorizontal: SPACE.s3, minHeight: CONTROL.appBarH, gap: SPACE.s2 },
  menuBtn:         { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  topbarTitle:     { flex: 1, fontSize: FONT_SIZE.h2, fontWeight: FONT_WEIGHT.black as any, color: COLOR.ink },

  drawerOverlay:   { flex: 1, flexDirection: 'row' },
  drawerBg:        { flex: 1, backgroundColor: COLOR.overlay },

  emptyState:      { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
});
