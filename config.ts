let currentHost = 'localhost';
let currentPort = '';

if (typeof window !== 'undefined' && window.location) {
    currentHost = window.location.hostname;
    currentPort = window.location.port;
}

let keycloakUrl: string;
let keycloakRealm: string;
let apiUrl: string;

const RAILWAY_DEV_URL  = 'https://klaro-backend-production-8383.up.railway.app';
const RAILWAY_PROD_URL = 'https://klaro-backend-production-8383.up.railway.app'; // reemplazar con URL PROD cuando exista
const KEYCLOAK_SERVER  = 'http://62.171.160.238:8095';

if (currentHost === RAILWAY_PROD_URL.replace('https://', '')) {
    // Frontend en PROD
    keycloakUrl   = KEYCLOAK_SERVER;
    keycloakRealm = 'klaro-prod';
    apiUrl        = RAILWAY_PROD_URL;
} else {
    // Local y DEV apuntan al backend Railway DEV
    keycloakUrl   = KEYCLOAK_SERVER;
    keycloakRealm = 'klaro-dev';
    apiUrl        = RAILWAY_DEV_URL;
}

export const KEYCLOAK_URL      = keycloakUrl;
export const KEYCLOAK_REALM    = keycloakRealm;
export const REACT_APP_API_URL = apiUrl;

// Cloudflare R2 — URL pública para ver comprobantes
export const R2_PUBLIC_URL = 'https://pub-333e5c6f14214d6cb7c0e192a9aadd85.r2.dev';

// Endpoint de token Keycloak (OpenID Connect directo)
export const API_KEYCLOAK_ADAPTER_URL = `${keycloakUrl}/realms/${keycloakRealm}/protocol/openid-connect`;

if (typeof window !== 'undefined') {
    console.log('Klaro Config:', { keycloakUrl, keycloakRealm, apiUrl });
}
