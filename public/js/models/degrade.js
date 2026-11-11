// Degradê (gradiente) nas formas do editor. Funções puras, sem DOM.
//
// Cada degradê é um elemento próprio do ícone, filho direto do <svg>
// (<linearGradient id="il-grad-N"> ou <radialGradient>), que o lerSvg já
// aceita e o svg() exporta. As formas o usam com fill/stroke="url(#il-grad-N)".
//
// As coordenadas são em unidades do ícone (gradientUnits="userSpaceOnUse"),
// tiradas da caixa das formas que usam o degradê: com "objectBoundingBox", o
// padrão do SVG, uma linha reta (caixa de altura zero) ficaria sem cor. O
// EditorModel refaz as coordenadas a cada desenho, então o degradê acompanha
// a forma quando ela é movida, girada ou redimensionada.

// Sugestões mais usadas em interfaces: duas cores, da primeira para a segunda
export const DEGRADES_SUGERIDOS = [
  { id: "sunset", cores: ["#ff7e5f", "#feb47b"] },
  { id: "ocean", cores: ["#2193b0", "#6dd5ed"] },
  { id: "purple", cores: ["#7f00ff", "#e100ff"] },
  { id: "mint", cores: ["#11998e", "#38ef7d"] },
  { id: "fire", cores: ["#f12711", "#f5af19"] },
  { id: "sky", cores: ["#1a6ee8", "#00c6ff"] },
  { id: "rose", cores: ["#ee0979", "#ff6a00"] },
  { id: "night", cores: ["#232526", "#414345"] },
];

export const TIPOS_DE_DEGRADE = ["linear", "radial"];
const COR = /^#[0-9a-f]{6}$/i;
const ID = /^il-grad-\d+$/;

// Elemento do editor que é um degradê feito aqui (os de ícones de fora, com
// outro id, continuam como código, intocados)
export function ehDegrade(el) {
  if (!el?.html || (el.tag !== "linearGradient" && el.tag !== "radialGradient")) return false;
  return ID.test(/\bid="([^"]*)"/.exec(el.html)?.[1] ?? "");
}

// "url(#il-grad-3)" → "il-grad-3"; outra coisa → null
export function idDoDegrade(valor) {
  const m = /^\s*url\(\s*#(il-grad-\d+)\s*\)\s*$/.exec(String(valor ?? ""));
  return m ? m[1] : null;
}

// Confere e normaliza o pedido: { tipo, cores: [#rrggbb, #rrggbb], angulo }
export function normalizarDegrade({ tipo = "linear", cores, angulo = 90 } = {}) {
  if (!TIPOS_DE_DEGRADE.includes(tipo)) return null;
  if (!Array.isArray(cores) || cores.length < 2 || cores.length > 3 || !cores.every((c) => COR.test(c))) return null;
  const graus = Number(angulo);
  if (!Number.isFinite(graus)) return null;
  return { tipo, cores: cores.map((c) => c.toLowerCase()), angulo: ((Math.round(graus) % 360) + 360) % 360 };
}

const num = (v) => String(Math.round(v * 1000) / 1000);

// O elemento do degradê, com as coordenadas tiradas da caixa
// { minX, minY, maxX, maxY }. O ângulo segue o CSS: 0° de baixo para cima,
// 90° da esquerda para a direita, 180° de cima para baixo.
export function montarDegrade(id, pedido, caixa) {
  const d = normalizarDegrade(pedido);
  if (!d || !ID.test(id)) throw new Error("Degradê inválido");
  const { minX, minY, maxX, maxY } = caixa;
  const w = maxX - minX;
  const h = maxY - minY;
  const cx = minX + w / 2;
  const cy = minY + h / 2;
  const paradas = d.cores
    .map((cor, i) => `<stop offset="${num(i / (d.cores.length - 1))}" stop-color="${cor}"/>`)
    .join("");
  if (d.tipo === "radial") {
    const r = Math.max(Math.hypot(w, h) / 2, 0.5);
    return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}">${paradas}</radialGradient>`;
  }
  // Meio comprimento da linha do degradê, como no CSS: a projeção da caixa
  // na direção do ângulo
  const rad = (d.angulo * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const meio = Math.max((Math.abs(w * dx) + Math.abs(h * dy)) / 2, 0.25);
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${num(cx - dx * meio)}" y1="${num(cy - dy * meio)}" x2="${num(cx + dx * meio)}" y2="${num(cy + dy * meio)}">${paradas}</linearGradient>`;
}

// O elemento de volta ao pedido { tipo, cores, angulo }; null se não for um
// degradê do editor
export function lerDegrade(html) {
  const tipo = /^<\s*radialGradient\b/.test(html) ? "radial" : /^<\s*linearGradient\b/.test(html) ? "linear" : null;
  if (!tipo) return null;
  const cores = [...String(html).matchAll(/stop-color="(#[0-9a-fA-F]{6})"/g)].map((m) => m[1].toLowerCase());
  if (cores.length < 2) return null;
  let angulo = 90;
  if (tipo === "linear") {
    const at = (n) => Number(new RegExp(`\\b${n}="(-?[\\d.]+)"`).exec(html)?.[1]);
    const [x1, y1, x2, y2] = ["x1", "y1", "x2", "y2"].map(at);
    if ([x1, y1, x2, y2].every(Number.isFinite) && (x1 !== x2 || y1 !== y2))
      angulo = ((Math.round((Math.atan2(x2 - x1, -(y2 - y1)) * 180) / Math.PI) % 360) + 360) % 360;
  }
  return normalizarDegrade({ tipo, cores, angulo });
}
