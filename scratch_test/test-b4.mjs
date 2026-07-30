import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('file://' + process.cwd().replace('\\scratch_test', '') + '/index.html');

    const heroCopy = await page.$eval('.hero h1', el => el.innerText);
    console.log('Hero:', heroCopy.trim());
    
    // Check fixer strategy
    const hasStrategy = await page.$eval('.fixer-strategy', el => !!el);
    console.log('Strategy selector exists:', hasStrategy);

    // Paste colors to trigger runFixer
    await page.type('#fix-input', '#ff0000 #00ff00 #0000ff');
    await page.click('#fix-run');
    
    // Check stepper state
    const reviewStepColor = await page.$eval('#step-review', el => getComputedStyle(el).color);
    console.log('Review step active (should be dark ink):', reviewStepColor);

    const fixerSummary = await page.$eval('#fixer-summary', el => el.innerText);
    console.log('Summary chips:', fixerSummary.trim());
    
    // Adopt
    await page.click('#fix-adopt');
    const buildStepColor = await page.$eval('#step-build', el => getComputedStyle(el).color);
    console.log('Build step active:', buildStepColor);
    
    const sysBox = await page.$eval('#system-from-fixer', el => getComputedStyle(el).display);
    console.log('System box visible:', sysBox !== 'none');

    await browser.close();
})();
