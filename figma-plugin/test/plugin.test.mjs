import pkg from '../code.js';
const { buildInventory, applyDtcg } = pkg;
import assert from 'assert';

// Mock Figma API
global.figma = {
  root: { name: 'TestFile' },
  currentPage: {
    name: 'Page 1',
    selection: [],
    children: [
      {
        type: 'RECTANGLE',
        width: 100, height: 100,
        fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 0, b: 0 } }],
        cornerRadius: 8
      },
      {
        type: 'TEXT',
        width: 200, height: 50,
        characters: "Hello World",
        fontSize: 16,
        fontName: { family: "Inter", style: "Regular" },
        lineHeight: { value: 24 },
        fills: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0 } }]
      }
    ]
  },
  getLocalPaintStylesAsync: async () => [{ name: "Brand Red" }],
  getLocalTextStylesAsync: async () => [{ name: "Body" }],
  mixed: Symbol('mixed'),
  variables: {
    getLocalVariableCollectionsAsync: async () => [{ name: "Prism", modes: [{ modeId: '1:0', name: 'Mode 1' }] }],
    getLocalVariablesAsync: async () => [],
    createVariableCollection: (name) => {
      const coll = { id: 'coll:1', name, modes: [{ modeId: '1:0', name: 'Mode 1' }],
        renameMode: (id, name) => { coll.modes.find(m => m.modeId === id).name = name; },
        addMode: (name) => { coll.modes.push({ modeId: `1:${coll.modes.length}`, name }); }
      };
      global.figma.variables._collections.push(coll);
      return coll;
    },
    createVariable: (name, collId, type) => {
      const v = { name, variableCollectionId: collId, type, values: {}, setValueForMode: (id, val) => v.values[id] = val };
      global.figma.variables._vars.push(v);
      return v;
    },
    _collections: [],
    _vars: []
  },
  createTextStyle: () => {
    const s = {};
    global.figma._textStyles.push(s);
    return s;
  },
  loadFontAsync: async () => {},
  notify: () => {},
  _textStyles: []
};

async function runTests() {
  console.log("Running Phase 5: buildInventory()...");
  const inv = await buildInventory();
  assert(inv.schema === "gamut.inventory.v1", "Schema mismatch");
  assert(inv.source.nodeCount === 2, "Should scan 2 nodes");
  
  // Area weighting test
  const redColor = inv.observed.colors.find(c => c.hex === "#FF0000");
  assert(redColor.area === 10000, "100x100 rectangle = 10000 area");
  assert(inv.observed.radii.find(r => r.value === 8).area === 10000, "Radius should be 8");
  
  console.log("PASS: Phase 5 Scanner");

  console.log("Running Phase 7: applyDtcg()...");
  const dtcg = {
    Light: {
      color: { brand: { $type: "color", $value: "#FF0000" } },
      dimension: { spacing1: { $type: "dimension", $value: "16px" } },
      typography: { body: { $type: "typography", $value: { fontFamily: "Inter", fontSize: "16px" } } }
    },
    Dark: {
      color: { brand: { $type: "color", $value: "#880000" } }
    }
  };

  await applyDtcg(dtcg);
  
  const gamutColl = global.figma.variables._collections.find(c => c.name === "Gamut");
  assert(gamutColl, "Gamut collection should be created");
  assert(gamutColl.modes.length === 2, "Should have Light and Dark modes");
  
  const brandVar = global.figma.variables._vars.find(v => v.name === "color/brand");
  assert(brandVar, "color/brand variable should be created");
  assert(brandVar.type === 'COLOR', "color/brand should be COLOR type");
  
  const bodyStyle = global.figma._textStyles.find(s => s.name === "Gamut/body");
  assert(bodyStyle, "Text style should be created");
  assert(bodyStyle.fontSize === 16, "FontSize should be parsed");

  console.log("PASS: Phase 7 Apply");
}

runTests().catch(e => { console.error(e); process.exit(1); });
