// Obras: o que a P3 executa (Uby, terceiros e vendas próprias). Cada obra pode ser lançada de dois jeitos:
//  • valor fechado: venda e custo (ou custo aberto em material / mão de obra / outros);
//  • orçamento detalhado: os itens do modelo "Orçamento Projeto" das planilhas de carregadores.
// E, para acompanhar a obra, os lançamentos: pagamentos feitos e recebimentos do contratante.
(function () {
  "use strict";
  const { esc, $, $$, fmt, api, toast, opts, modal, confirmar, formData, kpi, badge } = window.P3;
  // Número digitado do jeito brasileiro: "6.000", "6.000,50", "6000,5" ou "6000.5".
  const n = v => {
    if (v == null || v === "") return 0; if (typeof v === "number") return v;
    let s = String(v).trim().replace(/[R$\s]/g, "");
    if (/,/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    const x = Number(s); return Number.isFinite(x) ? x : 0;
  };
  const NUMEROS = ["kwp", "carregadores_dc", "carregadores_ac", "potencia_kw", "custo_material", "custo_mao_obra", "custo_outros", "imposto_pct", "admin_pct", "gestao_pct", "desconto", "valor_contratado"];
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

  // ───────── obras solares: planilha de custos de obra solar (modelo TONIN 30 kW) ─────────
  // Custos por kWp conforme a instalação (telhado × solo), deslocamentos (R$ 1,75/km, ida e volta), hospedagem e
  // alimentação (R$ 300 por pessoa/dia) e itens à mão. Preço = custos + margem por kWp (R$ 620). Imposto:
  // tudo faturado pela P3 → 5,93% sobre o total; kit faturado direto ao cliente → 16,33% só sobre a NF de serviço da P3.
  const ehSolar = o => /solar|usina|fotovolt/i.test(o.tipo || "");
  const SOLAR_PADRAO = { instalacao: "telhado", km: 0, viagens_eng: 1, viagens_equipe: 1, pessoas: 4, dias: 5, margem_kwp: 620, faturamento: "p3", imp_total: 5.93, imp_servico: 16.33 };
  const solarDe = o => ({ ...SOLAR_PADRAO, ...(o.solar && !Array.isArray(o.solar) ? o.solar : {}) });
  // Itens do modelo solar. "auto" = quantidade e preço saem dos parâmetros; os demais são preenchidos à mão.
  function modeloSolar(o) {
    const s = solarDe(o), kwp = n(o.kwp), tel = s.instalacao !== "solo";
    return [
      { categoria: "Equipamentos", item: "Sistema fotovoltaico (kit)", unid: "un", qtd: 1, unit: 0, direto: true },
      { categoria: "Equipamentos", item: "Estrutura", unid: "un", qtd: 1, unit: 0 },
      { categoria: "Infra elétrica", item: "Transformador", unid: "un", qtd: 1, unit: 0 },
      { categoria: "Infra elétrica", item: "Padrão de entrada", unid: "un", qtd: 1, unit: 0 },
      { categoria: "Implantação", item: "Implantação (mão de obra)", unid: "kWp", qtd: kwp, unit: tel ? 220 : 300, auto: true },
      { categoria: "Engenharia", item: "Projeto e homologação", unid: "kWp", qtd: kwp, unit: 80, auto: true },
      { categoria: "Logística", item: "Deslocamento engenharia", unid: "km", qtd: n(s.km) * 2 * n(s.viagens_eng), unit: 1.75, auto: true },
      { categoria: "Logística", item: "Deslocamento equipe", unid: "km", qtd: n(s.km) * 2 * n(s.viagens_equipe), unit: 1.75, auto: true },
      { categoria: "Logística", item: "Hospedagem e alimentação", unid: "pessoa/dia", qtd: n(s.pessoas) * n(s.dias), unit: 300, auto: true },
      { categoria: "Material", item: "Material elétrico", unid: "kWp", qtd: kwp, unit: tel ? 250 : 350, auto: true },
      { categoria: "Obra civil", item: "Civil", unid: "kWp", qtd: kwp, unit: tel ? 20 : 100, auto: true },
      { categoria: "Logística", item: "Descarregamento", unid: "un", qtd: 1, unit: 0 },
      { categoria: "Infra elétrica", item: "Conexão (concessionária)", unid: "un", qtd: 1, unit: 0 },
      { categoria: "Outros", item: "Comissão", unid: "un", qtd: 1, unit: 0 },
      { categoria: "Outros", item: "Terrenista", unid: "un", qtd: 1, unit: 0 }
    ].map(i => ({ ...i, imp: false }));
  }
  const NOMES_SOLAR = new Set(modeloSolar({}).map(i => i.item));
  // Atualiza os itens automáticos pelos parâmetros e acrescenta os que faltam; o que foi digitado à mão fica.
  function aplicarModeloSolar(o) {
    for (const m of modeloSolar(o)) {
      const it = o.itens.find(i => i.item === m.item);
      if (!it) o.itens.push({ ...m });
      else if (m.auto) { it.qtd = m.qtd; it.unit = m.unit; it.unid = m.unid; }
      else if (m.direto) it.direto = true;
    }
  }

  // Mesmo cálculo da planilha: itens (+ imposto nos que levam), administração de obra (+ imposto sobre ela),
  // desenvolvimento/gestão sobre o subtotal e desconto. Se há valor contratado, ele é a venda.
  function calc(o) {
    const imp = n(o.imposto_pct) / 100;
    const pag = (o.lancamentos || []).filter(l => l.tipo !== "recebimento").reduce((s, l) => s + n(l.valor), 0);
    const rec = (o.lancamentos || []).filter(l => l.tipo === "recebimento").reduce((s, l) => s + n(l.valor), 0);
    if (o.modo === "detalhado" && ehSolar(o)) {
      const s = solarDe(o), kwp = n(o.kwp);
      const linhas = (o.itens || []).map(i => { const sub = n(i.qtd) * n(i.unit); return { sub, im: 0, tot: sub }; });
      const sub = linhas.reduce((t, l) => t + l.sub, 0);
      const direto = (o.itens || []).reduce((t, i) => t + (i.direto ? n(i.qtd) * n(i.unit) : 0), 0);
      const margemP3 = kwp * n(s.margem_kwp), sugerido = sub + margemP3;
      const venda = n(o.valor_contratado) || sugerido;
      const pelaP3 = s.faturamento === "direto" ? venda - direto : venda;
      const imposto = pelaP3 * n(s.faturamento === "direto" ? s.imp_servico : s.imp_total) / 100;
      const custo = sub + imposto;
      return { solar: true, linhas, sub, direto, margemP3, sugerido, pelaP3, imposto, impPct: n(s.faturamento === "direto" ? s.imp_servico : s.imp_total), custo, venda, lucro: venda - custo, margem: venda ? (venda - custo) / venda : 0, porKwp: kwp ? venda / kwp : 0, pag, rec };
    }
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
    // Ponte com a Uby: busca sozinha ao abrir (no máximo a cada 10 minutos) ou pelo botão.
    let ultima = 0; try { ultima = Number(localStorage.getItem("p3-ponte-uby") || 0); } catch (_) { }
    if (Date.now() - ultima > 10 * 60 * 1000) sincronizarUby(main, false);
  }

  const ponte = { msg: "", rodando: false };
  async function sincronizarUby(main, manual) {
    if (ponte.rodando) return;
    ponte.rodando = true; ponte.msg = "Buscando as obras da Uby…"; mostrarPonte();
    let recarregar = false;
    try {
      const r = await api("ponte-uby", { method: "POST", body: {} });
      try { localStorage.setItem("p3-ponte-uby", String(Date.now())); } catch (_) { }
      if (!r.ativa) { ponte.msg = r.erro || "Ponte com a Uby desligada."; return; }
      const partes = [r.novas.length && `${r.novas.length} obra(s) nova(s) da Uby: ${r.novas.join(", ")}`, r.concluidas.length && `concluída(s) na Uby: ${r.concluidas.join(", ")}`].filter(Boolean);
      ponte.msg = `Uby lida agora · ${r.atualizadas + r.novas.length} obra(s) ligadas${partes.length ? " · " + partes.join(" · ") : ""}`;
      if (partes.length) toast(partes.join(" · "), "ok");
      recarregar = partes.length > 0 || manual;
    } catch (e) { ponte.msg = `Não consegui falar com a Uby: ${e.message}`; }
    finally { ponte.rodando = false; mostrarPonte(); }
    if (recarregar && window.P3.state.route === "obras") render(main);
  }
  const mostrarPonte = () => { const el = $("#obPonte"); if (el) el.textContent = ponte.msg; const b = $("#obUby"); if (b) b.disabled = ponte.rodando; };
  const STATUS_UBY = { "Projeto": "info", "Em obra": "warn", "Concluida": "ok" };
  function painelUby(u, quando) {
    const fases = (u.fases || []).filter(f => f.total);
    return `<h3 class="ob-h3">Na plataforma da Uby</h3>
      <p class="muted" style="margin:0 0 8px;font-size:12.5px">${badge(u.status || "—", STATUS_UBY[u.status] || "")} ${u.progresso != null ? `progresso ${dec(u.progresso, 0)}%` : ""}${u.entrega ? ` · entrega prevista ${esc(fmt.data(u.entrega))}` : ""}${quando ? ` · lido em ${esc(fmt.dataHora(quando))}` : ""}${u.cliente ? ` · cliente ${esc(u.cliente)}` : ""}</p>
      ${fases.length ? `<div class="ob-fases">${fases.map(f => `<div class="ob-fase"><span>${esc(f.fase)}</span><div><i style="width:${Math.round(f.feitas / f.total * 100)}%"></i>${f.fazendo ? `<i class="fz" style="width:${Math.round(f.fazendo / f.total * 100)}%"></i>` : ""}</div><b>${f.feitas}/${f.total}</b></div>`).join("")}</div>` : `<p class="muted" style="font-size:12.5px">A Uby ainda não abriu as tarefas desta obra.</p>`}
      ${(u.proximas || []).length ? `<p style="margin:10px 0 4px;font-size:12.5px"><b>Próximas tarefas</b></p><ul class="ob-prox">${u.proximas.map(t => `<li>${t.status === "doing" ? "<b>em andamento</b> · " : ""}${esc(t.titulo)} <span class="muted">(${esc(t.fase)}${t.data_prevista ? " · " + esc(fmt.data(t.data_prevista)) : ""}${t.responsavel ? " · " + esc(t.responsavel) : ""})</span></li>`).join("")}</ul>` : ""}
      <p class="muted" style="font-size:12px;margin:6px 0 0">Essas etapas são controladas na plataforma da Uby e aparecem aqui só para leitura.</p>`;
  }

  function desenhar(main, obras) {
    const anos = [...new Set(obras.map(ano))].sort().reverse();
    const F = filtro;
    const lista = obras.filter(o => (F.contratante === "todos" || (o.contratante || "p3") === F.contratante) && (F.ano === "todos" || ano(o) === F.ano) && (F.status === "todos" || (o.status || "concluida") === F.status)
      && (!F.busca || `${o.nome} ${o.tipo || ""} ${o.cidade || ""} ${o.vendedor || ""}`.toLowerCase().includes(F.busca.toLowerCase())));
    const validas = lista.filter(o => o.status !== "cancelada" && o.status !== "orcamento");
    const T = validas.reduce((t, o) => ({ venda: t.venda + o._c.venda, custo: t.custo + o._c.custo, lucro: t.lucro + o._c.lucro, kwp: t.kwp + n(o.kwp), pag: t.pag + o._c.pag, rec: t.rec + o._c.rec, aRec: t.aRec + (o._c.rec ? o._c.venda - o._c.rec : 0) }), { venda: 0, custo: 0, lucro: 0, kwp: 0, pag: 0, rec: 0, aRec: 0 });
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
        <div class="actions"><button class="btn" id="obUby" title="Traz da plataforma da Uby as obras em Projeto / Em obra e o andamento das etapas">↻ Uby</button><a class="btn" href="#/comprovante">Lançar comprovante</a><button class="btn" id="novaSimples">+ Valor fechado</button><button class="btn primary" id="novaDet">+ Orçamento detalhado</button></div></div>
      <p class="muted" id="obPonte" style="font-size:12.5px;margin:-6px 2px 10px">${esc(ponte.msg)}</p>
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
        ${T.rec ? kpi("Recebido", brl(T.rec), `falta ${brl(T.aRec)} nas obras com recebimento lançado`) : ""}
      </div>
      ${orcam ? `<p class="muted" style="font-size:12.5px;margin:6px 2px 0">Os números somam só obras em andamento e concluídas; orçamentos e canceladas ficam de fora.</p>` : ""}
      ${validas.length ? `<div class="grid2 section">
        <div class="card"><h2>Faturamento e lucro por ano</h2>${barrasAno(porAno)}</div>
        <div class="card"><h2>Por contratante</h2>${barrasH(porCont)}<h2 style="margin-top:16px">Por tipo de obra</h2>${barrasH(porTipo)}</div>
      </div>` : ""}
      <div class="card section"><h2>Obras <small class="muted">(${lista.length})</small></h2>
        ${lista.length ? `<div class="table-wrap" style="box-shadow:none"><table><thead><tr>${th("nome", "Obra")}<th>Contratante</th>${th("data", "Data")}<th>Situação</th>${th("venda", "Venda", 1)}${th("custo", "Custo", 1)}${th("lucro", "Lucro", 1)}${th("margem", "Margem", 1)}</tr></thead><tbody>
        ${lista.map(o => `<tr data-id="${esc(o.id)}" style="cursor:pointer"><td><b>${esc(o.nome)}</b><small>${esc([o.tipo, o.cidade, o.modo === "detalhado" ? "orçamento detalhado" : ""].filter(Boolean).join(" · "))}</small>${o.uby ? `<small class="ob-uby">Uby: ${esc(o.uby.status || "—")}${o.uby.progresso != null ? ` · ${dec(o.uby.progresso, 0)}%` : ""}</small>` : ""}</td>
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
    $("#obUby").onclick = () => sincronizarUby(main, true);
    mostrarPonte();
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
      ${o.uby ? painelUby(o.uby, o.uby_sync_em) : ""}
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
          itens: o.modo !== "detalhado" ? [] : ehSolar(o)
            ? o.itens.filter(i => n(i.qtd) * n(i.unit) || (i.item && !NOMES_SOLAR.has(i.item)))
            : o.itens.filter(i => n(i.qtd) || (i.item && !MODELO.some(m => m.item === i.item))),
          solar: o.modo === "detalhado" && ehSolar(o) ? Object.fromEntries(Object.entries(solarDe(o)).map(([k, v]) => [k, typeof SOLAR_PADRAO[k] === "number" ? n(v) : v])) : (o.solar && !Array.isArray(o.solar) ? o.solar : null),
          lancamentos: o.lancamentos.filter(l => n(l.valor) || l.descricao) };
        for (const k of NUMEROS) corpo[k] = corpo[k] === "" || corpo[k] == null ? null : n(corpo[k]);
        corpo.itens = corpo.itens.map(i => ({ ...i, qtd: n(i.qtd), unit: n(i.unit) }));
        corpo.lancamentos = corpo.lancamentos.map(l => ({ ...l, valor: n(l.valor) }));
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
      if (r && c.solar) {
        const s = solarDe(o);
        r.innerHTML = `<tr><td>Custos dos itens</td><td class="right">${brl(c.sub)}</td></tr>
          ${c.direto ? `<tr><td class="muted">dos quais kit faturado direto ao cliente</td><td class="right muted">${brl(c.direto)}</td></tr>` : ""}
          <tr><td>(+) Margem P3 · ${dec(n(o.kwp))} kWp × ${brl(n(s.margem_kwp))}</td><td class="right">${brl(c.margemP3)}</td></tr>
          <tr><td><b>Preço sugerido</b>${n(o.kwp) ? ` <span class="muted">(${brl(c.sugerido / n(o.kwp))}/kWp)</span>` : ""}</td><td class="right"><b>${brl(c.sugerido)}</b></td></tr>
          ${n(o.valor_contratado) ? `<tr><td>Valor contratado</td><td class="right">${brl(c.venda)}</td></tr>` : ""}
          <tr><td>(−) Imposto ${dec(c.impPct)}% sobre ${s.faturamento === "direto" ? "a NF de serviço da P3" : "o total"} (${brl(c.pelaP3)})</td><td class="right">${brl(-c.imposto)}</td></tr>
          <tr><td><b>Lucro líquido</b></td><td class="right"><b>${brl(c.lucro)}</b> <span class="muted">${pct(c.margem)}</span></td></tr>`;
      } else if (r) r.innerHTML = `<tr><td>Itens</td><td class="right">${brl(c.sub)}</td></tr><tr><td>Impostos dos itens</td><td class="right">${brl(c.imps)}</td></tr>
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
      const solar = ehSolar(o), s = solarDe(o);
      box.innerHTML = (solar ? `<p class="muted" style="margin:4px 0 8px;font-size:12.5px">Obra solar: custos pela planilha de obra solar (por kWp, telhado ou solo). Preencha os parâmetros e toque em <b>Calcular pela planilha</b>; os itens sem cálculo (kit, estrutura, padrão…) você digita.</p>
        <div class="grid-form">
          <label class="f">Potência (kWp)<input data-o="kwp" inputmode="decimal" value="${esc(o.kwp ?? "")}"></label>
          <label class="f">Instalação<select data-s="instalacao">${opts([["telhado", "Telhado"], ["solo", "Solo"]], s.instalacao)}</select></label>
          <label class="f">Distância até a obra (km, ida)<input data-s="km" inputmode="decimal" value="${esc(s.km)}"></label>
          <label class="f">Viagens da engenharia<input data-s="viagens_eng" inputmode="decimal" value="${esc(s.viagens_eng)}"></label>
          <label class="f">Viagens da equipe<input data-s="viagens_equipe" inputmode="decimal" value="${esc(s.viagens_equipe)}"></label>
          <label class="f">Pessoas na equipe<input data-s="pessoas" inputmode="decimal" value="${esc(s.pessoas)}"></label>
          <label class="f">Dias de obra (hospedagem)<input data-s="dias" inputmode="decimal" value="${esc(s.dias)}"></label>
          <label class="f">Margem P3 (R$/kWp)<input data-s="margem_kwp" inputmode="decimal" value="${esc(s.margem_kwp)}"></label>
          <label class="f">Faturamento<select data-s="faturamento">${opts([["p3", "Tudo pela P3 (NF de produto)"], ["direto", "Kit faturado direto ao cliente"]], s.faturamento)}</select></label>
          <label class="f">% imposto · tudo pela P3<input data-s="imp_total" inputmode="decimal" value="${esc(s.imp_total)}"></label>
          <label class="f">% imposto · NF de serviço<input data-s="imp_servico" inputmode="decimal" value="${esc(s.imp_servico)}"></label>
          <label class="f">Valor contratado (R$)<input data-o="valor_contratado" inputmode="decimal" value="${esc(o.valor_contratado ?? "")}" placeholder="vazio = preço sugerido"></label></div>` : `<div class="grid-form">
          <label class="f">% impostos<input data-o="imposto_pct" inputmode="decimal" value="${esc(o.imposto_pct ?? 6)}"></label>
          <label class="f">% administração de obra<input data-o="admin_pct" inputmode="decimal" value="${esc(o.admin_pct ?? 0)}"></label>
          <label class="f">% desenvolvimento/gestão<input data-o="gestao_pct" inputmode="decimal" value="${esc(o.gestao_pct ?? 0)}"></label>
          <label class="f">Desconto / ajuste (R$)<input data-o="desconto" inputmode="decimal" value="${esc(o.desconto ?? "")}"></label>
          <label class="f">Valor contratado (R$)<input data-o="valor_contratado" inputmode="decimal" value="${esc(o.valor_contratado ?? "")}" placeholder="vazio = CAPEX"><small>quando há valor fechado para a implantação</small></label></div>`) + `
        <div class="ob-itens-wrap"><table class="ob-itens"><thead><tr><th>Categoria</th><th>Item</th><th>Un.</th><th class="right">Qtd</th><th class="right">Custo unit.</th><th title="Leva imposto">Imp.</th><th>Fornecedor</th><th class="right">Total</th><th></th></tr></thead><tbody id="obItens"></tbody></table></div>
        <p class="ob-acoes"><button type="button" class="btn sm" id="obAddItem">+ Item</button><button type="button" class="btn sm ${solar ? "primary" : "ghost"}" id="obModelo">${solar ? "Calcular pela planilha" : "Trazer itens do modelo"}</button><label class="muted"><input type="checkbox" id="obZerados"> mostrar itens zerados</label></p>
        <table class="ob-capex" id="obCapex"></table>`;
      $$("[data-o]", box).forEach(i => i.oninput = () => {
        o[i.dataset.o] = i.value;
        if (i.dataset.o === "kwp") { const pot = $('#obPot [name="kwp"]', bg); if (pot) pot.value = i.value; }
        resumo();
      });
      $$("[data-s]", box).forEach(i => { i[i.tagName === "SELECT" ? "onchange" : "oninput"] = () => { o.solar = { ...solarDe(o), [i.dataset.s]: i.value }; resumo(); }; });
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
      $("#obModelo", box).onclick = () => {
        if (solar) { if (!n(o.kwp)) return toast("Informe a potência (kWp) da obra.", "bad"); aplicarModeloSolar(o); zerados.checked = true; linhasItens(); return toast("Itens calculados pela planilha de obra solar.", "ok"); }
        const tem = new Set(o.itens.map(i => i.item)); MODELO.filter(m => !tem.has(m.item)).forEach(m => o.itens.push({ ...m })); zerados.checked = true; linhasItens();
      };
      linhasItens();
    };

    const lanc = () => {
      const box = $("#obLanc", bg);
      box.innerHTML = `${o.lancamentos.length ? `<div class="ob-itens-wrap"><table class="ob-itens"><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Fornecedor / pagador</th><th class="right">Valor</th><th></th></tr></thead><tbody>
        ${o.lancamentos.map((l, i) => `<tr data-i="${i}"><td><input type="date" data-k="data" value="${esc(l.data || "")}"></td>
          <td><select data-k="tipo">${opts([["pagamento", "Pagamento"], ["recebimento", "Recebimento"]], l.tipo || "pagamento")}</select></td>
          <td><input data-k="descricao" value="${esc(l.descricao || "")}" style="min-width:160px"></td><td><input data-k="parte" value="${esc(l.parte || "")}" style="width:130px"></td>
          <td><input data-k="valor" inputmode="decimal" class="right" value="${esc(l.valor ?? "")}" style="width:100px"></td><td style="white-space:nowrap">${l.anexo && l.anexo.caminho ? `<button type="button" class="btn ghost sm" data-anexo="${i}" title="${esc(l.anexo.nome || "comprovante")}" aria-label="Abrir comprovante">📎</button>` : ""}<button type="button" class="btn ghost sm" data-del="${i}" aria-label="Tirar lançamento">✕</button></td></tr>`).join("")}
        </tbody></table></div>` : ""}
        <p class="ob-acoes"><button type="button" class="btn sm" data-novo="pagamento">+ Pagamento</button><button type="button" class="btn sm" data-novo="recebimento">+ Recebimento</button>
          <label class="btn sm" for="obComp">+ Comprovante (PDF ou foto)</label><input type="file" id="obComp" accept="image/*,application/pdf,.pdf" multiple hidden><span class="muted" id="obCompAviso"></span></p>`;
      $$("[data-anexo]", box).forEach(b => b.onclick = () => window.P3_COMPROVANTE.abrirAnexo(o.lancamentos[b.dataset.anexo].anexo.caminho));
      $("#obComp", box).onchange = async e => {
        const arquivos = [...e.target.files]; e.target.value = "";
        if (!o.id) return toast("Salve a obra primeiro; depois anexe os comprovantes.", "bad");
        const C = window.P3_COMPROVANTE, av = $("#obCompAviso", box);
        for (const f of arquivos) {
          try {
            av.textContent = `Lendo ${f.name}…`;
            let campos = { tipo: "pagamento", data: "", valor: "", parte: "", descricao: f.name };
            try { campos = C.interpretar(await C.ler(f, a => { av.textContent = a; }), f.name); } catch (_) { }
            av.textContent = "Guardando o arquivo…";
            const anexo = await C.anexar(o.id, f);
            o.lancamentos.push({ data: campos.data || new Date().toISOString().slice(0, 10), tipo: campos.tipo, descricao: campos.descricao, parte: campos.parte, valor: campos.valor || "", anexo });
          } catch (err) { toast(err.message, "bad"); }
        }
        lanc(); resumo();
        const av2 = $("#obCompAviso", bg); if (av2) av2.textContent = arquivos.length ? "Confira o que foi lido e salve a obra." : "";
      };
      $$("[data-k]", box).forEach(inp => { inp[inp.tagName === "SELECT" ? "onchange" : "oninput"] = () => { o.lancamentos[inp.closest("tr").dataset.i][inp.dataset.k] = inp.value; resumo(); }; });
      $$("[data-del]", box).forEach(b => b.onclick = () => { o.lancamentos.splice(Number(b.dataset.del), 1); lanc(); resumo(); });
      $$("[data-novo]", box).forEach(b => b.onclick = () => { o.lancamentos.push({ data: new Date().toISOString().slice(0, 10), tipo: b.dataset.novo, descricao: "", parte: "", valor: "" }); lanc(); $$('[data-k="descricao"]', box).pop().focus(); });
    };

    $$("[data-modo]", bg).forEach(b => b.onclick = () => {
      o.modo = b.dataset.modo;
      o.tipo = $('#obDados [name="tipo"]', bg).value; o.kwp = $('#obPot [name="kwp"]', bg).value || o.kwp;
      if (o.modo === "detalhado" && !o.itens.length) {
        if (ehSolar(o)) { o.itens = []; aplicarModeloSolar(o); }
        else { o.itens = MODELO.map(i => ({ ...i })); if (o.imposto_pct == null) o.imposto_pct = 6; }
      }
      valores();
    });
    // Mudar o tipo (carregador × solar) troca o modelo de custos do orçamento detalhado.
    $('#obDados [name="tipo"]', bg).addEventListener("input", e => { const antes = ehSolar(o); o.tipo = e.target.value; if (o.modo === "detalhado" && antes !== ehSolar(o)) valores(); else resumo(); });
    $('#obPot [name="kwp"]', bg).addEventListener("input", e => { o.kwp = e.target.value; const k = $('#obValores [data-o="kwp"]', bg); if (k) k.value = e.target.value; resumo(); });
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
