import { chromium } from 'playwright';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setViewportSize({ width: 375, height: 812 });
  await p.goto('http://localhost:5173');
  await p.locator('text=Registrieren').click();
  await p.waitForTimeout(400);
  await p.screenshot({ path: '/tmp/kistle_register.png' });
  await b.close();
  console.log('done');
})();
