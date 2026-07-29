import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAIN_JS = path.join(__dirname, '../js/main.js');
const INDEX_HTML = path.join(__dirname, '../index.html');

let main = fs.readFileSync(MAIN_JS, 'utf-8');

// 1. Add lockedToast
if (!main.includes('function lockedToast')) {
    main = main.replace(
        'function toast(msg, undo) {',
        `function lockedToast() {
    toast("This is a Studio feature");
    const p = $("pricing");
    if (p) p.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" });
}

function toast(msg, undo) {`
    );
}

// 2. runFixer (1019)
if (!main.includes('License.Gate.has("fixer-unlimited")')) {
    main = main.replace(
        'function runFixer() {',
        `function runFixer() {
    if (!window.License.Gate.has("fixer-unlimited")) {
        const today = new Date().toISOString().split('T')[0];
        let countObj = { date: today, n: 0 };
        try {
            const stored = localStorage.getItem("gamut.fixer.count");
            if (stored) countObj = JSON.parse(stored);
        } catch(e) {}
        if (countObj.date !== today) countObj = { date: today, n: 0 };
        if (countObj.n >= 3) {
            lockedToast();
            return;
        }
        countObj.n++;
        localStorage.setItem("gamut.fixer.count", JSON.stringify(countObj));
    }
`
    );
}

// 3. export loop
if (!main.includes('!window.License.Gate.has("export-" + btn.dataset.export)')) {
    main = main.replace(
        'const [label, text] = EXPORTERS[btn.dataset.export](state.palette);',
        `if (btn.dataset.export !== "css" && !window.License.Gate.has("export-" + btn.dataset.export)) {
                lockedToast();
                return;
            }
            const [label, text] = EXPORTERS[btn.dataset.export](state.palette);`
    );
}

// 4. downloadSvgCard
if (!main.includes('Gate.has("export-svg")')) {
    main = main.replace(
        'function downloadSvgCard() {',
        `function downloadSvgCard() {
    if (!window.License.Gate.has("export-svg")) { lockedToast(); return; }`
    );
}

// 5. downloadAiPackage
if (!main.includes('Gate.has("ai-package")')) {
    main = main.replace(
        'function downloadAiPackage() {',
        `function downloadAiPackage() {
    if (!window.License.Gate.has("ai-package")) { lockedToast(); return; }`
    );
}

// 6. print-sheet
if (!main.includes('Gate.has("print-sheet")')) {
    main = main.replace(
        '$("print-sheet").addEventListener("click", () => window.print());',
        `$("print-sheet").addEventListener("click", () => {
        if (!window.License.Gate.has("print-sheet")) { lockedToast(); return; }
        window.print();
    });`
    );
}

// 7. save-palette
if (!main.includes('Gate.has("save-palette")')) {
    main = main.replace(
        '$("save-palette").addEventListener("click", toggleSave);',
        `$("save-palette").addEventListener("click", () => {
        if (!window.License.Gate.has("save-palette")) { lockedToast(); return; }
        toggleSave();
    });`
    );
}

// 8. agency interactions
if (!main.includes('Gate.has("agency")')) {
    main = main.replace(
        'function onAgencyChange() {',
        `function onAgencyChange() {
    if (!window.License.Gate.has("agency")) { lockedToast(); return; }`
    );
}

// 9. fix-image
if (!main.includes('Gate.has("fix-image")')) {
    main = main.replace(
        '$("fix-image").addEventListener("change", e => {',
        `$("fix-image").addEventListener("change", e => {
        if (!window.License.Gate.has("fix-image")) { lockedToast(); e.target.value = ""; return; }`
    );
}

// 10. vision
if (!main.includes('Gate.has("vision")')) {
    main = main.replace(
        'document.querySelectorAll(".vision-btn").forEach(b => {',
        `if (!window.License.Gate.has("vision")) { lockedToast(); return; }
            document.querySelectorAll(".vision-btn").forEach(b => {`
    );
}

// 11. ctl-brand
if (!main.includes('Gate.has("lock-brand")')) {
    main = main.replace(
        '$("ctl-brand").addEventListener("change", () => generate(false));',
        `$("ctl-brand").addEventListener("change", (e) => {
        if (!window.License.Gate.has("lock-brand")) { lockedToast(); e.target.value = ""; return; }
        generate(false);
    });`
    );
    main = main.replace(
        '$("ctl-brand-clear").addEventListener("click", () => {',
        `$("ctl-brand-clear").addEventListener("click", () => {
        if (!window.License.Gate.has("lock-brand")) { lockedToast(); return; }`
    );
}

fs.writeFileSync(MAIN_JS, main);


// Modify index.html
let html = fs.readFileSync(INDEX_HTML, 'utf-8');

const studioTag = ' <span class="studio-tag mono">Studio</span>';

const toReplace = [
    '<label for="ctl-brand">Lock a brand color <span class="optional">optional</span></label>',
    '<button class="btn-mini" id="save-palette" type="button">Save palette</button>',
    '<span class="exports-label mono">Vision</span>',
    '<div class="agency-head">', // Actually let's just add it to agency h3: <h3>White-label</h3>
    '<button class="btn-mini" id="print-sheet" type="button">Print brand sheet</button>',
    '<button class="btn-mini" id="ai-package" type="button">AI import package</button>',
    '<label class="btn-mini fixer-image-btn" for="fix-image">Or extract from an image</label>',
    '<button class="btn-mini" data-export="tailwind" type="button">Tailwind v4</button>',
    '<button class="btn-mini" data-export="scss" type="button">SCSS</button>',
    '<button class="btn-mini" data-export="json" type="button">JSON</button>',
    '<button class="btn-mini" data-export="tokens" type="button">Design system tokens (JSON)</button>',
    '<button class="btn-mini" id="svg-card" type="button">SVG card</button>'
];

const replacers = [
    '<label for="ctl-brand">Lock a brand color <span class="optional">optional</span>' + studioTag + '</label>',
    '<button class="btn-mini" id="save-palette" type="button">Save palette' + studioTag + '</button>',
    '<span class="exports-label mono">Vision' + studioTag + '</span>',
    '<div class="agency-head">', // wait, find h3
    '<button class="btn-mini" id="print-sheet" type="button">Print brand sheet' + studioTag + '</button>',
    '<button class="btn-mini" id="ai-package" type="button">AI import package' + studioTag + '</button>',
    '<label class="btn-mini fixer-image-btn" for="fix-image">Or extract from an image' + studioTag + '</label>',
    '<button class="btn-mini" data-export="tailwind" type="button">Tailwind v4' + studioTag + '</button>',
    '<button class="btn-mini" data-export="scss" type="button">SCSS' + studioTag + '</button>',
    '<button class="btn-mini" data-export="json" type="button">JSON' + studioTag + '</button>',
    '<button class="btn-mini" data-export="tokens" type="button">Design system tokens (JSON)' + studioTag + '</button>',
    '<button class="btn-mini" id="svg-card" type="button">SVG card' + studioTag + '</button>'
];

for(let i=0; i<toReplace.length; i++) {
    html = html.replace(toReplace[i], replacers[i]);
}

html = html.replace('<h3>White-label</h3>', '<h3>White-label' + studioTag + '</h3>');

fs.writeFileSync(INDEX_HTML, html);
console.log("Applied L2 patches.");
