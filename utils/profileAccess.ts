import axios from 'axios';

/**
 * Acceso de un staff (no root) según su perfil en app_users: módulos, si gestiona
 * usuarios y qué locales puede usar.
 *
 * Regla "falla cerrada" (propuesta 2026-11-03, Seguridad): si el perfil NO se pudo
 * cargar (red, timeout, 5xx, respuesta rara), el usuario se queda SIN permisos y sin
 * locales, y la app muestra "No pudimos cargar tus permisos". Antes cualquier error
 * devolvía permissions = null, que la app leía como "menú completo": un backend lento
 * le mostraba el panel entero al cajero.
 *
 * Se distinguen tres resultados:
 *  - status 'error': no sabemos qué puede hacer → nada (NO_ACCESS).
 *  - status 'ok' + fullAccess: el servidor confirmó que es la excepción legacy de
 *    PermissionGuard.isLegacy en el backend (sin fila en app_users, o fila sin Role ni
 *    datos del modelo viejo). Mientras el backend siga dando acceso total a esos
 *    usuarios, el front lo espeja; cuando se cierre P6 en el backend, se cambia acá.
 *  - status 'ok' sin fullAccess: perfil acotado. permissions vacío = CERO módulos.
 */
export type AccessStatus = 'ok' | 'error';

export interface ProfileAccess {
  status: AccessStatus;
  canManageUsers: boolean;
  /** Módulos habilitados (constants/permissionModules.ts). Nunca null. */
  permissions: string[];
  /** Acceso total: root, o legacy confirmado por el servidor. Nunca por un error. */
  fullAccess: boolean;
  /** Locales permitidos (accessibleStoreIds, igual que el backend). Ignorado si fullAccess. */
  allowedStoreIds: number[];
}

/** Sin permisos: lo que se usa cuando algo falla. */
export const NO_ACCESS: ProfileAccess = {
  status: 'error',
  canManageUsers: false,
  permissions: [],
  fullAccess: false,
  allowedStoreIds: [],
};

/** Root (rol de Keycloak): ve todo, no consulta el perfil (igual que antes). */
export const ROOT_ACCESS: ProfileAccess = {
  status: 'ok',
  canManageUsers: true,
  permissions: [],
  fullAccess: true,
  allowedStoreIds: [],
};

/** Administrador de plataforma (SPRINT-16): sin empresa, sin módulos ni locales. */
export const PLATFORM_ACCESS: ProfileAccess = { ...NO_ACCESS, status: 'ok' };

/** Sin fila en app_users: el servidor respondió bien, pero el usuario no tiene permisos (P6, fail-closed). */
export const NO_PROFILE_ROW_ACCESS: ProfileAccess = { ...NO_ACCESS, status: 'ok' };

/** Fila sin Role ni locales (cuenta "sin Role" que solo crea root): el backend le sigue dando acceso total. */
const LEGACY_ACCESS: ProfileAccess = {
  status: 'ok',
  canManageUsers: false,
  permissions: [],
  fullAccess: true,
  allowedStoreIds: [],
};

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every(x => typeof x === 'string');

const toIds = (v: unknown): number[] =>
  Array.isArray(v) ? v.map(Number).filter(n => Number.isFinite(n)) : [];

/**
 * Traduce la respuesta de GET /api/v2/users/by-username/{u}. Si no tiene forma de
 * perfil (ej. el index.html de un proxy mal configurado con 200), es un error: antes
 * un objeto sin roleId/permissions se leía como legacy y daba acceso total.
 */
export function accessFromProfile(d: unknown): ProfileAccess {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return NO_ACCESS;
  const p = d as Record<string, any>;
  if (typeof p.username !== 'string' && typeof p.id !== 'number') return NO_ACCESS;
  if (p.permissions != null && !isStringArray(p.permissions)) return NO_ACCESS;

  const permissions: string[] = p.permissions ?? [];
  const allowedStoreIds = toIds(p.accessibleStoreIds);
  const isLegacy = !p.roleId
    && !p.businessRole
    && permissions.length === 0
    && allowedStoreIds.length === 0;
  if (isLegacy) return { ...LEGACY_ACCESS, canManageUsers: !!p.canManageUsers };

  return {
    status: 'ok',
    canManageUsers: !!p.canManageUsers,
    permissions,
    fullAccess: false,
    allowedStoreIds,
  };
}

/** 404 "sin fila" del AppUserController: notFound() sin cuerpo. Un 404 con cuerpo
 * (ruta inexistente en Spring, HTML de un proxy) no es "sin fila", es un error. */
function isNoProfileRow(e: unknown): boolean {
  if (!axios.isAxiosError(e) || e.response?.status !== 404) return false;
  const body = e.response.data;
  return body == null || body === '';
}

type Getter = (url: string, config: { timeout: number }) => Promise<{ data: unknown }>;

/**
 * Consulta el perfil y devuelve el acceso. Nunca lanza: ante cualquier error que no
 * sea "no tiene fila" devuelve NO_ACCESS (status 'error').
 */
export async function fetchProfileAccess(
  apiUrl: string,
  username: string,
  get: Getter = (url, config) => axios.get(url, config),
): Promise<ProfileAccess> {
  try {
    const res = await get(`${apiUrl}/api/v2/users/by-username/${encodeURIComponent(username)}`, { timeout: 15000 });
    return accessFromProfile(res.data);
  } catch (e) {
    // Sin fila en app_users = sin acceso (backend#31 cierra P6). Root no llega acá: sale del token.
    return isNoProfileRow(e) ? NO_PROFILE_ROW_ACCESS : NO_ACCESS;
  }
}

/** P10: solo los locales permitidos. Con fullAccess (root/legacy) se devuelven todos. */
export function filterAllowedStores<T extends { id: number }>(
  stores: T[],
  access: Pick<ProfileAccess, 'fullAccess' | 'allowedStoreIds'>,
): T[] {
  if (access.fullAccess) return stores;
  return stores.filter(s => access.allowedStoreIds.includes(s.id));
}
