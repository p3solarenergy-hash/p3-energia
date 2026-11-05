// Notas fiscais ao cliente final. Cada usina pode ter regras: quem emite (P3 ou dono), em que dia do mês,
// o valor de costume e se a P3 repassa ao dono (ex.: Prisma — a P3 emite 100% e repassa; Valência — uma NF da P3
// e outra do dono). Todo mês a tela lembra as NFs que faltam e guarda o PDF de cada uma.
(function () {
  "use strict";
  const { esc, $, $$, fmt, api, toast, opts, modal, confirmar, formData, kpi, badge, db, nomeUsina, nomeDono, M } = window.P3;
  const n = v => { if (v == null || v === "") return 0; if (typeof v === "number") return v; let s = String(v).trim().replace(/[R$\s]/g, ""); if (/,/.test(s)) s = s.replace(/\./g, "").replace(",", "."); else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); const x = Number(s); return Number.isFinite(x) ? x : 0; };
  const EMITENTE = { p3: "P3", dono: "Dono da usina" };
  const AVISAR_ANTES = 5; // dias antes do dia de emitir em que o painel começa a lembrar

  const dados = { regras: [], notas: [], carregado: false, carregando: null };
  const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const vencimento = (comp, dia) => { const [a, m] = comp.split("-").map(Number); const ult = new Date(a, m, 0).getDate(); return `${comp}-${String(Math.min(dia, ult)).padStart(2, "0")}`; };
  const diasAte = iso => Math.round((new Date(iso + "T12:00:00") - new Date(hojeIso() + "T12:00:00")) / 864e5);

  async function carregar() {
    if (!dados.carregando) dados.carregando = Promise.all([api("nf_regras"), api("notas_fiscais")]).then(([r, nf]) => {
      dados.regras = r; dados.notas = nf; dados.carregado = true; dados.carregando = null; marcarMenu();
    }).catch(e => { dados.carregando = null; throw e; });
    return dados.carregando;
  }

  // NFs que faltam: para cada regra ativa, os meses desde que ela existe (no máximo os 3 últimos) sem NF lançada.
  function pendencias() {
    const mesHoje = hojeIso().slice(0, 7), out = [];
    for (const r of dados.regras.filter(r => r.ativo !== 0)) {
      const inicio = String(r.criado_em || "").slice(0, 7) || mesHoje;
      for (const comp of [M.addMonths(mesHoje, -2), M.addMonths(mesHoje, -1), mesHoje]) {
        if (comp < inicio) continue;
        if (dados.notas.some(x => x.regra_id === r.id && x.competencia === comp && x.status !== "cancelada")) continue;
        const venc = r.dia ? vencimento(comp, r.dia) : null;
        out.push({ regra: r, comp, venc, dias: venc ? diasAte(venc) : null });
      }
    }
    return out.sort((a, b) => (a.venc || "0") < (b.venc || "0") ? -1 : 1);
  }
  const urgentes = () => pendencias().filter(p => p.dias == null || p.dias <= AVISAR_ANTES);
  const repassesAbertos = () => dados.notas.filter(x => x.repasse_status === "pendente" && x.status !== "cancelada");
  const quando = p => p.dias == null ? badge("Defina o dia", "info") : p.dias < 0 ? badge(`Atrasada ${-p.dias} dia(s)`, "bad") : p.dias === 0 ? badge("Emitir hoje", "warn") : badge(`Em ${p.dias} dia(s) · ${fmt.data(p.venc)}`, p.dias <= AVISAR_ANTES ? "warn" : "");
  const acao = r => r.emitente === "dono" ? "Pegar a NF do dono" : "Emitir NF";

  function marcarMenu() {
    const el = $("#nfAlert"); if (!el) return;
    const q = urgentes().filter(p => p.dias == null || p.dias <= 0).length + repassesAbertos().length;
    el.hidden = !q; el.textContent = q;
  }

  // Aviso do painel (só o que vence em até 5 dias, está atrasado ou espera repasse).
  function aviso() {
    if (!dados.carregado) {
      carregar().then(() => { if (window.P3.state.route === "painel" && (urgentes().length || repassesAbertos().length)) window.P3.render(); }).catch(() => {});
      return "";
    }
    const u = urgentes(), rep = repassesAbertos();
    if (!u.length && !rep.length) return "";
    const ruim = u.some(p => p.dias != null && p.dias < 0);
    return `<div class="note ${ruim ? "bad" : "warn"}" style="margin-bottom:14px"><b>Notas fiscais:</b> ${u.map(p => `${esc(acao(p.regra))} · ${esc(nomeUsina(p.regra.usina_id))} (${esc(fmt.mes(p.comp))}) — ${p.dias == null ? "defina o dia" : p.dias < 0 ? `atrasada ${-p.dias} dia(s)` : p.dias === 0 ? "hoje" : `dia ${fmt.data(p.venc)}`}`).join("; ")}${u.length && rep.length ? ". " : ""}${rep.length ? `${rep.length} repasse(s) ao dono a fazer` : ""}. <a href="#/notas">Abrir notas fiscais →</a></div>`;
  }

  // ───────── tela ─────────
  const filtro = { usina: "", ano: "" };
  async function render(main) {
    main.innerHTML = `<div class="loading">Carregando as notas fiscais…</div>`;
    try { await carregar(); } catch (e) { main.innerHTML = `<div class="note bad">${esc(e.message)}</div>`; return; }
    if (window.P3.state.route !== "notas") return;
    desenhar(main);
  }

  function desenhar(main) {
    const pend = pendencias(), rep = repassesAbertos();
    const anos = [...new Set(dados.notas.map(x => x.competencia.slice(0, 4)))].sort().reverse();
    const lista = dados.notas.filter(x => (!filtro.usina || x.usina_id === filtro.usina) && (!filtro.ano || x.competencia.startsWith(filtro.ano)))
      .sort((a, b) => (b.competencia + (b.data_emissao || "")).localeCompare(a.competencia + (a.data_emissao || "")));
    const ano = hojeIso().slice(0, 4), doAno = dados.notas.filter(x => x.competencia.startsWith(ano) && x.status !== "cancelada" && x.emitente === "p3");
    const usinasCom = [...new Set(dados.regras.map(r => r.usina_id))];
    const atrasadas = pend.filter(p => p.dias != null && p.dias < 0).length;
    main.innerHTML = `
      <div class="head"><div><p class="kicker">Usinas</p><h1>Notas fiscais</h1><p>NFs emitidas ao cliente final: o lembrete do dia de emitir, o arquivo de cada uma e o repasse ao dono.</p></div>
        <div class="actions"><button class="btn primary" id="nfNova">+ Lançar NF</button></div></div>
      <div class="kpis">
        ${kpi("A emitir", String(pend.length), atrasadas ? `${atrasadas} atrasada(s)` : "neste e nos últimos meses", atrasadas ? "" : "lead")}
        ${kpi(`Emitido pela P3 em ${ano}`, fmt.brl(doAno.reduce((s, x) => s + n(x.valor), 0)), `${doAno.length} NF(s)`)}
        ${kpi("Repasses ao dono", fmt.brl(rep.reduce((s, x) => s + n(x.repasse_valor), 0)), `${rep.length} a fazer`)}
      </div>
      <div class="section"><div class="section-head"><div><h2>Para emitir</h2><p>Cada regra gera uma NF por mês. Lance a NF (com o PDF) para tirar daqui.</p></div></div>
        ${pend.length ? `<div class="table-wrap"><table><thead><tr><th>Usina</th><th>NF</th><th>Mês</th><th>Quando</th><th class="n">Valor de costume</th><th></th></tr></thead><tbody>
          ${pend.map((p, i) => `<tr><td><b>${esc(nomeUsina(p.regra.usina_id))}</b></td><td>${esc(p.regra.descricao || acao(p.regra))}<small>${esc(EMITENTE[p.regra.emitente] || "")} emite${p.regra.repasse ? " · repassa ao dono" : ""}</small></td><td>${esc(fmt.mes(p.comp))}</td><td>${quando(p)}</td><td class="n">${p.regra.valor_padrao ? fmt.brl(p.regra.valor_padrao) : "—"}</td>
            <td class="right"><button class="btn sm primary" data-pend="${i}">${p.regra.emitente === "dono" ? "Guardar NF do dono" : "Lançar NF"}</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="note ok">Nenhuma NF pendente.</div>`}</div>
      ${rep.length ? `<div class="section"><div class="section-head"><div><h2>Repasses ao dono</h2><p>NFs que a P3 emitiu e cujo valor do dono ainda não foi repassado.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Usina</th><th>Dono</th><th>Mês</th><th>NF</th><th class="n">Valor da NF</th><th class="n">Repassar</th><th></th></tr></thead><tbody>
        ${rep.map(x => `<tr><td><b>${esc(nomeUsina(x.usina_id))}</b></td><td>${esc(nomeDono((db().by.usinas.get(x.usina_id) || {}).dono_id))}</td><td>${esc(fmt.mes(x.competencia))}</td><td>${esc(x.numero || "s/ nº")}</td><td class="n">${fmt.brl(x.valor)}</td><td class="n"><b>${fmt.brl(x.repasse_valor)}</b>${x.gestao_valor != null || x.custo_pct ? `<small>− ${fmt.brl(x.gestao_valor)} gestão − ${fmt.brl(n(x.valor) * n(x.custo_pct) / 100)} NF</small>` : ""}</td>
          <td class="right"><button class="btn sm" data-repassei="${esc(x.id)}">Marcar repassado</button></td></tr>`).join("")}</tbody></table></div></div>` : ""}
      <div class="section"><div class="section-head"><div><h2>Regras por usina</h2><p>Quem emite, o dia do mês e o valor de costume. Clique para editar.</p></div><button class="btn" id="nfRegraNova">+ Regra</button></div>
        <div class="table-wrap"><table><thead><tr><th>Usina</th><th>NF</th><th>Quem emite</th><th>Tomador</th><th class="n">Dia</th><th class="n">Valor de costume</th><th>Repasse</th></tr></thead><tbody>
        ${dados.regras.map(r => `<tr class="clickable" data-regra="${esc(r.id)}"><td><b>${esc(nomeUsina(r.usina_id))}</b></td><td>${esc(r.descricao || "")}${r.ativo === 0 ? ` ${badge("Pausada", "")}` : ""}</td><td>${esc(EMITENTE[r.emitente] || r.emitente)}</td><td>${esc(r.tomador || "—")}</td><td class="n">${r.dia ? `dia ${r.dia}` : `<span class="neg">definir</span>`}</td><td class="n">${r.valor_padrao ? fmt.brl(r.valor_padrao) : "—"}</td><td>${r.repasse ? `Repassa ao dono${r.custo_pct ? ` · desconta gestão e ${fmt.pctN(r.custo_pct)} da NF` : " · desconta gestão"}` : "—"}</td></tr>`).join("") || `<tr><td colspan="7" class="empty">Nenhuma regra. Crie uma para cada NF que se repete todo mês.</td></tr>`}</tbody></table></div></div>
      <div class="section"><div class="section-head"><div><h2>NFs lançadas</h2></div>
        <div class="actions"><select id="nfFUsina">${opts(db().usinas.map(u => [u.id, u.nome]), filtro.usina, "Todas as usinas")}</select><select id="nfFAno">${opts(anos.map(a => [a, a]), filtro.ano, "Todos os anos")}</select></div></div>
        <div class="table-wrap"><table><thead><tr><th>Mês</th><th>Usina</th><th>Quem emitiu</th><th>Nº</th><th>Emissão</th><th>Tomador</th><th class="n">Valor</th><th>Repasse</th><th></th></tr></thead><tbody>
        ${lista.map(x => `<tr class="clickable" data-nf="${esc(x.id)}"><td>${esc(fmt.mes(x.competencia))}</td><td><b>${esc(nomeUsina(x.usina_id))}</b></td><td>${esc(EMITENTE[x.emitente] || x.emitente)}${x.status === "cancelada" ? ` ${badge("Cancelada", "bad")}` : ""}</td><td>${esc(x.numero || "—")}</td><td>${fmt.data(x.data_emissao)}</td><td>${esc(x.tomador || "—")}</td><td class="n">${fmt.brl(x.valor)}</td>
          <td>${x.repasse_status === "pendente" ? badge(`A repassar ${fmt.brl(x.repasse_valor)}`, "warn") : x.repasse_status === "pago" ? badge(`Repassado${x.repasse_em ? " " + fmt.data(x.repasse_em) : ""}`, "ok") : "—"}</td>
          <td class="right">${x.arquivo ? `<button class="btn ghost sm" data-arq="${esc(x.arquivo)}" title="Abrir o arquivo da NF">📎</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="9" class="empty">Nenhuma NF lançada${filtro.usina || filtro.ano ? " com esse filtro" : ""}.</td></tr>`}</tbody></table></div></div>
      ${usinasCom.length < db().usinas.length ? `<p class="muted" style="font-size:12.5px">Usinas sem regra de NF: ${esc(db().usinas.filter(u => !usinasCom.includes(u.id)).map(u => u.nome).join(", "))}.</p>` : ""}`;

    $("#nfNova").onclick = () => editarNf(main, {});
    $("#nfRegraNova").onclick = () => editarRegra(main, { emitente: "p3", ativo: 1 });
    $$("[data-pend]", main).forEach(b => b.onclick = () => { const p = pend[Number(b.dataset.pend)]; editarNf(main, novaDaRegra(p.regra, p.comp)); });
    $$("[data-regra]", main).forEach(tr => tr.onclick = () => editarRegra(main, dados.regras.find(r => r.id === tr.dataset.regra)));
    $$("[data-nf]", main).forEach(tr => tr.onclick = e => { if (e.target.closest("[data-arq]")) return; editarNf(main, dados.notas.find(x => x.id === tr.dataset.nf)); });
    $$("[data-arq]", main).forEach(b => b.onclick = e => { e.stopPropagation(); window.P3_COMPROVANTE.abrirAnexo(b.dataset.arq); });
    $$("[data-repassei]", main).forEach(b => b.onclick = async () => {
      try { await api(`notas_fiscais/${encodeURIComponent(b.dataset.repassei)}`, { method: "PUT", body: { repasse_status: "pago", repasse_em: hojeIso() } }); await recarregar(main); toast("Repasse marcado.", "ok"); }
      catch (e) { toast(e.message, "bad"); }
    });
    $("#nfFUsina").onchange = e => { filtro.usina = e.target.value; desenhar(main); };
    $("#nfFAno").onchange = e => { filtro.ano = e.target.value; desenhar(main); };
  }
  async function recarregar(main) { dados.carregado = false; await carregar(); desenhar(main); }

  // Repasse ao dono numa NF que a P3 emite por inteiro: valor recebido − gestão da P3 − custo da NF (% sobre o valor).
  // Ex.: Prisma: 5.000 − 500 de gestão − 6% (300) = 4.200 ao dono.
  const r2 = v => Math.round(v * 100) / 100;
  function gestaoDa(usinaId, valor) {
    const u = db().by.usinas.get(usinaId) || {};
    if (u.gestao_modo === "valor" && u.gestao_valor != null) return n(u.gestao_valor);
    if (u.gestao_pct) return r2(valor * n(u.gestao_pct) / 100);
    return 0;
  }
  const repasse = (valor, gestao, pct) => { const custo = r2(n(valor) * n(pct) / 100); return { custo, liquido: Math.max(0, r2(n(valor) - n(gestao) - custo)) }; };
  function novaDaRegra(r, comp) {
    const valor = r.valor_padrao || null, gestao = r.repasse && valor ? gestaoDa(r.usina_id, valor) : null;
    return { regra_id: r.id, usina_id: r.usina_id, competencia: comp, emitente: r.emitente, tomador: r.tomador || "", valor, status: "emitida",
      custo_pct: r.custo_pct ?? null, gestao_valor: gestao,
      repasse_status: r.repasse ? "pendente" : "", repasse_valor: r.repasse && valor ? repasse(valor, gestao, r.custo_pct).liquido : null, data_emissao: hojeIso() };
  }

  // Lê o PDF/foto da NF para sugerir número, valor e data.
  function lerNf(texto) {
    const t = texto.replace(/\r/g, "");
    const numero = (t.match(/N[úu]mero\s+da\s+NFS-?e\s*[:\s]*(\d{1,12})/i) || t.match(/NFS-?e\s*(?:n[º°o.]*)?\s*[:\s]\s*(\d{1,12})/i) || t.match(/N[úu]mero(?:\s+da\s+nota)?\s*[:\n]\s*(\d{1,12})/i) || [])[1] || "";
    const v = (t.match(/Valor\s+(?:L[íi]quido(?:\s+da\s+NFS-?e)?|Total(?:\s+da\s+Nota)?|dos?\s+Servi[çc]os?)[^\d]{0,40}([\d.]+,\d{2})/i) || [])[1];
    const d = (t.match(/(?:Data\s*(?:e\s*Hora\s*)?(?:da\s*|de\s*)?Emiss[ãa]o)[^\d]{0,40}(\d{2})\/(\d{2})\/(\d{4})/i) || t.match(/(\d{2})\/(\d{2})\/(\d{4})/) || []);
    const base = window.P3_COMPROVANTE ? window.P3_COMPROVANTE.interpretar(texto, "") : {};
    return { numero, valor: v ? n(v) : base.valor || null, data_emissao: d[3] ? `${d[3]}-${d[2]}-${d[1]}` : base.data || "" };
  }

  async function editarNf(main, orig) {
    const x = { status: "emitida", emitente: "p3", competencia: hojeIso().slice(0, 7), ...orig };
    let arquivo = null;
    const regrasDa = u => dados.regras.filter(r => r.usina_id === u);
    const campo = (nome, rot, extra = "", cls = "") => `<label class="f ${cls}">${rot}<input name="${nome}" value="${esc(x[nome] ?? "")}" ${extra}></label>`;
    const html = `
      <div class="grid-form" id="nfForm">
        <label class="f">Usina<select name="usina_id">${opts(db().usinas.map(u => [u.id, u.nome]), x.usina_id, "Escolha…")}</select></label>
        <label class="f">Regra<select name="regra_id">${opts(regrasDa(x.usina_id).map(r => [r.id, r.descricao || EMITENTE[r.emitente]]), x.regra_id, "Avulsa (sem regra)")}</select></label>
        ${campo("competencia", "Mês da NF", 'type="month"')}
        <label class="f">Quem emitiu<select name="emitente">${opts(Object.entries(EMITENTE), x.emitente)}</select></label>
        ${campo("numero", "Número da NF", 'autocomplete="off"')}
        ${campo("data_emissao", "Data de emissão", 'type="date"')}
        ${campo("valor", "Valor (R$)", 'inputmode="decimal"')}
        ${campo("tomador", "Tomador (cliente)")}
        <label class="f">Repasse ao dono<select name="repasse_status">${opts([["", "Não há"], ["pendente", "A repassar"], ["pago", "Repassado"]], x.repasse_status || "")}</select></label>
        ${campo("gestao_valor", "Gestão P3 (R$)", 'inputmode="decimal"')}
        ${campo("custo_pct", "Custo da NF (%)", 'inputmode="decimal" placeholder="Ex.: 6"')}
        ${campo("repasse_valor", "Valor a repassar (R$)", 'inputmode="decimal"')}
        <p class="muted wide" id="nfConta" style="margin:0;font-size:12.5px"></p>
        ${campo("repasse_em", "Repassado em", 'type="date"')}
        <label class="f">Situação<select name="status">${opts([["emitida", "Emitida"], ["cancelada", "Cancelada"]], x.status)}</select></label>
        ${campo("obs", "Observações", "", "wide")}
        <label class="f wide">Arquivo da NF (PDF ou foto)<input type="file" id="nfArq" accept="application/pdf,image/*"><small id="nfArqMsg">${x.arquivo ? `Já tem arquivo. <a href="#" id="nfVer">Abrir</a> · escolher outro substitui.` : "O número, o valor e a data são lidos do arquivo."}</small></label>
      </div>
      ${x.id ? `<p style="margin:14px 0 0"><button type="button" class="btn ghost sm danger" id="nfExcluir">Excluir esta NF</button></p>` : ""}`;
    const salvo = modal(x.id ? `NF ${x.numero || ""} · ${nomeUsina(x.usina_id)}` : "Lançar NF", html, {
      wide: true,
      onSave: async el => {
        const f = formData(el);
        if (!f.usina_id) throw new Error("Escolha a usina.");
        for (const k of ["valor", "repasse_valor", "gestao_valor", "custo_pct"]) f[k] = f[k] === "" ? null : n(f[k]);
        if (!f.repasse_status) { f.repasse_status = null; f.repasse_valor = null; f.repasse_em = null; f.gestao_valor = null; }
        if (f.repasse_status === "pago" && !f.repasse_em) f.repasse_em = hojeIso();
        if (!f.regra_id) f.regra_id = null;
        if (arquivo) {
          $("[data-msg]", el).textContent = "Enviando o arquivo…";
          const r = await api("anexo", { method: "POST", raw: true, body: arquivo, headers: { "X-Nome": encodeURIComponent(arquivo.name || "nf"), "X-Usina": f.usina_id } });
          f.arquivo = r.caminho;
        }
        return x.id ? api(`notas_fiscais/${encodeURIComponent(x.id)}`, { method: "PUT", body: f }) : api("notas_fiscais", { method: "POST", body: f });
      }
    });
    const bgs = document.querySelectorAll(".modal-bg"), bg = bgs[bgs.length - 1];
    const sel = nm => $(`[name="${nm}"]`, bg);
    sel("usina_id").onchange = () => { sel("regra_id").innerHTML = opts(regrasDa(sel("usina_id").value).map(r => [r.id, r.descricao || EMITENTE[r.emitente]]), "", "Avulsa (sem regra)"); };
    // Conta do repasse: refeita sempre que muda o valor, a gestão ou o custo da NF (o valor final pode ser ajustado à mão).
    const fmtIn = v => v == null || v === "" ? "" : String(v).replace(".", ",");
    const conta = () => {
      const tem = !!sel("repasse_status").value;
      ["gestao_valor", "custo_pct", "repasse_valor"].forEach(k => { sel(k).closest("label").style.display = tem ? "" : "none"; });
      const el = $("#nfConta", bg);
      if (!tem) { el.textContent = ""; return; }
      const v = n(sel("valor").value), g = n(sel("gestao_valor").value), c = repasse(v, g, sel("custo_pct").value);
      el.textContent = `${fmt.brl(v)} recebidos − ${fmt.brl(g)} de gestão − ${fmt.brl(c.custo)} de custo da NF (${fmt.pctN(n(sel("custo_pct").value))}) = ${fmt.brl(c.liquido)} ao dono`;
    };
    const recalcular = () => {
      if (!sel("repasse_status").value) return conta();
      const v = n(sel("valor").value);
      if (sel("gestao_valor").value === "" && v) sel("gestao_valor").value = fmtIn(gestaoDa(sel("usina_id").value, v));
      if (v) sel("repasse_valor").value = fmtIn(repasse(v, sel("gestao_valor").value, sel("custo_pct").value).liquido);
      conta();
    };
    sel("regra_id").onchange = () => {
      const r = dados.regras.find(y => y.id === sel("regra_id").value); if (!r) return;
      sel("emitente").value = r.emitente; if (r.tomador && !sel("tomador").value) sel("tomador").value = r.tomador;
      if (r.valor_padrao && !sel("valor").value) sel("valor").value = fmtIn(r.valor_padrao);
      if (r.custo_pct != null) sel("custo_pct").value = fmtIn(r.custo_pct);
      if (r.repasse && !sel("repasse_status").value) sel("repasse_status").value = "pendente";
      recalcular();
    };
    sel("repasse_status").onchange = recalcular;
    ["valor", "gestao_valor", "custo_pct"].forEach(k => { sel(k).oninput = recalcular; });
    sel("repasse_valor").oninput = conta;
    for (const k of ["valor", "gestao_valor", "custo_pct", "repasse_valor"]) sel(k).value = fmtIn(sel(k).value);
    conta();
    const ver = $("#nfVer", bg); if (ver) ver.onclick = e => { e.preventDefault(); window.P3_COMPROVANTE.abrirAnexo(x.arquivo); };
    $("#nfArq", bg).onchange = async e => {
      arquivo = e.target.files[0]; if (!arquivo) return;
      const msg = $("#nfArqMsg", bg);
      if (arquivo.size > 15 * 1024 * 1024) { msg.textContent = "Arquivo grande demais (máximo de 15 MB)."; arquivo = null; return; }
      msg.textContent = "Lendo o arquivo…";
      try {
        const lido = lerNf(await window.P3_COMPROVANTE.ler(arquivo, t => { msg.textContent = t; }));
        const preenchidos = [];
        if (lido.numero && !sel("numero").value) { sel("numero").value = lido.numero; preenchidos.push("número"); }
        if (lido.valor) { sel("valor").value = String(lido.valor).replace(".", ","); preenchidos.push("valor"); }
        if (lido.data_emissao) { sel("data_emissao").value = lido.data_emissao; preenchidos.push("data"); }
        recalcular();
        msg.textContent = preenchidos.length ? `Lido: ${preenchidos.join(", ")}. Confira antes de salvar.` : "Não achei número/valor no arquivo: preencha à mão. O arquivo será guardado.";
      } catch (err) { msg.textContent = "Não consegui ler o arquivo, mas ele será guardado. Preencha à mão."; }
    };
    const exc = $("#nfExcluir", bg);
    if (exc) exc.onclick = async () => {
      if (!await confirmar("Excluir NF", "A NF sai da lista (o arquivo continua guardado na nuvem). Continuar?", "Excluir")) return;
      try { await api(`notas_fiscais/${encodeURIComponent(x.id)}`, { method: "DELETE" }); $("[data-x]", bg).click(); await recarregar(main); toast("NF excluída.", "ok"); }
      catch (e) { toast(e.message, "bad"); }
    };
    if (await salvo) { await recarregar(main); toast("NF salva.", "ok"); }
  }

  async function editarRegra(main, orig) {
    const r = { ...orig };
    const campo = (nome, rot, extra = "", cls = "") => `<label class="f ${cls}">${rot}<input name="${nome}" value="${esc(r[nome] ?? "")}" ${extra}></label>`;
    const html = `<div class="grid-form">
        <label class="f">Usina<select name="usina_id">${opts(db().usinas.map(u => [u.id, u.nome]), r.usina_id, "Escolha…")}</select></label>
        ${campo("descricao", "Descrição", 'placeholder="Ex.: NF da P3 ao cliente"')}
        <label class="f">Quem emite<select name="emitente">${opts(Object.entries(EMITENTE), r.emitente)}</select></label>
        ${campo("dia", "Dia de emitir (1 a 31)", 'type="number" min="1" max="31"')}
        ${campo("valor_padrao", "Valor de costume (R$)", 'inputmode="decimal"')}
        ${campo("custo_pct", "Custo da NF (%)", 'inputmode="decimal" placeholder="Ex.: 6"')}
        ${campo("tomador", "Tomador (cliente)")}
        <label class="f">Repasse ao dono<select name="repasse">${opts([["0", "Não"], ["1", "Sim: a P3 emite e repassa ao dono"]], String(r.repasse || 0))}</select></label>
        <label class="f">Situação<select name="ativo">${opts([["1", "Ativa"], ["0", "Pausada"]], String(r.ativo ?? 1))}</select></label>
        ${campo("obs", "Observações", "", "wide")}
      </div>
      <p class="muted" style="font-size:12.5px;margin:10px 0 0">Quando o dono emite a NF, a regra serve para lembrar de pegar a cópia com ele e guardar aqui.</p>
      ${r.id ? `<p style="margin:14px 0 0"><button type="button" class="btn ghost sm danger" id="nrExcluir">Excluir esta regra</button></p>` : ""}`;
    const salvo = modal(r.id ? "Regra de NF" : "Nova regra de NF", html, {
      onSave: async el => {
        const f = formData(el);
        if (!f.usina_id) throw new Error("Escolha a usina.");
        f.valor_padrao = f.valor_padrao === "" ? null : n(f.valor_padrao);
        f.custo_pct = f.custo_pct === "" ? null : n(f.custo_pct);
        f.dia = f.dia === "" ? null : Number(f.dia);
        f.repasse = Number(f.repasse); f.ativo = Number(f.ativo);
        return r.id ? api(`nf_regras/${encodeURIComponent(r.id)}`, { method: "PUT", body: f }) : api("nf_regras", { method: "POST", body: f });
      }
    });
    const bgs = document.querySelectorAll(".modal-bg"), bg = bgs[bgs.length - 1];
    const exc = $("#nrExcluir", bg);
    if (exc) exc.onclick = async () => {
      if (!await confirmar("Excluir regra", "As NFs já lançadas continuam guardadas; só para de lembrar. Continuar?", "Excluir")) return;
      try { await api(`nf_regras/${encodeURIComponent(r.id)}`, { method: "DELETE" }); $("[data-x]", bg).click(); await recarregar(main); toast("Regra excluída.", "ok"); }
      catch (e) { toast(e.message, "bad"); }
    };
    if (await salvo) { await recarregar(main); toast("Regra salva.", "ok"); }
  }

  window.P3_NF = { aviso, pendencias, carregar, lerNf };
  window.P3.register("notas", { render });
})();
