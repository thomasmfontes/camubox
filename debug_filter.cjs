const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on('console', msg => {
        if (msg.text().includes('[FILTER AUDIT]')) {
            console.log('JS LOG:', msg.text());
        }
    });
    try {
        console.log('Navigating to page...');
        await page.goto('http://localhost:5176/dashboard/lockers');

        // Check for login button
        await page.waitForTimeout(2000);
        const loginBtn = await page.getByRole('button', { name: /Simular Aluno/i });
        if (await loginBtn.isVisible()) {
            console.log('Logging in...');
            await loginBtn.click();
            await page.waitForTimeout(3000);
        }

        console.log('Applying filter Térreo - PCD...');
        // Find the select for floor
        const selects = await page.$$('select');
        // First select is search (input), second is floor select
        if (selects.length > 0) {
            await selects[0].selectOption({ label: 'Térreo - PCD' });
            await page.waitForTimeout(2000);
        }

        const lockers = await page.$$('.locker-unit');
        console.log('Final Visible Lockers on screen:', lockers.length);

        // Wait a bit more for logs
        await page.waitForTimeout(2000);

    } catch (e) {
        console.log('Execution Error:', e.message);
    }
    await browser.close();
})();
