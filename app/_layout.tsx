import { Slot, useSegments, useRootNavigationState, router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Sentry from '@sentry/react';
import Constants from 'expo-constants';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { StoreProvider } from '../context/StoreContext';
import { UIPreferencesProvider } from '../context/UIPreferencesContext';
import { TenantConfigProvider } from '../context/TenantConfigContext';
import { SplashScreen } from '../components/SplashScreen';
import { AccessErrorScreen } from '../components/AccessErrorScreen';
import { PaperProvider } from 'react-native-paper';
import { isPrivileged } from '../config/navConfig';

// K-09: @sentry/react es el SDK de navegador (browserTracingIntegration). En iOS/Android
// haría falta @sentry/react-native. Producción muestrea el 20 % de las trazas (antes 100 %).
if (Platform.OS === 'web' && process.env.EXPO_PUBLIC_SENTRY_DSN) {
  const env = process.env.EXPO_PUBLIC_SENTRY_ENV ?? 'development';
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    environment: env,
    // Mismo formato que el backend (belopia-backend@<sha>): qué deploy introdujo un error.
    release: `belopia-frontend@${Constants.expoConfig?.extra?.release ?? 'local'}`,
    tracesSampleRate: env === 'production' ? 0.2 : 1.0,
    integrations: [Sentry.browserTracingIntegration()],
  });
}

function RootLayoutNav() {
  const { isAuthenticated, roles, canManageUsers, loading, accessStatus, reloadAccess, logout } = useAuth();
  const segments = useSegments() as string[];
  const navigationState = useRootNavigationState();
  // Falla cerrada: sesión abierta pero sin perfil de acceso cargado (o reintentando).
  const accessBlocked = isAuthenticated && accessStatus !== 'ok';

  useEffect(() => {
    if (!navigationState?.key) return;
    // K-03 / SPRINT-14: no decidir nada hasta restaurar la sesión (y resolver
    // canManageUsers); si no, un manager rebota por "/" o por el login.
    if (loading) return;
    // Sin perfil de acceso no se navega: se ve AccessErrorScreen. Al reintentar bien,
    // este efecto corre de nuevo y manda a cada uno a su panel (ej. desde /login).
    if (accessBlocked) return;

    const first = segments[0] ?? '';
    // K-01: /admin vive dentro de (tabs) → segments = ['(tabs)', 'admin']. Antes se miraba
    // solo segments[0] y '(tabs)' estaba permitido: un cajero entraba escribiendo /admin.
    const inAdmin = segments.includes('admin');

    if (!isAuthenticated) {
      if (first !== 'login') router.replace('/login');
    } else if (roles.includes('platform')) {
      // SPRINT-16: el administrador de plataforma solo tiene la pantalla de Empresas.
      if (first !== 'plataforma') router.replace('/plataforma');
    } else if (first === 'plataforma') {
      // Ningún usuario de empresa entra a la pantalla de plataforma.
      router.replace(isPrivileged({ roles, canManageUsers }) ? '/admin' : '/');
    } else if (isPrivileged({ roles, canManageUsers })) {
      // Root y staff con canManageUsers van al panel de administración.
      if (first === 'login') router.replace('/admin');
    } else {
      // Staff sin canManageUsers: solo la pantalla de usuario.
      if (first === 'login' || inAdmin || (first !== '(tabs)' && first !== 'index' && first !== '')) {
        router.replace('/');
      }
    }
  }, [isAuthenticated, navigationState?.key, segments, roles, canManageUsers, loading, accessBlocked]);

  // K-03: mientras se restaura la sesión se ve el Splash, nunca el login.
  if (loading) return <SplashScreen />;
  // Falla cerrada (propuesta 2026-11-03): sin perfil de acceso no se muestra ningún panel.
  if (accessBlocked) {
    return <AccessErrorScreen retrying={accessStatus === 'loading'} onRetry={reloadAccess} onLogout={logout} />;
  }
  return <Slot />;
}

export default function RootLayout() {
  return (
    // react-native-paper exige su Provider en la raíz: sin él, cualquier <Portal> (p. ej. en
    // Operaciones, DynamicFormScreen) tira "forgot to wrap your root component" y deja la
    // app en blanco. Tema por defecto = el mismo que usaban los componentes sin Provider.
    <PaperProvider>
    <AuthProvider>
      <UIPreferencesProvider>
        <StoreProvider>
          <TenantConfigProvider>
            <RootLayoutNav />
          </TenantConfigProvider>
        </StoreProvider>
      </UIPreferencesProvider>
    </AuthProvider>
    </PaperProvider>
  );
}
