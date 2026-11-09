// Créditos arrendados: créditos de energia de um cliente (dono) que a P3 transfere para uma UC da Uby
// (ex.: Posto Central DC) e controla mês a mês. A Uby paga um R$/kWh sobre o compensado; o dono recebe o R$/kWh dele;
// a P3 fica com a diferença. Conferência cruzada: kWh compensado na fatura Copel × kWh registrado na plataforma da Uby.
// Mais tarde, as usinas arrendadas à Uby entram no mesmo controle (o lote passa a ser a usina).
(function () {
  "use strict";
  const { esc, $, $$, fmt, api, toast, opts, modal, confirmar, formData, kpi, badge, db } = window.P3;
  const n = v => { if (v == null || v === "") return 0; if (typeof v === "number") return v; let s = String(v).trim().replace(/[R$\s]/g, ""); if (/,/.test(s)) s = s.replace(/\./g, "").replace(",", "."); else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); const x = Number(s); return Number.isFinite(x) ? x : 0; };
  const r2 = v => Math.round(v * 100) / 100;
  const num = (v, d = 0) => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const vazio = v => v === "" || v == null;
  const TOL = 1; // kWh de diferença tolerada entre Copel e Uby
  let lotes = [], movs = [];

  async function carregar() { [lotes, movs] = await Promise.all([api("creditos_lotes"), api("creditos_mov")]); }
  // Valores de um mês: o kWh da fatura Copel é o que vale; sem fatura, usa o da Uby.
  function calcMov(l, m) {
    const kwh = !vazio(m.kwh_fatura) ? n(m.kwh_fatura) : n(m.kwh_uby);
    const uby = vazio(m.valor_uby) ? r2(kwh * n(l.preco_uby_kwh)) : n(m.valor_uby);
    const dono = vazio(m.valor_dono) ? r2(kwh * n(l.preco_dono_kwh)) : n(m.valor_dono);
    const confere = vazio(m.kwh_fatura) || vazio(m.kwh_uby) ? null : Math.abs(n(m.kwh_fatura) - n(m.kwh_uby)) <= TOL;
    return { kwh, uby, dono, p3: r2(uby - dono), confere };
  }
  function resumo(l) {
    const ms = movs.filter(m => m.lote_id === l.id).sort((a, b) => a.competencia.localeCompare(b.competencia));
    const cs = ms.map(m => ({ m, c: calcMov(l, m) }));
    const usado = cs.reduce((s, x) => s + x.c.kwh, 0), saldo = n(l.kwh_transferidos) - usado;
    const ult = cs.slice(-3), media = ult.length ? ult.reduce((s, x) => s + x.c.kwh, 0) / ult.length : 0;
    return { ms: cs, usado, saldo, media, mesesRestantes: media ? saldo / media : null,
      aReceber: r2(cs.filter(x => !x.m.recebido_uby).reduce((s, x) => s + x.c.uby, 0)), aPagar: r2(cs.filter(x => !x.m.pago_dono).reduce((s, x) => s + x.c.dono, 0)),
      p3: r2(cs.reduce((s, x) => s + x.c.p3, 0)), divergencias: cs.filter(x => x.c.confere === false).length };
  }

  async function render(main) {
    main.innerHTML = `<div class="loading">Carregando os créditos…</div>`;
    try { await carregar(); } catch (e) { main.innerHTML = `<div class="note bad">${esc(e.message)}</div>`; return; }
    if (window.P3.state.route !== "creditos") return;
    desenhar(main);
  }

  function desenhar(main) {
    const rs = lotes.map(l => ({ l, r: resumo(l) }));
    const soma = k => r2(rs.reduce((s, x) => s + x.r[k], 0));
    const div = rs.reduce((s, x) => s + x.r.divergencias, 0);
    main.innerHTML = `
      <div class="head"><div><p class="kicker">Gestão de energia</p><h1>Créditos arrendados</h1><p>Créditos de clientes (e, depois, usinas) que a P3 arrenda para a Uby: saldo, uso mês a mês, conferência Copel × Uby e o que receber e repassar.</p></div>
        <div class="actions"><button class="btn primary" id="crNovo">+ Lote de créditos</button></div></div>
      ${div ? `<div class="note bad" style="margin-bottom:12px">${div} mês(es) com o kWh da fatura Copel diferente do registrado na Uby. Veja abaixo.</div>` : ""}
      <div class="kpis">
        ${kpi("Saldo de créditos", `${num(soma("saldo"))} kWh`, `${lotes.length} lote(s)`, "lead")}
        ${kpi("A receber da Uby", fmt.brl(soma("aReceber")), "meses em aberto")}
        ${kpi("A repassar aos donos", fmt.brl(soma("aPagar")), "meses em aberto")}
        ${kpi("Resultado P3", fmt.brl(soma("p3")), "diferença acumulada")}
      </div>
      ${rs.map(({ l, r }) => `<div class="section card">
        <div class="section-head" style="margin:0 0 10px"><div><h2>${esc(l.nome)} ${l.status === "encerrado" ? badge("Encerrado", "") : ""}</h2>
          <p>${esc(l.dono_nome || (db().by.donos.get(l.dono_id) || {}).nome || "Dono")} → ${esc(l.destino_nome || l.arrendatario || "Uby")}${l.uc_destino ? ` · UC ${esc(l.uc_destino)}` : ""} · Uby paga R$ ${num(l.preco_uby_kwh, 4)}/kWh · dono recebe R$ ${num(l.preco_dono_kwh, 4)}/kWh</p></div>
          <div class="actions"><button class="btn sm" data-mes="${esc(l.id)}">+ Mês</button><button class="btn ghost sm" data-lote="${esc(l.id)}">Editar</button></div></div>
        <div class="kpis" style="margin-bottom:10px">
          ${kpi("Transferido", `${num(l.kwh_transferidos)} kWh`, l.data_transferencia ? `em ${fmt.data(l.data_transferencia)}` : "")}
          ${kpi("Usado", `${num(r.usado)} kWh`, r.media ? `média ${num(r.media)} kWh/mês` : "")}
          ${kpi("Saldo", `${num(r.saldo)} kWh`, r.mesesRestantes != null ? `acaba em ~${num(r.mesesRestantes, 1)} meses` : "", r.saldo < 0 ? "" : "lead")}
          ${kpi("A receber / a repassar", `${fmt.brl(r.aReceber)} / ${fmt.brl(r.aPagar)}`, "")}
        </div>
        ${r.ms.length ? `<div class="table-wrap"><table><thead><tr><th>Mês</th><th class="n">kWh Copel</th><th class="n">kWh Uby</th><th>Conferência</th><th class="n">Uby paga</th><th class="n">Dono recebe</th><th class="n">P3</th><th>Uby</th><th>Dono</th><th></th></tr></thead><tbody>
          ${r.ms.slice().reverse().map(({ m, c }) => `<tr>
            <td>${esc(fmt.mes(m.competencia))}${m.fatura_ref ? `<small>${esc(m.fatura_ref)}</small>` : ""}</td>
            <td class="n">${vazio(m.kwh_fatura) ? "—" : num(m.kwh_fatura)}</td><td class="n">${vazio(m.kwh_uby) ? "—" : num(m.kwh_uby)}</td>
            <td>${c.confere === true ? badge("Confere", "ok") : c.confere === false ? badge(`Diferença ${num(n(m.kwh_fatura) - n(m.kwh_uby))} kWh`, "bad") : badge(vazio(m.kwh_uby) ? "Falta Uby" : "Falta fatura", "warn")}</td>
            <td class="n">${fmt.brl(c.uby)}</td><td class="n">${fmt.brl(c.dono)}</td><td class="n">${fmt.brl(c.p3)}</td>
            <td>${m.recebido_uby ? badge(`Recebido ${fmt.data(m.recebido_uby)}`, "ok") : `<button class="btn sm" data-rec="${esc(m.id)}">Recebi</button>`}</td>
            <td>${m.pago_dono ? badge(`Pago ${fmt.data(m.pago_dono)}`, "ok") : `<button class="btn sm" data-pag="${esc(m.id)}">Paguei</button>`}</td>
            <td class="right"><button class="btn ghost sm" data-edm="${esc(m.id)}">Editar</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Nenhum mês lançado. Use "+ Mês" e leia a fatura Copel da UC de destino.</div>`}
      </div>`).join("") || `<div class="empty">Nenhum lote ainda. Cadastre os créditos transferidos para a UC do Posto Central DC em "+ Lote de créditos".</div>`}`;
    $("#crNovo", main).onclick = () => editarLote(main, { arrendatario: "Uby", status: "ativo", data_transferencia: hoje(), destino_nome: "Posto Central DC" });
    $$("[data-lote]", main).forEach(b => b.onclick = () => editarLote(main, lotes.find(l => l.id === b.dataset.lote)));
    $$("[data-mes]", main).forEach(b => b.onclick = () => { const l = lotes.find(x => x.id === b.dataset.mes); editarMov(main, l, { lote_id: l.id, competencia: hoje().slice(0, 7) }); });
    $$("[data-edm]", main).forEach(b => b.onclick = () => { const m = movs.find(x => x.id === b.dataset.edm); editarMov(main, lotes.find(l => l.id === m.lote_id), m); });
    const marcar = (attr, campo, msg) => $$(`[data-${attr}]`, main).forEach(b => b.onclick = async () => {
      try { await api(`creditos_mov/${encodeURIComponent(b.dataset[attr])}`, { method: "PUT", body: { [campo]: hoje() } }); toast(msg, "ok"); await carregar(); desenhar(main); } catch (e) { toast(e.message, "bad"); }
    });
    marcar("rec", "recebido_uby", "Recebimento da Uby marcado.");
    marcar("pag", "pago_dono", "Repasse ao dono marcado.");
  }

  const valorCampo = v => String(v ?? "").replace(/^(-?\d+)\.(\d+)$/, "$1,$2");

  async function editarLote(main, orig) {
    const l = { ...orig };
    const campo = (k, rot, extra = "", cls = "") => `<label class="f ${cls}">${rot}<input name="${k}" value="${esc(valorCampo(l[k]))}" ${extra}></label>`;
    const html = `<div class="grid-form">
      ${campo("nome", "Nome do lote", 'placeholder="Ex.: Créditos Fulano → Posto Central DC"', "wide")}
      <label class="f">Dono dos créditos<select name="dono_id">${opts(db().donos.map(d => [d.id, d.nome]), l.dono_id, "— (digite ao lado)")}</select></label>
      ${campo("dono_nome", "Ou o nome do dono")}
      ${campo("uc_origem", "UC de origem dos créditos")}${campo("uc_destino", "UC de destino (Uby)")}${campo("destino_nome", "Nome do destino", 'placeholder="Posto Central DC"')}
      ${campo("kwh_transferidos", "kWh transferidos", 'inputmode="decimal"')}${campo("data_transferencia", "Data da transferência", 'type="date"')}
      ${campo("preco_uby_kwh", "Uby paga (R$/kWh compensado)", 'inputmode="decimal"')}${campo("preco_dono_kwh", "Dono recebe (R$/kWh)", 'inputmode="decimal"')}
      ${campo("uby_ref", "Referência na plataforma da Uby (opcional)")}
      <label class="f">Situação<select name="status">${opts([["ativo", "Ativo"], ["encerrado", "Encerrado"]], l.status || "ativo")}</select></label>
      ${campo("obs", "Observações", "", "wide")}</div>
      ${l.id ? `<p style="margin:12px 0 0"><button type="button" class="btn ghost sm danger" id="crExc">Excluir lote</button></p>` : ""}`;
    const ok = modal(l.id ? l.nome : "Novo lote de créditos", html, { wide: true, onSave: async el => {
      const f = formData(el);
      if (!f.nome.trim()) throw new Error("Dê um nome ao lote.");
      for (const k of ["kwh_transferidos", "preco_uby_kwh", "preco_dono_kwh"]) f[k] = f[k] === "" ? null : n(f[k]);
      for (const k of ["dono_id", "dono_nome", "uc_origem", "uc_destino", "destino_nome", "uby_ref", "obs", "data_transferencia"]) if (!f[k]) f[k] = null;
      return l.id ? api(`creditos_lotes/${encodeURIComponent(l.id)}`, { method: "PUT", body: f }) : api("creditos_lotes", { method: "POST", body: f });
    } });
    const bgs = document.querySelectorAll(".modal-bg"), bg = bgs[bgs.length - 1];
    const exc = $("#crExc", bg);
    if (exc) exc.onclick = async () => {
      if (movs.some(m => m.lote_id === l.id)) return toast("Exclua os meses lançados antes.", "bad");
      if (!await confirmar("Excluir lote", `Excluir "${esc(l.nome)}"?`, "Excluir")) return;
      try { await api(`creditos_lotes/${encodeURIComponent(l.id)}`, { method: "DELETE" }); $("[data-x]", bg).click(); await carregar(); desenhar(main); } catch (e) { toast(e.message, "bad"); }
    };
    if (await ok) { toast("Lote salvo.", "ok"); await carregar(); desenhar(main); }
  }

  async function editarMov(main, l, orig) {
    const m = { ...orig };
    const campo = (k, rot, extra = "") => `<label class="f">${rot}<input name="${k}" value="${esc(valorCampo(m[k]))}" ${extra}></label>`;
    const html = `<div class="grid-form">
      ${campo("competencia", "Mês", 'type="month"')}
      <div class="f wide"><span><label class="btn sm" for="crFat">Ler fatura Copel da UC de destino</label><input type="file" id="crFat" accept="application/pdf,.pdf" hidden> <span class="muted" id="crFatMsg" style="font-size:12.5px">Puxa o kWh compensado e confere a UC.</span></span></div>
      ${campo("kwh_fatura", "kWh compensado na fatura Copel", 'inputmode="decimal"')}
      ${campo("kwh_uby", "kWh registrado na plataforma da Uby", 'inputmode="decimal"')}
      ${campo("fatura_ref", "Referência da fatura")}
      ${campo("valor_uby", "Uby paga (R$) — vazio = kWh × preço", 'inputmode="decimal"')}
      ${campo("valor_dono", "Dono recebe (R$) — vazio = kWh × preço", 'inputmode="decimal"')}
      ${campo("recebido_uby", "Recebido da Uby em", 'type="date"')}${campo("pago_dono", "Repassado ao dono em", 'type="date"')}
      <label class="f wide">Observações<input name="obs" value="${esc(m.obs || "")}"></label>
      <p class="muted wide" id="crConta" style="margin:0;font-size:12.5px"></p></div>
      ${m.id ? `<p style="margin:12px 0 0"><button type="button" class="btn ghost sm danger" id="cmExc">Excluir mês</button></p>` : ""}`;
    const ok = modal(`${l.nome} · mês`, html, { wide: true, onSave: async el => {
      const f = formData(el);
      if (!f.competencia) throw new Error("Escolha o mês.");
      for (const k of ["kwh_fatura", "kwh_uby", "valor_uby", "valor_dono"]) f[k] = f[k] === "" ? null : n(f[k]);
      for (const k of ["fatura_ref", "recebido_uby", "pago_dono", "obs"]) if (!f[k]) f[k] = null;
      f.lote_id = l.id;
      return m.id ? api(`creditos_mov/${encodeURIComponent(m.id)}`, { method: "PUT", body: f }) : api("creditos_mov", { method: "POST", body: f });
    } });
    const bgs = document.querySelectorAll(".modal-bg"), bg = bgs[bgs.length - 1], sel = k => $(`[name="${k}"]`, bg);
    const conta = () => {
      const c = calcMov(l, formData(bg));
      $("#crConta", bg).textContent = `${num(c.kwh)} kWh · Uby paga ${fmt.brl(c.uby)} · dono recebe ${fmt.brl(c.dono)} · P3 fica com ${fmt.brl(c.p3)}${c.confere === false ? " · ATENÇÃO: Copel e Uby não batem" : c.confere ? " · Copel e Uby conferem" : ""}`;
    };
    $$("[name]", bg).forEach(i => i.addEventListener("input", conta)); conta();
    $("#crFat", bg).onchange = async e => {
      const arq = e.target.files[0]; e.target.value = ""; if (!arq) return;
      const msg = $("#crFatMsg", bg); msg.textContent = "Lendo a fatura…";
      try {
        const r = await api("ler-pdf", { method: "POST", raw: true, body: arq, headers: { "X-Nome": encodeURIComponent(arq.name || "fatura.pdf"), "X-So-Ler": "1" } });
        if (!r.ok) throw new Error(r.erro || "Não consegui ler a fatura.");
        const f = r.campos || {}, uc = String(f.uc || f.ucConces || "");
        const dig = s => String(s || "").replace(/\D/g, "").replace(/^0+/, "");
        const outra = l.uc_destino && uc && dig(f.uc) !== dig(l.uc_destino) && dig(f.ucConces) !== dig(l.uc_destino);
        sel("kwh_fatura").value = String(f.compensadoKwh || 0);
        sel("fatura_ref").value = `Copel ${f.referencia || ""} · UC ${uc}`;
        if (f.referencia) sel("competencia").value = f.referencia;
        conta();
        msg.textContent = `Compensado ${num(f.compensadoKwh)} kWh na referência ${f.referencia || "?"} (UC ${uc}).${outra ? " ATENÇÃO: não é a UC de destino deste lote." : ""}`;
        msg.style.color = outra ? "var(--bad)" : "";
      } catch (err) { msg.textContent = err.message; }
    };
    const exc = $("#cmExc", bg);
    if (exc) exc.onclick = async () => {
      if (!await confirmar("Excluir mês", "Excluir este mês do lote?", "Excluir")) return;
      try { await api(`creditos_mov/${encodeURIComponent(m.id)}`, { method: "DELETE" }); $("[data-x]", bg).click(); await carregar(); desenhar(main); } catch (e) { toast(e.message, "bad"); }
    };
    if (await ok) { toast("Mês salvo.", "ok"); await carregar(); desenhar(main); }
  }

  window.P3_CREDITOS = { calcMov, resumo };
  window.P3.register("creditos", { render });
})();
