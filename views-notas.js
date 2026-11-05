// NFs e cobranças ao cliente final. Cada regra diz o que se emite todo mês e em que dia:
//  • NF (P3 ou dono emite): ex.: Prisma — a P3 emite 100%, desconta gestão e custo da NF e repassa ao dono;
//    Valência — uma NF da P3 e outra do dono (aqui só se guarda a cópia).
//  • Boleto sem NF: ex.: Norton — cobra arrendamento + faturas das UCs geradoras do mês de referência; a P3 paga
//    as geradoras, fica com a gestão e repassa o resto ao dono. Valor a cobrar e repasse saem do fechamento do mês.
// A tela lembra o que falta emitir, guarda o arquivo de cada uma e deixa o texto pronto para o contador.
(function () {
  "use strict";
  const { esc, $, $$, fmt, api, toast, opts, modal, confirmar, formData, kpi, badge, db, nomeUsina, nomeCliente, nomeDono, M } = window.P3;
  const n = v => { if (v == null || v === "") return 0; if (typeof v === "number") return v; let s = String(v).trim().replace(/[R$\s]/g, ""); if (/,/.test(s)) s = s.replace(/\./g, "").replace(",", "."); else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); const x = Number(s); return Number.isFinite(x) ? x : 0; };
  const r2 = v => Math.round(v * 100) / 100;
  const EMITENTE = { p3: "P3", dono: "Dono da usina" };
  const TIPO = { nf: "NF", boleto: "Boleto (sem NF)" };
  const SERVICO_PADRAO = "Arrendamento de usina solar fotovoltaica (geração distribuída)";
  const AVISAR_ANTES = 5; // dias antes do dia de emitir em que o painel começa a lembrar

  const dados = { regras: [], notas: [], carregado: false, carregando: null };
  const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const vencimento = (comp, dia) => { const [a, m] = comp.split("-").map(Number); const ult = new Date(a, m, 0).getDate(); return `${comp}-${String(Math.min(dia, ult)).padStart(2, "0")}`; };
  const diasAte = iso => Math.round((new Date(iso + "T12:00:00") - new Date(hojeIso() + "T12:00:00")) / 864e5);
  const fmtIn = v => v == null || v === "" ? "" : String(v).replace(".", ",");
  const ehBoleto = x => x && x.tipo === "boleto";
  // Usinas de uma regra/NF: a lista (várias usinas num documento só, ex.: Own the Sun 2 e 4) ou a usina antiga.
  const usinasDe = x => (Array.isArray(x.usina_ids) && x.usina_ids.length ? x.usina_ids : x.usina_id ? [x.usina_id] : []);
  const nomesUsinas = x => usinasDe(x).map(nomeUsina).join(" + ");
  // Para quem é: o cliente e as usinas.
  const alvo = x => [x.cliente_id ? nomeCliente(x.cliente_id) : "", nomesUsinas(x)].filter(Boolean).join(" · ") || "—";
  const incluiUc = x => x.incluir_uc == null ? ehBoleto(x) : !!Number(x.incluir_uc);

  async function carregar() {
    if (!dados.carregando) dados.carregando = Promise.all([api("nf_regras"), api("notas_fiscais")]).then(([r, nf]) => {
      dados.regras = r; dados.notas = nf; dados.carregado = true; dados.carregando = null; marcarMenu();
    }).catch(e => { dados.carregando = null; throw e; });
    return dados.carregando;
  }

  // O que falta: para cada regra ativa, os meses desde que ela existe (no máximo os 3 últimos) sem lançamento.
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
  const acao = r => ehBoleto(r) ? "Emitir boleto" : r.emitente === "dono" ? "Pegar a NF do dono" : "Emitir NF";

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
    return `<div class="note ${ruim ? "bad" : "warn"}" style="margin-bottom:14px"><b>NFs e cobranças:</b> ${u.map(p => `${esc(acao(p.regra))} · ${esc(alvo(p.regra))} (${esc(fmt.mes(p.comp))}) — ${p.dias == null ? "defina o dia" : p.dias < 0 ? `atrasada ${-p.dias} dia(s)` : p.dias === 0 ? "hoje" : `dia ${fmt.data(p.venc)}`}`).join("; ")}${u.length && rep.length ? ". " : ""}${rep.length ? `${rep.length} repasse(s) ao dono a fazer` : ""}. <a href="#/notas">Abrir →</a></div>`;
  }

  // ───────── cálculos ─────────
  function gestaoDa(usinaId, valor) {
    const u = db().by.usinas.get(usinaId) || {};
    if (u.gestao_modo === "valor" && u.gestao_valor != null) return n(u.gestao_valor);
    if (u.gestao_pct) return r2(valor * n(u.gestao_pct) / 100);
    return 0;
  }
  // NF que a P3 emite por inteiro: valor − gestão − custo da NF (% sobre o valor). Ex.: 5.000 − 500 − 6% (300) = 4.200.
  const repasseNf = (valor, gestao, pct) => { const custo = r2(n(valor) * n(pct) / 100); return { custo, liquido: Math.max(0, r2(n(valor) - n(gestao) - custo)) }; };

  // Valor projetado pelo fechamento do mês de referência, para as usinas escolhidas (vazio = todas as do cliente):
  //  • arrendamento: a parte do cliente (ou o arrendamento inteiro da usina, se não há cliente);
  //  • custos da UC: a parte nas faturas das UCs geradoras — entram no boleto por padrão e na NF só se marcar.
  // Repasse ao dono = cobrado − custos da UC cobrados (a P3 paga a Copel) − gestão − custos do dono, na proporção
  // do arrendamento que coube ao cliente em cada usina.
  function calcCobranca(x, ref) {
    const m = P3.calcMes(ref), escolhidas = usinasDe(x), comUc = incluiUc(x);
    const porUsina = new Map();
    if (x.cliente_id) {
      for (const row of m.ucs.filter(r => r.cliente_id === x.cliente_id)) {
        for (const p of row.partes) {
          if (escolhidas.length && !escolhidas.includes(p.usina_id)) continue;
          const g = porUsina.get(p.usina_id) || { arr: 0, ger: 0 };
          g.arr = r2(g.arr + p.arrendamento); g.ger = r2(g.ger + p.geradora); porUsina.set(p.usina_id, g);
        }
      }
    } else for (const uid of escolhidas) { const u = m.usinas.find(y => y.usina_id === uid); if (u) porUsina.set(uid, { arr: u.arrendamento, ger: u.geradoraPagaPor === "cliente" ? u.valorGeradora : 0 }); }
    let arr = 0, ger = 0, gest = 0, custos = 0, parcial = false;
    const usinas = [], avisos = [];
    for (const [uid, g] of porUsina) {
      const u = m.usinas.find(y => y.usina_id === uid); if (!u) continue;
      const parte = u.arrendamento ? g.arr / u.arrendamento : 0;
      arr = r2(arr + g.arr); ger = r2(ger + g.ger);
      gest = r2(gest + u.gestao * parte);
      custos = r2(custos + (u.custosDono + u.geradoraDono) * parte);
      if (u.faltam || u.avisos.length) { parcial = true; avisos.push(...u.avisos.map(a => `${u.usina.nome}: ${a}`)); }
      usinas.push({ id: uid, nome: u.usina.nome, dono_id: u.dono_id, arr: g.arr, ger: g.ger });
    }
    const uc = comUc ? ger : 0, cobrar = r2(arr + uc);
    return { ref, arr, ger, uc, comUc, gest, custos, cobrar, repasse: Math.max(0, r2(cobrar - uc - gest - custos)), usinas, parcial, avisos };
  }

  // O que a regra gera no mês: valor projetado pelo fechamento do mês anterior (ou o valor fixo da regra, se houver) e o repasse.
  function novaDaRegra(r, comp) {
    const ids = usinasDe(r), ref = M.addMonths(comp, -1), comUc = incluiUc(r);
    const base = { regra_id: r.id, tipo: r.tipo || "nf", usina_ids: ids, usina_id: ids[0] || null, cliente_id: r.cliente_id || null, incluir_uc: comUc ? 1 : 0, competencia: comp, referencia: ref,
      emitente: ehBoleto(r) ? "p3" : r.emitente, tomador: r.tomador || (r.cliente_id ? nomeCliente(r.cliente_id) : ""), status: "emitida", data_emissao: hojeIso(), repasse_status: r.repasse ? "pendente" : "" };
    const c = calcCobranca(base, ref);
    if (ehBoleto(r)) return { ...base, valor: c.cobrar || null, geradora_valor: c.uc, gestao_valor: c.gest, custos_valor: c.custos, repasse_valor: r.repasse ? c.repasse : null };
    const valor = r.valor_padrao || c.cobrar || null;
    const gestao = r.repasse && valor ? (c.gest || ids.reduce((s, u) => s + gestaoDa(u, valor / ids.length), 0)) : null;
    const uc = comUc ? c.uc : 0;
    return { ...base, valor, custo_pct: r.custo_pct ?? null, gestao_valor: gestao, geradora_valor: comUc ? uc : null, repasse_valor: r.repasse && valor ? Math.max(0, r2(repasseNf(valor, gestao, r.custo_pct).liquido - uc)) : null };
  }

  // ───────── textos prontos ─────────
  function textoPronto(x) {
    const r = dados.regras.find(y => y.id === x.regra_id) || {};
    const cli = db().by.clientes.get(x.cliente_id) || {};
    const tomador = cli.nome || x.tomador || "(cliente)";
    const mes = fmt.mesLongo(ehBoleto(x) ? (x.referencia || x.competencia) : x.competencia);
    if (ehBoleto(x)) {
      const linhas = [`Boleto ${tomador}${cli.documento ? ` (${cli.documento})` : ""}${usinasDe(x).length ? ` · ${nomesUsinas(x)}` : ""}`, `Valor: ${fmt.brl(x.valor)}`,
        n(x.geradora_valor) ? `Referente a ${mes}: arrendamento ${fmt.brl(n(x.valor) - n(x.geradora_valor))} + custos das UCs geradoras ${fmt.brl(x.geradora_valor)}` : `Referente a ${mes}: arrendamento`];
      if (x.data_emissao) linhas.push(`Vencimento: ${fmt.data(x.data_emissao)}`);
      if (x.repasse_valor != null) {
        linhas.push("", `Repasse ao dono: ${fmt.brl(x.repasse_valor)} (cobrado${n(x.geradora_valor) ? ` − custos da UC ${fmt.brl(x.geradora_valor)}` : ""} − gestão ${fmt.brl(x.gestao_valor)}${n(x.custos_valor) ? ` − custos ${fmt.brl(x.custos_valor)}` : ""})`);
        donosDe(x).forEach(d => linhas.push(`${d.nome}${d.pix ? ` · Pix: ${d.pix}` : ""}`));
      }
      return linhas.join("\n");
    }
    return [`Olá! Por favor, emitir a NF de serviço deste mês:`, ``,
      `• Tomador: ${tomador}${cli.documento ? ` — CNPJ/CPF ${cli.documento}` : ""}`,
      `• Valor: ${fmt.brl(x.valor)}${n(x.geradora_valor) ? ` (arrendamento ${fmt.brl(n(x.valor) - n(x.geradora_valor))} + custos da UC ${fmt.brl(x.geradora_valor)})` : ""}`,
      `• Serviço: ${r.servico || SERVICO_PADRAO}`,
      `• Referência: ${mes}${usinasDe(x).length ? ` · ${nomesUsinas(x)}` : ""}`,
      cli.email ? `• Enviar para: ${cli.email}` : null, ``, `Obrigado!`].filter(l => l !== null).join("\n");
  }
  function mostrarTexto(x) {
    const txt = textoPronto(x);
    const titulo = ehBoleto(x) ? "Resumo do boleto e do repasse" : "Texto para o contador";
    modal(titulo, `<textarea id="nfTexto" rows="11" style="width:100%;font:inherit;font-size:14px">${esc(txt)}</textarea>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn primary" id="nfCopiar">Copiar</button><a class="btn" id="nfZap" target="_blank" rel="noopener">Enviar no WhatsApp</a></div>`);
    const bgs = document.querySelectorAll(".modal-bg"), bg = bgs[bgs.length - 1];
    const ta = $("#nfTexto", bg), zap = $("#nfZap", bg);
    const atual = () => { zap.href = `https://wa.me/?text=${encodeURIComponent(ta.value)}`; };
    ta.oninput = atual; atual();
    $("#nfCopiar", bg).onclick = async () => {
      try { await navigator.clipboard.writeText(ta.value); toast("Texto copiado.", "ok"); }
      catch (_) { ta.select(); document.execCommand("copy"); toast("Texto copiado.", "ok"); }
    };
  }

  // ───────── tela ─────────
  const filtro = { alvo: "", ano: "" };
  async function render(main) {
    main.innerHTML = `<div class="loading">Carregando as NFs e cobranças…</div>`;
    try { await carregar(); } catch (e) { main.innerHTML = `<div class="note bad">${esc(e.message)}</div>`; return; }
    if (window.P3.state.route !== "notas") return;
    desenhar(main);
  }

  function desenhar(main) {
    const pend = pendencias().map(p => ({ ...p, prev: novaDaRegra(p.regra, p.comp) })), rep = repassesAbertos();
    const anos = [...new Set(dados.notas.map(x => x.competencia.slice(0, 4)))].sort().reverse();
    const lista = dados.notas.filter(x => (!filtro.alvo || usinasDe(x).includes(filtro.alvo) || x.cliente_id === filtro.alvo) && (!filtro.ano || x.competencia.startsWith(filtro.ano)))
      .sort((a, b) => (b.competencia + (b.data_emissao || "")).localeCompare(a.competencia + (a.data_emissao || "")));
    const ano = hojeIso().slice(0, 4), doAno = dados.notas.filter(x => x.competencia.startsWith(ano) && x.status !== "cancelada" && x.emitente === "p3");
    const atrasadas = pend.filter(p => p.dias != null && p.dias < 0).length;
    // Usinas cobertas: as das regras de NF e as que atendem os clientes com boleto.
    const cobertas = new Set(dados.regras.flatMap(usinasDe));
    const clientesBoleto = new Set(dados.regras.filter(r => ehBoleto(r) && !usinasDe(r).length).map(r => r.cliente_id));
    db().vinculos.forEach(v => { const uc = db().by.ucs.get(v.uc_id); if (uc && clientesBoleto.has(uc.cliente_id)) cobertas.add(v.usina_id); });
    const semRegra = db().usinas.filter(u => !cobertas.has(u.id));
    main.innerHTML = `
      <div class="head"><div><p class="kicker">Usinas</p><h1>NFs e cobranças</h1><p>O que emitir todo mês ao cliente final (NF ou boleto), o lembrete do dia, o arquivo de cada uma e o repasse ao dono.</p></div>
        <div class="actions"><button class="btn primary" id="nfNova">+ Lançar NF / boleto</button></div></div>
      <div class="kpis">
        ${kpi("A emitir", String(pend.length), atrasadas ? `${atrasadas} atrasada(s)` : "neste e nos últimos meses", atrasadas ? "" : "lead")}
        ${kpi(`Emitido pela P3 em ${ano}`, fmt.brl(doAno.reduce((s, x) => s + n(x.valor), 0)), `${doAno.filter(x => !ehBoleto(x)).length} NF(s) · ${doAno.filter(ehBoleto).length} boleto(s)`)}
        ${kpi("Repasses ao dono", fmt.brl(rep.reduce((s, x) => s + n(x.repasse_valor), 0)), `${rep.length} a fazer`)}
      </div>
      <div class="section"><div class="section-head"><div><h2>Para emitir</h2><p>Lance cada uma (com o arquivo) para tirar daqui. O boleto já vem com o valor a cobrar e o repasse calculados do mês anterior.</p></div></div>
        ${pend.length ? `<div class="table-wrap"><table><thead><tr><th>Para</th><th>O quê</th><th>Mês</th><th>Quando</th><th class="n">Valor</th><th class="n">Repasse</th><th></th></tr></thead><tbody>
          ${pend.map((p, i) => `<tr><td><b>${esc(alvo(p.regra))}</b></td><td>${esc(p.regra.descricao || acao(p.regra))}<small>${ehBoleto(p.regra) ? "boleto" : `${esc(EMITENTE[p.regra.emitente] || "")} emite`} · ref. ${esc(fmt.mes(p.prev.referencia))} · ${incluiUc(p.regra) ? "arrendamento + custos da UC" : "só arrendamento"}${p.regra.repasse ? " · repassa ao dono" : ""}</small></td><td>${esc(fmt.mes(p.comp))}</td><td>${quando(p)}</td>
            <td class="n">${p.prev.valor ? fmt.brl(p.prev.valor) : "—"}</td><td class="n">${p.prev.repasse_valor != null ? fmt.brl(p.prev.repasse_valor) : "—"}</td>
            <td class="right" style="white-space:nowrap">${p.regra.emitente !== "dono" ? `<button class="btn sm ghost" data-texto="${i}">${ehBoleto(p.regra) ? "Resumo" : "Texto p/ contador"}</button> ` : ""}<button class="btn sm primary" data-pend="${i}">${ehBoleto(p.regra) ? "Lançar boleto" : p.regra.emitente === "dono" ? "Guardar NF do dono" : "Lançar NF"}</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="note ok">Nada pendente.</div>`}</div>
      ${rep.length ? `<div class="section"><div class="section-head"><div><h2>Repasses ao dono</h2><p>Recebido pela P3 e ainda não repassado.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Para</th><th>Dono</th><th>Mês</th><th>Documento</th><th class="n">Recebido</th><th class="n">Repassar</th><th></th></tr></thead><tbody>
        ${rep.map(x => { const donos = donosDe(x); return `<tr><td><b>${esc(alvo(x))}</b></td><td>${donos.map(d => `${esc(d.nome)}${d.pix ? `<small>Pix: ${esc(d.pix)}</small>` : ""}`).join("") || "—"}</td><td>${esc(fmt.mes(x.competencia))}</td><td>${ehBoleto(x) ? "Boleto" : "NF"} ${esc(x.numero || "")}</td><td class="n">${fmt.brl(x.valor)}</td>
          <td class="n"><b>${fmt.brl(x.repasse_valor)}</b><small>${[x.geradora_valor ? `− ${fmt.brl(x.geradora_valor)} geradoras` : "", x.gestao_valor != null ? `− ${fmt.brl(x.gestao_valor)} gestão` : "", x.custo_pct ? `− ${fmt.brl(n(x.valor) * n(x.custo_pct) / 100)} NF` : "", n(x.custos_valor) ? `− ${fmt.brl(x.custos_valor)} custos` : ""].filter(Boolean).join(" ")}</small></td>
          <td class="right"><button class="btn sm" data-repassei="${esc(x.id)}">Marcar repassado</button></td></tr>`; }).join("")}</tbody></table></div></div>` : ""}
      <div class="section"><div class="section-head"><div><h2>Regras</h2><p>O que se emite todo mês, para quem e em que dia. Clique para editar.</p></div><button class="btn" id="nfRegraNova">+ Regra</button></div>
        <div class="table-wrap"><table><thead><tr><th>Para</th><th>O quê</th><th>Quem emite</th><th class="n">Dia</th><th class="n">Valor</th><th>Repasse</th></tr></thead><tbody>
        ${dados.regras.map(r => `<tr class="clickable" data-regra="${esc(r.id)}"><td><b>${esc(alvo(r))}</b></td><td>${esc(TIPO[r.tipo || "nf"])}<small>${esc(r.descricao || "")}</small>${r.ativo === 0 ? ` ${badge("Pausada", "")}` : ""}</td><td>${esc(EMITENTE[r.emitente] || r.emitente)}</td><td class="n">${r.dia ? `dia ${r.dia}` : `<span class="neg">definir</span>`}</td>
          <td class="n">${r.valor_padrao ? `${fmt.brl(r.valor_padrao)} fixo` : "projetado"}<small>${incluiUc(r) ? "arrendamento + custos da UC" : "só arrendamento"}</small></td><td>${r.repasse ? `Sim · desconta ${[incluiUc(r) ? "custos da UC" : "", "gestão", r.custo_pct ? `${fmt.pctN(r.custo_pct)} da NF` : ""].filter(Boolean).join(", ")}` : "—"}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">Nenhuma regra. Crie uma para cada NF ou boleto que se repete todo mês.</td></tr>`}</tbody></table></div></div>
      <div class="section"><div class="section-head"><div><h2>Lançadas</h2></div>
        <div class="actions"><select id="nfFAlvo"><option value="">Todas</option><optgroup label="Usinas">${opts(db().usinas.map(u => [u.id, u.nome]), filtro.alvo)}</optgroup><optgroup label="Clientes">${opts(db().clientes.map(c => [c.id, c.nome]), filtro.alvo)}</optgroup></select><select id="nfFAno">${opts(anos.map(a => [a, a]), filtro.ano, "Todos os anos")}</select></div></div>
        <div class="table-wrap"><table><thead><tr><th>Mês</th><th>Para</th><th>Tipo</th><th>Nº</th><th>Data</th><th class="n">Valor</th><th>Repasse</th><th></th></tr></thead><tbody>
        ${lista.map(x => `<tr class="clickable" data-nf="${esc(x.id)}"><td>${esc(fmt.mes(x.competencia))}</td><td><b>${esc(alvo(x))}</b></td><td>${ehBoleto(x) ? "Boleto" : `NF · ${esc(EMITENTE[x.emitente] || x.emitente)}`}${x.status === "cancelada" ? ` ${badge("Cancelada", "bad")}` : ""}</td><td>${esc(x.numero || "—")}</td><td>${fmt.data(x.data_emissao)}</td><td class="n">${fmt.brl(x.valor)}</td>
          <td>${x.repasse_status === "pendente" ? badge(`A repassar ${fmt.brl(x.repasse_valor)}`, "warn") : x.repasse_status === "pago" ? badge(`Repassado${x.repasse_em ? " " + fmt.data(x.repasse_em) : ""}`, "ok") : "—"}</td>
          <td class="right">${x.arquivo ? `<button class="btn ghost sm" data-arq="${esc(x.arquivo)}" title="Abrir o arquivo">📎</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="8" class="empty">Nada lançado${filtro.alvo || filtro.ano ? " com esse filtro" : ""}.</td></tr>`}</tbody></table></div></div>
      ${semRegra.length ? `<p class="muted" style="font-size:12.5px">Usinas sem regra de NF ou boleto: ${esc(semRegra.map(u => u.nome).join(", "))}.</p>` : ""}`;

    $("#nfNova").onclick = () => editarNf(main, {});
    $("#nfRegraNova").onclick = () => editarRegra(main, { tipo: "nf", emitente: "p3", ativo: 1 });
    $$("[data-pend]", main).forEach(b => b.onclick = () => editarNf(main, pend[Number(b.dataset.pend)].prev));
    $$("[data-texto]", main).forEach(b => b.onclick = () => mostrarTexto(pend[Number(b.dataset.texto)].prev));
    $$("[data-regra]", main).forEach(tr => tr.onclick = () => editarRegra(main, dados.regras.find(r => r.id === tr.dataset.regra)));
    $$("[data-nf]", main).forEach(tr => tr.onclick = e => { if (e.target.closest("[data-arq]")) return; editarNf(main, dados.notas.find(x => x.id === tr.dataset.nf)); });
    $$("[data-arq]", main).forEach(b => b.onclick = e => { e.stopPropagation(); window.P3_COMPROVANTE.abrirAnexo(b.dataset.arq); });
    $$("[data-repassei]", main).forEach(b => b.onclick = async () => {
      try { await api(`notas_fiscais/${encodeURIComponent(b.dataset.repassei)}`, { method: "PUT", body: { repasse_status: "pago", repasse_em: hojeIso() } }); await recarregar(main); toast("Repasse marcado.", "ok"); }
      catch (e) { toast(e.message, "bad"); }
    });
    $("#nfFAlvo").onchange = e => { filtro.alvo = e.target.value; desenhar(main); };
    $("#nfFAno").onchange = e => { filtro.ano = e.target.value; desenhar(main); };
  }
  async function recarregar(main) { dados.carregado = false; await carregar(); desenhar(main); }
  function donosDe(x) {
    const ids = usinasDe(x).length ? usinasDe(x).map(u => (db().by.usinas.get(u) || {}).dono_id)
      : calcCobranca(x, x.referencia || M.addMonths(x.competencia, -1)).usinas.map(u => u.dono_id);
    return [...new Set(ids)].map(id => db().by.donos.get(id)).filter(Boolean);
  }

  // Lê o PDF/foto da NF para sugerir número, valor e data.
  function lerNf(texto) {
    const t = texto.replace(/\r/g, "");
    const numero = (t.match(/N[úu]mero\s+da\s+NFS-?e\s*[:\s]*(\d{1,12})/i) || t.match(/NFS-?e\s*(?:n[º°o.]*)?\s*[:\s]\s*(\d{1,12})/i) || t.match(/N[úu]mero(?:\s+da\s+nota)?\s*[:\n]\s*(\d{1,12})/i) || [])[1] || "";
    const v = (t.match(/Valor\s+(?:L[íi]quido(?:\s+da\s+NFS-?e)?|Total(?:\s+da\s+Nota)?|dos?\s+Servi[çc]os?|do\s+Documento|Cobrado)[^\d]{0,40}([\d.]+,\d{2})/i) || [])[1];
    const d = (t.match(/(?:Data\s*(?:e\s*Hora\s*)?(?:da\s*|de\s*)?(?:Emiss[ãa]o|Vencimento))[^\d]{0,40}(\d{2})\/(\d{2})\/(\d{4})/i) || t.match(/(\d{2})\/(\d{2})\/(\d{4})/) || []);
    const base = window.P3_COMPROVANTE ? window.P3_COMPROVANTE.interpretar(texto, "") : {};
    return { numero, valor: v ? n(v) : base.valor || null, data_emissao: d[3] ? `${d[3]}-${d[2]}-${d[1]}` : base.data || "" };
  }

  // Caixas de seleção das usinas (uma NF ou um boleto pode juntar várias, ex.: Own the Sun 2 e 4).
  const caixasUsinas = sel => `<div class="f wide"><span style="font-size:12px;font-weight:600;color:var(--ink-2)">Usinas</span><div style="display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:4px">${db().usinas.map(u => `<label style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" data-us="${esc(u.id)}" ${sel.includes(u.id) ? "checked" : ""}>${esc(u.nome)}</label>`).join("")}</div></div>`;
  const marcadas = bg => $$("[data-us]", bg).filter(i => i.checked).map(i => i.dataset.us);

  async function editarNf(main, orig) {
    const x = { tipo: "nf", status: "emitida", emitente: "p3", competencia: hojeIso().slice(0, 7), ...orig };
    if (x.incluir_uc == null) x.incluir_uc = ehBoleto(x) ? 1 : 0;
    if (!x.referencia) x.referencia = M.addMonths(x.competencia, -1);
    let arquivo = null;
    const campo = (nome, rot, extra = "", cls = "") => `<label class="f ${cls}">${rot}<input name="${nome}" value="${esc(x[nome] ?? "")}" ${extra}></label>`;
    const so = (t, html) => html.replace(/^<label class="f/, `<label data-t="${t}" class="f`);
    const html = `
      <div class="grid-form" id="nfForm">
        <label class="f">Tipo<select name="tipo">${opts(Object.entries(TIPO), x.tipo)}</select></label>
        <label class="f">Cliente<select name="cliente_id">${opts(db().clientes.map(c => [c.id, c.nome]), x.cliente_id, "—")}</select></label>
        <label class="f">Regra<select name="regra_id">${opts(dados.regras.map(r => [r.id, `${TIPO[r.tipo || "nf"]} · ${alvo(r)}`]), x.regra_id, "Avulsa (sem regra)")}</select></label>
        ${caixasUsinas(usinasDe(x))}
        ${campo("competencia", "Mês de emissão", 'type="month"')}
        ${campo("referencia", "Referente a (mês do fechamento)", 'type="month"')}
        <label class="f pr-check"><span style="display:flex;gap:8px;align-items:center;font-weight:500;font-size:13px"><input type="checkbox" name="incluir_uc" ${Number(x.incluir_uc) ? "checked" : ""}> Incluir custos da UC (faturas das geradoras)</span></label>
        ${so("nf", `<label class="f">Quem emitiu<select name="emitente">${opts(Object.entries(EMITENTE), x.emitente)}</select></label>`)}
        ${campo("numero", "Número", 'autocomplete="off"')}
        <label class="f"><span data-rot-data>Data de emissão</span><input name="data_emissao" type="date" value="${esc(x.data_emissao || "")}"></label>
        ${campo("valor", "Valor (R$)", 'inputmode="decimal"')}
        ${so("nf", campo("tomador", "Tomador (como sai na NF)"))}
        <label class="f">Repasse ao dono<select name="repasse_status">${opts([["", "Não há"], ["pendente", "A repassar"], ["pago", "Repassado"]], x.repasse_status || "")}</select></label>
        ${campo("geradora_valor", "Custos da UC pagos pela P3 (R$)", 'inputmode="decimal" data-rep data-uc')}
        ${campo("gestao_valor", "Gestão P3 (R$)", 'inputmode="decimal" data-rep')}
        ${so("nf", campo("custo_pct", "Custo da NF (%)", 'inputmode="decimal" placeholder="Ex.: 6" data-rep'))}
        ${so("boleto", campo("custos_valor", "Custos do dono (R$)", 'inputmode="decimal" data-rep'))}
        ${campo("repasse_valor", "Valor a repassar (R$)", 'inputmode="decimal" data-rep')}
        ${campo("repasse_em", "Repassado em", 'type="date" data-rep')}
        <p class="muted wide" id="nfConta" style="margin:0;font-size:12.5px;white-space:pre-line"></p>
        <label class="f">Situação<select name="status">${opts([["emitida", "Emitida"], ["cancelada", "Cancelada"]], x.status)}</select></label>
        ${campo("obs", "Observações", "", "wide")}
        <label class="f wide">Arquivo (PDF ou foto)<input type="file" id="nfArq" accept="application/pdf,image/*"><small id="nfArqMsg">${x.arquivo ? `Já tem arquivo. <a href="#" id="nfVer">Abrir</a> · escolher outro substitui.` : "O número, o valor e a data são lidos do arquivo."}</small></label>
      </div>
      <p style="margin:12px 0 0;display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn sm" id="nfPuxar">Projetar pelo fechamento</button><button type="button" class="btn sm" id="nfTextoBtn"></button>${x.id ? `<button type="button" class="btn ghost sm danger" id="nfExcluir">Excluir</button>` : ""}</p>`;
    const salvo = modal(x.id ? `${ehBoleto(x) ? "Boleto" : "NF"} ${x.numero || ""} · ${alvo(x)}` : "Lançar NF / boleto", html, {
      wide: true,
      onSave: async el => {
        const f = lerForm(el);
        if (f.tipo === "nf" && !f.usina_ids.length) throw new Error("Marque a usina (ou as usinas) da NF.");
        if (f.tipo === "boleto" && !f.cliente_id) throw new Error("Escolha o cliente do boleto.");
        if (arquivo) {
          $("[data-msg]", el).textContent = "Enviando o arquivo…";
          const r = await api("anexo", { method: "POST", raw: true, body: arquivo, headers: { "X-Nome": encodeURIComponent(arquivo.name || "documento"), "X-Usina": f.usina_id || f.cliente_id } });
          f.arquivo = r.caminho;
        }
        return x.id ? api(`notas_fiscais/${encodeURIComponent(x.id)}`, { method: "PUT", body: f }) : api("notas_fiscais", { method: "POST", body: f });
      }
    });
    const bgs = document.querySelectorAll(".modal-bg"), bg = bgs[bgs.length - 1];
    const sel = nm => $(`[name="${nm}"]`, bg);
    const tipo = () => sel("tipo").value;
    const comUc = () => sel("incluir_uc").checked;
    // O que está escolhido agora (para o cálculo pelo fechamento).
    const atual = () => ({ tipo: tipo(), cliente_id: sel("cliente_id").value || null, usina_ids: marcadas(bg), incluir_uc: comUc() ? 1 : 0 });
    // Lê o formulário já no formato da base.
    const lerForm = el => {
      const f = formData(el);
      for (const k of ["valor", "repasse_valor", "gestao_valor", "custo_pct", "geradora_valor", "custos_valor"]) f[k] = f[k] === "" ? null : n(f[k]);
      f.usina_ids = marcadas(el); f.usina_id = f.usina_ids[0] || null;
      if (f.tipo === "boleto") { f.emitente = "p3"; f.custo_pct = null; f.tomador = f.cliente_id ? nomeCliente(f.cliente_id) : null; }
      else f.custos_valor = null;
      if (!f.incluir_uc) f.geradora_valor = null;
      if (!f.cliente_id) f.cliente_id = null;
      if (!f.repasse_status) { f.repasse_status = null; f.repasse_valor = null; f.repasse_em = null; f.gestao_valor = null; f.custos_valor = null; }
      if (f.repasse_status === "pago" && !f.repasse_em) f.repasse_em = hojeIso();
      if (!f.regra_id) f.regra_id = null;
      if (!f.referencia) f.referencia = null;
      return f;
    };
    const mostrarCampos = () => {
      const t = tipo(), rep = !!sel("repasse_status").value;
      $$("label.f", bg).forEach(l => { l.style.display = (!l.dataset.t || l.dataset.t === t) && (!$("[data-rep]", l) || rep) && (!$("[data-uc]", l) || comUc()) ? "" : "none"; });
      sel("repasse_em").closest("label").style.display = sel("repasse_status").value === "pago" ? "" : "none";
      $("[data-rot-data]", bg).textContent = t === "boleto" ? "Vencimento do boleto" : "Data de emissão";
      $("#nfTextoBtn", bg).textContent = t === "boleto" ? "Resumo do boleto e do repasse" : "Texto para o contador";
      $("#nfTextoBtn", bg).style.display = t === "nf" && sel("emitente").value === "dono" ? "none" : "";
    };
    // Explica a conta: o que o fechamento dá e como sai o repasse.
    const conta = () => {
      mostrarCampos();
      const el = $("#nfConta", bg), v = n(sel("valor").value), uc = comUc() ? n(sel("geradora_valor").value) : 0;
      const linhas = [];
      const a = atual();
      if (a.cliente_id || a.usina_ids.length) {
        const c = calcCobranca(a, sel("referencia").value || M.addMonths(sel("competencia").value, -1));
        linhas.push(`Fechamento de ${fmt.mesLongo(c.ref)}: arrendamento ${fmt.brl(c.arr)}${c.comUc ? ` + custos da UC ${fmt.brl(c.uc)}` : c.ger ? ` (custos da UC de ${fmt.brl(c.ger)} ficam fora)` : ""} = ${fmt.brl(c.cobrar)}${c.usinas.length ? ` · ${c.usinas.map(u => u.nome).join(" + ")}` : ""}.`);
        if (c.parcial) linhas.push(`Atenção: ${c.avisos.join(" ")}`);
      }
      if (sel("repasse_status").value) {
        if (tipo() === "boleto") linhas.push(`Repasse: ${fmt.brl(v)}${uc ? ` − ${fmt.brl(uc)} custos da UC` : ""} − ${fmt.brl(n(sel("gestao_valor").value))} gestão${n(sel("custos_valor").value) ? ` − ${fmt.brl(n(sel("custos_valor").value))} custos do dono` : ""} = ${fmt.brl(n(sel("repasse_valor").value))} ao dono`);
        else { const c = repasseNf(v, sel("gestao_valor").value, sel("custo_pct").value); linhas.push(`Repasse: ${fmt.brl(v)}${uc ? ` − ${fmt.brl(uc)} custos da UC` : ""} − ${fmt.brl(n(sel("gestao_valor").value))} gestão − ${fmt.brl(c.custo)} custo da NF (${fmt.pctN(n(sel("custo_pct").value))}) = ${fmt.brl(n(sel("repasse_valor").value))} ao dono`); }
      }
      el.textContent = linhas.join("\n");
    };
    const recalcularRepasse = () => {
      if (sel("repasse_status").value) {
        const v = n(sel("valor").value), uc = comUc() ? n(sel("geradora_valor").value) : 0;
        if (tipo() === "boleto") sel("repasse_valor").value = fmtIn(Math.max(0, r2(v - uc - n(sel("gestao_valor").value) - n(sel("custos_valor").value))));
        else {
          if (sel("gestao_valor").value === "" && v) sel("gestao_valor").value = fmtIn(marcadas(bg).reduce((s, u, _, l) => s + gestaoDa(u, v / l.length), 0));
          if (v) sel("repasse_valor").value = fmtIn(Math.max(0, r2(repasseNf(v, sel("gestao_valor").value, sel("custo_pct").value).liquido - uc)));
        }
      }
      conta();
    };
    // Projeta pelo fechamento: valor (arrendamento + custos da UC, se marcado), custos da UC, gestão e custos do dono.
    // Na NF com valor fixo na regra, o valor fixo é mantido.
    const puxar = () => {
      const a = atual(); if (!a.cliente_id && !a.usina_ids.length) return conta();
      if (!sel("referencia").value) sel("referencia").value = M.addMonths(sel("competencia").value, -1);
      const c = calcCobranca(a, sel("referencia").value);
      const regra = dados.regras.find(y => y.id === sel("regra_id").value);
      const fixo = tipo() === "nf" && regra && regra.valor_padrao;
      sel("valor").value = fmtIn(fixo ? regra.valor_padrao : c.cobrar || "");
      sel("geradora_valor").value = fmtIn(c.uc); sel("gestao_valor").value = fmtIn(c.gest || ""); sel("custos_valor").value = fmtIn(c.custos);
      recalcularRepasse();
    };
    sel("tipo").onchange = () => { if (tipo() === "boleto" && !x.id) sel("incluir_uc").checked = true; puxar(); };
    sel("cliente_id").onchange = puxar;
    $$("[data-us]", bg).forEach(i => { i.onchange = puxar; });
    sel("referencia").onchange = puxar;
    sel("competencia").onchange = () => { sel("referencia").value = M.addMonths(sel("competencia").value, -1); puxar(); };
    sel("incluir_uc").onchange = puxar;
    sel("emitente").onchange = conta;
    sel("regra_id").onchange = () => {
      const r = dados.regras.find(y => y.id === sel("regra_id").value); if (!r) return;
      const prev = novaDaRegra(r, sel("competencia").value);
      sel("tipo").value = prev.tipo; sel("cliente_id").value = prev.cliente_id || ""; sel("incluir_uc").checked = !!prev.incluir_uc;
      $$("[data-us]", bg).forEach(i => { i.checked = prev.usina_ids.includes(i.dataset.us); });
      for (const k of ["emitente", "tomador", "custo_pct", "repasse_status", "referencia"]) if (sel(k) && prev[k] != null) sel(k).value = /pct/.test(k) ? fmtIn(prev[k]) : prev[k];
      puxar();
    };
    $("#nfPuxar", bg).onclick = puxar;
    sel("repasse_status").onchange = () => { if (sel("gestao_valor").value === "") puxar(); else recalcularRepasse(); };
    ["valor", "gestao_valor", "custo_pct", "geradora_valor", "custos_valor"].forEach(k => { sel(k).oninput = recalcularRepasse; });
    sel("repasse_valor").oninput = conta;
    for (const k of ["valor", "gestao_valor", "custo_pct", "repasse_valor", "geradora_valor", "custos_valor"]) sel(k).value = fmtIn(sel(k).value);
    conta();
    $("#nfTextoBtn", bg).onclick = () => mostrarTexto({ ...x, ...lerForm(bg) });
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
        if (lido.valor && tipo() === "nf") { sel("valor").value = fmtIn(lido.valor); preenchidos.push("valor"); }
        if (lido.data_emissao) { sel("data_emissao").value = lido.data_emissao; preenchidos.push("data"); }
        recalcularRepasse();
        msg.textContent = preenchidos.length ? `Lido: ${preenchidos.join(", ")}. Confira antes de salvar.` : "Não achei número/valor no arquivo: preencha à mão. O arquivo será guardado.";
      } catch (err) { msg.textContent = "Não consegui ler o arquivo, mas ele será guardado. Preencha à mão."; }
    };
    const exc = $("#nfExcluir", bg);
    if (exc) exc.onclick = async () => {
      if (!await confirmar("Excluir", "Sai da lista (o arquivo continua guardado na nuvem). Continuar?", "Excluir")) return;
      try { await api(`notas_fiscais/${encodeURIComponent(x.id)}`, { method: "DELETE" }); $("[data-x]", bg).click(); await recarregar(main); toast("Excluído.", "ok"); }
      catch (e) { toast(e.message, "bad"); }
    };
    if (await salvo) { await recarregar(main); toast("Salvo.", "ok"); }
  }

  async function editarRegra(main, orig) {
    const r = { tipo: "nf", ...orig };
    if (r.incluir_uc == null) r.incluir_uc = ehBoleto(r) ? 1 : 0;
    const campo = (nome, rot, extra = "", cls = "", t = "") => `<label class="f ${cls}" ${t ? `data-t="${t}"` : ""}>${rot}<input name="${nome}" value="${esc(r[nome] ?? "")}" ${extra}></label>`;
    const html = `<div class="grid-form">
        <label class="f">Tipo<select name="tipo">${opts(Object.entries(TIPO), r.tipo)}</select></label>
        <label class="f">Cliente<select name="cliente_id">${opts(db().clientes.map(c => [c.id, c.nome]), r.cliente_id, "—")}</select></label>
        ${campo("descricao", "Descrição", 'placeholder="Ex.: NF da P3 ao cliente"')}
        ${caixasUsinas(usinasDe(r))}
        <label class="f pr-check"><span style="display:flex;gap:8px;align-items:center;font-weight:500;font-size:13px"><input type="checkbox" name="incluir_uc" ${Number(r.incluir_uc) ? "checked" : ""}> Incluir custos da UC (faturas das geradoras)</span></label>
        <label class="f" data-t="nf">Quem emite<select name="emitente">${opts(Object.entries(EMITENTE), r.emitente)}</select></label>
        ${campo("dia", "Dia de emitir (1 a 31)", 'type="number" min="1" max="31"')}
        ${campo("valor_padrao", "Valor fixo (R$) — vazio = projetar pelo fechamento", 'inputmode="decimal"')}
        ${campo("custo_pct", "Custo da NF (%)", 'inputmode="decimal" placeholder="Ex.: 6"', "", "nf")}
        ${campo("tomador", "Tomador (como sai na NF)", "", "", "nf")}
        ${campo("servico", "Descrição do serviço na NF", `placeholder="${SERVICO_PADRAO}"`, "wide", "nf")}
        <label class="f">Repasse ao dono<select name="repasse">${opts([["0", "Não"], ["1", "Sim: a P3 recebe e repassa ao dono"]], String(r.repasse || 0))}</select></label>
        <label class="f">Situação<select name="ativo">${opts([["1", "Ativa"], ["0", "Pausada"]], String(r.ativo ?? 1))}</select></label>
        ${campo("obs", "Observações", "", "wide")}
      </div>
      <p class="muted" id="nrAjuda" style="font-size:12.5px;margin:10px 0 0"></p>
      ${r.id ? `<p style="margin:14px 0 0"><button type="button" class="btn ghost sm danger" id="nrExcluir">Excluir esta regra</button></p>` : ""}`;
    const salvo = modal(r.id ? "Regra" : "Nova regra", html, {
      onSave: async el => {
        const f = formData(el);
        f.usina_ids = marcadas(el); f.usina_id = f.usina_ids[0] || null;
        if (f.tipo === "nf" && !f.usina_ids.length) throw new Error("Marque a usina (ou as usinas) da NF.");
        if (f.tipo === "boleto" && !f.cliente_id) throw new Error("Escolha o cliente do boleto.");
        if (f.tipo === "boleto") { f.emitente = "p3"; f.custo_pct = null; f.servico = null; f.tomador = nomeCliente(f.cliente_id); }
        else f.custo_pct = f.custo_pct === "" ? null : n(f.custo_pct);
        f.valor_padrao = f.valor_padrao === "" ? null : n(f.valor_padrao);
        if (!f.cliente_id) f.cliente_id = null;
        f.dia = f.dia === "" ? null : Number(f.dia);
        f.repasse = Number(f.repasse); f.ativo = Number(f.ativo);
        return r.id ? api(`nf_regras/${encodeURIComponent(r.id)}`, { method: "PUT", body: f }) : api("nf_regras", { method: "POST", body: f });
      }
    });
    const bgs = document.querySelectorAll(".modal-bg"), bg = bgs[bgs.length - 1];
    const ajustar = () => {
      const t = $("[name=tipo]", bg).value;
      $$("[data-t]", bg).forEach(l => { l.style.display = l.dataset.t === t ? "" : "none"; });
      $("#nrAjuda", bg).textContent = t === "boleto"
        ? "Boleto sem NF: o valor sai do fechamento do mês anterior — a parte do cliente no arrendamento das usinas marcadas, mais os custos da UC (faturas das geradoras) se marcado. O repasse ao dono tira os custos da UC, a gestão da P3 e os custos do dono."
        : "NF: por padrão só o arrendamento das usinas marcadas (projetado pelo fechamento), ou o valor fixo. Marque \"incluir custos da UC\" para somar as faturas das geradoras. Quando o dono emite, a regra serve para lembrar de pegar a cópia.";
    };
    $("[name=tipo]", bg).onchange = () => { if (!r.id) $("[name=incluir_uc]", bg).checked = $("[name=tipo]", bg).value === "boleto"; ajustar(); };
    ajustar();
    const exc = $("#nrExcluir", bg);
    if (exc) exc.onclick = async () => {
      if (!await confirmar("Excluir regra", "O que já foi lançado continua guardado; só para de lembrar. Continuar?", "Excluir")) return;
      try { await api(`nf_regras/${encodeURIComponent(r.id)}`, { method: "DELETE" }); $("[data-x]", bg).click(); await recarregar(main); toast("Regra excluída.", "ok"); }
      catch (e) { toast(e.message, "bad"); }
    };
    if (await salvo) { await recarregar(main); toast("Regra salva.", "ok"); }
  }

  window.P3_NF = { aviso, pendencias, carregar, lerNf, calcCobranca, novaDaRegra, textoPronto };
  window.P3.register("notas", { render });
})();
