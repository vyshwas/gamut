window.Extractor = (function() {

    function colorDistance(hsl1, hsl2) {
        // Perceptual-ish distance based on HSL cylinder
        const dh = Math.min(Math.abs(hsl1.h - hsl2.h), 360 - Math.abs(hsl1.h - hsl2.h)) / 180;
        const ds = Math.abs(hsl1.s - hsl2.s) / 100;
        const dl = Math.abs(hsl1.l - hsl2.l) / 100;
        // Hue matters more when sat is high
        const hueWeight = (hsl1.s + hsl2.s) > 20 ? 1.5 : 0.2;
        return Math.sqrt(dh * dh * hueWeight + ds * ds + dl * dl);
    }

    function clusterColors(observedColors) {
        const threshold = 0.15;
        const clusters = [];
        const mapping = [];

        for (const c of Array.isArray(observedColors) ? observedColors : []) {
            // Engine.hexToRgb returns null on a bad hex, and hexToHsl
            // destructures that null and throws - validate the format
            // ourselves first so one malformed entry can't crash the
            // whole extraction, and skip it instead.
            if (!c || typeof c.hex !== 'string' || !/^#?[0-9a-fA-F]{3}$|^#?[0-9a-fA-F]{6}$/.test(c.hex.trim())) continue;
            const hex = c.hex;
            const hsl = Engine.hexToHsl(hex);
            if (!hsl) continue;
            // A node can legitimately have zero measured area (e.g. an
            // auto-layout frame with no intrinsic size). Floor it so it
            // still counts toward the centroid instead of dividing by 0.
            const area = (typeof c.area === "number" && c.area > 0) ? c.area : 1;
            let merged = false;

            for (const cluster of clusters) {
                if (colorDistance(hsl, cluster.hsl) < threshold) {
                    cluster.members.push({ hex, area, hsl });
                    cluster.area += area;

                    // Recompute centroid weighted by area
                    let r = 0, g = 0, b = 0, totalArea = 0;
                    for (const m of cluster.members) {
                        const rgb = Engine.hexToRgb(m.hex);
                        r += rgb.r * m.area;
                        g += rgb.g * m.area;
                        b += rgb.b * m.area;
                        totalArea += m.area;
                    }
                    const newHex = totalArea > 0
                        ? Engine.rgbToHex({ r: r/totalArea, g: g/totalArea, b: b/totalArea })
                        : cluster.hex;
                    cluster.hex = newHex;
                    cluster.hsl = Engine.hexToHsl(newHex);
                    merged = true;
                    mapping.push({ observed: hex, fate: 'merged', into: cluster.hex, reason: 'Perceptual clustering', law: 'Extraction' });
                    break;
                }
            }

            if (!merged) {
                clusters.push({ hex, hsl, area, members: [{ hex, area, hsl }] });
            }
        }

        clusters.sort((a, b) => b.area - a.area);
        
        // Finalize mapping for cluster heads
        for (const cluster of clusters) {
            const head = cluster.members[0];
            mapping.push({ observed: head.hex, fate: 'kept', into: cluster.hex, reason: 'Cluster head', law: 'Extraction' });
        }

        return { clusters, mapping };
    }

    function clusterScale(values, allowedSteps) {
        const result = [];
        const mapping = [];

        for (const val of Array.isArray(values) ? values : []) {
            if (!val || typeof val.value !== 'number' || !isFinite(val.value) || val.value === 0) continue;
            let closest = allowedSteps[0];
            let minDist = Math.abs(val.value - closest);
            for (const step of allowedSteps) {
                const dist = Math.abs(val.value - step);
                if (dist < minDist) {
                    minDist = dist;
                    closest = step;
                }
            }
            if (closest !== val.value) {
                mapping.push({ observed: val.value, fate: 'adjusted', into: closest, reason: 'Snapped to scale', law: 'System Grid' });
            } else {
                mapping.push({ observed: val.value, fate: 'kept', into: closest, reason: 'Aligned to grid', law: 'System Grid' });
            }
            if (!result.includes(closest)) result.push(closest);
        }

        return { proposed: result.sort((a,b) => a - b), mapping };
    }

    function extractSystem(inventory) {
        if (!inventory || !inventory.observed) throw new Error("Invalid inventory JSON");

        const observedColors = Array.isArray(inventory.observed.colors) ? inventory.observed.colors : [];
        const observedSpacing = Array.isArray(inventory.observed.spacing) ? inventory.observed.spacing : [];
        const observedRadii = Array.isArray(inventory.observed.radii) ? inventory.observed.radii : [];

        // Colors
        const { clusters, mapping: colorMapping } = clusterColors(observedColors);
        const topHexes = clusters.slice(0, 5).map(c => c.hex);

        if (topHexes.length === 0) {
            throw new Error("No usable colors found in this inventory. Scan a selection with visible solid fills or strokes and try again.");
        }

        // Pass through Fixer to get law-compliant palette
        const fixed = Engine.fixPalette(topHexes, { strategy: 'balanced' });

        const drift = {
            colors: {
                observedCount: observedColors.length,
                proposedCount: fixed.swatches.length,
                merges: colorMapping.filter(m => m.fate === 'merged')
            },
            spacing: {},
            radii: {}
        };

        // Combine extraction color mapping with Fixer's law mapping
        const finalColorMapping = [];
        for (const obs of observedColors) {
            if (!obs || typeof obs.hex !== 'string') continue;
            const extractMap = colorMapping.find(m => m.observed === obs.hex);
            if (extractMap && extractMap.fate === 'merged') {
                const clusterHex = extractMap.into;
                const fixMap = fixed.mapping.find(m => m.from && m.from.toLowerCase() === clusterHex.toLowerCase());
                if (fixMap) {
                    finalColorMapping.push({ observed: obs.hex, fate: 'merged & ' + fixMap.action, into: fixMap.swatch ? fixMap.swatch.hex : null, reason: fixMap.reason, law: 'Extraction & Fixer' });
                } else {
                    finalColorMapping.push({ observed: obs.hex, fate: 'retired', into: null, reason: 'Did not make top 5 clusters', law: 'Extraction Limits' });
                }
            } else if (extractMap) {
                const fixMap = fixed.mapping.find(m => m.from && m.from.toLowerCase() === obs.hex.toLowerCase());
                if (fixMap) {
                    finalColorMapping.push({ observed: obs.hex, fate: fixMap.action, into: fixMap.swatch ? fixMap.swatch.hex : null, reason: fixMap.reason, law: 'Fixer' });
                } else {
                    finalColorMapping.push({ observed: obs.hex, fate: 'retired', into: null, reason: 'Did not make top 5 clusters', law: 'Extraction Limits' });
                }
            } else {
                finalColorMapping.push({ observed: obs.hex, fate: 'retired', into: null, reason: 'Dropped early', law: 'Extraction Limits' });
            }
        }

        // Spacing
        const spacingScaleResult = clusterScale(observedSpacing, Engine.SPACING_STEPS || [0, 4, 8, 12, 16, 24, 32, 48, 64]);
        drift.spacing = { observedCount: observedSpacing.length, proposedCount: spacingScaleResult.proposed.length };

        // Radii
        const radiiScaleResult = clusterScale(observedRadii, [0, 2, 4, 6, 8, 12, 20, 999]);
        drift.radii = { observedCount: observedRadii.length, proposedCount: radiiScaleResult.proposed.length };

        return {
            proposed: {
                palette: fixed,
                spacing: spacingScaleResult.proposed,
                radii: radiiScaleResult.proposed
            },
            drift,
            mapping: {
                colors: finalColorMapping,
                spacing: spacingScaleResult.mapping,
                radii: radiiScaleResult.mapping
            },
            confidence: {
                colors: clusters.length > 5 ? 'Medium (many unmapped values)' : 'High'
            }
        };
    }

    return { clusterColors, clusterScale, extractSystem };
})();
