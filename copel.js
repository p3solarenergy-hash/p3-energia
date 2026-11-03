/*
  Leitor de documentos da Copel — P3 Gestão de Usinas.

  Lê o TEXTO já extraído do PDF (pdf.js, um item por linha) e devolve campos.
  Dois tipos de documento:
    • fatura        DANF3E (1ª ou 2ª via) de uma UC: cabeçalho, itens, créditos, saldo.
    • demonstrativo "Demonstrativo UC Geradora / Beneficiária" (micro/minigeração):
                    por UC e por mês, energia injetada, crédito utilizado, % e saldo.

  Nada aqui grava: quem chama decide o que fazer com o resultado.
  Regra central da fatura: o que a UC pagaria SEM a usina = total da fatura
  + valor dos créditos (itens "ENERGIA INJ..." negativos). Assim a economia sai
  dos valores reais da Copel, sem precisar adivinhar tarifa.
*/
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.P3_COPEL = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const brNum = s => {
    const v = String(s == null ? "" : s).trim().replace(/\./g, "").replace(",", ".");
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const isoDate = d => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(d || "").trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : ""; };
  const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
  const lines = t => String(t || "").split("\n").map(s => s.trim()).filter(Boolean);
  const NUM = /^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/;
  const isNum = s => NUM.test(String(s || ""));

  // Normaliza número de UC: guarda só dígitos, sem zeros à esquerda (o "000517021303109" e o
  // "517021303109" são a mesma UC). O número curto ("UC Conces.", ex. 97013994) é outro campo.
  const ucKey = s => String(s || "").replace(/\D/g, "").replace(/^0+/, "");

  function detect(text) {
    const t = String(text || "");
    if (/Demonstrativo UC Geradora/i.test(t)) return "demonstrativo";
    if (/copel/i.test(t) && /DANF3E|NOTA FISCAL ELETR/i.test(t)) return "fatura";
    return "";
  }

  // Itens da fatura: o pdf.js entrega a tabela em colunas — N descrições, N unidades,
  // quantidades (só para itens que não são "UN"), N tarifas com tributos, N valores.
  function parseItems(L) {
    const isUnit = s => /^(kWh|kW|UN|kVArh|kVAr|MWh)$/i.test(s || "");
    const u0 = L.findIndex((s, i) => isUnit(s) && i > 0 && /[A-Za-z]{3}/.test(L[i - 1]) && !isUnit(L[i - 1]));
    if (u0 < 0) return [];
    let n = 0;
    while (isUnit(L[u0 + n])) n++;
    const units = L.slice(u0, u0 + n), desc = L.slice(u0 - n, u0);
    const nq = units.filter(u => !/^UN$/i.test(u)).length;
    let p = u0 + n;
    const qty = L.slice(p, p += nq), price = L.slice(p, p += n), value = L.slice(p, p += n);
    if (desc.length !== n || ![...qty, ...price, ...value].every(isNum)) return [];
    // Depois dos valores vêm, só para os itens em kWh: dois blocos de tributos e a tarifa SEM tributos.
    const sem = L.slice(p + 2 * nq, p + 3 * nq);
    const temSem = sem.length === nq && L.slice(p, p + 3 * nq).every(isNum);
    let qi = 0, si = 0;
    return desc.map((d, i) => {
      const un = /^UN$/i.test(units[i]);
      const it = { desc: d, unidade: units[i], qtd: un ? 1 : brNum(qty[qi++]), tarifa: brNum(price[i]), valor: brNum(value[i]) };
      if (!un && temSem) it.tarifaBase = brNum(sem[si++]);
      return it;
    });
  }

  const isCredito = i => /\bINJ/i.test(i.desc) && i.valor < 0;
  const isBandeira = i => /BAND|B\.\s?(AMARELA|VERMELHA|VERDE)/i.test(i.desc);
  const isIluminacao = i => /ILUMIN/i.test(i.desc);
  const isEncargo = i => /MULTA|JUROS|MORA|ATUALIZ|CORRE[CÇ]/i.test(i.desc);
  const isConsumo = i => /ENERGIA ELET CONSUMO|CONSUMO TE|^CONSUMO/i.test(i.desc) && i.qtd > 0;

  function parseFatura(text) {
    const t = String(text || "");
    const L = lines(t);
    const avisos = [];
    const D = "(\\d{2}\\/\\d{2}\\/\\d{4})";
    // Cabeçalho: leitura anterior, leitura atual, nº de dias, próxima leitura, UC, referência, vencimento, total.
    const head = new RegExp(`${D}\\s+${D}\\s+(\\d{1,3})\\s+${D}\\s+(\\d{6,})\\s+(\\d{2})\\/(\\d{4})\\s+${D}\\s+R\\$\\s*(-?[\\d.]+,\\d{2})`).exec(t);
    if (!head) return { ok: false, erro: "Não encontrei o cabeçalho da fatura (datas de leitura, UC, referência, vencimento e total)." };
    const ucHead = head[5];
    const f = {
      tipo: "fatura",
      leituraAnterior: isoDate(head[1]), leituraAtual: isoDate(head[2]), dias: Number(head[3]), proximaLeitura: isoDate(head[4]),
      referencia: `${head[7]}-${head[6]}`, vencimento: isoDate(head[8]), total: brNum(head[9]),
      uc: "", ucConces: ""
    };
    // A Copel mudou o cabeçalho em 2026: antes vinha o nº curto (UC Conces., 8–9 dígitos),
    // agora vem o nº longo (15 dígitos). O curto continua no texto do débito automático.
    if (ucHead.replace(/^0+/, "").length >= 11) f.uc = ucKey(ucHead); else f.ucConces = ucKey(ucHead);
    const deb = /D[ÉE]BITO AUTOM[ÁA]TICO, UTILIZE O N[ÚU]MERO:\s*(\d+)/i.exec(t);
    if (deb && !f.ucConces) f.ucConces = ucKey(deb[1]);
    const nf = /NOTA FISCAL No\.\s*(\d+)/i.exec(t); if (nf) f.notaFiscal = nf[1];
    const emis = /DATA DE EMISS[ÃA]O:\s*(\d{2}\/\d{2}\/\d{4})/i.exec(t); if (emis) f.emissao = isoDate(emis[1]);
    const name = /Nome:\s*([^\n]+)(?:\n(?!Endere)([^\n:]+))?/.exec(t); if (name) f.titular = [name[1], name[2]].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const addr = /Endereço:\s*([^\n]+)/.exec(t); if (addr) f.endereco = addr[1].replace(/\s*-\s*$/, "").trim();
    const cid = /Cidade:\s*([^\n]+?)\s*-\s*Estado/i.exec(t); if (cid) f.cidade = cid[1].trim();
    const doc = /\b(CNPJ|CPF):\s*([\d./-]+)/.exec((t.split("Nome:")[1] || "").split(/NOTA FISCAL No/i)[0]); if (doc) f.documento = doc[2];
    const classe = /\n(B\d[^\n]*|A\d[^\n]*)\n(Monof|Bif|Trif)/i.exec(t); if (classe) f.classe = classe[1].trim();
    const grupo = /Grupo de Tensao \/ Modalidade Tarifaria:\s*([^\n]+)/i.exec(t); if (grupo) f.grupoTarifario = grupo[1].trim();
    const ger = /Geradora:\s*UC\s*(\d+)/i.exec(t); if (ger) f.geradoraConces = ucKey(ger[1]);
    f.beneficiaria = /UC benefici[áa]ria SCEE/i.test(t);
    f.microgeradora = /Unidade Micro\/Minigeradora/i.test(t);
    const saldo = /Saldo Acumulado em cada Posto Hor[áa]rio:\s*Todos os Per[ií]odos\s+(\d+)/i.exec(t);
    if (saldo) f.saldoCreditosKwh = Number(saldo[1]);
    const expira = /Saldo a Expirar Pr[óo]ximo M[êe]s:\s*Todos os Per[ií]odos\s+(\d+)/i.exec(t);
    if (expira) f.saldoExpirarKwh = Number(expira[1]);
    const band = /Periodos Band\.Tarif\.:\s*([^\n]+)/i.exec(t); if (band) f.bandeiras = band[1].trim();
    const fase = /\n(Monof|Bif|Trif)[aá]sico\b/i.exec(t); if (fase) f.fase = { monof: "monofasico", bif: "bifasico", trif: "trifasico" }[fase[1].toLowerCase()];
    // Alíquotas: "ICMS / COFINS / PIS", depois as 3 bases e os 3 percentuais.
    const iI = L.findIndex((s, i) => s === "ICMS" && L[i + 1] === "COFINS" && L[i + 2] === "PIS");
    if (iI >= 0 && L.slice(iI + 6, iI + 9).every(s => /%$/.test(s))) {
      const pc = s => brNum(s.replace("%", "")) / 100;
      f.aliquotas = { icms: pc(L[iI + 6]), cofins: pc(L[iI + 7]), pis: pc(L[iI + 8]) };
    }
    // Histórico de consumo: rótulos "SET26", "AGO26"… e os kWh na mesma ordem (mais recente primeiro).
    const iH = L.findIndex(s => /^N[ºo°]\s*DIAS FAT\.?$/i.test(s));
    if (iH >= 0) {
      const MES = { JAN: "01", FEV: "02", MAR: "03", ABR: "04", MAI: "05", JUN: "06", JUL: "07", AGO: "08", SET: "09", OUT: "10", NOV: "11", DEZ: "12" };
      const rot = []; let q = iH + 1;
      while (/^[A-Z]{3}\d{2}$/.test(L[q] || "") && MES[L[q].slice(0, 3)]) rot.push(L[q++]);
      const kwh = L.slice(q, q + rot.length);
      if (rot.length && kwh.every(isNum)) f.historico = rot.map((r, i) => ({ mes: `20${r.slice(3)}-${MES[r.slice(0, 3)]}`, kwh: brNum(kwh[i]) }));
    }

    f.itens = parseItems(L);
    if (!f.itens.length) avisos.push("Não consegui ler os itens da fatura: confira os valores à mão.");
    const soma = r2(f.itens.reduce((s, i) => s + i.valor, 0));
    f.somaItens = soma;
    if (f.itens.length && Math.abs(soma - f.total) > 0.05) avisos.push(`Os itens somam R$ ${soma.toFixed(2)} e o total da fatura é R$ ${f.total.toFixed(2)}.`);

    const cred = f.itens.filter(isCredito);
    f.valorCreditos = r2(-cred.reduce((s, i) => s + i.valor, 0));
    // kWh compensados = linhas de TE injetada (a TUSD repete a mesma quantidade; bandeira também).
    const credTE = cred.filter(i => /\bTE\b/i.test(i.desc) && !isBandeira(i));
    const credBase = credTE.length ? credTE : cred.filter(i => !isBandeira(i) && !/TUS/i.test(i.desc));
    f.compensadoKwh = Math.round(Math.abs(credBase.reduce((s, i) => s + i.qtd, 0)));
    const cons = f.itens.find(isConsumo);
    f.consumoKwh = cons ? Math.round(cons.qtd) : 0;
    f.iluminacaoPublica = r2(f.itens.filter(isIluminacao).reduce((s, i) => s + i.valor, 0));
    f.encargos = r2(f.itens.filter(isEncargo).reduce((s, i) => s + i.valor, 0));
    f.bandeiraValor = r2(f.itens.filter(i => isBandeira(i) && i.valor > 0).reduce((s, i) => s + i.valor, 0));
    f.outrosCreditos = r2(f.itens.filter(i => i.valor < 0 && !isCredito(i)).reduce((s, i) => s + i.valor, 0));
    f.semUsina = r2(f.total + f.valorCreditos);
    // Créditos de outra origem (geração própria GD I, não de usina arrendada) ficam marcados.
    f.creditoProprio = cred.some(i => /GDI-I\b|GD I\b/i.test(i.desc)) && !cred.some(i => /OUC|GDII/i.test(i.desc));

    if (!f.consumoKwh) avisos.push("Não encontrei o kWh consumido.");
    if (f.compensadoKwh > f.consumoKwh && f.consumoKwh) avisos.push(`Compensado (${f.compensadoKwh} kWh) maior que o consumo (${f.consumoKwh} kWh).`);
    if (f.leituraAtual && f.leituraAnterior && f.leituraAtual <= f.leituraAnterior) avisos.push("Datas de leitura fora de ordem.");
    if (f.encargos > 0) avisos.push(`Fatura com multa/juros: R$ ${f.encargos.toFixed(2)}.`);
    if (f.creditoProprio) avisos.push("Os créditos desta fatura são de geração própria (GD I), não de usina arrendada.");
    if (!f.uc && !f.ucConces) avisos.push("Não li o número da UC.");
    return { ok: true, campos: f, avisos };
  }

  // Demonstrativo: cada bloco é uma UC com 13 meses e 9 colunas (em kWh, % na 6ª).
  const COLS = ["saldoAnterior", "credRecebido", "energiaInjetada", "energiaAtiva", "creditoUtilizado", "percentual", "prioridade", "saldoTransferido", "saldoFinal"];
  function parseDemonstrativo(text) {
    const blocks = String(text || "").split(/Demonstrativo UC Geradora \/ Benefici[áa]ria/i).slice(1);
    const ucs = [];
    const avisos = [];
    for (const b of blocks) {
      const L = lines(b);
      const val = key => { const i = L.findIndex(s => new RegExp(`^${key}$`, "i").test(s)); return i >= 0 ? String(L[i + 1] || "").replace(/^:\s*/, "").trim() : ""; };
      const papel = /UC Geradora - expressos/i.test(b) ? "geradora" : /UC Benefici[áa]ria - expressos/i.test(b) ? "beneficiaria" : "";
      // Demonstrativos antigos vêm só com o nº curto: "geradora UC: UC Conces.: 80043259".
      const ger = /Dados originados da geradora UC:\s*(\d*)\s*UC Conces\.:\s*(\d+)/i.exec(b);
      const emit = /Emitido em\s*:\s*(\d{2}\/\d{2}\/\d{4})/i.exec(b);
      const iTP = L.findIndex(s => s === "TP");
      const start = L.findIndex((s, i) => i > iTP && /^\d{2}\/\d{4}$/.test(s));
      const refs = [];
      let p = start;
      while (p >= 0 && /^\d{2}\/\d{4}$/.test(L[p] || "")) refs.push(L[p++]);
      const n = refs.length;
      const nums = [];
      while (p < L.length && nums.length < n * COLS.length && isNum(L[p])) nums.push(brNum(L[p++]));
      const meses = [];
      if (n && nums.length === n * COLS.length) {
        refs.forEach((r, i) => {
          const m = { referencia: `${r.slice(3)}-${r.slice(0, 2)}` };
          COLS.forEach((c, j) => { m[c] = nums[j * n + i]; });
          meses.push(m);
        });
      } else if (n) avisos.push(`Não li a tabela de meses da UC ${val("UC")}.`);
      ucs.push({
        uc: ucKey(val("UC")), ucConces: ucKey(val("UC Conces\\.")), nome: val("Nome"), endereco: val("Endereço"), cidade: val("Cidade"),
        papel, geradora: ger ? ucKey(ger[1]) : "", geradoraConces: ger ? ucKey(ger[2]) : "", emitidoEm: emit ? isoDate(emit[1]) : "", meses
      });
    }
    if (!ucs.length) return { ok: false, erro: "Não encontrei nenhuma UC no demonstrativo." };
    return { ok: true, campos: { tipo: "demonstrativo", ucs }, avisos };
  }

  function parse(text) {
    const tipo = detect(text);
    if (tipo === "fatura") return parseFatura(text);
    if (tipo === "demonstrativo") return parseDemonstrativo(text);
    return { ok: false, erro: "Este PDF não parece uma fatura da Copel (DANF3E) nem um demonstrativo de micro/minigeração." };
  }

  return { parse, parseFatura, parseDemonstrativo, detect, ucKey, brNum };
});
