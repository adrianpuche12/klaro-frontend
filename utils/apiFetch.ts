import axios from 'axios';

/**
 * `fetch` con la sesión actual. AuthContext deja el token en
 * axios.defaults.headers.common.Authorization (y lo renueva solo); las pantallas que
 * todavía usan `fetch` en vez de axios lo mandaban SIN token y el backend respondía 401
 * (Finanzas quedaba vacía, la importación desde Excel y la subida de comprobantes fallaban).
 *
 * Preferir axios en código nuevo; esto existe para no reescribir el manejo de respuestas
 * (response.ok / json()) de las pantallas viejas.
 */
export function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const auth = axios.defaults.headers.common['Authorization'];
  const headers = new Headers(init.headers ?? {});
  if (auth && !headers.has('Authorization')) {
    headers.set('Authorization', String(auth));
  }
  return fetch(url, { ...init, headers });
}
