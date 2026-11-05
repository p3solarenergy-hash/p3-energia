// Tarefas da P3: o que está em aberto, com prazo, responsável e categoria. Mesmo jeito da visão do Financeiro:
// números do momento, calendário dos próximos 30 dias, quem está com o quê e a lista (atrasadas primeiro).
// Cada tarefa com prazo tem o link para criar o evento no Google Agenda já preenchido.
(function () {
  "use strict";
  const { api, fmt, esc, $, $$, kpi, badge, opts, modal, confirmar, formData, toast } = window.P3;
  const ui = { aba: "visao", resp: "", cat: "", situacao: "abertas", busca: "", semanas: 0 };
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

  // ───────── Agenda do Google (endereço secreto iCal) ─────────
  // A função "agenda-google" devolve o .ics de cada agenda cadastrada; aqui ele vira a lista de compromissos,
  // com os eventos repetidos (diário, semanal com dias da semana, mensal, anual) expandidos na janela visível.
  let eventos = [], agendasInfo = [], eventosEm = 0;
  const txtIcs = s => String(s || "").replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();
  const isoLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  function dataIcs(v) {
    const m = String(v || "").match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})\d{2}(Z)?)?/);
    if (!m) return null;
    if (!m[4]) return { dia: `${m[1]}-${m[2]}-${m[3]}`, hora: null };
    if (m[6]) { const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])); return { dia: isoLocal(d), hora: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` }; }
    return { dia: `${m[1]}-${m[2]}-${m[3]}`, hora: `${m[4]}:${m[5]}` };
  }
  function lerIcs(ics) {
    const linhas = String(ics).replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
    const out = []; let ev = null;
    for (const l of linhas) {
      if (l === "BEGIN:VEVENT") { ev = { exdate: [] }; continue; }
      if (l === "END:VEVENT") { if (ev) out.push(ev); ev = null; continue; }
      if (!ev) continue;
      const i = l.indexOf(":"); if (i < 0) continue;
      const nome = l.slice(0, i).split(";")[0], val = l.slice(i + 1);
      if (nome === "EXDATE") val.split(",").forEach(v => { const d = dataIcs(v); if (d) ev.exdate.push(d.dia); });
      else if (nome === "DTSTART") ev.inicio = dataIcs(val);
      else if (nome === "DTEND") ev.fim = dataIcs(val);
      else if (nome === "RECURRENCE-ID") ev.recId = dataIcs(val);
      else if (nome === "SUMMARY") ev.titulo = txtIcs(val);
      else if (nome === "LOCATION") ev.local = txtIcs(val);
      else if (nome === "DESCRIPTION") ev.descricao = txtIcs(val).replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ").trim();
      else if (nome === "UID") ev.uid = val;
      else if (nome === "RRULE") ev.rrule = Object.fromEntries(val.split(";").map(x => x.split("=")));
      else if (nome === "STATUS") ev.status = val;
    }
    return out.filter(e => e.inicio);
  }
  const DIAS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  // Datas (AAAA-MM-DD) em que o evento acontece entre "de" e "ate".
  function ocorrencias(ev, de, ate) {
    const ini = ev.inicio.dia, r = ev.rrule;
    if (!r) return ini >= de && ini <= ate ? [ini] : [];
    const passo = Math.max(1, Number(r.INTERVAL) || 1), limite = Number(r.COUNT) || Infinity;
    const ateRegra = r.UNTIL ? dataIcs(r.UNTIL).dia : "9999-12-31";
    const fim = ateRegra < ate ? ateRegra : ate;
    const d0 = new Date(ini + "T12:00:00"), out = [];
    let n = 0;
    const conta = iso => { if (iso < ini || iso > ateRegra) return true; n++; if (n > limite) return false; if (iso >= de && iso <= fim) out.push(iso); return true; };
    if (r.FREQ === "DAILY") {
      for (let d = new Date(d0), k = 0; isoLocal(d) <= fim && k < 3000; d.setDate(d.getDate() + passo), k++) if (!conta(isoLocal(d))) break;
    } else if (r.FREQ === "WEEKLY") {
      const dias = (r.BYDAY ? r.BYDAY.split(",") : [DIAS[d0.getDay()]]).map(x => DIAS.indexOf(x.slice(-2))).filter(x => x >= 0).sort();
      const semana = new Date(d0); semana.setDate(semana.getDate() - semana.getDay());
      outer: for (let k = 0; k < 600; k++, semana.setDate(semana.getDate() + 7 * passo)) {
        for (const wd of dias) { const d = new Date(semana); d.setDate(d.getDate() + wd); const iso = isoLocal(d); if (iso > fim) break outer; if (!conta(iso)) break outer; }
      }
    } else if (r.FREQ === "MONTHLY" || r.FREQ === "YEARLY") {
      const by = r.BYDAY && r.BYDAY.match(/^(-?\d)(MO|TU|WE|TH|FR|SA|SU)$/);
      for (let k = 0; k < 600; k++) {
        const base = new Date(d0.getFullYear(), d0.getMonth(), 1, 12);
        if (r.FREQ === "MONTHLY") base.setMonth(base.getMonth() + k * passo); else base.setFullYear(base.getFullYear() + k * passo);
        let d;
        if (by) { // ex.: 2TU = segunda terça do mês; -1FR = última sexta
          const wd = DIAS.indexOf(by[2]), nth = Number(by[1]);
          if (nth > 0) { d = new Date(base); d.setDate(1 + ((wd - d.getDay() + 7) % 7) + (nth - 1) * 7); }
          else { d = new Date(base.getFullYear(), base.getMonth() + 1, 0, 12); d.setDate(d.getDate() - ((d.getDay() - wd + 7) % 7)); }
          if (d.getMonth() !== base.getMonth()) continue;
        } else { d = new Date(base); d.setDate(d0.getDate()); if (d.getMonth() !== base.getMonth()) continue; }
        const iso = isoLocal(d); if (iso > fim) break; if (!conta(iso)) break;
      }
    } else if (ini >= de && ini <= ate) out.push(ini);
    return out.filter(x => !ev.exdate.includes(x));
  }
  function montarEventos(lista) {
    const de = somaDias(hoje(), -60), ate = somaDias(hoje(), 180), out = [];
    for (const a of lista) {
      if (!a.ics) continue;
      const evs = lerIcs(a.ics);
      const trocados = new Set(evs.filter(e => e.recId).map(e => `${e.uid}|${e.recId.dia}`));
      for (const e of evs) {
        if (e.status === "CANCELLED") continue;
        const dur = e.fim ? Math.round((new Date(e.fim.dia + "T12:00:00") - new Date(e.inicio.dia + "T12:00:00")) / 864e5) - (e.inicio.hora ? 0 : 1) : 0;
        for (const dia of ocorrencias(e, de, ate)) {
          if (!e.recId && trocados.has(`${e.uid}|${dia}`)) continue;
          out.push({ agenda: a.nome, cor: a.cor, titulo: e.titulo || "(sem título)", dia, hora: e.inicio.hora, horaFim: e.fim && e.fim.hora, ateDia: dur > 0 ? somaDias(dia, dur) : null, local: e.local || "", descricao: e.descricao || "" });
        }
      }
    }
    return out.sort((a, b) => (a.dia + (a.hora || "00:00")).localeCompare(b.dia + (b.hora || "00:00")));
  }
  async function carregarAgenda(forcar) {
    if (!forcar && Date.now() - eventosEm < 5 * 60 * 1000) return;
    try { const r = await api("agenda-google"); agendasInfo = r.agendas || []; eventos = montarEventos(agendasInfo); eventosEm = Date.now(); }
    catch (e) { agendasInfo = [{ nome: "Agenda do Google", erro: e.message }]; }
  }
  const eventosDoDia = d => eventos.filter(e => e.dia === d);

  async function carregar() { const [t] = await Promise.all([api("tarefas"), carregarAgenda()]); tarefas = t; marcarMenu(); return tarefas; }
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
        <div class="actions"><button class="btn" id="tfAgendas">Agendas do Google${agendasInfo.some(a => a.ics) ? ` · ${agendasInfo.filter(a => a.ics).length}` : ""}</button><a class="btn" href="https://calendar.google.com/calendar/r" target="_blank" rel="noopener">Abrir Google Agenda</a><button class="btn primary" id="tfNova">+ Nova tarefa</button></div></div>
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
    $("#tfAgendas", main).onclick = () => agendas(main);
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
    // Calendário: 5 semanas a partir da segunda-feira desta semana (as setas andam de 4 em 4 semanas).
    const segunda = somaDias(h, -((new Date(h + "T12:00:00").getDay() + 6) % 7) + ui.semanas * 7);
    const dias = Array.from({ length: 35 }, (_, i) => somaDias(segunda, i));
    const porDia = d => abertas.filter(t => t.prazo === d);
    const max = Math.max(1, ...dias.map(d => porDia(d).length));
    const celula = d => {
      const lst = porDia(d), evs = eventosDoDia(d), forca = Math.round(18 + lst.length / max * 72);
      const dica = [fmt.data(d), ...lst.map(t => `• ${t.titulo}${t.responsavel ? ` (${t.responsavel})` : ""}`), ...evs.map(e => `◦ ${e.hora ? e.hora + " " : ""}${e.titulo}`)].join("\n");
      return `<button type="button" class="d ${lst.length ? "tem" : ""} ${lst.length && forca > 55 ? "forte" : ""} ${d === h ? "hoje" : ""} ${d < h ? "passado" : ""}" data-dia="${d}" style="--forca:${forca}%" title="${esc(dica)}">${Number(d.slice(8))}${Number(d.slice(8)) === 1 ? `<small>${esc(fmt.mes(d.slice(0, 7)))}</small>` : ""}${lst.length ? `<b>${lst.length} tarefa${lst.length > 1 ? "s" : ""}</b>` : ""}${evs.length ? `<i class="ag">${evs.length} na agenda</i>` : ""}</button>`;
    };
    const erros = agendasInfo.filter(a => a.erro);
    const proxEventos = eventos.filter(e => e.dia >= h && e.dia <= somaDias(h, 6));
    const conta = chave => { const m = new Map(); abertas.forEach(t => { const k = t[chave] || "Sem " + (chave === "responsavel" ? "responsável" : "categoria"); m.set(k, (m.get(k) || 0) + 1); }); return [...m].sort((a, b) => b[1] - a[1]); };
    const barras = lst => { const mx = Math.max(1, ...lst.map(x => x[1])); return lst.map(([k, q]) => `<div class="linha-cat"><span>${esc(k)}</span><b>${q}</b></div><div class="barra"><i style="width:${q / mx * 100}%"></i></div>`).join("") || `<p class="muted" style="margin:0">Nada em aberto.</p>`; };
    el.innerHTML = `
      ${erros.length ? `<div class="note bad" style="margin-bottom:12px">${erros.map(a => `${esc(a.nome)}: ${esc(a.erro)}`).join("<br>")}</div>` : ""}
      ${semPrazo.length ? `<div class="note warn" style="margin-bottom:12px">${semPrazo.length} tarefa(s) sem prazo não aparecem no calendário. Dê um prazo para não ficarem esquecidas.</div>` : ""}
      <div class="kpis">
        ${kpi("Em aberto", String(abertas.length), semPrazo.length ? `${semPrazo.length} sem prazo` : "todas com prazo", "lead")}
        ${kpi("Vence esta semana", String(semana.length), "até domingo")}
        ${kpi("Atrasadas", String(atrasadas.length), atrasadas.length ? `<span class="neg">passaram do prazo</span>` : "nada atrasado")}
        ${kpi("Concluídas no mês", String(concluidasMes.length), esc(fmt.mesLongo(mes)))}
      </div>
      <div class="section grid2">
        <div class="card"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div><h2>Calendário</h2><p class="sub">Toque num dia para ver as tarefas e a agenda dele</p></div>
            <div style="display:flex;gap:4px;align-items:center"><button type="button" class="btn ghost sm" id="tfAntes" aria-label="Semanas anteriores">‹</button>${ui.semanas ? `<button type="button" class="btn ghost sm" id="tfHoje">Hoje</button>` : ""}<button type="button" class="btn ghost sm" id="tfDepois" aria-label="Próximas semanas">›</button></div></div>
          <div class="cal cal-dias">${["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(d => `<div class="wd">${d}</div>`).join("")}${dias.map(celula).join("")}</div>
          <p class="muted" style="font-size:11.5px;margin:8px 0 0">${fmt.data(dias[0])} a ${fmt.data(dias[34])} · cor = tarefas com prazo no dia${agendasInfo.some(a => a.ics) ? " · ◦ compromissos da agenda do Google" : ""}</p></div>
        <div class="stack">
          <div class="card"><h2>Por responsável</h2><p class="sub">Tarefas em aberto</p>${barras(conta("responsavel"))}</div>
          <div class="card"><h2>Por categoria</h2><p class="sub">Tarefas em aberto</p>${barras(conta("categoria"))}</div>
        </div>
      </div>
      ${proxEventos.length ? `<div class="section"><div class="section-head"><div><h2>Agenda dos próximos 7 dias</h2><p>Compromissos que vieram do Google Agenda.</p></div></div>
        <div class="table-wrap"><table><tbody>${proxEventos.map(e => linhaEvento(e, true)).join("")}</tbody></table></div></div>` : ""}
      <div class="section"><div class="section-head"><div><h2>Próximas tarefas</h2><p>Atrasadas primeiro, depois por prazo; as sem prazo no fim.</p></div></div>
        ${tabela(abertas.sort(ordem), "Nenhuma tarefa em aberto. Anote a próxima no campo acima.")}</div>`;
    ligar(el, main);
    $$("[data-dia]", el).forEach(b => b.onclick = () => abrirDia(main, b.dataset.dia));
    $("#tfAntes", el).onclick = () => { ui.semanas -= 4; desenhar(main); };
    $("#tfDepois", el).onclick = () => { ui.semanas += 4; desenhar(main); };
    if ($("#tfHoje", el)) $("#tfHoje", el).onclick = () => { ui.semanas = 0; desenhar(main); };
    ligarEventos(el, main);
  }

  // Um compromisso da agenda numa linha de tabela, com o botão de virar tarefa.
  const evId = e => eventos.indexOf(e);
  const linhaEvento = (e, comDia) => `<tr>
      <td style="white-space:nowrap;width:1%">${comDia ? `${esc(fmt.data(e.dia))} ` : ""}<b>${e.hora ? `${esc(e.hora)}${e.horaFim ? `–${esc(e.horaFim)}` : ""}` : "dia todo"}</b>${e.ateDia ? `<small>até ${fmt.data(e.ateDia)}</small>` : ""}</td>
      <td><b>${esc(e.titulo)}</b><small>${esc([e.agenda, e.local].filter(Boolean).join(" · "))}</small></td>
      <td class="right"><button type="button" class="btn ghost sm" data-virar="${evId(e)}">Virar tarefa</button></td></tr>`;
  function ligarEventos(el, main) {
    $$("[data-virar]", el).forEach(b => b.onclick = () => {
      const e = eventos[Number(b.dataset.virar)]; if (!e) return;
      const fechar = b.closest(".modal-bg"); if (fechar) $("[data-x]", fechar).click();
      editar(main, { titulo: e.titulo, prazo: e.dia, hora: e.hora || null, responsavel: /rafael/i.test(e.agenda || "") ? "Rafael" : "Eduardo", prioridade: "media", status: "aberta",
        descricao: [e.local && `Local: ${e.local}`, e.descricao].filter(Boolean).join("\n").slice(0, 800) || null });
    });
  }

  // Tudo de um dia: compromissos da agenda e tarefas com prazo nele, e o atalho para criar uma tarefa naquele dia.
  function abrirDia(main, dia) {
    const evs = eventosDoDia(dia), lst = tarefas.filter(t => t.prazo === dia).sort((a, b) => String(a.hora || "99").localeCompare(String(b.hora || "99")));
    const [a, m, d] = dia.split("-").map(Number), sem = new Date(a, m - 1, d).toLocaleDateString("pt-BR", { weekday: "long" });
    const html = `
      <p class="muted" style="margin:0 0 12px;text-transform:capitalize">${esc(sem)}${dia === hoje() ? " · hoje" : dia < hoje() ? " · já passou" : ""}</p>
      <h3 style="margin:0 0 6px;font-size:14px">Agenda do Google</h3>
      ${evs.length ? `<div class="table-wrap"><table><tbody>${evs.map(e => linhaEvento(e, false)).join("")}</tbody></table></div>` : `<p class="muted" style="margin:0 0 4px">${agendasInfo.some(x => x.ics) ? "Nada na agenda neste dia." : "Nenhuma agenda do Google ligada ainda (botão \"Agendas do Google\")."}</p>`}
      <h3 style="margin:16px 0 6px;font-size:14px">Tarefas</h3>
      ${lst.length ? `<div class="table-wrap"><table><tbody>${lst.map(t => `<tr>
          <td style="width:1%"><input type="checkbox" data-dfeito="${esc(t.id)}" ${t.status === "concluida" ? "checked" : ""} aria-label="Concluir ${esc(t.titulo)}" style="width:18px;height:18px"></td>
          <td><b style="${t.status === "concluida" ? "text-decoration:line-through;opacity:.6" : ""}">${t.hora ? `${esc(t.hora)} · ` : ""}${esc(t.titulo)}</b><small>${esc([t.responsavel, t.categoria].filter(Boolean).join(" · "))}</small></td>
          <td>${badge(...(PRIORIDADE[t.prioridade] || PRIORIDADE.media))}</td>
          <td class="right" style="white-space:nowrap">${aberta(t) ? `<a class="btn ghost sm" href="${esc(linkAgenda(t))}" target="_blank" rel="noopener">📅</a>` : ""}<button type="button" class="btn ghost sm" data-ded="${esc(t.id)}">Editar</button></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted" style="margin:0">Nenhuma tarefa com prazo neste dia.</p>`}
      <p style="margin:14px 0 0"><button type="button" class="btn sm primary" id="tfNoDia">+ Tarefa neste dia</button></p>`;
    modal(fmt.data(dia), html);
    const bgs = document.querySelectorAll(".modal-bg"), bg = bgs[bgs.length - 1];
    const fechar = () => $("[data-x]", bg).click();
    ligarEventos(bg, main);
    $("#tfNoDia", bg).onclick = () => { fechar(); editar(main, { prazo: dia, responsavel: "Eduardo", prioridade: "media", status: "aberta" }); };
    $$("[data-ded]", bg).forEach(b => b.onclick = () => { fechar(); editar(main, tarefas.find(t => t.id === b.dataset.ded)); });
    $$("[data-dfeito]", bg).forEach(c => c.onchange = async () => {
      const feito = c.checked;
      try { await api(`tarefas/${encodeURIComponent(c.dataset.dfeito)}`, { method: "PUT", body: { status: feito ? "concluida" : "aberta", concluida_em: feito ? hoje() : null } }); toast(feito ? "Tarefa concluída." : "Tarefa reaberta.", "ok"); fechar(); await recarregar(main); abrirDia(main, dia); }
      catch (e) { c.checked = !feito; toast(e.message, "bad"); }
    });
  }

  // Cadastro das agendas do Google (endereço secreto no formato iCal).
  async function agendas(main) {
    let lista = [];
    try { lista = await api("agendas_google"); } catch (e) { return toast(e.message, "bad"); }
    const html = `
      <div class="note" style="margin-bottom:12px;font-size:13px">No Google Agenda (pelo computador): <b>⚙ Configurações → clique na sua agenda (à esquerda) → "Integrar agenda" → "Endereço secreto no formato iCal"</b>. Copie e cole aqui. A plataforma só <b>lê</b> a agenda; o endereço fica guardado só para o admin.</div>
      ${lista.length ? `<div class="table-wrap"><table><tbody>${lista.map(a => `<tr><td><b>${esc(a.nome)}</b><small>…${esc(String(a.url).slice(-24))}</small></td><td>${a.ativo === 0 ? badge("Desligada", "") : badge("Ligada", "ok")}</td>
        <td class="right" style="white-space:nowrap"><button type="button" class="btn ghost sm" data-liga="${esc(a.id)}">${a.ativo === 0 ? "Ligar" : "Desligar"}</button><button type="button" class="btn ghost sm danger" data-tira="${esc(a.id)}">Tirar</button></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Nenhuma agenda ligada ainda.</p>`}
      <div class="grid-form" style="margin-top:12px"><label class="f">Nome<input name="nome" placeholder="Ex.: Eduardo" value="${lista.length ? "" : "Eduardo"}"></label>
        <label class="f wide">Endereço secreto no formato iCal<input name="url" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" autocomplete="off"></label></div>`;
    const salvo = modal("Agendas do Google", html, {
      saveLabel: "Ligar agenda",
      onSave: async el => {
        const f = formData(el);
        if (!f.nome.trim() || !f.url.trim()) throw new Error("Preencha o nome e o endereço.");
        await api("agendas_google", { method: "POST", body: { nome: f.nome.trim(), url: f.url.trim(), ativo: 1 } });
      }
    });
    const bgs = document.querySelectorAll(".modal-bg"), bg = bgs[bgs.length - 1];
    const refazer = async () => { $("[data-x]", bg).click(); await carregarAgenda(true); desenhar(main); agendas(main); };
    $$("[data-liga]", bg).forEach(b => b.onclick = async () => { const a = lista.find(x => x.id === b.dataset.liga); try { await api(`agendas_google/${encodeURIComponent(a.id)}`, { method: "PUT", body: { ativo: a.ativo === 0 ? 1 : 0 } }); await refazer(); } catch (e) { toast(e.message, "bad"); } });
    $$("[data-tira]", bg).forEach(b => b.onclick = async () => { if (!await confirmar("Tirar agenda", "A plataforma para de ler esta agenda (nada muda no Google).", "Tirar")) return; try { await api(`agendas_google/${encodeURIComponent(b.dataset.tira)}`, { method: "DELETE" }); await refazer(); } catch (e) { toast(e.message, "bad"); } });
    if (await salvo) { toast("Agenda ligada. Lendo os compromissos…", "ok"); await carregarAgenda(true); desenhar(main); }
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

  window.P3_TAREFAS = { linkAgenda, carregar, lerIcs, ocorrencias, montarEventos };
  window.P3.register("tarefas", { render });
  // Conta para o menu (atrasadas + vencendo hoje) quando o sistema abre.
  setTimeout(() => { if (window.P3.state.db) carregar().catch(() => {}); }, 2500);
})();
