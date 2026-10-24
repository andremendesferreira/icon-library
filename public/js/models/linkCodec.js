// Links que abrem o editor já com um ícone: #svg=… ou #ile=… no endereço.
// Pensados para serem gerados por IAs (veja /llms.txt): aceitam o conteúdo
// codificado para URL ou em base64url. Funções puras, sem DOM (testadas em
// tests/).
//
//   https://iconlibrary.io/#name=rocket&svg=<svg …>…</svg>
//   https://iconlibrary.io/#ile=eyJmb3JtYXRvIjoi…
//
// O conteúdo vai depois do "#": não é enviado ao servidor nem fica em logs.
import { erro } from "./erros.js";

// "%" solto (de "50%", por exemplo) quebraria decodeURIComponent: vira %25
function decodificarUrl(valor) {
  try {
    return decodeURIComponent(valor.replace(/%(?![0-9A-Fa-f]{2})/g, "%25"));
  } catch {
    return valor;
  }
}

// base64url (ou base64 comum) de texto UTF-8
export function deBase64(valor) {
  const base64 = valor.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  const binario = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binario, (c) => c.charCodeAt(0)));
}

export function paraBase64(texto) {
  let binario = "";
  for (const byte of new TextEncoder().encode(texto)) binario += String.fromCharCode(byte);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Lê o fragmento do endereço (location.hash). Devolve
//   { tipo: "svg" | "ile", conteudo, nome } ou null se não houver ícone.
// svg= / ile= devem ser o último parâmetro: tudo o que vem depois é o
// conteúdo (um "&" dentro do SVG não corta nada).
export function lerFragmento(hash) {
  const fragmento = String(hash || "").replace(/^#/, "");
  const inicio = fragmento.search(/(^|&)(svg|ile)=/);
  if (inicio < 0) return null;
  const antes = fragmento.slice(0, inicio);
  const resto = fragmento.slice(inicio).replace(/^&/, "");
  const tipo = resto.startsWith("svg=") ? "svg" : "ile";
  const bruto = resto.slice(4);
  if (!bruto) return null;

  let nome = null;
  for (const par of antes.split("&")) {
    const [chave, ...valor] = par.split("=");
    if (chave === "name" && valor.length) nome = decodificarUrl(valor.join("=")).trim() || null;
  }

  const texto = decodificarUrl(bruto).trim();
  // Já é o conteúdo (SVG começa com "<", .ile com "{"); senão, base64
  if ((tipo === "svg" && texto.startsWith("<")) || (tipo === "ile" && texto.startsWith("{")))
    return { tipo, conteudo: texto, nome };
  try {
    return { tipo, conteudo: deBase64(texto).trim(), nome };
  } catch {
    throw tipo === "svg"
      ? erro("error.linkSvg", "The link has no valid SVG (expected <svg…> or base64)")
      : erro("error.linkIle", "The link has no valid .ile project (expected JSON or base64)");
  }
}

// Link para um projeto .ile (objeto): curto o bastante para compartilhar e
// sem caracteres que precisem de escape
export function linkDoProjeto(base, projeto) {
  return `${base}#ile=${paraBase64(JSON.stringify(projeto))}`;
}
