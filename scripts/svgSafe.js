"use strict";
/**
 * Strict check of an SVG submitted to Iconlibrary. Only what the icon editor
 * produces is accepted:
 *
 *   <svg …presentation attributes…>
 *     <path/> <line/> <circle/> …                      basic shapes
 *     <linearGradient id="…"> <stop/> … </linearGradient>   gradients
 *     <radialGradient id="…"> <stop/> … </radialGradient>
 *   </svg>
 *
 * Basic shapes only, each self-closing, with known attributes whose values
 * look like numbers, path data, colors or keywords. A shape's fill or stroke
 * may also be "url(#id)", but only pointing at a gradient of the same icon.
 * Gradients hold only self-closing <stop/> elements and never point anywhere
 * (no href, no gradientTransform). Anything else — text, groups, images,
 * styles, scripts, links, entities, comments — is refused instead of
 * "cleaned", so nothing unexpected can reach other visitors.
 *
 * The result is re-written from scratch (normalized), never echoed back:
 * shapes first, then the gradients in use, renumbered il-grad-1, il-grad-2…
 * (the editor's own ids, so the icon opens there as an editable gradient).
 * Unused gradients are dropped.
 */

const NS = "http://www.w3.org/2000/svg";
const MAX_LENGTH = 20000;
const MAX_SHAPES = 200;
const MAX_GRADIENTS = 50;
const MAX_STOPS = 16;

// Unambiguous (no "\d+\.?\d*", which backtracks quadratically on a long
// run of digits followed by a bad character)
const NUMBER = /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/;
// Gradient coordinates and stop offsets: a number or a percentage, within
// ±10000 (an icon is a few dozen units; huge or tiny radii only make the
// drawing slow)
const LENGTH_TEXT = /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?%?$/;
const LENGTH = { test: (value) => LENGTH_TEXT.test(value) && Math.abs(parseFloat(value)) <= 10000 };
// Longest attribute value outside path data and point lists
const MAX_VALUE = 64;
const LONG_VALUES = new Set(["d", "points", "viewBox"]);
const NUMBERS = /^[-+0-9.eE\s,]+$/;
const PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9eE+\-.,\s]+$/;
const COLOR = /^(none|currentColor|transparent|#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20}|rgba?\(\s*[0-9.]+%?\s*,\s*[0-9.]+%?\s*,\s*[0-9.]+%?\s*(,\s*[0-9.]+\s*)?\))$/;
const ID = /^[a-zA-Z][\w.-]{0,63}$/;
// fill/stroke of a shape: a color, or a gradient of this icon (checked after
// the whole SVG is read, since the editor writes gradients after the shapes)
const PAINT_URL = /^url\(\s*#([a-zA-Z][\w.-]{0,63})\s*\)$/;
const PAINT = { test: (value) => COLOR.test(value) || PAINT_URL.test(value) };

const PRESENTATION = {
  fill: COLOR,
  stroke: COLOR,
  "stroke-width": NUMBER,
  "stroke-linecap": /^(butt|round|square)$/,
  "stroke-linejoin": /^(miter|round|bevel|arcs|miter-clip)$/,
  "stroke-miterlimit": NUMBER,
  "fill-rule": /^(nonzero|evenodd)$/,
  "clip-rule": /^(nonzero|evenodd)$/,
  opacity: NUMBER,
  "fill-opacity": NUMBER,
  "stroke-opacity": NUMBER,
};
const SHAPE_PRESENTATION = { ...PRESENTATION, fill: PAINT, stroke: PAINT };
const GEOMETRY = {
  path: { d: PATH },
  line: { x1: NUMBER, y1: NUMBER, x2: NUMBER, y2: NUMBER },
  circle: { cx: NUMBER, cy: NUMBER, r: NUMBER },
  ellipse: { cx: NUMBER, cy: NUMBER, rx: NUMBER, ry: NUMBER },
  rect: { x: NUMBER, y: NUMBER, width: NUMBER, height: NUMBER, rx: NUMBER, ry: NUMBER },
  polyline: { points: NUMBERS },
  polygon: { points: NUMBERS },
};
const GRADIENT_COMMON = {
  id: ID,
  gradientUnits: /^(userSpaceOnUse|objectBoundingBox)$/,
  spreadMethod: /^(pad|reflect|repeat)$/,
};
const GRADIENTS = {
  linearGradient: { ...GRADIENT_COMMON, x1: LENGTH, y1: LENGTH, x2: LENGTH, y2: LENGTH },
  radialGradient: { ...GRADIENT_COMMON, cx: LENGTH, cy: LENGTH, r: LENGTH, fx: LENGTH, fy: LENGTH, fr: LENGTH },
};
const STOP = { offset: LENGTH, "stop-color": COLOR, "stop-opacity": NUMBER };

class SvgError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// ' a="1" b="2" ' → { a: "1", b: "2" }; anything that is not a plain
// double-quoted attribute makes the whole SVG invalid
function readAttributes(text) {
  const attrs = {};
  const rest = text.replace(/\s+([a-zA-Z][\w:.-]*)="([^"<>&]*)"/g, (_, name, value) => {
    if (name in attrs) throw new SvgError("svg_invalid");
    attrs[name] = value.trim();
    return "";
  });
  if (rest.trim() !== "") throw new SvgError("svg_invalid");
  return attrs;
}

function pick(attrs, allowed, { strict }) {
  const out = {};
  for (const [name, value] of Object.entries(attrs)) {
    const rule = allowed[name];
    if (!rule) {
      // Unknown attributes on shapes are refused; on <svg> some are expected
      // and ignored (class, width, height, version…)
      if (strict) throw new SvgError("svg_attribute");
      continue;
    }
    if ((value.length > MAX_VALUE && !LONG_VALUES.has(name)) || !rule.test(value)) throw new SvgError("svg_attribute");
    out[name] = value;
  }
  return out;
}

const write = (attrs) =>
  Object.entries(attrs)
    .map(([name, value]) => ` ${name}="${value}"`)
    .join("");

// The <stop/> elements inside a gradient, and nothing else
function readStops(text) {
  const stops = [];
  let rest = text;
  while (rest.trim()) {
    const stop = /^\s*<stop\b([^<>]*?)\/>/.exec(rest);
    if (!stop) throw new SvgError("svg_shapes");
    stops.push(pick(readAttributes(stop[1]), STOP, { strict: true }));
    if (stops.length > MAX_STOPS) throw new SvgError("svg_too_large");
    rest = rest.slice(stop[0].length);
  }
  if (!stops.length) throw new SvgError("svg_shapes");
  return stops;
}

/**
 * @returns {string} normalized SVG
 * @throws {SvgError} code: svg_too_large | svg_invalid | svg_shapes | svg_attribute | svg_empty
 */
function sanitizeSvg(input) {
  const text = String(input || "").trim();
  if (text.length > MAX_LENGTH) throw new SvgError("svg_too_large");
  const root = /^<svg\b([^<>]*)>([\s\S]*)<\/svg>$/.exec(text);
  if (!root) throw new SvgError("svg_invalid");

  const rootAttrs = readAttributes(root[1]);
  if (rootAttrs.xmlns && rootAttrs.xmlns !== NS) throw new SvgError("svg_invalid");
  const viewBox = (rootAttrs.viewBox || "").split(/[\s,]+/).map(Number);
  if (viewBox.length !== 4 || viewBox.some((n) => !Number.isFinite(n)) || viewBox[2] <= 0 || viewBox[3] <= 0)
    throw new SvgError("svg_invalid");

  const shapes = [];
  const gradients = new Map();
  let body = root[2];
  while (body.trim()) {
    const shape = /^\s*<(\w+)\b([^<>]*?)\/>/.exec(body);
    if (shape && GEOMETRY[shape[1]]) {
      const tag = shape[1];
      shapes.push({ tag, attrs: pick(readAttributes(shape[2]), { ...GEOMETRY[tag], ...SHAPE_PRESENTATION }, { strict: true }) });
      if (shapes.length > MAX_SHAPES) throw new SvgError("svg_too_large");
      body = body.slice(shape[0].length);
      continue;
    }
    const gradient = /^\s*<(linearGradient|radialGradient)\b([^<>]*?)>([\s\S]*?)<\/\1\s*>/.exec(body);
    if (!gradient) throw new SvgError("svg_shapes");
    const tag = gradient[1];
    const attrs = pick(readAttributes(gradient[2]), GRADIENTS[tag], { strict: true });
    if (!attrs.id) throw new SvgError("svg_attribute");
    if (gradients.has(attrs.id)) throw new SvgError("svg_invalid");
    gradients.set(attrs.id, { tag, attrs, stops: readStops(gradient[3]) });
    if (gradients.size > MAX_GRADIENTS) throw new SvgError("svg_too_large");
    body = body.slice(gradient[0].length);
  }
  if (!shapes.length) throw new SvgError("svg_empty");

  // Every url(#…) must name a gradient of this icon; the ones in use get the
  // editor's ids, in the order they first appear
  const renamed = new Map();
  for (const { attrs } of shapes)
    for (const name of ["fill", "stroke"]) {
      const ref = PAINT_URL.exec(attrs[name] ?? "");
      if (!ref) continue;
      if (!gradients.has(ref[1])) throw new SvgError("svg_attribute");
      if (!renamed.has(ref[1])) renamed.set(ref[1], `il-grad-${renamed.size + 1}`);
      attrs[name] = `url(#${renamed.get(ref[1])})`;
    }
  const used = [...renamed].map(([id, novo]) => {
    const { tag, attrs, stops } = gradients.get(id);
    const stopsText = stops.map((stop) => `<stop${write(stop)}/>`).join("");
    return `<${tag}${write({ ...attrs, id: novo })}>${stopsText}</${tag}>`;
  });

  const presentation = pick(rootAttrs, PRESENTATION, { strict: false });
  const shapesText = shapes.map(({ tag, attrs }) => `<${tag}${write(attrs)}/>`).join("");
  return `<svg xmlns="${NS}" width="24" height="24" viewBox="${viewBox.join(" ")}"${write(presentation)}>${shapesText}${used.join("")}</svg>`;
}

module.exports = { sanitizeSvg, SvgError };
