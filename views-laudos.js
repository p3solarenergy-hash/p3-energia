// Relatórios técnicos da P3 Energy, no mesmo visual das propostas:
//  • Manutenção / correção (modelo Tutida): seções numeradas com o que foi feito, observação técnica e recomendação,
//    conclusão e fotos com legenda.
//  • Economia e payback (modelo Juntas Santa Cruz): por unidade, geração, consumo instantâneo, energia abatida
//    (fora de ponta / ponta), exportada ou recebida e fatura; economia pelas tarifas; consolidado do grupo e payback.
(function () {
  "use strict";
  const { esc, $, $$, fmt, api, toast, opts, confirmar } = window.P3;
  const V = () => window.P3_PROPOSTA.visual;
  const n = v => { if (v == null || v === "") return 0; if (typeof v === "number") return v; let s = String(v).trim().replace(/[R$\s%]/g, ""); if (/,/.test(s)) s = s.replace(/\./g, "").replace(",", "."); else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); const x = Number(s); return Number.isFinite(x) ? x : 0; };
  const r2 = v => Math.round(v * 100) / 100;
  const brl = v => fmt.brl(v);
  const num = (v, d = 0) => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const linhas = s => String(s || "").split("\n").map(x => x.trim()).filter(Boolean);
  const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const TIPOS = { manutencao: "Manutenção", correcao: "Correção", economia: "Economia e payback" };
  const STATUS = { rascunho: ["Rascunho", ""], entregue: ["Entregue", "ok"] };

  // Seções de partida da manutenção preventiva (o técnico apaga o que não fez e completa).
  const SECOES_PREVENTIVA = [
    { titulo: "Sistema fotovoltaico", itens: "Realizada verificação geral do sistema solar.\nExecutada limpeza do inversor.\nRealizada limpeza dos módulos fotovoltaicos.", observacao: "", recomendacao: "" },
    { titulo: "Quadros elétricos e proteções", itens: "Verificadas e reapertadas as conexões dos disjuntores.\nRealizada limpeza dos quadros elétricos.", observacao: "", recomendacao: "" },
    { titulo: "Infraestrutura elétrica", itens: "Verificadas as emendas, caixas de passagem e eletrodutos.", observacao: "", recomendacao: "" },
    { titulo: "Padrão de entrada", itens: "Verificadas as conexões do padrão da concessionária.", observacao: "", recomendacao: "" }
  ];
  const COMUM = { cliente: "", cidade: "", endereco: "", data: "", vendedor: "eduardo", tecnico: "", logo_cliente: "", foto_capa: "", fechamento: "" };
  const PADRAO = {
    manutencao: { kwp: "", modulos: "", inversor: "", resumo: "", secoes: SECOES_PREVENTIVA, conclusao: "Foram realizados os serviços de manutenção visando a segurança, a eficiência e a confiabilidade do sistema fotovoltaico.", fotos: [] },
    correcao: { kwp: "", modulos: "", inversor: "", resumo: "", secoes: [{ titulo: "Problema encontrado", itens: "", observacao: "", recomendacao: "" }, { titulo: "Correção executada", itens: "", observacao: "", recomendacao: "" }], conclusao: "Foram realizadas correções técnicas visando adequação elétrica, segurança operacional e melhoria da confiabilidade do sistema fotovoltaico e da infraestrutura associada.", fotos: [] },
    economia: {
      periodo: "", fontes: "Relatórios do inversor + faturas da Copel", tar_b: 0.66, tar_fp: 0.43, tar_p: 1.49,
      unidades: [{ nome: "", grupo: "B", papel: "geradora", geracao: 0, instantaneo: 0, abatido_fp: 0, abatido_p: 0, exportado: 0, recebido: 0, fatura: 0, economia_manual: "", obs: "" }],
      investimento: "", data_instalacao: "", conclusao: ""
    }
  };
  const novos = tipo => ({ ...COMUM, ...JSON.parse(JSON.stringify(PADRAO[tipo])), data: hoje() });
  const dadosDe = l => ({ ...novos(l.tipo), ...(l.dados && !Array.isArray(l.dados) ? l.dados : {}) });

  // ───────── economia ─────────
  const PAPEL = { geradora: "Geradora", beneficiaria: "Beneficiária", geradora_consumo: "Geradora com consumo" };
  function calcEconomia(d) {
    const tar = u => u.grupo === "A" ? { fp: n(d.tar_fp), p: n(d.tar_p) } : { fp: n(d.tar_b), p: n(d.tar_b) };
    const unidades = (d.unidades || []).map(u => {
      const t = tar(u), abatido = n(u.abatido_fp) + n(u.abatido_p), usada = n(u.instantaneo) + abatido;
      const calc = r2((n(u.instantaneo) + n(u.abatido_fp)) * t.fp + n(u.abatido_p) * t.p);
      const economia = u.economia_manual !== "" && u.economia_manual != null ? n(u.economia_manual) : calc;
      return { ...u, abatido, usada, economia, calc, usoGeracao: n(u.geracao) ? usada / n(u.geracao) : null };
    });
    const tot = k => unidades.reduce((s, u) => s + n(u[k]), 0);
    const economia = r2(tot("economia")), investimento = n(d.investimento);
    const meses = d.data_instalacao ? Math.max(0, (new Date(hoje()) - new Date(d.data_instalacao + "T12:00:00")) / (864e5 * 30.44)) : 0;
    return { unidades, geracao: tot("geracao"), usada: tot("usada"), economia, faturas: r2(tot("fatura")), anual: r2(economia * 12), investimento,
      payback: investimento && economia ? investimento / (economia * 12) : null, meses, acumulada: meses ? r2(economia * meses) : 0 };
  }

  // ───────── páginas ─────────
  function montar(l) {
    const d = { ...dadosDe(l), _kicker: l.tipo === "economia" ? "Relatório de economia" : "Relatório técnico" }, v = V(), vend = v.VENDEDORES[d.vendedor] || v.VENDEDORES.eduardo;
    const pgs = l.tipo === "economia" ? paginasEconomia(l, d, vend) : paginasManutencao(l, d, vend);
    const total = String(pgs.length).padStart(2, "0");
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(TIPOS[l.tipo])} ${esc(d.cliente)}</title><style>${v.CSS}
      .sec-n{display:inline-grid;place-items:center;width:44px;height:44px;border-radius:50%;background:var(--lim);color:var(--esc);font-weight:800;font-size:20px;margin-right:12px;vertical-align:middle}
      .fotos{display:grid;grid-template-columns:1fr 1fr;gap:18px} .foto-c{background:#fff;border:1px solid var(--lin);border-radius:8px;overflow:hidden} .foto-c div{height:212px;background:#1d2617 center/contain no-repeat} .foto-c p{font-size:15px;margin:8px 12px}
    </style></head><body>${pgs.map((pg, i) => pg.replace("{{PG}}", `${String(i + 1).padStart(2, "0")} / ${total}`)).join("").replace(/Proposta válida por [^<]*/g, `Relatório emitido em ${v.dataLonga(hoje())}.`)}</body></html>`;
  }
  const pDados = l => ({ numero: l.numero });

  function paginasManutencao(l, d, vend) {
    const v = V(), titulo = l.tipo === "correcao" ? "Relatório<br>de correção" : "Relatório<br>de manutenção";
    const pgs = [];
    const stats = [d.kwp && [`${v.numx(n(d.kwp))} kWp`, "Potência do sistema"], d.modulos && [`${num(n(d.modulos))}`, "Módulos"], [v.dataLonga(d.data).replace(/ de \d{4}$/, ""), "Data da visita"]].filter(Boolean);
    pgs.push(v.capa(pDados(l), d, titulo, [d.endereco, d.cidade].filter(Boolean).join(" · ") || "Usina fotovoltaica", stats));
    const secoes = (d.secoes || []).filter(s => s.titulo || linhas(s.itens).length);
    if (d.resumo || d.kwp || d.inversor || d.tecnico) pgs.push(`<section class="slide">${v.topo("Resumo", "Visita técnica")}
      <div class="grid g2" style="gap:50px"><div>${d.resumo ? `<p>${esc(d.resumo)}</p>` : ""}<ul class="lista">${secoes.map((s, i) => `<li><b>${i + 1}.</b> ${esc(s.titulo)}</li>`).join("")}</ul></div>
        <div class="grid" style="gap:14px;align-content:start">${[["Cliente", d.cliente], ["Local", [d.endereco, d.cidade].filter(Boolean).join(" · ")], ["Sistema", [d.kwp && `${v.numx(n(d.kwp))} kWp`, d.modulos && `${num(n(d.modulos))} módulos`, d.inversor].filter(Boolean).join(" · ")], ["Data", v.dataLonga(d.data)], ["Responsável técnico", d.tecnico || vend.nome]].filter(x => x[1]).map(([a, b]) => `<div class="card"><small>${esc(a)}</small>${esc(b)}</div>`).join("")}</div></div>${v.pe(d)}</section>`);
    secoes.forEach((s, i) => pgs.push(`<section class="slide">${v.topo(l.tipo === "correcao" ? "Relatório de correção" : "Relatório de manutenção", `<span class="sec-n">${i + 1}</span>${esc(s.titulo)}`)}
      <div class="grid" style="grid-template-columns:${s.observacao || s.recomendacao ? "1.3fr 1fr" : "1fr"};gap:40px">
        <ul class="lista">${linhas(s.itens).map(x => `<li>${esc(x)}</li>`).join("")}</ul>
        ${s.observacao || s.recomendacao ? `<div class="grid" style="gap:16px;align-content:start">${s.observacao ? `<div class="card"><small>Observação técnica</small>${esc(s.observacao)}</div>` : ""}${s.recomendacao ? `<div class="card lim"><small>Recomendação</small>${esc(s.recomendacao)}</div>` : ""}</div>` : ""}
      </div>${v.pe(d)}</section>`));
    const recs = secoes.filter(s => s.recomendacao);
    pgs.push(`<section class="slide dark">${v.topo("Conclusão", "Resultado da visita", true)}
      <p style="font-size:24px;max-width:1100px">${esc(d.conclusao)}</p>
      ${recs.length ? `<h3 style="color:var(--lim);margin-top:24px">Recomendações</h3><ul class="lista">${recs.map(s => `<li><b>${esc(s.titulo)}:</b> ${esc(s.recomendacao)}</li>`).join("")}</ul>` : ""}${v.pe(d)}</section>`);
    const fotos = (d.fotos || []).filter(f => f.img);
    for (let i = 0; i < fotos.length; i += 4) pgs.push(`<section class="slide">${v.topo("Arquivos", fotos.length > 4 ? `Registro fotográfico · ${i / 4 + 1}` : "Registro fotográfico")}
      <div class="fotos">${fotos.slice(i, i + 4).map(f => `<div class="foto-c"><div style="background-image:url('${f.img}')"></div>${f.legenda ? `<p>${esc(f.legenda)}</p>` : ""}</div>`).join("")}</div>${v.pe(d)}</section>`);
    pgs.push(v.contato(d, vend, ["Entrega deste relatório", recs.length ? "Execução das recomendações" : "Acompanhamento do sistema", "Próxima manutenção preventiva"], "Seu sistema seguro e gerando o máximo."));
    return pgs;
  }

  function paginasEconomia(l, d, vend) {
    const v = V(), c = calcEconomia(d), pgs = [];
    pgs.push(v.capa(pDados(l), d, "Relatório<br>de economia", d.periodo ? `Período: ${d.periodo}` : v.dataLonga(d.data),
      [[`${num(c.geracao)} kWh`, "Geração no período"], [brl(c.economia), "Economia no período"]].concat(c.payback ? [[`${num(c.payback, 1)} anos`, "Payback"]] : [])));
    pgs.push(`<section class="slide">${v.topo("Premissas", "Relatório consolidado")}
      <div class="grid g3">
        <div class="card"><small>Período</small><b style="font-size:24px">${esc(d.periodo || "—")}</b></div>
        <div class="card"><small>Fontes</small>${esc(d.fontes || "—")}</div>
        <div class="card"><small>Unidades</small><b style="font-size:24px">${c.unidades.length}</b></div>
      </div>
      <h3 style="margin-top:26px">Tarifas utilizadas</h3>
      <div class="grid g3"><div class="card"><small>Grupo B</small><b class="big">R$ ${num(n(d.tar_b), 2)}</b><span class="mut">/kWh</span></div>
        <div class="card"><small>Grupo A · fora de ponta</small><b class="big">R$ ${num(n(d.tar_fp), 2)}</b><span class="mut">/kWh</span></div>
        <div class="card"><small>Grupo A · ponta</small><b class="big">R$ ${num(n(d.tar_p), 2)}</b><span class="mut">/kWh</span></div></div>${v.pe(d)}</section>`);
    for (const u of c.unidades) {
      const linhasU = [["Geração total", u.geracao ? `${num(u.geracao)} kWh` : "—", u.geracao ? "produção do período" : "unidade sem geração própria"],
        ["Consumo instantâneo", `${num(u.instantaneo)} kWh`, "atendido direto pela geração (sem passar pelo relógio)"],
        [u.grupo === "A" ? "Energia abatida · fora de ponta" : "Energia abatida na fatura", `${num(u.abatido_fp)} kWh`, u.papel === "beneficiaria" ? "créditos recebidos e compensados" : "compensada na fatura"],
        ...(u.grupo === "A" ? [["Energia abatida · ponta", `${num(u.abatido_p)} kWh`, "compensada com o fator de ajuste"]] : []),
        ...(n(u.exportado) ? [["Energia exportada", `${num(u.exportado)} kWh`, "excedente enviado para outras unidades"]] : []),
        ...(n(u.recebido) ? [["Créditos recebidos", `${num(u.recebido)} kWh`, "de outras unidades do grupo"]] : []),
        ["Valor da fatura", brl(u.fatura), "conta da concessionária no período"]];
      pgs.push(`<section class="slide">${v.topo(`${PAPEL[u.papel] || ""} · Grupo ${u.grupo}`, esc(u.nome || "Unidade"))}
        <div class="grid" style="grid-template-columns:1.4fr 1fr;gap:36px">
          <table style="font-size:17px"><tbody>${linhasU.map(([a, b, x]) => `<tr><td style="padding:9px 12px"><b>${esc(a)}</b><small>${esc(x)}</small></td><td class="n" style="padding:9px 12px">${esc(b)}</td></tr>`).join("")}</tbody></table>
          <div class="grid" style="gap:14px;align-content:start">
            <div class="card lim"><small>Economia</small><b class="big">${brl(u.economia)}</b><span>${num(u.usada)} kWh que não foram pagos à concessionária</span></div>
            ${u.usoGeracao != null ? `<div class="card"><small>Aproveitamento da geração</small><b class="big">${num(u.usoGeracao * 100, 1)}%</b><span class="mut">usado na própria unidade${u.usoGeracao < 1 ? ` · ${num((1 - u.usoGeracao) * 100, 1)}% exportado` : ""}</span></div>` : ""}
            ${u.obs ? `<div class="card"><small>Observação</small>${esc(u.obs)}</div>` : ""}
          </div></div>${v.pe(d)}</section>`);
    }
    pgs.push(`<section class="slide">${v.topo("Consolidado", "Economia do grupo")}
      <table style="font-size:17px"><thead><tr><th>Unidade</th><th class="n">Geração</th><th class="n">Energia abatida</th><th class="n">Fatura</th><th class="n">Economia</th></tr></thead><tbody>
        ${c.unidades.map(u => `<tr><td style="padding:9px 12px"><b>${esc(u.nome)}</b><small>Grupo ${esc(u.grupo)} · ${esc(PAPEL[u.papel] || "")}</small></td><td class="n">${u.geracao ? `${num(u.geracao)} kWh` : "—"}</td><td class="n">${num(u.usada)} kWh</td><td class="n">${brl(u.fatura)}</td><td class="n">${brl(u.economia)}</td></tr>`).join("")}
        <tr class="tot"><td>Totais</td><td class="n">${num(c.geracao)} kWh</td><td class="n">${num(c.usada)} kWh</td><td class="n">${brl(c.faturas)}</td><td class="n">${brl(c.economia)}</td></tr></tbody></table>
      <div class="grid g${c.payback ? 4 : 2}" style="margin-top:20px;gap:14px">
        <div class="card lim"><small>Economia no período</small><b class="big" style="font-size:32px">${brl(c.economia)}</b></div>
        <div class="card"><small>Economia anual estimada</small><b class="big" style="font-size:32px">${brl(c.anual)}</b></div>
        ${c.payback ? `<div class="card"><small>Investimento</small><b class="big" style="font-size:32px">${brl(c.investimento)}</b></div><div class="card esc"><small>Payback</small><b class="big" style="font-size:32px">${num(c.payback, 1)} anos</b>${c.acumulada ? `<span>${brl(c.acumulada)} economizados desde a instalação</span>` : ""}</div>` : ""}
      </div>${v.pe(d)}</section>`);
    if (d.conclusao) pgs.push(`<section class="slide dark">${v.topo("Conclusão", "O que os números mostram", true)}<p style="font-size:24px;max-width:1100px;white-space:pre-line">${esc(d.conclusao)}</p>${v.pe(d)}</section>`);
    pgs.push(v.contato(d, vend, ["Acompanhamento mensal da geração", "Conferência das faturas e dos créditos", "Ajustes de rateio quando necessário"], "Gestão inteligente da sua energia."));
    return pgs;
  }

  // ───────── lista ─────────
  async function render(main, params) {
    if (params && params[0]) return editor(main, params[0], params[1]);
    main.innerHTML = `<div class="loading">Carregando os relatórios…</div>`;
    let lista;
    try { lista = await api("laudos"); } catch (e) { main.innerHTML = `<div class="note bad">${esc(e.message)}</div>`; return; }
    if (window.P3.state.route !== "laudos") return;
    lista.sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
    main.innerHTML = `
      <div class="head"><div><p class="kicker">Obras e vendas</p><h1>Relatórios técnicos</h1><p>Relatórios de manutenção, de correção e de economia e payback, no padrão da P3 Energy.</p></div>
        <div class="actions">${Object.entries(TIPOS).map(([k, t], i) => `<a class="btn ${i ? "" : "primary"}" href="#/laudos/novo/${k}">+ ${esc(t)}</a>`).join("")}</div></div>
      <div class="section"><div class="table-wrap"><table><thead><tr><th>Nº</th><th>Cliente</th><th>Tipo</th><th>Local</th><th>Data</th><th>Situação</th></tr></thead><tbody>
        ${lista.map(x => { const [s, k] = STATUS[x.status] || [x.status, ""]; return `<tr class="clickable" data-go="#/laudos/${encodeURIComponent(x.id)}"><td>${esc(x.numero || "—")}</td><td><b>${esc(x.cliente || "(sem nome)")}</b></td><td>${esc(TIPOS[x.tipo])}</td><td>${esc(x.cidade || "")}</td><td>${fmt.data(x.data)}</td><td>${window.P3.badge(s, k)}</td></tr>`; }).join("") || `<tr><td colspan="6" class="empty">Nenhum relatório ainda.</td></tr>`}</tbody></table></div></div>`;
    $$("[data-go]", main).forEach(tr => tr.onclick = () => window.P3.go(tr.dataset.go));
  }
  async function numeroNovo() {
    const ano = new Date().getFullYear(), todas = await api("laudos");
    const doAno = todas.map(x => String(x.numero || "")).filter(x => x.startsWith(`RT-${ano}-`)).map(x => Number(x.split("-")[2]) || 0);
    return `RT-${ano}-${String(Math.max(0, ...doAno) + 1).padStart(3, "0")}`;
  }

  // ───────── editor ─────────
  async function editor(main, id, tipoNovo) {
    let l;
    if (id === "novo") { if (!TIPOS[tipoNovo]) return window.P3.go("#/laudos"); l = { tipo: tipoNovo, status: "rascunho", dados: novos(tipoNovo) }; }
    else {
      main.innerHTML = `<div class="loading">Abrindo o relatório…</div>`;
      try { l = await api(`laudos/${encodeURIComponent(id)}`); } catch (e) { main.innerHTML = `<div class="note bad">${esc(e.message)}</div>`; return; }
      l.dados = dadosDe(l);
    }
    const d = l.dados, v = V(); let sujo = false;
    const campo = (k, rot, tipo = "text", extra = "") => tipo === "area" ? `<label class="f wide">${rot}<textarea data-k="${k}" rows="${extra || 3}">${esc(d[k] ?? "")}</textarea></label>`
      : `<label class="f">${rot}<input data-k="${k}" ${tipo === "num" ? 'inputmode="decimal"' : `type="${tipo}"`} value="${esc(tipo === "num" ? String(d[k] ?? "").replace(".", ",") : d[k] ?? "")}"></label>`;
    const bloco = (titulo, html, aberto = true) => `<details class="pr-bloco" ${aberto ? "open" : ""}><summary>${titulo}</summary><div class="grid-form">${html}</div></details>`;
    const comum = bloco("Cliente e relatório", `${campo("cliente", "Cliente")}${campo("cidade", "Cidade")}${campo("endereco", "Endereço / local")}${campo("data", "Data", "date")}
      <label class="f">Contato no relatório<select data-k="vendedor">${opts(Object.entries(v.VENDEDORES).map(([k, x]) => [k, x.nome]), d.vendedor)}</select></label>
      ${l.tipo !== "economia" ? campo("tecnico", "Responsável técnico (vazio = contato)") : ""}`);
    const corpo = l.tipo === "economia"
      ? bloco("Período e tarifas", `${campo("periodo", "Período (ex.: 31/12/2025 a 06/01/2026)")}${campo("fontes", "Fontes")}${campo("tar_b", "Tarifa Grupo B (R$/kWh)", "num")}${campo("tar_fp", "Grupo A fora de ponta (R$/kWh)", "num")}${campo("tar_p", "Grupo A ponta (R$/kWh)", "num")}`)
        + bloco("Unidades", `<div class="wide" id="ltUnid"></div>`)
        + bloco("Payback e conclusão", `${campo("investimento", "Investimento do sistema (R$)", "num")}${campo("data_instalacao", "Data da instalação", "date")}${campo("conclusao", "Conclusão", "area", 4)}<p class="muted wide" id="ltCalc" style="margin:0;font-size:12.5px;white-space:pre-line"></p>`)
      : bloco("Sistema", `${campo("kwp", "Potência (kWp)", "num")}${campo("modulos", "Módulos", "num")}${campo("inversor", "Inversor")}${campo("resumo", "Resumo da visita (opcional)", "area", 3)}`)
        + bloco("Seções", `<div class="wide" id="ltSecoes"></div>`)
        + bloco("Conclusão e fotos", `${campo("conclusao", "Conclusão", "area", 4)}<div class="wide" id="ltFotos"></div>`);
    main.innerHTML = `
      <div class="head"><div><p class="kicker"><a href="#/laudos">Relatórios técnicos</a> · ${esc(TIPOS[l.tipo])}</p><h1>${esc(l.numero || "Novo relatório")}</h1></div>
        <div class="actions"><select id="ltStatus" aria-label="Situação">${opts(Object.entries(STATUS).map(([k, [s]]) => [k, s]), l.status)}</select><button class="btn" id="ltPdf">Gerar PDF</button><button class="btn primary" id="ltSalvar">Salvar</button></div></div>
      <div class="pr-ed"><div class="pr-form">${comum}${corpo}<div class="pr-acoes">${l.id ? `<button class="btn ghost danger" id="ltExcluir">Excluir</button>` : ""}</div></div>
        <div class="pr-prev"><iframe id="ltFrame" title="Prévia do relatório"></iframe></div></div>`;
    const frame = $("#ltFrame", main);
    const zoom = () => { const doc = frame.contentDocument; if (doc && doc.documentElement) doc.documentElement.style.zoom = String(frame.clientWidth / 1480); };
    let timer = null;
    const atualizar = () => { clearTimeout(timer); timer = setTimeout(() => {
      const y = frame.contentWindow ? frame.contentWindow.scrollY : 0;
      frame.onload = () => { zoom(); frame.contentWindow.scrollTo(0, y); };
      frame.srcdoc = montar(l);
      const lc = $("#ltCalc", main);
      if (lc) { const c = calcEconomia(d); lc.textContent = `Economia no período ${brl(c.economia)} · por ano ${brl(c.anual)}${c.payback ? ` · payback ${num(c.payback, 1)} anos` : ""}${c.acumulada ? ` · ${brl(c.acumulada)} desde a instalação (${num(c.meses, 0)} meses)` : ""}.`; }
    }, 250); };
    const NUMS = new Set(["kwp", "modulos", "tar_b", "tar_fp", "tar_p", "investimento"]);
    $$("[data-k]", main).forEach(el => { el.oninput = el.onchange = () => { d[el.dataset.k] = NUMS.has(el.dataset.k) ? (el.value.trim() === "" ? "" : n(el.value)) : el.value; sujo = true; atualizar(); }; });

    // Listas editáveis: seções (manutenção), unidades (economia) e fotos.
    const lista = (boxId, arr, campos, novo, rotulo) => {
      const box = $(boxId, main); if (!box) return;
      const desenhar = () => {
        box.innerHTML = arr.map((it, i) => `<div class="pr-bloco" style="padding:10px;margin-bottom:8px"><div class="grid-form">${campos.map(([k, rot, tipo, op]) => tipo === "area"
          ? `<label class="f wide">${rot}<textarea data-li="${i}" data-c="${k}" rows="3">${esc(it[k] ?? "")}</textarea></label>`
          : tipo === "sel" ? `<label class="f">${rot}<select data-li="${i}" data-c="${k}">${opts(op, it[k])}</select></label>`
          : tipo === "img" ? `<label class="f wide">${rot}<span class="pr-img">${it.img ? `<img src="${it.img}" alt="">` : ""}<input type="file" accept="image/*" data-li="${i}" data-img="1"></span></label>`
          : `<label class="f ${k === "titulo" || k === "nome" || k === "legenda" ? "wide" : ""}">${rot}<input data-li="${i}" data-c="${k}" ${tipo === "num" ? 'inputmode="decimal"' : ""} value="${esc(tipo === "num" ? String(it[k] ?? "").replace(".", ",") : it[k] ?? "")}"></label>`).join("")}</div>
          <p style="margin:6px 0 0;display:flex;gap:6px">${i ? `<button type="button" class="btn ghost sm" data-sobe="${i}">↑</button>` : ""}<button type="button" class="btn ghost sm danger" data-tira="${i}">Tirar</button></p></div>`).join("")
          + `<button type="button" class="btn sm" data-mais>+ ${rotulo}</button>`;
        $$("[data-c]", box).forEach(el => { el.oninput = el.onchange = () => { const it = arr[Number(el.dataset.li)], k = el.dataset.c, tipo = (campos.find(c => c[0] === k) || [])[2]; it[k] = tipo === "num" ? (k === "economia_manual" && el.value.trim() === "" ? "" : n(el.value)) : el.value; sujo = true; atualizar(); }; });
        $$("[data-img]", box).forEach(el => el.onchange = async () => { const f = el.files[0]; if (!f) return; try { arr[Number(el.dataset.li)].img = await v.imagem(f, 1400); sujo = true; desenhar(); atualizar(); } catch (e) { toast(e.message, "bad"); } });
        $$("[data-tira]", box).forEach(b => b.onclick = () => { arr.splice(Number(b.dataset.tira), 1); sujo = true; desenhar(); atualizar(); });
        $$("[data-sobe]", box).forEach(b => b.onclick = () => { const i = Number(b.dataset.sobe); [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; sujo = true; desenhar(); atualizar(); });
        $("[data-mais]", box).onclick = () => { arr.push(novo()); desenhar(); };
      };
      desenhar();
    };
    if (l.tipo === "economia") {
      d.unidades = d.unidades || [];
      lista("#ltUnid", d.unidades, [["nome", "Unidade"], ["grupo", "Grupo", "sel", [["B", "B"], ["A", "A"]]], ["papel", "Papel", "sel", Object.entries(PAPEL)], ["geracao", "Geração (kWh)", "num"], ["instantaneo", "Consumo instantâneo (kWh)", "num"],
        ["abatido_fp", "Abatido na fatura / fora de ponta (kWh)", "num"], ["abatido_p", "Abatido na ponta (kWh, Grupo A)", "num"], ["exportado", "Exportado (kWh)", "num"], ["recebido", "Créditos recebidos (kWh)", "num"],
        ["fatura", "Valor da fatura (R$)", "num"], ["economia_manual", "Economia (R$) — vazio = calcular", "num"], ["obs", "Observação"]],
        () => ({ nome: "", grupo: "B", papel: "geradora", geracao: 0, instantaneo: 0, abatido_fp: 0, abatido_p: 0, exportado: 0, recebido: 0, fatura: 0, economia_manual: "", obs: "" }), "Unidade");
    } else {
      d.secoes = d.secoes || []; d.fotos = d.fotos || [];
      lista("#ltSecoes", d.secoes, [["titulo", "Título da seção"], ["itens", "O que foi feito (uma linha por item)", "area"], ["observacao", "Observação técnica (opcional)", "area"], ["recomendacao", "Recomendação (opcional)", "area"]],
        () => ({ titulo: "", itens: "", observacao: "", recomendacao: "" }), "Seção");
      lista("#ltFotos", d.fotos, [["img", "Foto", "img"], ["legenda", "Legenda (ex.: antes / depois)"]], () => ({ img: "", legenda: "" }), "Foto");
    }

    const salvar = async () => {
      const corpoL = { tipo: l.tipo, cliente: d.cliente || null, cidade: d.cidade || null, data: d.data || null, status: $("#ltStatus", main).value, dados: d };
      if (!l.id) corpoL.numero = await numeroNovo();
      const r = l.id ? await api(`laudos/${encodeURIComponent(l.id)}`, { method: "PUT", body: corpoL }) : await api("laudos", { method: "POST", body: corpoL });
      sujo = false; return r;
    };
    $("#ltSalvar", main).onclick = async e => { const b = e.currentTarget; b.disabled = true; try { const r = await salvar(); toast("Relatório salvo.", "ok"); if (!l.id) return window.P3.go(`#/laudos/${encodeURIComponent(r.id)}`); l.numero = r.numero; } catch (err) { toast(err.message, "bad"); } finally { b.disabled = false; } };
    $("#ltStatus", main).onchange = () => { sujo = true; };
    $("#ltPdf", main).onclick = async () => {
      try { if (sujo || !l.id) { const r = await salvar(); if (!l.id) { l.id = r.id; l.numero = r.numero; history.replaceState(null, "", `#/laudos/${encodeURIComponent(r.id)}`); window.P3.state.params = [r.id]; } } } catch (err) { return toast(err.message, "bad"); }
      toast("Na janela de impressão, escolha \"Salvar como PDF\".", "ok"); v.imprimirHtml(montar(l), `${TIPOS[l.tipo]} - ${d.cliente || l.numero || ""}`);
    };
    const exc = $("#ltExcluir", main);
    if (exc) exc.onclick = async () => { if (!await confirmar("Excluir relatório", `Excluir o relatório ${esc(l.numero || "")}?`, "Excluir")) return; try { sujo = false; await api(`laudos/${encodeURIComponent(l.id)}`, { method: "DELETE" }); toast("Excluído.", "ok"); window.P3.go("#/laudos"); } catch (e) { toast(e.message, "bad"); } };
    window.addEventListener("resize", zoom);
    atualizar();
  }

  window.P3_LAUDOS = { montar, calcEconomia, dadosDe };
  window.P3.register("laudos", { render });
})();
