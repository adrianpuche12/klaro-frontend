import { test, expect } from '@playwright/test';
import { credenciales, faltan, login, loginComo, logout } from './helpers';

// ─── Sin credenciales: corre siempre ──────────────────────────────────────────

test('credenciales incorrectas muestran error', async ({ page }) => {
  // Usuario que no existe: no necesita secrets y además prueba que Keycloak responde
  // (y acepta el origen del frontend) desde donde corre el test.
  await login(page, 'e2e.usuario.inexistente', 'contrasena-incorrecta-123');
  await expect(page.getByText(/Usuario o contraseña incorrectos/)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

// ─── Root (dueño) ─────────────────────────────────────────────────────────────

test.describe('Login de root', () => {
  test.skip(!credenciales('ROOT'), faltan('ROOT'));

  test('login como root entra al panel con Dashboard', async ({ page }) => {
    await loginComo(page, 'ROOT');
    await expect(page.getByText('Dashboard').first()).toBeVisible();
  });

  test('root puede cerrar sesión y vuelve al login', async ({ page }) => {
    await loginComo(page, 'ROOT');
    await expect(page.getByText('Dashboard').first()).toBeVisible();
    await logout(page);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible();
  });
});

// ─── Cajero ───────────────────────────────────────────────────────────────────

test.describe('Login de cajero', () => {
  test.skip(!credenciales('CAJERO'), faltan('CAJERO'));

  test('login como cajero entra a Ventas', async ({ page }) => {
    await loginComo(page, 'CAJERO');
    await expect(page.getByText('Ventas').first()).toBeVisible();
  });

  test('cajero puede cerrar sesión y vuelve al login', async ({ page }) => {
    await loginComo(page, 'CAJERO');
    await expect(page.getByText('Ventas').first()).toBeVisible();
    await logout(page);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible();
  });
});
