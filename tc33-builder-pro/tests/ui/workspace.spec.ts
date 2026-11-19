import { test, expect } from '@playwright/test'

test('command palette opens and filters keyboard actions', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'TC33 Builder Pro', level: 1 })).toBeVisible()
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('dialog', { name: 'Quick actions' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Search quick actions' }).fill('preferences')
  await expect(page.getByRole('option', { name: 'Open preferences' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Validate batch' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Quick actions' })).toHaveCount(0)
})

test('history screen explains local clearing before any records exist', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Recent & activity' }).click()
  await expect(page.getByText('No recent files yet.')).toBeVisible()
  await expect(page.getByText('No activity recorded yet.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Clear history' })).toBeDisabled()
})

test('workspace pins its shell, cycles theme, and shows version and copyright', async ({ page }) => {
  await page.addInitScript(() => {
    let workspace = {
      preferences: {
        theme: 'light', minimizeToTray: false, notifications: false, filename: 'tc33',
        dateFormat: 'none', defaultDistrict: '', defaultTaxYear: '', jsonFilename: ''
      },
      recent: [], activity: []
    }
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        getWorkspace: async () => workspace,
        setPreferences: async (preferences: typeof workspace.preferences) => {
          workspace = { ...workspace, preferences }
          return preferences
        },
        rendererReady: async () => undefined,
        onCommand: () => () => undefined,
        onToast: () => () => undefined
      }
    })
  })
  await page.goto('/')
  await expect(page.getByText('v1')).toBeVisible()
  await expect(page.getByText(/All rights reserved/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Theme: light. Switch theme' })).toBeVisible()
  const lightTopbar = await page.locator('.titlebar').evaluate((node) => getComputedStyle(node).backgroundColor)
  const lightSidebar = await page.locator('.sidebar').evaluate((node) => getComputedStyle(node).backgroundColor)
  await page.getByRole('button', { name: 'Theme: light. Switch theme' }).click()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'dark')
  await expect.poll(() => page.locator('.titlebar').evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe(lightTopbar)
  await expect.poll(() => page.locator('.sidebar').evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe(lightSidebar)
  await expect.poll(() => page.locator('.result-output').evaluate((node) => {
    const style = getComputedStyle(node)
    return parseFloat(style.maxHeight)
  })).toBeGreaterThan(300)
  await expect(page.locator('.result-output')).toHaveCSS('overflow-y', 'auto')
  await expect.poll(() => page.locator('.titlebar').evaluate((node) => getComputedStyle(node).position)).toBe('sticky')
  await expect.poll(() => page.locator('.sidebar').evaluate((node) => getComputedStyle(node).position)).toBe('sticky')
  await expect.poll(() => page.locator('.app-footer').evaluate((node) => getComputedStyle(node).position)).toBe('sticky')
})

test('removes one recent-file entry without deleting its source', async ({ page }) => {
  await page.addInitScript(() => {
    let workspace = {
      preferences: {
        theme: 'light', minimizeToTray: false, notifications: false, filename: 'tc33',
        dateFormat: 'none', defaultDistrict: '', defaultTaxYear: '', jsonFilename: ''
      },
      recent: [{ name: 'source.xlsx', path: '/mock/source.xlsx', openedAt: '2026-11-18T10:00:00.000Z' }],
      activity: []
    }
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        getWorkspace: async () => workspace,
        reopenSource: async (path: string) => {
          localStorage.setItem('recentReloadPath', path)
          return { name: 'source.xlsx', path, bytes: new Uint8Array([1]) }
        },
        removeRecentFile: async (path: string) => {
          workspace = { ...workspace, recent: workspace.recent.filter((file) => file.path !== path) }
          return workspace
        },
        rendererReady: async () => undefined,
        onCommand: () => () => undefined,
        onToast: () => () => undefined
      }
    })
  })
  page.on('dialog', (dialog) => void dialog.accept())
  await page.goto('/')
  await page.getByRole('button', { name: 'Recent & activity' }).click()
  await expect(page.getByText('source.xlsx')).toBeVisible()
  const actions = page.locator('.recent-actions')
  await expect(actions).toHaveCSS('flex-direction', 'row')
  await page.getByRole('button', { name: 'Reopen source.xlsx from disk' }).click()
  await expect(page.getByRole('tabpanel', { name: 'Run log' })).toContainText('Reopened source.xlsx.')
  await page.getByRole('button', { name: /Recent & activity/i }).click()
  await expect(page.locator('.source-list').getByText('source.xlsx', { exact: true })).toBeVisible()
  const removeButton = page.getByRole('button', { name: 'Remove source.xlsx from recent files' })
  const childOrder = await removeButton.evaluate((button) => Array.from(button.childNodes).map((node) => node.nodeType === Node.TEXT_NODE ? 'text' : (node as Element).tagName.toLowerCase()))
  expect(childOrder).toEqual(['text', 'svg'])
  await removeButton.click()
  await expect(page.getByText('No recent files yet.')).toBeVisible()

})

test('sidebar offers a smooth return to its top after it overflows', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 200 })
  await page.goto('/')
  const sidebar = page.locator('.sidebar')
  await expect(sidebar).toHaveCSS('overflow-y', 'auto')
  await sidebar.evaluate((node) => { node.scrollTop = node.scrollHeight })
  const scrollTop = page.getByRole('button', { name: 'Scroll sidebar to top' })
  await expect(scrollTop).toBeVisible()
  await scrollTop.evaluate((button) => (button as HTMLButtonElement).click())
  await expect.poll(() => sidebar.evaluate((node) => node.scrollTop)).toBe(0)
})

test('hides invalid report exports when validation finds no issues', async ({ page }) => {
  await page.addInitScript(() => {
    const workspace = {
      preferences: {
        theme: 'light', minimizeToTray: false, notifications: false, filename: 'tc33',
        dateFormat: 'none', defaultDistrict: '', defaultTaxYear: '', jsonFilename: ''
      },
      recent: [], activity: []
    }
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        getWorkspace: async () => workspace,
        rendererReady: async () => undefined,
        onCommand: () => () => undefined,
        onToast: () => () => undefined,
        openSources: async () => [
          { name: 'source.xlsx', path: '/mock/source.xlsx', bytes: new Uint8Array([1]) },
          { name: 'source.json', path: '/mock/source.json', bytes: new Uint8Array([2]) }
        ],
        validateSources: async () => [{
          file: 'source.xlsx', comparedTo: 'source.json', isValid: true,
          summaryLog: 'Validation passed.', sourceLog: 'Loaded source.xlsx.', errors: []
        }],
        recordActivity: async () => workspace
      }
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Choose files' }).click()
  await page.getByRole('button', { name: 'Validate batch' }).click()
  await page.getByRole('tab', { name: /Validation issues/ }).click()
  await expect(page.locator('.issue-list')).toContainText('PASS')
  await expect(page.getByRole('heading', { name: 'Export invalid report' })).toHaveCount(0)
})

test('imports JSON metadata, shows validation issues, and offers all report formats', async ({ page }) => {
  await page.addInitScript(() => {
    const preferences = {
      theme: 'light', minimizeToTray: false, notifications: false, filename: 'tc33',
      dateFormat: 'none', defaultDistrict: '', defaultTaxYear: '', jsonFilename: ''
    }
    const workspace = { preferences, recent: [], activity: [] }
    const xlsx = { name: 'source.xlsx', path: '/mock/source.xlsx', bytes: new Uint8Array([1]) }
    const json = {
      name: 'psr.json', path: '/mock/psr.json', bytes: new Uint8Array([2]),
      metadata: { parishName: 'ORLEANS', fipsCode: '22171', district: '1', taxYear: '2027' }
    }
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        getWorkspace: async () => workspace,
        rendererReady: async () => undefined,
        onCommand: () => () => undefined,
        onToast: () => () => undefined,
        openSources: async (kind: string) => kind === 'json' ? [json] : [xlsx, json],
        importDroppedSources: async () => [],
        setPreferences: async (next: typeof preferences) => ({ ...next }),
        recordActivity: async () => workspace,
        validateSources: async () => [{
          file: 'source.xlsx', comparedTo: 'psr.json', isValid: false,
          summaryLog: 'Validation Failed (1 issue found).',
          sourceLog: 'Loaded: source.xlsx | Sheet: Export Worksheet (33 rows)',
          errors: ['Class 30 (totalAssessed): Excel=1000 vs JSON=950']
        }],
        generateSources: async () => [],
        exportMismatches: async () => true,
        windowControl: async () => undefined,
        clearHistory: async () => workspace,
        reopenSource: async () => xlsx
      }
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Select JSON schema' }).first().click()
  await expect(page.getByText(/FIPS 22171 · District 1 · Tax Year 2027/)).toBeVisible()
  await page.getByRole('button', { name: 'Choose files' }).click()
  await expect(page.getByRole('checkbox', { name: 'Select source.xlsx for TC-33 export' })).toBeChecked()
  await page.getByRole('button', { name: 'Validate batch' }).click()
  await expect(page.locator('.result-output')).toContainText('Loaded: source.xlsx | Sheet: Export Worksheet (33 rows)')
  await page.getByRole('tab', { name: /Validation issues/ }).click()
  await expect(page.locator('.issue-list')).toContainText('totalAssessed')
  await page.getByRole('tab', { name: /Validation issues/ }).press('ArrowLeft')
  await expect(page.getByRole('tab', { name: 'Run log' })).toBeFocused()
  for (const label of ['PDF', 'Excel', 'CSV', 'JSON', 'Text', 'Word']) {
    await expect(page.getByRole('button', { name: `Export ${label}` })).toBeVisible()
  }
  await page.getByRole('button', { name: 'Export JSON' }).click()
  await expect(page.locator('.result-output')).toContainText('Saved tc33-validation-mismatches.json.')
  await page.getByRole('button', { name: 'Remove psr.json' }).click()
  await expect(page.locator('.result-output')).toContainText('Source removed from this batch')
})
