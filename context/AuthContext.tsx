import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import { markRateLimited } from '../utils/apiError';
import { API_KEYCLOAK_ADAPTER_URL, REACT_APP_API_URL } from '../config';
import { Platform } from 'react-native';
import {
  AccessStatus, fetchProfileAccess, NO_ACCESS, PLATFORM_ACCESS, ProfileAccess, ROOT_ACCESS,
} from '../utils/profileAccess';

const CLIENT_ID = 'klaro-frontend';
// canManageUsers/permissions ya no se guardan (se vuelven a pedir al restaurar la
// sesión), pero siguen en la lista para que clear() borre lo que dejaron versiones viejas.
const SESSION_KEYS = [
  'accessToken', 'refreshToken', 'expiresIn', 'userName', 'userId', 'roles', 'canManageUsers', 'permissions',
];

/** L-01: el login informa POR QUÉ falló (antes devolvía false y todo era "contraseña incorrecta"). */
export type AuthErrorCode = 'credentials' | 'network' | 'server' | 'unknown';
export class AuthError extends Error {
  constructor(public code: AuthErrorCode) { super(code); }
}

// K-08: cliente propio para Keycloak, con timeout y fuera del interceptor global de la API.
const kc = axios.create({
  baseURL: API_KEYCLOAK_ADAPTER_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
});

const isNetworkError = (e: any) => !e?.response;


interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  expiresIn: number | null;
  roles: string[];
  /** SPRINT-14: Keycloak ya no distingue admin/user (todos son "staff") --
   * esto viene del Role asignado en la app, no del JWT. root siempre true. */
  canManageUsers: boolean;
  /** Módulos habilitados por el Role asignado (ver constants/permissionModules.ts).
   * Nunca null: vacío = cero módulos. El acceso total va aparte, en fullAccess. */
  permissions: string[];
  /** Acceso total: root (rol de Keycloak) o legacy CONFIRMADO por el servidor (mismo
   * criterio que PermissionGuard.isLegacy en el backend). Un error nunca da acceso total. */
  fullAccess: boolean;
  /** P10: locales que el usuario puede usar (accessibleStoreIds). Ignorado con fullAccess. */
  allowedStoreIds: number[];
  /** Falla cerrada: 'error' = no se pudo cargar el perfil de acceso → sin permisos y
   * pantalla "No pudimos cargar tus permisos". 'loading' = reintentando. */
  accessStatus: AccessStatus | 'loading';
  userName: string | null;
  userId: string | null;
  loading: boolean;
  error: string | null;
}

/** Campos de AuthState que salen del perfil de acceso. */
const accessFields = (a: ProfileAccess) => ({
  canManageUsers: a.canManageUsers,
  permissions: a.permissions,
  fullAccess: a.fullAccess,
  allowedStoreIds: a.allowedStoreIds,
  accessStatus: a.status,
});

/** root ve todo sin consultar el perfil (igual que antes); platform no tiene empresa;
 * el resto (staff) depende de su perfil en app_users, y si falla queda sin permisos. */
async function resolveAccess(appRoles: string[], userName: string): Promise<ProfileAccess> {
  if (appRoles.includes('root')) return ROOT_ACCESS;
  if (appRoles.includes('platform')) return PLATFORM_ACCESS;
  if (!userName) return NO_ACCESS;
  return fetchProfileAccess(REACT_APP_API_URL, userName);
}


interface AuthContextType extends AuthState {
  /** Lanza AuthError si falla (L-01). */
  login: (username: string, password: string) => Promise<true>;
  logout: () => Promise<void>;
  /** Vuelve a pedir el perfil de acceso (botón "Reintentar"). */
  reloadAccess: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * Rol de la app a partir del JWT.
 * - "platform": administrador de plataforma de Nilo (SPRINT-16). Exige el rol de Keycloak
 *   "platform" Y tenant_id = 0, igual que PlatformSecurity en el backend. No tiene empresa:
 *   no ve ni opera datos de negocio, solo la pantalla de Empresas.
 * - "root": dueño de una empresa.
 * - "staff": todo lo demás (los permisos finos vienen del Role de la app).
 */
export function resolveAppRoles(decodedToken: any): string[] {
  const userRoles: string[] = decodedToken?.realm_access?.roles || [];
  const tenantId = Number(decodedToken?.tenant_id);
  if (userRoles.includes('platform') && tenantId === 0) return ['platform'];
  if (userRoles.includes('root')) return ['root'];
  return ['staff'];
}

/**
 * K-07: un solo backend por plataforma.
 * Web → sessionStorage (la sesión dura lo que la pestaña, comportamiento actual).
 * Nativo → AsyncStorage.
 * Antes setItem/removeItem escribían en los dos (en web AsyncStorage = localStorage)
 * y multiSet/multiRemove en uno solo: quedaban tokens viejos en localStorage.
 */
const Storage = {
  async multiSet(pairs: [string, string][]): Promise<void> {
    try {
      if (Platform.OS === 'web') pairs.forEach(([k, v]) => sessionStorage.setItem(k, v));
      else await AsyncStorage.multiSet(pairs);
    } catch (error) {
      console.error('Error guardando la sesión:', error);
    }
  },

  async multiGet(keys: string[]): Promise<Record<string, string | null>> {
    try {
      if (Platform.OS === 'web') return Object.fromEntries(keys.map(k => [k, sessionStorage.getItem(k)]));
      return Object.fromEntries(await AsyncStorage.multiGet(keys));
    } catch (error) {
      console.error('Error leyendo la sesión:', error);
      return Object.fromEntries(keys.map(k => [k, null]));
    }
  },

  async clear(): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        // También borra los restos que la versión anterior dejaba en localStorage.
        SESSION_KEYS.forEach(k => { sessionStorage.removeItem(k); localStorage.removeItem(k); });
      } else {
        await AsyncStorage.multiRemove(SESSION_KEYS);
      }
    } catch (error) {
      console.error('Error limpiando la sesión:', error);
    }
  },
};

const EMPTY_STATE: AuthState = {
  accessToken: null,
  refreshToken: null,
  expiresIn: null,
  roles: [],
  ...accessFields(NO_ACCESS),
  userName: null,
  userId: null,
  loading: false,
  error: null,
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // K-03: arranca en loading=true → el layout muestra el Splash hasta saber si hay sesión
  // (antes se veía el login un instante y después rebotaba al panel).
  const [authState, setAuthState] = useState<AuthState>({ ...EMPTY_STATE, loading: true });

  // C-06: evita múltiples refresh paralelos cuando llegan varios 401 a la vez
  const refreshPromiseRef = useRef<Promise<any> | null>(null);
  // A-02: ref para que el interceptor lea el token fresco sin re-montarse
  const refreshTokenRef   = useRef<string | null>(authState.refreshToken);
  // C-07: timer para refresh proactivo antes de que expire el token
  const refreshTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bug encontrado en testing E2E: scheduleRefresh() se llama DENTRO de login(),
  // antes de que el setAuthState() de esa misma función corra, y el closure de
  // refreshAccessToken quedaba con los permisos de ANTES del login. Ahora el refresh
  // directamente no toca los campos de acceso (setAuthState(prev => ...) los conserva).

  useEffect(() => {
    refreshTokenRef.current = authState.refreshToken;
  }, [authState.refreshToken]);

  const setAxiosAuthHeader = (token: string | null) => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  };

  // C-07: programa un refresh proactivo ~60s antes del exp del token
  const scheduleRefresh = (token: string) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    try {
      const decoded = jwtDecode<any>(token);
      const msUntilRefresh = decoded.exp * 1000 - Date.now() - 60_000;
      if (msUntilRefresh > 0) {
        refreshTimerRef.current = setTimeout(() => {
          refreshAccessToken().catch(() => {});
        }, msUntilRefresh);
      }
    } catch {}
  };

  const isTokenExpiringSoon = (token: string): boolean => {
    try {
      const decoded = jwtDecode<any>(token);
      const currentTime = Date.now() / 1000;
      return decoded.exp - currentTime < 300;
    } catch {
      return true;
    }
  };

  const refreshAccessToken = async (tokenToUse?: string) => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    refreshPromiseRef.current = (async () => {
    try {
      let refreshToken = tokenToUse || refreshTokenRef.current;

      if (!refreshToken) {
        const { refreshToken: stored } = await Storage.multiGet(['refreshToken']);
        if (!stored) {
          throw new Error("No refresh token available");
        }
        refreshToken = stored;
      }
      const response = await kc.post('/token', new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
      }));

      const { access_token, refresh_token, expires_in } = response.data;
      const decodedToken = jwtDecode<any>(access_token);
      const appRoles = resolveAppRoles(decodedToken);
      const userName = decodedToken.preferred_username;
      const userId = decodedToken.sub;
      // Los campos de acceso (canManageUsers, permissions, fullAccess, locales) no se
      // recalculan en cada refresh (evita una llamada extra cada pocos minutos): se
      // conservan los del estado (prev). Se recargan al entrar o al recargar la página.

      await Storage.multiSet([
        ['accessToken', access_token],
        ['refreshToken', refresh_token],
        ['expiresIn', expires_in.toString()],
        ['userName', userName],
        ['userId', userId],
        ['roles', JSON.stringify(appRoles)],
      ]);

      refreshTokenRef.current = refresh_token;
      setAxiosAuthHeader(access_token);
      scheduleRefresh(access_token);
      // `loading` tampoco se toca: al restaurar la sesión lo baja initializeAuth,
      // recién después de cargar el perfil de acceso.
      setAuthState(prev => ({
        ...prev,
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
        roles: appRoles,
        userName,
        userId,
        error: null
      }));

      return response.data;
    } catch (error: any) {
      // K-05: con el refresh vencido Keycloak responde 400 invalid_grant (no 401).
      // Cualquier rechazo del servidor limpia la sesión guardada; un error de red NO
      // (puede ser un corte momentáneo y el refresh sigue siendo válido).
      if (!isNetworkError(error)) {
        await clearSession();
      }
      throw error;
    } finally {
      refreshPromiseRef.current = null;
    }
    })();

    return refreshPromiseRef.current;
  };

  const login = async (username: string, password: string): Promise<true> => {
    try {
      // L-02: solo se recorta el usuario; la contraseña va tal cual (puede tener espacios).
      const response = await kc.post('/token', new URLSearchParams({
        grant_type: 'password',
        username: username.trim(),
        password,
        client_id: CLIENT_ID,
      }));

      const { access_token, refresh_token, expires_in } = response.data;
      const decodedToken = jwtDecode<any>(access_token);

      const userName = decodedToken.preferred_username;
      const userId = decodedToken.sub;
      // SPRINT-14: Keycloak colapsó admin/user -> "staff". root sigue siendo
      // un rol real de Keycloak; todo lo demás es "staff" y la granularidad
      // (canManageUsers) viene del Role asignado en la app, no del JWT.
      // SPRINT-16: "platform" (tenant 0) no tiene empresa ni perfil en app_users.
      const appRoles = resolveAppRoles(decodedToken);

      setAxiosAuthHeader(access_token); // necesario antes de poder llamar a /by-username
      // Falla cerrada: si el perfil no carga, la sesión queda abierta pero SIN permisos
      // (accessStatus 'error') y el layout muestra "No pudimos cargar tus permisos".
      const access = await resolveAccess(appRoles, userName);

      await Storage.multiSet([
        ['accessToken', access_token],
        ['refreshToken', refresh_token],
        ['expiresIn', expires_in.toString()],
        ['userName', userName],
        ['userId', userId],
        ['roles', JSON.stringify(appRoles)],
      ]);

      refreshTokenRef.current = refresh_token;
      scheduleRefresh(access_token);
      setAuthState({
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
        roles: appRoles,
        ...accessFields(access),
        userName,
        userId,
        loading: false,
        error: null,
      });

      return true;
    } catch (error: any) {
      const status = error?.response?.status;
      const code: AuthErrorCode =
        status === 400 || status === 401 ? 'credentials'
        : isNetworkError(error) ? 'network'
        : status >= 500 ? 'server'
        : 'unknown';
      setAxiosAuthHeader(null);
      setAuthState(prev => ({ ...prev, error: code, loading: false }));
      throw new AuthError(code);
    }
  };

  /** Borra la sesión local (storage, header, timers) sin hablar con Keycloak. */
  const clearSession = async () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTokenRef.current = null;
    await Storage.clear();
    setAxiosAuthHeader(null);
    setAuthState(EMPTY_STATE);
  };

  const logout = async () => {
    // K-06: cerrar también la sesión en Keycloak para invalidar el refresh token.
    // Sin await: si Keycloak no responde, el usuario igual sale.
    const refreshToken = refreshTokenRef.current;
    if (refreshToken) {
      kc.post('/logout', new URLSearchParams({ client_id: CLIENT_ID, refresh_token: refreshToken })).catch(() => {});
    }
    await clearSession();
  };

  /** Botón "Reintentar" de la pantalla "No pudimos cargar tus permisos". Mientras
   * tanto el usuario sigue sin permisos (accessStatus 'loading', no 'ok'). */
  const reloadAccess = async () => {
    const { roles, userName } = authState;
    setAuthState(prev => ({ ...prev, ...accessFields(NO_ACCESS), accessStatus: 'loading' }));
    const access = await resolveAccess(roles, userName ?? '');
    setAuthState(prev => ({ ...prev, ...accessFields(access) }));
  };

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const storageMap = await Storage.multiGet(SESSION_KEYS);
        const accessToken = storageMap.accessToken;
        const refreshToken = storageMap.refreshToken;

        if (accessToken && refreshToken) {
          refreshTokenRef.current = refreshToken;
          try {
            // Token vigente (refrescado si estaba por vencer). Los roles salen del token,
            // no del storage.
            let token = accessToken;
            if (isTokenExpiringSoon(accessToken)) {
              token = (await refreshAccessToken()).access_token;
            } else {
              setAxiosAuthHeader(accessToken);
              scheduleRefresh(accessToken);
            }
            const decoded = jwtDecode<any>(token);
            const roles = resolveAppRoles(decoded);
            const userName: string = decoded.preferred_username ?? storageMap.userName ?? '';

            // Falla cerrada: el perfil de acceso se vuelve a pedir en cada carga. Antes se
            // leía del storage y, si faltaba o no se podía leer, quedaba null = acceso total.
            const access = await resolveAccess(roles, userName);

            setAuthState(prev => ({
              ...prev,
              accessToken: token,
              refreshToken: refreshTokenRef.current ?? refreshToken,
              expiresIn: prev.expiresIn ?? parseInt(storageMap.expiresIn || '0', 10),
              roles,
              ...accessFields(access),
              userName,
              userId: decoded.sub ?? storageMap.userId,
              loading: false,
              error: null,
            }));
          } catch (tokenError) {
            // Rechazo del servidor: refreshAccessToken ya limpió el storage (K-05).
            // Error de red: se conserva lo guardado para reintentar en la próxima carga.
            setAuthState({ ...EMPTY_STATE });
          }
        } else {
          setAuthState(prev => ({ ...prev, loading: false }));
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        setAuthState(prev => ({ ...prev, loading: false }));
      }
    };

    initializeAuth();
  }, []);

  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      response => response,
      async error => {
        markRateLimited(error); // 429: mensaje claro en vez de "Too Many Requests" (utils/apiError)
        const originalRequest = error.config;
        if (
          error.response?.status === 401 &&
          originalRequest &&
          !originalRequest._retry &&
          refreshTokenRef.current
        ) {
          originalRequest._retry = true;
          try {
            const newTokens = await refreshAccessToken();
            originalRequest.headers['Authorization'] = `Bearer ${newTokens.access_token}`;
            return axios(originalRequest);
          } catch (refreshError) {
            // refreshAccessToken ya limpió la sesión si Keycloak la rechazó (K-05).
            return Promise.reject(error);
          }
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, []); // deps vacías — se monta una sola vez, lee el token desde refreshTokenRef

  return (
    <AuthContext.Provider
      value={{
        ...authState,
        login,
        logout,
        reloadAccess,
        isAuthenticated: !!authState.accessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser usado dentro de un AuthProvider');
  }
  return context;
};