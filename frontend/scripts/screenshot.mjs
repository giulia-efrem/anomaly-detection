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

async function shoot(page, name, width) {
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: join(outDir, `${name}-${width}.png`), fullPage: true })
}

try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    page.on('console', (m) => m.type() === 'error' && errors.push(`[${width}] ${m.text()}`))
    page.on('pageerror', (e) => errors.push(`[${width}] ${e.message}`))

    // Live: wait until every camera tile shows a decoded frame.
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(
      () => {
        const imgs = [...document.querySelectorAll('section[aria-label="Cameras"] img')]
        return imgs.length >= 7 && imgs.every((i) => i.naturalWidth > 0)
      },
      null,
      { timeout: 20000 },
    ).catch(() => {})
    const streams = await page.evaluate(() =>
      [...document.querySelectorAll('section[aria-label="Cameras"] img')].filter((i) => i.naturalWidth > 0).length,
    )
    console.log(`${width}px: ${streams} camera streams showing frames`)
    await page.waitForTimeout(500)
    await shoot(page, 'live', width)

    await page.goto(base + '/incidents', { waitUntil: 'networkidle' })
    await shoot(page, 'incidents', width)

    await page.goto(base + '/test-videos', { waitUntil: 'networkidle' })
    await shoot(page, 'test-videos', width)
    await page.getByRole('tab', { name: /Clips/ }).click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: join(outDir, `clips-${width}.png`) })
    await page.getByRole('tab', { name: 'Add your own' }).click()
    await shoot(page, 'add-video', width)

    await page.goto(base + '/cameras', { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)
    await shoot(page, 'cameras', width)

    if (width === 1440) {
      await page.getByRole('button', { name: 'Edit' }).first().click()
      await page.waitForTimeout(300)
      await page.screenshot({ path: join(outDir, 'camera-dialog-1440.png') })
      await page.keyboard.press('Escape')
      // Detection settings of a scene camera: thresholds and the normality heatmap.
      await page.getByRole('button', { name: 'Detection' }).nth(6).click()
      await page.waitForTimeout(1500)
      await page.screenshot({ path: join(outDir, 'detection-dialog-1440.png') })
      await page.keyboard.press('Escape')
    }

    await page.goto(base + '/training', { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    await shoot(page, 'training', width)

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    console.log(`${width}px: horizontal overflow ${overflow}px`)
    await page.close()
  }
} finally {
  await browser.close()
  await new Promise((r) => server.httpServer.close(r))
}
if (errors.length) console.log('Console errors:\n' + errors.join('\n'))
console.log(`Screenshots in ${outDir}`)
