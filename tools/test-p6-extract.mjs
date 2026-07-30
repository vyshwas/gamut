import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

// Mock browser environment
global.window = {};

const engineCode = fs.readFileSync(path.join(root, 'js', 'engine.js'), 'utf8');
const extractCode = fs.readFileSync(path.join(root, 'js', 'extract.js'), 'utf8');

// Evaluate code in this context
eval(engineCode);
global.Engine = window.Engine;
global.window.Engine = window.Engine;

// We need a small mock for how extract.js accesses Engine. 
// extract.js might use `Engine` directly.
eval(`const Engine = window.Engine; \n` + extractCode);

const E = window.Engine;
const Extractor = window.Extractor;

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomHex() {
    return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0').toUpperCase();
}

function createFuzzInventory() {
    const numColors = randomInt(2, 50);
    const colors = [];
    let totalArea = 0;
    for (let i = 0; i < numColors; i++) {
        const area = randomInt(1, 100000);
        totalArea += area;
        colors.push({ hex: randomHex(), count: randomInt(1, 100), area });
    }

    const numSpacing = randomInt(1, 20);
    const spacing = [];
    for (let i = 0; i < numSpacing; i++) {
        spacing.push({ value: randomInt(0, 150), count: randomInt(1, 50) });
    }

    const numRadii = randomInt(1, 10);
    const radii = [];
    for (let i = 0; i < numRadii; i++) {
        radii.push({ value: randomInt(0, 50), count: randomInt(1, 20) });
    }
    
    // Sometimes include 'mixed' and undefined values to fuzz weird inputs
    if (Math.random() > 0.8) spacing.push({ value: "mixed", count: 1 });
    if (Math.random() > 0.8) radii.push({ value: "mixed", count: 1 });
    
    return {
        schema: "gamut.inventory.v1",
        timestamp: new Date().toISOString(),
        observed: {
            colors,
            spacing,
            radii
        }
    };
}

const ITERATIONS = 1000;
let passes = 0;
let fails = 0;

console.log(`Starting Phase 6 fuzz tests: ${ITERATIONS} iterations...`);

for (let i = 0; i < ITERATIONS; i++) {
    const inv = createFuzzInventory();
    try {
        const result = Extractor.extractSystem(inv);
        
        // Assertions
        if (result.proposed.palette.swatches.length !== 4) throw new Error("Palette must have exactly 4 swatches");
        if (result.mapping.colors.length !== inv.observed.colors.length) throw new Error("Color mapping count mismatch");
        if (!result.drift.colors) throw new Error("Missing drift stats");
        
        passes++;
    } catch (e) {
        console.error(`Iteration ${i} failed:`, e);
        fails++;
        break; // Stop on first failure to debug
    }
}

console.log(`\nFuzz Results:`);
console.log(`Passed: ${passes}`);
console.log(`Failed: ${fails}`);

if (fails > 0) {
    process.exit(1);
} else {
    console.log("Phase 6 extraction logic verified!");
}
