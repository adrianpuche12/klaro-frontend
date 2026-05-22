import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { REACT_APP_API_URL } from '../config';
import { useAuth } from './AuthContext';

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
  refreshStores: () => Promise<void>;
}

const StoreContext = createContext<StoreContextType>({
  stores: [],
  selectedStore: null,
  setSelectedStore: () => {},
  loadingStores: true,
  refreshStores: async () => {},
});

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [stores, setStores]               = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [loadingStores, setLoadingStores] = useState(true);

  const refreshStores = async () => {
    try {
      const r = await axios.get<Store[]>(`${REACT_APP_API_URL}/api/v2/stores`);
      const active = r.data.filter(s => s.active);
      setStores(active);
      // Si el local seleccionado fue desactivado, seleccionar el primero disponible
      setSelectedStore(prev =>
        prev && active.find(s => s.id === prev.id) ? prev : active[0] ?? null
      );
    } catch {}
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setStores([]);
      setSelectedStore(null);
      setLoadingStores(false);
      return;
    }
    setLoadingStores(true);
    refreshStores().finally(() => setLoadingStores(false));
  }, [isAuthenticated]);

  return (
    <StoreContext.Provider value={{ stores, selectedStore, setSelectedStore, loadingStores, refreshStores }}>
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => useContext(StoreContext);
