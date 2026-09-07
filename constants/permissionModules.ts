/**
 * Catálogo de módulos de negocio — mismos valores que PermissionModule en el
 * backend (balance.users.model.PermissionModule). Un solo lugar para esta
 * lista: se usa en UsersScreen (perfil legacy, SPRINT-09), RolesScreen
 * (SPRINT-14) y UserDashboard (menú filtrado por permisos). Ver "05. Estandares
 * de Codigo Frontend (React)" en el vault de Belopia — reutilización obligatoria.
 */
export interface PermissionModuleOption {
  value: string;
  label: string;
}

export const MODULES: PermissionModuleOption[] = [
  { value: 'DASHBOARD',         label: 'Dashboard' },
  { value: 'POS',               label: 'Punto de venta' },
  { value: 'SALES_HISTORY',     label: 'Historial de ventas' },
  { value: 'INVENTORY',         label: 'Inventario' },
  { value: 'TRANSACTIONS',      label: 'Movimientos' },
  { value: 'SALARY_PAYMENTS',   label: 'Pagos de salario' },
  { value: 'SUPPLIER_PAYMENTS', label: 'Pagos a proveedores' },
  { value: 'CATALOG',           label: 'Catálogo' },
  { value: 'OPERATIONS',        label: 'Operaciones' },
];
