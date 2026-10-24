"use strict";
/**
 * Strict check of an SVG submitted to Iconlibrary. Only what the icon editor
 * produces is accepted:
 *
 *   <svg …presentation attributes…> <path/> <line/> <circle/> … </svg>
 *
 * Basic shapes only, each self-closing, with known attributes whose values
 * look like numbers, path data, colors or keywords. Anything else — text,
 * groups, images, styles, scripts, links, entities, comments — is refused
 * instead of "cleaned", so nothing unexpected can reach other visitors.
 * The result is re-written from scratch (normalized), never echoed back.
 */

const NS = "http://www.w3.org/2000/svg";
const MAX_LENGTH = 20000;
const MAX_SHAPES = 200;

const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const NUMBERS = /^[-+0-9.eE\s,]+$/;
const PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9eE+\-.,\s]+$/;
const COLOR = /^(none|currentColor|transparent|#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20}|rgba?\(\s*[0-9.]+%?\s*,\s*[0-9.]+%?\s*,\s*[0-9.]+%?\s*(,\s*[0-9.]+\s*)?\))$/;

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
const GEOMETRY = {
  path: { d: PATH },
  line: { x1: NUMBER, y1: NUMBER, x2: NUMBER, y2: NUMBER },
  circle: { cx: NUMBER, cy: NUMBER, r: NUMBER },
  ellipse: { cx: NUMBER, cy: NUMBER, rx: NUMBER, ry: NUMBER },
  rect: { x: NUMBER, y: NUMBER, width: NUMBER, height: NUMBER, rx: NUMBER, ry: NUMBER },
  polyline: { points: NUMBERS },
  polygon: { points: NUMBERS },
};

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
    if (!rule.test(value)) throw new SvgError("svg_attribute");
    out[name] = value;
  }
  return out;
}

const write = (attrs) =>
  Object.entries(attrs)
    .map(([name, value]) => ` ${name}="${value}"`)
    .join("");

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
  let body = root[2];
  while (body.trim()) {
    const shape = /^\s*<(\w+)\b([^<>]*?)\/>/.exec(body);
    if (!shape) throw new SvgError("svg_shapes");
    const tag = shape[1];
    if (!GEOMETRY[tag]) throw new SvgError("svg_shapes");
    const attrs = pick(readAttributes(shape[2]), { ...GEOMETRY[tag], ...PRESENTATION }, { strict: true });
    shapes.push(`<${tag}${write(attrs)}/>`);
    if (shapes.length > MAX_SHAPES) throw new SvgError("svg_too_large");
    body = body.slice(shape[0].length);
  }
  if (!shapes.length) throw new SvgError("svg_empty");

  const presentation = pick(rootAttrs, PRESENTATION, { strict: false });
  return `<svg xmlns="${NS}" width="24" height="24" viewBox="${viewBox.join(" ")}"${write(presentation)}>${shapes.join("")}</svg>`;
}

module.exports = { sanitizeSvg, SvgError };
