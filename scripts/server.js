"use strict";
/**
 * Minimal static server for local development — no dependencies.
 *
 *   npm start                 → http://localhost:8080
 *   PORT=3000 npm start       → another port
 *
 * Why a server at all: opened straight from disk (file://), the browser blocks
 * the fetch of json/icons-categories.json, and the Clipboard API only works in a
 * secure context (https:// or localhost).
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "public");
const PORT = Number(process.env.PORT) || 8080;
// Inside a container the server must listen on all interfaces (HOST=0.0.0.0)
const HOST = process.env.HOST || "localhost";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

http
  .createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, `http://${HOST}`).pathname);
    const file = path.join(ROOT, url.endsWith("/") ? url + "index.html" : url);

    // Never serve anything outside the project folder
    if (!file.startsWith(ROOT + path.sep)) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    fs.readFile(file, (err, data) => {
      if (err) {
        res
          .writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
          .end("Not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
      });
      res.end(data);
    });
  })
  .listen(PORT, HOST, () => {
    console.log(`Icon Library running at http://localhost:${PORT}`);
  });
