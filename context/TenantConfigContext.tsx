import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { REACT_APP_API_URL } from '../config';
import { useAuth } from './AuthContext';
import { formatMoney } from '../utils/format';

/**
 * Configuración de la empresa logueada (GET /api/v3/tenant/config).
 * Toda la app la lee de acá: moneda, nombre, zona horaria. Nada de valores de un cliente fijos en el código.
 */
export interface TenantConfigData {
  companyName: string | null;
  currency: string | null;
  timezone: string | null;
}

interface TenantConfigContextType extends TenantConfigData {
  refreshTenantConfig: () => Promise<void>;
}

const EMPTY: TenantConfigData = { companyName: null, currency: null, timezone: null };

const TenantConfigContext = createContext<TenantConfigContextType>({
  ...EMPTY,
  refreshTenantConfig: async () => {},
});

export const TenantConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [config, setConfig] = useState<TenantConfigData>(EMPTY);

  const refreshTenantConfig = useCallback(async () => {
    try {
      const r = await axios.get(`${REACT_APP_API_URL}/api/v3/tenant/config`);
      setConfig({
        companyName: r.data?.companyName ?? null,
        currency:    r.data?.currency ?? null,
        timezone:    r.data?.timezone ?? null,
      });
    } catch {
      // Sin config (ej. administrador de plataforma, tenant 0): los montos se muestran sin símbolo.
      setConfig(EMPTY);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) refreshTenantConfig();
    else setConfig(EMPTY);
  }, [isAuthenticated, refreshTenantConfig]);

  return (
    <TenantConfigContext.Provider value={{ ...config, refreshTenantConfig }}>
      {children}
    </TenantConfigContext.Provider>
  );
};

export const useTenantConfig = () => useContext(TenantConfigContext);

/** Formateador de montos en la moneda de la empresa: `const money = useMoney(); money(1234.5)`. */
export const useMoney = () => {
  const { currency } = useTenantConfig();
  return useMemo(() => (v: number | string | null | undefined) => formatMoney(v, currency), [currency]);
};
