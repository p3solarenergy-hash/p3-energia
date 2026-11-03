/* Faturas Copel: subir vários PDFs de uma vez, conferir e lançar; lista, cobertura e lançamento manual. */
(function () {
  "use strict";
  const { api, fmt, esc, $, $$, badge, opts, modal, confirmar, formData, toast, db, nomeUsina, nomeCliente, ucNum, ucLabel, M } = P3;
  // Fila da leitura (fica na memória enquanto a tela estiver aberta).
  const ui = { fila: [], lendo: false, filtroComp: "", filtroCli: "", aba: "subir" };

  const STATUS = {
    ok: ["Pronta", "ok"], "sem-usina": ["UC sem usina", "warn"], "uc-nova": ["UC nova", "info"], repetida: ["Já lançada", ""],
    substituir: ["Já existe (diferente)", "warn"], demonstrativo: ["Demonstrativo SCEE", "info"], erro: ["Não li", "bad"], lendo: ["Lendo…", ""],
    lancada: ["Lançada", "ok"], falhou: ["Falhou", "bad"]
  };

  function render(main) {
    main.innerHTML = `
      <div class="head"><div><p class="kicker">Leitura automática</p><h1>Faturas Copel</h1>
        <p>Arraste quantos PDFs quiser (faturas de 1ª/2ª via e demonstrativos de micro/minigeração). A plataforma lê cada um, reconhece a UC, o cliente e a usina, e você confere antes de lançar.</p></div>
        <div class="actions"><button class="btn" id="btnManual">+ Lançar à mão</button></div></div>
      <div class="tabs" role="tablist">
        <button data-aba="subir" class="${ui.aba === "subir" ? "on" : ""}">Subir PDFs</button>
        <button data-aba="lista" class="${ui.aba === "lista" ? "on" : ""}">Faturas lançadas</button>
        <button data-aba="cobertura" class="${ui.aba === "cobertura" ? "on" : ""}">O que falta</button>
      </div>
      <div id="aba"></div>`;
    $$(".tabs button", main).forEach(b => b.onclick = () => { ui.aba = b.dataset.aba; render(main); });
    $("#btnManual").onclick = () => editarFatura(null);
    const el = $("#aba", main);
    if (ui.aba === "lista") return lista(el);
    if (ui.aba === "cobertura") return cobertura(el);
    subir(el);
  }

  // ───────── Subir e conferir ─────────
  function subir(el) {
    el.innerHTML = `
      <label class="drop" id="drop" tabindex="0">
        <div class="big">⇪</div><b>Solte aqui os PDFs da Copel</b>
        <p>ou clique para escolher · pode selecionar 10, 50 de uma vez</p>
        <input type="file" id="files" accept="application/pdf,.pdf" multiple hidden>
        <div class="progress" id="prog" hidden><i style="width:0"></i></div>
      </label>
      <div id="review" class="section"></div>`;
    const drop = $("#drop"), input = $("#files");
    input.onchange = () => { adicionar([...input.files]); input.value = ""; };
    drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
    ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", e => adicionar([...e.dataTransfer.files].filter(f => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name))));
    desenharFila();
  }

  async function adicionar(files) {
    if (!files.length) return toast("Nenhum PDF nesses arquivos.", "bad");
    for (const f of files) ui.fila.push({ file: f, nome: f.name, status: "lendo", incluir: false });
    desenharFila();
    if (ui.lendo) return;
    ui.lendo = true;
    // Lê 3 por vez: rápido sem travar o computador.
    const pendentes = () => ui.fila.filter(i => i.status === "lendo" && !i.emLeitura);
    const worker = async () => {
      let it;
      while ((it = pendentes()[0])) {
        it.emLeitura = true;
        try {
          const r = await api("ler-pdf", { method: "POST", body: it.file, raw: true, headers: { "X-Nome": encodeURIComponent(it.nome) } });
          Object.assign(it, r);
          if (!r.ok) it.status = "erro";
          else if (r.tipo === "demonstrativo") it.status = "demonstrativo";
          prepararItem(it);
        } catch (e) { it.status = "erro"; it.erro = e.message; }
        desenharFila();
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    ui.lendo = false;
    marcarDuplicadosNaFila();
    desenharFila();
  }

  function prepararItem(it) {
    it.incluir = ["ok", "sem-usina", "demonstrativo"].includes(it.status) || (it.status === "uc-nova");
    if (it.status === "uc-nova" && it.sugestao) {
      const s = it.sugestao;
      it.novaUc = { numero: s.numero, numero_conces: s.numero_conces, descricao: s.descricao, endereco: s.endereco, cliente_id: s.cliente_id || "", novoCliente: s.novoCliente, usina_id: s.usina_id || "", usina_geradora_id: s.usina_geradora_id || "", percentual: 100, defasagem: 0 };
      it.modoUc = s.usina_geradora_id ? "geradora" : "cliente";
    }
  }

  // Dois PDFs iguais na mesma leva (mesma UC e referência): fica só o primeiro.
  function marcarDuplicadosNaFila() {
    const vistos = new Set();
    for (const it of ui.fila) {
      if (!it.ok || it.tipo !== "fatura" || ["lancada", "falhou"].includes(it.status)) continue;
      const k = `${it.campos.uc || it.campos.ucConces}|${it.campos.referencia}`;
      if (vistos.has(k)) { it.incluir = false; it.duplicadoNaFila = true; } else vistos.add(k);
    }
  }

  function linhaFatura(it, i) {
    const f = it.campos || {};
    const [stl, stk] = STATUS[it.status] || [it.status, ""];
    const usinas = it.geradoraDe ? `Geradora · ${esc(it.geradoraDe.nome)}` : (it.usinas || []).map(u => `${esc(u.nome)}${u.percentual < 100 ? ` (${fmt.pctN(u.percentual)})` : ""}`).join(", ");
    const quem = it.cliente ? esc(it.cliente.nome) : it.geradoraDe ? "—" : it.status === "uc-nova" ? `<span class="muted">${esc(f.titular || "")}</span>` : "—";
    const podeIncluir = it.ok && !["lancada", "repetida"].includes(it.status);
    return `<tr data-i="${i}" class="${it.status === "uc-nova" ? "ucnova" : ""}">
      <td><input type="checkbox" data-inc ${it.incluir ? "checked" : ""} ${podeIncluir ? "" : "disabled"} aria-label="Incluir ${esc(it.nome)}"></td>
      <td>${badge(stl, stk)}${it.duplicadoNaFila ? `<small>repetido nesta leva</small>` : ""}${it.status === "substituir" ? `<small>já há R$ ${fmt.num(it.duplicada.total, 2)} (${esc(it.duplicada.origem)})</small>` : ""}</td>
      <td><b>${esc(fmt.uc(f.uc || f.ucConces))}</b><small title="${esc(it.nome)}">${esc(it.ucDescricao || f.endereco || it.nome)}</small></td>
      <td>${quem}<small>${usinas || (it.status === "uc-nova" ? "" : "")}</small></td>
      <td>${esc(fmt.mes(f.referencia))}${it.competencia && it.competencia !== f.referencia ? `<small>entra em ${esc(fmt.mes(it.competencia))}</small>` : ""}</td>
      <td class="n">${fmt.kwh(f.consumoKwh)}<small>${fmt.kwh(f.compensadoKwh)} comp.</small></td>
      <td class="n">${fmt.brl(f.total)}<small>sem usina ${fmt.brl(f.semUsina)}</small></td>
      <td class="n pos">${fmt.brl(f.valorCreditos)}</td>
      <td>${(it.avisos || []).length || it.alertaGeradora ? `<span class="badge warn" title="${esc([...(it.avisos || []), it.alertaGeradora].filter(Boolean).join("\n"))}">${(it.avisos || []).length + (it.alertaGeradora ? 1 : 0)} aviso(s)</span>` : ""} <button class="btn ghost sm" data-itens>itens</button></td>
    </tr>
    ${it.status === "uc-nova" && podeIncluir ? formUcNova(it, i) : ""}
    ${it.verItens ? `<tr><td></td><td colspan="8">${tabelaItens(it)}</td></tr>` : ""}`;
  }

  function tabelaItens(it) {
    const f = it.campos;
    return `<table class="itens"><thead><tr><th>Item da fatura</th><th class="n">Qtd</th><th class="n">Tarifa c/ tributos</th><th class="n">Valor</th></tr></thead>
      <tbody>${(f.itens || []).map(x => `<tr><td>${esc(x.desc)}</td><td class="n">${fmt.num(x.qtd, x.unidade === "UN" ? 0 : 0)} ${esc(x.unidade)}</td><td class="n">${fmt.num(x.tarifa, 6)}</td><td class="n ${x.valor < 0 ? "pos" : ""}">${fmt.brl(x.valor)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="3">Total da fatura${Math.abs(f.somaItens - f.total) > 0.05 ? ` <span class="badge bad">itens somam ${fmt.brl(f.somaItens)}</span>` : ""}</td><td class="n">${fmt.brl(f.total)}</td></tr></tfoot></table>
      <p class="muted" style="font-size:12px;margin:4px 0">${[f.titular, f.documento, f.classe, f.bandeiras && `Bandeiras: ${f.bandeiras}`, f.saldoCreditosKwh != null && `Saldo de créditos: ${fmt.kwh(f.saldoCreditosKwh)}`, f.geradoraConces && `Geradora: UC ${f.geradoraConces}`, f.vencimento && `Vence ${fmt.data(f.vencimento)}`].filter(Boolean).map(esc).join(" · ")}</p>
      ${(it.avisos || []).length || it.alertaGeradora ? `<div class="note warn">${[...(it.avisos || []), it.alertaGeradora].filter(Boolean).map(esc).join("<br>")}</div>` : ""}`;
  }

  function formUcNova(it, i) {
    const n = it.novaUc || {};
    const D = db();
    const cliOpts = [["", n.novoCliente && n.novoCliente.nome ? `Novo cliente: ${n.novoCliente.nome}` : "Novo cliente"], ...D.clientes.map(c => [c.id, c.nome])];
    const usOpts = D.usinas.map(u => [u.id, u.nome]);
    return `<tr class="ucnova" data-form="${i}"><td></td><td colspan="8">
      <div class="inline" style="gap:14px;margin-bottom:2px">
        <label class="inline"><input type="radio" name="modo${i}" value="cliente" ${it.modoUc !== "geradora" ? "checked" : ""} data-modo> UC de cliente (recebe créditos)</label>
        <label class="inline"><input type="radio" name="modo${i}" value="geradora" ${it.modoUc === "geradora" ? "checked" : ""} data-modo> UC geradora de uma usina</label>
      </div>
      <div class="mini-form">
        ${it.modoUc === "geradora" ? `<label class="f">Usina<select data-k="usina_geradora_id">${P3.opts(usOpts, n.usina_geradora_id, "Escolha…")}</select></label>` : `
        <label class="f">Cliente<select data-k="cliente_id">${P3.opts(cliOpts, n.cliente_id || "")}</select></label>
        ${!n.cliente_id ? `<label class="f">Nome do novo cliente<input data-k="novoNome" value="${esc((n.novoCliente || {}).nome || "")}"></label>` : ""}
        <label class="f">Recebe créditos da usina<select data-k="usina_id">${P3.opts(usOpts, n.usina_id, "Escolha…")}</select>${it.campos.geradoraConces ? `<small>A fatura diz: geradora UC ${esc(it.campos.geradoraConces)}</small>` : ""}</label>
        <label class="f">% dos créditos desta usina<input data-k="percentual" inputmode="decimal" value="${esc(n.percentual)}"></label>`}
        <label class="f">Apelido da UC<input data-k="descricao" value="${esc(n.descricao || "")}"></label>
      </div></td></tr>`;
  }

  function desenharFila() {
    const el = $("#review");
    if (!el) return;
    const fila = ui.fila;
    const prog = $("#prog");
    const lidos = fila.filter(i => i.status !== "lendo").length;
    if (prog) { prog.hidden = !fila.length || lidos === fila.length; $("i", prog).style.width = `${fila.length ? lidos / fila.length * 100 : 0}%`; }
    if (!fila.length) { el.innerHTML = ""; return; }
    const sel = fila.filter(i => i.incluir && i.ok && !["lancada", "repetida"].includes(i.status));
    const faturas = fila.filter(i => i.ok && i.tipo === "fatura");
    const demos = fila.filter(i => i.tipo === "demonstrativo");
    const erros = fila.filter(i => i.status === "erro");
    el.innerHTML = `
      <div class="section-head"><div><h2>Conferência · ${fila.length} arquivo(s)</h2>
        <p>${lidos < fila.length ? `Lendo ${lidos + 1} de ${fila.length}…` : `${faturas.length} fatura(s), ${demos.length} demonstrativo(s)${erros.length ? `, ${erros.length} sem leitura` : ""}. Desmarque o que não quiser lançar.`}</p></div>
        <div class="actions"><button class="btn ghost" id="limpar">Limpar lista</button><button class="btn primary" id="lancar" ${sel.length && lidos === fila.length ? "" : "disabled"}>Lançar ${sel.length} selecionado(s)</button></div></div>
      ${faturas.length || fila.some(i => i.status === "lendo") ? `<div class="table-wrap"><table class="review"><thead><tr><th></th><th>Situação</th><th>UC</th><th>Cliente · usina</th><th>Referência</th><th class="n">Consumo</th><th class="n">Copel</th><th class="n">Créditos da usina</th><th></th></tr></thead>
        <tbody>${fila.map((it, i) => it.tipo === "fatura" ? linhaFatura(it, i) : it.status === "lendo" ? `<tr><td></td><td>${badge("Lendo…")}</td><td colspan="7" class="muted">${esc(it.nome)}</td></tr>` : "").join("")}</tbody></table></div>` : ""}
      ${demos.length ? `<div class="section"><h2 style="font-size:15px">Demonstrativos de créditos (SCEE)</h2><div class="table-wrap"><table><thead><tr><th></th><th>Arquivo</th><th>UCs no demonstrativo</th></tr></thead><tbody>
        ${fila.map((it, i) => it.tipo !== "demonstrativo" ? "" : `<tr data-i="${i}"><td><input type="checkbox" data-inc ${it.incluir ? "checked" : ""} ${it.status === "lancada" ? "disabled" : ""}></td><td>${esc(it.nome)} ${it.status === "lancada" ? badge("Lançado", "ok") : ""}</td>
          <td>${(it.demonstrativoUcs || []).map(u => `<div>${badge(u.papel === "geradora" ? "Geradora" : "Beneficiária", u.papel === "geradora" ? "info" : "")} ${esc(fmt.uc(u.uc || u.ucConces))} · ${esc(u.nome)} ${u.usinaNome ? `→ <b>${esc(u.usinaNome)}</b>` : u.uc_id ? "" : `<span class="muted">(UC não cadastrada)</span>`} <span class="muted">· ${u.meses} meses</span></div>`).join("")}</td></tr>`).join("")}
        </tbody></table></div><p class="muted" style="font-size:12.5px">O demonstrativo guarda a geração da usina (energia injetada) e os créditos usados por UC, para conferir com as faturas.</p></div>` : ""}
      ${erros.length ? `<div class="section"><div class="note bad">${erros.map(i => `<b>${esc(i.nome)}</b>: ${esc(i.erro)}`).join("<br>")}</div></div>` : ""}`;

    $("#limpar").onclick = () => { ui.fila = ui.fila.filter(i => i.status === "lendo"); desenharFila(); };
    $("#lancar").onclick = lancar;
    $$("tr[data-i]", el).forEach(tr => {
      const it = ui.fila[Number(tr.dataset.i)];
      const cb = $("[data-inc]", tr); if (cb) cb.onchange = () => { it.incluir = cb.checked; desenharFila(); };
      const bi = $("[data-itens]", tr); if (bi) bi.onclick = () => { it.verItens = !it.verItens; desenharFila(); };
    });
    $$("tr[data-form]", el).forEach(tr => {
      const it = ui.fila[Number(tr.dataset.form)];
      $$("[data-modo]", tr).forEach(r => r.onchange = () => { it.modoUc = r.value; desenharFila(); });
      $$("[data-k]", tr).forEach(inp => inp.onchange = () => {
        const k = inp.dataset.k, v = inp.value;
        if (k === "novoNome") it.novaUc.novoCliente = { ...(it.novaUc.novoCliente || {}), nome: v };
        else it.novaUc[k] = v;
        if (k === "cliente_id") desenharFila();
      });
    });
  }

  async function lancar() {
    const sel = ui.fila.filter(i => i.incluir && i.ok && !["lancada", "repetida"].includes(i.status));
    for (const it of sel) {
      if (it.status !== "uc-nova") continue;
      const n = it.novaUc;
      if (it.modoUc === "geradora" ? !n.usina_geradora_id : (!n.cliente_id && !(n.novoCliente && n.novoCliente.nome))) return toast(`Complete o cadastro da UC ${fmt.uc(it.campos.uc || it.campos.ucConces)} (cliente/usina) antes de lançar.`, "bad");
    }
    const itens = sel.map(it => ({
      sha: it.sha, tipo: it.tipo, campos: it.campos, avisos: it.avisos, uc_id: it.uc_id || null,
      substituir: it.status === "substituir",
      novaUc: it.status === "uc-nova" ? (it.modoUc === "geradora" ? { ...it.novaUc, cliente_id: null, usina_id: null } : { ...it.novaUc, usina_geradora_id: null, cliente_id: it.novaUc.cliente_id || null }) : null
    }));
    const btn = $("#lancar"); btn.disabled = true; btn.textContent = "Lançando…";
    try {
      const r = await api("lancar", { method: "POST", body: { itens } });
      let ok = 0, falhas = 0;
      for (const res of r.resultados) {
        const it = ui.fila.find(i => i.sha === res.sha);
        if (!it) continue;
        if (res.ok) { it.status = "lancada"; it.incluir = false; ok++; } else { it.status = "falhou"; it.erro = res.erro; it.avisos = [...(it.avisos || []), res.erro]; falhas++; }
      }
      toast(`${ok} lançado(s)${falhas ? `, ${falhas} com problema` : ""}.`, falhas ? "bad" : "ok");
      await P3.load();
      // Depois de cadastrar UCs novas, as outras faturas da mesma UC na leva passam a reconhecer a UC.
      if (ui.fila.some(i => i.status === "uc-nova")) {
        for (const it of ui.fila.filter(i => i.status === "uc-nova" && i.ok)) {
          const uc = db().ucs.find(u => [u.numero, u.numero_conces].includes(it.campos.uc) || [u.numero, u.numero_conces].includes(it.campos.ucConces));
          if (uc) { it.uc_id = uc.id; it.status = "ok"; it.cliente = db().by.clientes.get(uc.cliente_id) || null; it.usinas = P3.usinasDaUc(uc.id).map(v => ({ id: v.usina_id, nome: nomeUsina(v.usina_id), percentual: v.percentual })); it.competencia = M.addMonths(it.campos.referencia, uc.defasagem || 0); }
        }
      }
    } catch (e) { toast(e.message, "bad"); }
    desenharFila();
  }

  // ───────── Lista de faturas ─────────
  function lista(el) {
    const D = db();
    const comps = P3.competencias().slice().reverse();
    if (!ui.filtroComp) ui.filtroComp = comps[0] || "";
    const fs = D.faturas.filter(f => (!ui.filtroComp || f.competencia === ui.filtroComp) && (!ui.filtroCli || (D.by.ucs.get(f.uc_id) || {}).cliente_id === ui.filtroCli))
      .sort((a, b) => (nomeCliente((D.by.ucs.get(a.uc_id) || {}).cliente_id)).localeCompare(nomeCliente((D.by.ucs.get(b.uc_id) || {}).cliente_id)));
    const T = k => fs.reduce((s, f) => s + (Number(f[k]) || 0), 0);
    el.innerHTML = `
      <div class="inline" style="margin-bottom:12px">
        <label class="f">Competência<select id="fComp">${opts([["", "Todas"], ...comps.map(c => [c, fmt.mesLongo(c)])], ui.filtroComp)}</select></label>
        <label class="f">Cliente<select id="fCli">${opts([["", "Todos"], ...D.clientes.map(c => [c.id, c.nome])], ui.filtroCli)}</select></label>
      </div>
      ${fs.length ? `<div class="table-wrap"><table><thead><tr><th>UC</th><th>Cliente</th><th>Ref. → comp.</th><th class="n">Consumo</th><th class="n">Compensado</th><th class="n">Copel (com usina)</th><th class="n">Créditos</th><th class="n">Sem usina</th><th>Origem</th><th></th></tr></thead>
        <tbody>${fs.map(f => { const uc = D.by.ucs.get(f.uc_id) || {}; return `<tr>
          <td><b>${esc(ucNum(uc))}</b><small>${esc(uc.descricao || "")}</small></td>
          <td>${uc.usina_geradora_id ? `<span class="muted">Geradora · ${esc(nomeUsina(uc.usina_geradora_id))}</span>` : esc(nomeCliente(uc.cliente_id))}</td>
          <td>${esc(fmt.mes(f.referencia))}${f.competencia !== f.referencia ? ` → ${esc(fmt.mes(f.competencia))}` : ""}<small>vence ${fmt.data(f.vencimento)}</small></td>
          <td class="n">${fmt.kwh(f.consumo_kwh)}</td><td class="n">${fmt.kwh(f.compensado_kwh)}</td>
          <td class="n">${fmt.brl(f.total)}</td><td class="n pos">${fmt.brl(f.valor_creditos)}</td><td class="n">${fmt.brl(Number(f.total) + Number(f.valor_creditos))}</td>
          <td>${f.origem === "pdf" ? badge("PDF", "ok") : badge(f.origem === "p3-importado" ? "P3 antiga" : "Manual", "warn")}${(f.avisos || []).length ? ` ${badge(`${f.avisos.length} aviso(s)`, "warn")}` : ""}</td>
          <td class="right" style="white-space:nowrap">${f.documento_id ? `<a class="btn ghost sm" href="/api/documento/${encodeURIComponent(f.documento_id)}" target="_blank" rel="noopener">PDF</a>` : ""}<button class="btn ghost sm" data-ed="${esc(f.id)}">Editar</button></td></tr>`; }).join("")}</tbody>
        <tfoot><tr><td colspan="3">${fs.length} fatura(s)</td><td class="n">${fmt.kwh(T("consumo_kwh"))}</td><td class="n">${fmt.kwh(T("compensado_kwh"))}</td><td class="n">${fmt.brl(T("total"))}</td><td class="n">${fmt.brl(T("valor_creditos"))}</td><td class="n">${fmt.brl(T("total") + T("valor_creditos"))}</td><td colspan="2"></td></tr></tfoot></table></div>`
        : `<div class="empty">Nenhuma fatura ${ui.filtroComp ? `em ${esc(fmt.mesLongo(ui.filtroComp))}` : "lançada"}. Suba os PDFs na aba "Subir PDFs".</div>`}`;
    $("#fComp").onchange = e => { ui.filtroComp = e.target.value || "-"; if (ui.filtroComp === "-") ui.filtroComp = ""; lista(el); };
    $("#fCli").onchange = e => { ui.filtroCli = e.target.value; lista(el); };
    $$("[data-ed]", el).forEach(b => b.onclick = () => editarFatura(D.faturas.find(f => f.id === b.dataset.ed)));
  }

  async function editarFatura(f) {
    const D = db();
    const ucOpts = D.ucs.map(u => [u.id, `${ucNum(u)} · ${u.usina_geradora_id ? "Geradora " + nomeUsina(u.usina_geradora_id) : nomeCliente(u.cliente_id)}${u.descricao ? " · " + u.descricao : ""}`]);
    const v = f || { referencia: P3.mesPadrao(), total: "", valor_creditos: 0, consumo_kwh: 0, compensado_kwh: 0 };
    const html = `${f && f.origem === "pdf" ? `<div class="note warn" style="margin-bottom:12px">Esta fatura veio do PDF. Só altere se a leitura estiver errada — a mudança fica na auditoria com o valor anterior.</div>` : ""}
      <div class="grid-form">
        <label class="f wide">UC<select name="uc_id">${opts(ucOpts, v.uc_id, "Escolha a UC…")}</select></label>
        <label class="f">Referência (AAAA-MM)<input name="referencia" value="${esc(v.referencia)}" placeholder="2026-09"></label>
        <label class="f">Vencimento<input type="date" name="vencimento" value="${esc(v.vencimento || "")}"></label>
        <label class="f">Total da fatura (R$)<input name="total" inputmode="decimal" value="${esc(v.total)}"></label>
        <label class="f">Créditos da usina (R$)<input name="valor_creditos" inputmode="decimal" value="${esc(v.valor_creditos)}"><small>soma das linhas "Energia injetada", em valor positivo</small></label>
        <label class="f">Consumo (kWh)<input name="consumo_kwh" inputmode="decimal" value="${esc(v.consumo_kwh)}"></label>
        <label class="f">Compensado (kWh)<input name="compensado_kwh" inputmode="decimal" value="${esc(v.compensado_kwh)}"></label>
        <label class="f wide">Observação<textarea name="obs">${esc(v.obs || "")}</textarea></label>
      </div>
      ${f ? `<hr class="sep"><button class="btn danger sm" id="excluirFat">Excluir esta fatura</button>` : ""}`;
    const p = modal(f ? "Editar fatura" : "Lançar fatura à mão", html, {
      onSave: async bg => {
        const d = formData(bg);
        if (f) await P3.save("faturas", d, f.id); else await P3.save("faturas", d);
        toast("Fatura salva.", "ok");
      }
    });
    const ex = $("#excluirFat");
    if (ex) ex.onclick = async () => {
      if (!await confirmar("Excluir fatura", "A fatura sai dos cálculos. O registro completo fica guardado na auditoria e o PDF continua arquivado.", "Excluir")) return;
      try { await P3.del("faturas", f.id); toast("Fatura excluída.", "ok"); $(".modal-bg [data-x]").click(); await P3.refresh(); } catch (e) { toast(e.message, "bad"); }
    };
    if (await p) await P3.refresh();
  }

  // ───────── Cobertura: UC × mês ─────────
  function cobertura(el) {
    const D = db();
    const fim = [P3.mesAtual(), ...P3.competencias()].sort().pop();
    const meses = P3.ultimosMeses(M.addMonths(fim, 0), 9);
    const tem = new Map(D.faturas.map(f => [`${f.uc_id}|${f.competencia}`, f]));
    const grupos = D.usinas.map(u => ({ u, ucs: D.vinculos.filter(v => v.usina_id === u.id).map(v => D.by.ucs.get(v.uc_id)).filter(Boolean), ger: D.ucs.filter(x => x.usina_geradora_id === u.id) }));
    const semUsina = D.ucs.filter(u => !u.usina_geradora_id && !D.vinculos.some(v => v.uc_id === u.id));
    const ativa = (u, m) => u.inicio_operacao && m >= u.inicio_operacao && (!u.fim_operacao || m <= u.fim_operacao);
    const cel = (uc, m, esperado) => {
      const f = tem.get(`${uc.id}|${m}`);
      if (f) return `<td class="c has" title="${esc(fmt.brl(f.total))}">✓</td>`;
      return esperado ? `<td class="c miss" title="Falta a fatura">✕</td>` : `<td class="c na">·</td>`;
    };
    el.innerHTML = `<p class="muted" style="margin-top:0">✓ fatura lançada · <span class="neg">✕</span> falta (usina em operação no mês) · competência = mês em que a fatura entra no cálculo.</p>
      <div class="table-wrap"><table class="cov"><thead><tr><th>UC</th>${meses.map(m => `<th class="c">${esc(fmt.mes(m))}</th>`).join("")}</tr></thead><tbody>
      ${grupos.map(g => `<tr class="grp"><td colspan="${meses.length + 1}">${esc(g.u.nome)} <span class="muted">· ${esc(P3.nomeDono(g.u.dono_id))}</span></td></tr>
        ${g.ger.map(uc => `<tr><td>${esc(ucNum(uc))}<small>UC geradora</small></td>${meses.map(m => cel(uc, m, ativa(g.u, m) && g.u.geradora_paga_por !== "p3")).join("")}</tr>`).join("")}
        ${g.ucs.map(uc => `<tr><td>${esc(ucNum(uc))}<small>${esc(nomeCliente(uc.cliente_id))}${uc.descricao ? " · " + esc(uc.descricao) : ""}</small></td>${meses.map(m => cel(uc, m, ativa(g.u, m) && m < P3.mesAtual())).join("")}</tr>`).join("")}`).join("")}
      ${semUsina.length ? `<tr class="grp"><td colspan="${meses.length + 1}">UCs sem usina vinculada</td></tr>${semUsina.map(uc => `<tr><td>${esc(ucNum(uc))}<small>${esc(nomeCliente(uc.cliente_id))}</small></td>${meses.map(m => cel(uc, m, false)).join("")}</tr>`).join("")}` : ""}
      </tbody></table></div>`;
  }

  P3.register("faturas", { render });
  P3.editarFatura = editarFatura;
})();
