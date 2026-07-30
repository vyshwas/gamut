import fs from 'node:fs';
import path from 'node:path';

const engineCode = fs.readFileSync(path.join(process.cwd(), 'js', 'engine.js'), 'utf8');
const context = {};
const evaluate = new Function('window', `
    const self = window;
    ${engineCode}
`);
evaluate(context);
const Engine = context.Engine;

function getLuminance(r, g, b) {
    const a = [r, g, b].map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function getContrast(hex1, hex2) {
    const rgb1 = Engine.hexToRgb(hex1);
    const rgb2 = Engine.hexToRgb(hex2);
    if (!rgb1 || !rgb2) return 1;
    const l1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
    const l2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
    const lightest = Math.max(l1, l2);
    const darkest = Math.min(l1, l2);
    return (lightest + 0.05) / (darkest + 0.05);
}

function runB4EngineTests() {
    let failed = 0;
    let differCount = 0;

    for (let i = 0; i < 100; i++) {
        const seeds = [
            '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0'),
            '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0'),
            '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0'),
            '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')
        ];

        const resPreserve = Engine.fixPalette(seeds, { strategy: 'preserve' });
        const resBalanced = Engine.fixPalette(seeds, { strategy: 'balanced' });
        const resMaximize = Engine.fixPalette(seeds, { strategy: 'maximize' });

        for (const res of [resPreserve, resBalanced, resMaximize]) {
            const ink = res.swatches.find(c => c.role === 'Ink')?.hex;
            const canvas = res.swatches.find(c => c.role === 'Dominant')?.hex || '#FFFFFF';
            if (ink) {
                const contrast = getContrast(ink, canvas);
                if (contrast < 4.45) {
                    console.error(`FAIL: Contrast floor failed for strategy. Expected >= 4.5, got ${contrast}`);
                    failed++;
                }
            }
        }

        const strPreserve = JSON.stringify(resPreserve.swatches);
        const strBalanced = JSON.stringify(resBalanced.swatches);
        const strMaximize = JSON.stringify(resMaximize.swatches);

        if (strPreserve !== strBalanced || strBalanced !== strMaximize) {
            differCount++;
        }
    }

    if (differCount === 0) {
        console.error("FAIL: Strategy selector produced identical outputs across all 100 seeds.");
        failed++;
    }

    if (failed === 0) {
        console.log("PASS: B4 Engine strategy tests completed successfully.");
    } else {
        console.error(`FAILED ${failed} tests`);
        process.exit(1);
    }
}

runB4EngineTests();
