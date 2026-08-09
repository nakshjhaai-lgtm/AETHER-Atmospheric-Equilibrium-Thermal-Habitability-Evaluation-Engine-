// tests/e2e/aether.spec.js — Browser E2E tests for AETHER
// Run: npx playwright test
// Requires: npx playwright install

import { test, expect } from '@playwright/test';

test.describe('AETHER E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to get fresh onboarding
    await page.goto('http://localhost:8080');
    await page.evaluate(() => localStorage.clear());
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
  });

  test('Beginner mode loads with onboarding', async ({ page }) => {
    // Onboarding should be visible on first visit
    const onboarding = page.locator('#onboarding-overlay');
    await expect(onboarding).toBeVisible();
    await expect(onboarding.locator('h2')).toContainText('Welcome to AETHER');
  });

  test('Start Exploring dismisses onboarding', async ({ page }) => {
    await page.click('#btn-start-exploring');
    const onboarding = page.locator('#onboarding-overlay');
    await expect(onboarding).toBeHidden();
  });

  test('Mode selector switches modes', async ({ page }) => {
    // Dismiss onboarding
    await page.click('#btn-start-exploring');

    // Should start in beginner mode
    await expect(page.locator('.mode-tab--active')).toContainText('Beginner');

    // Switch to Advanced
    await page.click('.mode-tab[data-mode="advanced"]');
    await expect(page.locator('.mode-tab--active')).toContainText('Advanced');
    // Atmosphere tab should be visible
    await expect(page.locator('.adv-only-tab')).toBeVisible();

    // Switch to Expert
    await page.click('.mode-tab[data-mode="expert"]');
    await expect(page.locator('.mode-tab--active')).toContainText('Expert');
    // Scenario tab should be visible
    await expect(page.locator('.expert-only-tab')).toBeVisible();
  });

  test('Gas slider changes update the scenario', async ({ page }) => {
    await page.click('#btn-start-exploring');
    await page.click('.mode-tab[data-mode="advanced"]');

    // Open atmosphere tab
    await page.click('.adv-only-tab');

    // Get initial temperature
    const initialTemp = await page.locator('#v-tsurf').textContent();

    // Change CO2 slider to high value
    const co2Slider = page.locator('#gas-CO2');
    await co2Slider.fill('0.1');
    await co2Slider.dispatchEvent('input');

    // Temperature should change
    await page.waitForTimeout(200);
    const newTemp = await page.locator('#v-tsurf').textContent();
    expect(newTemp).not.toBe(initialTemp);
  });

  test('Biology target changes QHF output', async ({ page }) => {
    await page.click('#btn-start-exploring');
    await page.click('.mode-tab[data-mode="advanced"]');
    await page.click('.adv-only-tab');

    // Get initial QHF result
    const qhfCard = page.locator('#qhf-result-card');
    await expect(qhfCard).toBeVisible();

    // Switch biology target to methanogen
    await page.click('[data-target="methanogen"]');
    await page.waitForTimeout(200);

    // QHF should update
    const qhfBody = page.locator('#qhf-result-body');
    await expect(qhfBody).toContainText('Methanogen');
  });

  test('Expert JSON export works', async ({ page }) => {
    await page.click('#btn-start-exploring');
    await page.click('.mode-tab[data-mode="expert"]');
    await page.click('.expert-only-tab');

    // Click export
    await page.click('#btn-export-scenario');

    // Textarea should have valid JSON
    const textarea = page.locator('#scenario-json');
    const content = await textarea.inputValue();
    const parsed = JSON.parse(content);
    expect(parsed.schema_version).toBe('1.0.0');
    expect(parsed.star).toBeDefined();
    expect(parsed.atmosphere).toBeDefined();
  });

  test('Expert JSON import validates', async ({ page }) => {
    await page.click('#btn-start-exploring');
    await page.click('.mode-tab[data-mode="expert"]');
    await page.click('.expert-only-tab');

    // Paste invalid JSON
    await page.fill('#scenario-json', '{invalid json}');
    await page.click('#btn-import-scenario');
    await expect(page.locator('#scenario-status')).toContainText('error');

    // Paste valid scenario
    await page.fill('#scenario-json', JSON.stringify({
      schema_version: '1.0.0', model_fidelity: 'reduced',
      star: { effective_temperature_k: 5780, mass_solar: 1.0, radius_solar: 1.0 },
      orbit: { semi_major_axis_au: 1.0 },
      planet: { mass_earth: 1.0, radius_earth: 1.0 },
      atmosphere: { total_surface_pressure_pa: 101325 }
    }));
    await page.click('#btn-import-scenario');
    await expect(page.locator('#scenario-status')).toContainText('Valid');
  });

  test('Disclaimer banner is shown and dismissible', async ({ page }) => {
    await page.click('#btn-start-exploring');
    const banner = page.locator('#disclaimer-banner');
    await expect(banner).toBeVisible();
    await page.click('#disclaimer-close');
    await expect(banner).toBeHidden();
  });

  test('Reset button restores Earth defaults', async ({ page }) => {
    await page.click('#btn-start-exploring');
    // Change temperature slider
    await page.fill('#s-teff', '3000');
    await page.locator('#s-teff').dispatchEvent('input');
    await page.waitForTimeout(100);

    // Reset
    await page.click('#btn-reset');
    await page.waitForTimeout(200);

    // Should be back to Earth defaults
    const tempBadge = page.locator('[data-for="s-teff"]');
    await expect(tempBadge).toContainText('5780');
  });
});
