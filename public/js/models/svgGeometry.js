// Geometria das formas SVG do editor: ler e escrever paths, achar os pontos
// arrastáveis de cada forma e aplicar transformações. Funções puras, sem DOM
// (testadas em tests/).
//
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
  const numero = () => {
    espaco();
    const m = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(s.slice(i));
    if (!m) throw new Error(`Invalid path data near "${s.slice(i, i + 12)}"`);
    i += m[0].length;
    return parseFloat(m[0]);
  };
  // Nos arcos, as flags podem vir coladas ("a2 2 0 012 2"): lê um dígito só
  const flag = () => {
    espaco();
    const c = s[i];
    if (c !== "0" && c !== "1")
      throw new Error(`Invalid arc flag near "${s.slice(i, i + 12)}"`);
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
    else if (!cmd) throw new Error(`Invalid path data near "${s.slice(i, i + 12)}"`);

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
        throw new Error(`Unknown path command "${cmd}"`);
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
// O editor só usa giros de 90°, espelhos, deslocamentos e escala uniforme —
// as formas alinhadas aos eixos (rect, ellipse) continuam alinhadas.
export const matrizes = {
  mover: (dx, dy) => ({ a: 1, b: 0, c: 0, d: 1, e: dx, f: dy }),
  // 90° no sentido horário, em volta de (cx, cy)
  girar90: (cx, cy) => ({ a: 0, b: 1, c: -1, d: 0, e: cx + cy, f: cy - cx }),
  espelharH: (cx) => ({ a: -1, b: 0, c: 0, d: 1, e: 2 * cx, f: 0 }),
  espelharV: (cy) => ({ a: 1, b: 0, c: 0, d: -1, e: 0, f: 2 * cy }),
  escalar: (k, cx, cy) => ({ a: k, b: 0, c: 0, d: k, e: cx * (1 - k), f: cy * (1 - k) }),
};

export function transformarElemento(elemento, m) {
  if (!FORMAS.has(elemento.tag)) return elemento;
  const P = (x, y) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
  const det = m.a * m.d - m.b * m.c;
  const escala = Math.sqrt(Math.abs(det));
  const espelhado = det < 0;
  const giro = (Math.atan2(m.b, m.a) * 180) / Math.PI;
  const quarto = Math.abs(Math.abs(giro) - 90) < 1e-6;
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
