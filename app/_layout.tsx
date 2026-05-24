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
  const { isAuthenticated, roles } = useAuth();
  const segments = useSegments();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    if (!navigationState?.key) return;

    const currentSegment = segments.length > 0 ? (segments[0] as ValidSegment) : '';

    const handleNavigation = () => {
      if (!isAuthenticated) {
        if (currentSegment !== 'login') router.replace('/login');
      } else {
        const isPrivileged = roles.includes('root') || roles.includes('admin');
        if (isPrivileged) {
          // Root y admin van al dashboard de administración
          if (currentSegment === 'login') router.replace('/admin');
        } else {
          // User solo puede acceder a las rutas de usuario
          const allowedSegments = ['index', '(tabs)'];
          if (!allowedSegments.includes(currentSegment)) router.replace('/');
        }
      }
    };

    handleNavigation();
  }, [isAuthenticated, navigationState?.key, segments, roles]);

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