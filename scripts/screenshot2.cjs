const puppeteer = require('puppeteer-core');
const { default: chromium } = require('@sparticuz/chromium');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:5173';
const OUT_DIR = path.join(__dirname, '..', 'screenshots');

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const execPath = await chromium.executablePath();
  const browser = await puppeteer.launch({
    executablePath: execPath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-software-rasterizer'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);

  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));

  // Inject age + historical bio age data so the orb and pace slider render
  await page.evaluate(() => {
    localStorage.setItem('user_age', '32')
    localStorage.setItem('soma_profile', JSON.stringify({ name: 'Demo', age: 32 }))
    // Seed 60 days of bio age history (trending younger)
    const history = []
    const today = new Date()
    for (let i = 60; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      history.push({ date: d.toISOString().split('T')[0], physAge: Math.round((34 - i * 0.03) * 10) / 10 })
    }
    localStorage.setItem('physio_age_history', JSON.stringify(history))
  })

  // Click demo
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('a, button')].find(e => e.textContent.toLowerCase().includes('demo'));
    if (el) el.click();
  });
  await new Promise(r => setTimeout(r, 1800));

  const clickNav = async (label) => {
    await page.evaluate((lbl) => {
      const spans = [...document.querySelectorAll('nav span')];
      const s = spans.find(el => el.textContent.trim() === lbl);
      if (s) s.closest('button')?.click();
    }, label);
    await new Promise(r => setTimeout(r, 1000));
  };

  const shot = async (name) => {
    const p = path.join(OUT_DIR, `${name}.png`);
    await page.screenshot({ path: p });
    console.log(`  ✓ ${name}`);
    return p;
  };

  // Recovery
  await clickNav('Recovery');
  await shot('recovery-new');

  // Healthspan - top (orb + pace slider)
  await clickNav('Healthspan');
  await new Promise(r => setTimeout(r, 600));
  await shot('healthspan-top');

  // Healthspan - scroll to metric cards
  await page.evaluate(() => window.scrollTo(0, 900));
  await new Promise(r => setTimeout(r, 400));
  await shot('healthspan-metrics');

  await browser.close();
  console.log('Done.');
})().catch(e => { console.error(e.stack); process.exit(1); });
