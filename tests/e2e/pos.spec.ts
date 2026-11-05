import { test, expect } from '@playwright/test';
import { credenciales, faltan, loginComo } from './helpers';

/**
 * Flujo de caja del cajero: abrir turno, vender en efectivo y cerrar el turno.
 *
 * ESCRIBE EN DEV: deja un turno cerrado y una venta en el local del usuario E2E_CAJERO_USER.
 * Ese usuario tiene que ser de una empresa y un local de prueba (nunca datos de un cliente),
 * con al menos un producto con stock. Los pasos dependen uno del otro: corren en serie.
 */
test.describe.serial('POS del cajero: turno → venta en efectivo → cierre', () => {
  test.skip(!credenciales('CAJERO'), faltan('CAJERO'));

  test('abre turno (si no hay uno abierto), vende en efectivo y cierra', async ({ page }) => {
    test.setTimeout(90_000);
    await loginComo(page, 'CAJERO');

    const abrirTurno = page.getByRole('button', { name: 'Abrir turno' });
    const cerrarTurno = page.getByRole('button', { name: 'Cerrar turno' });
    await expect(abrirTurno.or(cerrarTurno).first()).toBeVisible({ timeout: 20_000 });

    // ── Abrir turno ──
    if (await abrirTurno.isVisible()) {
      await abrirTurno.click();
      await expect(page.getByText('Abrir turno').last()).toBeVisible();
      await page.getByRole('button', { name: 'Confirmar' }).click();
      await expect(page.getByText(/Turno .* abierto/)).toBeVisible();
    }
    await expect(cerrarTurno).toBeVisible();

    // ── Vender en efectivo (el POS manda todo como efectivo, ver POSScreen) ──
    // El total sale de la cotización del backend, y la venta lleva una Idempotency-Key (UUID).
    const cotizacion = page.waitForResponse((r) => /\/sales\/quote$/.test(r.url()) && r.request().method() === 'POST');
    await page.getByText('Toca para seleccionar').first().click();
    await page.getByText('Agregar', { exact: true }).click();
    expect((await cotizacion).status()).toBe(200);

    const venta = page.waitForRequest((r) => r.method() === 'POST' && /\/shifts\/\d+\/sales$/.test(r.url()));
    await page.getByRole('button', { name: 'Confirmar venta' }).click();
    expect((await venta).headers()['idempotency-key']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    await expect(page.getByText(/Venta registrada/)).toBeVisible();

    await page.getByText(/Ventas del turno/).click();
    await expect(page.getByText('Todavía no hay ventas en este turno.')).toHaveCount(0);

    // ── Cerrar turno ──
    await cerrarTurno.click();
    await page.getByRole('button', { name: 'Confirmar cierre' }).click();
    await expect(page.getByText('Turno cerrado')).toBeVisible();
  });
});
