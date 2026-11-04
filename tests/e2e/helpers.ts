import { expect, type Page } from '@playwright/test';

/**
 * Usuarios de prueba por rol. Usuario y contraseña salen de secrets de GitHub
 * (E2E_<ROL>_USER / E2E_<ROL>_PASS), nunca del repo ni del vault. Si faltan, los tests
 * de ese rol se saltean (test.skip) en vez de fallar.
 */
export type Rol = 'ROOT' | 'ENCARGADO' | 'CAJERO' | 'CONTADOR';

export function credenciales(rol: Rol): { user: string; pass: string } | null {
  const user = process.env[`E2E_${rol}_USER`] ?? '';
  const pass = process.env[`E2E_${rol}_PASS`] ?? '';
  return user && pass ? { user, pass } : null;
}

export const faltan = (rol: Rol) =>
  `Faltan los secrets E2E_${rol}_USER / E2E_${rol}_PASS (ver job e2e en .github/workflows/ci.yml)`;

export async function login(page: Page, username: string, password: string) {
  await page.goto('/login');
  // React Native Paper pone un span flotante sobre el input — usamos click force + type.
  await page.locator('input').nth(0).click({ force: true });
  await page.keyboard.type(username);
  await page.locator('input').nth(1).click({ force: true });
  await page.keyboard.type(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

export async function loginComo(page: Page, rol: Rol) {
  const c = credenciales(rol);
  if (!c) throw new Error(faltan(rol));
  await login(page, c.user, c.pass);
  await expect(page).not.toHaveURL(/\/login/);
}

// Cerrar sesión pide confirmación (Revisión 01, N-03): botón del menú y después el del diálogo.
export async function logout(page: Page) {
  await page.getByRole('button', { name: 'Cerrar sesión' }).first().click();
  await expect(page.getByText('¿Cerrar sesión?')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión' }).last().click();
}
