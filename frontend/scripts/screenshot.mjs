// Visual check: serves the production build and screenshots the Live page.
// Usage: npm run build && PLAYWRIGHT_BROWSERS_PATH=0 node scripts/screenshot.mjs [outDir]
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'
import { preview } from 'vite'

const outDir = resolve(process.argv[2] ?? 'screenshots')
mkdirSync(outDir, { recursive: true })

const server = await preview({ preview: { port: 5181, strictPort: true } })
const url = 'http://localhost:5181/'
const browser = await chromium.launch()

try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
    page.on('console', (m) => m.type() === 'error' && console.log(`[${width}] console error:`, m.text()))
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: join(outDir, `live-${width}.png`), fullPage: true })

    // Review flow: confirm the first card and capture the status line.
    await page.getByRole('button', { name: 'Confirm' }).first().click()
    await page.getByRole('region', { name: 'Incidents' }).screenshot({ path: join(outDir, `incidents-confirmed-${width}.png`) })

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    console.log(`${width}px: horizontal overflow ${overflow}px`)
    await page.close()
  }

  // Close-up of the camera grid at 2x for detail checks.
  const hi = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await hi.goto(url, { waitUntil: 'networkidle' })
  await hi.evaluate(() => document.fonts.ready)
  await hi.getByRole('region', { name: 'Cameras' }).screenshot({ path: join(outDir, 'cameras-2x.png') })
  await hi.close()
} finally {
  await browser.close()
  await new Promise((r) => server.httpServer.close(r))
}
console.log(`Screenshots in ${outDir}`)
