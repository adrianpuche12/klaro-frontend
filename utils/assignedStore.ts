import axios from 'axios';
import { REACT_APP_API_URL } from '../config';

/**
 * Local asignado a un usuario (Revisión 06, F-02). Misma regla que UserDashboard (P-01):
 * el local principal del perfil o, si no tiene, el primero activo de sus locales
 * accesibles. NUNCA el primero de la lista: si no se puede confirmar, no hay local.
 */
export interface StoreAssignment {
  storeId?: number | null;
  accessibleStoreIds?: number[];
}

/** Perfil del usuario. Lanza el error de axios (404 = sin fila en app_users). */
export async function fetchStoreAssignment(userName: string): Promise<StoreAssignment> {
  const { data } = await axios.get<StoreAssignment>(
    `${REACT_APP_API_URL}/api/v2/users/by-username/${encodeURIComponent(userName)}`,
    { timeout: 15000 }
  );
  return data ?? {};
}

export function resolveAssignedStore<T extends { id: number }>(
  profile: StoreAssignment | null,
  activeStores: T[]
): T | null {
  if (!profile) return null;
  return activeStores.find(s => s.id === profile.storeId)
    ?? activeStores.find(s => (profile.accessibleStoreIds ?? []).includes(s.id))
    ?? null;
}
