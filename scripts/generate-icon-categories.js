"use strict";

const fs = require("fs");
const path = require("path");

const SAIDA = path.join(__dirname, "..", "public", "json", "icons-categories.json");

const REGRAS = [
  // ── Específicas primeiro ────────────────────────────────────────────────
  [/^emoji-|smile|frown|neutral-face/, "emoji"],
  [
    /heart-pulse|bandaid|capsule|prescription|hospital|virus|clipboard-pulse|thermometer-half|lungs|activity/,
    "medical",
  ],
  [/^(github|gitlab|git-)/, "development"],
  [
    /twitter|facebook|instagram|linkedin|discord|slack|whatsapp|telegram|youtube|tiktok|reddit|pinterest|spotify|twitch|mastodon|dribbble|behance|stack-overflow|signal|snapchat|threads|vimeo|skype|messenger|line|wechat|qq|strava|steam/,
    "social",
  ],
  [/apple|google|microsoft|windows|android|ubuntu|nvidia/, "development"],

  // ── Bootstrap's own patterns, which Lucide doesn’t have ─────────────────
  [/^sign-/, "navigation"],
  [/^badge-/, "multimedia"],
  [/^box-arrow/, "arrows"],
  [/^(journal|bookmark|collection)/, "files"],
  [/^(exclamation|question)/, "notifications"],
  [/^brightness-/, "devices"],
  [/^hand-/, "people"],
  [/^(backspace|check2)/, "text"],
  [/^browser-/, "development"],
  [/^(flask|eyedropper)/, "science"],
  [/^node-/, "development"],
  [/^postage/, "mail"],
  [/^[a-z]{1,2}-(circle|square)/, "text"], // c-circle, cc-square
  [/^patch-/, "shapes"],

  // ── Domains ────────────────────────────────────────────────────────────
  [/^(arrow|caret|chevron)|sort-|shuffle|repeat|return-|skip-/, "arrows"],
  [/^(file|folder|clipboard|archive|inbox-)|paperclip|floppy/, "files"],
  [/envelope|mailbox|^mail/, "mail"],
  [/^(bell|notification)/, "notifications"],
  [
    /chat|megaphone|telephone|^phone|reply|^send|broadcast-pin|voicemail/,
    "communication",
  ],
  [
    /wifi|bluetooth|reception|ethernet|^broadcast|router|modem|rss|nfc/,
    "connectivity",
  ],
  [
    /shield|^lock|unlock|^key\b|fingerprint|incognito|safe|passport|shield-check/,
    "security",
  ],
  [/calendar|^clock|alarm|stopwatch|hourglass|^watch/, "time"],
  [
    /camera|^image|aspect-ratio|^film|polaroid|^focus|^zoom|^crop/,
    "photography",
  ],
  [
    /^(play|pause|stop|skip|record)|music|volume|^mic|speaker|headphone|soundwave|vinyl|boombox|earbuds/,
    "multimedia",
  ],
  [
    /bank|cash|coin|currency|credit-card|wallet|piggy|receipt|^percent/,
    "finance",
  ],
  [
    /^(cart|bag|basket|shop)|^tag|^gift|^box-seam|upc|barcode|qr-code/,
    "shopping",
  ],
  [
    /cloud|^sun|moon|snow|rain|^wind|umbrella|thermometer|tornado|lightning|droplet|hurricane/,
    "weather",
  ],
  [
    /laptop|^pc|^phone|tablet|display|keyboard|^mouse|printer|usb|^hdd|^ssd|^cpu|^gpu|motherboard|memory|webcam|headset|smartwatch|device|sim|battery|plug|power/,
    "devices",
  ],
  [
    /^(car|truck|bus|train|bicycle|scooter|airplane|taxi|fuel|ev-)|^rocket/,
    "transportation",
  ],
  [/^(map|geo|compass|pin|signpost)|^globe|^cursor|crosshair/, "navigation"],
  [/^(house|door)/, "home"],
  [/building|^bank|^shop|^hospital/, "buildings"],
  [/^(person|people|gender)|^people/, "people"],
  [
    /^(graph|pie-chart|bar-chart)|clipboard-data|speedometer|^trending/,
    "charts",
  ],
  [
    /brush|palette|eyedropper|^pencil|^pen\b|vector|bezier|^layers|paint|magic|palette2/,
    "design",
  ],
  [
    /tools|wrench|hammer|screwdriver|^nut\b|^gear|sliders|^toggle|^sliders/,
    "tools",
  ],
  [
    /^(code|terminal|braces|bug|command|database|server|filetype|binary)|^git|^diagram|^cpu/,
    "development",
  ],
  [
    /^(type|font|text|paragraph|quote|list|blockquote|justify|indent|alphabet|spellcheck|translate|body-text|card-text|fonts|textarea|superscript|subscript)/,
    "text",
  ],
  [
    /^(plus|dash|x-|slash|equals|calculator|123|[0-9]-)|^percent|^asterisk|^omega|^infinity/,
    "math",
  ],
  [
    /^(grid|columns|rows|layout|window|sidebar|menu-|list-columns|distribute|align)|^square|^border|^table/,
    "layout",
  ],
  [/^(tree|flower|bug|egg)|^droplet|^fire|^snow/, "nature"],
  [/^(cup|egg|basket)|food|^nutrition/, "food-beverage"],
  [/^(trophy|dribbble)|^award|^medal/, "sports"],
  [/^(controller|dice|joystick)/, "gaming"],
  [/^(eyeglasses|ear|universal-access|braille)/, "accessibility"],
  [/^(person-badge|person-circle|person-square)|^account/, "account"],
  [
    /^(circle|square|triangle|hexagon|octagon|pentagon|diamond|star|heart|suit)/,
    "shapes",
  ],
  [/^(recycle|wind|lightbulb)/, "sustainability"],
  [/^(eye|search|zoom|funnel|filter)/, "tools"],
];

// Bootstrap variant suffixes: house-door-fill and house are the same concept
const SUFIXOS =
  /-(fill|square|circle|square-fill|circle-fill|dash|slash|check|x|plus|minus|up|down|left|right)$/;

const tokens = (n) => new Set(n.split("-").filter(Boolean));
const mesmosTokens = (a, b) => {
  const A = tokens(a),
    B = tokens(b);
  if (A.size !== B.size) return false;
  for (const t of A) if (!B.has(t)) return false;
  return true;
};

function criarClassificador(catLucide) {
  // Index by token set, to find alert-circle ↔ circle-alert
  const porTokens = new Map();
  for (const nome of Object.keys(catLucide)) {
    const chave = [...tokens(nome)].sort().join("|");
    if (!porTokens.has(chave)) porTokens.set(chave, nome);
  }

  return (nome) => {
    // Identical name in Lucide — direct inheritance from taxonomy
    if (catLucide[nome]) return { cats: catLucide[nome], via: "exact" };

    // Same tokens in a different order — renaming of Lucide
    const porOrdem = porTokens.get([...tokens(nome)].sort().join("|"));
    if (porOrdem) return { cats: catLucide[porOrdem], via: "tokens" };

    // Base name, without variant suffix
    let base = nome;
    for (let i = 0; i < 3 && SUFIXOS.test(base); i++)
      base = base.replace(SUFIXOS, "");
    if (base !== nome) {
      if (catLucide[base]) return { cats: catLucide[base], via: "base" };
      const baseOrdem = porTokens.get([...tokens(base)].sort().join("|"));
      if (baseOrdem) return { cats: catLucide[baseOrdem], via: "base" };
    }

    // Keyword approach
    for (const [padrao, categoria] of REGRAS) {
      if (padrao.test(nome)) return { cats: [categoria], via: "approximate" };
    }

    return { cats: [], via: "uncategorized" };
  };
}

(async () => {
  console.log("Downloading references…");
  const catLucide = await (
    await fetch("https://lucide.dev/api/categories")
  ).json();
  const feather = Object.keys(
    await (
      await fetch("https://unpkg.com/feather-icons/dist/icons.json")
    ).json(),
  );
  const sprite = await (
    await fetch("https://unpkg.com/bootstrap-icons/bootstrap-icons.svg")
  ).text();
  const bootstrap = [...sprite.matchAll(/<symbol[^>]*id="([^"]+)"/g)].map(
    (m) => m[1],
  );

  const classificar = criarClassificador(catLucide);

  const processar = (nomes, rotulo) => {
    const mapa = {};
    const contagem = {
      exact: 0,
      tokens: 0,
      base: 0,
      approximate: 0,
      uncategorized: 0,
    };
    for (const n of nomes) {
      const { cats, via } = classificar(n);
      contagem[via]++;
      // All icons receive a category: the ones that don't fit go to "others",
      // leaving the JSON complete and the page without needing a fallback.
      mapa[n] = cats.length ? cats : ["others"];
    }
    const cobertos = nomes.length - contagem.uncategorized;
    console.log(
      `\n${rotulo}: ${cobertos}/${nomes.length} with category ` +
        `(${Math.round((cobertos / nomes.length) * 100)}%)`,
    );
    for (const [via, n] of Object.entries(contagem)) {
      if (n) console.log(`   ${String(n).padStart(4)}  ${via}`);
    }
    return { mapa, contagem };
  };

  const f = processar(feather, "Feather");
  const b = processar(bootstrap, "Bootstrap");

  const saida = {
    _meta: {
      generated_at: new Date().toISOString().slice(0, 10),
      generator: "scripts/generate-icon-categories.js",
      reference: "https://lucide.dev/api/categories",
      note:
        'Categories matched as "exact", "tokens" and "base" inherit the Lucide taxonomy. ' +
        '"approximate" comes from keyword rules in the generator — an inference, not ' +
        'official library data. Icons matching no strategy get "others", counted as ' +
        '"uncategorized" in the coverage.',
      coverage: { feather: f.contagem, bootstrap: b.contagem },
    },
    feather: f.mapa,
    bootstrap: b.mapa,
  };

  fs.writeFileSync(SAIDA, JSON.stringify(saida, null, 1));
  const kb = Math.round(fs.statSync(SAIDA).size / 1024);
  console.log(`\nEscrito: ${path.relative(process.cwd(), SAIDA)} (${kb} KB)`);
})().catch((e) => {
  console.error("Falhou:", e.message);
  process.exit(1);
});
