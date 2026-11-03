/*
  Conferência dos dados — encontra o que pode deixar um número errado antes de
  ele ir para relatório. Só lê; cada achado tem gravidade, onde está e o que fazer.
    gravidade: "erro" (número sai errado), "atencao" (precisa olhar), "info".
*/
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./motor"));
  else root.P3_CONFERENCIA = factory(root.P3_MOTOR);
})(typeof self !== "undefined" ? self : this, function (motor) {
  "use strict";

  function conferir(db, hoje) {
    const achados = [];
    const add = (gravidade, area, texto, ref) => achados.push({ gravidade, area, texto, ...(ref || {}) });
    const ix = motor.index(db);
    const nomeUc = id => { const u = ix.ucs.get(id); if (!u) return id; const c = ix.clientes.get(u.cliente_id); return `UC ${u.numero || u.numero_conces}${u.descricao ? " (" + u.descricao + ")" : ""}${c ? " · " + c.nome : ""}`; };
    const nomeUsina = id => (ix.usinas.get(id) || {}).nome || id;
    const mesAtual = (hoje || new Date().toISOString()).slice(0, 7);
    const ultimoFechado = motor.addMonths(mesAtual, -1);

    // Cadastro
    for (const u of db.usinas || []) {
      if (!u.dono_id) add("erro", "cadastro", `Usina ${u.nome} sem dono.`, { usina_id: u.id });
      if (!u.inicio_operacao) add("atencao", "cadastro", `Usina ${u.nome} sem início da operação: o arrendamento contratual não entra em nenhum mês.`, { usina_id: u.id });
      if (!u.uc_geradora && !u.uc_geradora_conces) add("info", "cadastro", `Usina ${u.nome} sem a UC geradora: não dá para ligar a fatura e a geração dela.`, { usina_id: u.id });
      if (!(ix.vincPorUsina.get(u.id) || []).length && u.status !== "inativa") add("atencao", "cadastro", `Usina ${u.nome} sem nenhuma UC de cliente vinculada.`, { usina_id: u.id });
    }
    for (const uc of db.ucs || []) {
      if (uc.usina_geradora_id) continue;
      const vs = ix.vincPorUc.get(uc.id) || [];
      const soma = vs.reduce((s, v) => s + Number(v.percentual || 0), 0);
      if (!uc.cliente_id) add("erro", "cadastro", `${nomeUc(uc.id)} sem cliente.`, { uc_id: uc.id });
      if (vs.length && Math.abs(soma - 100) > 0.01) add("atencao", "cadastro", `${nomeUc(uc.id)}: vínculos somam ${soma}% (o esperado é 100%).`, { uc_id: uc.id });
    }

    // Faturas
    for (const f of db.faturas || []) {
      const avisos = Array.isArray(f.avisos) ? f.avisos : [];
      for (const a of avisos) add(/somam|Não consegui/.test(a) ? "erro" : "atencao", "fatura", `${nomeUc(f.uc_id)} · ${motor.monthLabel(f.referencia)}: ${a}`, { fatura_id: f.id, competencia: f.competencia });
      if (f.origem !== "pdf") add("info", "fatura", `${nomeUc(f.uc_id)} · ${motor.monthLabel(f.referencia)}: lançada sem PDF (${f.origem}). Suba o PDF para confirmar os números.`, { fatura_id: f.id, competencia: f.competencia });
      if (Number(f.compensado_kwh) > Number(f.consumo_kwh) && Number(f.consumo_kwh) > 0) add("atencao", "fatura", `${nomeUc(f.uc_id)} · ${motor.monthLabel(f.referencia)}: compensou mais kWh do que consumiu.`, { fatura_id: f.id });
      if (f.saldo_creditos_kwh != null && Number(f.consumo_kwh) > 0 && Number(f.saldo_creditos_kwh) > 2 * Number(f.consumo_kwh)) add("info", "creditos", `${nomeUc(f.uc_id)} · ${motor.monthLabel(f.referencia)}: saldo de ${Math.round(f.saldo_creditos_kwh)} kWh parado (mais de 2 meses de consumo). Vale rever o rateio.`, { fatura_id: f.id });
      const vs = ix.vincPorUc.get(f.uc_id) || [];
      if (f.geradora_conces && vs.length) {
        const ok = vs.some(v => { const us = ix.usinas.get(v.usina_id); return us && [us.uc_geradora, us.uc_geradora_conces].includes(String(f.geradora_conces)); });
        const conhecida = (db.usinas || []).find(us => [us.uc_geradora, us.uc_geradora_conces].includes(String(f.geradora_conces)));
        if (!ok && conhecida) add("erro", "fatura", `${nomeUc(f.uc_id)} · ${motor.monthLabel(f.referencia)}: a Copel diz que os créditos vêm da ${conhecida.nome}, mas a UC está vinculada a ${vs.map(v => nomeUsina(v.usina_id)).join(", ")}.`, { fatura_id: f.id });
      }
    }

    // Meses: faturas faltando, arrendamento sem fatura, geradora faltando, situação de cobrança.
    const de = motor.primeiraCompetencia(db);
    if (de) {
      for (const c of motor.monthRange(de, ultimoFechado)) {
        const m = motor.calcMes(db, c, ix);
        for (const u of m.usinas) {
          for (const a of u.avisos) add(/sem nenhuma fatura/.test(a) ? "erro" : /UC geradora/.test(a) ? "info" : "atencao", "mes", `${nomeUsina(u.usina_id)} · ${motor.monthLabel(c)}: ${a}`, { usina_id: u.usina_id, competencia: c });
          if (u.arrendamento > 0 && u.status === "aberto" && c < ultimoFechado) add("info", "cobranca", `${nomeUsina(u.usina_id)} · ${motor.monthLabel(c)}: arrendamento de R$ ${u.arrendamento.toFixed(2)} ainda "aberto" (não marcado como cobrado/recebido).`, { usina_id: u.usina_id, competencia: c });
          if (Math.abs(u.naoAtribuido) > 0.004 && u.ucs.some(x => x.temFatura)) add("erro", "mes", `${nomeUsina(u.usina_id)} · ${motor.monthLabel(c)}: R$ ${u.naoAtribuido.toFixed(2)} de arrendamento sem cliente para cobrar.`, { usina_id: u.usina_id, competencia: c });
        }
        // Fecho: o que os clientes pagam de arrendamento tem que ser igual ao que os donos recebem (bruto).
        const atribuido = m.usinas.reduce((s, u) => s + u.arrendamento - u.naoAtribuido, 0);
        if (Math.abs(atribuido - m.totais.arrendamentoClientes) > 0.01) add("erro", "fecho", `${motor.monthLabel(c)}: arrendamento cobrado dos clientes (${m.totais.arrendamentoClientes.toFixed(2)}) difere do bruto dos donos (${atribuido.toFixed(2)}).`, { competencia: c });
      }
    }

    // SCEE (demonstrativo da Copel) × fatura em PDF: kWh compensado = soma do crédito utilizado de todas as geradoras.
    const scee = new Map();
    for (const s of (db.scee || []).filter(s => s.papel === "beneficiaria" && s.geradora_conces)) {
      const k = `${s.uc_conces}|${s.referencia}`;
      scee.set(k, (scee.get(k) || 0) + Number(s.credito_utilizado || 0));
    }
    for (const f of db.faturas || []) {
      const uc = ix.ucs.get(f.uc_id);
      if (!uc || !uc.numero_conces || f.origem !== "pdf") continue;
      const k = `${uc.numero_conces}|${f.referencia}`;
      if (!scee.has(k)) continue;
      const util = scee.get(k);
      if (Math.abs(util - Number(f.compensado_kwh)) > 1) add("atencao", "creditos", `${nomeUc(f.uc_id)} · ${motor.monthLabel(f.referencia)}: fatura compensou ${Math.round(f.compensado_kwh)} kWh e o demonstrativo da Copel diz ${Math.round(util)} kWh.`, { fatura_id: f.id });
    }

    const ordem = { erro: 0, atencao: 1, info: 2 };
    achados.sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade] || String(b.competencia || "").localeCompare(String(a.competencia || "")));
    return {
      achados,
      resumo: { erro: achados.filter(a => a.gravidade === "erro").length, atencao: achados.filter(a => a.gravidade === "atencao").length, info: achados.filter(a => a.gravidade === "info").length }
    };
  }

  return { conferir };
});
