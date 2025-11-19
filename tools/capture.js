const fs = require('fs');
const puppeteer = require('puppeteer');

(async () => {
  const url = process.argv[2] || 'http://127.0.0.1:8080';
  const outScreenshot = 'puppeteer-screenshot.png';
  const logs = [];
  const errors = [];

  let browser;
  try {
    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1280, height: 900 }
    });
    const page = await browser.newPage();

    page.on('console', msg => {
      const text = msg.text();
      logs.push({ type: 'console', text });
      console.log('[console]', text);
    });

    page.on('pageerror', err => {
      errors.push({ type: 'pageerror', message: err.message, stack: err.stack });
      console.error('[pageerror]', err.message);
    });

    page.on('requestfailed', req => {
      const r = { type: 'requestfailed', url: req.url(), method: req.method(), failure: req.failure() };
      logs.push(r);
      console.warn('[requestfailed]', r.url, r.failure && r.failure.errorText);
    });

    // Increase timeout to allow Firebase scripts to load
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 }).catch(e => {
      console.warn('goto error:', e.message);
    });

    // Wait a little to allow runtime initialization
    await new Promise((r) => setTimeout(r, 1500));

    // If a toggle-edit button exists, try clicking it to simulate entering edit mode
    try {
      const hasToggle = await page.$('#toggle-edit-btn');
      if (hasToggle) {
        await page.click('#toggle-edit-btn');
        console.log('Clicked toggle-edit-btn to enter edit mode');
        await new Promise((r) => setTimeout(r, 700));
      }
    } catch (e) {
      console.warn('Could not click toggle button:', e.message || e);
    }

    // Capture screenshot
    await page.screenshot({ path: outScreenshot, fullPage: true });
    console.log('Saved screenshot to', outScreenshot);

    // Gather DOM availability check
    const appExists = await page.evaluate(() => !!document.getElementById('app'));
    console.log('app element present:', appExists);

    // Attempt to read any visible error text in body
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 2000));
    console.log('Body text (truncated):\n', bodyText);

    // Write logs to file
    fs.writeFileSync('puppeteer-console.json', JSON.stringify({ logs, errors }, null, 2));
    console.log('Wrote puppeteer-console.json');

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('Capture failed:', err.message);
    if (browser) await browser.close();
    process.exit(2);
  }
})();
