const CHAVE = "icon-library:supporter";

// Apoiador deste navegador: o código de apoiador e até quando o site fica sem
// anúncios. Quem decide se o código vale é o servidor (scripts/coffee.js); aqui
// só se lembra do resultado.
export class SupporterModel {
  ler() {
    try {
      const dados = JSON.parse(localStorage.getItem(CHAVE));
      if (!dados?.code || !dados?.expires) return null;
      const expira = new Date(dados.expires);
      return Number.isNaN(expira.getTime()) ? null : { code: dados.code, expires: expira };
    } catch {
      return null;
    }
  }

  // Apoiador com o período sem anúncios ainda valendo
  ativo(agora = Date.now()) {
    const dados = this.ler();
    return dados && dados.expires.getTime() > agora ? dados : null;
  }

  salvar({ code, expires }) {
    try {
      localStorage.setItem(CHAVE, JSON.stringify({ code, expires }));
    } catch {}
  }
}
