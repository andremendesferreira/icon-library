"use strict";
/**
 * The version in the footer: the commit being run and when the image was
 * built, so you can tell at a glance whether the server (Portainer) already
 * runs the latest commit on GitHub.
 *
 * In the Docker image, the build writes version.json from the few .git files
 * let through by .dockerignore (HEAD, refs/heads, packed-refs):
 *   node scripts/version.js --write <output.json> <git dir>
 * Running from the source folder (npm start), the commit comes from .git.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const REPOSITORY = "https://github.com/andremendesferreira/icon-library";
const SHA = /^[0-9a-f]{40}$/;

// The commit HEAD points to: a SHA directly (detached), or a branch whose
// SHA is in refs/heads/<branch> or in packed-refs
function readCommit(gitDir) {
  try {
    const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
    if (SHA.test(head)) return head;
    const ref = /^ref: (refs\/[^\s]+)$/.exec(head)?.[1];
    if (!ref || ref.includes("..")) return null;
    try {
      const loose = fs.readFileSync(path.join(gitDir, ref), "utf8").trim();
      if (SHA.test(loose)) return loose;
    } catch {}
    const packed = fs.readFileSync(path.join(gitDir, "packed-refs"), "utf8");
    for (const line of packed.split(/\r?\n/)) {
      const [sha, name] = line.split(" ");
      if (name === ref && SHA.test(sha)) return sha;
    }
  } catch {}
  return null;
}

function loadVersion() {
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(ROOT, "version.json"), "utf8"));
    return { commit: SHA.test(saved.commit) ? saved.commit : null, built: saved.built || null };
  } catch {
    return { commit: readCommit(path.join(ROOT, ".git")), built: null };
  }
}

const escape = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

// What goes into the footer: "9fb8dba · 2026-10-26", the commit a link to
// GitHub; nothing when the version is unknown
function versionHtml(version) {
  const parts = [];
  if (version.commit)
    parts.push(`<a href="${REPOSITORY}/commit/${version.commit}" rel="noopener">${escape(version.commit.slice(0, 7))}</a>`);
  if (version.built) parts.push(escape(String(version.built).slice(0, 10)));
  return parts.length ? `v ${parts.join(" · ")}` : "";
}

module.exports = { loadVersion, readCommit, versionHtml };

// Docker build: node scripts/version.js --write /app/version.json /tmp/git
if (require.main === module && process.argv[2] === "--write") {
  const [, , , output, gitDir] = process.argv;
  const version = { commit: readCommit(gitDir), built: new Date().toISOString() };
  fs.writeFileSync(output, JSON.stringify(version) + "\n");
  console.log(`version: ${version.commit ? version.commit.slice(0, 7) : "unknown commit"} built ${version.built}`);
}
