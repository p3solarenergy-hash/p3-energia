// Tarefas da P3: o que está em aberto, com prazo, responsável e categoria. Mesmo jeito da visão do Financeiro:
// números do momento, calendário dos próximos 30 dias, quem está com o quê e a lista (atrasadas primeiro).
// Cada tarefa com prazo tem o link para criar o evento no Google Agenda já preenchido.
(function () {
  "use strict";
  const { api, fmt, esc, $, $$, kpi, badge, opts, modal, confirmar, formData, toast } = window.P3;
  const ui = { aba: "visao", resp: "", cat: "", situacao: "abertas", busca: "" };
  const RESPONSAVEIS = ["Eduardo", "Rafael"];
  const CATEGORIAS = ["Comercial", "Obras", "Manutenção", "Financeiro", "NFs e cobranças", "Usinas", "Investidores", "Outros"];
  const PRIORIDADE = { alta: ["Alta", "bad"], media: ["Média", "warn"], baixa: ["Baixa", ""] };
  const SITUACAO = { aberta: ["Aberta", ""], andamento: ["Em andamento", "info"], concluida: ["Concluída", "ok"] };
  const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const somaDias = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const aberta = t => t.status !== "concluida";
  const atrasada = t => aberta(t) && t.prazo && t.prazo < hoje();
  let tarefas = [];

  // Google Agenda: abre o evento já preenchido (dia inteiro, ou 1 hora a partir da hora marcada).
  function linkAgenda(t) {
    if (!t.prazo) return "";
    const d = t.prazo.replace(/-/g, "");
    let datas;
    if (t.hora) {
      const [h, m] = t.hora.split(":").map(Number), fim = new Date(2000, 0, 1, h + 1, m);
      datas = `${d}T${t.hora.replace(":", "")}00/${d}T${String(fim.getHours()).padStart(2, "0")}${String(fim.getMinutes()).padStart(2, "0")}00`;
    } else datas = `${d}/${somaDias(t.prazo, 1).replace(/-/g, "")}`;
    const detalhes = [t.descricao, t.responsavel && `Responsável: ${t.responsavel}`, t.categoria && `Categoria: ${t.categoria}`, "Tarefa do sistema P3 Energy"].filter(Boolean).join("\n");
    return `https://calendar.google.com/calendar/render?${new URLSearchParams({ action: "TEMPLATE", text: t.titulo || "Tarefa P3", dates: datas, details: detalhes, ctz: "America/Sao_Paulo" })}`;
  }

  async function carregar() { tarefas = await api("tarefas"); marcarMenu(); return tarefas; }
  function marcarMenu() {
    const el = $("#tfAlert"); if (!el) return;
    const q = tarefas.filter(t => aberta(t) && t.prazo && t.prazo <= hoje()).length;
    el.hidden = !q; el.textContent = q;
  }
  const PESO = { alta: 0, media: 1, baixa: 2 };
  const ordem = (a, b) => (atrasada(b) - atrasada(a)) || String(a.prazo || "9999").localeCompare(String(b.prazo || "9999")) || ((PESO[a.prioridade] ?? 1) - (PESO[b.prioridade] ?? 1));

  async function render(main) {
    main.innerHTML = `<div class="loading">Carregando as tarefas…</div>`;
    try { await carregar(); } catch (e) { main.innerHTML = `<div class="note bad">${esc(e.message)}</div>`; return; }
    if (window.P3.state.route !== "tarefas") return;
    desenhar(main);
  }

  function desenhar(main) {
    const resp = [...new Set([...RESPONSAVEIS, ...tarefas.map(t => t.responsavel).filter(Boolean)])];
    main.innerHTML = `
      <div class="head"><div><p class="kicker">Rotina</p><h1>Tarefas</h1><p>O que está em aberto, com prazo e responsável. Cada tarefa com prazo vai para o Google Agenda com um toque.</p></div>
        <div class="actions"><a class="btn" href="https://calendar.google.com/calendar/r" target="_blank" rel="noopener">Abrir Google Agenda</a><button class="btn primary" id="tfNova">+ Nova tarefa</button></div></div>
      <form class="inline" id="tfRapida" style="margin-bottom:14px;align-items:flex-end;flex-wrap:wrap">
        <label class="f" style="flex:1 1 260px">Anotar rápido<input name="titulo" placeholder="Ex.: Ligar para o Denison sobre a manutenção" autocomplete="off"></label>
        <label class="f">Responsável<select name="responsavel">${opts(resp.map(r => [r, r]), "Eduardo")}</select></label>
        <label class="f">Prazo<input type="date" name="prazo"></label>
        <label class="f">Categoria<select name="categoria">${opts(CATEGORIAS.map(c => [c, c]), "", "—")}</select></label>
        <button class="btn" type="submit">Adicionar</button>
      </form>
      <div class="tabs">${[["visao", "Visão geral"], ["lista", "Todas as tarefas"]].map(([k, l]) => `<button data-aba="${k}" class="${ui.aba === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <div id="tfAba"></div>`;
    $$(".tabs button", main).forEach(b => b.onclick = () => { ui.aba = b.dataset.aba; desenhar(main); });
    $("#tfNova", main).onclick = () => editar(main, { responsavel: "Eduardo", prioridade: "media", status: "aberta" });
    $("#tfRapida", main).onsubmit = async e => {
      e.preventDefault();
      const f = formData(e.target);
      if (!f.titulo.trim()) return;
      try { await api("tarefas", { method: "POST", body: { ...f, prazo: f.prazo || null, categoria: f.categoria || null, status: "aberta", prioridade: "media" } }); toast("Tarefa anotada.", "ok"); await recarregar(main); }
      catch (err) { toast(err.message, "bad"); }
    };
    (ui.aba === "visao" ? visao : lista)($("#tfAba", main), main);
  }
  async function recarregar(main) { await carregar(); desenhar(main); }

  // ───────── Visão geral ─────────
  function visao(el, main) {
    const h = hoje(), abertas = tarefas.filter(aberta);
    const domingo = somaDias(h, (7 - new Date(h + "T12:00:00").getDay()) % 7);
    const semana = abertas.filter(t => t.prazo && t.prazo >= h && t.prazo <= domingo);
    const atrasadas = abertas.filter(atrasada);
    const semPrazo = abertas.filter(t => !t.prazo);
    const mes = h.slice(0, 7), concluidasMes = tarefas.filter(t => t.status === "concluida" && String(t.concluida_em || "").startsWith(mes));
    // Calendário: hoje + 29 dias, alinhado na segunda-feira.
    const dias = Array.from({ length: 30 }, (_, i) => somaDias(h, i));
    const brancos = (new Date(h + "T12:00:00").getDay() + 6) % 7;
    const porDia = d => abertas.filter(t => t.prazo === d);
    const max = Math.max(1, ...dias.map(d => porDia(d).length));
    const celula = d => {
      const lst = porDia(d), forca = Math.round(18 + lst.length / max * 72);
      return `<div class="d ${lst.length ? "tem" : ""} ${lst.length && forca > 55 ? "forte" : ""} ${d === h ? "hoje" : ""}" style="--forca:${forca}%" title="${esc(fmt.data(d))}${lst.length ? "\n" + esc(lst.map(t => `• ${t.titulo}${t.responsavel ? ` (${t.responsavel})` : ""}`).join("\n")) : ""}">${Number(d.slice(8))}${lst.length ? `<b>${lst.length} tarefa${lst.length > 1 ? "s" : ""}</b>` : ""}</div>`;
    };
    const conta = chave => { const m = new Map(); abertas.forEach(t => { const k = t[chave] || "Sem " + (chave === "responsavel" ? "responsável" : "categoria"); m.set(k, (m.get(k) || 0) + 1); }); return [...m].sort((a, b) => b[1] - a[1]); };
    const barras = lst => { const mx = Math.max(1, ...lst.map(x => x[1])); return lst.map(([k, q]) => `<div class="linha-cat"><span>${esc(k)}</span><b>${q}</b></div><div class="barra"><i style="width:${q / mx * 100}%"></i></div>`).join("") || `<p class="muted" style="margin:0">Nada em aberto.</p>`; };
    el.innerHTML = `
      ${semPrazo.length ? `<div class="note warn" style="margin-bottom:12px">${semPrazo.length} tarefa(s) sem prazo não aparecem no calendário. Dê um prazo para não ficarem esquecidas.</div>` : ""}
      <div class="kpis">
        ${kpi("Em aberto", String(abertas.length), semPrazo.length ? `${semPrazo.length} sem prazo` : "todas com prazo", "lead")}
        ${kpi("Vence esta semana", String(semana.length), "até domingo")}
        ${kpi("Atrasadas", String(atrasadas.length), atrasadas.length ? `<span class="neg">passaram do prazo</span>` : "nada atrasado")}
        ${kpi("Concluídas no mês", String(concluidasMes.length), esc(fmt.mesLongo(mes)))}
      </div>
      <div class="section grid2">
        <div class="card"><h2>Calendário de prazos</h2><p class="sub">Próximos 30 dias · passe o mouse para ver as tarefas do dia</p>
          <div class="cal">${["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(d => `<div class="wd">${d}</div>`).join("")}${'<div class="d vazio"></div>'.repeat(brancos)}${dias.map(celula).join("")}</div></div>
        <div class="stack">
          <div class="card"><h2>Por responsável</h2><p class="sub">Tarefas em aberto</p>${barras(conta("responsavel"))}</div>
          <div class="card"><h2>Por categoria</h2><p class="sub">Tarefas em aberto</p>${barras(conta("categoria"))}</div>
        </div>
      </div>
      <div class="section"><div class="section-head"><div><h2>Próximas tarefas</h2><p>Atrasadas primeiro, depois por prazo; as sem prazo no fim.</p></div></div>
        ${tabela(abertas.sort(ordem), "Nenhuma tarefa em aberto. Anote a próxima no campo acima.")}</div>`;
    ligar(el, main);
  }

  // ───────── Todas as tarefas (com filtros) ─────────
  function lista(el, main) {
    const resp = [...new Set(tarefas.map(t => t.responsavel).filter(Boolean))];
    const busca = ui.busca.toLowerCase();
    const lst = tarefas.filter(t => (ui.situacao === "todas" || (ui.situacao === "abertas" ? aberta(t) : t.status === "concluida"))
      && (!ui.resp || t.responsavel === ui.resp) && (!ui.cat || t.categoria === ui.cat)
      && (!busca || `${t.titulo} ${t.descricao || ""}`.toLowerCase().includes(busca)))
      .sort(ui.situacao === "concluidas" ? (a, b) => String(b.concluida_em || "").localeCompare(String(a.concluida_em || "")) : ordem);
    el.innerHTML = `
      <div class="inline" style="margin-bottom:12px;align-items:flex-end;flex-wrap:wrap">
        <label class="f">Situação<select id="tfSit">${opts([["abertas", "Em aberto"], ["concluidas", "Concluídas"], ["todas", "Todas"]], ui.situacao)}</select></label>
        <label class="f">Responsável<select id="tfResp">${opts(resp.map(r => [r, r]), ui.resp, "Todos")}</select></label>
        <label class="f">Categoria<select id="tfCat">${opts(CATEGORIAS.map(c => [c, c]), ui.cat, "Todas")}</select></label>
        <label class="f" style="flex:1 1 200px">Buscar<input id="tfBusca" value="${esc(ui.busca)}" placeholder="nome do cliente, assunto…"></label>
      </div>
      <div id="tfTabela">${tabela(lst, "Nenhuma tarefa com esse filtro.")}</div>`;
    $("#tfSit", el).onchange = e => { ui.situacao = e.target.value; lista(el, main); };
    $("#tfResp", el).onchange = e => { ui.resp = e.target.value; lista(el, main); };
    $("#tfCat", el).onchange = e => { ui.cat = e.target.value; lista(el, main); };
    $("#tfBusca", el).oninput = e => { ui.busca = e.target.value; clearTimeout(lista.t); lista.t = setTimeout(() => { lista(el, main); const i = $("#tfBusca", el); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); };
    ligar(el, main);
  }

  function tabela(lst, vazio) {
    if (!lst.length) return `<div class="empty">${esc(vazio)}</div>`;
    return `<div class="table-wrap"><table><thead><tr><th style="width:34px"></th><th>Prazo</th><th>Tarefa</th><th>Responsável</th><th>Prioridade</th><th>Situação</th><th></th></tr></thead><tbody>
      ${lst.map(t => `<tr>
        <td><input type="checkbox" data-feito="${esc(t.id)}" ${t.status === "concluida" ? "checked" : ""} aria-label="Concluir ${esc(t.titulo)}" style="width:18px;height:18px"></td>
        <td style="white-space:nowrap">${t.prazo ? `${fmt.data(t.prazo)}${t.hora ? ` ${esc(t.hora)}` : ""}` : `<span class="muted">sem prazo</span>`}${atrasada(t) ? `<small class="neg">atrasada</small>` : t.prazo === hoje() && aberta(t) ? `<small class="neg">hoje</small>` : ""}</td>
        <td><b style="${t.status === "concluida" ? "text-decoration:line-through;opacity:.6" : ""}">${esc(t.titulo)}</b><small>${esc([t.categoria, t.descricao].filter(Boolean).join(" · "))}${t.status === "concluida" && t.concluida_em ? ` · concluída em ${fmt.data(t.concluida_em)}` : ""}</small></td>
        <td>${esc(t.responsavel || "—")}</td>
        <td>${badge(...(PRIORIDADE[t.prioridade] || PRIORIDADE.media))}</td>
        <td>${badge(...(SITUACAO[t.status] || SITUACAO.aberta))}</td>
        <td class="right" style="white-space:nowrap">${t.prazo && aberta(t) ? `<a class="btn ghost sm" href="${esc(linkAgenda(t))}" target="_blank" rel="noopener" title="Criar o evento no Google Agenda">📅 Agenda</a>` : ""}<button class="btn ghost sm" data-ed="${esc(t.id)}">Editar</button></td></tr>`).join("")}
      </tbody></table></div>`;
  }
  function ligar(el, main) {
    $$("[data-feito]", el).forEach(c => c.onchange = async () => {
      const feito = c.checked;
      try { await api(`tarefas/${encodeURIComponent(c.dataset.feito)}`, { method: "PUT", body: { status: feito ? "concluida" : "aberta", concluida_em: feito ? hoje() : null } }); toast(feito ? "Tarefa concluída." : "Tarefa reaberta.", "ok"); await recarregar(main); }
      catch (e) { c.checked = !feito; toast(e.message, "bad"); }
    });
    $$("[data-ed]", el).forEach(b => b.onclick = () => editar(main, tarefas.find(t => t.id === b.dataset.ed)));
  }

  async function editar(main, orig) {
    const t = { ...orig };
    const resp = [...new Set([...RESPONSAVEIS, ...tarefas.map(x => x.responsavel).filter(Boolean)])];
    const html = `<div class="grid-form">
        <label class="f wide">Tarefa<input name="titulo" value="${esc(t.titulo || "")}" autocomplete="off"></label>
        <label class="f">Responsável<input name="responsavel" list="tfResps" value="${esc(t.responsavel || "")}"><datalist id="tfResps">${resp.map(r => `<option value="${esc(r)}">`).join("")}</datalist></label>
        <label class="f">Categoria<select name="categoria">${opts([...new Set([...CATEGORIAS, ...(t.categoria ? [t.categoria] : [])])].map(c => [c, c]), t.categoria, "—")}</select></label>
        <label class="f">Prazo<input type="date" name="prazo" value="${esc(t.prazo || "")}"></label>
        <label class="f">Hora (opcional)<input type="time" name="hora" value="${esc(t.hora || "")}"></label>
        <label class="f">Prioridade<select name="prioridade">${opts(Object.entries(PRIORIDADE).map(([k, [l]]) => [k, l]), t.prioridade || "media")}</select></label>
        <label class="f">Situação<select name="status">${opts(Object.entries(SITUACAO).map(([k, [l]]) => [k, l]), t.status || "aberta")}</select></label>
        <label class="f wide">Detalhes<textarea name="descricao" rows="3" style="width:100%;font:inherit">${esc(t.descricao || "")}</textarea></label>
      </div>
      <p style="margin:12px 0 0;display:flex;gap:8px;flex-wrap:wrap"><a class="btn sm" id="tfAgenda" target="_blank" rel="noopener">📅 Adicionar ao Google Agenda</a>${t.id ? `<button type="button" class="btn ghost sm danger" id="tfExcluir">Excluir</button>` : ""}</p>`;
    const salvo = modal(t.id ? "Tarefa" : "Nova tarefa", html, {
      onSave: async el => {
        const f = formData(el);
        if (!f.titulo.trim()) throw new Error("Escreva a tarefa.");
        for (const k of ["prazo", "hora", "categoria", "responsavel", "descricao"]) if (!f[k]) f[k] = null;
        f.concluida_em = f.status === "concluida" ? (t.status === "concluida" && t.concluida_em ? t.concluida_em : hoje()) : null;
        return t.id ? api(`tarefas/${encodeURIComponent(t.id)}`, { method: "PUT", body: f }) : api("tarefas", { method: "POST", body: f });
      }
    });
    const bgs = document.querySelectorAll(".modal-bg"), bg = bgs[bgs.length - 1];
    // O link da agenda acompanha o que está no formulário.
    const ag = $("#tfAgenda", bg);
    const atualizar = () => { const l = linkAgenda(formData(bg)); ag.href = l || "#"; ag.style.opacity = l ? "" : ".45"; ag.title = l ? "Abre o evento já preenchido no Google Agenda" : "Coloque um prazo para mandar para a agenda"; };
    ag.onclick = e => { if (!$('[name="prazo"]', bg).value) { e.preventDefault(); toast("Coloque um prazo para mandar para a agenda.", "bad"); } };
    $$("[name]", bg).forEach(i => i.addEventListener("input", atualizar)); atualizar();
    const exc = $("#tfExcluir", bg);
    if (exc) exc.onclick = async () => {
      if (!await confirmar("Excluir tarefa", `Excluir "${esc(t.titulo)}"?`, "Excluir")) return;
      try { await api(`tarefas/${encodeURIComponent(t.id)}`, { method: "DELETE" }); $("[data-x]", bg).click(); toast("Tarefa excluída.", "ok"); await recarregar(main); }
      catch (e) { toast(e.message, "bad"); }
    };
    if (await salvo) { toast("Tarefa salva.", "ok"); await recarregar(main); }
  }

  window.P3_TAREFAS = { linkAgenda, carregar };
  window.P3.register("tarefas", { render });
  // Conta para o menu (atrasadas + vencendo hoje) quando o sistema abre.
  setTimeout(() => { if (window.P3.state.db) carregar().catch(() => {}); }, 2500);
})();
