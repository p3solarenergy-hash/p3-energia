/* Projeção: sobe a(s) fatura(s) de um cliente novo e calcula a economia pelo acordo de arrendamento. */
(function () {
  "use strict";
  const { api, fmt, esc, $, $$, kpi, opts, confirmar, toast, M } = P3;
  const PJ = window.P3_PROJECAO;
  const novo = () => ({ id: null, nome: "", cliente: "", contas: [], params: { acordo: "fixo", valorFixo: "", valorKwh: "", desconto: 20, cobertura: 100, geracaoUsina: "", ano: "", bandeira: "fatura", manterCreditosAtuais: true, fioBBase: "" } });
  const ui = { lista: null, atual: novo(), lendo: 0 };
  const num = v => { const s = String(v ?? "").trim(); return s === "" ? "" : Number(/,/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s); };
  const n6 = v => fmt.num(v, 6);
  // Número da lista de projeções salvas, conforme a visão salva.
  const resumoTxt = s => !s ? "" : s.visao === "dono" && s.donoLiquido != null ? `dono ${fmt.brl(s.donoLiquido)}/ano`
    : s.visao === "todos" && s.p3Lucro != null ? `P3 ${fmt.brl(s.p3Lucro)}/ano` : s.economia != null ? fmt.brl(s.economia) + "/ano" : "";

  async function render(main, params) {
    ui.lista = await api("projecoes");
    if (params && params[0] && (!ui.atual.id || ui.atual.id !== params[0])) {
      const pj = ui.lista.find(p => p.id === params[0]);
      if (pj) ui.atual = { id: pj.id, nome: pj.nome, cliente: pj.cliente, contas: pj.contas || [], params: { ...novo().params, ...(pj.params || {}) } };
    }
    const fioB = ui.fioB = PJ.fioBDaBase(P3.db().faturas);
    main.innerHTML = `
      <div class="head"><div><p class="kicker">Cliente novo</p><h1>Projeção de economia</h1>
        <p>Suba a fatura da Copel do cliente (ou de todas as UCs dele). A plataforma lê o histórico de 12 meses, as tarifas e os tributos, e calcula a economia pelo acordo de arrendamento que você escolher.</p></div>
        <div class="actions"><button class="btn" id="pjNova">+ Nova projeção</button></div></div>
      <div class="split wide-right">
        <div class="stack">
          <div class="card"><h2>Projeções salvas</h2><p class="sub">${ui.lista.length} projeção(ões)</p>
            ${ui.lista.map(p => `<a href="#/projecao/${encodeURIComponent(p.id)}" class="btn ${ui.atual.id === p.id ? "primary" : "ghost"}" style="width:100%;justify-content:space-between;margin-bottom:4px"><span>${esc(p.nome)}</span><small>${resumoTxt(p.resumo)}</small></a>`).join("") || `<p class="muted" style="margin:0">Nenhuma ainda.</p>`}</div>
        </div>
        <div class="stack" id="pjEditor"></div>
      </div>`;
    $("#pjNova").onclick = () => { ui.atual = novo(); location.hash = "#/projecao"; render(main); };
    editor($("#pjEditor"), fioB);
  }

  function editor(el, fioB) {
    const a = ui.atual, p = a.params;
    const temCreditos = a.contas.some(c => Number(c.campos.compensadoKwh) > 0);
    el.innerHTML = `
      <div class="card">
        <label class="drop" id="pjDrop" tabindex="0" style="padding:18px">
          <b>${a.contas.length ? "Adicionar outra fatura deste cliente" : "Solte aqui a fatura da Copel do cliente"}</b>
          <p>${ui.lendo ? `Lendo ${ui.lendo} arquivo(s)…` : "PDF da 1ª ou 2ª via · pode ser mais de uma UC"}</p>
          <input type="file" id="pjFiles" accept="application/pdf,.pdf" multiple hidden>
        </label>
        ${a.contas.length ? `<div class="table-wrap" style="margin-top:12px;box-shadow:none"><table><thead><tr><th>UC</th><th>Titular · endereço</th><th>Ref.</th><th class="n">Média 12 meses</th><th class="n">Fatura</th><th>Créditos atuais</th><th></th></tr></thead><tbody>
          ${a.contas.map((c, i) => { const f = c.campos; const h = (f.historico || []).slice(0, 12); const media = h.length ? h.reduce((s, x) => s + x.kwh, 0) / h.length : f.consumoKwh; return `<tr>
            <td class="mono">${esc(fmt.uc(f.uc || f.ucConces))}<small>${esc(f.fase || "")}${f.grupoTarifario ? " · " + esc(f.grupoTarifario) : ""}</small></td><td>${esc(f.titular || "")}<small>${esc(f.endereco || "")}</small></td>
            <td>${esc(fmt.mes(f.referencia))}</td><td class="n">${fmt.kwh(media)}<small>${h.length} meses</small></td><td class="n">${fmt.brl(f.total)}</td>
            <td>${Number(f.compensadoKwh) ? `${fmt.kwh(f.compensadoKwh)}<small>${f.creditoProprio ? "geração própria (GD I)" : "de outra usina"}</small>` : "—"}</td>
            <td class="right"><button class="btn ghost sm" data-rm="${i}">✕</button></td></tr>`; }).join("")}</tbody></table></div>` : ""}
      </div>
      ${a.contas.length ? `
      <div class="card"><h2>Acordo de arrendamento</h2><p class="sub">Mude os valores e a projeção recalcula na hora.</p>
        <div class="grid-form">
          <label class="f">Nome da projeção<input id="pjNome" value="${esc(a.nome)}"></label>
          <label class="f">Cliente<input id="pjCliente" value="${esc(a.cliente)}"></label>
          <label class="f">Tipo de acordo<select data-p="acordo">${opts([["fixo", "Valor fixo por mês"], ["kwh", "R$ por kWh compensado"], ["desconto", "Desconto sobre o crédito"]], p.acordo)}</select></label>
          ${p.acordo === "fixo" ? `<label class="f">Arrendamento (R$/mês)<input data-p="valorFixo" inputmode="decimal" value="${esc(p.valorFixo)}" placeholder="6000"></label>` : ""}
          ${p.acordo === "kwh" ? `<label class="f">Valor por kWh (R$)<input data-p="valorKwh" inputmode="decimal" value="${esc(p.valorKwh)}" placeholder="0,55"></label>` : ""}
          ${p.acordo === "desconto" ? `<label class="f">Desconto ao cliente (%)<input data-p="desconto" inputmode="decimal" value="${esc(p.desconto)}"><small>cliente paga o restante do valor do crédito</small></label>` : ""}
          <label class="f">Cobertura da usina (%)<input data-p="cobertura" inputmode="decimal" value="${esc(p.cobertura)}"><small>parte do consumo compensável atendida</small></label>
          <label class="f">Geração da usina<select data-p="geracaoModo">${opts([["", "Sem limite (cobre todo o consumo)"], ["fixa", "Valor fixo por mês"], ["kwp", "Estimar pela potência (kWp)"], ["usina", "Histórico real de uma usina"]], p.geracaoModo || "")}</select><small>a sobra de um mês vira saldo para os seguintes</small></label>
          ${p.geracaoModo === "fixa" ? `<label class="f">Geração (kWh/mês)<input data-p="geracaoUsina" inputmode="decimal" value="${esc(p.geracaoUsina)}"></label>` : ""}
          ${p.geracaoModo === "kwp" ? `<label class="f">Potência da usina (kWp)<input data-p="kwp" inputmode="decimal" value="${esc(p.kwp)}"></label>
          <label class="f">Local da usina<span class="inline" style="flex-wrap:nowrap"><input id="pjLocal" value="${esc((p.local && p.local.nome) || "")}" placeholder="Cidade, UF" style="flex:1"><button class="btn sm" id="pjBuscaLocal" type="button">Calcular</button></span>
            <small>${p.local && p.local.meses ? `${esc(fmt.num(p.local.anual))} kWh/kWp/ano · ${esc(p.local.fonte)}${p.local.inclinacao ? ` · ${p.local.inclinacao}°` : ""}` : "informe a cidade para calcular mês a mês (sem local: média do PR, ~1.400 kWh/kWp/ano)"}</small></label>
          <label class="f">Perdas do sistema (%)<input data-p="perdas" inputmode="decimal" value="${esc(p.perdas ?? 14)}"><small>cabos, inversor, sujeira, temperatura · padrão 14%</small></label>` : ""}
          ${p.geracaoModo === "usina" ? `<label class="f">Usina<select data-p="usinaRef">${opts(P3.db().usinas.map(u => [u.id, u.nome]), p.usinaRef, "Escolha…")}</select><small>${(() => { const u = P3.db().by.usinas.get(p.usinaRef); const h = u && PJ.historicoUsina(P3.db().scee, u); return u ? (h ? `${h.conhecidos} mês(es) do demonstrativo · média ${fmt.kwh(h.media)}` : "sem demonstrativo dessa usina na base") : "geração real tirada dos demonstrativos"; })()}</small></label>` : ""}
          ${p.geracaoModo ? `<label class="f">Ajuste da geração (%)<input data-p="ajusteGeracao" inputmode="decimal" value="${esc(p.ajusteGeracao ?? -10)}"><small>margem de segurança: −10% = gerar 10% menos que o estimado</small></label>` : ""}
          ${p.geracaoModo ? `<label class="f">Saldo de créditos no 1º mês<select data-p="saldoModo">${opts([["nova", "Usina nova (saldo zero)"], ["regime", "Usina já operando (2º ano em diante)"], ["manual", "Informar o saldo"]], p.saldoModo || "nova")}</select><small>no 1º ano o saldo começa em zero; ele acumula nos meses de sobra</small></label>
          ${p.saldoModo === "manual" ? `<label class="f">Saldo inicial (kWh)<input data-p="saldoInicial" inputmode="decimal" value="${esc(p.saldoInicial ?? "")}"></label>` : ""}` : ""}
          <label class="f">Início da operação<input type="month" data-p="inicio" value="${esc(p.inicio || "")}"><small>vazio = mês seguinte à fatura (${esc(fmt.mes(M.addMonths(a.contas[0].campos.referencia, 1)))})</small></label>
          <label class="f">Correção da tarifa (% ao ano)<input data-p="reajusteTarifa" inputmode="decimal" value="${esc(p.reajusteTarifa ?? "")}" placeholder="0"><small>reajuste anual do kWh da Copel, aplicado do 2º ano em diante</small></label>
          <label class="f">Regra do Fio B<select data-p="ano">${opts([["", "Pelo ano de cada mês (60% → 75% → 90%)"], ["2026", "Fixar 2026 · 60%"], ["2027", "Fixar 2027 · 75%"], ["2028", "Fixar 2028 · 90%"]], p.ano)}</select></label>
          <label class="f">Bandeira<select data-p="bandeira">${opts([["fatura", "A da fatura"], ["verde", "Verde (sem bandeira)"]], ["fatura", "verde"].includes(p.bandeira) ? p.bandeira : "fatura")}</select></label>
          <label class="f">Fio B sem tributos (R$/kWh)<input data-p="fioBBase" inputmode="decimal" value="${esc(p.fioBBase)}" placeholder="${esc(n6(fioB.valor))}"><small>${esc(fioB.fonte)}</small></label>
          ${temCreditos ? `<label class="f">Créditos que a UC já recebe (${fmt.kwh(a.contas.reduce((s, c) => s + (Number(c.campos.compensadoKwh) || 0), 0))}/mês)<select data-p="manterCreditosAtuais">${opts([["sim", "Manter na conta (a usina cobre o restante)"], ["nao", "Tirar da projeção (mostrar só a usina P3)"]], p.manterCreditosAtuais === false ? "nao" : "sim")}</select><small>${a.contas.some(c => c.campos.creditoProprio) ? "hoje vêm de geração própria (GD I)" : "hoje vêm de outra usina"}</small></label>` : ""}
        </div>
        <hr class="sep"><b style="font-size:13px">Custos da UC geradora</b><p class="muted" style="font-size:12.5px;margin:2px 0 8px">Pelas regras da ANEEL a geradora continua pagando o custo de disponibilidade (mínimo da ligação) e a iluminação pública.</p>
        <div class="grid-form">
          <label class="f">Incluir na projeção<select data-p="cuIncluir">${opts([["sim", "Sim"], ["nao", "Não"]], p.cuIncluir || "sim")}</select></label>
          ${(p.cuIncluir || "sim") === "sim" ? `
          <label class="f">Ligação da usina<select data-p="cuFase">${opts([["trifasico", "Trifásica · 100 kWh"], ["bifasico", "Bifásica · 50 kWh"], ["monofasico", "Monofásica · 30 kWh"]], p.cuFase || "trifasico")}</select><small>mínimo cobrado na tarifa com bandeira</small></label>
          <label class="f">Iluminação pública da usina (R$/mês)<input data-p="cuIP" inputmode="decimal" value="${esc(p.cuIP ?? "")}" placeholder="0,00"><small>taxa do município da usina</small></label>
          <label class="f">Outros custos (R$/mês)<input data-p="cuOutros" inputmode="decimal" value="${esc(p.cuOutros ?? "")}" placeholder="0,00"></label>
          <label class="f">Quem paga<select data-p="cuQuem">${opts(p.imAtivo === "sim" ? [["cliente", "Cliente (entra no custo dele)"], ["p3", "P3"], ["dono", "Dono da usina"]] : [["cliente", "Cliente (entra no custo dele)"], ["p3", "P3 / dono (fora da conta do cliente)"]], p.imAtivo !== "sim" && p.cuQuem === "dono" ? "p3" : (p.cuQuem || "cliente"))}</select></label>` : ""}
        </div>
        <hr class="sep"><b style="font-size:13px">Usina arrendada de terceiro</b><p class="muted" style="font-size:12.5px;margin:2px 0 8px">Quando a P3 arrenda a usina de um dono e repassa ao cliente pelo acordo acima: mostra a economia do cliente, o resultado do dono e o lucro da P3.</p>
        <div class="grid-form">
          <label class="f">A P3 arrenda a usina de um dono?<select data-p="imAtivo">${opts([["nao", "Não"], ["sim", "Sim"]], p.imAtivo || "nao")}</select></label>
          ${p.imAtivo === "sim" ? `
          <label class="f">Dono / usina<input data-p="imDono" value="${esc(p.imDono || "")}" placeholder="Nome do dono ou da usina"></label>
          <label class="f">Pagamento ao dono<select data-p="imModo">${opts([["kwh", "R$ por kWh compensado"], ["fixo", "Valor fixo por mês"]], p.imModo || "kwh")}</select></label>
          ${(p.imModo || "kwh") === "kwh" ? `<label class="f">Valor ao dono (R$/kWh)<input data-p="imKwh" inputmode="decimal" value="${esc(p.imKwh ?? "")}" placeholder="0,40"></label>` : `<label class="f">Valor ao dono (R$/mês)<input data-p="imFixo" inputmode="decimal" value="${esc(p.imFixo ?? "")}"></label>`}
          <label class="f">Imposto da P3 (%)<input data-p="imImposto" inputmode="decimal" value="${esc(p.imImposto ?? "")}" placeholder="0"><small>sobre o arrendamento que o cliente paga à P3</small></label>
          <label class="f">Salvar e gerar PDF com<select data-p="visao">${opts([["todos", "Tudo (cliente, dono e P3) · interno"], ["cliente", "Só o resultado do cliente"], ["dono", "Só o resultado do dono"]], p.visao || "todos")}</select><small>a projeção salva e o PDF mostram só essa parte</small></label>` : ""}
        </div>
        <div class="inline" style="margin-top:14px"><button class="btn primary" id="pjSalvar">${a.id ? "Salvar alterações" : "Salvar projeção"}</button><button class="btn" id="pjPdf" ${a.id ? "" : "disabled title='Salve antes'"}>Gerar PDF</button>${a.id ? `<button class="btn ghost danger" id="pjExcluir">Excluir</button>` : ""}<span id="pjPdfLink"></span></div>
      </div>
      <div id="pjRes"></div>` : `<div class="empty">Suba ao menos uma fatura para calcular.</div>`}`;

    const drop = $("#pjDrop"), input = $("#pjFiles");
    input.onchange = () => { ler([...input.files]); input.value = ""; };
    ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", e => ler([...e.dataTransfer.files]));
    $$("[data-rm]", el).forEach(b => b.onclick = () => { a.contas.splice(Number(b.dataset.rm), 1); editor(el, fioB); });
    if (!a.contas.length) return;
    $("#pjNome").oninput = e => { a.nome = e.target.value; };
    $("#pjCliente").oninput = e => { a.cliente = e.target.value; };
    $$("[data-p]", el).forEach(i => {
      const ev = i.tagName === "SELECT" || i.type === "checkbox" ? "change" : "input";
      i.addEventListener(ev, () => {
        p[i.dataset.p] = i.dataset.p === "manterCreditosAtuais" ? i.value !== "nao" : i.type === "checkbox" ? i.checked : i.value;
        if (["acordo", "geracaoModo", "usinaRef", "saldoModo", "cuIncluir", "imAtivo", "imModo", "visao"].includes(i.dataset.p)) return editor(el, fioB);
        resultado($("#pjRes"), fioB);
      });
    });
    if ($("#pjBuscaLocal")) $("#pjBuscaLocal").onclick = async () => {
      const b = $("#pjBuscaLocal"), local = $("#pjLocal").value.trim();
      if (!local) return toast("Informe a cidade da usina.", "bad");
      b.disabled = true; b.textContent = "Buscando…";
      try {
        const r = await api(`geracao-local?local=${encodeURIComponent(local)}&perdas=${encodeURIComponent(num(p.perdas) || 14)}`);
        p.local = { nome: local, achado: r.local, lat: r.lat, lon: r.lon, meses: r.meses, anual: r.anual, inclinacao: r.inclinacao, fonte: r.fonte, perdas: r.perdas };
        toast(`${r.local}: ${fmt.num(r.anual)} kWh/kWp/ano.`, "ok");
      } catch (e) { toast(e.message, "bad"); }
      editor(el, fioB);
    };
    $("#pjSalvar").onclick = salvar;
    $("#pjPdf").onclick = gerarPdf;
    if ($("#pjExcluir")) $("#pjExcluir").onclick = async () => {
      if (!await confirmar("Excluir projeção", `Excluir <b>${esc(a.nome)}</b>? Fica registrada na auditoria.`, "Excluir")) return;
      await P3.del("projecoes", a.id); ui.atual = novo(); location.hash = "#/projecao"; render($("#main"));
    };
    resultado($("#pjRes"), fioB);
  }

  function paramsCalc(fioB) {
    const p = ui.atual.params;
    return {
      acordo: p.acordo, valorFixo: num(p.valorFixo) || 0, valorKwh: num(p.valorKwh) || 0, desconto: num(p.desconto) || 0,
      cobertura: num(p.cobertura) === "" ? 100 : num(p.cobertura), ano: num(p.ano) || "", inicio: p.inicio || "",
      ajusteGeracao: num(p.ajusteGeracao) === "" ? -10 : num(p.ajusteGeracao), reajusteTarifa: num(p.reajusteTarifa) || 0,
      custosUsina: { incluir: (p.cuIncluir || "sim") === "sim", fase: p.cuFase || "trifasico", iluminacao: num(p.cuIP) || 0, outros: num(p.cuOutros) || 0, quemPaga: p.imAtivo !== "sim" && p.cuQuem === "dono" ? "p3" : (p.cuQuem || "cliente") },
      intermediacao: { ativo: p.imAtivo === "sim", dono: p.imDono || "", modo: p.imModo || "kwh", valorKwh: num(p.imKwh) || 0, valorFixo: num(p.imFixo) || 0, impostoPct: num(p.imImposto) || 0 },
      visao: p.imAtivo === "sim" ? (p.visao || "todos") : "cliente",
      geracaoModo: p.geracaoModo || "", kwp: num(p.kwp) || "", usinaRef: p.usinaRef || "", saldoModo: p.saldoModo || "nova", saldoInicial: num(p.saldoInicial) || 0,
      geracaoUsina: p.geracaoModo === "fixa" ? num(p.geracaoUsina) || 0 : 0,
      local: p.local || null, perdas: num(p.perdas) || 14,
      geracaoPorMes: p.geracaoModo === "kwp" && num(p.kwp) ? (p.local && p.local.meses ? p.local.meses.map(v => Math.round(v * num(p.kwp) * (1 - (num(p.perdas) || 14) / 100) / (1 - (p.local.perdas || 14) / 100))) : PJ.porPotencia(num(p.kwp)))
        : p.geracaoModo === "usina" && P3.db().by.usinas.get(p.usinaRef) ? ((PJ.historicoUsina(P3.db().scee, P3.db().by.usinas.get(p.usinaRef)) || {}).meses || null) : null,
      bandeira: p.bandeira, manterCreditosAtuais: p.manterCreditosAtuais !== false, fioBBase: num(p.fioBBase) || fioB.valor
    };
  }

  function resultado(el, fioB) {
    let r, anos;
    const pc = paramsCalc(fioB);
    try { r = PJ.projetar(ui.atual.contas, pc); anos = PJ.porAnos(ui.atual.contas, pc, 5); }
    catch (e) { el.innerHTML = `<div class="note bad">${esc(e.message)}</div>`; return; }
    ui.ultimo = r;
    const A = r.anual, t = r.contas[0].tarifas;
    const semValor = (pc.acordo === "fixo" && !pc.valorFixo) || (pc.acordo === "kwh" && !pc.valorKwh);
    const op = A.intermediacao ? operacao(r, anos, pc) : "";
    if (pc.visao === "dono") { el.innerHTML = op; return; }
    el.innerHTML = (pc.visao === "todos" ? op : "") + (A.compensado ? custoCard(r, pc) : "") + `
      ${semValor ? `<div class="note warn">Informe o valor do arrendamento para ver a economia. Abaixo, quanto cobrar para cada nível de economia.</div>` : ""}
      <div class="kpis" style="margin-top:4px">
        ${kpi("Conta Copel hoje · 12 meses", fmt.brl(A.hoje), `média ${fmt.brl(A.hoje / r.meses.length)}/mês`)}
        ${kpi("Com a usina P3", fmt.brl(A.total), `Copel ${fmt.brl(A.comUsina)} + arrend. ${fmt.brl(A.arrendamento)}`)}
        ${kpi("Economia projetada", fmt.brl(A.economia), `${fmt.pct(A.economiaPct)} · ${fmt.brl(r.media.economia)}/mês`, "lead")}
        ${kpi("Valor dos créditos", fmt.brl(A.valorCredito), `${fmt.kwh(A.compensado)} compensados`)}
        ${kpi("Pior mês", r.piorMes ? fmt.brl(r.piorMes.economia) : "—", r.piorMes ? `${fmt.mes(r.piorMes.mes)} · ${fmt.kwh(r.piorMes.consumo)}` : "")}
        ${A.custoUsinaMes ? kpi("Custos da UC geradora", fmt.brl(A.custoUsinaMes) + "/mês", ({ p3: A.intermediacao ? "pagos pela P3" : "pagos pela P3/dono", dono: "pagos pelo dono da usina" })[pc.custosUsina.quemPaga] || "pagos pelo cliente (já no total)") : ""}
        ${A.geracao != null ? kpi("Geração da usina · 12 meses", fmt.kwh(A.geracao), `já com ${A.ajusteGeracao}% · compensado ${fmt.pct(A.geracao ? A.compensado / A.geracao : 0)} da geração · saldo ${fmt.kwh(A.saldoFinal)}${r.regime ? " (em regime)" : ""}`) : ""}
      </div>
      ${A.faltou > 0 ? `<div class="note warn" style="margin-top:10px">A geração não cobre todo o consumo: faltaram ${fmt.kwh(A.faltou)} no ano (o cliente paga esse consumo cheio na Copel).</div>` : ""}
      ${A.saldoFinal > (A.compensado / 12) * 2 ? `<div class="note" style="margin-top:10px">Sobra crédito: termina o ano com ${fmt.kwh(A.saldoFinal)} de saldo (mais de 2 meses de consumo). Dá para atender mais UCs com esta usina.</div>` : ""}
      <div class="grid2 section">
        <div class="card"><h2>Mês a mês</h2><p class="sub">Histórico real de consumo da fatura × tarifas atuais</p>
          ${P3.chart(r.meses.map(m => ({ ...m, competencia: m.mes })), [{ label: "Conta hoje", cls: "a", get: m => m.hoje }, { label: "Economia", cls: "b", get: m => Math.max(0, m.economia) }])}</div>
        <div class="card"><h2>Quanto cobrar de arrendamento</h2><p class="sub">Valor fixo mensal para o cliente ter cada nível de economia no ano</p>
          <div style="overflow-x:auto"><table><thead><tr><th>Economia</th><th class="n">Arrend./mês</th><th class="n">Por ano</th></tr></thead>
          <tbody>${r.faixas.map(f => `<tr><td>${f.economiaPct ? fmt.pct(f.economiaPct) : "0% (empate)"}</td><td class="n"><b>${fmt.brl(f.arrendamentoFixo)}</b></td><td class="n">${fmt.brl(f.arrendamentoFixo * 12)}</td></tr>`).join("")}</tbody></table></div>
          <p class="muted" style="font-size:12px;margin:6px 0 0">Equivale a ${fmt.brl(A.valorCredito / Math.max(1, A.compensado))} por kWh compensado no empate.</p></div>
      </div>
      <div class="section"><div class="table-wrap"><table><thead><tr><th>Mês</th><th class="n">Consumo</th>${A.geracao != null ? `<th class="n">Geração</th>` : ""}<th class="n">Compensado</th>${A.geracao != null ? `<th class="n">Saldo acumulado</th>` : ""}<th class="n">Conta hoje</th><th class="n">Copel com usina</th><th class="n">Arrendamento</th><th class="n">Total</th><th class="n">Economia</th></tr></thead>
        <tbody>${r.meses.map(m => `<tr><td><b>${esc(fmt.mes(m.mes))}</b></td><td class="n">${fmt.kwh(m.consumo)}</td>${A.geracao != null ? `<td class="n">${fmt.kwh(m.geracao)}</td>` : ""}<td class="n">${fmt.kwh(m.compensado)}${m.faltou ? `<small class="neg">faltou ${fmt.kwh(m.faltou)}</small>` : ""}</td>${A.geracao != null ? `<td class="n">${fmt.kwh(m.saldo)}</td>` : ""}<td class="n">${fmt.brl(m.hoje)}</td><td class="n">${fmt.brl(m.comUsina)}</td><td class="n">${fmt.brl(m.arrendamento)}</td><td class="n">${fmt.brl(m.total)}</td><td class="n ${m.economia >= 0 ? "pos" : "neg"}"><b>${fmt.brl(m.economia)}</b><small>${fmt.pct(m.hoje ? m.economia / m.hoje : 0)}</small></td></tr>`).join("")}</tbody>
        <tfoot><tr><td>12 meses</td><td class="n">${fmt.kwh(A.consumo)}</td>${A.geracao != null ? `<td class="n">${fmt.kwh(A.geracao)}</td>` : ""}<td class="n">${fmt.kwh(A.compensado)}</td>${A.geracao != null ? `<td class="n">${fmt.kwh(A.saldoFinal)}</td>` : ""}<td class="n">${fmt.brl(A.hoje)}</td><td class="n">${fmt.brl(A.comUsina)}</td><td class="n">${fmt.brl(A.arrendamento)}</td><td class="n">${fmt.brl(A.total)}</td><td class="n">${fmt.brl(A.economia)}</td></tr></tfoot></table></div></div>
      <div class="grid2 section">
        <div class="card"><h2>Tarifas lidas da fatura</h2><p class="sub">${esc(fmt.mesLongo(r.contas[0].referencia))} · ${esc(t.fase)} · mínimo ${t.minimo} kWh</p>
          <table><tbody>
            <tr><td>Energia + distribuição (com tributos)</td><td class="n"><b>R$ ${n6(t.tarifa)}</b><small>TE ${n6(t.te)} + TUSD ${n6(t.tusd)}</small></td></tr>
            <tr><td>Valor efetivo do crédito GD II</td><td class="n"><b>R$ ${n6(t.credito)}</b><small>${fmt.pctN(t.pctFioB * 100)} do Fio B não compensado</small></td></tr>
            <tr><td>Fio B integral efetivo</td><td class="n">R$ ${n6(t.fioB)}<small>sem tributos ${n6(t.fioBBase)} × PIS/COFINS ${fmt.num(t.fatorPC, 4)}</small></td></tr>
            <tr><td>Bandeira</td><td class="n">${t.bandeira ? `R$ ${n6(t.bandeira)}` : "verde"}</td></tr>
            <tr><td>Iluminação pública (encargo fixo)</td><td class="n">${fmt.brl(t.iluminacao)}/mês</td></tr>
            ${t.creditosAtuaisKwh ? `<tr><td>Créditos que a UC já recebe</td><td class="n">${fmt.kwh(t.creditosAtuaisKwh)}/mês<small>R$ ${n6(t.creditosAtuaisRate)}/kWh</small></td></tr>` : ""}
          </tbody></table></div>
        <div class="card"><h2>Ano a ano</h2><p class="sub">${A.geracao != null ? "O saldo que sobra num ano passa para o seguinte · " : ""}Fio B: 60% → 75% → 90% (Lei 14.300)${pc.reajusteTarifa ? ` · tarifa corrigida ${fmt.pctN(pc.reajusteTarifa)} ao ano` : ""}</p>
          <div style="overflow-x:auto"><table><thead><tr><th>Ano</th><th class="n">Fio B</th>${A.geracao != null ? `<th class="n">Saldo início</th>` : ""}<th class="n">Economia/mês</th><th class="n">%</th><th class="n">No ano</th>${A.geracao != null ? `<th class="n">Saldo fim</th>` : ""}</tr></thead>
          <tbody>${anos.map(x => `<tr><td><b>${x.n}º</b> <small style="display:inline">${esc(x.periodo)}</small></td><td class="n">${x.pctsFioB.map(v => fmt.pctN(v * 100)).join(" → ")}</td>${A.geracao != null ? `<td class="n">${fmt.kwh(x.saldoInicio)}</td>` : ""}<td class="n"><b>${fmt.brl(x.economiaMes)}</b></td><td class="n">${fmt.pct(x.economiaPct)}</td><td class="n">${fmt.brl(x.economia)}${x.faltou ? `<small class="neg">faltam ${fmt.kwh(x.faltou)}</small>` : ""}</td>${A.geracao != null ? `<td class="n">${fmt.kwh(x.saldoFim)}</td>` : ""}</tr>`).join("")}</tbody>
          <tfoot><tr><td colspan="${A.geracao != null ? 5 : 4}">5 anos</td><td class="n">${fmt.brl(anos.reduce((s, x) => s + x.economia, 0))}</td>${A.geracao != null ? "<td></td>" : ""}</tr></tfoot></table></div></div>
      </div>`;
  }

  // Usina arrendada de terceiro: economia do cliente, resultado do dono e lucro da P3 (ou só o do dono).
  function operacao(r, anos, pc) {
    const A = r.anual, nM = r.meses.length, so = pc.visao === "dono", im = pc.intermediacao;
    const quem = { cliente: "cliente", p3: "P3", dono: "dono" }[A.quemPagaCustos];
    const valorDono = im.modo === "fixo" ? `${fmt.brl(im.valorFixo)}/mês` : `R$ ${fmt.num(im.valorKwh, 2)}/kWh compensado`;
    const kpis = so
      ? kpi("Dono recebe · 12 meses", fmt.brl(A.donoRecebe), `${valorDono} · ${fmt.kwh(A.compensado)}`, "lead")
        + kpi("Líquido do dono por mês", fmt.brl(A.donoLiquido / nM), A.donoCustos ? `já sem ${fmt.brl(A.donoCustos / nM)}/mês da UC geradora` : "média do 1º ano")
        + kpi("Líquido em 5 anos", fmt.brl(anos.reduce((s, x) => s + n(x.donoLiquido), 0)), "com a transição do Fio B")
      : kpi("Economia do cliente", fmt.brl(A.economia), `${fmt.pct(A.economiaPct)} · ${fmt.brl(A.economia / nM)}/mês`)
        + kpi("Dono da usina", fmt.brl(A.donoLiquido), `${valorDono}${A.donoCustos ? ` · menos custos da UC` : ""} · ${fmt.brl(A.donoLiquido / nM)}/mês`)
        + kpi("Lucro da P3", fmt.brl(A.p3Lucro), `${fmt.brl(A.p3Lucro / nM)}/mês · R$ ${fmt.num(A.margemKwh, 4)}/kWh`, "lead");
    const cols = so ? ["Compensado", "Dono recebe", ...(A.donoCustos ? ["Custos da UC"] : []), "Líquido do dono"]
      : ["Compensado", "Economia do cliente", "Cliente paga à P3", "P3 paga ao dono", ...(A.p3Custos || A.donoCustos ? [`Custos da UC (${quem})`] : []), ...(A.p3Imposto ? ["Imposto P3"] : []), "Lucro da P3"];
    const linha = m => so
      ? [fmt.kwh(m.compensado), fmt.brl(m.donoRecebe), ...(A.donoCustos ? [fmt.brl(m.donoCustos)] : []), `<b>${fmt.brl(m.donoLiquido)}</b>`]
      : [fmt.kwh(m.compensado), fmt.brl(m.economia), fmt.brl(m.p3Recebe), fmt.brl(m.donoRecebe), ...(A.p3Custos || A.donoCustos ? [fmt.brl(m.p3Custos || m.donoCustos)] : []), ...(A.p3Imposto ? [fmt.brl(m.p3Imposto)] : []), `<b class="${m.p3Lucro >= 0 ? "pos" : "neg"}">${fmt.brl(m.p3Lucro)}</b>`];
    return `
      <div class="card"><h2>${so ? `Resultado do dono${im.dono ? ` · ${esc(im.dono)}` : ""}` : "Resultado da operação"}</h2>
        <p class="sub">${so ? `A P3 arrenda a usina e paga ao dono ${valorDono}` : `Cliente paga à P3 pelo acordo · P3 paga ao dono ${valorDono}${im.dono ? ` (${esc(im.dono)})` : ""}`}</p>
        ${A.compensado ? "" : `<div class="note warn">Sem kWh compensado: confira o consumo e a geração.</div>`}
        ${!so && A.p3Lucro < 0 ? `<div class="note bad">Com estes valores a P3 tem prejuízo.</div>` : ""}
        <div class="kpis" style="margin-top:4px">${kpis}</div>
        <div class="table-wrap section" style="box-shadow:none"><table><thead><tr><th>Mês</th>${cols.map(c => `<th class="n">${c}</th>`).join("")}</tr></thead>
          <tbody>${r.meses.map(m => `<tr><td><b>${esc(fmt.mes(m.mes))}</b></td>${linha(m).map(v => `<td class="n">${v}</td>`).join("")}</tr>`).join("")}</tbody>
          <tfoot><tr><td>12 meses</td>${linha(A).map(v => `<td class="n">${v}</td>`).join("")}</tr></tfoot></table></div>
        <h3 style="margin:14px 0 6px;font-size:13px">Ano a ano</h3>
        <div style="overflow-x:auto"><table><thead><tr><th>Ano</th><th class="n">Compensado</th>${so ? "" : `<th class="n">Economia do cliente</th>`}<th class="n">Líquido do dono</th>${so ? "" : `<th class="n">Lucro da P3</th>`}</tr></thead>
          <tbody>${anos.map(x => `<tr><td><b>${x.n}º</b> <small style="display:inline">${esc(x.periodo)}</small></td><td class="n">${fmt.kwh(x.compensado)}</td>${so ? "" : `<td class="n">${fmt.brl(x.economia)}</td>`}<td class="n">${fmt.brl(x.donoLiquido)}</td>${so ? "" : `<td class="n"><b>${fmt.brl(x.p3Lucro)}</b></td>`}</tr>`).join("")}</tbody>
          <tfoot><tr><td>5 anos</td><td class="n">${fmt.kwh(anos.reduce((s, x) => s + n(x.compensado), 0))}</td>${so ? "" : `<td class="n">${fmt.brl(anos.reduce((s, x) => s + n(x.economia), 0))}</td>`}<td class="n">${fmt.brl(anos.reduce((s, x) => s + n(x.donoLiquido), 0))}</td>${so ? "" : `<td class="n">${fmt.brl(anos.reduce((s, x) => s + n(x.p3Lucro), 0))}</td>`}</tr></tfoot></table></div>
        ${so ? `<p class="muted" style="font-size:12px;margin:8px 0 0">Visão do dono: a projeção salva e o PDF mostram só o resultado dele. Para ver o cliente e a P3, troque em "Salvar e gerar PDF com".</p>` : ""}
      </div>`;
  }
  const n = v => Number(v) || 0;

  // Quanto custa, no total, cada kWh compensado para o cliente: usina + Fio B + impostos (× tarifa cheia).
  function custoCard(r, pc) {
    const c = PJ.custoKwh(r), interno = r.anual.intermediacao && pc.visao === "todos";
    const R = v => `R$ ${fmt.num(v, 4)}`;
    const linha = (rot, v, sub, cls) => `<tr class="${cls || ""}"><td>${rot}${sub ? `<small>${sub}</small>` : ""}</td><td class="n">${cls === "tot" ? `<b>${R(v)}</b>` : R(v)}</td></tr>`;
    return `
      <div class="card section"><h2>Custo do kWh</h2><p class="sub">Por kWh compensado, com as tarifas do 1º mês · Fio B não compensado ${fmt.pctN(c.pctFioB * 100)}</p>
        <table><tbody>
          ${interno ? linha("Usina (pago ao dono)", c.usina) + linha("Margem da P3", c.margemP3, "o cliente paga " + R(c.arrendamento) + " à P3") : linha("Usina (arrendamento)", c.arrendamento)}
          ${linha("Fio B não compensado", c.fioB, "sem tributos, pago à Copel")}
          ${linha("Impostos que não compensam", c.impostos, `ICMS da TUSD ${R(c.icmsTusd)} + PIS/COFINS do Fio B ${R(c.pisCofins)}`)}
          ${interno ? linha("Total sem a margem da P3", c.semMargem, "usina + Fio B + impostos") : ""}
          ${linha("Total por kWh", c.total, interno ? "o que o cliente paga" : "", "tot")}
          ${linha("Tarifa cheia da Copel (hoje)", c.tarifaCheia, "energia + distribuição, com tributos")}
          <tr><td><b>Economia por kWh</b></td><td class="n pos"><b>${R(c.economia)}</b><small>${fmt.pct(c.economiaPct)}</small></td></tr>
        </tbody></table>
        <p class="muted" style="font-size:12px;margin:6px 0 0">Não entram aqui o mínimo da ligação e a iluminação pública, que são fixos por mês. A bandeira compensa junto com o crédito. O Fio B sobe para 75% em 2027 e 90% em 2028.</p>
      </div>`;
  }

  async function ler(files) {
    files = files.filter(f => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
    if (!files.length) return toast("Nenhum PDF nesses arquivos.", "bad");
    ui.lendo = files.length; render($("#main"));
    for (const f of files) {
      try {
        const r = await api("ler-pdf", { method: "POST", body: f, raw: true, headers: { "X-Nome": encodeURIComponent(f.name), "X-So-Ler": "1" } });
        if (!r.ok) toast(`${f.name}: ${r.erro}`, "bad");
        else if (r.tipo !== "fatura") toast(`${f.name}: é um demonstrativo, não uma fatura.`, "bad");
        else {
          const c = r.campos;
          ui.atual.contas = ui.atual.contas.filter(x => (x.campos.uc || x.campos.ucConces) !== (c.uc || c.ucConces));
          ui.atual.contas.push({ campos: c, apelido: c.endereco || "" });
          if (!ui.atual.cliente) ui.atual.cliente = c.titular || "";
          if (!ui.atual.nome) ui.atual.nome = `${(c.titular || "Cliente").split(" ").slice(0, 3).join(" ")} · ${fmt.mes(c.referencia)}`;
        }
      } catch (e) { toast(`${f.name}: ${e.message}`, "bad"); }
      ui.lendo--;
    }
    render($("#main"));
  }

  async function salvar() {
    const a = ui.atual;
    if (!a.nome.trim()) return toast("Dê um nome para a projeção.", "bad");
    const r = ui.ultimo;
    // Grava os parâmetros já normalizados (números), para o PDF calcular igual à tela.
    const dados = { nome: a.nome, cliente: a.cliente, params: { ...a.params, ...paramsCalc(ui.fioB || PJ.FIOB_PADRAO) }, contas: a.contas, resumo: r ? { economia: r.anual.economia, economiaPct: r.anual.economiaPct, arrendamento: r.anual.arrendamento, hoje: r.anual.hoje,
      visao: paramsCalc(ui.fioB || PJ.FIOB_PADRAO).visao, donoLiquido: r.anual.donoLiquido ?? null, p3Lucro: r.anual.p3Lucro ?? null } : {} };
    try {
      const s = await P3.save("projecoes", dados, a.id);
      a.id = s.id; toast("Projeção salva.", "ok");
      location.hash = `#/projecao/${encodeURIComponent(s.id)}`;
    } catch (e) { toast(e.message, "bad"); }
  }

  async function gerarPdf() {
    const b = $("#pjPdf"); b.disabled = true; b.textContent = "Gerando…";
    try {
      await salvar();
      const r = await api("relatorio/pdf", { method: "POST", body: { tipo: "projecao", id: ui.atual.id } });
      $("#pjPdfLink").innerHTML = `<a href="/api/relatorio/arquivo?caminho=${encodeURIComponent(r.caminho)}" target="_blank" rel="noopener">${esc(r.nome)}</a>`;
      window.P3_IMPRIMIR(r.caminho);
    } catch (e) { toast(e.message, "bad"); } finally { b.disabled = false; b.textContent = "Gerar PDF"; }
  }

  P3.register("projecao", { render });
})();
