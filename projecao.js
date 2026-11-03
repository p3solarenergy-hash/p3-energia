/*
  Projeção de economia para um cliente novo — a partir das faturas da Copel dele.

  Tudo sai da fatura: histórico de 12 meses, tarifas com e sem tributos, alíquotas,
  tipo de ligação (custo mínimo), iluminação pública, bandeira e créditos que a UC já recebe.

  Crédito da usina (GD II, Lei 14.300), por kWh compensado:
      TE com tributos  +  (TUSD sem tributos − %FioB × Fio B) × fator PIS/COFINS
  (assim a Copel mostra na fatura GD II: a TE do crédito leva ICMS, a TUSD do crédito não.)
  %FioB não compensado: 2023 15% · 2024 30% · 2025 45% · 2026 60% · 2027 75% · 2028 90%.

  Por mês (consumo C do histórico):
      créditos atuais  = o que a UC já compensa hoje (geração própria etc.), se mantidos
      compensável      = (C − mínimo da ligação − créditos atuais) × cobertura
      conta hoje       = C × (TE + TUSD + bandeira) + iluminação − créditos atuais
      Copel com usina  = conta hoje − compensável × (crédito + bandeira)
      arrendamento     = conforme o acordo (fixo/mês, R$ por kWh ou desconto sobre o crédito)
      economia         = conta hoje − (Copel com usina + arrendamento)
*/
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./motor"));
  else root.P3_PROJECAO = factory(root.P3_MOTOR);
})(typeof self !== "undefined" ? self : this, function (motor) {
  "use strict";
  const n = v => Number(v) || 0;
  const r2 = v => Math.round(n(v) * 100) / 100;
  const PCT_FIOB = { 2023: 0.15, 2024: 0.30, 2025: 0.45, 2026: 0.60, 2027: 0.75, 2028: 0.90 };
  const pctFioB = ano => PCT_FIOB[ano] != null ? PCT_FIOB[ano] : (ano < 2023 ? 0 : 0.9);
  const MINIMO = { monofasico: 30, bifasico: 50, trifasico: 100 };
  // Fio B Copel B3 sem tributos, tirado da fatura GD II da Torre Valencia (TUSD 0,457170 × crédito 0,328431, 60%).
  const FIOB_PADRAO = { valor: 0.214565, fonte: "fatura GD II Copel de ago/2026 (tarifa vigente desde jun/2026)" };

  const item = (f, re) => (f.itens || []).find(i => re.test(i.desc) && i.qtd > 0);

  // Fio B sem tributos a partir de qualquer fatura GD II da base: (TUSD − TUSD do crédito) ÷ %FioB do ano.
  function fioBDaBase(faturas) {
    const ok = (faturas || []).map(f => {
      const its = f.itens || [];
      const tusd = its.find(i => /USO SISTEMA/i.test(i.desc) && i.tarifaBase);
      const cred = its.find(i => /INJ.*(OUC|MPT|GDII).*TUS/i.test(i.desc) && i.tarifaBase);
      if (!tusd || !cred) return null;
      const v = (tusd.tarifaBase - cred.tarifaBase) / pctFioB(Number(String(f.referencia).slice(0, 4)));
      return v > 0 ? { valor: Math.round(v * 1e6) / 1e6, fonte: `fatura GD II de ${motor.monthLabel(f.referencia)}`, referencia: f.referencia } : null;
    }).filter(Boolean).sort((a, b) => b.referencia.localeCompare(a.referencia));
    return ok[0] || FIOB_PADRAO;
  }

  // Tarifas e dados de uma conta, tirados da fatura lida.
  function tarifas(f, p) {
    const cons = item(f, /ENERGIA ELET CONSUMO/i), uso = item(f, /USO SISTEMA/i), band = item(f, /CONS\. B\.|BAND/i);
    if (!cons || !uso) throw new Error(`Fatura da UC ${f.uc || f.ucConces}: não achei as linhas de consumo (TE/TUSD).`);
    const a = f.aliquotas;
    const fPC = a ? 1 / (1 - a.pis - a.cofins) : (uso.tarifaBase ? 1.088 : 1);
    const fioBBase = n(p.fioBBase) || FIOB_PADRAO.valor;
    // % do Fio B do 1º mês projetado (só para exibir; o cálculo usa o % do ano de cada mês).
    const pct = pctFioB(n(p.ano) || Number(String(p.inicio || motor.addMonths(f.referencia, 1)).slice(0, 4)));
    const tusdBase = uso.tarifaBase || uso.tarifa / (fPC / ((a ? 1 - a.icms : 0.81)));
    const credito = cons.tarifa + (tusdBase - pct * fioBBase) * fPC;
    const bandeira = p.bandeira === "verde" ? 0 : (p.bandeira != null && p.bandeira !== "" && p.bandeira !== "fatura" ? n(p.bandeira) : (band ? band.tarifa : 0));
    const atuaisKwh = n(f.compensadoKwh), atuaisRate = atuaisKwh ? n(f.valorCreditos) / atuaisKwh : 0;
    // Reajuste da tarifa acumulado até o ano projetado (1 = tarifa da fatura). Iluminação pública não reajusta aqui.
    const k = n(p.fatorTarifa) || 1;
    return {
      te: cons.tarifa * k, tusd: uso.tarifa * k, tusdBase: tusdBase * k, tarifa: (cons.tarifa + uso.tarifa) * k, credito: credito * k, bandeira: bandeira * k, fatorPC: fPC, pctFioB: pct, fatorTarifa: k,
      fioB: fioBBase * fPC * k, fioBBase: fioBBase * k, iluminacao: n(f.iluminacaoPublica), minimo: MINIMO[f.fase] || 100, fase: f.fase || "trifasico",
      creditosAtuaisKwh: p.manterCreditosAtuais === false ? 0 : atuaisKwh, creditosAtuaisRate: atuaisRate * k, creditosAtuaisProprios: !!f.creditoProprio
    };
  }

  // Consumo dos 12 meses projetados, a partir do início da operação (padrão: mês seguinte à fatura).
  // Cada mês projetado usa o consumo do mesmo mês do ano no histórico da fatura (out/26 ← out/25).
  const inicioDe = (f, p) => (/^\d{4}-\d{2}$/.test(p.inicio || "") ? p.inicio : motor.addMonths(f.referencia, 1));
  function consumos(f, p) {
    const inicio = inicioDe(f, p);
    const h = (f.historico || []).slice(0, 12);
    const porMesDoAno = new Map(h.map(x => [x.mes.slice(5, 7), x]));
    const media = h.length ? h.reduce((s, x) => s + n(x.kwh), 0) / h.length : n(f.consumoKwh);
    return Array.from({ length: 12 }, (_, i) => {
      const mes = motor.addMonths(inicio, i);
      if (p.consumoFixo) return { mes, kwh: n(p.consumoFixo) };
      const hist = h.length >= 3 ? porMesDoAno.get(mes.slice(5, 7)) : null;
      return { mes, mesHistorico: hist ? hist.mes : null, kwh: hist ? n(hist.kwh) : Math.round(h.length >= 3 ? media : n(f.consumoKwh)) };
    });
  }

  /*
    contas: [{ campos (fatura lida), apelido }]
    p: { acordo: "fixo"|"kwh"|"desconto", valorFixo, valorKwh, desconto (%), cobertura (%), geracaoUsina (kWh/mês),
         ano, fioBBase, bandeira ("fatura"|"verde"|R$/kWh), manterCreditosAtuais, consumoFixo }
  */
  function projetar(contas, p) {
    p = { acordo: "fixo", cobertura: 100, manterCreditosAtuais: true, ...(p || {}) };
    // Saldo de créditos no primeiro mês (só importa com geração informada):
    //   "nova"    usina começando — saldo zero (1º ano). É o padrão.
    //   "regime"  usina já operando (2º ano em diante) — começa com o saldo que sobra ao fim de um ciclo.
    //   "manual"  o saldo informado em saldoInicial.
    const temGer = (Array.isArray(p.geracaoPorMes) && p.geracaoPorMes.some(v => n(v) > 0)) || n(p.geracaoUsina) > 0;
    if (p.saldoModo !== "manual" && !p._ciclo) p.saldoInicial = 0;
    if (temGer && !p._ciclo && p.saldoModo === "regime") {
      let s = 0;
      for (let k = 0; k < 3; k++) s = projetar(contas, { ...p, _ciclo: true, saldoInicial: s }).anual.saldoFinal;
      const r = projetar(contas, { ...p, _ciclo: true, saldoInicial: s });
      r.regime = true; r.params = p;
      return r;
    }
    const cs = contas.map(c => {
      const f = c.campos || c;
      return { f, apelido: c.apelido || f.endereco || "", uc: f.uc || f.ucConces, titular: f.titular, t: tarifas(f, p), cons: consumos(f, p) };
    });
    const nMeses = Math.max(...cs.map(c => c.cons.length));
    const cob = Math.min(100, Math.max(0, n(p.cobertura))) / 100;
    // Geração por mês: 12 valores (jan…dez) ou um valor fixo; nada informado = sem limite.
    // Ajuste da geração em % (margem de segurança): padrão −10%.
    const ajusteGer = 1 + (p.ajusteGeracao == null || p.ajusteGeracao === "" ? -10 : n(p.ajusteGeracao)) / 100;
    const porMes = Array.isArray(p.geracaoPorMes) && p.geracaoPorMes.length === 12 && p.geracaoPorMes.some(v => n(v) > 0) ? p.geracaoPorMes.map(v => Math.round(n(v) * ajusteGer)) : null;
    const geracaoDoMes = mes => porMes ? porMes[Number(String(mes).slice(5, 7)) - 1] : (n(p.geracaoUsina) > 0 ? Math.round(n(p.geracaoUsina) * ajusteGer) : null);
    // Custos da UC geradora (regras da ANEEL): custo de disponibilidade (mínimo da ligação × tarifa com
    // bandeira) + iluminação pública + outros. Se o cliente paga, entram no custo dele com a usina.
    const cu = p.custosUsina || {};
    const t0 = cs[0].t;
    const custoUsinaMes = cu.incluir === false ? 0 : r2((MINIMO[cu.fase || "trifasico"] || 100) * (t0.tarifa + t0.bandeira) + n(cu.iluminacao) + n(cu.outros));
    const custoUsinaCliente = cu.quemPaga !== "p3";
    let saldo = n(p.saldoInicial);
    const meses = [];
    for (let i = 0; i < nMeses; i++) {
      // 1) quanto cada UC pode compensar
      const linhas = cs.map(c => {
        const m = c.cons[i] || c.cons[c.cons.length - 1];
        const C = n(m.kwh), t = c.t;
        const atuais = Math.min(t.creditosAtuaisKwh, Math.max(0, C - t.minimo));
        // Fio B não compensado pelo ano civil do mês projetado (ou o ano forçado em p.ano).
        const pct = pctFioB(n(p.ano) || Number(m.mes.slice(0, 4)));
        const cred = t.te + (t.tusdBase - pct * t.fioBBase) * t.fatorPC;
        return { c, mes: m.mes, mesHistorico: m.mesHistorico, pct, cred, C, atuais, comp: Math.max(0, C - t.minimo - atuais) * cob };
      });
      // 2) geração da usina no mês + saldo acumulado; o que sobra vira saldo para os meses seguintes
      //    (como no SCEE da Copel). Sem geração informada, a usina cobre tudo o que é compensável.
      const totalComp = linhas.reduce((s, l) => s + l.comp, 0);
      const ger = geracaoDoMes(linhas[0].mes);
      let cap = 1, saldoAntes = saldo;
      if (ger != null) {
        const disp = ger + saldo;
        if (totalComp > disp) cap = totalComp ? disp / totalComp : 0;
      }
      linhas.forEach(l => { l.comp = Math.round(l.comp * cap); });
      const compMes = linhas.reduce((s, l) => s + l.comp, 0);
      if (ger != null) saldo = Math.max(0, Math.round(ger + saldo - compMes));
      const fixos = p.acordo === "fixo" ? motor.splitCents(n(p.valorFixo), linhas.map(l => l.comp)) : [];
      const custos = motor.splitCents(custoUsinaMes, linhas.map(l => l.comp));
      linhas.forEach((l, k) => {
        const t = l.c.t;
        l.hoje = r2(l.C * (t.tarifa + t.bandeira) + t.iluminacao - l.atuais * t.creditosAtuaisRate);
        l.valorCredito = r2(l.comp * (l.cred + t.bandeira));
        l.comUsina = r2(l.hoje - l.valorCredito);
        l.arrendamento = p.acordo === "fixo" ? fixos[k] : p.acordo === "kwh" ? r2(l.comp * n(p.valorKwh)) : r2(l.valorCredito * (1 - n(p.desconto) / 100));
        l.custosUsina = custos[k] || 0;
        l.total = r2(l.comUsina + l.arrendamento + (custoUsinaCliente ? l.custosUsina : 0));
        l.economia = r2(l.hoje - l.total);
      });
      const S = k => r2(linhas.reduce((s, l) => s + n(l[k]), 0));
      meses.push({ mes: linhas[0].mes, consumo: linhas.reduce((s, l) => s + l.C, 0), compensado: compMes, creditosAtuais: linhas.reduce((s, l) => s + l.atuais, 0),
        mesHistorico: linhas[0].mesHistorico, pctFioB: linhas[0].pct,
        geracao: ger, saldoInicial: ger != null ? saldoAntes : null, saldo: ger != null ? saldo : null, faltou: Math.max(0, Math.round(totalComp - compMes)),
        hoje: S("hoje"), valorCredito: S("valorCredito"), comUsina: S("comUsina"), arrendamento: S("arrendamento"), custosUsina: S("custosUsina"), total: S("total"), economia: S("economia"), contas: linhas.map(l => ({ uc: l.c.uc, consumo: l.C, compensado: l.comp, hoje: l.hoje, comUsina: l.comUsina, arrendamento: l.arrendamento, economia: l.economia })) });
    }
    const A = k => r2(meses.reduce((s, m) => s + n(m[k]), 0));
    const anual = { consumo: A("consumo"), compensado: A("compensado"), hoje: A("hoje"), valorCredito: A("valorCredito"), comUsina: A("comUsina"), arrendamento: A("arrendamento"), custosUsina: A("custosUsina"), total: A("total"), economia: A("economia") };
    anual.custosUsinaCliente = custoUsinaCliente ? anual.custosUsina : 0;
    anual.custoUsinaMes = custoUsinaMes;
    anual.ajusteGeracao = Math.round((ajusteGer - 1) * 100);
    anual.economiaPct = anual.hoje > 0 ? anual.economia / anual.hoje : 0;
    const comGeracao = meses.some(m => m.geracao != null);
    anual.geracao = comGeracao ? meses.reduce((s, m) => s + n(m.geracao), 0) : null;
    anual.saldoFinal = comGeracao ? meses[meses.length - 1].saldo : null;
    anual.faltou = meses.reduce((s, m) => s + m.faltou, 0);
    // Quanto de arrendamento fixo por mês deixa o cliente com X% de economia no ano.
    const fixoPara = pct => r2(Math.max(0, (anual.valorCredito - anual.custosUsinaCliente - pct * anual.hoje) / meses.length));
    const media = { consumo: anual.consumo / meses.length, compensado: anual.compensado / meses.length, economia: anual.economia / meses.length, arrendamento: anual.arrendamento / meses.length };
    return {
      params: p, contas: cs.map(c => ({ uc: c.uc, titular: c.titular, apelido: c.apelido, referencia: c.f.referencia, tarifas: c.t, consumoMedio: c.cons.reduce((s, m) => s + n(m.kwh), 0) / c.cons.length })),
      meses, anual, media, faixas: [0, 0.1, 0.15, 0.2, 0.25, 0.3].map(x => ({ economiaPct: x, arrendamentoFixo: fixoPara(x) })),
      piorMes: meses.reduce((a, m) => (!a || m.economia < a.economia ? m : a), null), melhorMes: meses.reduce((a, m) => (!a || m.economia > a.economia ? m : a), null)
    };
  }

  // Mesma projeção nos anos da transição do Fio B (a economia cai conforme o % não compensado sobe).
  function porAno(contas, p, anos) {
    return (anos || [2026, 2027, 2028]).map(ano => ({ ano, pctFioB: pctFioB(ano), ...(({ anual }) => ({ anual }))(projetar(contas, { ...p, ano })) }));
  }

  // Ano a ano com a usina alocada ao cliente: cada ano começa com o saldo de créditos que sobrou do ano
  // anterior e usa a regra do Fio B do seu ano (Lei 14.300). O 1º ano começa conforme p.saldoModo.
  // Créditos valem 60 meses; o saldo de 5 anos não chega a expirar se é usado todo ano.
  function porAnos(contas, p, nAnos) {
    p = p || {};
    const f0 = (contas[0] && (contas[0].campos || contas[0])) || {};
    const inicio0 = inicioDe(f0, p);
    const primeiro = projetar(contas, { ...p, inicio: inicio0 });
    let saldo = primeiro.meses[0] && primeiro.meses[0].saldoInicial != null ? primeiro.meses[0].saldoInicial : 0;
    const out = [];
    for (let k = 0; k < (nAnos || 5); k++) {
      const inicio = motor.addMonths(inicio0, 12 * k), fim = motor.addMonths(inicio, 11);
      const fatorTarifa = Math.pow(1 + n(p.reajusteTarifa) / 100, k);
      const r = k === 0 ? primeiro : projetar(contas, { ...p, inicio, saldoModo: "manual", saldoInicial: saldo, fatorTarifa });
      const nM = r.meses.length || 12;
      const pcts = [...new Set(r.meses.map(m => m.pctFioB))];
      out.push({ n: k + 1, ano: Number(inicio.slice(0, 4)), inicio, fim, periodo: `${motor.monthLabel(inicio)} a ${motor.monthLabel(fim)}`,
        pctFioB: pcts[pcts.length - 1], pctsFioB: pcts, fatorTarifa, saldoInicio: r.anual.geracao != null ? saldo : null, saldoFim: r.anual.saldoFinal,
        hoje: r.anual.hoje, economia: r.anual.economia, economiaMes: r.anual.economia / nM, economiaPct: r.anual.economiaPct, faltou: r.anual.faltou, compensado: r.anual.compensado, arrendamento: r.anual.arrendamento });
      if (r.anual.saldoFinal != null) saldo = r.anual.saldoFinal;
    }
    return out;
  }

  // Geração estimada por potência: kWh por kWp em cada mês (jan…dez). Média do Paraná ~1.400 kWh/kWp/ano;
  // é estimativa — se a usina já opera, use o histórico real dela (demonstrativo da Copel).
  const FATOR_PR = [140, 125, 125, 110, 95, 85, 90, 110, 115, 125, 135, 145];
  const porPotencia = kwp => FATOR_PR.map(f => Math.round(f * n(kwp)));

  // Geração real de uma usina da base por mês do ano (jan…dez), a partir dos demonstrativos (energia injetada).
  // Mês sem dado recebe a média dos meses conhecidos.
  function historicoUsina(scee, usina) {
    const ger = String(usina.uc_geradora_conces || ""), uc = String(usina.uc_geradora || "");
    const linhas = (scee || []).filter(s => s.papel === "geradora" && (String(s.uc_conces) === ger || String(s.uc) === uc) && n(s.energia_injetada) > 0);
    const ultimo = new Map(); // mês do ano → registro mais recente
    for (const s of linhas.sort((a, b) => String(a.referencia).localeCompare(b.referencia) || String(a.emitido_em).localeCompare(b.emitido_em))) ultimo.set(Number(s.referencia.slice(5, 7)), { kwh: n(s.energia_injetada), ref: s.referencia });
    if (!ultimo.size) return null;
    const media = [...ultimo.values()].reduce((s, x) => s + x.kwh, 0) / ultimo.size;
    return { meses: Array.from({ length: 12 }, (_, i) => Math.round(ultimo.has(i + 1) ? ultimo.get(i + 1).kwh : media)), conhecidos: ultimo.size, media: Math.round(media) };
  }

  return { projetar, porAno, porAnos, tarifas, fioBDaBase, pctFioB, FIOB_PADRAO, MINIMO, FATOR_PR, porPotencia, historicoUsina };
});
