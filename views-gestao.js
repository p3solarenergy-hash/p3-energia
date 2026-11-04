/* Painel, Fechamento do mês, Relatórios, Auditoria e Base/backups. */
(function () {
  "use strict";
  const { api, fmt, esc, $, $$, kpi, badge, opts, statusBadge, modal, confirmar, toast, chart, db, nomeUsina, nomeCliente, nomeDono, ucNum, M } = P3;
  const ui = { comp: "", relTipo: "cliente", relAlvo: "", relDe: "", relAte: "", relAnon: false, audAba: "conferencia", audFiltro: "erro" };

  // ───────── Painel ─────────
  function painel(main) {
    const D = db();
    if (!D.usinas.length) {
      main.innerHTML = `<div class="head"><div><p class="kicker">Bem-vindo</p><h1>P3 · Gestão de Usinas</h1><p>A base está vazia. Comece de um destes jeitos:</p></div></div>
        <div class="kpis">
                    <a class="card" href="#/usinas" style="text-decoration:none;color:inherit"><h2>Cadastrar a primeira usina</h2><p class="sub">Dono, UC geradora, arrendamento e % de gestão.</p></a>
          <a class="card" href="#/faturas" style="text-decoration:none;color:inherit"><h2>Subir faturas</h2><p class="sub">A leitura já cadastra as UCs novas com o titular da fatura.</p></a>
        </div>`;
      return;
    }
    const comp = ui.comp || P3.mesPadrao();
    const m = P3.calcMes(comp);
    const T = m.totais;
    const hist = P3.ultimosMeses(comp, 12).map(c => P3.calcMes(c));
    const conf = P3.state.conferencia || { resumo: { erro: 0, atencao: 0 }, achados: [] };
    const ucsAtivas = D.ucs.filter(u => !u.usina_geradora_id && u.ativa !== 0 && D.vinculos.some(v => v.uc_id === u.id));
    const comFatura = new Set(D.faturas.filter(f => f.competencia === comp).map(f => f.uc_id));
    const faltam = ucsAtivas.filter(u => !comFatura.has(u.id) && D.vinculos.some(v => v.uc_id === u.id && (() => { const us = D.by.usinas.get(v.usina_id); return us && us.inicio_operacao && comp >= us.inicio_operacao; })()));
    main.innerHTML = `
      <div class="head"><div><p class="kicker">Visão P3</p><h1>Painel</h1><p>Números de ${esc(fmt.mesLongo(comp))}, calculados das faturas da Copel lançadas.</p></div>
        <div class="actions"><label class="f">Competência${P3.mesSelect("selComp", comp)}</label></div></div>
      ${conf.resumo.erro || faltam.length ? `<div class="note ${conf.resumo.erro ? "bad" : "warn"}" style="margin-bottom:14px">${faltam.length ? `Faltam <b>${faltam.length}</b> fatura(s) de clientes em ${esc(fmt.mes(comp))}. ` : ""}${conf.resumo.erro ? `A conferência encontrou <b>${conf.resumo.erro}</b> erro(s) que mudam números. ` : ""}<a href="#/auditoria">Ver na Auditoria →</a></div>` : ""}
      <div class="kpis">
        ${kpi("Economia dos clientes", fmt.brl(T.economia), `${fmt.pct(T.economiaPct)} da conta sem usina`, "lead")}
        ${kpi("Arrendamento do mês", fmt.brl(T.arrendamento), `${m.usinas.filter(u => u.arrendamento > 0).length} usina(s)`)}
        ${kpi("Receita P3 (gestão)", fmt.brl(T.gestao), T.arrendamento ? `${fmt.pct(T.gestao / T.arrendamento)} do arrendamento` : "")}
        ${kpi("Líquido aos donos", fmt.brl(T.liquidoDonos), T.custosDono ? `custos ${fmt.brl(T.custosDono)}` : "após gestão e custos")}
        ${kpi("Energia compensada", fmt.kwh(T.compensadoKwh), `${T.faturas} fatura(s) · ${ucsAtivas.length - faltam.length}/${ucsAtivas.length} UCs`)}
      </div>
      <div class="section grid2">
        <div class="card"><h2>Últimos 12 meses</h2><p class="sub">Arrendamento cobrado × economia gerada aos clientes</p>
          ${chart(hist, [{ label: "Arrendamento", cls: "a", get: x => x.totais.arrendamento }, { label: "Economia dos clientes", cls: "b", get: x => x.totais.economia }])}</div>
        <div class="card"><h2>Pendências</h2><p class="sub">${conf.resumo.erro} erro(s) · ${conf.resumo.atencao} atenção</p>
          ${conf.achados.filter(a => a.gravidade !== "info").slice(0, 7).map(a => `<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid var(--line-2)">${badge(a.gravidade === "erro" ? "Erro" : "Atenção", a.gravidade === "erro" ? "bad" : "warn")}<span style="font-size:13px">${esc(a.texto)}</span></div>`).join("") || `<div class="note ok">Tudo conferido.</div>`}
          ${conf.achados.length > 7 ? `<p style="margin:8px 0 0"><a href="#/auditoria">ver todas (${conf.achados.length})</a></p>` : ""}</div>
      </div>
      <div class="section"><div class="section-head"><div><h2>Por usina · ${esc(fmt.mes(comp))}</h2><p>Clique numa usina para ver o detalhe e o histórico.</p></div><a class="btn" href="#/fechamento">Abrir fechamento</a></div>
        <div class="table-wrap"><table><thead><tr><th>Usina</th><th>Dono</th><th class="n">Arrendamento</th><th class="n">Gestão P3</th><th class="n">Líquido dono</th><th class="n">Faturas</th><th class="n">Energia entregue</th><th class="n">Economia clientes</th><th>Situação</th></tr></thead>
        <tbody>${m.usinas.map(u => `<tr class="clickable" data-go="#/usinas/${encodeURIComponent(u.usina_id)}"><td><b>${esc(u.usina.nome)}</b>${u.avisos.length ? `<small class="neg">${esc(u.avisos[0])}</small>` : ""}</td><td>${esc(nomeDono(u.dono_id))}</td>
          <td class="n">${fmt.brl(u.arrendamento)}</td><td class="n">${fmt.brl(u.gestao)}</td><td class="n"><b>${fmt.brl(u.liquidoDono)}</b></td>
          <td class="n">${u.ucs.filter(x => x.temFatura).length}/${u.ucs.length}</td><td class="n">${fmt.kwh(u.kwhCompensado)}</td><td class="n ${u.economiaClientes >= 0 ? "pos" : "neg"}">${u.ucs.some(x => x.temFatura) ? fmt.brl(u.economiaClientes) : "—"}</td><td>${statusBadge(u.status)}</td></tr>`).join("") || `<tr><td colspan="9" class="empty">Sem movimento neste mês.</td></tr>`}</tbody>
        <tfoot><tr><td colspan="2">Total</td><td class="n">${fmt.brl(T.arrendamento)}</td><td class="n">${fmt.brl(T.gestao)}</td><td class="n">${fmt.brl(T.liquidoDonos)}</td><td class="n">${T.faturas}</td><td class="n">${fmt.kwh(T.compensadoKwh)}</td><td class="n">${fmt.brl(m.usinas.reduce((s, u) => s + u.economiaClientes, 0))}</td><td></td></tr></tfoot></table></div></div>
      <div class="section"><div class="section-head"><div><h2>Por cliente · ${esc(fmt.mes(comp))}</h2></div></div>
        <div class="table-wrap"><table><thead><tr><th>Cliente</th><th class="n">UCs</th><th class="n">Copel sem usina</th><th class="n">Copel com usina</th><th class="n">Arrendamento</th><th class="n">Total pago</th><th class="n">Economia</th><th></th></tr></thead>
        <tbody>${porCliente(m).map(r => `<tr><td><b>${esc(r.nome)}</b>${r.parcial ? `<small class="neg">mês parcial: faltam faturas de outras UCs da mesma usina</small>` : ""}</td><td class="n">${r.n}</td><td class="n">${fmt.brl(r.sem)}</td><td class="n">${fmt.brl(r.com)}</td><td class="n">${fmt.brl(r.arr + r.ger)}</td><td class="n">${fmt.brl(r.custo)}</td><td class="n ${r.eco >= 0 ? "pos" : "neg"}"><b>${fmt.brl(r.eco)}</b><small>${fmt.pct(r.sem ? r.eco / r.sem : 0)}</small></td>
          <td class="right"><a class="btn ghost sm" href="#/relatorios/cliente/${encodeURIComponent(r.id)}/${comp}">Extrato</a></td></tr>`).join("") || `<tr><td colspan="8" class="empty">Nenhuma fatura de cliente neste mês.</td></tr>`}</tbody></table></div></div>`;
    $("#selComp").onchange = e => { ui.comp = e.target.value; painel(main); };
    $$("[data-go]", main).forEach(tr => tr.onclick = () => P3.go(tr.dataset.go));
  }
  function porCliente(m) {
    const map = new Map();
    for (const u of m.ucs) {
      if (!u.cliente_id) continue;
      const r = map.get(u.cliente_id) || { id: u.cliente_id, nome: nomeCliente(u.cliente_id), n: 0, sem: 0, com: 0, arr: 0, ger: 0, custo: 0, eco: 0 };
      r.n++; r.parcial = r.parcial || !!u.parcial; r.sem += u.semUsina; r.com += u.comUsina; r.arr += u.arrendamento; r.ger += u.geradora; r.custo += u.custoTotal; r.eco += u.economia;
      map.set(u.cliente_id, r);
    }
    return [...map.values()].sort((a, b) => b.eco - a.eco);
  }

  // ───────── Fechamento do mês ─────────
  function fechamento(main) {
    const D = db();
    const comp = ui.comp || P3.mesPadrao();
    const m = P3.calcMes(comp);
    const usinas = D.usinas.filter(u => u.status !== "inativa" || m.usinas.some(x => x.usina_id === u.id));
    main.innerHTML = `
      <div class="head"><div><p class="kicker">Arrendamento · gestão · custos</p><h1>Fechamento do mês</h1>
        <p>Para cada usina: quanto foi cobrado de arrendamento, a gestão P3, os custos do dono e a situação do pagamento. O rateio entre os clientes é automático, pelos kWh que cada UC recebeu.</p></div>
        <div class="actions"><label class="f">Competência${P3.mesSelect("selComp", comp)}</label></div></div>
      <div class="stack">${usinas.map(us => cardUsina(us, m.usinas.find(x => x.usina_id === us.id), comp)).join("") || `<div class="empty">Cadastre uma usina primeiro.</div>`}</div>`;
    $("#selComp").onchange = e => { ui.comp = e.target.value; fechamento(main); };
    $$("[data-fech]", main).forEach(b => b.onclick = () => editarFechamento(b.dataset.fech, comp));
    $$("[data-status]", main).forEach(s => s.onchange = async () => {
      try { await api("fechamento", { method: "PUT", body: { usina_id: s.dataset.status, competencia: comp, status: s.value } }); toast("Situação salva.", "ok"); await P3.refresh(); } catch (e) { toast(e.message, "bad"); }
    });
  }
  function cardUsina(us, r, comp) {
    if (!r) return `<div class="card"><div class="usina-card"><div><h2>${esc(us.nome)}</h2><p class="sub">${esc(nomeDono(us.dono_id))} · ${us.inicio_operacao ? `início em ${esc(fmt.mesLongo(us.inicio_operacao))}` : "sem início da operação definido"}</p></div>
      <div><button class="btn sm" data-fech="${esc(us.id)}">Lançar arrendamento deste mês</button></div></div><p class="muted" style="margin:0">Sem arrendamento nem faturas em ${esc(fmt.mes(comp))}.</p></div>`;
    return `<div class="card">
      <div class="usina-card"><div><h2>${esc(us.nome)}</h2><p class="sub">${esc(nomeDono(us.dono_id))} · contrato ${fmt.brl(us.arrendamento_mensal)}/mês · geradora ${esc({ cliente: "paga pelo cliente", dono: "paga pelo dono", p3: "paga pela P3" }[us.geradora_paga_por || "cliente"])}</p></div>
        <div class="inline"><select data-status="${esc(us.id)}" aria-label="Situação">${opts(Object.entries(P3.STATUS).map(([k, [l]]) => [k, l]), r.status)}</select><button class="btn sm" data-fech="${esc(us.id)}">Ajustar mês</button></div></div>
      <div class="kpis" style="margin:4px 0 12px">
        ${kpi("Arrendamento", fmt.brl(r.arrendamento), r.arrendamentoOrigem === "mes" ? "ajustado neste mês" : "contratual")}
        ${kpi("Gestão P3", fmt.brl(r.gestao), r.gestaoModo === "pct" ? fmt.pctN(r.gestaoPct) : "valor fixo")}
        ${kpi("Custos do dono", fmt.brl(r.custosDono + r.geradoraDono), r.custos.map(c => c.descricao).join(", ") || (r.geradoraDono ? "fatura da geradora" : "nenhum"))}
        ${kpi("Líquido ao dono", fmt.brl(r.liquidoDono), "", "lead")}
        ${kpi("UC geradora", r.valorGeradora ? fmt.brl(r.valorGeradora) : "—", r.geracaoKwh ? `geração ${fmt.kwh(r.geracaoKwh)}` : "")}
      </div>
      ${r.avisos.length ? `<div class="note warn" style="margin-bottom:10px">${r.avisos.map(esc).join("<br>")}</div>` : ""}
      <div class="table-wrap"><table><thead><tr><th>UC · cliente</th><th class="n">% desta usina</th><th class="n">kWh recebidos</th><th class="n">Créditos na fatura</th><th class="n">Arrendamento</th>${r.valorGeradora && r.geradoraPagaPor === "cliente" ? `<th class="n">Geradora</th>` : ""}<th>Fatura</th></tr></thead>
      <tbody>${r.ucs.map(x => { const uc = db().by.ucs.get(x.uc_id); return `<tr><td><b>${esc(ucNum(uc))}</b><small>${esc(nomeCliente(x.cliente_id))}${uc && uc.descricao ? " · " + esc(uc.descricao) : ""}</small></td><td class="n">${fmt.pctN(x.pct)}${x.pct < 100 ? `<small>${x.fontePct === "copel" ? "pelo demonstrativo Copel" : "pelo cadastro"}</small>` : ""}</td><td class="n">${fmt.kwh(x.kwh)}</td><td class="n pos">${fmt.brl(x.creditos)}</td><td class="n"><b>${fmt.brl(x.arrendamento)}</b></td>${r.valorGeradora && r.geradoraPagaPor === "cliente" ? `<td class="n">${fmt.brl(x.geradora)}</td>` : ""}<td>${x.temFatura ? badge("lançada", "ok") : badge("falta", "bad")}</td></tr>`; }).join("")}</tbody>
      <tfoot><tr><td colspan="2">Total</td><td class="n">${fmt.kwh(r.kwhCompensado)}</td><td class="n">${fmt.brl(r.creditosClientes)}</td><td class="n">${fmt.brl(r.arrendamento - r.naoAtribuido)}${r.naoAtribuido ? `<small class="neg">${fmt.brl(r.naoAtribuido)} sem cliente</small>` : ""}</td>${r.valorGeradora && r.geradoraPagaPor === "cliente" ? `<td class="n">${fmt.brl(r.valorGeradora)}</td>` : ""}<td></td></tr></tfoot></table></div>
    </div>`;
  }
  async function editarFechamento(usinaId, comp) {
    const D = db();
    const us = D.by.usinas.get(usinaId);
    const um = D.usinaMes.find(x => x.usina_id === usinaId && x.competencia === comp) || {};
    const custos = Array.isArray(um.custos) ? um.custos.slice() : [];
    const linhaCusto = (c, i) => `<div class="inline" data-c="${i}" style="margin-bottom:6px"><input placeholder="Descrição (ex.: arrendamento do terreno)" value="${esc(c.descricao || "")}" data-cd style="flex:2"><input placeholder="Valor" inputmode="decimal" value="${esc(c.valor ?? "")}" data-cv style="flex:1"><button class="btn ghost sm" data-crm>✕</button></div>`;
    const html = `<p class="muted" style="margin-top:0">${esc(us.nome)} · ${esc(fmt.mesLongo(comp))}. Deixe em branco para usar o valor do contrato da usina.</p>
      <div class="grid-form">
        <label class="f">Arrendamento cobrado (R$)<input name="arrendamento" inputmode="decimal" value="${esc(um.arrendamento ?? "")}" placeholder="${esc(fmt.num(us.arrendamento_mensal, 2))} (contrato)"><small>0 = não houve cobrança neste mês</small></label>
        <label class="f">Gestão P3<select name="gestao_modo">${opts([["", `Igual à usina (${us.gestao_modo === "valor" ? fmt.brl(us.gestao_valor) : fmt.pctN(us.gestao_pct)})`], ["pct", "Percentual"], ["valor", "Valor fixo"]], um.gestao_modo || "")}</select></label>
        <label class="f">Gestão %<input name="gestao_pct" inputmode="decimal" value="${esc(um.gestao_pct ?? "")}"></label>
        <label class="f">Gestão valor fixo (R$)<input name="gestao_valor" inputmode="decimal" value="${esc(um.gestao_valor ?? "")}"></label>
        <label class="f">Geração da usina (kWh)<input name="geracao_kwh" inputmode="decimal" value="${esc(um.geracao_kwh ?? "")}"><small>vem do demonstrativo da Copel</small></label>
        <label class="f">Situação<select name="status">${opts(Object.entries(P3.STATUS).map(([k, [l]]) => [k, l]), um.status || "aberto")}</select></label>
      </div>
      <hr class="sep"><b style="font-size:13px">Custos do dono neste mês</b><p class="muted" style="font-size:12.5px;margin:2px 0 8px">Saem do líquido do dono (manutenção, terreno, seguro…).</p>
      <div id="custos">${custos.map(linhaCusto).join("")}</div><button class="btn sm" id="addCusto">+ custo</button>
      <hr class="sep"><label class="f">Observação<textarea name="obs">${esc(um.obs || "")}</textarea></label>`;
    const p = modal("Fechamento do mês", html, {
      onSave: async bg => {
        const d = P3.formData(bg);
        const lista = $$("[data-c]", bg).map(r => ({ descricao: $("[data-cd]", r).value.trim(), valor: Number(String($("[data-cv]", r).value).replace(/\./g, "").replace(",", ".")) || 0 })).filter(c => c.descricao || c.valor);
        await api("fechamento", { method: "PUT", body: { usina_id: usinaId, competencia: comp, ...d, gestao_modo: d.gestao_modo || null, custos: lista } });
        toast("Fechamento salvo.", "ok");
      }
    });
    const bind = () => $$("[data-crm]").forEach(b => b.onclick = () => b.parentElement.remove());
    $("#addCusto").onclick = () => { $("#custos").insertAdjacentHTML("beforeend", linhaCusto({}, Date.now())); bind(); };
    bind();
    if (await p) await P3.refresh();
  }

  // ───────── Relatórios ─────────
  function relatorios(main, params) {
    const D = db();
    if (params && params[0]) { ui.relTipo = params[0]; ui.relAlvo = params[1] || ""; if (params[2]) { ui.relDe = params[2]; ui.relAte = params[2]; } }
    const comps = P3.competencias();
    if (!ui.relAte) ui.relAte = P3.mesPadrao();
    if (!ui.relDe) ui.relDe = ui.relAte;
    const alvos = ui.relTipo === "cliente" ? D.clientes.map(c => [c.id, c.nome]) : ui.relTipo === "dono" ? D.donos.map(d => [d.id, d.nome]) : [];
    if (alvos.length && !alvos.some(a => a[0] === ui.relAlvo)) ui.relAlvo = alvos[0][0];
    const fim = [P3.mesAtual(), ...comps].sort().pop();
    const ini = [comps[0] || M.addMonths(fim, -11), ui.relDe].filter(Boolean).sort()[0];
    const meses = M.monthRange(ini, fim).reverse();
    const q = () => { const o = { de: ui.relDe, ate: ui.relAte }; if (ui.relTipo === "cliente") o.cliente_id = ui.relAlvo; if (ui.relTipo === "dono") { o.dono_id = ui.relAlvo; if (ui.relAnon) o.anonimo = 1; } return o; };
    const url = () => `/relatorio/${ui.relTipo}?${new URLSearchParams(q())}`;
    main.innerHTML = `
      <div class="head"><div><p class="kicker">PDF pronto para enviar</p><h1>Relatórios</h1><p>Escolha o relatório e o período. A prévia é exatamente o que sai no PDF; ao gerar o PDF, escolha <b>Salvar como PDF</b> na janela de impressão.</p></div></div>
      <div class="split">
        <div class="card stack">
          <label class="f">Relatório<select id="rTipo">${opts([["cliente", "Extrato do cliente (economia)"], ["dono", "Extrato do dono (repasse)"], ["consolidado", "Consolidado P3"]], ui.relTipo)}</select></label>
          ${alvos.length ? `<label class="f">${ui.relTipo === "cliente" ? "Cliente" : "Dono"}<select id="rAlvo">${opts(alvos, ui.relAlvo)}</select></label>` : ""}
          <div class="inline" style="flex-wrap:nowrap"><label class="f" style="flex:1">De<select id="rDe">${meses.map(m => `<option value="${m}"${m === ui.relDe ? " selected" : ""}>${esc(fmt.mes(m))}</option>`).join("")}</select></label>
            <label class="f" style="flex:1">Até<select id="rAte">${meses.map(m => `<option value="${m}"${m === ui.relAte ? " selected" : ""}>${esc(fmt.mes(m))}</option>`).join("")}</select></label></div>
          <div class="inline"><button class="btn sm" data-per="mes">Só o mês</button><button class="btn sm" data-per="ano">No ano</button><button class="btn sm" data-per="12">12 meses</button></div>
          ${ui.relTipo === "dono" ? `<label class="inline" style="font-size:13px"><input type="checkbox" id="rAnon" ${ui.relAnon ? "checked" : ""}> Mostrar clientes só pelas iniciais</label>` : ""}
          <hr class="sep" style="margin:4px 0">
          <button class="btn primary" id="gerar">Gerar PDF</button>${ui.relTipo !== "consolidado" ? `<button class="btn" id="publicar">Publicar no portal</button>` : ""}
          
          <div id="gerados"></div>
          <hr class="sep" style="margin:4px 0">
          <p class="muted" style="font-size:12.5px;margin:0">Fim do mês: gere de uma vez os extratos de todos.</p>
          <button class="btn" id="lote">Gerar todos de ${esc(fmt.mes(ui.relAte))} (clientes e donos)</button>
          
        </div>
        <iframe class="preview" id="prev" title="Prévia do relatório" src="${esc(url())}"></iframe>
      </div>`;
    const set = (k, v) => { ui[k] = v; if (ui.relDe > ui.relAte) { if (k === "relDe") ui.relAte = v; else ui.relDe = v; } relatorios(main); };
    $("#rTipo").onchange = e => { ui.relTipo = e.target.value; ui.relAlvo = ""; relatorios(main); };
    if ($("#rAlvo")) $("#rAlvo").onchange = e => set("relAlvo", e.target.value);
    $("#rDe").onchange = e => set("relDe", e.target.value);
    $("#rAte").onchange = e => set("relAte", e.target.value);
    if ($("#rAnon")) $("#rAnon").onchange = e => set("relAnon", e.target.checked);
    $$("[data-per]", main).forEach(b => b.onclick = () => {
      const a = ui.relAte;
      ui.relDe = b.dataset.per === "mes" ? a : b.dataset.per === "ano" ? `${a.slice(0, 4)}-01` : M.addMonths(a, -11);
      relatorios(main);
    });
    $("#gerar").onclick = async () => {
      const b = $("#gerar"); b.disabled = true; b.textContent = "Gerando…";
      try { const r = await api("relatorio/pdf", { method: "POST", body: { tipo: ui.relTipo, ...q() } }); mostrarGerado([r]); window.P3_IMPRIMIR(r.caminho); }
      catch (e) { toast(e.message, "bad"); } finally { b.disabled = false; b.textContent = "Gerar PDF"; }
    };
    if ($("#publicar")) $("#publicar").onclick = async () => {
      if (!await confirmar("Publicar no portal", "Este relatório fica disponível no portal para a pessoa (se ela tiver login). Se já houver um do mesmo período, ele é substituído.", "Publicar")) return;
      try { const r = await api("publicar", { method: "POST", body: { tipo: ui.relTipo, ...q() } }); toast("Publicado: " + r.titulo, "ok"); }
      catch (e) { toast(e.message, "bad"); }
    };
    $("#lote").onclick = async () => {
      const mes = ui.relAte;
      const m = P3.calcMes(mes);
      const clientes = [...new Set(m.ucs.filter(u => u.temFatura && u.cliente_id).map(u => u.cliente_id))];
      const donos = [...new Set(m.usinas.filter(u => u.arrendamento > 0).map(u => u.dono_id))].filter(Boolean);
      const jobs = [...clientes.map(id => ({ tipo: "cliente", cliente_id: id })), ...donos.map(id => ({ tipo: "dono", dono_id: id })), { tipo: "consolidado" }];
      if (!await confirmar("Gerar relatórios do mês", `Vou preparar ${jobs.length} PDF(s) de ${esc(fmt.mesLongo(mes))}: ${clientes.length} extrato(s) de cliente, ${donos.length} de dono e o consolidado P3.`, "Gerar")) return;
      const b = $("#lote"); b.disabled = true;
      const feitos = [];
      for (const [i, j] of jobs.entries()) {
        b.textContent = `Gerando ${i + 1} de ${jobs.length}…`;
        try { feitos.push(await api("relatorio/pdf", { method: "POST", body: { ...j, de: mes, ate: mes } })); } catch (e) { toast(`${j.tipo}: ${e.message}`, "bad"); }
      }
      b.disabled = false; b.textContent = `Gerar todos de ${fmt.mes(mes)} (clientes e donos)`;
      mostrarGerado(feitos);
      toast(`${feitos.length} PDF(s) gerado(s).`, "ok");
    };
  }
  function mostrarGerado(lista) {
    const el = $("#gerados"); if (!el) return;
    el.innerHTML = `<div class="note ok" style="font-size:12.5px">${lista.map(r => `<div><a href="/api/relatorio/arquivo?caminho=${encodeURIComponent(r.caminho)}" target="_blank" rel="noopener">${esc(r.nome)}</a></div>`).join("")}</div>`;
  }

  // ───────── Auditoria ─────────
  async function auditoria(main) {
    main.innerHTML = `
      <div class="head"><div><p class="kicker">Controle</p><h1>Auditoria</h1><p>A conferência procura o que pode deixar um número errado. O histórico mostra cada alteração na base, com o valor anterior e o novo.</p></div>
        <div class="actions"><button class="btn" id="reler">Reler todos os PDFs arquivados</button></div></div>
      <div class="tabs"><button data-a="conferencia" class="${ui.audAba === "conferencia" ? "on" : ""}">Conferência</button><button data-a="historico" class="${ui.audAba === "historico" ? "on" : ""}">Histórico de alterações</button></div>
      <div id="audBody"><div class="loading">Carregando…</div></div>`;
    $$(".tabs button", main).forEach(b => b.onclick = () => { ui.audAba = b.dataset.a; auditoria(main); });
    $("#reler").onclick = async () => {
      const b = $("#reler"); b.disabled = true; b.textContent = "Relendo…";
      try {
        const r = await api("conferir-arquivo", { method: "POST", body: {} });
        await modal("Releitura dos PDFs", r.problemas.length ? `<p>${r.conferidas} fatura(s) relida(s). Diferenças:</p><ul>${r.problemas.map(p => `<li>${esc(P3.ucLabel((db().faturas.find(f => f.id === p.fatura_id) || {}).uc_id))}: ${esc(p.problema)}</li>`).join("")}</ul>` : `<div class="note ok">${r.conferidas} fatura(s) relida(s) dos PDFs originais: todos os valores gravados conferem.</div>`);
      } catch (e) { toast(e.message, "bad"); } finally { b.disabled = false; b.textContent = "Reler todos os PDFs arquivados"; }
    };
    const el = $("#audBody");
    if (ui.audAba === "historico") return historico(el);
    const c = await api("conferencia");
    if (!ui.audEscolhido) ui.audFiltro = ["erro", "atencao", "info"].find(k => c.resumo[k]) || "";
    const grupos = [["erro", "Erros", "bad"], ["atencao", "Atenção", "warn"], ["info", "Observações", "info"]];
    const lista = c.achados.filter(a => !ui.audFiltro || a.gravidade === ui.audFiltro);
    el.innerHTML = `<div class="inline" style="margin-bottom:12px">${grupos.map(([k, l, cls]) => `<button class="btn ${ui.audFiltro === k ? "primary" : ""}" data-f="${k}">${l} ${badge(c.resumo[k], cls)}</button>`).join("")}<button class="btn ${!ui.audFiltro ? "primary" : ""}" data-f="">Todos</button></div>
      <div class="card" style="padding:4px 6px">${lista.map(a => `<div class="achado">${badge(a.gravidade === "erro" ? "Erro" : a.gravidade === "atencao" ? "Atenção" : "Info", a.gravidade === "erro" ? "bad" : a.gravidade === "atencao" ? "warn" : "info")}<div>${esc(a.texto)}<small class="muted" style="display:block">${esc(a.area)}</small></div>
        <div>${a.fatura_id ? `<button class="btn ghost sm" data-fat="${esc(a.fatura_id)}">abrir fatura</button>` : a.usina_id && a.competencia ? `<a class="btn ghost sm" href="#/fechamento" data-comp="${esc(a.competencia)}">fechamento</a>` : a.usina_id ? `<a class="btn ghost sm" href="#/usinas/${encodeURIComponent(a.usina_id)}">usina</a>` : a.uc_id ? `<a class="btn ghost sm" href="#/clientes">UC</a>` : ""}</div></div>`).join("") || `<div class="note ok" style="margin:10px">Nada aqui.</div>`}</div>`;
    $$("[data-f]", el).forEach(b => b.onclick = () => { ui.audFiltro = b.dataset.f; ui.audEscolhido = true; auditoria(main); });
    $$("[data-fat]", el).forEach(b => b.onclick = () => P3.editarFatura(db().faturas.find(f => f.id === b.dataset.fat)));
    $$("[data-comp]", el).forEach(a => a.onclick = () => { ui.comp = a.dataset.comp; });
  }
  async function historico(el) {
    const linhas = await api("auditoria?limit=400");
    const ACAO = { criar: ["criou", "ok"], alterar: ["alterou", "info"], excluir: ["excluiu", "bad"], arquivar: ["arquivou PDF", ""], importar: ["importou", "warn"], restaurar: ["restaurou", "warn"], backup: ["backup", ""], relatorio: ["gerou PDF", ""] };
    const diff = (a, d) => {
      if (!a || !d) return "";
      const ks = Object.keys({ ...a, ...d }).filter(k => !["atualizado_em", "criado_em", "itens"].includes(k) && JSON.stringify(a[k]) !== JSON.stringify(d[k]));
      return ks.length ? `<div class="diff">${ks.map(k => `<span class="k">${esc(k)}</span><span class="a">${esc(JSON.stringify(a[k]))}</span><span class="d">${esc(JSON.stringify(d[k]))}</span>`).join("")}</div>` : "";
    };
    el.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>O quê</th></tr></thead><tbody>
      ${linhas.map(l => { const [t, k] = ACAO[l.acao] || [l.acao, ""]; return `<tr><td style="white-space:nowrap">${fmt.dataHora(l.em)}</td><td>${esc(l.usuario || "")}</td><td>${badge(t, k)}<small>${esc(l.tabela || "")}</small></td><td>${esc(l.resumo || "")}${l.acao === "alterar" ? diff(l.antes, l.depois) : ""}</td></tr>`; }).join("")}
      </tbody></table></div><p class="muted" style="font-size:12.5px">Mostrando as 400 alterações mais recentes. Nada é apagado deste histórico.</p>`;
  }

  // ───────── Base e backups ─────────
  async function sistema(main) {
    const [bks, info] = await Promise.all([api("backups"), api("info")]);
    const D = db();
    main.innerHTML = `
      <div class="head"><div><p class="kicker">Tudo salvo na nuvem</p><h1>Base e backups</h1>
        <p>A base fica guardada na nuvem. A cada 6 horas de uso é feita uma cópia automática; antes de restaurar também.</p></div>
        <div class="actions"><button class="btn primary" id="bkNow">Fazer backup agora</button></div></div>
      <div class="grid2">
        <div class="card"><h2>Backups</h2><p class="sub">${bks.length} cópia(s). Restaurar troca a base inteira pela cópia (a base atual é guardada antes).</p>
          <div class="table-wrap" style="max-height:420px;overflow:auto;box-shadow:none"><table><thead><tr><th>Cópia</th><th class="n">Tamanho</th><th></th></tr></thead><tbody>
          ${bks.map(b => `<tr><td class="mono">${esc(b.nome)}</td><td class="n">${fmt.num(b.tamanho / 1024)} KB</td><td class="right"><button class="btn ghost sm" data-rest="${esc(b.nome)}">Restaurar</button></td></tr>`).join("") || `<tr><td colspan="3" class="empty">Nenhum backup ainda.</td></tr>`}
          </tbody></table></div></div>
        <div class="stack">
                    <div class="card"><h2>Quem está usando</h2><p class="sub">Nome que aparece na auditoria.</p>
            <div class="inline"><input id="usuario" value="${esc(D.config.usuario || "")}" placeholder="Seu nome"><button class="btn" id="salvarUsuario">Salvar</button></div></div>
          <div class="card"><h2>Números da base</h2><p class="sub">${D.donos.length} donos · ${D.usinas.length} usinas · ${D.clientes.length} clientes · ${D.ucs.length} UCs · ${D.faturas.length} faturas (${D.faturas.filter(f => f.origem === "pdf").length} com PDF) · ${D.documentos.length} PDFs arquivados</p>
            <p class="sub" style="margin:0">PDF dos relatórios: pela impressão do navegador.</p></div>
        </div>
      </div>`;
    $("#bkNow").onclick = async () => { try { const r = await api("backups", { method: "POST", body: {} }); toast(`Backup criado: ${r.nome}`, "ok"); sistema(main); } catch (e) { toast(e.message, "bad"); } };
    $$("[data-rest]", main).forEach(b => b.onclick = async () => {
      if (!await confirmar("Restaurar backup", `A base vai voltar a ser a cópia <b>${esc(b.dataset.rest)}</b>. A base de agora é guardada num backup antes, então dá para desfazer.`, "Restaurar")) return;
      try { const r = await api("backups/restaurar", { method: "POST", body: { nome: b.dataset.rest } }); toast(`Restaurado. A base anterior ficou em ${r.anterior}.`, "ok"); await P3.refresh(); } catch (e) { toast(e.message, "bad"); }
    });
    $("#salvarUsuario").onclick = async () => { try { await api("config", { method: "PUT", body: { usuario: $("#usuario").value.trim() } }); toast("Salvo.", "ok"); await P3.load(); } catch (e) { toast(e.message, "bad"); } };
  }

  P3.register("painel", { render: painel });
  P3.register("fechamento", { render: fechamento });
  P3.register("relatorios", { render: relatorios });
  P3.register("auditoria", { render: auditoria });
  P3.register("sistema", { render: sistema });
})();
