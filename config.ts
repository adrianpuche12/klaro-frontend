// Variables de entorno Expo — prefijo EXPO_PUBLIC_ las expone al bundle del cliente.
// Fallbacks = valores actuales (dev). Para producción: sobreescribir en .env o en EAS.
const KEYCLOAK_SERVER = process.env.EXPO_PUBLIC_KEYCLOAK_URL   ?? 'http://62.171.160.238:8095';
const KEYCLOAK_REALM  = process.env.EXPO_PUBLIC_KEYCLOAK_REALM ?? 'klaro-dev';
const API_BASE        = process.env.EXPO_PUBLIC_API_URL        ?? 'https://klaro-backend-production-8383.up.railway.app';

export const REACT_APP_API_URL        = API_BASE;
export const R2_PUBLIC_URL            = 'https://pub-333e5c6f14214d6cb7c0e192a9aadd85.r2.dev';
export const API_KEYCLOAK_ADAPTER_URL = `${KEYCLOAK_SERVER}/realms/${KEYCLOAK_REALM}/protocol/openid-connect`;

if (__DEV__) {
  console.log('[Klaro] Config activa:', { KEYCLOAK_SERVER, KEYCLOAK_REALM, API_BASE });
}
