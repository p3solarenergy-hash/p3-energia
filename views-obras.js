// Obras: o que a P3 executa (Uby, terceiros e vendas próprias). Cada obra pode ser lançada de dois jeitos:
//  • valor fechado: venda e custo (ou custo aberto em material / mão de obra / outros);
//  • orçamento detalhado: os itens do modelo "Orçamento Projeto" das planilhas de carregadores.
// E, para acompanhar a obra, os lançamentos: pagamentos feitos e recebimentos do contratante.
(function () {
  "use strict";
  const { esc, $, $$, fmt, api, toast, opts, modal, confirmar, formData, kpi, badge } = window.P3;
  const n = v => { if (v == null || v === "") return 0; if (typeof v === "number") return v; const s = String(v).trim(); const x = Number(/,/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s); return Number.isFinite(x) ? x : 0; };
  const brl = v => fmt.brl(v);
  const brlK = v => { const a = Math.abs(v); return a >= 1e6 ? `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi` : a >= 1e3 ? `R$ ${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil` : brl(v); };
  const pct = v => `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  const dec = (v, d = 2) => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: d });

  const CONTRATANTE = { uby: "Uby", terceiro: "Terceiro", p3: "P3 (venda própria)" };
  const STATUS = { orcamento: ["Orçamento", "info"], andamento: ["Em andamento", "warn"], concluida: ["Concluída", "ok"], cancelada: ["Cancelada", "bad"] };
  const TIPOS = ["Eletroposto DC", "Carregador EV comercial", "Carregador EV residencial", "Usina solar", "Sistema solar residencial", "Sistema solar comercial", "Manutenção", "Outros"];
  const CATEGORIAS = ["Equipamentos", "Infra elétrica", "Obra civil", "TI & Telecom", "Segurança", "Sinalização", "Engenharia", "Licenças", "Implantação", "Logística", "Proteção", "Projetos", "Limpeza", "Mão de obra", "Material", "Outros"];
  // Modelo das planilhas de carregadores (aba "Orçamento Projeto"). Quantidade zerada: você preenche o que entra.
  const MODELO = [
    ["Equipamentos", "Carregador DC", "un", 62000, false], ["Equipamentos", "Carregador AC", "un", 3000, true],
    ["Infra elétrica", "Adequação rede (COPEL)", "un", 5000, true], ["Infra elétrica", "Transformador / cabine primária", "un", 7889, true],
    ["Infra elétrica", "Padrão de Energia", "un", 7500, true], ["Infra elétrica", "Quadros elétricos / proteções", "un", 20000, true],
    ["Infra elétrica", "Cabos, eletrodutos, leitos", "un", 5000, true], ["Infra elétrica", "Smartcharging", "un", 2500, true],
    ["Obra civil", "Base/piso, fundações, drenagem", "un", 2400, true], ["Obra civil", "Cobertura / abrigo", "un", 12000, true],
    ["Obra civil", "Serralheria", "un", 3300, true], ["Obra civil", "Terraplanagem", "un", 250, true], ["Obra civil", "Brita", "m³", 386, true],
    ["Obra civil", "Hora máquina", "hr", 250, true], ["Obra civil", "Muro novo", "m²", 250, true], ["Obra civil", "Reboco muro existente", "m²", 50, true],
    ["Obra civil", "Pintura — Mão de obra", "m²", 30, true], ["Obra civil", "Pintura — Material", "m²", 30, true],
    ["TI & Telecom", "Link internet / roteador / switch", "lote", 500, true], ["Segurança", "CFTV / controle de acesso", "un", 500, true],
    ["Segurança", "Iluminação", "un", 100, true], ["Segurança", "Postes", "un", 600, true], ["Sinalização", "Sinalização horizontal / vertical", "un", 1000, true],
    ["Engenharia", "Projeto elétrico / civil + ART", "kW", 100, true], ["Licenças", "Aprovações / alvarás / concessionária", "un", 2000, true],
    ["Implantação", "Instalação e comissionamento", "kW", 70, true], ["Logística", "Descarregamento", "un", 400, true], ["Logística", "Frete", "un", 2000, true],
    ["Logística", "Deslocamento", "km", 2, true], ["Proteção", "Capa antichamas", "un", 4535, true], ["Proteção", "Extintores", "un", 1600, true],
    ["Proteção", "Macaco aranha", "un", 600, true], ["Proteção", "Exaustor", "un", 5000, true], ["Proteção", "Seguro de obra", "un", 1564, true],
    ["Projetos", "Projeto arquitetônico", "un", 2000, true], ["Limpeza", "Caçamba", "un", 300, true]
  ].map(([categoria, item, unid, unit, imp]) => ({ categoria, item, unid, qtd: 0, unit, imp }));

  // Mesmo cálculo da planilha: itens (+ imposto nos que levam), administração de obra (+ imposto sobre ela),
  // desenvolvimento/gestão sobre o subtotal e desconto. Se há valor contratado, ele é a venda.
  function calc(o) {
    const imp = n(o.imposto_pct) / 100;
    const pag = (o.lancamentos || []).filter(l => l.tipo !== "recebimento").reduce((s, l) => s + n(l.valor), 0);
    const rec = (o.lancamentos || []).filter(l => l.tipo === "recebimento").reduce((s, l) => s + n(l.valor), 0);
    if (o.modo === "detalhado") {
      const linhas = (o.itens || []).map(i => { const sub = n(i.qtd) * n(i.unit); const im = i.imp === false ? 0 : sub * imp; return { sub, im, tot: sub + im }; });
      const sub = linhas.reduce((s, l) => s + l.sub, 0), imps = linhas.reduce((s, l) => s + l.im, 0), itens = sub + imps;
      const admin = itens * n(o.admin_pct) / 100, impAdmin = admin * imp, gestao = sub * n(o.gestao_pct) / 100, desconto = n(o.desconto);
      const capex = itens + admin + gestao - desconto;
      const custo = itens + impAdmin;
      const venda = n(o.valor_contratado) || capex;
      return { linhas, sub, imps, itens, admin, impAdmin, gestao, desconto, capex, custo, venda, lucro: venda - custo, margem: venda ? (venda - custo) / venda : 0, pag, rec };
    }
    const aberto = n(o.custo_material) + n(o.custo_mao_obra) + n(o.custo_outros);
    const custo = aberto > 0 ? aberto : n(o.custo), venda = n(o.venda);
    return { custo, venda, lucro: venda - custo, margem: venda ? (venda - custo) / venda : 0, pag, rec };
  }
  const dataRef = o => o.data_fim || o.data_inicio || "";
  const ano = o => dataRef(o).slice(0, 4) || "Sem data";

  const filtro = { contratante: "todos", ano: "todos", status: "todos", busca: "", ordem: ["data", -1] };

  // ───────── gráficos (SVG simples, nas cores da marca) ─────────
  function barrasAno(grupos) {
    if (!grupos.length) return `<p class="muted">Sem obras com data.</p>`;
    const W = 560, H = 210, pe = 26, topo = 16, max = Math.max(1, ...grupos.map(g => g.venda));
    const larg = (W - 20) / grupos.length, b = Math.min(34, larg / 2.6);
    const y = v => topo + (H - pe - topo) * (1 - v / max);
    return `<svg viewBox="0 0 ${W} ${H}" class="ob-svg" role="img" aria-label="Faturamento e lucro por ano">
      ${grupos.map((g, i) => { const x = 10 + i * larg + larg / 2, l = Math.max(0, g.lucro); return `
        <rect x="${x - b - 1}" y="${y(g.venda)}" width="${b}" height="${H - pe - y(g.venda)}" rx="3" fill="var(--brand)"><title>${esc(g.k)}: faturamento ${brl(g.venda)}</title></rect>
        <rect x="${x + 1}" y="${y(l)}" width="${b}" height="${H - pe - y(l)}" rx="3" fill="var(--lime)"><title>${esc(g.k)}: lucro ${brl(g.lucro)} (${pct(g.venda ? g.lucro / g.venda : 0)})</title></rect>
        <text x="${x - b / 2 - 1}" y="${y(g.venda) - 5}" text-anchor="middle" class="ob-v">${brlK(g.venda).replace("R$ ", "")}</text>
        <text x="${x}" y="${H - 8}" text-anchor="middle" class="ob-l">${esc(g.k)}</text>`; }).join("")}
      <line x1="0" x2="${W}" y1="${H - pe}" y2="${H - pe}" stroke="var(--line)"/></svg>
      <div class="legend"><span><i style="background:var(--brand)"></i>Faturamento</span><span><i style="background:var(--lime)"></i>Lucro</span></div>`;
  }
  function barrasH(grupos) {
    if (!grupos.length) return `<p class="muted">Sem dados.</p>`;
    const max = Math.max(1, ...grupos.map(g => g.venda));
    return `<div class="ob-h">${grupos.map(g => `<div class="ob-hl"><span title="${esc(g.k)}">${esc(g.k)}</span><div><i style="width:${Math.max(1, g.venda / max * 100)}%"></i></div><b>${brlK(g.venda)}</b><small>${g.n} obra${g.n > 1 ? "s" : ""} · margem ${pct(g.venda ? g.lucro / g.venda : 0)}</small></div>`).join("")}</div>`;
  }
  const agrupar = (lista, chave) => {
    const m = new Map();
    for (const o of lista) { const k = chave(o); const g = m.get(k) || { k, n: 0, venda: 0, custo: 0, lucro: 0 }; g.n++; g.venda += o._c.venda; g.custo += o._c.custo; g.lucro += o._c.lucro; m.set(k, g); }
    return [...m.values()];
  };

  async function render(main) {
    main.innerHTML = `<div class="loading">Carregando as obras…</div>`;
    let obras;
    try { obras = await api("obras"); } catch (e) { main.innerHTML = `<div class="note bad">${esc(e.message)}</div>`; return; }
    if (window.P3.state.route !== "obras") return; // saiu da tela enquanto carregava
    obras.forEach(o => { o._c = calc(o); });
    desenhar(main, obras);
  }

  function desenhar(main, obras) {
    const anos = [...new Set(obras.map(ano))].sort().reverse();
    const F = filtro;
    const lista = obras.filter(o => (F.contratante === "todos" || (o.contratante || "p3") === F.contratante) && (F.ano === "todos" || ano(o) === F.ano) && (F.status === "todos" || (o.status || "concluida") === F.status)
      && (!F.busca || `${o.nome} ${o.tipo || ""} ${o.cidade || ""} ${o.vendedor || ""}`.toLowerCase().includes(F.busca.toLowerCase())));
    const validas = lista.filter(o => o.status !== "cancelada" && o.status !== "orcamento");
    const T = validas.reduce((t, o) => ({ venda: t.venda + o._c.venda, custo: t.custo + o._c.custo, lucro: t.lucro + o._c.lucro, kwp: t.kwp + n(o.kwp), pag: t.pag + o._c.pag, rec: t.rec + o._c.rec }), { venda: 0, custo: 0, lucro: 0, kwp: 0, pag: 0, rec: 0 });
    const andamento = lista.filter(o => o.status === "andamento").length, orcam = lista.filter(o => o.status === "orcamento").length;
    const porAno = agrupar(validas.filter(o => dataRef(o)), ano).sort((a, b) => a.k.localeCompare(b.k));
    const porTipo = agrupar(validas, o => o.tipo || "Sem tipo").sort((a, b) => b.venda - a.venda).slice(0, 8);
    const porCont = agrupar(validas, o => CONTRATANTE[o.contratante || "p3"]).sort((a, b) => b.venda - a.venda);
    const chip = (k, v, l) => `<button class="btn sm ${F[k] === v ? "primary" : ""}" data-f="${k}" data-v="${esc(v)}">${esc(l)}</button>`;
    const [col, dir] = F.ordem;
    const chaveOrd = { nome: o => o.nome.toLowerCase(), data: dataRef, venda: o => o._c.venda, custo: o => o._c.custo, lucro: o => o._c.lucro, margem: o => o._c.margem }[col];
    lista.sort((a, b) => { const x = chaveOrd(a), y = chaveOrd(b); return (x < y ? -1 : x > y ? 1 : 0) * dir; });
    const th = (c, l, r) => `<th class="${r ? "right" : ""}" data-o="${c}" style="cursor:pointer">${l}${col === c ? (dir > 0 ? " ▲" : " ▼") : ""}</th>`;
    const subObras = [andamento && `${andamento} em andamento`, orcam && `${orcam} em orçamento`].filter(Boolean).join(" · ") || (T.kwp ? `${dec(T.kwp, 1)} kWp solar` : "");

    main.innerHTML = `
      <div class="head"><div><p class="kicker">Execução</p><h1>Obras</h1><p>Obras que a P3 executa: Uby, terceiros e vendas próprias. Lance com valor fechado (venda e custo) ou pelo orçamento detalhado do modelo de carregadores.</p></div>
        <div class="actions"><button class="btn" id="novaSimples">+ Valor fechado</button><button class="btn primary" id="novaDet">+ Orçamento detalhado</button></div></div>
      <div class="ob-filtros">
        <div class="ob-chips">${chip("contratante", "todos", "Todas")}${chip("contratante", "uby", "Uby")}${chip("contratante", "terceiro", "Terceiros")}${chip("contratante", "p3", "P3")}</div>
        <select id="fAno" aria-label="Ano">${opts([["todos", "Todos os anos"], ...anos.map(a => [a, a])], F.ano)}</select>
        <select id="fStatus" aria-label="Situação">${opts([["todos", "Todas as situações"], ...Object.entries(STATUS).map(([k, [l]]) => [k, l])], F.status)}</select>
        <input id="fBusca" type="search" placeholder="Buscar obra, tipo, cidade…" value="${esc(F.busca)}">
      </div>
      <div class="kpis">
        ${kpi("Obras", String(lista.length), subObras, "lead")}
        ${kpi("Faturamento", brl(T.venda), validas.length ? `média de ${brlK(T.venda / validas.length)} por obra` : "")}
        ${kpi("Custo", brl(T.custo), T.pag ? `${brl(T.pag)} já pago` : "")}
        ${kpi("Lucro", brl(T.lucro), `margem de ${pct(T.venda ? T.lucro / T.venda : 0)}`)}
        ${T.rec ? kpi("Recebido", brl(T.rec), `falta ${brl(T.venda - T.rec)}`) : ""}
      </div>
      ${orcam ? `<p class="muted" style="font-size:12.5px;margin:6px 2px 0">Os números somam só obras em andamento e concluídas; orçamentos e canceladas ficam de fora.</p>` : ""}
      ${validas.length ? `<div class="grid2 section">
        <div class="card"><h2>Faturamento e lucro por ano</h2>${barrasAno(porAno)}</div>
        <div class="card"><h2>Por contratante</h2>${barrasH(porCont)}<h2 style="margin-top:16px">Por tipo de obra</h2>${barrasH(porTipo)}</div>
      </div>` : ""}
      <div class="card section"><h2>Obras <small class="muted">(${lista.length})</small></h2>
        ${lista.length ? `<div class="table-wrap" style="box-shadow:none"><table><thead><tr>${th("nome", "Obra")}<th>Contratante</th>${th("data", "Data")}<th>Situação</th>${th("venda", "Venda", 1)}${th("custo", "Custo", 1)}${th("lucro", "Lucro", 1)}${th("margem", "Margem", 1)}</tr></thead><tbody>
        ${lista.map(o => `<tr data-id="${esc(o.id)}" style="cursor:pointer"><td><b>${esc(o.nome)}</b><small>${esc([o.tipo, o.cidade, o.modo === "detalhado" ? "orçamento detalhado" : ""].filter(Boolean).join(" · "))}</small></td>
          <td>${esc(CONTRATANTE[o.contratante || "p3"])}</td><td>${esc(fmt.data(dataRef(o)))}</td><td>${badge(...(STATUS[o.status || "concluida"] || ["—", ""]))}</td>
          <td class="right">${brl(o._c.venda)}</td><td class="right">${brl(o._c.custo)}</td><td class="right" style="color:${o._c.lucro < 0 ? "var(--bad)" : "inherit"}">${brl(o._c.lucro)}</td><td class="right">${pct(o._c.margem)}</td></tr>`).join("")}
        </tbody></table></div>` : `<div class="empty">Nenhuma obra ${obras.length ? "com esses filtros" : "lançada ainda"}.</div>`}
      </div>`;

    $$("[data-f]", main).forEach(b => b.onclick = () => { filtro[b.dataset.f] = b.dataset.v; desenhar(main, obras); });
    $("#fAno").onchange = e => { filtro.ano = e.target.value; desenhar(main, obras); };
    $("#fStatus").onchange = e => { filtro.status = e.target.value; desenhar(main, obras); };
    let t; $("#fBusca").oninput = e => { clearTimeout(t); t = setTimeout(() => { filtro.busca = e.target.value; desenhar(main, obras); const i = $("#fBusca"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); };
    $$("th[data-o]", main).forEach(h => h.onclick = () => { filtro.ordem = [h.dataset.o, col === h.dataset.o ? -dir : (h.dataset.o === "nome" ? 1 : -1)]; desenhar(main, obras); });
    $$("tr[data-id]", main).forEach(r => r.onclick = () => editar(main, obras.find(o => o.id === r.dataset.id)));
    $("#novaSimples").onclick = () => editar(main, { modo: "simples", status: "concluida", contratante: "uby", lancamentos: [] });
    $("#novaDet").onclick = () => editar(main, { modo: "detalhado", status: "orcamento", contratante: "uby", tipo: "Eletroposto DC", imposto_pct: 6, admin_pct: 0, gestao_pct: 0, itens: MODELO.map(i => ({ ...i })), lancamentos: [] });
  }

  // ───────── cadastro / edição ─────────
  async function editar(main, orig) {
    const o = JSON.parse(JSON.stringify(orig)); delete o._c;
    o.itens = o.itens || []; o.lancamentos = o.lancamentos || [];
    const campo = (nome, rot, extra = "", cls = "") => `<label class="f ${cls}">${rot}<input name="${nome}" value="${esc(o[nome] ?? "")}" ${extra}></label>`;
    const html = `
      <div class="grid-form" id="obDados">
        ${campo("nome", "Obra", 'placeholder="Ex.: João Sampaio" autocomplete="off"', "wide")}
        <label class="f">Contratante<select name="contratante">${opts(Object.entries(CONTRATANTE), o.contratante || "uby")}</select></label>
        <label class="f">Tipo<input name="tipo" list="obTipos" value="${esc(o.tipo || "")}" placeholder="Ex.: Carregador EV residencial"><datalist id="obTipos">${TIPOS.map(t => `<option value="${esc(t)}">`).join("")}</datalist></label>
        <label class="f">Situação<select name="status">${opts(Object.entries(STATUS).map(([k, [l]]) => [k, l]), o.status || "concluida")}</select></label>
        ${campo("cidade", "Cidade / local")}
        ${campo("data_inicio", "Início", 'type="date"')}
        ${campo("data_fim", "Conclusão", 'type="date"')}
        ${campo("vendedor", "Responsável / vendedor")}
        ${campo("obs", "Observações", "", "wide")}
      </div>
      <details class="ob-mais" ${o.kwp || o.carregadores_dc || o.carregadores_ac || o.potencia_kw ? "open" : ""}><summary>Potência e carregadores</summary>
        <div class="grid-form" id="obPot">${campo("carregadores_dc", "Carregadores DC", 'inputmode="decimal"')}${campo("carregadores_ac", "Carregadores AC", 'inputmode="decimal"')}${campo("potencia_kw", "Potência (kW)", 'inputmode="decimal"')}${campo("kwp", "Solar (kWp)", 'inputmode="decimal"')}</div></details>
      <div class="ob-modo"><button type="button" class="btn sm" data-modo="simples">Valor fechado</button><button type="button" class="btn sm" data-modo="detalhado">Orçamento detalhado</button></div>
      <div id="obValores"></div>
      <h3 class="ob-h3">Pagamentos e recebimentos</h3>
      <p class="muted" style="margin:0 0 6px;font-size:12.5px">Recibos pagos na obra e cobranças recebidas do contratante, para comparar o orçado com o realizado.</p>
      <div id="obLanc"></div>
      <div id="obResumo" class="ob-resumo"></div>
      ${o.id ? `<p style="margin:14px 0 0"><button type="button" class="btn ghost sm danger" id="obExcluir">Excluir esta obra</button></p>` : ""}`;

    let bg;
    const p = modal(o.id ? o.nome : "Nova obra", html, {
      wide: true, saveLabel: "Salvar obra",
      onSave: async () => {
        Object.assign(o, formData($("#obDados", bg)), formData($("#obPot", bg)));
        if (!String(o.nome || "").trim()) throw new Error("Dê um nome para a obra.");
        const c = calc(o);
        const corpo = { ...o, venda: c.venda, custo: c.custo,
          itens: o.modo === "detalhado" ? o.itens.filter(i => n(i.qtd) || (i.item && !MODELO.some(m => m.item === i.item))) : [],
          lancamentos: o.lancamentos.filter(l => n(l.valor) || l.descricao) };
        if (o.modo !== "detalhado") corpo.valor_contratado = null;
        delete corpo.id; delete corpo.criado_em; delete corpo.atualizado_em;
        await api(o.id ? `obras/${encodeURIComponent(o.id)}` : "obras", { method: o.id ? "PUT" : "POST", body: corpo });
      }
    });
    bg = [...document.querySelectorAll(".modal-bg")].pop();

    const resumo = () => {
      const c = calc(o);
      $("#obResumo", bg).innerHTML = `
        <div><small>Venda</small><b>${brl(c.venda)}</b></div><div><small>Custo</small><b>${brl(c.custo)}</b></div>
        <div><small>Lucro</small><b style="color:${c.lucro < 0 ? "var(--bad)" : "var(--ok)"}">${brl(c.lucro)}</b><span>margem ${pct(c.margem)}</span></div>
        ${c.pag || c.rec ? `<div><small>Pago até agora</small><b>${brl(c.pag)}</b><span>${c.custo ? pct(c.pag / c.custo) + " do custo" : ""}</span></div><div><small>Recebido</small><b>${brl(c.rec)}</b><span>falta ${brl(c.venda - c.rec)}</span></div>` : ""}`;
      if (o.modo !== "detalhado") return;
      c.linhas.forEach((l, i) => { const td = $(`[data-tot="${i}"]`, bg); if (td) td.textContent = brl(l.tot); });
      const r = $("#obCapex", bg);
      if (r) r.innerHTML = `<tr><td>Itens</td><td class="right">${brl(c.sub)}</td></tr><tr><td>Impostos dos itens</td><td class="right">${brl(c.imps)}</td></tr>
        <tr><td><b>Subtotal com impostos</b></td><td class="right"><b>${brl(c.itens)}</b></td></tr>
        ${c.admin ? `<tr><td>(+) Administração de obra</td><td class="right">${brl(c.admin)}</td></tr><tr><td class="muted">imposto sobre a administração (entra no custo)</td><td class="right muted">${brl(c.impAdmin)}</td></tr>` : ""}
        ${c.gestao ? `<tr><td>(+) Desenvolvimento e gestão</td><td class="right">${brl(c.gestao)}</td></tr>` : ""}
        ${c.desconto ? `<tr><td>(−) Desconto / ajuste</td><td class="right">${brl(-c.desconto)}</td></tr>` : ""}
        <tr><td><b>CAPEX total</b></td><td class="right"><b>${brl(c.capex)}</b></td></tr>
        ${n(o.valor_contratado) ? `<tr><td>Valor contratado para a implantação</td><td class="right">${brl(n(o.valor_contratado))}</td></tr><tr><td><b>Saldo de obra</b></td><td class="right"><b>${brl(n(o.valor_contratado) - c.capex)}</b></td></tr>` : ""}`;
    };

    const valores = () => {
      $$("[data-modo]", bg).forEach(b => b.classList.toggle("primary", b.dataset.modo === o.modo));
      const box = $("#obValores", bg);
      if (o.modo !== "detalhado") {
        box.innerHTML = `<div class="grid-form">
          <label class="f">Venda (R$)<input data-o="venda" inputmode="decimal" value="${esc(o.venda ?? "")}" placeholder="6.000"></label>
          <label class="f">Custo total (R$)<input data-o="custo" inputmode="decimal" value="${esc(o.custo ?? "")}" placeholder="5.000"><small>ou abra nos campos ao lado</small></label>
          <label class="f">Material<input data-o="custo_material" inputmode="decimal" value="${esc(o.custo_material ?? "")}"></label>
          <label class="f">Mão de obra<input data-o="custo_mao_obra" inputmode="decimal" value="${esc(o.custo_mao_obra ?? "")}"></label>
          <label class="f">Outros (frete, deslocamento…)<input data-o="custo_outros" inputmode="decimal" value="${esc(o.custo_outros ?? "")}"></label></div>`;
        $$("[data-o]", box).forEach(i => i.oninput = () => {
          o[i.dataset.o] = i.value;
          const aberto = n(o.custo_material) + n(o.custo_mao_obra) + n(o.custo_outros);
          if (aberto > 0 && i.dataset.o !== "custo") { o.custo = aberto; $('[data-o="custo"]', box).value = dec(aberto); }
          resumo();
        });
        return resumo();
      }
      box.innerHTML = `<div class="grid-form">
          <label class="f">% impostos<input data-o="imposto_pct" inputmode="decimal" value="${esc(o.imposto_pct ?? 6)}"></label>
          <label class="f">% administração de obra<input data-o="admin_pct" inputmode="decimal" value="${esc(o.admin_pct ?? 0)}"></label>
          <label class="f">% desenvolvimento/gestão<input data-o="gestao_pct" inputmode="decimal" value="${esc(o.gestao_pct ?? 0)}"></label>
          <label class="f">Desconto / ajuste (R$)<input data-o="desconto" inputmode="decimal" value="${esc(o.desconto ?? "")}"></label>
          <label class="f">Valor contratado (R$)<input data-o="valor_contratado" inputmode="decimal" value="${esc(o.valor_contratado ?? "")}" placeholder="vazio = CAPEX"><small>quando há valor fechado para a implantação</small></label></div>
        <div class="ob-itens-wrap"><table class="ob-itens"><thead><tr><th>Categoria</th><th>Item</th><th>Un.</th><th class="right">Qtd</th><th class="right">Custo unit.</th><th title="Leva imposto">Imp.</th><th>Fornecedor</th><th class="right">Total</th><th></th></tr></thead><tbody id="obItens"></tbody></table></div>
        <p class="ob-acoes"><button type="button" class="btn sm" id="obAddItem">+ Item</button><button type="button" class="btn sm ghost" id="obModelo">Trazer itens do modelo</button><label class="muted"><input type="checkbox" id="obZerados"> mostrar itens zerados</label></p>
        <table class="ob-capex" id="obCapex"></table>`;
      $$("[data-o]", box).forEach(i => i.oninput = () => { o[i.dataset.o] = i.value; resumo(); });
      const zerados = $("#obZerados", box);
      zerados.checked = !o.id;
      const linhasItens = () => {
        $("#obItens", box).innerHTML = o.itens.map((it, i) => `<tr data-i="${i}" ${!zerados.checked && !n(it.qtd) && it.item ? "hidden" : ""}>
          <td><select data-k="categoria">${opts([...new Set([...(it.categoria ? [it.categoria] : []), ...CATEGORIAS])].map(c => [c, c]), it.categoria || "Outros")}</select></td>
          <td><input data-k="item" value="${esc(it.item || "")}" style="min-width:170px"></td><td><input data-k="unid" value="${esc(it.unid || "un")}" style="width:46px"></td>
          <td><input data-k="qtd" inputmode="decimal" value="${esc(it.qtd ?? 0)}" class="right" style="width:62px"></td><td><input data-k="unit" inputmode="decimal" value="${esc(it.unit ?? 0)}" class="right" style="width:96px"></td>
          <td style="text-align:center"><input type="checkbox" data-k="imp" ${it.imp === false ? "" : "checked"}></td><td><input data-k="fornecedor" value="${esc(it.fornecedor || "")}" style="width:110px"></td>
          <td class="right" data-tot="${i}"></td><td><button type="button" class="btn ghost sm" data-del="${i}" aria-label="Tirar item">✕</button></td></tr>`).join("");
        $$("#obItens [data-k]", box).forEach(inp => { const ev = inp.type === "checkbox" || inp.tagName === "SELECT" ? "onchange" : "oninput"; inp[ev] = () => { const it = o.itens[inp.closest("tr").dataset.i]; it[inp.dataset.k] = inp.type === "checkbox" ? inp.checked : inp.value; resumo(); }; });
        $$("#obItens [data-del]", box).forEach(b => b.onclick = () => { o.itens.splice(Number(b.dataset.del), 1); linhasItens(); resumo(); });
        resumo();
      };
      zerados.onchange = linhasItens;
      $("#obAddItem", box).onclick = () => { o.itens.push({ categoria: "Outros", item: "", unid: "un", qtd: 1, unit: 0, imp: true }); linhasItens(); $('[data-k="item"]', $$("#obItens tr", box).pop()).focus(); };
      $("#obModelo", box).onclick = () => { const tem = new Set(o.itens.map(i => i.item)); MODELO.filter(m => !tem.has(m.item)).forEach(m => o.itens.push({ ...m })); zerados.checked = true; linhasItens(); };
      linhasItens();
    };

    const lanc = () => {
      const box = $("#obLanc", bg);
      box.innerHTML = `${o.lancamentos.length ? `<div class="ob-itens-wrap"><table class="ob-itens"><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Fornecedor / pagador</th><th class="right">Valor</th><th></th></tr></thead><tbody>
        ${o.lancamentos.map((l, i) => `<tr data-i="${i}"><td><input type="date" data-k="data" value="${esc(l.data || "")}"></td>
          <td><select data-k="tipo">${opts([["pagamento", "Pagamento"], ["recebimento", "Recebimento"]], l.tipo || "pagamento")}</select></td>
          <td><input data-k="descricao" value="${esc(l.descricao || "")}" style="min-width:160px"></td><td><input data-k="parte" value="${esc(l.parte || "")}" style="width:130px"></td>
          <td><input data-k="valor" inputmode="decimal" class="right" value="${esc(l.valor ?? "")}" style="width:100px"></td><td><button type="button" class="btn ghost sm" data-del="${i}" aria-label="Tirar lançamento">✕</button></td></tr>`).join("")}
        </tbody></table></div>` : ""}
        <p class="ob-acoes"><button type="button" class="btn sm" data-novo="pagamento">+ Pagamento</button><button type="button" class="btn sm" data-novo="recebimento">+ Recebimento</button></p>`;
      $$("[data-k]", box).forEach(inp => { inp[inp.tagName === "SELECT" ? "onchange" : "oninput"] = () => { o.lancamentos[inp.closest("tr").dataset.i][inp.dataset.k] = inp.value; resumo(); }; });
      $$("[data-del]", box).forEach(b => b.onclick = () => { o.lancamentos.splice(Number(b.dataset.del), 1); lanc(); resumo(); });
      $$("[data-novo]", box).forEach(b => b.onclick = () => { o.lancamentos.push({ data: new Date().toISOString().slice(0, 10), tipo: b.dataset.novo, descricao: "", parte: "", valor: "" }); lanc(); $$('[data-k="descricao"]', box).pop().focus(); });
    };

    $$("[data-modo]", bg).forEach(b => b.onclick = () => {
      o.modo = b.dataset.modo;
      if (o.modo === "detalhado" && !o.itens.length) { o.itens = MODELO.map(i => ({ ...i })); if (o.imposto_pct == null) o.imposto_pct = 6; }
      valores();
    });
    if ($("#obExcluir", bg)) $("#obExcluir", bg).onclick = async () => {
      if (!await confirmar("Excluir obra", `A obra <b>${esc(o.nome)}</b> e os lançamentos dela saem da base. Fica registrado na auditoria.`, "Excluir")) return;
      try { await api(`obras/${encodeURIComponent(o.id)}`, { method: "DELETE" }); $("[data-x]", bg).click(); toast("Obra excluída.", "ok"); render(main); } catch (e) { toast(e.message, "bad"); }
    };
    o.modo = o.modo || "simples";
    valores(); lanc();
    if (await p) { toast("Obra salva.", "ok"); render(main); }
  }

  window.P3.register("obras", { render });
})();
