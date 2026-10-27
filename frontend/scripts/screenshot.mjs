// Visual check: serves the production build (proxying to the backend on :8000)
// and screenshots every page at desktop and phone width.
// Usage: npm run build && PLAYWRIGHT_BROWSERS_PATH=0 node scripts/screenshot.mjs [outDir]
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'
import { preview } from 'vite'

const outDir = resolve(process.argv[2] ?? 'screenshots')
mkdirSync(outDir, { recursive: true })

const server = await preview({ preview: { port: 5181, strictPort: true } })
const base = 'http://localhost:5181'
const browser = await chromium.launch()
const errors = []

async function shoot(page, name, width, fullPage = false) {
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: join(outDir, `${name}-${width}.png`), fullPage })
}

try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: width === 1440 ? 900 : 844 } })
    page.on('console', (m) => m.type() === 'error' && errors.push(`[${width}] ${m.text()}`))
    page.on('pageerror', (e) => errors.push(`[${width}] ${e.message}`))

    // Live: wait until the visible tiles show a decoded frame.
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(
      () => {
        const imgs = [...document.querySelectorAll('section[aria-label="Video wall"] img')]
        return imgs.length >= 1 && imgs.every((i) => i.naturalWidth > 0)
      },
      null,
      { timeout: 20000 },
    ).catch(() => {})
    const streams = await page.evaluate(() =>
      [...document.querySelectorAll('section[aria-label="Video wall"] img')].filter((i) => i.naturalWidth > 0).length,
    )
    console.log(`${width}px: ${streams} camera streams showing frames`)
    await page.waitForTimeout(1500)
    await shoot(page, 'live', width, width === 390)

    if (width === 1440) {
      await page.getByRole('button', { name: 'Three by three' }).click()
      await page.waitForTimeout(2500)
      await shoot(page, 'live-9', width)
      await page.getByRole('button', { name: 'Two by two' }).click()
      await page.getByRole('button', { name: 'Collapse sidebar' }).click()
      await page.waitForTimeout(800)
      await shoot(page, 'live-collapsed', width)
      await page.getByRole('button', { name: 'Expand sidebar' }).click()
    } else {
      await page.getByRole('button', { name: 'Open navigation' }).click()
      await page.waitForTimeout(300)
      await shoot(page, 'nav-drawer', width)
      await page.keyboard.press('Escape')
    }

    await page.goto(base + '/incidents', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: /^All/ }).click()
    await page.waitForTimeout(300)
    await shoot(page, 'incidents', width)
    const row = page.locator('tbody tr').first()
    if (await row.count()) {
      await row.click()
      await page.waitForTimeout(1500)
      await shoot(page, 'incident-drawer', width)
      await page.keyboard.press('Escape')
    }

    await page.goto(base + '/cameras', { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)
    await shoot(page, 'cameras', width)
    if (width === 1440) {
      // Detection settings of an unsupervised demo camera: thresholds and the heatmap.
      await page.getByRole('button', { name: 'Detection' }).nth(5).click()
      await page.waitForTimeout(1500)
      await page.screenshot({ path: join(outDir, 'detection-dialog-1440.png') })
      await page.keyboard.press('Escape')
    }

    await page.goto(base + '/test-videos', { waitUntil: 'networkidle' })
    await shoot(page, 'test-videos', width)
    await page.getByRole('tab', { name: /Clips/ }).click()
    await page.waitForTimeout(800)
    await shoot(page, 'clips', width)

    await page.goto(base + '/training', { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    await shoot(page, 'training', width)

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    console.log(`${width}px: horizontal overflow ${overflow}px`)
    console.log(`${width}px: tab title "${await page.title()}"`)
    await page.close()
  }
} finally {
  await browser.close()
  await new Promise((r) => server.httpServer.close(r))
}
if (errors.length) console.log('Console errors:\n' + errors.join('\n'))
console.log(`Screenshots in ${outDir}`)
