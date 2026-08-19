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

function runDiagnoseTests() {
    let failed = 0;

    // Test Case 1: Palette with a dark anchor and high contrast
    const cleanPalette = ['#FFFFFF', '#0B0B0D', '#00FF00', '#FF0000'];
    const issuesClean = Engine.diagnosePalette(cleanPalette);
    // Might have Law 2 everything is muted? No, green and red are highly saturated.
    // Might have Law 5? No, only red/green are loud.
    // Dominant: #FFFFFF, Ink: #0B0B0D (contrast ~21:1).
    if (issuesClean.some(issue => issue.law === 1 || issue.law === 9)) {
        console.error("FAIL: diagnosed clean palette as breaking Law 1 or Law 9");
        failed++;
    }

    // Test Case 2: Palette with no dark anchor (lightest/darkest are both light)
    const lightOnly = ['#FFFFFF', '#EEEEEE', '#DDDDDD', '#CCCCCC'];
    const issuesLightOnly = Engine.diagnosePalette(lightOnly);
    if (!issuesLightOnly.some(issue => issue.law === 1)) {
        console.error("FAIL: missed missing dark anchor in light-only palette");
        failed++;
    }

    // Test Case 3: Too many loud colors
    const tooManyLoud = ['#050505', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF'];
    const issuesLoud = Engine.diagnosePalette(tooManyLoud);
    if (!issuesLoud.some(issue => issue.law === 5)) {
        console.error("FAIL: missed too many loud colors");
        failed++;
    }

    if (failed === 0) {
        console.log("PASS: B4 Engine strategy tests completed successfully.");
    } else {
        console.error(`FAILED ${failed} tests`);
        process.exit(1);
    }
}

runDiagnoseTests();
