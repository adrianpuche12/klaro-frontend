import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import { API_KEYCLOAK_ADAPTER_URL, REACT_APP_API_URL } from '../config';
import { Platform } from 'react-native';
import { SplashScreen } from '../components/SplashScreen';


interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  expiresIn: number | null;
  roles: string[];
  /** SPRINT-14: Keycloak ya no distingue admin/user (todos son "staff") --
   * esto viene del Role asignado en la app, no del JWT. root siempre true. */
  canManageUsers: boolean;
  /** Módulos habilitados por el Role asignado (ver constants/permissionModules.ts).
   * null = excepción legacy (mismo criterio que PermissionGuard.isLegacy en el
   * backend): sin Role Y sin businessRole/permissions/accessibleStores -> acceso
   * total, no "cero módulos". root no necesita este campo, ve todo siempre. */
  permissions: string[] | null;
  userName: string | null;
  userId: string | null;
  loading: boolean;
  error: string | null;
}

interface ProfileAccess { canManageUsers: boolean; permissions: string[] | null }

/** Resuelve canManageUsers + permissions para un staff no-root consultando su
 * perfil. root ya tiene acceso total por su rol de Keycloak, no necesita esto.
 * Espeja PermissionGuard.isLegacy() del backend: sin fila en absoluto, o con
 * fila pero sin Role ni datos del modelo viejo (businessRole/permissions/
 * accessibleStores), es la excepción legacy de acceso total. */
async function fetchProfileAccess(username: string): Promise<ProfileAccess> {
  try {
    const res = await axios.get(`${REACT_APP_API_URL}/api/v2/users/by-username/${username}`);
    const d = res.data;
    const isLegacy = !d.roleId
      && !d.businessRole
      && (!d.permissions || d.permissions.length === 0)
      && (!d.accessibleStoreIds || d.accessibleStoreIds.length === 0);
    return { canManageUsers: !!d.canManageUsers, permissions: isLegacy ? null : (d.permissions ?? []) };
  } catch {
    // Sin fila en app_users -> excepción legacy (mismo criterio que el backend).
    return { canManageUsers: false, permissions: null };
  }
}


interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const Storage = {
  async setItem(key: string, value: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        sessionStorage.setItem(key, value);
      }
      await AsyncStorage.setItem(key, value);
    } catch (error) {
      console.error('Error guardando datos:', error);
    }
  },

  async getItem(key: string): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        return sessionStorage.getItem(key);
      }
      return await AsyncStorage.getItem(key);
    } catch (error) {
      console.error('Error obteniendo datos:', error);
      return null;
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        sessionStorage.removeItem(key);
      }
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error('Error eliminando datos:', error);
    }
  },

  async multiSet(keyValuePairs: [string, string][]): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        keyValuePairs.forEach(([key, value]) => {
          sessionStorage.setItem(key, value);
        });
        return;
      }
      await AsyncStorage.multiSet(keyValuePairs);
    } catch (error) {
      console.error('Error guardando múltiples datos:', error);
    }
  },

  async multiGet(keys: string[]): Promise<readonly [string, string | null][]> {
    try {
      if (Platform.OS === 'web') {
        return keys.map(key => [key, sessionStorage.getItem(key)] as [string, string | null]);
      }
      return await AsyncStorage.multiGet(keys);
    } catch (error) {
      console.error('Error obteniendo múltiples datos:', error);
      return keys.map(key => [key, null] as [string, string | null]);
    }
  },

  async multiRemove(keys: string[]): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        keys.forEach(key => sessionStorage.removeItem(key));
        return;
      }
      await AsyncStorage.multiRemove(keys);
    } catch (error) {
      console.error('Error eliminando múltiples datos:', error);
    }
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    accessToken: null,
    refreshToken: null,
    expiresIn: null,
    roles: [],
    canManageUsers: false,
    permissions: null,
    userName: null,
    userId: null,
    loading: false,
    error: null,
  });

  // C-06: evita múltiples refresh paralelos cuando llegan varios 401 a la vez
  const refreshPromiseRef = useRef<Promise<any> | null>(null);
  // A-02: ref para que el interceptor lea el token fresco sin re-montarse
  const refreshTokenRef   = useRef<string | null>(authState.refreshToken);
  // C-07: timer para refresh proactivo antes de que expire el token
  const refreshTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      let refreshToken = tokenToUse || authState.refreshToken;
      
      if (!refreshToken) {
        const storedRefreshToken = await Storage.getItem('refreshToken');
        if (!storedRefreshToken) {
          throw new Error("No refresh token available");
        }
        refreshToken = storedRefreshToken;
      }
      const response = await axios.post(
        `${API_KEYCLOAK_ADAPTER_URL}/token`,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: 'klaro-frontend',
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const { access_token, refresh_token, expires_in } = response.data;
      const decodedToken = jwtDecode<any>(access_token);
      const userRoles = decodedToken.realm_access?.roles || [];
      const isRoot  = userRoles.includes('root');
      const userName = decodedToken.preferred_username;
      const userId = decodedToken.sub;
      const appRoles = isRoot ? ['root'] : ['staff'];
      // canManageUsers/permissions no se recalculan en cada refresh (evita una
      // llamada extra cada ~pocos minutos) -- se mantiene el último valor
      // conocido, refrescado recién en el próximo login completo. Root siempre
      // true/null (acceso total), sin excepción.
      const canManageUsers = isRoot ? true : authState.canManageUsers;
      const permissions    = isRoot ? null : authState.permissions;

      await Storage.multiSet([
        ['accessToken', access_token],
        ['refreshToken', refresh_token],
        ['expiresIn', expires_in.toString()],
        ['userName', userName],
        ['userId', userId],
        ['roles', JSON.stringify(appRoles)],
        ['canManageUsers', String(canManageUsers)],
        ['permissions', JSON.stringify(permissions)],
      ]);

      setAxiosAuthHeader(access_token);
      scheduleRefresh(access_token);
      setAuthState(prev => ({
        ...prev,
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
        roles: appRoles,
        canManageUsers,
        permissions,
        userName,
        userId,
        loading: false,
        error: null
      }));

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        await logout();
      }
      throw error;
    } finally {
      refreshPromiseRef.current = null;
    }
    })();

    return refreshPromiseRef.current;
  };

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const response = await axios.post(
        `${API_KEYCLOAK_ADAPTER_URL}/token`,
        new URLSearchParams({
          grant_type: 'password',
          username,
          password,
          client_id: 'klaro-frontend',
        }),
        { 
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, 
          withCredentials: false
        }
      );

      const { access_token, refresh_token, expires_in } = response.data;
      const decodedToken = jwtDecode<any>(access_token);

      const userRoles = decodedToken.realm_access?.roles || [];
      const isRoot  = userRoles.includes('root');
      const userName = decodedToken.preferred_username;
      const userId = decodedToken.sub;
      // SPRINT-14: Keycloak colapsó admin/user -> "staff". root sigue siendo
      // un rol real de Keycloak; todo lo demás es "staff" y la granularidad
      // (canManageUsers) viene del Role asignado en la app, no del JWT.
      const appRoles = isRoot ? ['root'] : ['staff'];

      setAxiosAuthHeader(access_token); // necesario antes de poder llamar a /by-username
      const { canManageUsers, permissions } = isRoot
        ? { canManageUsers: true, permissions: null }
        : await fetchProfileAccess(userName);

      await Storage.multiSet([
        ['accessToken', access_token],
        ['refreshToken', refresh_token],
        ['expiresIn', expires_in.toString()],
        ['userName', userName],
        ['userId', userId],
        ['roles', JSON.stringify(appRoles)],
        ['canManageUsers', String(canManageUsers)],
        ['permissions', JSON.stringify(permissions)],
      ]);

      scheduleRefresh(access_token);
      setAuthState({
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
        roles: appRoles,
        canManageUsers,
        permissions,
        userName,
        userId,
        loading: false,
        error: null,
      });

      return true;
    } catch (error) {
      console.error('Login error:', error);
      setAuthState(prev => ({
        ...prev,
        error: 'Error durante el inicio de sesión',
        loading: false,
      }));
      return false;
    }
  };

  const logout = async () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    try {
      await Storage.multiRemove([
        'accessToken',
        'refreshToken',
        'expiresIn',
        'userName',
        'userId',
        'roles',
        'canManageUsers',
        'permissions'
      ]);

      setAxiosAuthHeader(null);
      setAuthState({
        accessToken: null,
        refreshToken: null,
        expiresIn: null,
        roles: [],
        canManageUsers: false,
        permissions: null,
        userName: null,
        userId: null,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const storageData = await Storage.multiGet([
          'accessToken',
          'refreshToken',
          'expiresIn',
          'userName',
          'userId',
          'roles',
          'canManageUsers',
          'permissions'
        ]);
    
        const storageMap = Object.fromEntries(storageData);
        const accessToken = storageMap.accessToken;
        const refreshToken = storageMap.refreshToken;
        
        if (accessToken && refreshToken) {
          try {
            if (isTokenExpiringSoon(accessToken)) {
              await refreshAccessToken();
            } else {
              setAxiosAuthHeader(accessToken);
              
              let roles: string[] = [];
              try {
                if (storageMap.roles) {
                  roles = JSON.parse(storageMap.roles);
                }
              } catch (e) {
              }
              
              let permissions: string[] | null = null;
              try {
                if (storageMap.permissions) {
                  permissions = JSON.parse(storageMap.permissions);
                }
              } catch (e) {
              }

              setAuthState({
                accessToken,
                refreshToken,
                expiresIn: parseInt(storageMap.expiresIn || '0', 10),
                roles,
                canManageUsers: storageMap.canManageUsers === 'true',
                permissions,
                userName: storageMap.userName,
                userId: storageMap.userId,
                loading: false,
                error: null,
              });
            }
          } catch (tokenError) {
            setAuthState(prev => ({
              ...prev,
              accessToken: null,
              refreshToken: null,
              roles: [],
              canManageUsers: false,
              permissions: null,
              loading: false,
              error: null
            }));
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
        const originalRequest = error.config;
        if (
          error.response?.status === 401 &&
          !originalRequest._retry &&
          refreshTokenRef.current
        ) {
          originalRequest._retry = true;
          try {
            const newTokens = await refreshAccessToken();
            originalRequest.headers['Authorization'] = `Bearer ${newTokens.access_token}`;
            return axios(originalRequest);
          } catch (refreshError) {
            await logout();
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