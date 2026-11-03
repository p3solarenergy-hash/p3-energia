/* Cadastros: usinas (lista e detalhe), clientes e UCs, donos. */
(function () {
  "use strict";
  const { api, fmt, esc, $, $$, kpi, badge, opts, statusBadge, modal, confirmar, formData, toast, db, nomeUsina, nomeCliente, nomeDono, ucNum, M } = P3;

  async function salvarEAtualizar(tabela, dados, id, msg) {
    const r = await P3.save(tabela, dados, id);
    toast(msg || "Salvo.", "ok");
    return r;
  }
  async function excluir(tabela, id, nome) {
    if (!await confirmar("Excluir", `Excluir <b>${esc(nome)}</b>? O registro completo fica guardado na auditoria.`, "Excluir")) return false;
    try { await P3.del(tabela, id); toast("Excluído.", "ok"); await P3.refresh(); return true; } catch (e) { toast(e.message, "bad"); return false; }
  }

  // ───────── Usinas ─────────
  function usinas(main, params) {
    if (params && params[0]) return usinaDetalhe(main, params[0]);
    const D = db();
    const comp = P3.mesPadrao();
    const m = P3.calcMes(comp);
    main.innerHTML = `
      <div class="head"><div><p class="kicker">Cadastro</p><h1>Usinas</h1><p>Cada usina tem um dono, uma UC geradora e o arrendamento combinado. Os clientes recebem os créditos pelas UCs vinculadas.</p></div>
        <div class="actions"><button class="btn primary" id="nova">+ Nova usina</button></div></div>
      ${D.usinas.length ? `<div class="table-wrap"><table><thead><tr><th>Usina</th><th>Dono</th><th>UC geradora</th><th class="n">Arrendamento</th><th class="n">Gestão P3</th><th class="n">UCs</th><th>Início</th><th>Situação</th><th class="n">Líquido dono · ${esc(fmt.mes(comp))}</th></tr></thead>
        <tbody>${D.usinas.map(u => { const r = m.usinas.find(x => x.usina_id === u.id); return `<tr class="clickable" data-go="${esc(u.id)}"><td><b>${esc(u.nome)}</b><small>${u.potencia_kwp ? fmt.num(u.potencia_kwp, 2) + " kWp" : ""}${u.cidade ? " · " + esc(u.cidade) : ""}</small></td><td>${esc(nomeDono(u.dono_id))}</td>
          <td class="mono">${esc(fmt.uc(u.uc_geradora) || "—")}<small>${esc(u.uc_geradora_conces || "")}</small></td><td class="n">${fmt.brl(u.arrendamento_mensal)}</td><td class="n">${u.gestao_modo === "valor" ? fmt.brl(u.gestao_valor) : fmt.pctN(u.gestao_pct)}</td>
          <td class="n">${D.vinculos.filter(v => v.usina_id === u.id).length}</td><td>${esc(u.inicio_operacao ? fmt.mes(u.inicio_operacao) : "—")}</td><td>${badge(u.status === "inativa" ? "Inativa" : "Ativa", u.status === "inativa" ? "" : "ok")}</td><td class="n">${r ? fmt.brl(r.liquidoDono) : "—"}</td></tr>`; }).join("")}</tbody></table></div>`
        : `<div class="empty">Nenhuma usina cadastrada.</div>`}`;
    $("#nova").onclick = () => editarUsina(null);
    $$("[data-go]", main).forEach(tr => tr.onclick = () => P3.go(`#/usinas/${encodeURIComponent(tr.dataset.go)}`));
  }

  async function editarUsina(u) {
    const D = db();
    if (!D.donos.length) { toast("Cadastre o dono antes da usina.", "bad"); return P3.go("#/donos"); }
    const v = u || { gestao_modo: "pct", gestao_pct: 10, rateio_modo: "kwh", geradora_paga_por: "cliente", status: "ativa", inicio_operacao: P3.mesAtual() };
    const html = `<div class="grid-form">
      <label class="f">Nome da usina<input name="nome" value="${esc(v.nome || "")}" required></label>
      <label class="f">Dono<select name="dono_id">${opts(D.donos.map(d => [d.id, d.nome]), v.dono_id, "Escolha…")}</select></label>
      <label class="f">UC geradora (nº longo)<input name="uc_geradora" value="${esc(fmt.uc(v.uc_geradora) || "")}" placeholder="000265822603174"></label>
      <label class="f">UC geradora (nº curto / conces.)<input name="uc_geradora_conces" value="${esc(v.uc_geradora_conces || "")}" placeholder="80043259"><small>é o que aparece em "Geradora: UC …" nas faturas</small></label>
      <label class="f">Potência (kWp)<input name="potencia_kwp" inputmode="decimal" value="${esc(v.potencia_kwp ?? "")}"></label>
      <label class="f">Cidade<input name="cidade" value="${esc(v.cidade || "")}"></label>
      <label class="f">Valor investido (R$)<input name="valor_investido" inputmode="decimal" value="${esc(v.valor_investido ?? "")}"></label>
      <label class="f">Arrendamento mensal (R$)<input name="arrendamento_mensal" inputmode="decimal" value="${esc(v.arrendamento_mensal ?? "")}"></label>
      <label class="f">Gestão P3<select name="gestao_modo">${opts([["pct", "Percentual do arrendamento"], ["valor", "Valor fixo por mês"]], v.gestao_modo)}</select></label>
      <label class="f">Gestão %<input name="gestao_pct" inputmode="decimal" value="${esc(v.gestao_pct ?? "")}"></label>
      <label class="f">Gestão valor fixo (R$)<input name="gestao_valor" inputmode="decimal" value="${esc(v.gestao_valor ?? "")}"></label>
      <label class="f">Rateio do arrendamento<select name="rateio_modo">${opts([["kwh", "Pelos kWh que cada UC recebeu"], ["percentual", "Pelo % do vínculo"]], v.rateio_modo)}</select></label>
      <label class="f">Fatura da UC geradora<select name="geradora_paga_por">${opts([["cliente", "Paga pelo cliente (entra no custo dele)"], ["dono", "Paga pelo dono (sai do líquido)"], ["p3", "Paga pela P3"]], v.geradora_paga_por)}</select></label>
      <label class="f">Quem recebe o arrendamento<select name="arrendamento_recebe">${opts([["dono", "Direto o dono"], ["p3", "A P3 (depois repassa ao dono)"]], v.arrendamento_recebe || "dono")}</select></label>
      <label class="f">Início da operação<input type="month" name="inicio_operacao" value="${esc(v.inicio_operacao || "")}"><small>a partir daqui o arrendamento contratual entra todo mês</small></label>
      <label class="f">Fim da operação<input type="month" name="fim_operacao" value="${esc(v.fim_operacao || "")}"></label>
      <label class="f">Situação<select name="status">${opts([["ativa", "Ativa"], ["inativa", "Inativa"]], v.status)}</select></label>
      <label class="f wide">Observação<textarea name="obs">${esc(v.obs || "")}</textarea></label></div>`;
    const r = await modal(u ? `Editar ${u.nome}` : "Nova usina", html, { wide: true, onSave: async bg => salvarEAtualizar("usinas", formData(bg), u && u.id, "Usina salva.") });
    if (r) { await P3.load(); P3.go(`#/usinas/${encodeURIComponent(r.id || u.id)}`); }
  }

  function usinaDetalhe(main, id) {
    const D = db();
    const u = D.by.usinas.get(id);
    if (!u) { main.innerHTML = `<div class="empty">Usina não encontrada. <a href="#/usinas">Voltar</a></div>`; return; }
    const fim = P3.mesPadrao();
    const ini = [u.inicio_operacao, ...D.faturas.map(f => f.competencia)].filter(Boolean).sort()[0] || M.addMonths(fim, -11);
    const meses = M.monthRange(ini < M.addMonths(fim, -23) ? M.addMonths(fim, -23) : ini, fim);
    const ix = M.index(D);
    const hist = meses.map(c => M.calcMes(D, c, ix).usinas.find(x => x.usina_id === id)).filter(Boolean);
    const S = k => hist.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    const inv = Number(u.valor_investido) || 0;
    const nOp = hist.filter(r => r.arrendamento > 0).length;
    const vincs = D.vinculos.filter(v => v.usina_id === id);
    const geradora = D.ucs.filter(x => x.usina_geradora_id === id);
    main.innerHTML = `
      <div class="head"><div><p class="kicker"><a href="#/usinas">Usinas</a> ›</p><h1>${esc(u.nome)}</h1><p>${esc(nomeDono(u.dono_id))} · UC geradora ${esc(fmt.uc(u.uc_geradora) || u.uc_geradora_conces || "—")} · contrato ${fmt.brl(u.arrendamento_mensal)}/mês · gestão ${u.gestao_modo === "valor" ? fmt.brl(u.gestao_valor) : fmt.pctN(u.gestao_pct)}</p></div>
        <div class="actions"><a class="btn" href="#/relatorios/dono/${encodeURIComponent(u.dono_id || "")}">Extrato do dono</a><button class="btn" id="ed">Editar</button><button class="btn ghost danger" id="ex">Excluir</button></div></div>
      <div class="kpis">
        ${kpi("Arrendamento acumulado", fmt.brl(S("arrendamento")), `${nOp} mês(es) com arrendamento`)}
        ${kpi("Gestão P3 acumulada", fmt.brl(S("gestao")))}
        ${kpi("Líquido ao dono", fmt.brl(S("liquidoDono")), nOp ? `média ${fmt.brl(S("liquidoDono") / nOp)}/mês` : "", "lead")}
        ${kpi("Retorno sobre o investido", inv ? fmt.pct(S("liquidoDono") / inv) : "—", inv && nOp ? `~${fmt.pct(S("liquidoDono") / inv / nOp * 12)} ao ano` : "informe o valor investido")}
        ${kpi("Energia entregue", fmt.kwh(S("kwhCompensado")), S("geracaoKwh") ? `geração ${fmt.kwh(S("geracaoKwh"))}` : "")}
      </div>
      <div class="section"><div class="section-head"><div><h2>UCs que recebem desta usina</h2><p>O % é a parte dos créditos da UC que vem desta usina (100% quando só ela atende a UC).</p></div><a class="btn" href="#/clientes">Gerenciar UCs</a></div>
        <div class="table-wrap"><table><thead><tr><th>UC</th><th>Cliente</th><th class="n">%</th><th class="n">Defasagem</th><th>Situação</th></tr></thead><tbody>
        ${geradora.map(g => `<tr><td class="mono">${esc(ucNum(g))}</td><td><span class="muted">UC geradora da usina</span></td><td class="n">—</td><td class="n">—</td><td>${badge("Geradora", "info")}</td></tr>`).join("")}
        ${vincs.map(v => { const uc = D.by.ucs.get(v.uc_id) || {}; return `<tr><td><b class="mono">${esc(ucNum(uc))}</b><small>${esc(uc.descricao || "")}</small></td><td>${esc(nomeCliente(uc.cliente_id))}</td><td class="n">${fmt.pctN(v.percentual)}</td><td class="n">${uc.defasagem ? `+${uc.defasagem} mês` : "—"}</td><td>${uc.ativa === 0 ? badge("Inativa") : badge("Ativa", "ok")}</td></tr>`; }).join("") || `<tr><td colspan="5" class="empty">Nenhuma UC vinculada.</td></tr>`}
        </tbody></table></div></div>
      <div class="section"><div class="section-head"><div><h2>Histórico mês a mês</h2></div><a class="btn" href="#/fechamento">Fechamento</a></div>
        <div class="table-wrap"><table><thead><tr><th>Mês</th><th class="n">Arrendamento</th><th class="n">Gestão P3</th><th class="n">Custos</th><th class="n">Geradora</th><th class="n">Líquido dono</th><th class="n">Geração</th><th class="n">Entregue</th><th class="n">Economia clientes</th><th>Situação</th></tr></thead>
        <tbody>${hist.slice().reverse().map(r => `<tr><td><b>${esc(fmt.mes(r.competencia))}</b>${r.avisos.length ? `<small class="neg">${esc(r.avisos.join(" "))}</small>` : ""}</td><td class="n">${fmt.brl(r.arrendamento)}</td><td class="n">${fmt.brl(r.gestao)}</td><td class="n">${r.custosDono ? fmt.brl(r.custosDono) : "—"}</td><td class="n">${r.valorGeradora ? fmt.brl(r.valorGeradora) : "—"}</td><td class="n"><b>${fmt.brl(r.liquidoDono)}</b></td><td class="n">${r.geracaoKwh ? fmt.kwh(r.geracaoKwh) : "—"}</td><td class="n">${fmt.kwh(r.kwhCompensado)}</td><td class="n pos">${fmt.brl(r.economiaClientes)}</td><td>${statusBadge(r.status)}</td></tr>`).join("") || `<tr><td colspan="10" class="empty">Sem histórico.</td></tr>`}</tbody></table></div></div>`;
    $("#ed").onclick = () => editarUsina(u);
    $("#ex").onclick = async () => { if (await excluir("usinas", u.id, u.nome)) P3.go("#/usinas"); };
  }

  // ───────── Clientes e UCs ─────────
  function clientes(main) {
    const D = db();
    const comp = P3.mesPadrao();
    const m = P3.calcMes(comp);
    main.innerHTML = `
      <div class="head"><div><p class="kicker">Cadastro</p><h1>Clientes e UCs</h1><p>Clientes são quem arrenda a energia. Cada cliente tem uma ou mais UCs (contas da Copel), e cada UC recebe créditos de uma ou mais usinas.</p></div>
        <div class="actions"><button class="btn" id="novaUc">+ Nova UC</button><button class="btn primary" id="novoCli">+ Novo cliente</button></div></div>
      ${D.clientes.map(c => {
        const ucs = D.ucs.filter(u => u.cliente_id === c.id);
        const eco = m.ucs.filter(u => u.cliente_id === c.id).reduce((s, u) => s + u.economia, 0);
        return `<div class="card"><div class="usina-card"><div><h2>${esc(c.nome)}</h2><p class="sub">${esc([c.documento, c.email, c.telefone].filter(Boolean).join(" · ") || "sem documento")} · ${ucs.length} UC(s) · economia em ${esc(fmt.mes(comp))}: <b class="pos">${fmt.brl(eco)}</b></p></div>
          <div class="inline"><a class="btn sm" href="#/relatorios/cliente/${encodeURIComponent(c.id)}/${comp}">Extrato</a><button class="btn sm" data-edcli="${esc(c.id)}">Editar</button><button class="btn sm" data-novauc="${esc(c.id)}">+ UC</button></div></div>
          ${ucs.length ? `<div class="table-wrap" style="box-shadow:none"><table><thead><tr><th>UC</th><th>Apelido / endereço</th><th>Usina(s)</th><th class="n">Defasagem</th><th class="n">Faturas</th><th>Situação</th><th></th></tr></thead><tbody>
          ${ucs.map(u => `<tr><td><b class="mono">${esc(ucNum(u))}</b><small>${esc(u.numero && u.numero_conces ? u.numero_conces : "")}</small></td><td>${esc(u.descricao || "")}<small>${esc(u.endereco || "")}</small></td>
            <td>${P3.usinasDaUc(u.id).map(v => `${esc(nomeUsina(v.usina_id))}${v.percentual < 100 ? ` <span class="muted">${fmt.pctN(v.percentual)}</span>` : ""}`).join("<br>") || `<span class="neg">nenhuma</span>`}</td>
            <td class="n">${u.defasagem ? `+${u.defasagem}` : "—"}</td><td class="n">${D.faturas.filter(f => f.uc_id === u.id).length}</td><td>${u.ativa === 0 ? badge("Inativa") : badge("Ativa", "ok")}</td>
            <td class="right"><button class="btn ghost sm" data-educ="${esc(u.id)}">Editar</button></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted" style="margin:0">Nenhuma UC.</p>`}</div>`;
      }).join("") || `<div class="empty">Nenhum cliente. Eles também são criados automaticamente quando você sobe a fatura de uma UC nova.</div>`}`;
    $("#novoCli").onclick = () => editarCliente(null);
    $("#novaUc").onclick = () => editarUc(null);
    $$("[data-edcli]", main).forEach(b => b.onclick = () => editarCliente(db().by.clientes.get(b.dataset.edcli)));
    $$("[data-novauc]", main).forEach(b => b.onclick = () => editarUc(null, b.dataset.novauc));
    $$("[data-educ]", main).forEach(b => b.onclick = () => editarUc(db().by.ucs.get(b.dataset.educ)));
  }

  async function editarCliente(c) {
    const v = c || {};
    const html = `<div class="grid-form">
      <label class="f wide">Nome<input name="nome" value="${esc(v.nome || "")}"></label>
      <label class="f">CPF/CNPJ<input name="documento" value="${esc(v.documento || "")}"></label>
      <label class="f">E-mail<input name="email" value="${esc(v.email || "")}"></label>
      <label class="f">Telefone<input name="telefone" value="${esc(v.telefone || "")}"></label>
      <label class="f wide">Observação<textarea name="obs">${esc(v.obs || "")}</textarea></label></div>
      ${c ? `<hr class="sep"><button class="btn danger sm" id="exCli">Excluir cliente</button>` : ""}`;
    const p = modal(c ? `Editar ${c.nome}` : "Novo cliente", html, { onSave: async bg => salvarEAtualizar("clientes", formData(bg), c && c.id, "Cliente salvo.") });
    if (c) $("#exCli").onclick = async () => { $(".modal-bg [data-x]").click(); await excluir("clientes", c.id, c.nome); };
    if (await p) await P3.refresh();
  }

  async function editarUc(u, clienteId) {
    const D = db();
    const v = u || { cliente_id: clienteId || "", defasagem: 0, ativa: 1 };
    const vincs = u ? D.vinculos.filter(x => x.uc_id === u.id) : [];
    const linhaV = (x, i) => `<div class="inline" data-v="${i}" data-id="${esc(x.id || "")}" style="margin-bottom:6px"><select data-vu style="flex:2">${opts(D.usinas.map(s => [s.id, s.nome]), x.usina_id, "Usina…")}</select><input data-vp inputmode="decimal" value="${esc(x.percentual ?? 100)}" style="width:90px" aria-label="Percentual"><span class="muted">%</span><button class="btn ghost sm" data-vrm>✕</button></div>`;
    const html = `<div class="grid-form">
      <label class="f">Nº da UC (longo)<input name="numero" value="${esc(fmt.uc(v.numero) || "")}" placeholder="000517021303109"></label>
      <label class="f">Nº curto (UC Conces.)<input name="numero_conces" value="${esc(v.numero_conces || "")}" placeholder="97013994"></label>
      <label class="f">Cliente<select name="cliente_id">${opts(D.clientes.map(c => [c.id, c.nome]), v.cliente_id, "Escolha…")}</select></label>
      <label class="f">Apelido<input name="descricao" value="${esc(v.descricao || "")}" placeholder="Ex.: Área comum"></label>
      <label class="f wide">Endereço<input name="endereco" value="${esc(v.endereco || "")}"></label>
      <label class="f">Defasagem (meses)<input name="defasagem" inputmode="numeric" value="${esc(v.defasagem ?? 0)}"><small>0 = a fatura entra no mês da referência; 1 = entra no mês seguinte</small></label>
      <label class="f">Situação<select name="ativa">${opts([["1", "Ativa"], ["0", "Inativa"]], String(v.ativa ?? 1))}</select></label></div>
      <hr class="sep"><b style="font-size:13px">Recebe créditos de</b><p class="muted" style="font-size:12.5px;margin:2px 0 8px">Se só uma usina atende a UC, 100%. Se são duas, divida conforme o rateio cadastrado na Copel (veja o demonstrativo).</p>
      <div id="vincs">${vincs.map(linhaV).join("") || (u ? "" : linhaV({ percentual: 100 }, 0))}</div><button class="btn sm" id="addV">+ usina</button>
      ${u ? `<hr class="sep"><button class="btn danger sm" id="exUc">Excluir UC</button>` : ""}`;
    const p = modal(u ? `UC ${ucNum(u)}` : "Nova UC", html, {
      wide: true,
      onSave: async bg => {
        const d = formData(bg);
        const linhas = $$("[data-v]", bg).map(r => ({ id: r.dataset.id, usina_id: $("[data-vu]", r).value, percentual: $("[data-vp]", r).value })).filter(x => x.usina_id);
        const soma = linhas.reduce((s, x) => s + (Number(String(x.percentual).replace(",", ".")) || 0), 0);
        if (linhas.length && Math.abs(soma - 100) > 0.01) throw new Error(`Os percentuais somam ${soma}%: devem somar 100%.`);
        const salvo = await P3.save("ucs", d, u && u.id);
        // Vínculos: remove os que saíram, depois grava (zera antes para a soma não passar de 100% no meio).
        const atuais = D.vinculos.filter(x => x.uc_id === salvo.id);
        for (const a of atuais) if (!linhas.some(l => l.id === a.id)) await P3.del("vinculos", a.id);
        for (const l of linhas) if (l.id) await P3.save("vinculos", { percentual: 0.0001 }, l.id).catch(() => {});
        for (const l of linhas) {
          if (l.id) await P3.save("vinculos", { usina_id: l.usina_id, percentual: l.percentual }, l.id);
          else await P3.save("vinculos", { uc_id: salvo.id, usina_id: l.usina_id, percentual: l.percentual });
        }
        toast("UC salva.", "ok");
      }
    });
    $("#addV").onclick = () => { $("#vincs").insertAdjacentHTML("beforeend", linhaV({ percentual: 100 }, Date.now())); bindV(); };
    const bindV = () => $$("[data-vrm]").forEach(b => b.onclick = () => b.parentElement.remove());
    bindV();
    if (u) $("#exUc").onclick = async () => { $(".modal-bg [data-x]").click(); await excluir("ucs", u.id, `UC ${ucNum(u)}`); };
    if (await p) await P3.refresh();
  }

  // ───────── Donos ─────────
  function donos(main) {
    const D = db();
    const comp = P3.mesPadrao();
    const m = P3.calcMes(comp);
    main.innerHTML = `
      <div class="head"><div><p class="kicker">Cadastro</p><h1>Donos</h1><p>Quem construiu a usina com a P3 e recebe o arrendamento líquido.</p></div>
        <div class="actions"><button class="btn primary" id="novo">+ Novo dono</button></div></div>
      ${D.donos.length ? `<div class="table-wrap"><table><thead><tr><th>Dono</th><th>Contato</th><th>Usinas</th><th class="n">Líquido · ${esc(fmt.mes(comp))}</th><th></th></tr></thead><tbody>
      ${D.donos.map(d => `<tr><td><b>${esc(d.nome)}</b><small>${esc(d.documento || "")}</small></td><td>${esc([d.email, d.telefone].filter(Boolean).join(" · ") || "—")}<small>${d.pix ? "PIX " + esc(d.pix) : ""}</small></td>
        <td>${D.usinas.filter(u => u.dono_id === d.id).map(u => `<a href="#/usinas/${encodeURIComponent(u.id)}">${esc(u.nome)}</a>`).join(", ") || "—"}</td>
        <td class="n">${fmt.brl(m.usinas.filter(u => u.dono_id === d.id).reduce((s, u) => s + u.liquidoDono, 0))}</td>
        <td class="right" style="white-space:nowrap"><a class="btn ghost sm" href="#/relatorios/dono/${encodeURIComponent(d.id)}/${comp}">Extrato</a><button class="btn ghost sm" data-ed="${esc(d.id)}">Editar</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Nenhum dono cadastrado.</div>`}`;
    $("#novo").onclick = () => editarDono(null);
    $$("[data-ed]", main).forEach(b => b.onclick = () => editarDono(db().by.donos.get(b.dataset.ed)));
  }
  async function editarDono(d) {
    const v = d || {};
    const html = `<div class="grid-form">
      <label class="f wide">Nome<input name="nome" value="${esc(v.nome || "")}"></label>
      <label class="f">CPF/CNPJ<input name="documento" value="${esc(v.documento || "")}"></label>
      <label class="f">PIX para repasse<input name="pix" value="${esc(v.pix || "")}"></label>
      <label class="f">E-mail<input name="email" value="${esc(v.email || "")}"></label>
      <label class="f">Telefone<input name="telefone" value="${esc(v.telefone || "")}"></label>
      <label class="f wide">Observação<textarea name="obs">${esc(v.obs || "")}</textarea></label></div>
      ${d ? `<hr class="sep"><button class="btn danger sm" id="exDono">Excluir dono</button>` : ""}`;
    const p = modal(d ? `Editar ${d.nome}` : "Novo dono", html, { onSave: async bg => salvarEAtualizar("donos", formData(bg), d && d.id, "Dono salvo.") });
    if (d) $("#exDono").onclick = async () => { $(".modal-bg [data-x]").click(); await excluir("donos", d.id, d.nome); };
    if (await p) await P3.refresh();
  }

  P3.register("usinas", { render: usinas });
  P3.register("clientes", { render: clientes });
  P3.register("donos", { render: donos });
})();
