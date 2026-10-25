"use strict";
/**
 * PNG previews of Iconlibrary icons, for moderation: an image model can look
 * at a PNG but not at SVG code, and a chat message can show it.
 *
 * Dark icon on a white square, with a margin around it. The SVG was already
 * validated by svgSafe.js when it was submitted.
 */

const MIN_SIZE = 16;
const MAX_SIZE = 512;
const DEFAULT_SIZE = 256;
const INK = "#1f2937";

let Resvg = null;
let loadError = null;
try {
  ({ Resvg } = require("@resvg/resvg-js"));
} catch (err) {
  // Without the native renderer the rest of the site still works; only the
  // preview answers 503
  loadError = err;
}

function previewAvailable() {
  return Boolean(Resvg);
}

// "?size=" → a whole number of pixels within the limits
function previewSize(value) {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n)) return DEFAULT_SIZE;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, n));
}

// Margin of 1/12 of the icon on each side (2 units on a 24-unit icon)
function withMargin(svg) {
  return svg.replace(/viewBox="([^"]+)"/, (all, box) => {
    const [x, y, w, h] = box.trim().split(/[\s,]+/).map(Number);
    if (![x, y, w, h].every(Number.isFinite)) return all;
    const m = Math.max(w, h) / 12;
    return `viewBox="${x - m} ${y - m} ${w + 2 * m} ${h + 2 * m}"`;
  });
}

function renderPng(svg, size = DEFAULT_SIZE) {
  if (!Resvg) throw loadError || new Error("preview renderer unavailable");
  const source = withMargin(String(svg).replace(/currentColor/g, INK));
  const resvg = new Resvg(source, {
    fitTo: { mode: "width", value: size },
    background: "#ffffff",
    font: { loadSystemFonts: false },
  });
  return resvg.render().asPng();
}

module.exports = { DEFAULT_SIZE, MAX_SIZE, MIN_SIZE, previewAvailable, previewSize, renderPng };
