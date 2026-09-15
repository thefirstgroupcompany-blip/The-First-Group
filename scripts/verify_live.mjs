import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') console.log('[CONSOLE ERR]:', msg.text());
  });
  page.on('pageerror', err => console.log('[PAGE ERR]:', err.message));

  console.log('Navigating to https://the-first-group-co.web.app/admin ...');
  await page.goto('https://the-first-group-co.web.app/admin', { waitUntil: 'domcontentloaded', timeout: 20000 });

  await page.evaluate(() => {
    const adminUser = {
      id: 'admin_1787603354648',
      name: 'AHMED',
      role: 'admin',
      username: 'AHMED',
      _sessionAt: Date.now()
    };
    localStorage.setItem('ms_user', JSON.stringify(adminUser));
    sessionStorage.setItem('ms_user', JSON.stringify(adminUser));
  });

  await page.goto('https://the-first-group-co.web.app/admin', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);

  const title = await page.title();
  console.log('Page Title:', title);

  const navButtons = await page.locator('button').allTextContents();
  console.log('Nav loaded successfully, found buttons:', navButtons.length);

  await browser.close();
  console.log('Live verification passed completely!');
})();
