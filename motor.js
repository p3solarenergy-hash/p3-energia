/*
  Motor de cálculo — P3 Gestão de Usinas.

  Contas puras: sem banco, sem tela. Recebe os registros e devolve os números.
  Painel, fechamento, relatórios e auditoria usam SÓ este motor, então o que o
  cliente paga de arrendamento é exatamente o que o dono recebe.

  Regras (por competência, AAAA-MM):
    Fatura da UC (Copel)
      com usina      = total da fatura
      sem usina      = total + créditos da usina (itens "ENERGIA INJ" negativos)
    Usina no mês
      arrendamento   = valor do mês (Fechamento) ou o contratual, a partir do início da operação
      gestão P3      = % do arrendamento ou valor fixo (o do mês prevalece sobre o da usina)
      fatura geradora= faturas da UC geradora da usina no mês; quem paga: cliente, dono ou P3
      líquido dono   = arrendamento − gestão P3 − custos do dono − geradora (se paga pelo dono)
    Rateio do arrendamento entre as UCs da usina
      "kwh"        proporcional aos kWh compensados que vieram desta usina (padrão)
      "percentual" pelo percentual do vínculo UC × usina
      Sem kWh no mês (ex.: só custo mínimo), divide igual entre as UCs com fatura.
      O rateio fecha no centavo (maior resto).
    Cliente (UC)
      custo total    = fatura com usina + parte do arrendamento + parte da geradora (se do cliente)
      economia       = sem usina − custo total
*/
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.P3_MOTOR = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
  const n = v => Number(v) || 0;

  const addMonths = (mk, k) => {
    const [y, m] = String(mk).split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n(k), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const monthRange = (from, to) => {
    const out = [];
    if (!from || !to || from > to) return out;
    for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
    return out;
  };
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const monthLabel = mk => { const [y, m] = String(mk || "").split("-"); return m ? `${MESES[Number(m) - 1]}/${y.slice(2)}` : "—"; };
  const monthLong = mk => {
    const NOMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const [y, m] = String(mk || "").split("-"); return m ? `${NOMES[Number(m) - 1]} de ${y}` : "—";
  };

  // Divide "total" em partes proporcionais a "pesos", fechando no centavo (maior resto).
  function splitCents(total, pesos) {
    const cents = Math.round(n(total) * 100);
    const soma = pesos.reduce((s, p) => s + Math.max(0, n(p)), 0);
    if (!pesos.length) return [];
    const base = soma > 0 ? pesos.map(p => Math.max(0, n(p)) / soma) : pesos.map(() => 1 / pesos.length);
    const raw = base.map(b => b * cents);
    const floor = raw.map(Math.floor);
    let resto = cents - floor.reduce((s, v) => s + v, 0);
    const ordem = raw.map((v, i) => [v - floor[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    for (let k = 0; resto > 0 && k < ordem.length; k++, resto--) floor[ordem[k][1]]++;
    return floor.map(c => c / 100);
  }

  function arrendamentoDoMes(usina, um, comp) {
    if (um && um.arrendamento != null && um.arrendamento !== "") return { valor: r2(um.arrendamento), origem: "mes" };
    const ativa = usina.status !== "inativa" && usina.inicio_operacao && comp >= usina.inicio_operacao && (!usina.fim_operacao || comp <= usina.fim_operacao);
    return ativa ? { valor: r2(usina.arrendamento_mensal), origem: "contrato" } : { valor: 0, origem: "fora" };
  }

  function gestaoDoMes(usina, um, arrendamento) {
    const modo = (um && um.gestao_modo) || usina.gestao_modo || "pct";
    if (modo === "valor") {
      const v = um && um.gestao_valor != null && um.gestao_valor !== "" ? um.gestao_valor : usina.gestao_valor;
      return { valor: r2(v), modo, pct: arrendamento ? n(v) / arrendamento * 100 : 0 };
    }
    const pct = um && um.gestao_pct != null && um.gestao_pct !== "" ? n(um.gestao_pct) : n(usina.gestao_pct);
    return { valor: r2(arrendamento * pct / 100), modo: "pct", pct };
  }

  /*
    db = { donos, usinas, clientes, ucs, vinculos, faturas, usinaMes }
      ucs:      { id, cliente_id, usina_geradora_id, numero, numero_conces, descricao, defasagem, ativa }
      vinculos: { uc_id, usina_id, percentual }
      faturas:  { id, uc_id, referencia, competencia, total, valor_creditos, compensado_kwh, consumo_kwh, ... }
      usinaMes: { usina_id, competencia, arrendamento, gestao_modo, gestao_pct, gestao_valor, custos:[{descricao, valor}], status, geracao_kwh }
  */
  function index(db) {
    const by = (arr, k) => new Map((arr || []).map(x => [x[k], x]));
    const ucs = by(db.ucs, "id");
    const usinas = by(db.usinas, "id");
    const clientes = by(db.clientes, "id");
    const donos = by(db.donos, "id");
    const vincPorUc = new Map(), vincPorUsina = new Map();
    for (const v of db.vinculos || []) {
      if (!vincPorUc.has(v.uc_id)) vincPorUc.set(v.uc_id, []);
      vincPorUc.get(v.uc_id).push(v);
      if (!vincPorUsina.has(v.usina_id)) vincPorUsina.set(v.usina_id, []);
      vincPorUsina.get(v.usina_id).push(v);
    }
    const fatPorComp = new Map();
    for (const f of db.faturas || []) {
      if (!fatPorComp.has(f.competencia)) fatPorComp.set(f.competencia, []);
      fatPorComp.get(f.competencia).push(f);
    }
    const um = new Map((db.usinaMes || []).map(x => [`${x.usina_id}|${x.competencia}`, x]));
    // Demonstrativo da Copel: kWh que cada geradora entregou à UC na referência (uc_conces|ref → geradora → kWh).
    const scee = new Map();
    for (const s of db.scee || []) {
      if (s.papel !== "beneficiaria" || !s.geradora_conces || !Number(s.credito_utilizado)) continue;
      const k = `${s.uc_conces}|${s.referencia}`;
      if (!scee.has(k)) scee.set(k, new Map());
      scee.get(k).set(String(s.geradora_conces), Number(s.credito_utilizado));
    }
    return { ucs, usinas, clientes, donos, vincPorUc, vincPorUsina, fatPorComp, um, scee };
  }

  // Custo lançado que corresponde a um custo fixo: pelo vínculo, ou (lançado à mão) mesma usina e mesma descrição.
  const norm = s => String(s || "").trim().toLowerCase();
  const mesmoCusto = (c, f) => c.fixo_id === f.id || (!c.fixo_id && (c.usina_id || null) === (f.usina_id || null) && norm(c.descricao) === norm(f.descricao));
  const fixoNoMes = (f, comp) => f.ativo !== 0 && f.ativo !== "0" && (!f.inicio || comp >= f.inicio) && (!f.fim || comp <= f.fim);
  // Quem arca com o custo no fim: o dono quando ele paga direto ou reembolsa a P3.
  const arcaDono = c => c.pago_por === "dono" || ((c.pago_por || "p3") === "p3" && c.reembolso === "dono");
  // Custos do dono que vêm do Financeiro (lançados no mês ou previstos pelos custos fixos).
  function custosDoFinanceiro(db, usinaId, comp) {
    const lanc = (db.custos || []).filter(c => c.usina_id === usinaId && c.competencia === comp);
    const prev = (db.custosFixos || []).filter(f => f.usina_id === usinaId && fixoNoMes(f, comp) && !lanc.some(c => mesmoCusto(c, f)));
    return [...lanc.map(c => ({ ...c, _o: "financeiro" })), ...prev.map(f => ({ ...f, _o: "previsto" }))].filter(arcaDono)
      .map(c => ({ descricao: c.descricao || "Custo", valor: r2(c.valor), origem: c._o }));
  }

  function calcMes(db, comp, ix) {
    ix = ix || index(db);
    const faturas = ix.fatPorComp.get(comp) || [];
    const avisos = [];
    // Várias faturas da mesma UC na mesma competência (ex.: Copel faturou dois meses juntos) somam.
    const fatPorUc = new Map();
    for (const f of faturas) {
      if (!fatPorUc.has(f.uc_id)) fatPorUc.set(f.uc_id, []);
      fatPorUc.get(f.uc_id).push(f);
    }
    const somaF = (fs, k) => r2(fs.reduce((s, f) => s + n(f[k]), 0));
    // Parte dos créditos da UC que veio desta usina no mês. UC atendida por mais de uma usina:
    // usa o que a Copel informou no demonstrativo (kWh por geradora); sem demonstrativo, o % do cadastro.
    const pctDoMes = (v, row) => {
      const cad = { pct: n(v.percentual || 100) / 100, fonte: "cadastro" };
      const vs = ix.vincPorUc.get(v.uc_id) || [];
      const fs = fatPorUc.get(v.uc_id) || [];
      if (vs.length < 2 || !fs.length || !row.uc || !row.uc.numero_conces) return cad;
      const porGer = ix.scee.get(`${row.uc.numero_conces}|${fs[0].referencia}`);
      if (!porGer) return cad;
      const kwhDe = vv => { const us = ix.usinas.get(vv.usina_id) || {}; return n(porGer.get(String(us.uc_geradora_conces || ""))); };
      const total = vs.reduce((s, vv) => s + kwhDe(vv), 0);
      return total > 0 ? { pct: kwhDe(v) / total, fonte: "copel" } : cad;
    };

    const ucRows = new Map();
    const ucRow = ucId => {
      if (ucRows.has(ucId)) return ucRows.get(ucId);
      const uc = ix.ucs.get(ucId) || { id: ucId };
      const fs = fatPorUc.get(ucId) || [];
      const row = {
        uc_id: ucId, uc, cliente_id: uc.cliente_id || null, faturas: fs.map(f => f.id),
        temFatura: fs.length > 0, consumoKwh: somaF(fs, "consumo_kwh"), compensadoKwh: somaF(fs, "compensado_kwh"),
        comUsina: somaF(fs, "total"), creditos: somaF(fs, "valor_creditos"), semUsina: 0,
        arrendamento: 0, geradora: 0, custoTotal: 0, economia: 0, economiaPct: 0, partes: []
      };
      row.semUsina = r2(row.comUsina + row.creditos);
      ucRows.set(ucId, row);
      return row;
    };

    const usinaRows = [];
    for (const usina of ix.usinas.values()) {
      const um = ix.um.get(`${usina.id}|${comp}`) || null;
      const arr = arrendamentoDoMes(usina, um, comp);
      const vincs = (ix.vincPorUsina.get(usina.id) || []).filter(v => { const uc = ix.ucs.get(v.uc_id); return uc && uc.ativa !== 0; });
      const geradoras = [...ix.ucs.values()].filter(u => u.usina_geradora_id === usina.id);
      const fatGer = geradoras.flatMap(u => fatPorUc.get(u.id) || []);
      const valorGeradora = somaF(fatGer, "total");
      const pagaGer = usina.geradora_paga_por || "cliente";
      const temMovimento = arr.valor > 0 || vincs.some(v => (fatPorUc.get(v.uc_id) || []).length) || fatGer.length || um;
      if (!temMovimento) continue;

      // kWh e créditos que vieram desta usina para cada UC.
      const partes = vincs.map(v => {
        const row = ucRow(v.uc_id);
        const { pct, fonte } = pctDoMes(v, row);
        return { v, row, pct, fonte, kwh: Math.round(row.compensadoKwh * pct), creditos: r2(row.creditos * pct), semUsinaParte: r2(row.semUsina * pct) };
      });
      const comFatura = partes.filter(p => p.row.temFatura);
      const modoRateio = usina.rateio_modo || "kwh";
      let pesos;
      if (modoRateio === "percentual") pesos = comFatura.map(p => p.pct);
      else pesos = comFatura.map(p => p.kwh);
      const rateioArr = splitCents(arr.valor, pesos);
      const cobraGerCliente = pagaGer === "cliente" && valorGeradora > 0;
      const rateioGer = cobraGerCliente ? splitCents(valorGeradora, pesos) : comFatura.map(() => 0);
      let arrAtribuido = 0;
      comFatura.forEach((p, i) => {
        p.arrendamento = rateioArr[i] || 0;
        p.geradora = rateioGer[i] || 0;
        arrAtribuido = r2(arrAtribuido + p.arrendamento);
        p.row.arrendamento = r2(p.row.arrendamento + p.arrendamento);
        p.row.geradora = r2(p.row.geradora + p.geradora);
        p.row.partes.push({ usina_id: usina.id, pct: p.pct * 100, kwh: p.kwh, creditos: p.creditos, arrendamento: p.arrendamento, geradora: p.geradora });
      });
      const naoAtribuido = r2(arr.valor - arrAtribuido);
      const gest = gestaoDoMes(usina, um, arr.valor);
      // Custos do dono: os escritos no Fechamento mais os do Financeiro que ainda não estão lá (mesma descrição não repete).
      const proprios = (um && Array.isArray(um.custos) ? um.custos : []).map(c => ({ descricao: c.descricao || "Custo", valor: r2(c.valor), origem: "fechamento" }));
      const custos = proprios.concat(custosDoFinanceiro(db, usina.id, comp).filter(c => !proprios.some(p => norm(p.descricao) === norm(c.descricao))));
      const custosDono = r2(custos.reduce((s, c) => s + c.valor, 0));
      const custosProprios = r2(proprios.reduce((s, c) => s + c.valor, 0));
      const geradoraDono = pagaGer === "dono" ? valorGeradora : 0;
      const liquido = r2(arr.valor - gest.valor - custosDono - geradoraDono);
      const kwh = partes.reduce((s, p) => s + p.kwh, 0);
      const creditos = r2(partes.reduce((s, p) => s + p.creditos, 0));
      const uAvisos = [];
      if (arr.valor > 0 && !comFatura.length) uAvisos.push("Arrendamento do mês sem nenhuma fatura de cliente lançada.");
      const faltando = partes.filter(p => !p.row.temFatura).map(p => p.row.uc);
      if (faltando.length && comFatura.length) {
        uAvisos.push(`Falta fatura de ${faltando.length} UC(s) vinculada(s).`);
        // O arrendamento inteiro caiu só nas UCs com fatura: o mês ainda é parcial para esses clientes.
        comFatura.forEach(p => { p.row.parcial = true; });
      }
      if (pagaGer !== "p3" && geradoras.length && !fatGer.length && arr.valor > 0) uAvisos.push("Falta a fatura da UC geradora.");
      uAvisos.forEach(a => avisos.push({ usina_id: usina.id, texto: a }));
      usinaRows.push({
        usina_id: usina.id, usina, dono_id: usina.dono_id, competencia: comp, status: (um && um.status) || "aberto",
        arrendamento: arr.valor, arrendamentoOrigem: arr.origem, gestao: gest.valor, gestaoModo: gest.modo, gestaoPct: gest.pct,
        custos, custosDono, custosProprios, valorGeradora, geradoraPagaPor: pagaGer, geradoraDono, liquidoDono: liquido,
        kwhCompensado: kwh, creditosClientes: creditos, economiaClientes: r2(creditos - arr.valor - (cobraGerCliente ? valorGeradora : 0)),
        geracaoKwh: um && um.geracao_kwh != null ? n(um.geracao_kwh) : null,
        naoAtribuido, faltam: faltando.length, ucs: partes.map(p => ({ uc_id: p.row.uc_id, cliente_id: p.row.cliente_id, temFatura: p.row.temFatura, pct: p.pct * 100, fontePct: p.fonte, kwh: p.kwh, creditos: p.creditos, arrendamento: p.arrendamento || 0, geradora: p.geradora || 0 })),
        avisos: uAvisos
      });
    }

    // UCs com fatura mas sem vínculo com usina entram (aparecem no relatório do cliente, sem arrendamento).
    for (const ucId of fatPorUc.keys()) {
      const uc = ix.ucs.get(ucId);
      if (uc && uc.usina_geradora_id) continue;
      ucRow(ucId);
      if (!(ix.vincPorUc.get(ucId) || []).length) avisos.push({ uc_id: ucId, texto: "Fatura de UC sem usina vinculada." });
    }
    const ucs = [...ucRows.values()].filter(r => !(r.uc && r.uc.usina_geradora_id)).map(r => {
      r.custoTotal = r2(r.comUsina + r.arrendamento + r.geradora);
      r.economia = r2(r.semUsina - r.custoTotal);
      r.economiaPct = r.semUsina > 0 ? r.economia / r.semUsina : 0;
      return r;
    });

    const tot = (arr, k) => r2(arr.reduce((s, x) => s + n(x[k]), 0));
    const totais = {
      arrendamento: tot(usinaRows, "arrendamento"), gestao: tot(usinaRows, "gestao"), custosDono: tot(usinaRows, "custosDono"),
      geradora: tot(usinaRows, "valorGeradora"), liquidoDonos: tot(usinaRows, "liquidoDono"), naoAtribuido: tot(usinaRows, "naoAtribuido"),
      consumoKwh: ucs.reduce((s, r) => s + r.consumoKwh, 0), compensadoKwh: ucs.reduce((s, r) => s + r.compensadoKwh, 0),
      semUsina: tot(ucs, "semUsina"), comUsina: tot(ucs, "comUsina"), creditos: tot(ucs, "creditos"),
      arrendamentoClientes: tot(ucs, "arrendamento"), geradoraClientes: tot(ucs, "geradora"), custoTotal: tot(ucs, "custoTotal"), economia: tot(ucs, "economia"),
      faturas: faturas.length
    };
    totais.economiaPct = totais.semUsina > 0 ? totais.economia / totais.semUsina : 0;
    return { competencia: comp, usinas: usinaRows, ucs, totais, avisos };
  }

  // Vários meses de uma vez (mesmo índice). Filtros opcionais por dono, usina ou cliente.
  function calcPeriodo(db, de, ate, filtro) {
    const ix = index(db);
    filtro = filtro || {};
    const meses = monthRange(de, ate).map(c => {
      const m = calcMes(db, c, ix);
      let usinas = m.usinas, ucs = m.ucs;
      if (filtro.dono_id) usinas = usinas.filter(u => u.dono_id === filtro.dono_id);
      if (filtro.usina_id) usinas = usinas.filter(u => u.usina_id === filtro.usina_id);
      if (filtro.cliente_id) ucs = ucs.filter(u => u.cliente_id === filtro.cliente_id);
      if (filtro.dono_id || filtro.usina_id) {
        const ids = new Set(usinas.flatMap(u => u.ucs.map(x => x.uc_id)));
        ucs = ucs.filter(u => ids.has(u.uc_id));
      }
      return { ...m, usinas, ucs };
    });
    return { de, ate, meses, ix };
  }

  // Desde quando há dados: primeira competência com fatura, com arrendamento no mês ou início de usina.
  function primeiraCompetencia(db) {
    const all = [...(db.faturas || []).map(f => f.competencia), ...(db.usinaMes || []).filter(u => u.arrendamento != null).map(u => u.competencia), ...(db.usinas || []).map(u => u.inicio_operacao)].filter(Boolean).sort();
    return all[0] || null;
  }

  return { calcMes, calcPeriodo, index, splitCents, addMonths, monthRange, monthLabel, monthLong, primeiraCompetencia, r2, mesmoCusto, fixoNoMes, arcaDono };
});
