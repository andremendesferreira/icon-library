// Erros com código, para a interface mostrar a mensagem no idioma da página
// (js/i18n/i18n.js → tErro). A mensagem em inglês fica como está, para logs
// e para uso fora do navegador.
//   erro("error.path", "Path 2: …", { n: 2, detail: outroErro })
// Um valor em "dados" que também seja um erro com código é traduzido junto.
export function erro(codigo, mensagem, dados = {}) {
  return Object.assign(new Error(mensagem), { codigo, dados });
}
