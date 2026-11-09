// Lê boletos de um PDF (texto já extraído): linha digitável, vencimento, valor e o Pix copia-e-cola de cada um.
// Vencimento e valor saem da própria linha digitável (padrão Febraban), então serve para boleto de qualquer banco.
(function (raiz) {
  "use strict";
  const DIA = 86400000;
  const iso = d => new Date(d).toISOString().slice(0, 10);

  // Fator de vencimento: dias desde 07/10/1997; ao chegar em 9999 (21/02/2025) voltou a 1000 em 22/02/2025.
  function vencimentoDoFator(fator, hoje) {
    if (!fator) return null;
    const antigo = Date.UTC(1997, 9, 7) + fator * DIA;
    const novo = Date.UTC(2025, 1, 22) + (fator - 1000) * DIA;
    const ref = hoje ? Date.parse(hoje) : Date.now();
    return iso(Math.abs(novo - ref) < Math.abs(antigo - ref) ? novo : antigo);
  }

  // Boleto bancário: 47 dígitos. Conta de consumo/convênio: 48 dígitos começando com 8 (só o valor é confiável).
  function lerLinha(digitos, hoje) {
    if (digitos.length === 47) {
      return { tipo: "bancario", banco: digitos.slice(0, 3), vencimento: vencimentoDoFator(Number(digitos.slice(33, 37)), hoje), valor: Number(digitos.slice(37)) / 100 };
    }
    if (digitos.length === 48 && digitos[0] === "8") {
      const sem = [0, 12, 24, 36].map(i => digitos.slice(i, i + 11)).join(""); // tira os 4 dígitos verificadores
      return { tipo: "convenio", vencimento: null, valor: Number(sem.slice(4, 15)) / 100 };
    }
    return null;
  }
  const formatarLinha = d => d.length === 47
    ? `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d[32]} ${d.slice(33)}`
    : d.replace(/(\d{12})(?=\d)/g, "$1 ");

  // CRC16-CCITT do Pix (os 4 últimos caracteres conferem o resto).
  function crc16(s) {
    let c = 0xFFFF;
    for (let i = 0; i < s.length; i++) {
      c ^= s.charCodeAt(i) << 8;
      for (let b = 0; b < 8; b++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF;
    }
    return c.toString(16).toUpperCase().padStart(4, "0");
  }
  const pixValido = s => s.length > 30 && crc16(s.slice(0, -4)) === s.slice(-4);

  // O PDF quebra o código Pix em linhas; cada quebra pode ter sido um espaço ou nada. Testa as combinações pelo CRC.
  function pixDoTrecho(trecho) {
    const partes = trecho.split("\n");
    if (partes.length > 12) return null;
    for (let m = 0; m < 1 << (partes.length - 1); m++) {
      let s = partes[0];
      for (let i = 1; i < partes.length; i++) s += (m >> (i - 1) & 1 ? " " : "") + partes[i];
      if (pixValido(s)) return s;
    }
    return null;
  }

  function lerBoletos(texto, hoje) {
    const t = String(texto || "").replace(/\r/g, "");
    // Linhas digitáveis, na ordem em que aparecem; a mesma linha costuma vir duas vezes por boleto.
    const vistos = new Set(), boletos = [];
    const re = /(?:\d[\d. ]{45,62}\d)/g;
    let m;
    while ((m = re.exec(t))) {
      const d = m[0].replace(/\D/g, "");
      const lido = lerLinha(d, hoje);
      if (!lido || vistos.has(d) || !(lido.valor > 0)) continue;
      vistos.add(d);
      boletos.push({ ...lido, codigo: formatarLinha(d), pos: m.index });
    }
    // Pix: do "000201" até o "6304" + 4 caracteres de conferência.
    const pixs = [];
    const rp = /000201[\s\S]{20,600}?6304[0-9A-F]{4}/g;
    while ((m = rp.exec(t))) { const p = pixDoTrecho(m[0]); if (p) pixs.push({ pix: p, pos: m.index }); }
    // Cada Pix vai para o boleto mais próximo depois dele (é como os bancos montam a página) ou o anterior.
    for (const p of pixs) {
      const alvo = boletos.find(b => !b.pix && b.pos > p.pos) || [...boletos].reverse().find(b => !b.pix && b.pos < p.pos);
      if (alvo) alvo.pix = p.pix;
    }
    // Convênio sem vencimento na linha: usa a data "Vencimento" mais próxima no texto.
    for (const b of boletos) if (!b.vencimento) {
      const antes = t.slice(Math.max(0, b.pos - 1500), b.pos + 400).match(/Vencimento[^\d]{0,40}(\d{2})\/(\d{2})\/(\d{4})/i);
      if (antes) b.vencimento = `${antes[3]}-${antes[2]}-${antes[1]}`;
    }
    boletos.sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
    const total = boletos.length;
    boletos.forEach((b, i) => { b.parcela = total > 1 ? `${i + 1}/${total}` : ""; delete b.pos; });

    // Dados gerais que ajudam a preencher: quem cobra, quem paga, nº da apólice/documento.
    const plano = t.replace(/\s+/g, " ");
    const emp = plano.match(/([A-ZÀ-Ú][A-Za-zÀ-ú0-9 .&'-]{2,60}?(?:S\.?\s?A\.?|LTDA|ME|EIRELI))\s*-\s*CNPJ/);
    const pag = plano.match(/(?:Pagador|Sacado):?\s*([A-ZÀ-Ú][A-ZÀ-Ú0-9 .&'-]{3,60}?(?:LTDA|S\.?A\.?|ME|EIRELI))/);
    const doc = plano.match(/Ap[óo]lice\s*N[oº°.]*:?\s*(\d{6,})/i) || plano.match(/N[uú]mero\s+(?:do\s+)?Documento:?\s*([\w/.-]{4,})/i);
    // O nome pode vir grudado no texto de antes ("…AGÊNCIA BANCÁRIA Allianz Seguros S.A."): fica só com o nome.
    let quem = emp ? emp[1].trim().split(/\s+/).slice(-6).join(" ") : "";
    const misto = quem.search(/\b[A-ZÀ-Ú][a-zà-ú]/);
    if (misto > 0 && /^[^a-zà-ú]+$/.test(quem.slice(0, misto))) quem = quem.slice(misto);
    return { boletos, beneficiario: quem, pagador: pag ? pag[1].trim() : "", documento: doc ? doc[1] : "" };
  }

  const api = { lerBoletos, lerLinha, vencimentoDoFator, pixValido, crc16 };
  if (typeof module === "object" && module.exports) module.exports = api; else raiz.P3_BOLETO = api;
})(typeof window !== "undefined" ? window : globalThis);
