/**
 * navConfig — qué pantallas del panel ve cada usuario. Única fuente de verdad para
 * Sidebar.tsx (menú), AdminDashboard.tsx (qué pantalla se puede abrir) y app/_layout.tsx
 * (quién entra a /admin). Antes los menús vivían solo en el Sidebar y el panel no
 * validaba nada: un staff sin permisos escribía /admin y veía el Dashboard (K-01).
 *
 * Modelo de acceso (SPRINT-14): Keycloak solo distingue root / staff ("platform" es el
 * administrador de Nilo, SPRINT-16, y no usa este panel). Para un staff, canManageUsers y
 * los módulos (permissions) vienen del Role asignado en la app.
 */
export type SidebarScreen =
  | 'dashboard' | 'operations' | 'finance' | 'inventory' | 'stores'
  | 'sales' | 'salesHistory' | 'reports' | 'users' | 'roles' | 'tenantConfig';

export interface MenuItem { key: SidebarScreen; label: string; icon: string }

/** Lo que hace falta de useAuth() para decidir el acceso. */
export interface AccessInfo {
  roles: string[];
  canManageUsers: boolean;
  permissions: string[];
  /** root o legacy confirmado por el servidor (ver AuthContext). Nunca por un error. */
  fullAccess: boolean;
}

// Mapea cada ítem al módulo (o módulos, cuando una pantalla agrupa más de uno -- ej.
// Inventario cubre INVENTORY+CATALOG) que lo habilita (SPRINT-09/SPRINT-14). Mismo
// catálogo que PermissionModule en el backend / MODULES en constants/permissionModules.ts.
// Ítems sin entrada acá (users/roles/stores/tenantConfig) no son módulos: se gatean por
// canManageUsers o son exclusivos de root, que nunca pasa por este filtro.
const MODULE_MAP: Partial<Record<SidebarScreen, string[]>> = {
  dashboard:    ['DASHBOARD'],
  sales:        ['POS'],
  salesHistory: ['SALES_HISTORY'],
  // Informes: ventas (SALES_HISTORY) u operaciones (OPERATIONS); la pantalla muestra solo los permitidos.
  reports:      ['SALES_HISTORY', 'OPERATIONS'],
  inventory:    ['INVENTORY', 'CATALOG'],
  finance:      ['TRANSACTIONS', 'SALARY_PAYMENTS', 'SUPPLIER_PAYMENTS'],
  operations:   ['OPERATIONS'],
};

/** Filtra el menú según los módulos del Role asignado. fullAccess es la excepción
 * legacy confirmada por el servidor (ver PermissionGuard.isLegacy en el backend).
 * Antes era permissions === null, y un error al cargar el perfil también daba null:
 * menú completo. Ahora un error deja permissions = [] (falla cerrada). */
function filterMenuByPermissions(menu: MenuItem[], permissions: string[], fullAccess: boolean): MenuItem[] {
  if (fullAccess) return menu;
  return menu.filter(item => {
    const required = MODULE_MAP[item.key];
    if (!required) return true;
    return required.some(m => permissions.includes(m));
  });
}

// ROOT — acceso completo + configuración de la empresa
export const MENU_ROOT: MenuItem[] = [
  { key: 'dashboard',    label: 'Dashboard',        icon: 'view-dashboard-outline' },
  { key: 'sales',        label: 'Ventas',           icon: 'cart-outline' },
  { key: 'salesHistory', label: 'Historial ventas', icon: 'receipt' },
  { key: 'reports',      label: 'Informes',         icon: 'file-chart-outline' },
  { key: 'inventory',    label: 'Inventario',       icon: 'package-variant' },
  { key: 'finance',      label: 'Finanzas',         icon: 'cash-multiple' },
  { key: 'operations',   label: 'Operaciones',      icon: 'clipboard-text-outline' },
  { key: 'users',        label: 'Usuarios',         icon: 'account-multiple-outline' },
  { key: 'roles',        label: 'Roles',            icon: 'badge-account-outline' },
  { key: 'stores',       label: 'Locales',          icon: 'store-outline' },
  { key: 'tenantConfig', label: 'Configuración',    icon: 'tune-variant' },
];

// Staff con canManageUsers — gestión operativa sin locales ni configuración de la
// empresa, filtrado además por los módulos de su Role.
export const MENU_ADMIN: MenuItem[] = MENU_ROOT.filter(
  i => i.key !== 'roles' && i.key !== 'stores' && i.key !== 'tenantConfig'
);

// Staff sin canManageUsers (cajero)
export const MENU_USER: MenuItem[] = [
  { key: 'sales',     label: 'Ventas',     icon: 'cart-outline' },
  { key: 'inventory', label: 'Inventario', icon: 'package-variant' },
];

/** Entra al panel /admin: root o staff con canManageUsers. */
export const isPrivileged = ({ roles, canManageUsers }: Pick<AccessInfo, 'roles' | 'canManageUsers'>) =>
  roles.includes('root') || canManageUsers;

export const menuFor = (a: AccessInfo): MenuItem[] =>
  a.roles.includes('root')
    ? MENU_ROOT
    : a.canManageUsers
      ? filterMenuByPermissions(MENU_ADMIN, a.permissions, a.fullAccess)
      : MENU_USER;

/** ¿Puede abrir esta pantalla del panel? (para validar ?s= de la URL). */
export const canOpen = (a: AccessInfo, screen: string | undefined | null): screen is SidebarScreen =>
  !!screen && menuFor(a).some(i => i.key === screen);

export const SCREEN_TITLE: Record<SidebarScreen, string> = {
  dashboard:    'Dashboard',
  operations:   'Operaciones',
  finance:      'Finanzas',
  inventory:    'Inventario',
  stores:       'Locales',
  salesHistory: 'Historial ventas',
  reports:      'Informes',
  users:        'Usuarios',
  roles:        'Roles',
  sales:        'Ventas',
  tenantConfig: 'Configuración',
};
