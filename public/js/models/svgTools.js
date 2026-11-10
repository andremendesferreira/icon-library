// Transformações do texto SVG que vai para a cópia, o download e o scratchpad.
// Funções puras: não tocam o DOM (testadas em tests/).

export const ESTILO_PADRAO = Object.freeze({ tamanho: 24, traco: 2, cor: null, decorativo: false });

// Tamanho, espessura do traço e cor escolhidos pelo usuário. Só a tag <svg>
// de fora muda; cor nula mantém "currentColor" (herda a cor do texto).
// decorativo: aria-hidden="true", para leitores de tela pularem o ícone que
// fica ao lado de um texto (o rótulo já diz o que ele é).
export function aplicarEstilo(svg, { tamanho, traco, cor, decorativo } = ESTILO_PADRAO) {
  let resultado = svg.replace(/^<svg\b[^>]*>/, (tag) => {
    tag = tag
      .replace(/\swidth="[^"]*"/, ` width="${tamanho}"`)
      .replace(/\sheight="[^"]*"/, ` height="${tamanho}"`);
    if (decorativo && !/\saria-hidden=/.test(tag)) tag = tag.replace(/>$/, ' aria-hidden="true">');
    // Só ícones de traço têm stroke-width na tag de fora
    return tag.replace(/\sstroke-width="[^"]*"/, ` stroke-width="${traco}"`);
  });
  if (cor) resultado = resultado.replaceAll("currentColor", cor);
  return resultado;
}

// "arrow up right" → "ArrowUpRightIcon"
export function nomeDeComponente(nome) {
  const base = nome
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((parte) => parte[0].toUpperCase() + parte.slice(1))
    .join("");
  // Componente React não pode começar com número (ex.: "1st place medal")
  return (/^[A-Z]/.test(base) ? base : `Icon${base}`) + "Icon";
}

// SVG → componente React: atributos com hífen viram camelCase (exceto aria-*
// e data-*, que o JSX aceita como estão) e as props vão para o <svg>
export function paraReact(svg, nome) {
  const jsx = svg
    .replace(/\s([a-z]+(?:-[a-z]+)+)=/g, (trecho, atributo) =>
      /^(aria|data)-/.test(atributo)
        ? trecho
        : ` ${atributo.replace(/-([a-z])/g, (_, letra) => letra.toUpperCase())}=`,
    )
    .replace(/\sclass=/g, " className=")
    .replace(/^<svg\b([^>]*)>/, "<svg$1 {...props}>");
  return `export function ${nomeDeComponente(nome)}(props) {\n  return (\n    ${jsx}\n  );\n}\n`;
}

// SVG → componente Vue (arquivo .vue): atributos e classes passados ao
// componente caem no <svg>, que é a raiz do template
export function paraVue(svg) {
  return `<template>\n  ${svg}\n</template>\n`;
}

// SVG → componente Svelte (arquivo .svelte): as props vão para o <svg>
export function paraSvelte(svg) {
  // Função no replace: num texto de troca, "$$" viraria "$"
  return `${svg.replace(/^<svg\b([^>]*)>/, (_, atributos) => `<svg${atributos} {...$$restProps}>`)}\n`;
}

// SVG → data URI para url(…) no CSS ou src de <img>. Fora do HTML não há
// texto para herdar a cor: "currentColor" vira a cor dada. Aspas duplas viram
// simples e só o que quebraria a URL é codificado, para o texto continuar legível.
export function paraDataUri(svg, cor = "#2c3e50") {
  const texto = svg.replaceAll("currentColor", cor).replace(/"/g, "'").replace(/>\s+</g, "><");
  return `data:image/svg+xml,${texto.replace(/[\r\n%#()<>?[\\\]^`{|}]/g, encodeURIComponent)}`;
}

// SVG → classe CSS. Ícones vetoriais usam mask: o desenho recorta a cor do
// fundo, e background-color: currentColor herda a cor do texto, como o SVG.
// Emoji (colorido) vai como background-image.
export function paraCss(svg, nome, { mascara = true, tamanho = 24 } = {}) {
  const url = `url("${paraDataUri(svg)}")`;
  const corpo = mascara
    ? [
        "  background-color: currentColor;",
        `  -webkit-mask: ${url} no-repeat center / contain;`,
        `  mask: ${url} no-repeat center / contain;`,
      ]
    : [`  background: ${url} no-repeat center / contain;`];
  return [
    `.icon-${nomeDeArquivo(nome)} {`,
    "  display: inline-block;",
    `  width: ${tamanho}px;`,
    `  height: ${tamanho}px;`,
    ...corpo,
    "}",
    "",
  ].join("\n");
}

// Nome de arquivo para download: "arrow up" → "arrow-up"
export function nomeDeArquivo(nome) {
  return (
    nome
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "icon"
  );
}
