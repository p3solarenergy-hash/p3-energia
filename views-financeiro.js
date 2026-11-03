/* Financeiro: o que vence, custos do mês, custos fixos e acerto com os donos. */
(function () {
  "use strict";
  const { api, fmt, esc, $, $$, kpi, badge, opts, modal, confirmar, formData, toast, db, nomeUsina, nomeDono, M } = P3;
  const F = window.P3_FINANCEIRO;
  const ui = { aba: "visao", comp: "", usina: "" };
  const hoje = () => (db().hoje || new Date().toISOString()).slice(0, 10);
  const PAGA = { p3: "P3", dono: "Dono", cliente: "Cliente" };
  const REEMB = { nao: "Sem reembolso", dono: "Dono reembolsa", cliente: "Cliente reembolsa" };
  const catOpts = Object.entries(F.CATEGORIAS);
  const usinaOpts = () => db().usinas.map(u => [u.id, u.nome]);
  const compacto = v => { const x = Number(v) || 0; return x >= 1000 ? `R$ ${fmt.num(x / 1000, 1)} mil` : `R$ ${fmt.num(x)}`; };

  function render(main) {
    if (!ui.comp) ui.comp = P3.mesAtual();
    main.innerHTML = `
      <div class="head"><div><p class="kicker">Contas e acertos</p><h1>Financeiro</h1><p>O que a P3 tem a pagar, quem paga cada custo, o que precisa ser reembolsado e o acerto com cada dono.</p></div>
        <div class="actions"><button class="btn primary" id="novoCusto">+ Novo custo</button></div></div>
      <div class="tabs">${[["visao", "Visão geral"], ["custos", "Custos do mês"], ["acerto", "Acerto com donos"], ["fixos", "Custos fixos"]].map(([k, l]) => `<button data-aba="${k}" class="${ui.aba === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <div id="finAba"></div>`;
    $$(".tabs button", main).forEach(b => b.onclick = () => { ui.aba = b.dataset.aba; render(main); });
    $("#novoCusto").onclick = () => editarCusto(null);
    const el = $("#finAba", main);
    ({ visao, custos, acerto, fixos })[ui.aba](el, main);
  }

  // ───────── Visão geral ─────────
  function visao(el) {
    const v = F.visao(db().custos, hoje());
    const max = Math.max(1, ...v.calendario.map(d => d.valor));
    const maxSem = Math.max(1, ...v.semanas.map(s => s.valor));
    const brancos = (v.calendario[0].semana + 6) % 7;
    const celula = d => {
      const forca = Math.round(18 + d.valor / max * 72);
      return `<div class="d ${d.valor ? "tem" : ""} ${d.valor && forca > 55 ? "forte" : ""} ${d.dia === hoje() ? "hoje" : ""}" style="--forca:${forca}%" title="${esc(fmt.data(d.dia))}${d.valor ? ": " + esc(fmt.brl(d.valor)) : ""}">${Number(d.dia.slice(8))}${d.valor ? `<b>${esc(compacto(d.valor))}</b>` : ""}</div>`;
    };
    const maxCat = Math.max(1, ...v.categorias.map(c => c.valor));
    el.innerHTML = `
      ${v.qtdSemData ? `<div class="note warn" style="margin-bottom:12px">${v.qtdSemData} custo(s) sem vencimento (${fmt.brl(v.semData)}) não aparecem no calendário.</div>` : ""}
      <div class="kpis">
        ${kpi("A pagar · 30 dias", fmt.brl(v.aPagar), `${v.qtdAPagar} conta(s) da P3`, "lead")}
        ${kpi("Vence esta semana", fmt.brl(v.semana), "até domingo")}
        ${kpi("Em atraso", fmt.brl(v.atrasado), v.qtdAtrasado ? `<span class="neg">${v.qtdAtrasado} conta(s) vencida(s)</span>` : "nada vencido")}
        ${kpi("A receber de volta", fmt.brl(v.aReceber), `${v.qtdAReceber} reembolso(s) pendente(s)`)}
      </div>
      <div class="section grid2">
        <div class="card"><h2>Calendário de vencimentos</h2><p class="sub">Próximos 30 dias · quanto mais escuro, mais sai do caixa da P3</p>
          <div class="cal">${["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(d => `<div class="wd">${d}</div>`).join("")}${'<div class="d vazio"></div>'.repeat(brancos)}${v.calendario.map(celula).join("")}</div></div>
        <div class="stack">
          <div class="card"><h2>Saídas por semana</h2><p class="sub">Contas da P3 em aberto</p>
            <div class="chart">${v.semanas.map(s => `<div class="col" title="${esc(fmt.data(s.de))} a ${esc(fmt.data(s.ate))}: ${esc(fmt.brl(s.valor))}"><small class="muted" style="text-align:center;font-size:11px">${s.valor ? esc(compacto(s.valor)) : ""}</small><i class="a" style="height:${Math.max(1, s.valor / maxSem * 115)}px"></i></div>`).join("")}</div>
            <div class="chart-l">${v.semanas.map(s => `<span>${esc(s.de.slice(8))}/${esc(s.de.slice(5, 7))}</span>`).join("")}</div></div>
          <div class="card"><h2>Por categoria</h2><p class="sub">Próximos 30 dias</p>
            ${v.categorias.map(c => `<div class="linha-cat"><span>${esc(F.CATEGORIAS[c.categoria] || c.categoria)}</span><b>${fmt.brl(c.valor)}</b></div><div class="barra"><i style="width:${c.valor / maxCat * 100}%"></i></div>`).join("") || `<p class="muted" style="margin:0">Nenhuma conta em aberto.</p>`}</div>
        </div>
      </div>
      <div class="section"><div class="section-head"><div><h2>Próximas contas</h2><p>Atrasadas primeiro, depois por vencimento.</p></div></div>
        ${tabelaCustos(v.proximos, "Nenhuma conta da P3 em aberto. Lance os custos em Custos do mês.")}</div>`;
    ligarTabela(el);
  }

  // ───────── Custos do mês ─────────
  function custos(el, main) {
    const D = db();
    const lista = D.custos.filter(c => c.competencia === ui.comp && (!ui.usina || c.usina_id === ui.usina)).sort((a, b) => String(a.vencimento || "9").localeCompare(String(b.vencimento || "9")));
    const fim = M.addMonths(P3.mesAtual(), 3);
    const meses = M.monthRange(M.addMonths(P3.mesAtual(), -24), fim).reverse();
    const faltam = F.gerarDoMes(D.custosFixos, D.custos, ui.comp).length;
    const S = f => lista.filter(f).reduce((s, c) => s + (Number(c.valor) || 0), 0);
    el.innerHTML = `
      <div class="inline" style="margin-bottom:12px;align-items:flex-end">
        <label class="f">Mês${P3.mesSelect("finComp", ui.comp, meses)}</label>
        <label class="f">Usina<select id="finUsina">${opts(usinaOpts(), ui.usina, "Todas")}</select></label>
        ${faltam ? `<button class="btn lime" id="gerar">Lançar ${faltam} custo(s) fixo(s) deste mês</button>` : ""}
      </div>
      <div class="kpis" style="margin-bottom:12px">
        ${kpi("Pago pela P3", fmt.brl(S(c => c.pago_por === "p3")), "")}
        ${kpi("Pago pelo dono", fmt.brl(S(c => c.pago_por === "dono")), "")}
        ${kpi("Pago pelo cliente", fmt.brl(S(c => c.pago_por === "cliente")), "")}
      </div>
      ${tabelaCustos(lista, "Nenhum custo neste mês.")}`;
    $("#finComp").onchange = e => { ui.comp = e.target.value; render(main); };
    $("#finUsina").onchange = e => { ui.usina = e.target.value; render(main); };
    if ($("#gerar")) $("#gerar").onclick = async () => {
      try { const r = await api("custos/gerar", { method: "POST", body: { competencia: ui.comp } }); toast(`${r.criados} custo(s) lançado(s).`, "ok"); await P3.refresh(); } catch (e) { toast(e.message, "bad"); }
    };
    ligarTabela(el);
  }

  function tabelaCustos(lista, vazio) {
    if (!lista.length) return `<div class="empty">${esc(vazio)}</div>`;
    const atrasado = c => F.emAberto(c) && c.vencimento && c.vencimento < hoje();
    return `<div class="table-wrap"><table><thead><tr><th>Vence</th><th>Custo</th><th>Usina</th><th>Quem paga</th><th>Reembolso</th><th class="n">Valor</th><th>Situação</th><th></th></tr></thead><tbody>
      ${lista.map(c => `<tr>
        <td style="white-space:nowrap">${fmt.data(c.vencimento)}${atrasado(c) ? `<small class="neg">atrasado</small>` : ""}</td>
        <td><b>${esc(c.descricao)}</b><small>${esc(F.CATEGORIAS[c.categoria] || c.categoria || "")}${c.fixo_id ? " · fixo" : ""}</small></td>
        <td>${c.usina_id ? esc(nomeUsina(c.usina_id)) : `<span class="muted">P3 geral</span>`}</td>
        <td>${esc(PAGA[c.pago_por] || c.pago_por)}</td>
        <td>${c.reembolso && c.reembolso !== "nao" ? `${esc(REEMB[c.reembolso])}${c.reembolso_status === "recebido" ? `<small class="pos">recebido ${fmt.data(c.reembolsado_em)}</small>` : F.reembolsoPendente(c) ? `<small class="neg">pendente</small>` : `<small>depois de pagar</small>`}` : `<span class="muted">—</span>`}</td>
        <td class="n"><b>${fmt.brl(c.valor)}</b></td>
        <td>${c.status === "pago" ? badge("Pago", "ok") + (c.pago_em ? `<small>${fmt.data(c.pago_em)}</small>` : "") : badge("A pagar", atrasado(c) ? "bad" : "warn")}</td>
        <td class="right" style="white-space:nowrap">${c.status !== "pago" ? `<button class="btn sm" data-pagar="${esc(c.id)}">Marcar pago</button>` : ""}${F.reembolsoPendente(c) ? `<button class="btn sm" data-reemb="${esc(c.id)}">Recebi o reembolso</button>` : ""}<button class="btn ghost sm" data-edc="${esc(c.id)}">Editar</button></td></tr>`).join("")}
      </tbody></table></div>`;
  }
  function ligarTabela(el) {
    const achar = id => db().custos.find(c => c.id === id);
    const gravar = async (id, dados, msg) => { try { await P3.save("custos", dados, id); toast(msg, "ok"); await P3.refresh(); } catch (e) { toast(e.message, "bad"); } };
    $$("[data-pagar]", el).forEach(b => b.onclick = () => gravar(b.dataset.pagar, { status: "pago", pago_em: hoje() }, "Marcado como pago."));
    $$("[data-reemb]", el).forEach(b => b.onclick = () => gravar(b.dataset.reemb, { reembolso_status: "recebido", reembolsado_em: hoje() }, "Reembolso registrado."));
    $$("[data-edc]", el).forEach(b => b.onclick = () => editarCusto(achar(b.dataset.edc)));
  }

  const camposPagamento = v => `
    <label class="f">Quem paga<select name="pago_por">${opts(Object.entries(PAGA).map(([k, l]) => [k, l === "P3" ? "P3 (eu pago)" : `${l} paga direto`]), v.pago_por || "p3")}</select></label>
    <label class="f">Reembolso à P3<select name="reembolso">${opts(Object.entries(REEMB), v.reembolso || "nao")}</select><small>só quando a P3 paga e depois cobra</small></label>`;
  // Reembolso não existe quando outra pessoa paga: a tela já zera para não dar erro ao salvar.
  function ligarPagamento(bg) {
    const paga = $("[name=pago_por]", bg), re = $("[name=reembolso]", bg);
    const ajustar = () => { const p3 = paga.value === "p3"; if (!p3) re.value = "nao"; re.disabled = !p3; };
    paga.onchange = ajustar; ajustar();
  }

  async function editarCusto(c) {
    const v = c || { competencia: ui.comp || P3.mesAtual(), categoria: "internet", pago_por: "p3", reembolso: "nao", status: "a_pagar", usina_id: ui.usina };
    const html = `<div class="grid-form">
      <label class="f wide">Descrição<input name="descricao" value="${esc(v.descricao || "")}" placeholder="Ex.: Internet da usina"></label>
      <label class="f">Usina<select name="usina_id">${opts(usinaOpts(), v.usina_id, "P3 geral (sem usina)")}</select></label>
      <label class="f">Categoria<select name="categoria">${opts(catOpts, v.categoria)}</select></label>
      <label class="f">Valor (R$)<input name="valor" inputmode="decimal" value="${esc(v.valor ?? "")}"></label>
      <label class="f">Mês do custo<input type="month" name="competencia" value="${esc(v.competencia || "")}"></label>
      <label class="f">Vencimento<input type="date" name="vencimento" value="${esc(v.vencimento || "")}"></label>
      ${camposPagamento(v)}
      <label class="f">Situação<select name="status">${opts([["a_pagar", "A pagar"], ["pago", "Pago"]], v.status)}</select></label>
      <label class="f">Pago em<input type="date" name="pago_em" value="${esc(v.pago_em || "")}"></label>
      <label class="f wide">Observação<textarea name="obs">${esc(v.obs || "")}</textarea></label></div>
      ${c ? `<hr class="sep"><button class="btn danger sm" id="exCusto">Excluir custo</button>` : ""}`;
    const p = modal(c ? "Editar custo" : "Novo custo", html, {
      onSave: async bg => {
        const d = formData(bg);
        if (d.status === "pago" && !d.pago_em) d.pago_em = hoje();
        await P3.save("custos", d, c && c.id);
        toast("Custo salvo.", "ok");
      }
    });
    ligarPagamento($(".modal-bg"));
    if (c) $("#exCusto").onclick = async () => {
      $(".modal-bg [data-x]").click();
      if (!await confirmar("Excluir custo", `Excluir <b>${esc(c.descricao)}</b>? O registro fica guardado na auditoria.`, "Excluir")) return;
      try { await P3.del("custos", c.id); toast("Excluído.", "ok"); await P3.refresh(); } catch (e) { toast(e.message, "bad"); }
    };
    if (await p) await P3.refresh();
  }

  // ───────── Acerto com donos ─────────
  function acerto(el, main) {
    const A = F.acertoMes(db(), ui.comp);
    const meses = M.monthRange(M.addMonths(P3.mesAtual(), -24), M.addMonths(P3.mesAtual(), 3)).reverse();
    const texto = s => s > 0 ? `<span class="pos">P3 repassa ao dono</span>` : s < 0 ? `<span class="neg">Dono paga à P3</span>` : "Sem saldo";
    el.innerHTML = `
      <div class="inline" style="margin-bottom:12px"><label class="f">Mês${P3.mesSelect("finComp", ui.comp, meses)}</label></div>
      <div class="note" style="margin-bottom:14px"><b>Saldo</b> = arrendamento recebido pela P3 − gestão P3 − reembolsos pendentes. Os custos entram depois que a P3 os paga.</div>
      ${A.donos.map(d => `<div class="card"><div class="usina-card"><div><h2>${esc(nomeDono(d.dono_id))}</h2><p class="sub">${esc(fmt.mesLongo(ui.comp))}</p></div>
          <div class="right"><b style="font-size:20px">${fmt.brl(Math.abs(d.saldo))}</b><small style="display:block">${texto(d.saldo)}</small></div></div>
        <div class="table-wrap" style="box-shadow:none"><table><thead><tr><th>Usina</th><th>Quem recebe</th><th class="n">Arrendamento</th><th class="n">Recebido pela P3</th><th class="n">Gestão P3</th><th class="n">Reembolsos</th><th class="n">Saldo</th></tr></thead><tbody>
        ${d.usinas.map(u => `<tr><td><b>${esc(u.nome)}</b>${u.custosFechamento ? `<small>custos no Fechamento: ${fmt.brl(u.custosFechamento)} (fora do saldo)</small>` : ""}${u.aindaNaoPago ? `<small>${fmt.brl(u.aindaNaoPago)} a pagar, ainda fora do saldo</small>` : ""}</td>
          <td><select data-recebe="${esc(u.usina_id)}" aria-label="Quem recebe o arrendamento">${opts([["dono", "Dono"], ["p3", "P3"]], u.recebe)}</select></td>
          <td class="n">${fmt.brl(u.arrendamento)}</td><td class="n">${fmt.brl(u.recebidoP3)}</td><td class="n">${fmt.brl(u.gestao)}</td><td class="n">${fmt.brl(u.reembolsos)}</td><td class="n"><b>${fmt.brl(Math.abs(u.saldo))}</b><small>${texto(u.saldo)}</small></td></tr>`).join("")}
        </tbody></table></div></div>`).join("") || `<div class="empty">Sem movimento em ${esc(fmt.mesLongo(ui.comp))}.</div>`}`;
    $("#finComp").onchange = e => { ui.comp = e.target.value; render(main); };
    $$("[data-recebe]", el).forEach(s => s.onchange = async () => {
      try { await P3.save("usinas", { arrendamento_recebe: s.value }, s.dataset.recebe); toast("Salvo.", "ok"); await P3.refresh(); } catch (e) { toast(e.message, "bad"); }
    });
  }

  // ───────── Custos fixos ─────────
  function fixos(el) {
    const lista = db().custosFixos;
    el.innerHTML = `
      <div class="section-head"><div><p style="margin:0" class="muted">Custos que se repetem todo mês, como internet e arrendamento. Em Custos do mês, um botão lança os do mês de uma vez.</p></div><button class="btn" id="novoFixo">+ Novo custo fixo</button></div>
      ${lista.length ? `<div class="table-wrap"><table><thead><tr><th>Custo</th><th>Usina</th><th>Quem paga</th><th>Reembolso</th><th class="n">Dia</th><th class="n">Valor</th><th>Situação</th><th></th></tr></thead><tbody>
      ${lista.map(f => `<tr><td><b>${esc(f.descricao)}</b><small>${esc(F.CATEGORIAS[f.categoria] || "")}</small></td><td>${f.usina_id ? esc(nomeUsina(f.usina_id)) : `<span class="muted">P3 geral</span>`}</td><td>${esc(PAGA[f.pago_por] || "")}</td><td>${esc(REEMB[f.reembolso || "nao"])}</td><td class="n">${esc(f.dia_vencimento)}</td><td class="n"><b>${fmt.brl(f.valor)}</b></td><td>${f.ativo === 0 ? badge("Inativo") : badge("Ativo", "ok")}</td><td class="right"><button class="btn ghost sm" data-edf="${esc(f.id)}">Editar</button></td></tr>`).join("")}
      </tbody></table></div>` : `<div class="empty">Nenhum custo fixo ainda.</div>`}`;
    $("#novoFixo").onclick = () => editarFixo(null);
    $$("[data-edf]", el).forEach(b => b.onclick = () => editarFixo(db().custosFixos.find(f => f.id === b.dataset.edf)));
  }

  async function editarFixo(f) {
    const v = f || { categoria: "internet", dia_vencimento: 10, pago_por: "p3", reembolso: "nao", ativo: 1, inicio: P3.mesAtual() };
    const html = `<div class="grid-form">
      <label class="f wide">Descrição<input name="descricao" value="${esc(v.descricao || "")}" placeholder="Ex.: Internet da usina"></label>
      <label class="f">Usina<select name="usina_id">${opts(usinaOpts(), v.usina_id, "P3 geral (sem usina)")}</select></label>
      <label class="f">Categoria<select name="categoria">${opts(catOpts, v.categoria)}</select></label>
      <label class="f">Valor por mês (R$)<input name="valor" inputmode="decimal" value="${esc(v.valor ?? "")}"></label>
      <label class="f">Dia do vencimento<input name="dia_vencimento" inputmode="numeric" value="${esc(v.dia_vencimento ?? 10)}"></label>
      ${camposPagamento(v)}
      <label class="f">A partir de<input type="month" name="inicio" value="${esc(v.inicio || "")}"></label>
      <label class="f">Até<input type="month" name="fim" value="${esc(v.fim || "")}"></label>
      <label class="f">Situação<select name="ativo">${opts([["1", "Ativo"], ["0", "Inativo"]], String(v.ativo ?? 1))}</select></label></div>
      ${f ? `<hr class="sep"><button class="btn danger sm" id="exFixo">Excluir custo fixo</button><p class="muted" style="font-size:12.5px;margin:6px 0 0">Os custos já lançados continuam nos meses deles.</p>` : ""}`;
    const p = modal(f ? "Editar custo fixo" : "Novo custo fixo", html, { onSave: async bg => { await P3.save("custos_fixos", formData(bg), f && f.id); toast("Custo fixo salvo.", "ok"); } });
    ligarPagamento($(".modal-bg"));
    if (f) $("#exFixo").onclick = async () => {
      $(".modal-bg [data-x]").click();
      if (!await confirmar("Excluir custo fixo", `Excluir <b>${esc(f.descricao)}</b>?`, "Excluir")) return;
      try { await P3.del("custos_fixos", f.id); toast("Excluído.", "ok"); await P3.refresh(); } catch (e) { toast(e.message, "bad"); }
    };
    if (await p) await P3.refresh();
  }

  P3.register("financeiro", { render });
})();
