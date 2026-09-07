import { Slot, useSegments, useRootNavigationState, router } from 'expo-router';
import { useEffect } from 'react';
import * as Sentry from '@sentry/react';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { StoreProvider } from '../context/StoreContext';
import { UIPreferencesProvider } from '../context/UIPreferencesContext';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: process.env.EXPO_PUBLIC_SENTRY_ENV ?? 'development',
  tracesSampleRate: 1.0,
  integrations: [Sentry.browserTracingIntegration()],
});


type ValidSegment = 'login' | 'admin' | 'index' | '(tabs)' | '+not-found';

function RootLayoutNav() {
  const { isAuthenticated, roles, canManageUsers, loading } = useAuth();
  const segments = useSegments();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    if (!navigationState?.key) return;
    // SPRINT-14: canManageUsers se resuelve async en login() -- mientras
    // loading sigue true no hay que decidir el routing todavía, evita un
    // salto a "/" para un manager que en realidad va a "/admin".
    if (loading) return;

    const currentSegment = segments.length > 0 ? (segments[0] as ValidSegment) : '';

    const handleNavigation = () => {
      if (!isAuthenticated) {
        if (currentSegment !== 'login') router.replace('/login');
      } else {
        // Keycloak ya no distingue admin/user (todos "staff", SPRINT-14) --
        // canManageUsers viene del Role asignado en la app. root siempre true.
        const isPrivileged = roles.includes('root') || canManageUsers;
        if (isPrivileged) {
          // Root y managers van al dashboard de administración
          if (currentSegment === 'login') router.replace('/admin');
        } else {
          // Staff sin canManageUsers solo puede acceder a las rutas de usuario
          const allowedSegments = ['index', '(tabs)'];
          if (!allowedSegments.includes(currentSegment)) router.replace('/');
        }
      }
    };

    handleNavigation();
  }, [isAuthenticated, navigationState?.key, segments, roles, canManageUsers, loading]);

  return <Slot />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <UIPreferencesProvider>
        <StoreProvider>
          <RootLayoutNav />
        </StoreProvider>
      </UIPreferencesProvider>
    </AuthProvider>
  );
}