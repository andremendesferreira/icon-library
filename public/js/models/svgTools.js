// Transformações do texto SVG que vai para a cópia, o download e o scratchpad.
// Funções puras: não tocam o DOM (testadas em tests/).

export const ESTILO_PADRAO = Object.freeze({ tamanho: 24, traco: 2, cor: null });

// Tamanho, espessura do traço e cor escolhidos pelo usuário. Só a tag <svg>
// de fora muda; cor nula mantém "currentColor" (herda a cor do texto).
export function aplicarEstilo(svg, { tamanho, traco, cor } = ESTILO_PADRAO) {
  let resultado = svg.replace(/^<svg\b[^>]*>/, (tag) => {
    tag = tag
      .replace(/\swidth="[^"]*"/, ` width="${tamanho}"`)
      .replace(/\sheight="[^"]*"/, ` height="${tamanho}"`);
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

// Nome de arquivo para download: "arrow up" → "arrow-up"
export function nomeDeArquivo(nome) {
  return (
    nome
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "icon"
  );
}
