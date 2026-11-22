// Cérebro: tudo o que passa nos grupos de trabalho do WhatsApp, num lugar só.
// Resumo do dia e fichas vivas (montados pelo Claude a partir das conversas), busca em mensagens e áudios
// transcritos, e a conversa de cada grupo com fotos, PDFs e áudios. Só leitura: nada daqui vai para o WhatsApp.
(function () {
  "use strict";
  const { api, fmt, esc, $, $$, kpi, badge, toast } = window.P3;
  const ui = { aba: "hoje", busca: "", grupo: null, filtroGrupo: "", ficha: "" };
  let dados = { grupos: [], fichas: [], resumos: [], tarefas: [] };

  const quando = iso => {
    if (!iso) return "—";
    const d = new Date(iso), h = new Date();
    const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === h.toDateString()) return `hoje ${hora}`;
    const ontem = new Date(h); ontem.setDate(h.getDate() - 1);
    if (d.toDateString() === ontem.toDateString()) return `ontem ${hora}`;
    return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${hora}`;
  };
  const autor = m => m.autor === "eu" ? "Eduardo" : (m.autor_nome || m.autor || "").replace(/@.*/, "") || "—";
  const TIPO = { imagem: "📷 Foto", documento: "📄 Documento", audio: "🎤 Áudio", video: "🎬 Vídeo", local: "📍 Local", contato: "👤 Contato" };
  const marca = (txt, q) => {
    const s = esc(txt || "");
    const ps = String(q || "").split(/\s+/).filter(w => w.length > 2).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return ps.length ? s.replace(new RegExp(`(${ps.join("|")})`, "gi"), "<mark>$1</mark>") : s;
  };
  // Lista de itens das fichas: [{data, texto}] ou textos soltos.
  const itens = (lst, vazio) => (lst && lst.length)
    ? `<ul class="cb-itens">${lst.map(i => typeof i === "string" ? `<li>${esc(i)}</li>` : `<li>${i.data ? `<small>${esc(fmt.data(i.data))}</small> ` : ""}${esc(i.texto || "")}${i.valor ? ` <b>${esc(i.valor)}</b>` : ""}</li>`).join("")}</ul>`
    : `<p class="muted" style="margin:0">${vazio}</p>`;

  // Cruzamento: datas sempre contadas a partir de hoje (Brasília), nunca do texto escrito às 7h.
  const hojeISO = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const dias = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const ddmm = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  function seloPeriodo(p) {
    if (!p || !p.fim) return "";
    const h = hojeISO(), ini = p.inicio || p.fim;
    if (h < ini) { const n = dias(h, ini); return badge(n === 1 ? "começa amanhã" : `começa em ${n} dias`, "info"); }
    if (h <= p.fim) return badge(h === p.fim ? (ini === p.fim ? "é hoje" : "último dia") : `em andamento até ${ddmm(p.fim)}`, "warn");
    const n = dias(p.fim, h);
    return badge(n === 1 ? "terminou ontem" : `terminou há ${n} dias`, "");
  }
  // Situação de uma tarefa ligada: feita, atrasada, vence hoje ou prazo futuro.
  function estadoTarefa(t) {
    if (!t) return null;
    if (t.status === "concluida") return { tom: "ok", txt: "feita", feita: true };
    if (!t.prazo) return { tom: "", txt: "sem prazo" };
    const n = dias(t.prazo.slice(0, 10), hojeISO());
    if (n > 0) return { tom: "bad", txt: n === 1 ? "atrasada 1 dia" : `atrasada ${n} dias`, atraso: n };
    if (n === 0) return { tom: "warn", txt: "vence hoje" };
    return { tom: "", txt: `prazo ${ddmm(t.prazo)}` };
  }
  const tarefaDe = id => id && dados.tarefas.find(t => t.id === id);
  function pendencias(lst) {
    if (!lst || !lst.length) return `<p class="muted" style="margin:0">Nada pendente.</p>`;
    return `<ul class="cb-itens">${lst.map(i => {
      if (typeof i === "string") return `<li>${esc(i)}</li>`;
      const t = tarefaDe(i.tarefa_id), e = estadoTarefa(t);
      const tag = e ? ` ${badge(e.txt, e.tom)}${t.responsavel ? ` <small>${esc(t.responsavel)}</small>` : ""}` : (i.tarefa_id ? ` <small>tarefa não encontrada</small>` : ` <small>sem tarefa</small>`);
      return `<li class="${e && e.feita ? "cb-feita" : ""}"${t ? ` title="Tarefa: ${esc(t.titulo)}"` : ""}>${esc(i.texto || "")}${tag}${i.nota ? `<br><small>${esc(i.nota)}</small>` : ""}</li>`;
    }).join("")}</ul>`;
  }
  const atrasadas = x => (x.pendencias || []).filter(i => { const e = estadoTarefa(tarefaDe(i && i.tarefa_id)); return e && e.atraso; }).length;

  function mensagem(m, q, comGrupo) {
    const corpo = m.tipo === "audio"
      ? (m.transcricao ? `<span class="cb-audio">🎤</span> ${marca(m.transcricao, q)}` : `<span class="muted">🎤 Áudio${m.transcricao === "" ? " (sem fala)" : " — transcrevendo…"}</span>`)
      : (m.texto ? marca(m.texto, q).replace(/\n/g, "<br>") : `<span class="muted">${TIPO[m.tipo] || esc(m.tipo || "")}</span>`);
    const anexo = m.midia ? ` <button type="button" class="btn ghost sm" data-midia="${esc(m.midia)}">${m.tipo === "audio" ? "Ouvir" : "Abrir"} ${esc((TIPO[m.tipo] || "arquivo").replace(/^\S+\s/, "").toLowerCase())}</button>` : "";
    return `<div class="cb-msg ${m.autor === "eu" ? "eu" : ""}"><div class="cb-meta"><b>${esc(autor(m))}</b>${comGrupo ? ` · <a href="#" data-grupo="${esc(m.grupo_jid)}">${esc(m.grupo || "")}</a>` : ""} · ${esc(quando(m.enviado_em))}</div><div class="cb-txt">${corpo}${anexo}</div></div>`;
  }

  // Estado das pontes (celular do Eduardo e do Rafael): o programa no PC avisa a cada 30 s.
  // Sem aviso há mais de 3 minutos = ponte desligada. Se o celular precisa ler o QR, ele aparece aqui.
  const PONTE_VELHA_MS = 3 * 60 * 1000;
  let pontes = [], pontesTimer = null;
  const estadoPonte = p => {
    const sinal = Date.now() - new Date(p.atualizado_em).getTime();
    if (sinal > PONTE_VELHA_MS) return { tom: "bad", rotulo: "Desligada", msg: `Sem sinal desde ${quando(p.atualizado_em)}. O programa da ponte não está rodando no computador do escritório: abra o INICIAR PONTE WHATSAPP.` };
    if (!p.conectado) return { tom: "warn", rotulo: p.qr ? "Precisa reconectar" : "Reconectando…", msg: p.qr ? "No celular: WhatsApp → ⋮ → Aparelhos conectados → Conectar um aparelho, e aponte para o código abaixo." : (p.erro ? esc(p.erro) : "Tentando reconectar sozinha. Se demorar, o código aparece aqui.") };
    return { tom: "ok", rotulo: "Ligada", msg: `Recebendo mensagens (sinal ${quando(p.atualizado_em)}).` };
  };
  function painelPonte() {
    if (!pontes.length) return `<div class="note warn" style="margin-bottom:14px">Ponte do WhatsApp: nenhum sinal recebido ainda.</div>`;
    return `<div class="section" style="margin-bottom:14px"><div style="display:flex;flex-wrap:wrap;gap:10px">${pontes.map(p => {
      const e = estadoPonte(p);
      const qr = e.tom === "warn" && p.qr ? `<div style="margin-top:8px"><img src="${esc(p.qr)}" width="220" height="220" alt="QR Code para reconectar" style="background:#fff;padding:6px;border-radius:8px"></div>` : "";
      return `<div class="note ${e.tom}" style="flex:1 1 260px"><b>Ponte de ${esc(p.nome || p.perfil)}</b> · ${badge(e.rotulo, e.tom)}<div style="margin-top:4px">${e.msg}</div>${qr}</div>`;
    }).join("")}</div></div>`;
  }
  async function atualizarPonte() {
    try { pontes = await api("cerebro/ponte") || []; } catch { return; }
    const el = document.getElementById("cbPonte");
    if (el && window.P3.state.route === "cerebro") el.innerHTML = painelPonte();
    else if (!el) clearInterval(pontesTimer);
  }

  async function carregar() {
    try { pontes = await api("cerebro/ponte") || []; } catch { pontes = []; }
    const [grupos, fichas, resumos] = await Promise.all([api("cerebro/grupos"), api("cerebro/fichas"), api("cerebro/resumos")]);
    let tarefas = [];
    try { tarefas = await api("tarefas") || []; } catch { tarefas = []; }
    dados = { grupos: grupos || [], fichas: fichas || [], resumos: resumos || [], tarefas };
  }

  async function render(main) {
    main.innerHTML = `<div class="loading">Abrindo o cérebro…</div>`;
    try { await carregar(); } catch (e) { main.innerHTML = `<div class="note bad">${esc(e.message)}</div>`; return; }
    if (window.P3.state.route !== "cerebro") return;
    desenhar(main);
  }

  function desenhar(main) {
    const ativos = dados.grupos.filter(g => g.n7 > 0);
    const msgs7 = ativos.reduce((s, g) => s + Number(g.n7 || 0), 0);
    const ultima = dados.grupos.find(g => g.ultima);
    main.innerHTML = `
      <div class="head"><div><p class="kicker">WhatsApp</p><h1>Cérebro</h1><p>Tudo o que passa nos grupos de trabalho: resumo do dia, fichas de cada usina e obra, busca em mensagens e áudios.</p></div></div>
      <div id="cbPonte">${painelPonte()}</div>
      <form class="inline" id="cbBusca" style="margin-bottom:14px;align-items:flex-end">
        <label class="f" style="flex:1 1 320px">Buscar em tudo (mensagens e áudios)<input name="q" value="${esc(ui.busca)}" placeholder="Ex.: garantia Chint, Duzinho, kWh Robert Koch" autocomplete="off"></label>
        <button class="btn primary" type="submit">Buscar</button>
      </form>
      <div class="kpis">
        ${kpi("Grupos de trabalho", String(dados.grupos.length), `${ativos.length} com conversa na semana`, "lead")}
        ${kpi("Mensagens na semana", fmt.num(msgs7, 0), "últimos 7 dias")}
        ${kpi("Fichas vivas", String(dados.fichas.length), "usinas, obras e temas")}
        ${kpi("Última mensagem", ultima ? esc(quando(ultima.ultima)) : "—", ultima ? esc(ultima.nome) : "ponte desligada?")}
      </div>
      <div class="tabs section">${[["hoje", "Resumo do dia"], ["fichas", "Fichas"], ["grupos", "Grupos"], ["busca", "Busca"]].map(([k, l]) => `<button data-aba="${k}" class="${ui.aba === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <div id="cbAba"></div>`;
    clearInterval(pontesTimer); pontesTimer = setInterval(atualizarPonte, 15000);
    $$(".tabs button", main).forEach(b => b.onclick = () => { ui.aba = b.dataset.aba; ui.grupo = null; desenhar(main); });
    $("#cbBusca", main).onsubmit = e => { e.preventDefault(); ui.busca = e.target.q.value.trim(); ui.aba = "busca"; desenhar(main); };
    const el = $("#cbAba", main);
    ({ hoje: abaHoje, fichas: abaFichas, grupos: abaGrupos, busca: abaBusca })[ui.aba](el, main);
    ligar(main);
  }

  // Botões comuns: abrir mídia e ir para a conversa de um grupo.
  function ligar(raiz) {
    $$("[data-midia]", raiz).forEach(b => b.onclick = async () => {
      try { const r = await api(`cerebro/midia?caminho=${encodeURIComponent(b.dataset.midia)}`); window.open(r.url, "_blank", "noopener"); }
      catch (e) { toast(e.message, "bad"); }
    });
    $$("[data-grupo]", raiz).forEach(a => a.onclick = e => { e.preventDefault(); ui.aba = "grupos"; ui.grupo = a.dataset.grupo; desenhar(document.getElementById("main")); });
  }

  function abaHoje(el) {
    const r = dados.resumos[0];
    if (!r) { el.innerHTML = `<div class="note">Ainda não há resumo. Todo dia às 7h o Claude lê o que entrou nos grupos, cria as tarefas e deixa o resumo aqui.</div>`; return; }
    const urg = r.urgentes || [];
    el.innerHTML = `
      <div class="grid2">
        <div class="card"><h2>Resumo de ${esc(fmt.data(r.dia))}</h2><p class="sub">Montado a partir das conversas e dos áudios</p><div class="cb-resumo">${texto(r.texto)}</div></div>
        <div class="stack">
          <div class="card"><h2>Urgente</h2>${urg.length ? `<ul class="cb-itens">${urg.map(u => `<li>${typeof u === "string" ? esc(u) : `${esc(u.texto || "")}${u.grupo ? ` <small class="muted">· ${esc(u.grupo)}</small>` : ""}`}</li>`).join("")}</ul>` : `<p class="muted" style="margin:0">Nada urgente.</p>`}</div>
          ${cruzamentos()}
          ${dados.resumos.length > 1 ? `<div class="card"><h2>Dias anteriores</h2>${dados.resumos.slice(1).map(x => `<details class="cb-dia"><summary>${esc(fmt.data(x.dia))}</summary><div class="cb-resumo">${texto(x.texto)}</div></details>`).join("")}</div>` : ""}
        </div>
      </div>`;
    $$("[data-ficha-hoje]", el).forEach(a => a.onclick = e => { e.preventDefault(); ui.aba = "fichas"; ui.ficha = a.dataset.fichaHoje; desenhar(document.getElementById("main")); });
  }
  // Cruzamentos: o que as fichas e as tarefas dizem juntas — datas vencendo, alertas e tarefas atrasadas.
  function cruzamentos() {
    const linhas = [];
    dados.fichas.forEach(x => {
      // Período que termina nos próximos 7 dias ou terminou há até 3 dias.
      const d = x.periodo && x.periodo.fim ? dias(x.periodo.fim, hojeISO()) : null;
      const selo = d !== null && d >= -7 && d <= 3 ? seloPeriodo(x.periodo) : "";
      if (selo) linhas.push(`<li>${selo} <a href="#" data-ficha-hoje="${esc(x.nome)}">${esc(x.nome)}</a></li>`);
      (x.alertas || []).forEach(a => linhas.push(`<li><a href="#" data-ficha-hoje="${esc(x.nome)}">${esc(x.nome)}</a>: ${esc(typeof a === "string" ? a : a.texto || "")}</li>`));
    });
    const vistas = new Set(), atr = [];
    dados.fichas.forEach(x => (x.pendencias || []).forEach(i => {
      const t = tarefaDe(i && i.tarefa_id), e = estadoTarefa(t);
      if (e && e.atraso && !vistas.has(t.id)) { vistas.add(t.id); atr.push({ t, e, ficha: x.nome }); }
    }));
    atr.sort((a, b) => b.e.atraso - a.e.atraso);
    if (!linhas.length && !atr.length) return "";
    return `<div class="card"><h2>Cruzamentos</h2><p class="sub">Fichas × tarefas × datas, contado a partir de hoje</p>
      ${linhas.length ? `<ul class="cb-itens">${linhas.join("")}</ul>` : ""}
      ${atr.length ? `<h3 style="margin:10px 0 2px;font-size:13px">Tarefas atrasadas ligadas às fichas (${atr.length})</h3><ul class="cb-itens">${atr.map(a => `<li>${esc(a.t.titulo)} ${badge(a.e.txt, "bad")} <small>${esc(a.t.responsavel || "")} · ${esc(a.ficha)}</small></li>`).join("")}</ul>` : ""}</div>`;
  }
  // Texto do resumo: parágrafos, listas com "-" e **negrito**.
  function texto(t) {
    return esc(t || "").split(/\n{2,}/).map(bloco => {
      const linhas = bloco.split("\n");
      const html = linhas.every(l => /^\s*[-•]/.test(l))
        ? `<ul class="cb-itens">${linhas.map(l => `<li>${l.replace(/^\s*[-•]\s*/, "")}</li>`).join("")}</ul>`
        : `<p>${linhas.join("<br>")}</p>`;
      return html.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/^<p>#+\s*(.+?)<\/p>$/, "<h3>$1</h3>");
    }).join("");
  }

  function abaFichas(el) {
    const tipos = { usina: "Usina", obra: "Obra", cliente: "Cliente", fornecedor: "Fornecedor", tema: "Tema", pessoa: "Pessoa" };
    const f = ui.ficha.toLowerCase();
    // Fichas que pedem atenção (alerta do cruzamento ou tarefa atrasada) vêm primeiro.
    const peso = x => (x.alertas || []).length * 2 + atrasadas(x);
    const lista = dados.fichas.filter(x => !f || `${x.nome} ${x.situacao || ""}`.toLowerCase().includes(f))
      .map((x, i) => [x, i]).sort((a, b) => peso(b[0]) - peso(a[0]) || a[1] - b[1]).map(a => a[0]);
    const nomeFicha = id => (dados.fichas.find(z => z.id === id) || {}).nome;
    el.innerHTML = `
      <form class="inline" id="cbFiltroFicha" style="margin-bottom:12px"><label class="f" style="flex:1 1 260px">Filtrar fichas<input name="f" value="${esc(ui.ficha)}" placeholder="Nome da usina, obra, cliente…" autocomplete="off"></label>${ui.ficha ? `<button type="button" class="btn ghost sm" id="cbLimpaFicha">Ver todas</button>` : ""}</form>
      ${lista.length ? `<div class="cb-fichas">${lista.map(x => {
        const atr = atrasadas(x), lig = (x.ligacoes || []).filter(l => nomeFicha(l.id));
        return `
        <div class="card cb-ficha">
          <div class="cb-ficha-top"><h2>${esc(x.nome)}</h2><span class="cb-selos">${seloPeriodo(x.periodo)}${atr ? badge(`${atr} atrasada${atr > 1 ? "s" : ""}`, "bad") : ""}${badge(tipos[x.tipo] || x.tipo, x.tipo === "obra" ? "info" : x.tipo === "usina" ? "ok" : "")}</span></div>
          ${x.periodo && x.periodo.fim ? `<p class="muted cb-periodo">${esc(x.periodo.texto || "Período")}: ${x.periodo.inicio && x.periodo.inicio !== x.periodo.fim ? `${ddmm(x.periodo.inicio)} a ` : ""}${ddmm(x.periodo.fim)}</p>` : ""}
          <p class="cb-sit">${esc(x.situacao || "Sem situação registrada.")}</p>
          ${(x.alertas || []).map(a => `<div class="note warn cb-alerta">${esc(typeof a === "string" ? a : a.texto || "")}</div>`).join("")}
          <details open><summary>Pendências (${(x.pendencias || []).length})</summary>${pendencias(x.pendencias)}</details>
          ${lig.length ? `<details open><summary>Ligada a (${lig.length})</summary><ul class="cb-itens">${lig.map(l => `<li><a href="#" data-ficha="${esc(nomeFicha(l.id))}">${esc(nomeFicha(l.id))}</a>${l.motivo ? ` <small>· ${esc(l.motivo)}</small>` : ""}</li>`).join("")}</ul></details>` : ""}
          <details><summary>Decisões (${(x.decisoes || []).length})</summary>${itens(x.decisoes, "Nenhuma decisão registrada.")}</details>
          ${(x.valores || []).length ? `<details><summary>Valores combinados (${x.valores.length})</summary>${itens(x.valores, "")}</details>` : ""}
          ${(x.documentos || []).length ? `<details><summary>Documentos (${x.documentos.length})</summary><ul class="cb-itens">${x.documentos.map(d => `<li>${d.midia ? `<a href="#" data-midia="${esc(d.midia)}">${esc(d.nome || "arquivo")}</a>` : esc(d.nome || "")}${d.data ? ` <small class="muted">${esc(fmt.data(d.data))}</small>` : ""}</li>`).join("")}</ul></details>` : ""}
          ${(x.contatos || []).length ? `<details><summary>Contatos</summary>${itens(x.contatos.map(c => typeof c === "string" ? c : `${c.nome || ""}${c.papel ? " — " + c.papel : ""}${c.telefone ? " · " + c.telefone : ""}`), "")}</details>` : ""}
          <p class="muted cb-rodape">${(x.grupos || []).map(g => { const gr = dados.grupos.find(z => z.jid === g || z.nome === g); return gr ? `<a href="#" data-grupo="${esc(gr.jid)}">${esc(gr.nome)}</a>` : esc(g); }).join(" · ")}${(x.grupos || []).length ? " · " : ""}atualizada ${esc(quando(x.atualizado_em))}</p>
        </div>`; }).join("")}</div>` : `<div class="note">${dados.fichas.length ? "Nenhuma ficha com esse nome." : "As fichas vivas aparecem aqui conforme o Claude lê as conversas."}</div>`}`;
    $$("[data-ficha]", el).forEach(a => a.onclick = e => { e.preventDefault(); ui.ficha = a.dataset.ficha; abaFichas(el); ligar(el); window.scrollTo({ top: el.offsetTop - 80, behavior: "smooth" }); });
    const limpa = $("#cbLimpaFicha", el);
    if (limpa) limpa.onclick = () => { ui.ficha = ""; abaFichas(el); ligar(el); };
    const fm = $("#cbFiltroFicha", el);
    fm.f.oninput = () => { ui.ficha = fm.f.value; const pos = fm.f.selectionStart; abaFichas(el); ligar(el); const i = $("#cbFiltroFicha", el).f; i.focus(); i.setSelectionRange(pos, pos); };
    fm.onsubmit = e => e.preventDefault();
  }

  async function abaGrupos(el) {
    if (ui.grupo) return conversa(el, ui.grupo);
    const f = ui.filtroGrupo.toLowerCase();
    const lista = dados.grupos.filter(g => !f || (g.nome || "").toLowerCase().includes(f));
    el.innerHTML = `
      <form class="inline" id="cbFiltroGrupo" style="margin-bottom:12px"><label class="f" style="flex:1 1 260px">Filtrar grupos<input name="f" value="${esc(ui.filtroGrupo)}" placeholder="Ex.: Prisma, EV, Own the Sun" autocomplete="off"></label></form>
      <div class="table-wrap"><table><thead><tr><th>Grupo</th><th class="n">Últimos 7 dias</th><th class="n">Total</th><th>Última mensagem</th></tr></thead><tbody>
        ${lista.slice(0, 400).map(g => `<tr class="clickable" data-g="${esc(g.jid)}"><td>${esc(g.nome || g.jid)}</td><td class="n">${g.n7 ? `<b>${g.n7}</b>` : "—"}</td><td class="n">${fmt.num(g.total || 0, 0)}</td><td>${esc(quando(g.ultima))}</td></tr>`).join("")}
      </tbody></table></div>`;
    const fm = $("#cbFiltroGrupo", el);
    fm.f.oninput = () => { ui.filtroGrupo = fm.f.value; const pos = fm.f.selectionStart; abaGrupos(el); const i = $("#cbFiltroGrupo", el).f; i.focus(); i.setSelectionRange(pos, pos); };
    fm.onsubmit = e => e.preventDefault();
    $$("tr[data-g]", el).forEach(tr => tr.onclick = () => { ui.grupo = tr.dataset.g; abaGrupos(el); });
  }

  async function conversa(el, jid) {
    const g = dados.grupos.find(x => x.jid === jid) || { nome: jid };
    el.innerHTML = `<div class="loading">Abrindo a conversa…</div>`;
    let msgs;
    try { msgs = await api(`cerebro/conversa?jid=${encodeURIComponent(jid)}`); } catch (e) { el.innerHTML = `<div class="note bad">${esc(e.message)}</div>`; return; }
    const ficha = dados.fichas.find(x => (x.grupos || []).some(z => z === jid || z === g.nome));
    el.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap"><button type="button" class="btn ghost sm" id="cbVoltar">‹ Grupos</button><h2 style="margin:0">${esc(g.nome)}</h2>${ficha ? `<span class="muted">· ficha: ${esc(ficha.nome)}</span>` : ""}</div>
      ${ficha ? `<div class="note" style="margin-bottom:12px"><b>Situação:</b> ${esc(ficha.situacao || "—")}</div>` : ""}
      <div class="card cb-conversa">${msgs.length ? msgs.map(m => mensagem(m)).join("") : `<p class="muted">Nenhuma mensagem ainda.</p>`}</div>
      <p class="muted" style="font-size:11.5px">Mostrando as últimas ${msgs.length} mensagens.</p>`;
    $("#cbVoltar", el).onclick = () => { ui.grupo = null; abaGrupos(el); };
    ligar(el);
    const c = $(".cb-conversa", el); c.scrollTop = c.scrollHeight;
  }

  async function abaBusca(el) {
    if (!ui.busca) { el.innerHTML = `<div class="note">Escreva acima o que procura: nome de cliente, usina, equipamento, valor… A busca olha as mensagens e o texto dos áudios.</div>`; return; }
    el.innerHTML = `<div class="loading">Buscando…</div>`;
    let r;
    try { r = await api(`cerebro/buscar?q=${encodeURIComponent(ui.busca)}`); } catch (e) { el.innerHTML = `<div class="note bad">${esc(e.message)}</div>`; return; }
    el.innerHTML = r.length
      ? `<p class="muted">${r.length} resultado(s) para "${esc(ui.busca)}" — os que têm todas as palavras vêm primeiro.</p><div class="card cb-conversa cb-busca">${r.map(m => mensagem(m, ui.busca, true)).join("")}</div>`
      : `<div class="note">Nada encontrado para "${esc(ui.busca)}".</div>`;
    ligar(el);
  }

  window.P3.register("cerebro", { render });
})();
