import axios from 'axios';

/**
 * Helpers para mostrar errores de la API de forma consistente (Revisión 06, O-07 / F-07).
 *
 * Regla: un 403 se muestra como "No tenés permiso", nunca como lista vacía. Hoy, por
 * ejemplo, Finanzas se habilita en el menú con TRANSACTIONS / SALARY_PAYMENTS /
 * SUPPLIER_PAYMENTS pero /api/operations/* exige OPERATIONS (decisión de negocio
 * pendiente): sin este mensaje, el usuario veía "No hay transacciones" y KPIs en 0.
 */

/** Código HTTP del error de axios (undefined si no hubo respuesta o no es de axios). */
export const httpStatus = (e: unknown): number | undefined =>
  axios.isAxiosError(e) ? e.response?.status : undefined;

export const isForbidden = (e: unknown): boolean => httpStatus(e) === 403;

export const NO_PERMISSION_MESSAGE = 'No tenés permiso para ver esta información.';

/**
 * Mensaje legible para el usuario. Solo se muestra el texto del backend en errores 4xx
 * (validaciones: "El monto debe ser mayor a 0", etc.); en 5xx se usa `fallback` para no
 * mostrar trazas internas.
 */
export function apiErrorMessage(e: unknown, fallback: string): string {
  if (!axios.isAxiosError(e)) return fallback;
  if (!e.response) return 'No se pudo conectar con el servidor. Revisá la conexión.';
  const status = e.response.status;
  if (status === 403) return 'No tenés permiso para realizar esta acción.';
  if (status === 401) return 'Tu sesión venció. Volvé a iniciar sesión.';
  if (status === 429) return rateLimitMessage(e.response.headers?.['retry-after']);
  if (status >= 500) return fallback;
  const data: any = e.response.data;
  if (typeof data === 'string' && data.trim() && data.length < 300) return data.trim();
  if (data && typeof data === 'object') {
    const msg = data.message ?? data.error ?? data.mensaje;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  }
  return fallback;
}

/**
 * 429 del rate limit del backend (RateLimitingFilter: 300/min por usuario, 100/min por IP sin
 * token, techo de 1.000/min por IP). El cuerpo viene en inglés ("Too Many Requests"), y casi todas
 * las pantallas muestran `data.error` tal cual. Por eso el interceptor de AuthContext reescribe el
 * cuerpo una sola vez con un mensaje claro, y ninguna pantalla tiene que cambiar.
 * `Retry-After` se lee si llega (en mobile llega; en la web el navegador lo oculta porque CORS no
 * lo expone, y se usa "un minuto").
 */
export const isRateLimited = (e: unknown): boolean => httpStatus(e) === 429;

export function rateLimitMessage(retryAfter?: unknown): string {
  const s = Number(retryAfter);
  const espera = Number.isFinite(s) && s > 0 && s <= 120
    ? `${Math.ceil(s)} segundo${Math.ceil(s) === 1 ? '' : 's'}`
    : 'un minuto';
  return `Hay demasiados pedidos seguidos desde este usuario o esta conexión. Esperá ${espera} y probá de nuevo; no se perdió nada.`;
}

/** Reescribe el cuerpo de un 429 con el mensaje claro (lo usa el interceptor de AuthContext). */
export function markRateLimited(e: unknown): void {
  if (!axios.isAxiosError(e) || e.response?.status !== 429) return;
  const headers: any = e.response.headers ?? {};
  const retry = typeof headers.get === 'function' ? headers.get('retry-after') : headers['retry-after'];
  const msg = rateLimitMessage(retry);
  const prev = e.response.data;
  e.response.data = { ...(prev && typeof prev === 'object' ? prev : {}), error: msg, message: msg };
}
