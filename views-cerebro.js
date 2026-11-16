// Cérebro: tudo o que passa nos grupos de trabalho do WhatsApp, num lugar só.
// Resumo do dia e fichas vivas (montados pelo Claude a partir das conversas), busca em mensagens e áudios
// transcritos, e a conversa de cada grupo com fotos, PDFs e áudios. Só leitura: nada daqui vai para o WhatsApp.
(function () {
  "use strict";
  const { api, fmt, esc, $, $$, kpi, badge, toast } = window.P3;
  const ui = { aba: "hoje", busca: "", grupo: null, filtroGrupo: "", ficha: "" };
  let dados = { grupos: [], fichas: [], resumos: [] };

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

  function mensagem(m, q, comGrupo) {
    const corpo = m.tipo === "audio"
      ? (m.transcricao ? `<span class="cb-audio">🎤</span> ${marca(m.transcricao, q)}` : `<span class="muted">🎤 Áudio${m.transcricao === "" ? " (sem fala)" : " — transcrevendo…"}</span>`)
      : (m.texto ? marca(m.texto, q).replace(/\n/g, "<br>") : `<span class="muted">${TIPO[m.tipo] || esc(m.tipo || "")}</span>`);
    const anexo = m.midia ? ` <button type="button" class="btn ghost sm" data-midia="${esc(m.midia)}">${m.tipo === "audio" ? "Ouvir" : "Abrir"} ${esc((TIPO[m.tipo] || "arquivo").replace(/^\S+\s/, "").toLowerCase())}</button>` : "";
    return `<div class="cb-msg ${m.autor === "eu" ? "eu" : ""}"><div class="cb-meta"><b>${esc(autor(m))}</b>${comGrupo ? ` · <a href="#" data-grupo="${esc(m.grupo_jid)}">${esc(m.grupo || "")}</a>` : ""} · ${esc(quando(m.enviado_em))}</div><div class="cb-txt">${corpo}${anexo}</div></div>`;
  }

  async function carregar() {
    const [grupos, fichas, resumos] = await Promise.all([api("cerebro/grupos"), api("cerebro/fichas"), api("cerebro/resumos")]);
    dados = { grupos: grupos || [], fichas: fichas || [], resumos: resumos || [] };
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
          ${dados.resumos.length > 1 ? `<div class="card"><h2>Dias anteriores</h2>${dados.resumos.slice(1).map(x => `<details class="cb-dia"><summary>${esc(fmt.data(x.dia))}</summary><div class="cb-resumo">${texto(x.texto)}</div></details>`).join("")}</div>` : ""}
        </div>
      </div>`;
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
    const lista = dados.fichas.filter(x => !f || `${x.nome} ${x.situacao || ""}`.toLowerCase().includes(f));
    el.innerHTML = `
      <form class="inline" id="cbFiltroFicha" style="margin-bottom:12px"><label class="f" style="flex:1 1 260px">Filtrar fichas<input name="f" value="${esc(ui.ficha)}" placeholder="Nome da usina, obra, cliente…" autocomplete="off"></label></form>
      ${lista.length ? `<div class="cb-fichas">${lista.map(x => `
        <div class="card cb-ficha">
          <div class="cb-ficha-top"><h2>${esc(x.nome)}</h2>${badge(tipos[x.tipo] || x.tipo, x.tipo === "obra" ? "info" : x.tipo === "usina" ? "ok" : "")}</div>
          <p class="cb-sit">${esc(x.situacao || "Sem situação registrada.")}</p>
          <details open><summary>Pendências (${(x.pendencias || []).length})</summary>${itens(x.pendencias, "Nada pendente.")}</details>
          <details><summary>Decisões (${(x.decisoes || []).length})</summary>${itens(x.decisoes, "Nenhuma decisão registrada.")}</details>
          ${(x.valores || []).length ? `<details><summary>Valores combinados (${x.valores.length})</summary>${itens(x.valores, "")}</details>` : ""}
          ${(x.documentos || []).length ? `<details><summary>Documentos (${x.documentos.length})</summary><ul class="cb-itens">${x.documentos.map(d => `<li>${d.midia ? `<a href="#" data-midia="${esc(d.midia)}">${esc(d.nome || "arquivo")}</a>` : esc(d.nome || "")}${d.data ? ` <small class="muted">${esc(fmt.data(d.data))}</small>` : ""}</li>`).join("")}</ul></details>` : ""}
          ${(x.contatos || []).length ? `<details><summary>Contatos</summary>${itens(x.contatos.map(c => typeof c === "string" ? c : `${c.nome || ""}${c.papel ? " — " + c.papel : ""}${c.telefone ? " · " + c.telefone : ""}`), "")}</details>` : ""}
          <p class="muted cb-rodape">${(x.grupos || []).map(g => { const gr = dados.grupos.find(z => z.jid === g || z.nome === g); return gr ? `<a href="#" data-grupo="${esc(gr.jid)}">${esc(gr.nome)}</a>` : esc(g); }).join(" · ")}${(x.grupos || []).length ? " · " : ""}atualizada ${esc(quando(x.atualizado_em))}</p>
        </div>`).join("")}</div>` : `<div class="note">${dados.fichas.length ? "Nenhuma ficha com esse nome." : "As fichas vivas aparecem aqui conforme o Claude lê as conversas."}</div>`}`;
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
