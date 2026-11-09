/* P3 · Gestão de Usinas — núcleo da tela: estado, API, rotas, utilidades. */
(function () {
  "use strict";
  const M = window.P3_MOTOR;
  const state = { db: null, views: {}, route: "", params: [] };

  // ───────── formatação ─────────
  const fmt = {
    brl: v => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
    num: (v, d = 0) => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }),
    kwh: v => `${Math.round(Number(v) || 0).toLocaleString("pt-BR")} kWh`,
    pct: v => `${((Number(v) || 0) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
    pctN: v => `${(Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`,
    data: iso => iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—",
    dataHora: iso => iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—",
    mes: mk => M.monthLabel(mk), mesLongo: mk => M.monthLong(mk),
    uc: n => { const s = String(n || ""); return s.length >= 11 ? s.padStart(15, "0") : s; }
  };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => [...(el || document).querySelectorAll(sel)];

  // ───────── API ─────────
  async function api(path, opts = {}) {
    const o = { method: opts.method || "GET", headers: { "X-P3": "1", ...(opts.headers || {}) } };
    if (opts.body !== undefined) {
      if (opts.raw) o.body = opts.body;
      else { o.body = JSON.stringify(opts.body); o.headers["Content-Type"] = "application/json"; }
    }
    const r = await fetch(`/api/${path}`, o);
    if (r.status === 401) { location.href = "login.html"; throw new Error("Sessão encerrada: entre de novo."); }
    const ct = r.headers.get("content-type") || "";
    const data = ct.includes("json") ? await r.json() : await r.text();
    if (!r.ok) throw new Error((data && data.erro) || `Erro ${r.status}`);
    return data;
  }
  const save = (t, data, id) => api(id ? `${t}/${encodeURIComponent(id)}` : t, { method: id ? "PUT" : "POST", body: data });
  const del = (t, id) => api(`${t}/${encodeURIComponent(id)}`, { method: "DELETE" });

  async function load() {
    state.db = await api("estado");
    const db = state.db;
    db.by = {
      usinas: new Map(db.usinas.map(x => [x.id, x])), donos: new Map(db.donos.map(x => [x.id, x])),
      clientes: new Map(db.clientes.map(x => [x.id, x])), ucs: new Map(db.ucs.map(x => [x.id, x]))
    };
    const n = db.faturas.length;
    $("#baseInfo").textContent = `Base na nuvem · ${db.usinas.length} usinas · ${n} faturas`;
    try {
      const c = window.P3_CONFERENCIA.conferir(db, db.hoje);
      const e = c.resumo.erro;
      const el = $("#navAlert"); el.hidden = !e; el.textContent = e;
      state.conferencia = c;
    } catch (_) {}
    return db;
  }

  // ───────── consultas comuns ─────────
  const db = () => state.db;
  const nomeUsina = id => (db().by.usinas.get(id) || {}).nome || "—";
  const nomeCliente = id => (db().by.clientes.get(id) || {}).nome || "—";
  const nomeDono = id => (db().by.donos.get(id) || {}).nome || "—";
  const ucNum = uc => uc ? fmt.uc(uc.numero || uc.numero_conces) : "—";
  const ucLabel = id => { const u = db().by.ucs.get(id); if (!u) return "—"; return `${ucNum(u)}${u.descricao ? " · " + u.descricao : ""}`; };
  const usinasDaUc = id => db().vinculos.filter(v => v.uc_id === id);
  const competencias = () => [...new Set(db().faturas.map(f => f.competencia))].sort();
  const mesAtual = () => (db().hoje || new Date().toISOString()).slice(0, 7);
  // Mês padrão das telas: o último com fatura lançada (ou o mês anterior ao atual).
  const mesPadrao = () => { const c = competencias(); return c[c.length - 1] || M.addMonths(mesAtual(), -1); };
  const calcMes = comp => M.calcMes(db(), comp);
  const ultimosMeses = (fim, n) => { const out = []; for (let i = n - 1; i >= 0; i--) out.push(M.addMonths(fim, -i)); return out; };

  // ───────── UI ─────────
  function toast(msg, kind) {
    const t = document.createElement("div");
    t.className = `toast ${kind || ""}`; t.textContent = msg;
    $("#toasts").appendChild(t);
    setTimeout(() => t.remove(), kind === "bad" ? 7000 : 3500);
  }
  const kpi = (label, value, sub, cls) => `<div class="kpi ${cls || ""}"><small>${esc(label)}</small><b>${value}</b>${sub ? `<span>${sub}</span>` : ""}</div>`;
  const badge = (txt, kind) => `<span class="badge ${kind || ""}">${esc(txt)}</span>`;
  const opts = (list, sel, empty) => `${empty !== undefined ? `<option value="">${esc(empty)}</option>` : ""}${list.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(sel ?? "") ? " selected" : ""}>${esc(l)}</option>`).join("")}`;
  const mesSelect = (id, sel, lista) => {
    const ms = lista || (() => { const c = competencias(); const fim = [mesAtual(), ...c].sort().pop(); const ini = c[0] || M.addMonths(fim, -11); return M.monthRange(M.addMonths(ini, -1) < ini ? ini : ini, fim).reverse(); })();
    return `<select id="${id}">${ms.map(m => `<option value="${m}"${m === sel ? " selected" : ""}>${esc(fmt.mesLongo(m))}</option>`).join("")}</select>`;
  };
  const STATUS = { aberto: ["Em aberto", "warn"], cobrado: ["Cobrado", "info"], recebido: ["Recebido", "ok"], repassado: ["Repassado ao dono", "ok"] };
  const statusBadge = s => { const [l, k] = STATUS[s] || [s, ""]; return badge(l, k); };

  function modal(title, bodyHtml, { onSave, saveLabel = "Salvar", wide, danger } = {}) {
    return new Promise(resolve => {
      const bg = document.createElement("div");
      bg.className = "modal-bg";
      bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}" style="${wide ? "width:min(1000px,100%)" : ""}">
        <header><h3>${esc(title)}</h3><button class="btn ghost" data-x aria-label="Fechar">✕</button></header>
        <div class="body">${bodyHtml}</div>
        ${onSave ? `<footer><span class="muted" data-msg style="margin-right:auto;font-size:13px"></span><button class="btn" data-x>Cancelar</button><button class="btn ${danger ? "danger" : "primary"}" data-ok>${esc(saveLabel)}</button></footer>` : ""}
      </div>`;
      const close = v => { bg.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
      const onKey = e => { if (e.key === "Escape") close(null); };
      document.addEventListener("keydown", onKey);
      bg.addEventListener("mousedown", e => { if (e.target === bg) close(null); });
      $$("[data-x]", bg).forEach(b => b.onclick = () => close(null));
      const okBtn = $("[data-ok]", bg);
      if (okBtn) okBtn.onclick = async () => {
        okBtn.disabled = true;
        try { const r = await onSave(bg); if (r !== false) close(r === undefined ? true : r); }
        catch (e) { $("[data-msg]", bg).textContent = e.message; $("[data-msg]", bg).style.color = "var(--bad)"; }
        finally { okBtn.disabled = false; }
      };
      document.body.appendChild(bg);
      const first = $("input, select, textarea", bg); if (first) first.focus();
    });
  }
  const confirmar = (title, msg, label) => modal(title, `<p>${msg}</p>`, { onSave: () => true, saveLabel: label || "Confirmar", danger: true });
  // Lê os campos [name] de um formulário para um objeto.
  const formData = el => {
    const o = {};
    $$("[name]", el).forEach(i => { o[i.name] = i.type === "checkbox" ? (i.checked ? 1 : 0) : i.value; });
    return o;
  };

  // ───────── gráfico simples (barras lado a lado) ─────────
  function chart(meses, series) {
    const max = Math.max(1, ...meses.flatMap(m => series.map(s => Math.abs(s.get(m)))));
    return `<div class="chart" role="img" aria-label="Gráfico mensal">${meses.map(m => `<div class="col" title="${esc(fmt.mesLongo(m.competencia || m))}\n${series.map(s => `${s.label}: ${fmt.brl(s.get(m))}`).join("\n")}"><div style="display:flex;gap:2px;align-items:flex-end;height:100%">${series.map(s => `<i class="${s.cls}" style="flex:1;height:${Math.max(1, Math.abs(s.get(m)) / max * 140)}px"></i>`).join("")}</div></div>`).join("")}</div>
      <div class="chart-l">${meses.map(m => `<span>${esc(fmt.mes(m.competencia || m))}</span>`).join("")}</div>
      <div class="legend">${series.map(s => `<span><i class="${s.cls}" style="background:${s.cls === "a" ? "var(--brand)" : "var(--lime)"}"></i>${esc(s.label)}</span>`).join("")}</div>`;
  }

  // ───────── rotas ─────────
  function register(name, view) { state.views[name] = view; }
  async function render() {
    const hash = location.hash.replace(/^#\/?/, "");
    const [name, ...params] = hash.split("/").map(decodeURIComponent);
    const route = name || "painel";
    state.route = route; state.params = params;
    $$("#nav a, #tabs a").forEach(a => a.classList.toggle("on", a.dataset.r === route));
    $("#side").classList.remove("open");
    const view = state.views[route] || state.views.painel;
    const main = $("#main");
    try { await view.render(main, params); } catch (e) { console.error(e); main.innerHTML = `<div class="note bad">Erro ao abrir a tela: ${esc(e.message)}</div>`; }
  }
  const go = h => { if (location.hash === h) render(); else location.hash = h; };
  const refresh = async () => { await load(); await render(); };

  async function start() {
    $("#menuBtn").onclick = () => $("#side").classList.toggle("open");
    $("#fundoMenu").onclick = () => $("#side").classList.remove("open");
    window.addEventListener("hashchange", render);
    try { await load(); } catch (e) { $("#main").innerHTML = `<div class="note bad">Não consegui abrir a base (${esc(e.message)}). Confira a internet e recarregue a página.</div>`; fecharAbertura(); return; }
    await render();
    fecharAbertura();
  }
  // Tela de abertura (logo) some quando a primeira tela fica pronta.
  function fecharAbertura() {
    const a = $("#abertura"); if (!a) return;
    a.classList.add("saindo");
    setTimeout(() => a.remove(), 400);
  }

  window.P3 = {
    state, api, save, del, load, refresh, render, go, register, start,
    fmt, esc, $, $$, kpi, badge, opts, mesSelect, statusBadge, STATUS, modal, confirmar, formData, toast, chart,
    db, nomeUsina, nomeCliente, nomeDono, ucNum, ucLabel, usinasDaUc, competencias, mesAtual, mesPadrao, calcMes, ultimosMeses, M
  };
})();
