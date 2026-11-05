/*
  Financeiro — contas puras: o que vence, o que a P3 tem a receber de volta e o acerto com cada dono.

  Custo: quem paga (P3, dono ou cliente) e, se a P3 pagou, quem reembolsa (ninguém, dono ou cliente).
  Reembolso só conta depois que a P3 pagou o custo.

  Acerto P3 × dono, por usina no mês:
    arrendamento recebido pela P3  = arrendamento do mês, se a usina recebe pela P3; senão 0
    saldo                          = recebido pela P3 − gestão P3 − reembolsos pendentes do dono
    saldo positivo: a P3 repassa ao dono. Negativo: o dono paga à P3.
  Os custos do Fechamento do mês não entram no saldo: aparecem à parte, para não contar duas vezes.
*/
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./motor"));
  else root.P3_FINANCEIRO = factory(root.P3_MOTOR);
})(typeof self !== "undefined" ? self : this, function (motor) {
  "use strict";
  const n = v => Number(v) || 0;
  const r2 = motor.r2;
  const soma = (arr, f) => r2(arr.reduce((s, x) => s + n(f(x)), 0));
  const CATEGORIAS = { arrendamento: "Arrendamento", internet: "Internet", geradora: "Fatura da UC geradora", manutencao: "Manutenção", seguro: "Seguro", terreno: "Terreno", outro: "Outro" };

  const diaIso = d => d.toISOString().slice(0, 10);
  const somaDias = (iso, k) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + k); return diaIso(d); };
  const diaSemana = iso => new Date(`${iso}T00:00:00Z`).getUTCDay();
  // Vencimento no mês: dia 31 em mês curto cai no último dia.
  function vencimentoDe(comp, dia) {
    const [y, m] = comp.split("-").map(Number);
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${comp}-${String(Math.min(n(dia) || 10, ultimo)).padStart(2, "0")}`;
  }

  // Custos fixos que ainda faltam lançar no mês. Rodar de novo não duplica, nem quando o custo já foi lançado à mão
  // (mesma usina e mesma descrição).
  function gerarDoMes(fixos, custos, comp) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(comp || ""))) throw new Error("Competência deve ser AAAA-MM.");
    const doMes = (custos || []).filter(c => c.competencia === comp);
    return (fixos || []).filter(f => motor.fixoNoMes(f, comp) && !doMes.some(c => motor.mesmoCusto(c, f))).map(f => ({
      usina_id: f.usina_id || null, competencia: comp, descricao: f.descricao, categoria: f.categoria || "outro", valor: n(f.valor),
      vencimento: vencimentoDe(comp, f.dia_vencimento), pago_por: f.pago_por || "p3", reembolso: f.reembolso || "nao", status: "a_pagar", fixo_id: f.id
    }));
  }

  // Previsão: o que os custos fixos vão gerar nos próximos meses e ainda não foi lançado (não é gravado).
  function previstos(fixos, custos, de, meses) {
    const out = [];
    for (let i = 0; i < (meses || 1); i++) {
      const comp = motor.addMonths(de, i);
      for (const c of gerarDoMes(fixos, custos, comp)) out.push({ ...c, id: `prev_${c.fixo_id}_${comp}`, status: "previsto", previsto: true });
    }
    return out;
  }

  // Projeção mês a mês: arrendamento contratado das usinas ativas, gestão da P3 e custos (lançados + previstos),
  // separados por quem arca no fim (P3, dono ou cliente).
  function previsao(db, de, meses) {
    meses = meses || 6;
    const prev = previstos(db.custosFixos, db.custos, de, meses);
    const arca = c => motor.arcaDono(c) ? "dono" : (c.pago_por === "cliente" ? "cliente" : "p3");
    const out = [];
    for (let i = 0; i < meses; i++) {
      const comp = motor.addMonths(de, i);
      const lista = (db.custos || []).filter(c => c.competencia === comp).concat(prev.filter(c => c.competencia === comp));
      const ativas = (db.usinas || []).filter(u => u.status !== "inativa" && (!u.inicio_operacao || comp >= u.inicio_operacao) && (!u.fim_operacao || comp <= u.fim_operacao));
      const gestao = soma(ativas, u => u.gestao_modo === "valor" ? u.gestao_valor : n(u.arrendamento_mensal) * n(u.gestao_pct) / 100);
      const custoP3 = soma(lista.filter(c => arca(c) === "p3"), c => c.valor);
      out.push({
        competencia: comp, arrendamento: soma(ativas, u => u.arrendamento_mensal), gestao, custoP3,
        custoDono: soma(lista.filter(c => arca(c) === "dono"), c => c.valor),
        custoCliente: soma(lista.filter(c => arca(c) === "cliente"), c => c.valor),
        saiCaixaP3: soma(lista.filter(daP3), c => c.valor),
        lancado: soma(lista.filter(c => !c.previsto), c => c.valor), previsto: soma(lista.filter(c => c.previsto), c => c.valor),
        resultadoP3: r2(gestao - custoP3)
      });
    }
    return out;
  }

  const daP3 = c => (c.pago_por || "p3") === "p3";
  const emAberto = c => daP3(c) && c.status !== "pago";
  const reembolsoPendente = c => daP3(c) && (c.reembolso || "nao") !== "nao" && c.status === "pago" && c.reembolso_status !== "recebido";

  // Painel: só o que sai do caixa da P3. Custo sem vencimento fica em "sem data" e não some da conta.
  // Com os custos fixos, a previsão dos próximos meses entra no calendário (marcada como prevista).
  function visao(custos, hoje, dias, fixos) {
    dias = dias || 30;
    if (fixos) custos = (custos || []).concat(previstos(fixos, custos, hoje.slice(0, 7), 3));
    const fim = somaDias(hoje, dias - 1), fimSemana = somaDias(hoje, (7 - diaSemana(hoje)) % 7);
    const abertos = (custos || []).filter(emAberto);
    const janela = abertos.filter(c => c.vencimento && c.vencimento >= hoje && c.vencimento <= fim);
    const atrasados = abertos.filter(c => c.vencimento && c.vencimento < hoje);
    const semData = abertos.filter(c => !c.vencimento);
    const porDia = new Map();
    for (const c of janela) porDia.set(c.vencimento, r2((porDia.get(c.vencimento) || 0) + n(c.valor)));
    const calendario = Array.from({ length: dias }, (_, i) => { const d = somaDias(hoje, i); return { dia: d, valor: porDia.get(d) || 0, semana: diaSemana(d) }; });
    const semanas = [];
    for (let i = 0; i < dias; i += 7) {
      const de = somaDias(hoje, i), ate = somaDias(hoje, Math.min(i + 6, dias - 1));
      semanas.push({ de, ate, valor: soma(janela.filter(c => c.vencimento >= de && c.vencimento <= ate), c => c.valor) });
    }
    const cats = new Map();
    for (const c of janela) cats.set(c.categoria || "outro", r2((cats.get(c.categoria || "outro") || 0) + n(c.valor)));
    const pend = (custos || []).filter(reembolsoPendente);
    return {
      aPagar: soma(janela, c => c.valor), qtdAPagar: janela.length,
      semana: soma(janela.filter(c => c.vencimento <= fimSemana), c => c.valor),
      atrasado: soma(atrasados, c => c.valor), qtdAtrasado: atrasados.length,
      semData: soma(semData, c => c.valor), qtdSemData: semData.length,
      aReceber: soma(pend, c => c.valor), qtdAReceber: pend.length,
      calendario, semanas, categorias: [...cats.entries()].map(([categoria, valor]) => ({ categoria, valor })).sort((a, b) => b.valor - a.valor),
      proximos: [...atrasados, ...janela].sort((a, b) => a.vencimento.localeCompare(b.vencimento))
    };
  }

  // Acerto do mês, por usina e por dono. Reembolso pendente entra no mês do custo.
  function acertoMes(db, comp) {
    const m = motor.calcMes(db, comp);
    const custos = (db.custos || []).filter(c => c.competencia === comp);
    const usinas = m.usinas.map(u => ({ u, us: u.usina })).concat(
      (db.usinas || []).filter(us => !m.usinas.some(u => u.usina_id === us.id) && custos.some(c => c.usina_id === us.id)).map(us => ({ u: null, us }))
    ).map(({ u, us }) => {
      const doDono = custos.filter(c => c.usina_id === us.id && c.reembolso === "dono" && daP3(c));
      const recebe = us.arrendamento_recebe === "p3" ? "p3" : "dono";
      const arrendamento = u ? u.arrendamento : 0, gestao = u ? u.gestao : 0;
      const recebidoP3 = recebe === "p3" ? arrendamento : 0;
      // Imposto da NF que a P3 emitiu: a P3 recolhe e desconta antes de repassar.
      const impostoNf = recebe === "p3" && u ? n(u.custoNf) : 0;
      const reembolsos = soma(doDono.filter(reembolsoPendente), c => c.valor);
      return {
        usina_id: us.id, nome: us.nome, dono_id: us.dono_id, recebe, arrendamento, gestao, recebidoP3, reembolsos,
        aindaNaoPago: soma(doDono.filter(c => c.status !== "pago"), c => c.valor), custosFechamento: u ? u.custosProprios : 0,
        impostoNf, saldo: r2(recebidoP3 - gestao - impostoNf - reembolsos), status: u ? u.status : "aberto"
      };
    });
    const donos = new Map();
    for (const l of usinas) {
      const d = donos.get(l.dono_id) || { dono_id: l.dono_id, usinas: [], saldo: 0 };
      d.usinas.push(l); d.saldo = r2(d.saldo + l.saldo);
      donos.set(l.dono_id, d);
    }
    return { competencia: comp, usinas, donos: [...donos.values()] };
  }

  return { gerarDoMes, previstos, previsao, visao, acertoMes, vencimentoDe, reembolsoPendente, emAberto, CATEGORIAS };
});
