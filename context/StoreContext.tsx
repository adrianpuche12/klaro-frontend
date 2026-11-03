import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { REACT_APP_API_URL } from '../config';
import { useAuth } from './AuthContext';
import { filterAllowedStores } from '../utils/profileAccess';
import { isForbidden, NO_PERMISSION_MESSAGE } from '../utils/apiError';

export interface Store {
  id: number;
  name: string;
  active: boolean;
}

interface StoreContextType {
  stores: Store[];
  selectedStore: Store | null;
  setSelectedStore: (store: Store) => void;
  loadingStores: boolean;
  storesError: string | null;
  refreshStores: () => Promise<void>;
}

const StoreContext = createContext<StoreContextType>({
  stores: [],
  selectedStore: null,
  setSelectedStore: () => {},
  loadingStores: true,
  storesError: null,
  refreshStores: async () => {},
});

const keyFor = (userId: string) => `@belopia/selected-store/${userId}`;

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, userId, accessStatus, fullAccess, allowedStoreIds } = useAuth();
  // P10: los selectores muestran solo los locales permitidos (accessibleStoreIds del
  // perfil), aunque el backend devuelva todos. Root y legacy (fullAccess) ven todos.
  // Clave estable para no recargar en cada render (allowedStoreIds es un array nuevo).
  const allowedKey = fullAccess ? '*' : allowedStoreIds.join(',');
  const access = useMemo(
    () => ({ fullAccess, allowedStoreIds }),
    [allowedKey] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const accessReady = accessStatus === 'ok';
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelected] = useState<Store | null>(null);
  const [loadingStores, setLoadingStores] = useState(true);
  const [storesError, setStoresError] = useState<string | null>(null);

  // K-04: recordar el local elegido por usuario. Antes, al recargar, volvía al primero
  // de la lista y un cajero de "Norte" podía registrar ventas en "Centro" sin darse cuenta.
  const setSelectedStore = useCallback((store: Store) => {
    setSelected(store);
    if (userId) AsyncStorage.setItem(keyFor(userId), String(store.id)).catch(() => {});
  }, [userId]);

  const refreshStores = useCallback(async () => {
    try {
      setStoresError(null);
      const r = await axios.get<Store[]>(`${REACT_APP_API_URL}/api/v2/stores`, { timeout: 15000 });
      // P10: activos Y permitidos. La selección (la anterior, la guardada o la primera)
      // sale solo de esta lista: nunca queda elegido un local no permitido.
      const active = filterAllowedStores((Array.isArray(r.data) ? r.data : []).filter((s) => s.active), access);
      setStores(active);
      const savedId = userId ? await AsyncStorage.getItem(keyFor(userId)).catch(() => null) : null;
      setSelected((prev) =>
        (prev && active.find((s) => s.id === prev.id))
        || active.find((s) => String(s.id) === savedId)
        || active[0]
        || null
      );
    } catch (e) {
      // antes: catch {} silencioso. Un 403 se muestra como falta de permiso (apiError).
      setStoresError(isForbidden(e) ? NO_PERMISSION_MESSAGE : 'No se pudieron cargar los locales');
    }
  }, [userId, access]);

  useEffect(() => {
    // Falla cerrada: sin perfil de acceso cargado no hay locales.
    if (!isAuthenticated || !accessReady) {
      setStores([]);
      setSelected(null);
      setLoadingStores(false);
      return;
    }
    setLoadingStores(true);
    refreshStores().finally(() => setLoadingStores(false));
  }, [isAuthenticated, accessReady, refreshStores]);

  return (
    <StoreContext.Provider value={{ stores, selectedStore, setSelectedStore, loadingStores, storesError, refreshStores }}>
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => useContext(StoreContext);
