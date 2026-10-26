"use strict";
/**
 * The main page in each language (/?lang=pt-BR, /?lang=de…), for search
 * engines. The page is translated in the browser (public/js/i18n), but a
 * crawler reads the HTML first: served as is, every ?lang= address said "the
 * official page is /" (canonical) while the hreflang links said "this is the
 * German version", and Google kept only the English one.
 *
 * So the server sets, for the language in ?lang=: <html lang>, the canonical
 * and og:url (pointing to that address), and the title and description from
 * the site's own dictionaries. The rest of the page is still translated by
 * the browser, as before.
 */
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const I18N = path.resolve(__dirname, "..", "public", "js", "i18n");
const DEFAULT = "en";

// Dictionary files: en.js, pt-BR.js, zh-CN.js… (not i18n.js or detect.js)
const LANGS = fs
  .readdirSync(I18N)
  .map((f) => /^([a-z]{2}(?:-[A-Z]{2})?)\.js$/.exec(f)?.[1])
  .filter(Boolean);

// "pt-br" or "PT-BR" in the address → "pt-BR"; anything else → null
function homeLang(value) {
  if (!value) return null;
  const wanted = String(value).toLowerCase();
  return LANGS.find((l) => l.toLowerCase() === wanted) ?? null;
}

const dictionaries = new Map();
async function dictionary(lang) {
  if (!dictionaries.has(lang)) {
    const promise = import(pathToFileURL(path.join(I18N, `${lang}.js`)).href).then((m) => m.default);
    // A failed load is tried again on the next request
    promise.catch(() => dictionaries.delete(lang));
    dictionaries.set(lang, promise);
  }
  return dictionaries.get(lang);
}

const escapeAttr = (text) =>
  String(text).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// The page HTML with the head adjusted for one language
function localizeHome(html, lang, dict) {
  const title = dict["meta.title"];
  const description = dict["meta.description"];
  let out = html.replace(/<html lang="[^"]*"/, `<html lang="${lang}"`);
  // canonical and og:url: the base address + ?lang=
  out = out.replace(
    /(<link rel="canonical" href=")([^"?#]*)("[^>]*>)/,
    (all, before, base, after) => `${before}${base}?lang=${encodeURIComponent(lang)}${after}`,
  );
  out = out.replace(
    /(<meta property="og:url" content=")([^"?#]*)("[^>]*>)/,
    (all, before, base, after) => `${before}${base}?lang=${encodeURIComponent(lang)}${after}`,
  );
  if (title) {
    out = out.replace(/<title>[^<]*<\/title>/, `<title>${escapeAttr(title)}</title>`);
    out = out.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escapeAttr(title)}$2`);
  }
  if (description) {
    out = out.replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${escapeAttr(description)}$2`);
    out = out.replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/, `$1${escapeAttr(description)}$2`);
  }
  return out;
}

module.exports = { DEFAULT, LANGS, dictionary, homeLang, localizeHome };
