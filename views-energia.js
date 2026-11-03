/* Energia e créditos: geração da usina, o que foi enviado às UCs, compensado e saldo acumulado
   — tudo dos demonstrativos SCEE da Copel (e conferido com as faturas). */
(function () {
  "use strict";
  const { fmt, esc, $, $$, kpi, badge, opts, db, nomeCliente, ucNum, M } = P3;
  const ui = { usina: "", ref: "" };
  const n = v => Number(v) || 0;

  // Um registro por UC × referência × geradora: fica o do demonstrativo emitido por último.
  function linhasScee(D) {
    const best = new Map();
    for (const s of D.scee || []) {
      const ger = s.papel === "geradora" ? "self" : String(s.geradora_conces || "");
      if (s.papel !== "geradora" && !ger) continue;
      const k = `${s.papel}|${s.uc_conces}|${s.referencia}|${ger}`;
      const cur = best.get(k);
      if (!cur || String(s.emitido_em || "") >= String(cur.emitido_em || "")) best.set(k, s);
    }
    return [...best.values()];
  }

  function dados(D, usina) {
    const gc = String(usina.uc_geradora_conces || ""), gl = String(usina.uc_geradora || "");
    const todas = linhasScee(D);
    const ger = todas.filter(s => s.papel === "geradora" && (String(s.uc_conces) === gc || String(s.uc) === gl));
    const ben = todas.filter(s => s.papel === "beneficiaria" && gc && String(s.geradora_conces) === gc);
    const refs = [...new Set([...ger.map(s => s.referencia), ...ben.map(s => s.referencia)])].sort();
    const meses = refs.map(ref => {
      const g = ger.find(s => s.referencia === ref);
      const bs = ben.filter(s => s.referencia === ref);
      const S = k => bs.reduce((s, x) => s + n(x[k]), 0);
      const m = {
        ref, temGeradora: !!g, geracao: g ? n(g.energia_injetada) : null, consumoGeradora: g ? n(g.energia_ativa) : null, usadoGeradora: g ? n(g.credito_utilizado) : null,
        saldoGeradora: g ? n(g.saldo_final) : null, enviado: S("cred_recebido"), compensado: S("credito_utilizado"), saldoUcs: S("saldo_final"), ucs: bs
      };
      m.saldoTotal = (m.saldoGeradora || 0) + m.saldoUcs;
      m.aproveitamento = m.geracao ? (m.compensado + (m.usadoGeradora || 0)) / m.geracao : null;
      return m;
    }).filter(m => m.geracao || m.enviado || m.compensado || m.saldoTotal);
    return { meses };
  }

  function render(main) {
    const D = db();
    if (!D.usinas.length) { main.innerHTML = `<div class="empty">Cadastre uma usina primeiro.</div>`; return; }
    if (!D.by.usinas.get(ui.usina)) ui.usina = D.usinas[0].id;
    const usina = D.by.usinas.get(ui.usina);
    const { meses } = dados(D, usina);
    const ult12 = meses.slice(-12);
    const ultimo = meses[meses.length - 1];
    if (!meses.some(m => m.ref === ui.ref)) ui.ref = ultimo ? ultimo.ref : "";
    const sel = meses.find(m => m.ref === ui.ref);
    const T = k => ult12.reduce((s, m) => s + n(m[k]), 0);
    const kwp = n(usina.potencia_kwp);
    const ucsVinc = D.vinculos.filter(v => v.usina_id === usina.id).map(v => D.by.ucs.get(v.uc_id)).filter(Boolean);
    const ucPorConces = new Map(D.ucs.map(u => [String(u.numero_conces), u]));
    const fatura = (uc, ref) => uc && D.faturas.find(f => f.uc_id === uc.id && f.referencia === ref);

    main.innerHTML = `
      <div class="head"><div><p class="kicker">Demonstrativos SCEE da Copel</p><h1>Energia e créditos</h1>
        <p>Quanto cada usina gerou, quanto foi para as UCs dos clientes, quanto foi compensado e quanto está parado como saldo. Os números vêm dos demonstrativos de micro/minigeração que você sobe em Faturas Copel.</p></div>
        <div class="actions"><label class="f">Usina<select id="enUsina">${opts(D.usinas.map(u => [u.id, u.nome]), ui.usina)}</select></label></div></div>
      ${!meses.length ? `<div class="empty">Nenhum demonstrativo desta usina na base. Suba o "DemonstrativoMicroMiniGeracao" da UC geradora (${esc(fmt.uc(usina.uc_geradora) || usina.uc_geradora_conces || "sem UC cadastrada")}) em Faturas Copel.</div>` : `
      <div class="kpis">
        ${kpi("Geração · últimos 12 meses", fmt.kwh(T("geracao")), kwp ? `${fmt.num(T("geracao") / kwp)} kWh/kWp · ${kwp} kWp` : `${ult12.filter(m => m.temGeradora).length} mês(es) com dado da geradora`)}
        ${kpi("Compensado nas UCs", fmt.kwh(T("compensado")), T("geracao") ? `${fmt.pct(T("compensado") / T("geracao"))} da geração` : "")}
        ${kpi("Saldo acumulado agora", fmt.kwh(ultimo.saldoTotal), `geradora ${fmt.kwh(ultimo.saldoGeradora || 0)} · UCs ${fmt.kwh(ultimo.saldoUcs)}`, "lead")}
        ${kpi("Média de geração", fmt.kwh(T("geracao") / Math.max(1, ult12.filter(m => m.temGeradora).length)), "por mês")}
      </div>
      ${ultimo.saldoTotal > (T("compensado") / Math.max(1, ult12.length)) * 2 ? `<div class="note warn" style="margin-top:12px">Há ${fmt.kwh(ultimo.saldoTotal)} de crédito parado (mais de 2 meses do que as UCs compensam). Vale revisar o rateio na Copel ou incluir mais UCs nesta usina. Créditos expiram em 60 meses.</div>` : ""}
      <div class="section"><div class="section-head"><div><h2>Mês a mês</h2><p>Clique num mês para ver o detalhe por UC.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Referência</th><th class="n">Geração</th><th class="n">Consumo da geradora</th><th class="n">Enviado às UCs</th><th class="n">Compensado nas UCs</th><th class="n">Saldo na geradora</th><th class="n">Saldo nas UCs</th><th class="n">Saldo total</th><th class="n">Aproveitamento</th></tr></thead>
        <tbody>${meses.slice().reverse().map(m => `<tr class="clickable" data-ref="${m.ref}" style="${m.ref === ui.ref ? "background:var(--panel-2)" : ""}"><td><b>${esc(fmt.mes(m.ref))}</b></td>
          <td class="n">${m.geracao != null ? fmt.kwh(m.geracao) : "—"}${kwp && m.geracao ? `<small>${fmt.num(m.geracao / kwp, 1)} kWh/kWp</small>` : ""}</td><td class="n">${m.consumoGeradora != null ? fmt.kwh(m.consumoGeradora) : "—"}</td>
          <td class="n">${fmt.kwh(m.enviado)}</td><td class="n">${fmt.kwh(m.compensado)}</td><td class="n">${m.saldoGeradora != null ? fmt.kwh(m.saldoGeradora) : "—"}</td><td class="n">${fmt.kwh(m.saldoUcs)}</td>
          <td class="n"><b>${fmt.kwh(m.saldoTotal)}</b></td><td class="n">${m.aproveitamento != null ? fmt.pct(m.aproveitamento) : "—"}</td></tr>`).join("")}</tbody></table></div></div>
      ${sel ? `<div class="section"><div class="section-head"><div><h2>Por UC · ${esc(fmt.mesLongo(sel.ref))}</h2><p>Créditos vindos desta usina. "Fatura" mostra o que a fatura da Copel compensou no mesmo mês (de todas as usinas).</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>UC</th><th>Cliente</th><th class="n">% do rateio</th><th class="n">Saldo anterior</th><th class="n">Recebido</th><th class="n">Compensado</th><th class="n">Saldo final</th><th class="n">Fatura</th></tr></thead>
        <tbody>${sel.ucs.sort((a, b) => n(b.credito_utilizado) - n(a.credito_utilizado)).map(s => { const uc = ucPorConces.get(String(s.uc_conces)); const f = fatura(uc, sel.ref); return `<tr>
          <td><b class="mono">${esc(uc ? ucNum(uc) : fmt.uc(s.uc || s.uc_conces))}</b><small>${esc(uc ? uc.descricao || "" : "UC não cadastrada")}</small></td><td>${esc(uc ? nomeCliente(uc.cliente_id) : "—")}</td>
          <td class="n">${fmt.pctN(s.percentual)}</td><td class="n">${fmt.kwh(s.saldo_anterior)}</td><td class="n">${fmt.kwh(s.cred_recebido)}</td><td class="n">${fmt.kwh(s.credito_utilizado)}</td><td class="n">${fmt.kwh(s.saldo_final)}</td>
          <td class="n">${f ? `${fmt.kwh(f.compensado_kwh)}${f.saldo_creditos_kwh != null ? `<small>saldo ${fmt.kwh(f.saldo_creditos_kwh)}</small>` : ""}` : "—"}</td></tr>`; }).join("") || `<tr><td colspan="8" class="empty">Sem UCs no demonstrativo deste mês.</td></tr>`}</tbody>
        <tfoot><tr><td colspan="3">Total</td><td class="n">${fmt.kwh(sel.ucs.reduce((s, x) => s + n(x.saldo_anterior), 0))}</td><td class="n">${fmt.kwh(sel.enviado)}</td><td class="n">${fmt.kwh(sel.compensado)}</td><td class="n">${fmt.kwh(sel.saldoUcs)}</td><td></td></tr></tfoot></table></div>
        ${ucsVinc.filter(u => !sel.ucs.some(s => String(s.uc_conces) === String(u.numero_conces))).length ? `<p class="muted" style="font-size:12.5px">UCs vinculadas a esta usina que não aparecem no demonstrativo do mês: ${ucsVinc.filter(u => !sel.ucs.some(s => String(s.uc_conces) === String(u.numero_conces))).map(u => esc(ucNum(u))).join(", ")}.</p>` : ""}</div>` : ""}`}`;
    $("#enUsina").onchange = e => { ui.usina = e.target.value; ui.ref = ""; render(main); };
    $$("[data-ref]", main).forEach(tr => tr.onclick = () => { ui.ref = tr.dataset.ref; render(main); });
  }

  P3.register("energia", { render });
})();
