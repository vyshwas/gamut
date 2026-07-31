function rgbToHex({ r, g, b }) {
  const h = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  } : {r: 0, g: 0, b: 0};
}

async function buildInventory() {
  const inventory = {
    schema: "gamut.inventory.v1",
    source: {
      fileName: figma.root.name,
      pageName: figma.currentPage.name,
      scannedAt: new Date().toISOString(),
      nodeCount: 0,
      capped: false
    },
    observed: {
      colors: [], text: [], spacing: [], radii: [], shadows: []
    },
    declared: { paintStyles: [], textStyles: [], variables: [] }
  };

  let nodesToScan = figma.currentPage.selection.length > 0 
    ? Array.from(figma.currentPage.selection) 
    : figma.currentPage.children;

  const MAX_NODES = 3000;
  let count = 0;

  // Track aggregations
  const colors = {}; // hex -> { hex, area, nodeType, count }
  const texts = {};
  const spacings = {};
  const radii = {};
  const shadows = {};

  function addColor(hex, area, type) {
    if (!colors[hex]) colors[hex] = { hex, area: 0, count: 0, nodeType: type };
    colors[hex].area += area;
    colors[hex].count += 1;
  }

  function addSpacing(val, area) {
    if (val === undefined || val === 0) return;
    if (!spacings[val]) spacings[val] = { value: val, area: 0, count: 0 };
    spacings[val].area += area;
    spacings[val].count += 1;
  }

  function addRadius(val, area) {
    if (val === undefined || val === 0) return;
    if (!radii[val]) radii[val] = { value: val, area: 0, count: 0 };
    radii[val].area += area;
    radii[val].count += 1;
  }

  function addShadow(shadow, area) {
    const alpha = (shadow.color && typeof shadow.color.a === 'number') ? shadow.color.a : 1;
    const key = `${shadow.offsetY}_${shadow.blur}_${alpha.toFixed(2)}`;
    if (!shadows[key]) shadows[key] = { offsetY: shadow.offsetY, blur: shadow.blur, colorAlpha: alpha, area: 0, count: 0 };
    shadows[key].area += area;
    shadows[key].count += 1;
  }

  function scanNode(node) {
    if (count >= MAX_NODES) {
      inventory.source.capped = true;
      return;
    }
    count++;

    const area = (node.width || 0) * (node.height || 0);

    // Colors
    if ('fills' in node && Array.isArray(node.fills)) {
      node.fills.forEach(f => {
        if (f.type === 'SOLID' && f.visible !== false) {
          addColor(rgbToHex(f.color), area, node.type);
        }
      });
    }
    if ('strokes' in node && Array.isArray(node.strokes)) {
      node.strokes.forEach(f => {
        if (f.type === 'SOLID' && f.visible !== false) {
          addColor(rgbToHex(f.color), area, node.type);
        }
      });
    }

    // Auto-layout Spacing
    if ('layoutMode' in node && node.layoutMode !== 'NONE') {
      addSpacing(node.itemSpacing, area);
      addSpacing(node.paddingTop, area);
      addSpacing(node.paddingBottom, area);
      addSpacing(node.paddingLeft, area);
      addSpacing(node.paddingRight, area);
    }

    // Geometry Radii
    if ('cornerRadius' in node) {
      if (node.cornerRadius !== figma.mixed) {
        addRadius(node.cornerRadius, area);
      } else {
        addRadius(node.topLeftRadius, area / 4);
        addRadius(node.topRightRadius, area / 4);
        addRadius(node.bottomLeftRadius, area / 4);
        addRadius(node.bottomRightRadius, area / 4);
      }
    }

    // Effects / Shadows
    if ('effects' in node) {
      node.effects.forEach(e => {
        if (e.type === 'DROP_SHADOW' && e.visible !== false) {
          addShadow({ offsetY: e.offset.y, blur: e.radius, color: e.color }, area);
        }
      });
    }

    // Text
    if (node.type === 'TEXT') {
      if (node.hasMissingFont) return;
      if (node.fontSize === figma.mixed || node.fontName === figma.mixed) {
        // Coarse fallback
        const fs = node.getRangeFontSize(0, 1);
        const fn = node.getRangeFontName(0, 1);
        const lh = node.getRangeLineHeight(0, 1);
        if (fs && fn) {
          const key = `${fn.family}_${fn.style}_${fs}`;
          if (!texts[key]) texts[key] = { fontFamily: fn.family, fontWeight: fn.style, fontSizePx: fs, lineHeight: lh.value || null, area: 0, chars: 0 };
          texts[key].area += area;
          texts[key].chars += node.characters.length;
        }
      } else {
        const key = `${node.fontName.family}_${node.fontName.style}_${node.fontSize}`;
        if (!texts[key]) texts[key] = { fontFamily: node.fontName.family, fontWeight: node.fontName.style, fontSizePx: node.fontSize, lineHeight: node.lineHeight.value || null, area: 0, chars: 0 };
        texts[key].area += area;
        texts[key].chars += node.characters.length;
      }
    }

    if ('children' in node) {
      for (const child of node.children) {
        scanNode(child);
      }
    }
  }

  nodesToScan.forEach(scanNode);
  inventory.source.nodeCount = count;

  inventory.observed.colors = Object.values(colors).sort((a, b) => b.area - a.area);
  inventory.observed.text = Object.values(texts).sort((a, b) => b.area - a.area);
  inventory.observed.spacing = Object.values(spacings).sort((a, b) => b.area - a.area);
  inventory.observed.radii = Object.values(radii).sort((a, b) => b.area - a.area);
  inventory.observed.shadows = Object.values(shadows).sort((a, b) => b.area - a.area);

  // Declared styles
  const paintStyles = await figma.getLocalPaintStylesAsync();
  inventory.declared.paintStyles = paintStyles.map(s => s.name);
  
  const textStyles = await figma.getLocalTextStylesAsync();
  inventory.declared.textStyles = textStyles.map(s => s.name);

  // Variables
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  inventory.declared.variables = collections.map(c => c.name);

  return inventory;
}

async function applyDtcg(dtcg) {
  // We expect dtcg shape from Phase 4
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  let gamutCollection = collections.find(c => c.name === 'Gamut');
  
  if (!gamutCollection) {
    gamutCollection = figma.variables.createVariableCollection('Gamut');
    gamutCollection.renameMode(gamutCollection.modes[0].modeId, 'Light');
    gamutCollection.addMode('Dark');
  }

  const modes = gamutCollection.modes;
  let lightModeId = modes.find(m => m.name === 'Light')?.modeId;
  let darkModeId = modes.find(m => m.name === 'Dark')?.modeId;

  if (!lightModeId) lightModeId = modes[0].modeId;
  if (!darkModeId) {
    gamutCollection.addMode('Dark');
    darkModeId = gamutCollection.modes.find(m => m.name === 'Dark')?.modeId;
  }

  const existingVars = await figma.variables.getLocalVariablesAsync();
  
  function setVar(name, type, valLight, valDark) {
    let v = existingVars.find(ev => ev.name === name && ev.variableCollectionId === gamutCollection.id);
    if (!v) {
      v = figma.variables.createVariable(name, gamutCollection.id, type);
      existingVars.push(v);
    }
    v.setValueForMode(lightModeId, valLight);
    if (valDark !== undefined) {
      v.setValueForMode(darkModeId, valDark);
    }
  }

  const colorGroupLight = dtcg.Light?.color || dtcg.color;
  const colorGroupDark = dtcg.Dark?.color || dtcg.color;

  if (colorGroupLight) {
    for (const [key, token] of Object.entries(colorGroupLight)) {
      if (token.$type === 'color' && token.$value) {
        const valL = hexToRgb(typeof token.$value === 'string' ? token.$value : token.$value.hex);
        const tokenDark = colorGroupDark && colorGroupDark[key] ? colorGroupDark[key] : token;
        const valD = hexToRgb(typeof tokenDark.$value === 'string' ? tokenDark.$value : tokenDark.$value.hex);
        setVar(`color/${key}`, 'COLOR', valL, valD);
      }
    }
  }

  const dimGroup = dtcg.Light?.dimension || dtcg.dimension || dtcg.spacing;
  if (dimGroup) {
    for (const [key, token] of Object.entries(dimGroup)) {
      if (token.$type === 'dimension') {
        const val = parseFloat(token.$value);
        setVar(`dimension/${key}`, 'FLOAT', val, val);
      }
    }
  }

  const typeGroup = dtcg.Light?.typography || dtcg.typography;
  if (typeGroup) {
    const existingTextStyles = await figma.getLocalTextStylesAsync();
    for (const [key, token] of Object.entries(typeGroup)) {
      if (token.$type === 'typography') {
        const v = token.$value;
        const fontName = { family: v.fontFamily || "Inter", style: v.fontWeight ? v.fontWeight.toString() : "Regular" };
        try {
          await figma.loadFontAsync(fontName);
          let style = existingTextStyles.find(s => s.name === `Gamut/${key}`);
          if (!style) {
            style = figma.createTextStyle();
            style.name = `Gamut/${key}`;
          }
          style.fontName = fontName;
          if (v.fontSize) style.fontSize = parseFloat(v.fontSize);
          if (v.lineHeight) style.lineHeight = { value: parseFloat(v.lineHeight) * 100, unit: 'PERCENT' };
          if (v.letterSpacing) style.letterSpacing = { value: parseFloat(v.letterSpacing), unit: 'PIXELS' };
        } catch (e) {
          console.warn(`Font ${fontName.family} ${fontName.style} unavailable, skipping ${key}`);
        }
      }
    }
  }

  figma.notify('Gamut variables applied successfully.');
}

if (typeof figma !== 'undefined') {
  figma.showUI(__html__, { width: 360, height: 420 });

  figma.ui.onmessage = async (msg) => {
    if (msg.type === 'request-scan') {
      try {
        const inventory = await buildInventory();
        figma.ui.postMessage({ type: 'inventory-ready', data: inventory });
      } catch (e) {
        console.error(e);
      }
    } else if (msg.type === 'apply-dtcg') {
      try {
        await applyDtcg(msg.data);
        figma.ui.postMessage({ type: 'apply-success' });
      } catch (e) {
        figma.ui.postMessage({ type: 'apply-error', error: e.message });
      }
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { rgbToHex, hexToRgb, buildInventory, applyDtcg };
}
