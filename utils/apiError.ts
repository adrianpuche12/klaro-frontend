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
  if (status >= 500) return fallback;
  const data: any = e.response.data;
  if (typeof data === 'string' && data.trim() && data.length < 300) return data.trim();
  if (data && typeof data === 'object') {
    const msg = data.message ?? data.error ?? data.mensaje;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  }
  return fallback;
}
