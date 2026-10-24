// Fecha uma janela (<dialog>) com um clique no fundo escuro, fora da caixa.
//
// Só conta quando o clique COMEÇA e TERMINA no fundo: ao selecionar o texto de
// um campo arrastando o mouse até fora da caixa, o navegador dispara o
// "click" no fundo, e a janela fechava sozinha com o que estava sendo digitado.
export function fecharAoClicarFora(janela, fechar = () => janela.close()) {
  let comecouNoFundo = false;
  janela.addEventListener("pointerdown", (evento) => {
    comecouNoFundo = evento.target === janela;
  });
  janela.addEventListener("click", (evento) => {
    if (evento.target === janela && comecouNoFundo) fechar();
    comecouNoFundo = false;
  });
}
