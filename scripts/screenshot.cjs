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
  await new Promise(r => setTimeout(r, 800));

  // Click "View demo first"
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('a, button')].find(e => e.textContent.toLowerCase().includes('demo'));
    if (el) el.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  // Helper: click a bottom nav label
  const clickNav = async (label) => {
    await page.evaluate((lbl) => {
      const spans = [...document.querySelectorAll('nav span')];
      const s = spans.find(el => el.textContent.trim() === lbl);
      if (s) s.closest('button')?.click();
    }, label);
    await new Promise(r => setTimeout(r, 1000));
  };

  // Navigate to a tab using React fiber onClick
  const navToTab = async (tabName) => {
    const result = await page.evaluate((tab) => {
      // Find ALL elements with matching text
      const allEls = document.querySelectorAll('span, div');
      const candidates = [];
      for (const el of allEls) {
        if (el.textContent?.trim() === tab || el.textContent?.trim() === tab.toUpperCase()) {
          // Walk up to find a parent with React onClick in its props
          let cur = el;
          for (let i = 0; i < 15; i++) {
            cur = cur.parentElement;
            if (!cur) break;
            const fiberKey = Object.keys(cur).find(k => k.startsWith('__reactFiber'));
            if (fiberKey) {
              let fiber = cur[fiberKey];
              // Walk fiber tree
              for (let j = 0; j < 10; j++) {
                const props = fiber?.memoizedProps;
                if (props?.onClick && typeof props.onClick === 'function') {
                  // This is likely the card - trigger a real DOM click
                  cur.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                  return 'dispatched click on ' + cur.tagName + ' depth=' + i;
                }
                fiber = fiber?.return;
              }
            }
          }
        }
      }
      return 'not found for ' + tab;
    }, tabName);
    console.log(`navToTab(${tabName}):`, result);
    await new Promise(r => setTimeout(r, 1200));
  };

  const shot = async (name) => {
    const p = path.join(OUT_DIR, `${name}.png`);
    await page.screenshot({ path: p });
    console.log(`  ✓ ${name}`);
  };

  // HOME
  await shot('home');

  // RECOVERY, SLEEP, STRAIN, HEALTHSPAN via bottom nav
  await clickNav('Recovery'); await shot('recovery');
  await clickNav('Sleep');    await shot('sleep');
  await clickNav('Strain');   await shot('strain');
  await clickNav('Healthspan'); await shot('healthspan');

  // Back to home
  await clickNav('Today');
  await new Promise(r => setTimeout(r, 600));

  // Navigate to Journal via the home card
  await navToTab('Journal');
  const h1 = await page.evaluate(() => document.querySelector('h1,h2')?.textContent || '');
  console.log('After journal nav, heading:', h1);
  await shot('journal');

  // Journal longevity tab
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find(b => b.textContent.toLowerCase().includes('longevity'));
    if (b) b.click();
  });
  await new Promise(r => setTimeout(r, 700));
  await shot('journal-longevity');

  // Back home -> Trends
  await clickNav('Today');
  await new Promise(r => setTimeout(r, 600));
  await navToTab('Trends');
  const h2 = await page.evaluate(() => document.querySelector('h1,h2')?.textContent || '');
  console.log('After trends nav, heading:', h2);
  await shot('trends');

  await browser.close();
  console.log('\nDone.');
})().catch(e => { console.error(e.stack); process.exit(1); });
