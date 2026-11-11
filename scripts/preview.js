"use strict";
/**
 * PNG previews of Iconlibrary icons, for moderation: an image model can look
 * at a PNG but not at SVG code, and a chat message can show it.
 *
 * Dark icon on a white square, with a margin around it. The SVG was already
 * validated by svgSafe.js when it was submitted.
 *
 * The server renders in a worker thread with a time limit (renderPngIsolated):
 * a valid icon can still be slow to paint (many large semi-transparent shapes
 * over a reflected gradient took ~13 s), and resvg is synchronous, so on the
 * main thread it would stop the whole site.
 */
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");

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

const RENDER_TIMEOUT_MS = 3000;
// Renders running at once; a worker past its time is terminated, but native
// code only stops when it returns, so this caps the CPU an abuser can hold
const MAX_RENDERS = 2;
let running = 0;

class PreviewError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// renderPng in a worker thread: resolves to the PNG, or rejects with
// PreviewError "preview_busy" (too many at once) or "preview_timeout"
function renderPngIsolated(svg, size = DEFAULT_SIZE, { timeout = RENDER_TIMEOUT_MS } = {}) {
  if (!Resvg) return Promise.reject(loadError || new Error("preview renderer unavailable"));
  if (running >= MAX_RENDERS) return Promise.reject(new PreviewError("preview_busy"));
  running++;
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: { previewJob: { svg: String(svg), size } } });
    let done = false;
    // The slot is free once the PNG is back (the heavy work is over) or the
    // thread has exited; a timed-out render keeps it until it really stops
    let released = false;
    const release = () => {
      if (!released) running--;
      released = true;
    };
    const finish = (fn, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => {
      finish(reject, new PreviewError("preview_timeout"));
      worker.terminate();
    }, timeout);
    worker.once("message", (png) => {
      release();
      finish(resolve, Buffer.from(png));
    });
    worker.once("error", (err) => finish(reject, err));
    worker.once("exit", () => {
      release();
      finish(reject, new PreviewError("preview_failed"));
    });
  });
}

// Inside the worker: render the job and hand the bytes back
if (!isMainThread && workerData?.previewJob) {
  const { svg, size } = workerData.previewJob;
  parentPort.postMessage(renderPng(svg, size));
}

module.exports = { DEFAULT_SIZE, MAX_SIZE, MIN_SIZE, PreviewError, previewAvailable, previewSize, renderPng, renderPngIsolated };
