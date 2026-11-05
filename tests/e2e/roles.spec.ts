import { test, expect } from '@playwright/test';
import { credenciales, faltan, loginComo } from './helpers';

/**
 * Qué ve cada rol en la interfaz (regla #1: permisos por rol). Mismo modelo que
 * config/navConfig.ts: root y staff con "gestionar usuarios" entran a /admin; un cajero
 * (staff sin gestionar usuarios) solo tiene Ventas/Inventario y nunca el panel.
 */

// Ítems del menú de administración que un cajero no tiene que ver nunca.
const MENU_ADMIN = ['Dashboard', 'Finanzas', 'Operaciones', 'Usuarios', 'Roles', 'Locales', 'Configuración'];

test.describe('Cajero', () => {
  test.skip(!credenciales('CAJERO'), faltan('CAJERO'));

  test('no ve el menú de administración', async ({ page }) => {
    await loginComo(page, 'CAJERO');
    await expect(page.getByText('Ventas').first()).toBeVisible();
    await expect(page).not.toHaveURL(/\/admin/);
    for (const item of MENU_ADMIN) {
      await expect(page.getByText(item, { exact: true })).toHaveCount(0);
    }
  });

  test('si escribe /admin a mano vuelve a su pantalla', async ({ page }) => {
    await loginComo(page, 'CAJERO');
    await expect(page.getByText('Ventas').first()).toBeVisible();
    await page.goto('/admin');
    await expect(page).not.toHaveURL(/\/admin/);
    await expect(page.getByText('Usuarios', { exact: true })).toHaveCount(0);
  });
});

test.describe('Encargado', () => {
  test.skip(!credenciales('ENCARGADO'), faltan('ENCARGADO'));

  test('entra al panel pero sin Roles, Locales ni Configuración (solo root)', async ({ page }) => {
    await loginComo(page, 'ENCARGADO');
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByText('Usuarios', { exact: true }).first()).toBeVisible();
    for (const item of ['Roles', 'Locales', 'Configuración']) {
      await expect(page.getByText(item, { exact: true })).toHaveCount(0);
    }
  });
});

test.describe('Root', () => {
  test.skip(!credenciales('ROOT'), faltan('ROOT'));

  test('ve el menú completo', async ({ page }) => {
    await loginComo(page, 'ROOT');
    await expect(page).toHaveURL(/\/admin/);
    for (const item of [...MENU_ADMIN, 'Ventas', 'Inventario']) {
      await expect(page.getByText(item, { exact: true }).first()).toBeVisible();
    }
  });
});

test.describe('Contador', () => {
  test.skip(!credenciales('CONTADOR'), faltan('CONTADOR'));

  // Rol de prueba: SALES_HISTORY + TRANSACTIONS + SALARY_PAYMENTS + SUPPLIER_PAYMENTS, sin POS
  // ni inventario ni gestionar usuarios (scripts/e2e/preparar-empresa-e2e.mjs).
  test('ve Finanzas e Informes, no la caja ni el inventario, y nunca el panel', async ({ page }) => {
    await loginComo(page, 'CONTADOR');
    await expect(page).not.toHaveURL(/\/admin/);
    await expect(page.getByText('Finanzas', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Informes', { exact: true }).first()).toBeVisible();
    for (const item of ['Inventario', 'Operaciones', 'Usuarios', 'Roles']) {
      await expect(page.getByText(item, { exact: true })).toHaveCount(0);
    }
    await expect(page.getByRole('button', { name: 'Abrir turno' })).toHaveCount(0);

    await page.goto('/admin');
    await expect(page).not.toHaveURL(/\/admin/);
    await expect(page.getByText('Usuarios', { exact: true })).toHaveCount(0);
  });
});
