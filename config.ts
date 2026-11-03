// Variables de entorno Expo — prefijo EXPO_PUBLIC_ las expone al bundle del cliente.
// Fallbacks = DEV, siempre por HTTPS (K-02). Producción se configura en Vercel/EAS, nunca acá.
const KEYCLOAK_SERVER = process.env.EXPO_PUBLIC_KEYCLOAK_URL   ?? 'https://keycloak.belopia.app';
const KEYCLOAK_REALM  = process.env.EXPO_PUBLIC_KEYCLOAK_REALM ?? 'klaro-dev';
const API_BASE        = process.env.EXPO_PUBLIC_API_URL        ?? 'https://dev-api.belopia.app';

export const REACT_APP_API_URL        = API_BASE;
export const API_KEYCLOAK_ADAPTER_URL = `${KEYCLOAK_SERVER}/realms/${KEYCLOAK_REALM}/protocol/openid-connect`;

if (__DEV__) {
  console.log('[Klaro] Config activa:', { KEYCLOAK_SERVER, KEYCLOAK_REALM, API_BASE });
}
