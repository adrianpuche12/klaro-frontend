#!/usr/bin/env node
/**
 * Prepara (o completa) la empresa de prueba del E2E en DEV, usando la API de la app como lo
 * haría una persona: la plataforma da de alta la empresa con su dueño (root), y el dueño crea
 * el local, un producto con stock, los roles y los usuarios.
 *
 * - Nunca toca empresas existentes: si el slug ya existe, solo completa lo que falte usando
 *   las contraseñas guardadas en OUT_FILE.
 * - Las contraseñas se generan acá y se escriben SOLO en OUT_FILE (fuera del repo y del vault).
 *   No se imprimen. Después se cargan como secrets de GitHub con `gh secret set -f OUT_FILE`.
 *
 * Uso:
 *   PLATFORM_USER=... PLATFORM_PASS=... OUT_FILE=~/.secrets/belopia-e2e-dev.env \
 *   node scripts/e2e/preparar-empresa-e2e.mjs
 *
 * Variables opcionales: API_URL (https://dev-api.belopia.app), KC_URL (https://keycloak.belopia.app),
 * REALM (klaro-dev), CLIENT_ID (klaro-frontend), SLUG (e2e-pruebas).
 * ROTAR=1: además, contraseñas nuevas para los 4 usuarios (después: gh secret set -f OUT_FILE).
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const env = (k, d) => process.env[k] ?? d;
const API = env('API_URL', 'https://dev-api.belopia.app');
const KC = env('KC_URL', 'https://keycloak.belopia.app');
const REALM = env('REALM', 'klaro-dev');
const CLIENT_ID = env('CLIENT_ID', 'klaro-frontend');
const SLUG = env('SLUG', 'e2e-pruebas');
const OUT = env('OUT_FILE');
if (!OUT) throw new Error('Falta OUT_FILE');
if (REALM.includes('prod') || API.includes('://api.belopia.app')) {
  throw new Error('Este script es solo para DEV');
}

// Lo que necesitan los specs de tests/e2e. Los permisos salen de PermissionModule del backend.
const ROLES = [
  { key: 'ENCARGADO', name: 'Encargado E2E', level: 1, canManageUsers: true,
    permissions: ['DASHBOARD', 'POS', 'SALES_HISTORY', 'INVENTORY', 'TRANSACTIONS', 'CATALOG', 'OPERATIONS'] },
  { key: 'CONTADOR', name: 'Contador E2E', level: 2, canManageUsers: false,
    permissions: ['SALES_HISTORY', 'TRANSACTIONS', 'SALARY_PAYMENTS', 'SUPPLIER_PAYMENTS'] },
  { key: 'CAJERO', name: 'Cajero E2E', level: 3, canManageUsers: false,
    permissions: ['POS', 'SALES_HISTORY'] },
];
const USERS = { ROOT: 'e2e.root', ENCARGADO: 'e2e.encargado', CONTADOR: 'e2e.contador', CAJERO: 'e2e.cajero' };
const STORE_NAME = 'Local E2E';
const PRODUCT_NAME = 'Producto E2E';
const MIN_STOCK = 500;

const pass = () => randomBytes(18).toString('base64url') + 'aA1!';

function leerSecretos() {
  if (!existsSync(OUT)) return {};
  return Object.fromEntries(readFileSync(OUT, 'utf8').split('\n')
    .filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
}

function guardarSecretos(s) {
  const lines = Object.entries(s).map(([k, v]) => `${k}=${v}`);
  writeFileSync(OUT, lines.join('\n') + '\n', { mode: 0o600 });
}

async function token(username, password) {
  const r = await fetch(`${KC}/realms/${REALM}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', client_id: CLIENT_ID, username, password }),
  });
  if (!r.ok) throw new Error(`Login de ${username} falló: HTTP ${r.status}`);
  return (await r.json()).access_token;
}

async function api(tok, method, path, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → HTTP ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const s = leerSecretos();

// 1. Empresa + dueño (como plataforma).
const plat = await token(env('PLATFORM_USER'), env('PLATFORM_PASS'));
const existe = await fetch(`${API}/api/v3/tenants/slug/${SLUG}`, { headers: { Authorization: `Bearer ${plat}` } });
if (existe.status === 404) {
  s.E2E_ROOT_USER = USERS.ROOT;
  s.E2E_ROOT_PASS = pass();
  guardarSecretos(s); // antes de crear: si algo falla después, la contraseña no se pierde
  const t = await api(plat, 'POST', '/api/v3/tenants', {
    name: 'Empresa E2E (pruebas automáticas)', slug: SLUG, plan: 'starter',
    currency: 'ARS', timezone: 'America/Argentina/Buenos_Aires',
    rootUsername: USERS.ROOT, rootFullName: 'Dueño E2E', rootPassword: s.E2E_ROOT_PASS,
  });
  console.log(`Empresa creada: id ${t.tenant.id} (${SLUG})`);
} else if (existe.ok) {
  if (!s.E2E_ROOT_PASS) throw new Error(`La empresa ${SLUG} existe pero no hay contraseña de root en OUT_FILE`);
  console.log(`Empresa ${SLUG} ya existe: se completa lo que falte`);
} else {
  throw new Error(`GET tenant por slug → HTTP ${existe.status}`);
}

// 2. Local, producto y stock (como dueño).
const root = await token(s.E2E_ROOT_USER, s.E2E_ROOT_PASS);
let store = (await api(root, 'GET', '/api/v2/stores')).find((x) => x.name === STORE_NAME);
if (!store) store = await api(root, 'POST', '/api/v2/stores', { name: STORE_NAME, address: 'Sin dirección (pruebas)' });
console.log(`Local: id ${store.id}`);

const productos = await api(root, 'GET', `/api/v2/stores/${store.id}/products`);
let prod = (Array.isArray(productos) ? productos : productos.content ?? []).find((x) => x.name === PRODUCT_NAME);
if (!prod) prod = await api(root, 'POST', `/api/v2/stores/${store.id}/products`, { name: PRODUCT_NAME, price: 100, type: 'SIMPLE' });
const stock = await api(root, 'GET', `/api/v2/stores/${store.id}/stock`);
const actual = (stock ?? []).find((x) => (x.productId ?? x.product?.id) === prod.id)?.quantity ?? 0;
if (actual < MIN_STOCK) {
  await api(root, 'POST', `/api/v2/stores/${store.id}/stock/adjustment`, {
    productId: prod.id, type: 'ENTRADA', quantity: MIN_STOCK * 2 - actual, reason: 'Stock para E2E',
  });
}
console.log(`Producto: id ${prod.id}, stock repuesto a ≥ ${MIN_STOCK}`);

// 3. Roles y usuarios (como dueño, por la misma API que la pantalla de Usuarios).
const roles = await api(root, 'GET', '/api/v2/roles');
const usuarios = await api(root, 'GET', '/api/v2/users');
for (const def of ROLES) {
  let role = roles.find((r) => r.name === def.name);
  if (!role) role = await api(root, 'POST', '/api/v2/roles', {
    name: def.name, level: def.level, canManageUsers: def.canManageUsers, permissions: def.permissions,
  });
  const username = USERS[def.key];
  if (!usuarios.find((u) => u.username === username)) {
    s[`E2E_${def.key}_USER`] = username;
    s[`E2E_${def.key}_PASS`] = pass();
    guardarSecretos(s);
    await api(root, 'POST', '/api/v2/users', {
      fullName: `${def.name.replace(' E2E', '')} E2E`, username, password: s[`E2E_${def.key}_PASS`],
      roleId: role.id, storeId: store.id, storeIds: [store.id],
    });
    console.log(`Usuario ${username} creado (rol ${def.name})`);
  } else {
    if (!s[`E2E_${def.key}_PASS`]) throw new Error(`${username} existe pero no está en OUT_FILE`);
    console.log(`Usuario ${username} ya existe`);
  }
}

// 3b. ROTAR=1: contraseñas nuevas para los 4 (p. ej. si se filtraron), por el mismo endpoint que
// usa la pantalla de Usuarios. Cada una se guarda apenas se aplica; el dueño va al final porque
// es quien hace los cambios.
if (env('ROTAR') === '1') {
  const lista = await api(root, 'GET', '/api/v2/users');
  for (const k of ['ENCARGADO', 'CONTADOR', 'CAJERO', 'ROOT']) {
    const u = lista.find((x) => x.username === USERS[k]);
    if (!u) throw new Error(`No encontré ${USERS[k]} para rotar`);
    const nueva = pass();
    await api(root, 'PUT', `/api/v2/users/${u.id}/reset-password`, { password: nueva });
    s[`E2E_${k}_PASS`] = nueva;
    guardarSecretos(s);
    console.log(`Contraseña rotada: ${USERS[k]}`);
  }
}

// 4. Comprobación: cada usuario entra.
for (const k of Object.keys(USERS)) await token(s[`E2E_${k}_USER`], s[`E2E_${k}_PASS`]);
console.log('Los 4 usuarios inician sesión. Secretos en OUT_FILE (8 claves E2E_*).');
