// Geometria das formas SVG do editor: ler e escrever paths, achar os pontos
// arrastáveis de cada forma e aplicar transformações. Funções puras, sem DOM
// (testadas em tests/).
//
import { erro } from "./erros.js";

// Um elemento é { tag, attrs } — attrs com os valores em texto, como no SVG.

// Número curto e estável: até 3 casas, sem "-0"
export function fmt(n) {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
}

const num = (valor) => {
  const n = parseFloat(valor);
  return Number.isFinite(n) ? n : 0;
};

// ── Paths ────────────────────────────────────────────────────────────────────
// Lê o atributo d e devolve comandos absolutos, só de cinco tipos:
//   { t: "M" | "L", x, y }
//   { t: "C", x1, y1, x2, y2, x, y }
//   { t: "Q", x1, y1, x, y }
//   { t: "A", rx, ry, rot, large, sweep, x, y }
//   { t: "Z" }
// H e V viram L; S e T viram C e Q com o ponto de controle refletido, como o
// navegador faz ao desenhar. O desenho resultante é idêntico.
export function lerPath(d) {
  const s = String(d);
  let i = 0;
  const espaco = () => {
    while (i < s.length && /[\s,]/.test(s[i])) i++;
  };
  const erroDeDados = () => {
    const near = s.slice(i, i + 12);
    return erro("error.pathData", `Invalid path data near "${near}"`, { near });
  };
  const numero = () => {
    espaco();
    const m = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(s.slice(i));
    if (!m) throw erroDeDados();
    i += m[0].length;
    return parseFloat(m[0]);
  };
  // Nos arcos, as flags podem vir coladas ("a2 2 0 012 2"): lê um dígito só
  const flag = () => {
    espaco();
    const c = s[i];
    if (c !== "0" && c !== "1")
      throw erro("error.arcFlag", `Invalid arc flag near "${s.slice(i, i + 12)}"`, { near: s.slice(i, i + 12) });
    i++;
    return c === "1" ? 1 : 0;
  };

  const cmds = [];
  let x = 0;
  let y = 0;
  let inicioX = 0;
  let inicioY = 0;
  let cmd = null;

  for (;;) {
    espaco();
    if (i >= s.length) break;
    if (/[a-zA-Z]/.test(s[i])) cmd = s[i++];
    else if (!cmd) throw erroDeDados();

    const rel = cmd !== cmd.toUpperCase();
    const X = (v) => (rel ? x + v : v);
    const Y = (v) => (rel ? y + v : v);
    const anterior = cmds[cmds.length - 1];

    switch (cmd.toUpperCase()) {
      case "M": {
        const nx = X(numero());
        const ny = Y(numero());
        cmds.push({ t: "M", x: nx, y: ny });
        x = inicioX = nx;
        y = inicioY = ny;
        // Pares seguintes ao M são linhas
        cmd = rel ? "l" : "L";
        break;
      }
      case "L": {
        const nx = X(numero());
        const ny = Y(numero());
        cmds.push({ t: "L", x: nx, y: ny });
        x = nx;
        y = ny;
        break;
      }
      case "H": {
        const nx = rel ? x + numero() : numero();
        cmds.push({ t: "L", x: nx, y });
        x = nx;
        break;
      }
      case "V": {
        const ny = rel ? y + numero() : numero();
        cmds.push({ t: "L", x, y: ny });
        y = ny;
        break;
      }
      case "C": {
        const c = { t: "C", x1: X(numero()), y1: Y(numero()), x2: X(numero()), y2: Y(numero()) };
        c.x = X(numero());
        c.y = Y(numero());
        cmds.push(c);
        x = c.x;
        y = c.y;
        break;
      }
      case "S": {
        const refletido = anterior?.t === "C";
        const c = {
          t: "C",
          x1: refletido ? 2 * x - anterior.x2 : x,
          y1: refletido ? 2 * y - anterior.y2 : y,
          x2: X(numero()),
          y2: Y(numero()),
        };
        c.x = X(numero());
        c.y = Y(numero());
        cmds.push(c);
        x = c.x;
        y = c.y;
        break;
      }
      case "Q": {
        const q = { t: "Q", x1: X(numero()), y1: Y(numero()) };
        q.x = X(numero());
        q.y = Y(numero());
        cmds.push(q);
        x = q.x;
        y = q.y;
        break;
      }
      case "T": {
        const refletido = anterior?.t === "Q";
        const q = {
          t: "Q",
          x1: refletido ? 2 * x - anterior.x1 : x,
          y1: refletido ? 2 * y - anterior.y1 : y,
        };
        q.x = X(numero());
        q.y = Y(numero());
        cmds.push(q);
        x = q.x;
        y = q.y;
        break;
      }
      case "A": {
        const a = {
          t: "A",
          rx: Math.abs(numero()),
          ry: Math.abs(numero()),
          rot: numero(),
          large: flag(),
          sweep: flag(),
        };
        a.x = X(numero());
        a.y = Y(numero());
        cmds.push(a);
        x = a.x;
        y = a.y;
        break;
      }
      case "Z": {
        cmds.push({ t: "Z" });
        x = inicioX;
        y = inicioY;
        // Depois de Z só pode vir outro comando
        cmd = null;
        break;
      }
      default:
        throw erro("error.pathCommand", `Unknown path command "${cmd}"`, { command: cmd });
    }
  }
  return cmds;
}

export function escreverPath(cmds) {
  return cmds
    .map((c) => {
      switch (c.t) {
        case "M":
        case "L":
          return `${c.t}${fmt(c.x)} ${fmt(c.y)}`;
        case "C":
          return `C${fmt(c.x1)} ${fmt(c.y1)} ${fmt(c.x2)} ${fmt(c.y2)} ${fmt(c.x)} ${fmt(c.y)}`;
        case "Q":
          return `Q${fmt(c.x1)} ${fmt(c.y1)} ${fmt(c.x)} ${fmt(c.y)}`;
        case "A":
          return `A${fmt(c.rx)} ${fmt(c.ry)} ${fmt(c.rot)} ${c.large} ${c.sweep} ${fmt(c.x)} ${fmt(c.y)}`;
        default:
          return "Z";
      }
    })
    .join("");
}

// ── Pontos e polígonos ───────────────────────────────────────────────────────
function lerPontos(texto) {
  const n = String(texto || "")
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  const pontos = [];
  for (let k = 0; k + 1 < n.length; k += 2) pontos.push({ x: n[k], y: n[k + 1] });
  return pontos;
}

const escreverPontos = (pontos) =>
  pontos.map((p) => `${fmt(p.x)} ${fmt(p.y)}`).join(" ");

// Formas que o editor entende; as demais ficam só no código
export const FORMAS = new Set(["path", "line", "circle", "ellipse", "rect", "polyline", "polygon"]);

// Pontos arrastáveis de um elemento:
//   { id, x, y, tipo: "end" | "ctrl" | "center" | "radius", de? }
// "de" liga um ponto de controle ao ponto da curva a que pertence (a linha
// fina que o editor desenha entre os dois).
export function pontosDoElemento({ tag, attrs }) {
  const a = attrs;
  switch (tag) {
    case "line":
      return [
        { id: "p1", x: num(a.x1), y: num(a.y1), tipo: "end" },
        { id: "p2", x: num(a.x2), y: num(a.y2), tipo: "end" },
      ];
    case "circle": {
      const cx = num(a.cx);
      const cy = num(a.cy);
      return [
        { id: "c", x: cx, y: cy, tipo: "center" },
        { id: "r", x: cx + num(a.r), y: cy, tipo: "radius", de: { x: cx, y: cy } },
      ];
    }
    case "ellipse": {
      const cx = num(a.cx);
      const cy = num(a.cy);
      return [
        { id: "c", x: cx, y: cy, tipo: "center" },
        { id: "rx", x: cx + num(a.rx), y: cy, tipo: "radius", de: { x: cx, y: cy } },
        { id: "ry", x: cx, y: cy + num(a.ry), tipo: "radius", de: { x: cx, y: cy } },
      ];
    }
    case "rect": {
      const x = num(a.x);
      const y = num(a.y);
      return [
        { id: "tl", x, y, tipo: "end" },
        { id: "br", x: x + num(a.width), y: y + num(a.height), tipo: "end" },
      ];
    }
    case "polyline":
    case "polygon":
      return lerPontos(a.points).map((p, k) => ({ id: `p${k}`, ...p, tipo: "end" }));
    case "path": {
      const pontos = [];
      let atual = { x: 0, y: 0 };
      let inicio = atual;
      lerPath(a.d).forEach((c, k) => {
        if (c.t === "Z") {
          atual = inicio;
          return;
        }
        const fim = { x: c.x, y: c.y };
        if (c.t === "C") {
          pontos.push({ id: `${k}:1`, x: c.x1, y: c.y1, tipo: "ctrl", de: atual });
          pontos.push({ id: `${k}:2`, x: c.x2, y: c.y2, tipo: "ctrl", de: fim });
        } else if (c.t === "Q") {
          pontos.push({ id: `${k}:1`, x: c.x1, y: c.y1, tipo: "ctrl", de: atual });
        }
        pontos.push({ id: `${k}:e`, ...fim, tipo: "end" });
        atual = fim;
        if (c.t === "M") inicio = fim;
      });
      return pontos;
    }
    default:
      return [];
  }
}

// Retângulo que envolve a forma: { minX, minY, maxX, maxY }. Em curvas usa
// também os pontos de controle (aproximado, mas suficiente para achar o
// centro); em círculos e elipses, o contorno — o ponto do raio fica na borda
// e deslocaria o centro.
export function limitesDoElemento(elemento) {
  const a = elemento.attrs;
  if (elemento.tag === "circle")
    return { minX: num(a.cx) - num(a.r), minY: num(a.cy) - num(a.r), maxX: num(a.cx) + num(a.r), maxY: num(a.cy) + num(a.r) };
  if (elemento.tag === "ellipse")
    return { minX: num(a.cx) - num(a.rx), minY: num(a.cy) - num(a.ry), maxX: num(a.cx) + num(a.rx), maxY: num(a.cy) + num(a.ry) };
  const pontos = pontosDoElemento(elemento);
  if (!pontos.length) return null;
  return {
    minX: Math.min(...pontos.map((p) => p.x)),
    minY: Math.min(...pontos.map((p) => p.y)),
    maxX: Math.max(...pontos.map((p) => p.x)),
    maxY: Math.max(...pontos.map((p) => p.y)),
  };
}

// Move um ponto para (x, y) e devolve o elemento novo (o original não muda)
export function moverPonto(elemento, id, x, y) {
  const a = { ...elemento.attrs };
  const novo = { ...elemento, attrs: a };
  switch (elemento.tag) {
    case "line":
      if (id === "p1") Object.assign(a, { x1: fmt(x), y1: fmt(y) });
      else Object.assign(a, { x2: fmt(x), y2: fmt(y) });
      return novo;
    case "circle":
      if (id === "c") Object.assign(a, { cx: fmt(x), cy: fmt(y) });
      else a.r = fmt(Math.hypot(x - num(a.cx), y - num(a.cy)));
      return novo;
    case "ellipse":
      if (id === "c") Object.assign(a, { cx: fmt(x), cy: fmt(y) });
      else if (id === "rx") a.rx = fmt(Math.abs(x - num(a.cx)));
      else a.ry = fmt(Math.abs(y - num(a.cy)));
      return novo;
    case "rect": {
      // O canto oposto fica parado; largura e altura nunca negativas
      const x0 = num(a.x);
      const y0 = num(a.y);
      const x1 = x0 + num(a.width);
      const y1 = y0 + num(a.height);
      const [ax, ay, bx, by] = id === "tl" ? [x, y, x1, y1] : [x0, y0, x, y];
      Object.assign(a, {
        x: fmt(Math.min(ax, bx)),
        y: fmt(Math.min(ay, by)),
        width: fmt(Math.abs(bx - ax)),
        height: fmt(Math.abs(by - ay)),
      });
      return novo;
    }
    case "polyline":
    case "polygon": {
      const pontos = lerPontos(a.points);
      const k = Number(id.slice(1));
      if (pontos[k]) pontos[k] = { x, y };
      a.points = escreverPontos(pontos);
      return novo;
    }
    case "path": {
      const cmds = lerPath(a.d);
      const [indice, parte] = id.split(":");
      const k = Number(indice);
      const c = cmds[k];
      if (!c) return elemento;
      if (parte === "1") {
        c.x1 = x;
        c.y1 = y;
      } else if (parte === "2") {
        c.x2 = x;
        c.y2 = y;
      } else {
        // Ao mover um ponto da curva, os controles presos a ele vão junto,
        // para a curva manter o formato em volta do ponto
        const dx = x - c.x;
        const dy = y - c.y;
        c.x = x;
        c.y = y;
        if (c.t === "C") {
          c.x2 += dx;
          c.y2 += dy;
        }
        const seguinte = cmds[k + 1];
        if (seguinte?.t === "C") {
          seguinte.x1 += dx;
          seguinte.y1 += dy;
        }
      }
      a.d = escreverPath(cmds);
      return novo;
    }
    default:
      return elemento;
  }
}

// ── Transformações ───────────────────────────────────────────────────────────
// Matriz afim { a, b, c, d, e, f }: x' = a·x + c·y + e, y' = b·x + d·y + f.
// O editor usa giros, espelhos, deslocamentos e escala uniforme. Num giro que
// não é múltiplo de 90°, rect e ellipse viram path (deixariam de estar
// alinhados aos eixos); as outras formas giram como são.
export const matrizes = {
  mover: (dx, dy) => ({ a: 1, b: 0, c: 0, d: 1, e: dx, f: dy }),
  // 90° no sentido horário, em volta de (cx, cy)
  girar90: (cx, cy) => ({ a: 0, b: 1, c: -1, d: 0, e: cx + cy, f: cy - cx }),
  // Qualquer ângulo, em graus, no sentido horário, em volta de (cx, cy)
  girar: (graus, cx, cy) => {
    const r = (graus * Math.PI) / 180;
    // Sem resíduo de ponto flutuante nos ângulos retos (cos 90° = 6e-17)
    const limpo = (v) => (Math.abs(v) < 1e-12 ? 0 : v);
    const cos = limpo(Math.cos(r));
    const sen = limpo(Math.sin(r));
    return { a: cos, b: sen, c: -sen, d: cos, e: cx - cos * cx + sen * cy, f: cy - sen * cx - cos * cy };
  },
  espelharH: (cx) => ({ a: -1, b: 0, c: 0, d: 1, e: 2 * cx, f: 0 }),
  espelharV: (cy) => ({ a: 1, b: 0, c: 0, d: -1, e: 0, f: 2 * cy }),
  escalar: (k, cx, cy) => ({ a: k, b: 0, c: 0, d: k, e: cx * (1 - k), f: cy * (1 - k) }),
};

// rect ou ellipse → path com o mesmo desenho (cantos arredondados viram arcos)
function comoPath(elemento) {
  const { x, y, width, height, rx, ry, cx, cy, ...resto } = elemento.attrs;
  const cmds = [];
  if (elemento.tag === "ellipse") {
    const [ex, ey, rh, rv] = [num(cx), num(cy), num(rx), num(ry)];
    const arco = (px) => ({ t: "A", rx: rh, ry: rv, rot: 0, large: 1, sweep: 0, x: px, y: ey });
    cmds.push({ t: "M", x: ex - rh, y: ey }, arco(ex + rh), arco(ex - rh), { t: "Z" });
  } else {
    const [x0, y0, w, h] = [num(x), num(y), num(width), num(height)];
    // Regra do SVG: falta um dos raios, vale o outro; nunca passa da metade
    let kx = rx !== undefined ? num(rx) : ry !== undefined ? num(ry) : 0;
    let ky = ry !== undefined ? num(ry) : kx;
    kx = Math.min(Math.max(kx, 0), w / 2);
    ky = Math.min(Math.max(ky, 0), h / 2);
    const canto = (px, py) =>
      kx && ky ? [{ t: "A", rx: kx, ry: ky, rot: 0, large: 0, sweep: 1, x: px, y: py }] : [];
    cmds.push(
      { t: "M", x: x0 + kx, y: y0 },
      { t: "L", x: x0 + w - kx, y: y0 }, ...canto(x0 + w, y0 + ky),
      { t: "L", x: x0 + w, y: y0 + h - ky }, ...canto(x0 + w - kx, y0 + h),
      { t: "L", x: x0 + kx, y: y0 + h }, ...canto(x0, y0 + h - ky),
      { t: "L", x: x0, y: y0 + ky }, ...canto(x0 + kx, y0),
      { t: "Z" },
    );
  }
  return { ...elemento, tag: "path", attrs: { d: escreverPath(cmds), ...resto } };
}

export function transformarElemento(elemento, m) {
  if (!FORMAS.has(elemento.tag)) return elemento;
  const P = (x, y) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
  const det = m.a * m.d - m.b * m.c;
  const escala = Math.sqrt(Math.abs(det));
  const espelhado = det < 0;
  const giro = (Math.atan2(m.b, m.a) * 180) / Math.PI;
  const quarto = Math.abs(Math.abs(giro) - 90) < 1e-6;
  const reto = Math.abs(giro / 90 - Math.round(giro / 90)) < 1e-6;
  if (!reto && (elemento.tag === "rect" || elemento.tag === "ellipse"))
    return transformarElemento(comoPath(elemento), m);
  const a = { ...elemento.attrs };
  const novo = { ...elemento, attrs: a };

  switch (elemento.tag) {
    case "line": {
      const p1 = P(num(a.x1), num(a.y1));
      const p2 = P(num(a.x2), num(a.y2));
      Object.assign(a, { x1: fmt(p1.x), y1: fmt(p1.y), x2: fmt(p2.x), y2: fmt(p2.y) });
      break;
    }
    case "circle": {
      const c = P(num(a.cx), num(a.cy));
      Object.assign(a, { cx: fmt(c.x), cy: fmt(c.y), r: fmt(num(a.r) * escala) });
      break;
    }
    case "ellipse": {
      const c = P(num(a.cx), num(a.cy));
      let rx = num(a.rx) * escala;
      let ry = num(a.ry) * escala;
      if (quarto) [rx, ry] = [ry, rx];
      Object.assign(a, { cx: fmt(c.x), cy: fmt(c.y), rx: fmt(rx), ry: fmt(ry) });
      break;
    }
    case "rect": {
      const p1 = P(num(a.x), num(a.y));
      const p2 = P(num(a.x) + num(a.width), num(a.y) + num(a.height));
      Object.assign(a, {
        x: fmt(Math.min(p1.x, p2.x)),
        y: fmt(Math.min(p1.y, p2.y)),
        width: fmt(Math.abs(p2.x - p1.x)),
        height: fmt(Math.abs(p2.y - p1.y)),
      });
      // Cantos arredondados acompanham a escala (e trocam de eixo no giro)
      let rx = a.rx !== undefined ? num(a.rx) * escala : undefined;
      let ry = a.ry !== undefined ? num(a.ry) * escala : undefined;
      if (quarto) [rx, ry] = [ry, rx];
      if (rx !== undefined) a.rx = fmt(rx);
      else delete a.rx;
      if (ry !== undefined) a.ry = fmt(ry);
      else delete a.ry;
      break;
    }
    case "polyline":
    case "polygon":
      a.points = escreverPontos(lerPontos(a.points).map((p) => P(p.x, p.y)));
      break;
    case "path": {
      const cmds = lerPath(a.d).map((c) => {
        if (c.t === "Z") return c;
        const n = { ...c, ...P(c.x, c.y) };
        if (c.t === "C" || c.t === "Q") {
          const c1 = P(c.x1, c.y1);
          n.x1 = c1.x;
          n.y1 = c1.y;
        }
        if (c.t === "C") {
          const c2 = P(c.x2, c.y2);
          n.x2 = c2.x;
          n.y2 = c2.y;
        }
        if (c.t === "A") {
          n.rx = c.rx * escala;
          n.ry = c.ry * escala;
          // Espelhar inverte o sentido do arco e a inclinação da elipse
          // Ângulo sempre entre -180° e 180°: quatro giros voltam ao mesmo texto
          const rot = (espelhado ? -c.rot : c.rot) + giro;
          n.rot = ((((rot % 360) + 540) % 360) - 180);
          if (espelhado) n.sweep = 1 - c.sweep;
        }
        return n;
      });
      a.d = escreverPath(cmds);
      break;
    }
  }
  return novo;
}

// ── Apagar e acrescentar pontos ──────────────────────────────────────────────
const meio = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// Ponto no meio de um arco (de "de" até o fim do comando A), pelo centro da
// elipse (SVG 1.1, apêndice F.6.5). Devolve também os raios já corrigidos —
// raios pequenos demais para ligar os dois pontos são ampliados pelo navegador.
function meioDoArco(de, c) {
  let rx = Math.abs(c.rx);
  let ry = Math.abs(c.ry);
  if (!rx || !ry || (de.x === c.x && de.y === c.y)) return null;
  const phi = (c.rot * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sen = Math.sin(phi);
  const dx = (de.x - c.x) / 2;
  const dy = (de.y - c.y) / 2;
  const x1 = cos * dx + sen * dy;
  const y1 = -sen * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let k = Math.sqrt(Math.max(0, num / den));
  if (c.large === c.sweep) k = -k;
  const cxl = (k * rx * y1) / ry;
  const cyl = (-k * ry * x1) / rx;
  const cx = cos * cxl - sen * cyl + (de.x + c.x) / 2;
  const cy = sen * cxl + cos * cyl + (de.y + c.y) / 2;
  const angulo = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const ux = (x1 - cxl) / rx;
  const uy = (y1 - cyl) / ry;
  const inicio = angulo(1, 0, ux, uy);
  let varredura = angulo(ux, uy, (-x1 - cxl) / rx, (-y1 - cyl) / ry);
  if (!c.sweep && varredura > 0) varredura -= 2 * Math.PI;
  else if (c.sweep && varredura < 0) varredura += 2 * Math.PI;
  const t = inicio + varredura / 2;
  return {
    x: cos * rx * Math.cos(t) - sen * ry * Math.sin(t) + cx,
    y: sen * rx * Math.cos(t) + cos * ry * Math.sin(t) + cy,
    rx,
    ry,
  };
}

// Um trecho de path (de "de" até o fim do comando) partido ao meio em dois,
// com exatamente o mesmo desenho
export function dividirTrecho(de, c) {
  if (c.t === "C") {
    // De Casteljau em t = 0,5
    const c1 = { x: c.x1, y: c.y1 };
    const c2 = { x: c.x2, y: c.y2 };
    const a = meio(de, c1);
    const b = meio(c1, c2);
    const d = meio(c2, c);
    const e = meio(a, b);
    const f = meio(b, d);
    const m = meio(e, f);
    return [
      { t: "C", x1: a.x, y1: a.y, x2: e.x, y2: e.y, x: m.x, y: m.y },
      { t: "C", x1: f.x, y1: f.y, x2: d.x, y2: d.y, x: c.x, y: c.y },
    ];
  }
  if (c.t === "Q") {
    const c1 = { x: c.x1, y: c.y1 };
    const a = meio(de, c1);
    const b = meio(c1, c);
    const m = meio(a, b);
    return [
      { t: "Q", x1: a.x, y1: a.y, x: m.x, y: m.y },
      { t: "Q", x1: b.x, y1: b.y, x: c.x, y: c.y },
    ];
  }
  if (c.t === "A") {
    const m = meioDoArco(de, c);
    // Cada metade cobre no máximo meia volta: arco "pequeno" nas duas
    if (m)
      return [
        { ...c, rx: m.rx, ry: m.ry, large: 0, x: m.x, y: m.y },
        { ...c, rx: m.rx, ry: m.ry, large: 0 },
      ];
  }
  const m = meio(de, c);
  return [{ t: "L", x: m.x, y: m.y }, { t: "L", x: c.x, y: c.y }];
}

// Onde cada comando do path começa (o fim do anterior; depois de Z, o início
// do subcaminho)
function inicios(cmds) {
  const lista = [];
  let atual = { x: 0, y: 0 };
  let comeco = atual;
  for (const c of cmds) {
    lista.push(atual);
    if (c.t === "Z") atual = comeco;
    else {
      atual = { x: c.x, y: c.y };
      if (c.t === "M") comeco = atual;
    }
  }
  return lista;
}

// Mínimo de pontos: linha aberta 2, polígono 3
const MINIMO = { polyline: 2, polygon: 3 };

// Apaga um ponto do traço (não as alças de curva). Devolve o elemento novo,
// ou null quando não dá (forma sem pontos removíveis, ou que ficaria vazia).
export function removerPonto(elemento, id) {
  const a = elemento.attrs;
  if (elemento.tag === "polyline" || elemento.tag === "polygon") {
    const k = /^p(\d+)$/.exec(id)?.[1];
    const pontos = lerPontos(a.points);
    if (k === undefined || !pontos[k] || pontos.length <= MINIMO[elemento.tag]) return null;
    pontos.splice(Number(k), 1);
    return { ...elemento, attrs: { ...a, points: escreverPontos(pontos) } };
  }
  if (elemento.tag !== "path") return null;
  const k = Number(/^(\d+):e$/.exec(id)?.[1]);
  let cmds;
  try {
    cmds = lerPath(a.d);
  } catch {
    return null;
  }
  if (!Number.isInteger(k) || !cmds[k] || cmds[k].t === "Z") return null;
  if (cmds[k].t === "M") {
    // O trecho seguinte passa a começar o subcaminho
    const seguinte = cmds[k + 1];
    if (seguinte && seguinte.t !== "M" && seguinte.t !== "Z") cmds[k + 1] = { t: "M", x: seguinte.x, y: seguinte.y };
  }
  cmds.splice(k, 1);
  // Sobras sem trecho nenhum ("M" sozinho, "M Z") saem também
  const limpos = [];
  for (let i = 0; i < cmds.length; i++) {
    const c = cmds[i];
    if (c.t === "M") {
      const prox = cmds[i + 1];
      if (!prox || prox.t === "M") continue;
      if (prox.t === "Z") {
        i++;
        continue;
      }
    }
    limpos.push(c);
  }
  if (!limpos.some((c) => c.t !== "M" && c.t !== "Z")) return null;
  return { ...elemento, attrs: { ...a, d: escreverPath(limpos) } };
}

// Acrescenta um ponto no meio do trecho que sai do ponto indicado (ou do que
// chega nele, se for o último). Devolve { elemento, id } — o id do ponto novo —
// ou null quando a forma não tem pontos para isso (círculo, retângulo…).
export function adicionarPonto(elemento, id) {
  const a = elemento.attrs;
  if (elemento.tag === "line") {
    // Linha reta vira linha com três pontos
    const p1 = { x: num(a.x1), y: num(a.y1) };
    const p2 = { x: num(a.x2), y: num(a.y2) };
    const { x1, y1, x2, y2, ...resto } = a;
    return {
      elemento: { ...elemento, tag: "polyline", attrs: { points: escreverPontos([p1, meio(p1, p2), p2]), ...resto } },
      id: "p1",
    };
  }
  if (elemento.tag === "polyline" || elemento.tag === "polygon") {
    const k = Number(/^p(\d+)$/.exec(id)?.[1]);
    const pontos = lerPontos(a.points);
    if (!Number.isInteger(k) || !pontos[k] || pontos.length < 2) return null;
    const fechado = elemento.tag === "polygon";
    // O último ponto de uma linha aberta não tem trecho saindo: usa o que chega
    const ultimo = !fechado && k === pontos.length - 1;
    const [de, ate, onde] = ultimo
      ? [pontos[k - 1], pontos[k], k]
      : [pontos[k], pontos[(k + 1) % pontos.length], k + 1];
    pontos.splice(onde, 0, meio(de, ate));
    return { elemento: { ...elemento, attrs: { ...a, points: escreverPontos(pontos) } }, id: `p${onde}` };
  }
  if (elemento.tag !== "path") return null;
  const k = Number(/^(\d+):e$/.exec(id)?.[1]);
  let cmds;
  try {
    cmds = lerPath(a.d);
  } catch {
    return null;
  }
  if (!Number.isInteger(k) || !cmds[k] || cmds[k].t === "Z") return null;
  const comecos = inicios(cmds);
  const seguinte = cmds[k + 1];
  const fim = { x: cmds[k].x, y: cmds[k].y };
  if (seguinte && seguinte.t === "Z") {
    // Trecho de fechamento (Z): uma reta até o início do subcaminho (o último M)
    let destino = fim;
    for (let i = k; i >= 0; i--)
      if (cmds[i].t === "M") {
        destino = { x: cmds[i].x, y: cmds[i].y };
        break;
      }
    if (destino.x !== fim.x || destino.y !== fim.y) {
      cmds.splice(k + 1, 0, { t: "L", ...meio(fim, destino) });
      return { elemento: { ...elemento, attrs: { ...a, d: escreverPath(cmds) } }, id: `${k + 1}:e` };
    }
  } else if (seguinte && seguinte.t !== "M") {
    cmds.splice(k + 1, 1, ...dividirTrecho(fim, seguinte));
    return { elemento: { ...elemento, attrs: { ...a, d: escreverPath(cmds) } }, id: `${k + 1}:e` };
  }
  // Sem trecho saindo: divide o que chega (se houver)
  if (cmds[k].t === "M") return null;
  cmds.splice(k, 1, ...dividirTrecho(comecos[k], cmds[k]));
  return { elemento: { ...elemento, attrs: { ...a, d: escreverPath(cmds) } }, id: `${k}:e` };
}

// Formas novas, centradas na área do ícone (viewBox { x, y, w, h })
export function novaForma(tag, { x, y, w, h }) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const u = w / 24; // o tamanho segue a grade do ícone
  switch (tag) {
    case "line":
      return { tag, attrs: { x1: fmt(cx - 6 * u), y1: fmt(cy), x2: fmt(cx + 6 * u), y2: fmt(cy) } };
    case "circle":
      return { tag, attrs: { cx: fmt(cx), cy: fmt(cy), r: fmt(4 * u) } };
    case "rect":
      return { tag, attrs: { x: fmt(cx - 5 * u), y: fmt(cy - 4 * u), width: fmt(10 * u), height: fmt(8 * u), rx: fmt(2 * u) } };
    default:
      return {
        tag: "path",
        attrs: { d: escreverPath([
          { t: "M", x: cx - 6 * u, y: cy + 3 * u },
          { t: "C", x1: cx - 3 * u, y1: cy - 5 * u, x2: cx + 3 * u, y2: cy - 5 * u, x: cx + 6 * u, y: cy + 3 * u },
        ]) },
      };
  }
}
