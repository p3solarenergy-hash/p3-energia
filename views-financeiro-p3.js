// Financeiro P3: as contas da própria empresa, separadas das usinas. O que a P3 paga e recebe, de quem é cada
// despesa (da P3 ou paga por conta de outra operação, como a Uby) e o que ainda tem para cobrar de volta.
// Boletos em PDF entram direto: valor, vencimento, código de barras e Pix saem do próprio boleto (boleto.js).
(function () {
  "use strict";
  const { esc, $, $$, fmt, api, toast, opts, modal, confirmar, formData, kpi, badge, M } = window.P3;
  const n = v => { if (v == null || v === "") return 0; if (typeof v === "number") return v; let s = String(v).trim().replace(/[R$\s]/g, ""); if (/,/.test(s)) s = s.replace(/\./g, "").replace(",", "."); else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); const x = Number(s); return Number.isFinite(x) ? x : 0; };
  const r2 = v => Math.round(v * 100) / 100;
  const POR_CONTA = [["p3", "P3"], ["uby", "Uby"], ["usinas", "Usinas"], ["obras", "Obras"], ["outro", "Outro"]];
  const NOME_CONTA = Object.fromEntries(POR_CONTA);
  const CAT_PAGAR = ["Seguros", "Impostos", "Contador", "Pró-labore e salários", "Aluguel", "Internet e telefone", "Software e sistemas", "Veículos e combustível", "Tarifas bancárias", "Marketing", "Fornecedores", "Outros"];
  const CAT_RECEBER = ["Gestão de usinas", "Obras", "Serviços", "Reembolso", "Outros"];
  const FORMAS = ["Pix", "Boleto", "Transferência", "Cartão", "Débito automático", "Dinheiro"];
  const REEMB = { nao: "Não", a_cobrar: "A cobrar", cobrado: "Cobrado", recebido: "Recebido" };
  const ui = { ver: "aberto", conta: "", tipo: "", busca: "" };
  let contas = [];

  const hoje = () => (P3.state.db && P3.state.db.hoje) || new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const dias = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
  const somar = (arr, f) => r2(arr.reduce((s, x) => s + (Number(f ? f(x) : x.valor) || 0), 0));
  const novoGrupo = () => "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const copiar = async (txt, msg) => { try { await navigator.clipboard.writeText(txt); toast(msg || "Copiado.", "ok"); } catch (_) { toast("Não consegui copiar.", "bad"); } };

  function situacao(c) {
    if (c.status === "pago") return badge(c.tipo === "receber" ? "Recebido" : "Pago", "ok");
    if (c.status === "cancelado") return badge("Cancelado");
    if (!c.vencimento) return badge("Em aberto");
    const d = dias(c.vencimento, hoje());
    if (d < 0) return badge(`Vencido há ${-d} dia${d === -1 ? "" : "s"}`, "bad");
    if (d === 0) return badge("Vence hoje", "warn");
    if (d <= 7) return badge(`Vence em ${d} dia${d === 1 ? "" : "s"}`, "warn");
    return badge("Em aberto");
  }

  async function render(main) {
    main.innerHTML = `<div class="loading">Carregando…</div>`;
    try { contas = await api("p3_contas"); marcarMenu(); } catch (e) { main.innerHTML = `<div class="note bad">${esc(e.message)}</div>`; return; }
    if (P3.state.route !== "financeiro-p3") return;
    desenhar(main);
  }
  // Número no menu: contas a pagar vencidas ou vencendo hoje.
  function marcarMenu() {
    const el = $("#fpAlert"); if (!el) return;
    const q = contas.filter(c => c.status === "aberto" && c.tipo !== "receber" && c.vencimento && c.vencimento <= hoje()).length;
    el.hidden = !q; el.textContent = q;
  }
  setTimeout(() => api("p3_contas").then(cs => { contas = cs; marcarMenu(); }).catch(() => {}), 1500);

  function desenhar(main) {
    const h = hoje(), mes = h.slice(0, 7), em30 = M.addMonths(mes, 1) + h.slice(7);
    const abertas = contas.filter(c => c.status === "aberto");
    const aPagar = abertas.filter(c => c.tipo !== "receber"), receber = abertas.filter(c => c.tipo === "receber");
    const vencidas = aPagar.filter(c => c.vencimento && c.vencimento < h);
    const pagos = contas.filter(c => c.status === "pago" && c.tipo !== "receber");
    const terceiros = contas.filter(c => c.tipo !== "receber" && c.por_conta && c.por_conta !== "p3" && c.status !== "cancelado");
    const aCobrar = terceiros.filter(c => c.status === "pago" && c.reembolso === "a_cobrar");

    const lista = contas.filter(c => (ui.ver === "todos" || c.status === ui.ver) && (!ui.conta || c.por_conta === ui.conta) && (!ui.tipo || (c.tipo || "pagar") === ui.tipo)
      && (!ui.busca || [c.descricao, c.contraparte, c.categoria, c.documento].join(" ").toLowerCase().includes(ui.busca.toLowerCase())))
      .sort((a, b) => ui.ver === "pago" ? String(b.pago_em || b.vencimento).localeCompare(String(a.pago_em || a.vencimento)) : String(a.vencimento || "9").localeCompare(String(b.vencimento || "9")));
    const porMes = new Map();
    for (const c of lista) { const k = String((ui.ver === "pago" ? c.pago_em : c.vencimento) || "").slice(0, 7) || "sem data"; if (!porMes.has(k)) porMes.set(k, []); porMes.get(k).push(c); }

    // Resumo por "de quem é" e por categoria (o que já foi pago nos últimos 12 meses).
    const desde = M.addMonths(mes, -11);
    const pagos12 = pagos.filter(c => String(c.pago_em || "").slice(0, 7) >= desde);
    const cats = [...new Set(pagos12.map(c => c.categoria || "Outros"))].map(k => [k, somar(pagos12.filter(c => (c.categoria || "Outros") === k))]).sort((a, b) => b[1] - a[1]);
    const contasUsadas = POR_CONTA.filter(([k]) => contas.some(c => c.por_conta === k && c.tipo !== "receber"));

    main.innerHTML = `
      <div class="head"><div><p class="kicker">Empresa P3</p><h1>Financeiro P3</h1><p>As contas da própria P3, separadas do financeiro das usinas: o que a P3 paga e recebe, de quem é cada despesa e o que ainda falta cobrar de volta.</p></div>
        <div class="actions"><label class="btn" for="fpImp">Importar boletos (PDF)</label><input type="file" id="fpImp" accept="application/pdf,.pdf" multiple hidden>
          <button class="btn" id="fpRec">+ A receber</button><button class="btn primary" id="fpNova">+ Conta a pagar</button></div></div>
      <div class="kpis">
        ${kpi("Vencido", fmt.brl(somar(vencidas)), vencidas.length ? `${vencidas.length} conta(s) em atraso` : "nada em atraso", vencidas.length ? "bad" : "")}
        ${kpi("A pagar · 30 dias", fmt.brl(somar(aPagar.filter(c => c.vencimento && c.vencimento >= h && c.vencimento <= em30))), `${fmt.brl(somar(aPagar))} em aberto no total`)}
        ${kpi("A receber · 30 dias", fmt.brl(somar(receber.filter(c => !c.vencimento || c.vencimento <= em30))), `${fmt.brl(somar(receber))} em aberto no total`)}
        ${kpi(`Pago em ${fmt.mes(mes)}`, fmt.brl(somar(pagos.filter(c => String(c.pago_em || "").startsWith(mes)))), `recebido ${fmt.brl(somar(contas.filter(c => c.tipo === "receber" && c.status === "pago" && String(c.pago_em || "").startsWith(mes))))}`)}
        ${terceiros.length ? kpi("Pago por conta de outros", fmt.brl(somar(terceiros.filter(c => c.status === "pago"))), `${fmt.brl(somar(terceiros.filter(c => c.status === "aberto")))} ainda a pagar${aCobrar.length ? ` · ${fmt.brl(somar(aCobrar))} a cobrar` : ""}`, "lead") : ""}
      </div>
      <div class="card" style="margin-top:16px">
        <div class="inline" style="flex-wrap:wrap;gap:8px;margin-bottom:10px">
          <select id="fpVer">${opts([["aberto", "Em aberto"], ["pago", "Pagos e recebidos"], ["cancelado", "Cancelados"], ["todos", "Todos"]], ui.ver)}</select>
          <select id="fpTipo">${opts([["pagar", "A pagar"], ["receber", "A receber"]], ui.tipo, "Pagar e receber")}</select>
          <select id="fpConta">${opts(POR_CONTA, ui.conta, "De quem: todos")}</select>
          <input id="fpBusca" placeholder="Buscar descrição, fornecedor, apólice…" value="${esc(ui.busca)}" style="flex:1;min-width:180px">
        </div>
        ${lista.length ? `<div class="table-wrap" style="box-shadow:none"><table><thead><tr><th>${ui.ver === "pago" ? "Pago em" : "Vencimento"}</th><th>Conta</th><th>De quem</th><th class="n">Valor</th><th>Situação</th><th></th></tr></thead><tbody>
        ${[...porMes].map(([k, cs]) => `<tr class="grupo"><td colspan="6"><b>${k === "sem data" ? "Sem data" : esc(fmt.mesLongo(k))}</b> <span class="muted">· ${cs.length} conta(s) · ${fmt.brl(somar(cs.filter(c => c.tipo !== "receber")))} a pagar${cs.some(c => c.tipo === "receber") ? ` · ${fmt.brl(somar(cs.filter(c => c.tipo === "receber")))} a receber` : ""}</span></td></tr>
          ${cs.map(linha).join("")}`).join("")}
        </tbody></table></div>` : `<div class="empty">${contas.length ? "Nada com esse filtro." : "Nenhuma conta ainda. Importe um boleto em PDF ou lance uma conta a pagar."}</div>`}
      </div>
      ${contas.length ? `<div class="grid2" style="margin-top:16px">
        <div class="card"><h2>De quem é cada despesa</h2><p class="sub">O que a P3 pagou e ainda vai pagar, separado pela operação a que a despesa pertence.</p>
          <div class="table-wrap" style="box-shadow:none"><table><thead><tr><th>Operação</th><th class="n">Pago</th><th class="n">A pagar</th><th class="n">Reembolso a cobrar</th></tr></thead><tbody>
          ${contasUsadas.map(([k, nome]) => { const cs = contas.filter(c => c.por_conta === k && c.tipo !== "receber" && c.status !== "cancelado"); return `<tr><td><b>${esc(nome)}</b></td><td class="n">${fmt.brl(somar(cs.filter(c => c.status === "pago")))}</td><td class="n">${fmt.brl(somar(cs.filter(c => c.status === "aberto")))}</td><td class="n">${k === "p3" ? "—" : fmt.brl(somar(cs.filter(c => c.status === "pago" && c.reembolso === "a_cobrar")))}</td></tr>`; }).join("")}
          </tbody></table></div></div>
        <div class="card"><h2>Pago por categoria</h2><p class="sub">Últimos 12 meses.</p>
          ${cats.length ? `<div class="table-wrap" style="box-shadow:none"><table><tbody>${cats.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${fmt.brl(v)}</td><td style="width:40%"><div style="height:8px;border-radius:4px;background:var(--brand-2);width:${Math.max(2, v / cats[0][1] * 100)}%"></div></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted" style="margin:0">Nada pago ainda.</p>`}</div>
      </div>` : ""}`;

    $("#fpNova").onclick = () => editar(null, "pagar");
    $("#fpRec").onclick = () => editar(null, "receber");
    $("#fpImp").onchange = e => { const fs = [...e.target.files]; e.target.value = ""; if (fs.length) importar(fs); };
    $("#fpVer").onchange = e => { ui.ver = e.target.value; desenhar(main); };
    $("#fpTipo").onchange = e => { ui.tipo = e.target.value; desenhar(main); };
    $("#fpConta").onchange = e => { ui.conta = e.target.value; desenhar(main); };
    $("#fpBusca").oninput = e => { ui.busca = e.target.value; clearTimeout(desenhar.t); desenhar.t = setTimeout(() => { desenhar(main); const b = $("#fpBusca"); b.focus(); b.setSelectionRange(b.value.length, b.value.length); }, 250); };
    const achar = id => contas.find(c => c.id === id);
    $$("[data-pagar]", main).forEach(b => b.onclick = () => pagar(achar(b.dataset.pagar)));
    $$("[data-ed]", main).forEach(b => b.onclick = () => editar(achar(b.dataset.ed)));
    $$("[data-cod]", main).forEach(b => b.onclick = () => copiar(achar(b.dataset.cod).codigo_barras.replace(/\D/g, ""), "Código de barras copiado."));
    $$("[data-pix]", main).forEach(b => b.onclick = () => copiar(achar(b.dataset.pix).pix, "Pix copia e cola copiado."));
    $$("[data-arq]", main).forEach(b => b.onclick = () => abrirArquivo(b.dataset.arq));
  }

  function linha(c) {
    const rec = c.tipo === "receber";
    const quando = c.status === "pago" && ui.ver === "pago" ? c.pago_em : c.vencimento;
    const reemb = c.por_conta && c.por_conta !== "p3" && c.reembolso && c.reembolso !== "nao" ? `reembolso ${REEMB[c.reembolso].toLowerCase()}` : "";
    return `<tr><td>${fmt.data(quando)}</td>
      <td><b>${esc(c.descricao)}</b>${c.parcela ? ` <span class="muted">${esc(c.parcela)}</span>` : ""}<small>${esc([rec ? "a receber" : "", c.contraparte, c.categoria, c.documento ? `doc. ${c.documento}` : ""].filter(Boolean).join(" · "))}</small></td>
      <td>${esc(NOME_CONTA[c.por_conta] || "P3")}<small>${esc(reemb)}</small></td>
      <td class="n ${rec ? "pos" : ""}"><b>${fmt.brl(c.valor)}</b></td><td>${situacao(c)}</td>
      <td class="right" style="white-space:nowrap">${c.status === "aberto" ? `<button class="btn sm primary" data-pagar="${esc(c.id)}">${rec ? "Recebi" : "Paguei"}</button>` : ""}
        ${c.status === "aberto" && c.pix ? `<button class="btn ghost sm" data-pix="${esc(c.id)}" title="Copiar o Pix copia e cola">Pix</button>` : ""}
        ${c.status === "aberto" && c.codigo_barras ? `<button class="btn ghost sm" data-cod="${esc(c.id)}" title="Copiar o código de barras">Código</button>` : ""}
        ${c.anexo ? `<button class="btn ghost sm" data-arq="${esc(c.anexo)}" title="Abrir o boleto ou documento">PDF</button>` : ""}
        ${c.comprovante ? `<button class="btn ghost sm" data-arq="${esc(c.comprovante)}" title="Abrir o comprovante">Compr.</button>` : ""}
        <button class="btn ghost sm" data-ed="${esc(c.id)}">Editar</button></td></tr>`;
  }

  async function abrirArquivo(caminho) {
    const w = window.open("", "_blank");
    try { const r = await api(`anexo?caminho=${encodeURIComponent(caminho)}`); if (w) w.location = r.url; else location.href = r.url; }
    catch (e) { if (w) w.close(); toast(e.message, "bad"); }
  }
  const guardar = (file, pasta) => api("anexo", { method: "POST", raw: true, body: file, headers: { "X-Nome": encodeURIComponent(file.name || "arquivo.pdf"), "X-Conta": pasta } }).then(r => r.caminho);

  async function pagar(c) {
    const rec = c.tipo === "receber";
    const html = `<p><b>${esc(c.descricao)}</b>${c.parcela ? ` · ${esc(c.parcela)}` : ""} · ${fmt.brl(c.valor)}</p><div class="grid-form">
      <label class="f">${rec ? "Recebido em" : "Pago em"}<input name="pago_em" type="date" value="${esc(hoje())}"></label>
      <label class="f">Forma<select name="forma">${opts(FORMAS.map(x => [x, x]), c.forma || (c.pix ? "Pix" : c.codigo_barras ? "Boleto" : ""), "—")}</select></label>
      <label class="f">Valor ${rec ? "recebido" : "pago"}<input name="valor" inputmode="decimal" value="${esc(fmt.num(c.valor, 2))}"><small>mude se houve juros ou desconto</small></label>
      <label class="f">Comprovante (opcional)<input type="file" id="fpComp" accept="application/pdf,image/*"></label></div>`;
    const ok = await modal(rec ? "Registrar recebimento" : "Registrar pagamento", html, {
      saveLabel: rec ? "Recebido" : "Pago",
      onSave: async bg => {
        const d = formData(bg);
        const arq = $("#fpComp", bg).files[0];
        const comprovante = arq ? await guardar(arq, c.grupo || c.id) : c.comprovante;
        await P3.save("p3_contas", { status: "pago", pago_em: d.pago_em || hoje(), forma: d.forma || null, valor: r2(n(d.valor)), comprovante: comprovante || null }, c.id);
      }
    });
    if (ok) { toast(rec ? "Recebimento registrado." : "Pagamento registrado.", "ok"); render($("#main")); }
  }

  async function editar(c, tipoNovo) {
    const v = c || { tipo: tipoNovo || "pagar", por_conta: "p3", status: "aberto", reembolso: "nao", vencimento: hoje() };
    const rec = v.tipo === "receber";
    const irmas = c && c.grupo ? contas.filter(x => x.grupo === c.grupo && x.id !== c.id) : [];
    const cats = (rec ? CAT_RECEBER : CAT_PAGAR).map(x => [x, x]);
    if (v.categoria && !cats.some(x => x[0] === v.categoria)) cats.push([v.categoria, v.categoria]);
    const html = `<div class="grid-form">
      <label class="f wide">Descrição<input name="descricao" value="${esc(v.descricao || "")}" placeholder="${rec ? "Ex.: Gestão das usinas — outubro" : "Ex.: Seguro dos carregadores"}"></label>
      <label class="f">Valor${c ? "" : " (de cada parcela)"}<input name="valor" inputmode="decimal" value="${v.valor != null ? esc(fmt.num(v.valor, 2)) : ""}"></label>
      <label class="f">${c ? "Vencimento" : "1º vencimento"}<input name="vencimento" type="date" value="${esc(v.vencimento || "")}"></label>
      ${c ? "" : `<label class="f">Parcelas / meses<input name="vezes" inputmode="numeric" value="1"><small>repete todo mês no mesmo dia</small></label>`}
      <label class="f">Categoria<select name="categoria">${opts(cats, v.categoria, "—")}</select></label>
      <label class="f">${rec ? "Quem paga" : "Fornecedor"}<input name="contraparte" value="${esc(v.contraparte || "")}"></label>
      <label class="f">De quem é<select name="por_conta" id="fpPc">${opts(POR_CONTA, v.por_conta || "p3")}</select><small>P3 = despesa da própria empresa</small></label>
      <label class="f" id="fpReembBox">Reembolso<select name="reembolso">${opts(Object.entries(REEMB), v.reembolso || "nao")}</select><small>se a operação vai devolver à P3</small></label>
      <label class="f">Documento<input name="documento" value="${esc(v.documento || "")}" placeholder="apólice, NF, contrato"></label>
      ${c ? `<label class="f">Situação<select name="status">${opts([["aberto", "Em aberto"], ["pago", rec ? "Recebido" : "Pago"], ["cancelado", "Cancelado"]], v.status)}</select></label>
      <label class="f">${rec ? "Recebido em" : "Pago em"}<input name="pago_em" type="date" value="${esc(v.pago_em || "")}"></label>` : ""}
      <label class="f wide">Código de barras<input name="codigo_barras" value="${esc(v.codigo_barras || "")}"></label>
      <label class="f wide">Pix copia e cola<input name="pix" value="${esc(v.pix || "")}"></label>
      <label class="f wide">Arquivo (boleto, contrato)${v.anexo ? " — já tem um; escolha outro para trocar" : ""}<input type="file" id="fpArq" accept="application/pdf,image/*"></label>
      <label class="f wide">Observação<textarea name="obs">${esc(v.obs || "")}</textarea></label></div>
      ${irmas.length ? `<label class="inline" style="font-size:13px;margin-top:6px"><input type="checkbox" id="fpTodas" checked> Aplicar descrição, categoria, fornecedor, de quem é e reembolso às outras ${irmas.length} parcela(s)</label>` : ""}
      ${c ? `<hr class="sep"><button class="btn danger sm" id="fpExc">Excluir esta conta</button>` : ""}`;
    const p = modal(c ? "Editar conta" : rec ? "Nova conta a receber" : "Nova conta a pagar", html, {
      wide: true,
      onSave: async bg => {
        const d = formData(bg);
        if (!String(d.descricao || "").trim()) throw new Error("Escreva a descrição.");
        const valor = r2(n(d.valor));
        if (!(valor > 0)) throw new Error("Informe o valor.");
        const base = { tipo: v.tipo, descricao: d.descricao.trim(), categoria: d.categoria || null, contraparte: d.contraparte || null, por_conta: d.por_conta || "p3",
          reembolso: d.por_conta === "p3" ? "nao" : d.reembolso || "nao", documento: d.documento || null, codigo_barras: d.codigo_barras || null, pix: d.pix || null, obs: d.obs || null };
        const arq = $("#fpArq", bg).files[0];
        if (c) {
          const anexo = arq ? await guardar(arq, c.grupo || c.id) : c.anexo;
          await P3.save("p3_contas", { ...base, valor, vencimento: d.vencimento || null, status: d.status, pago_em: d.status === "pago" ? (d.pago_em || hoje()) : null, anexo }, c.id);
          if (irmas.length && $("#fpTodas", bg).checked) for (const x of irmas) await P3.save("p3_contas", { descricao: base.descricao, categoria: base.categoria, contraparte: base.contraparte, por_conta: base.por_conta, reembolso: base.reembolso }, x.id);
          return;
        }
        const vezes = Math.min(120, Math.max(1, Math.round(n(d.vezes)) || 1));
        const grupo = vezes > 1 || arq ? novoGrupo() : null;
        const anexo = arq ? await guardar(arq, grupo) : null;
        for (let i = 0; i < vezes; i++) {
          await P3.save("p3_contas", { ...base, valor, vencimento: d.vencimento ? mesmoDia(d.vencimento, i) : null, status: "aberto", grupo, parcela: vezes > 1 ? `${i + 1}/${vezes}` : null, anexo });
        }
      }
    });
    const reemb = () => { $("#fpReembBox").style.display = $("#fpPc").value === "p3" ? "none" : ""; };
    $("#fpPc").onchange = reemb; reemb();
    if (c) $("#fpExc").onclick = async () => {
      $(".modal-bg [data-x]").click();
      if (!await confirmar("Excluir conta", `${esc(c.descricao)}${c.parcela ? ` (${esc(c.parcela)})` : ""} sai do financeiro. Para só tirar da lista de abertas, prefira "Cancelado".`, "Excluir")) return;
      try { await P3.del("p3_contas", c.id); toast("Excluída.", "ok"); render($("#main")); } catch (e) { toast(e.message, "bad"); }
    };
    if (await p) { toast("Salvo.", "ok"); render($("#main")); }
  }
  // Mesmo dia nos meses seguintes (dia 31 vira o último dia do mês quando ele não existe).
  function mesmoDia(iso, mais) {
    const [a, m, d] = iso.split("-").map(Number);
    const alvo = new Date(Date.UTC(a, m - 1 + mais, 1));
    const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
    return `${alvo.getUTCFullYear()}-${String(alvo.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
  }

  // ───────── importar boletos em PDF ─────────
  async function textoDoPdf(file) {
    const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), verbosity: 0, isEvalSupported: false }).promise;
    const paginas = [];
    for (let i = 1; i <= doc.numPages; i++) paginas.push((await (await doc.getPage(i)).getTextContent()).items.map(x => x.str).filter(s => s && s.trim()).join("\n"));
    await doc.destroy();
    return paginas.join("\n");
  }

  async function importar(files) {
    for (const file of files) {
      let lido, texto;
      try { texto = await textoDoPdf(file); lido = window.P3_BOLETO.lerBoletos(texto, hoje()); }
      catch (e) { toast(`${file.name}: não consegui ler o PDF.`, "bad"); continue; }
      if (!lido.boletos.length) { toast(`${file.name}: não achei boleto (código de barras) neste PDF.`, "bad"); continue; }
      await conferirImportacao(file, lido, texto);
    }
  }

  async function conferirImportacao(file, lido, texto) {
    const jaTem = new Set(contas.map(c => String(c.codigo_barras || "").replace(/\D/g, "")).filter(Boolean));
    const seguro = /seguro|ap[óo]lice|endosso/i.test(texto);
    const html = `<p class="muted" style="margin-top:0">${esc(file.name)} · ${lido.boletos.length} boleto(s) encontrado(s). Valor, vencimento, código de barras e Pix vieram do próprio boleto; confira o resto.</p>
      <div class="grid-form">
      <label class="f wide">Descrição<input name="descricao" value="${esc(seguro ? `Seguro ${lido.beneficiario.replace(/\s*S\.?\s?A\.?$/, "")}`.trim() : lido.beneficiario || "")}"></label>
      <label class="f">Fornecedor<input name="contraparte" value="${esc(lido.beneficiario)}"></label>
      <label class="f">Categoria<select name="categoria">${opts(CAT_PAGAR.map(x => [x, x]), seguro ? "Seguros" : "", "—")}</select></label>
      <label class="f">De quem é<select name="por_conta" id="fiPc">${opts(POR_CONTA, "p3")}</select>${lido.pagador ? `<small>no boleto, o pagador é ${esc(lido.pagador)}</small>` : ""}</label>
      <label class="f" id="fiReemb">Reembolso<select name="reembolso">${opts(Object.entries(REEMB).filter(([k]) => k === "nao" || k === "a_cobrar"), "nao")}</select><small>se a operação vai devolver à P3</small></label>
      <label class="f">Documento<input name="documento" value="${esc(lido.documento)}" placeholder="apólice, NF, contrato"></label></div>
      <div class="table-wrap" style="box-shadow:none;margin-top:10px"><table><thead><tr><th></th><th>Parcela</th><th>Vencimento</th><th class="n">Valor</th><th>Pix</th></tr></thead><tbody>
      ${lido.boletos.map((b, i) => { const dup = jaTem.has(b.codigo.replace(/\D/g, "")); return `<tr><td><input type="checkbox" data-b="${i}" ${dup ? "" : "checked"}></td><td>${esc(b.parcela || "única")}${dup ? `<small class="neg">já lançado</small>` : ""}</td><td>${fmt.data(b.vencimento)}</td><td class="n">${fmt.brl(b.valor)}</td><td>${b.pix ? "sim" : "—"}</td></tr>`; }).join("")}
      </tbody><tfoot><tr><td></td><td>Total</td><td></td><td class="n">${fmt.brl(somar(lido.boletos))}</td><td></td></tr></tfoot></table></div>`;
    const p = modal("Importar boletos", html, {
      wide: true, saveLabel: "Lançar",
      onSave: async bg => {
        const d = formData(bg);
        const marcados = $$("[data-b]", bg).filter(x => x.checked).map(x => lido.boletos[Number(x.dataset.b)]);
        if (!marcados.length) throw new Error("Marque ao menos um boleto.");
        if (!String(d.descricao || "").trim()) throw new Error("Escreva a descrição.");
        const grupo = novoGrupo();
        const anexo = await guardar(file, grupo);
        for (const b of marcados) await P3.save("p3_contas", {
          tipo: "pagar", descricao: d.descricao.trim(), categoria: d.categoria || null, contraparte: d.contraparte || null, por_conta: d.por_conta || "p3",
          reembolso: d.por_conta === "p3" ? "nao" : d.reembolso || "nao", documento: d.documento || null, valor: b.valor, vencimento: b.vencimento,
          status: "aberto", grupo, parcela: b.parcela || null, codigo_barras: b.codigo, pix: b.pix || null, anexo,
          obs: lido.pagador ? `Pagador no boleto: ${lido.pagador}` : null
        });
        return marcados.length;
      }
    });
    const reemb = () => { $("#fiReemb").style.display = $("#fiPc").value === "p3" ? "none" : ""; };
    $("#fiPc").onchange = reemb; reemb();
    const feitos = await p;
    if (feitos) { toast(`${feitos} conta(s) lançada(s).`, "ok"); await render($("#main")); }
  }

  P3.register("financeiro-p3", { render });
})();
