// Envios do mês: o checklist de quem recebe relatório e cobrança em cada mês.
// Cada cliente/dono diz de qual mês é o extrato que vai (rel_atraso no cadastro): o padrão é o mês anterior,
// a Prisma recebe o de 2 meses atrás. Assim, no mês de envio escolhido, a tela mostra o mês certo de cada um,
// se esse extrato já foi enviado (em qualquer data) e se a NF/boleto do mês já foi lançada em "NFs e cobranças".
(function () {
  "use strict";
  const { esc, $, $$, fmt, api, toast, kpi, badge, db, M } = window.P3;
  const dados = { envios: [], notas: [], regras: [], pubs: [], carregado: false, carregando: null };
  const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const ui = { mes: "" };

  async function carregar(forcar) {
    if (forcar) dados.carregando = null;
    if (!dados.carregando) dados.carregando = Promise.all([api("envios"), api("notas_fiscais"), api("nf_regras"), api("publicacoes").catch(() => [])]).then(([e, n, r, p]) => {
      Object.assign(dados, { envios: e, notas: n, regras: r, pubs: p, carregado: true }); marcarMenu();
    }).catch(e => { dados.carregando = null; throw e; });
    return dados.carregando;
  }

  const atraso = p => p.rel_atraso == null ? 1 : Number(p.rel_atraso);
  const DESC_ATRASO = { 0: "do próprio mês", 1: "do mês anterior", 2: "de 2 meses atrás" };
  const chave = (tipo, id) => tipo === "cliente" ? "cliente_id" : "dono_id";

  // Quem recebe relatório, com o mês do extrato devido no mês de envio.
  function linhas(mesEnvio) {
    const D = db(), out = [];
    for (const c of D.clientes) if (atraso(c) >= 0) out.push({ tipo: "cliente", id: c.id, nome: c.nome, atraso: atraso(c) });
    for (const d of D.donos) if (atraso(d) >= 0 && D.usinas.some(u => u.dono_id === d.id)) out.push({ tipo: "dono", id: d.id, nome: d.nome, atraso: atraso(d) });
    return out.map(p => {
      const ref = M.addMonths(mesEnvio, -p.atraso), k = chave(p.tipo);
      const meus = dados.envios.filter(e => e.tipo === p.tipo && e[k] === p.id);
      const enviado = meus.find(e => e.referencia === ref) || null;
      const ultimo = meus.slice().sort((a, b) => b.referencia.localeCompare(a.referencia))[0] || null;
      const cobrancas = p.tipo === "cliente" ? dados.regras.filter(r => r.cliente_id === p.id && r.ativo !== 0).map(r => ({
        regra: r, nota: dados.notas.find(x => x.regra_id === r.id && x.competencia === mesEnvio && x.status !== "cancelada") || null
      })) : [];
      const portal = dados.pubs.find(x => x.tipo === p.tipo && x[k] === p.id && x.de <= ref && x.ate >= ref) || null;
      return { ...p, ref, enviado, ultimo, cobrancas, portal };
    });
  }
  const pendentes = mes => linhas(mes).filter(l => !l.enviado);

  // Para a tela de Relatórios: o que vale para esta pessoa no mês corrente.
  function situacao(tipo, id, mesEnvio) {
    if (!dados.carregado) return null;
    return linhas(mesEnvio || hojeIso().slice(0, 7)).find(l => l.tipo === tipo && l.id === id) || null;
  }
  async function marcar(tipo, id, ref, mesEnvio) {
    await api("envios", { method: "POST", body: { tipo, [chave(tipo)]: id, referencia: ref, mes_envio: mesEnvio || hojeIso().slice(0, 7), enviado_em: hojeIso() } });
    await carregar(true);
  }

  function marcarMenu() {
    const el = $("#evAlert"); if (!el) return;
    const q = pendentes(hojeIso().slice(0, 7)).length;
    el.hidden = !q; el.textContent = q;
  }

  async function render(main) {
    main.innerHTML = `<div class="loading">Carregando os envios…</div>`;
    try { await carregar(true); } catch (e) { main.innerHTML = `<div class="note bad">${esc(e.message)}</div>`; return; }
    if (window.P3.state.route !== "envios") return;
    desenhar(main);
  }

  function desenhar(main) {
    if (!ui.mes) ui.mes = hojeIso().slice(0, 7);
    const ls = linhas(ui.mes);
    const falta = ls.filter(l => !l.enviado).length;
    const cobs = ls.flatMap(l => l.cobrancas), cobFalta = cobs.filter(c => !c.nota).length;
    const grupo = (tipo, titulo) => {
      const g = ls.filter(l => l.tipo === tipo);
      if (!g.length) return "";
      return `<div class="section"><div class="section-head"><div><h2>${titulo}</h2></div></div><div class="table-wrap"><table><thead><tr><th>Para</th><th>Relatório que vai</th>${tipo === "cliente" ? "<th>Cobrança do mês</th>" : ""}<th>Envio</th><th></th></tr></thead><tbody>
        ${g.map(l => `<tr>
          <td><b>${esc(l.nome)}</b><small>${l.ultimo ? `último enviado: ${esc(fmt.mes(l.ultimo.referencia))}${l.ultimo.enviado_em ? ` em ${esc(fmt.data(l.ultimo.enviado_em))}` : ""}` : "nenhum envio registrado"}</small></td>
          <td><b>${esc(fmt.mesLongo(l.ref))}</b><small>${esc(DESC_ATRASO[l.atraso] || `de ${l.atraso} meses atrás`)}${l.portal ? " · já está no portal" : ""}</small></td>
          ${tipo === "cliente" ? `<td>${l.cobrancas.length ? l.cobrancas.map(c => `<div>${c.nota ? badge(c.regra.tipo === "boleto" ? "Boleto lançado" : "NF lançada", "ok") : badge(c.regra.tipo === "boleto" ? "Falta o boleto" : c.regra.emitente === "dono" ? "Falta a NF do dono" : "Falta a NF", "bad")}<small>${esc(c.regra.descricao || "")}${c.nota && c.nota.data_emissao ? ` · ${esc(fmt.data(c.nota.data_emissao))}` : ""}</small></div>`).join("") : `<span class="muted">sem cobrança cadastrada</span>`}</td>` : ""}
          <td>${l.enviado ? `${badge("Enviado", "ok")}<small>${l.enviado.enviado_em ? esc(fmt.data(l.enviado.enviado_em)) : ""}${l.enviado.mes_envio !== ui.mes ? ` (no envio de ${esc(fmt.mes(l.enviado.mes_envio))})` : ""}</small>` : badge("Falta enviar", "warn")}</td>
          <td class="right" style="white-space:nowrap"><a class="btn sm ghost" href="#/relatorios/${l.tipo}/${encodeURIComponent(l.id)}/${l.ref}">Abrir relatório de ${esc(fmt.mes(l.ref))}</a>
            ${l.enviado ? `<button class="btn sm ghost" data-desfaz="${esc(l.enviado.id)}">Desfazer</button>` : `<button class="btn sm primary" data-envia="${esc(l.tipo)}|${esc(l.id)}|${l.ref}">Marcar enviado</button>`}</td></tr>`).join("")}
        </tbody></table></div></div>`;
    };
    main.innerHTML = `
      <div class="head"><div><p class="kicker">Usinas</p><h1>Envios do mês</h1><p>Em cada mês, quem recebe qual relatório e se a cobrança já saiu. O mês do relatório de cada um vem do cadastro (ex.: Prisma recebe o de 2 meses atrás). Marque como enviado depois de mandar.</p></div>
        <div class="actions"><button class="btn" id="evAnt">←</button><input type="month" id="evMes" value="${esc(ui.mes)}" style="width:auto"><button class="btn" id="evProx">→</button></div></div>
      <div class="kpis">
        ${kpi(`Envios de ${fmt.mes(ui.mes)}`, `${ls.length - falta} de ${ls.length}`, falta ? `${falta} relatório(s) a enviar` : "tudo enviado", falta ? "" : "lead")}
        ${kpi("Cobranças do mês", `${cobs.length - cobFalta} de ${cobs.length}`, cobFalta ? `${cobFalta} a emitir · <a href="#/notas">abrir NFs</a>` : "todas lançadas")}
      </div>
      ${grupo("cliente", "Clientes (extrato de economia)")}
      ${grupo("dono", "Donos (extrato de repasse)")}
      <p class="muted" style="font-size:12.5px">Para mudar de qual mês é o relatório de alguém (ou tirar da lista), edite o cliente ou o dono no cadastro: campo <b>Relatório mensal</b>.</p>`;
    $("#evMes").onchange = e => { if (e.target.value) { ui.mes = e.target.value; desenhar(main); } };
    $("#evAnt").onclick = () => { ui.mes = M.addMonths(ui.mes, -1); desenhar(main); };
    $("#evProx").onclick = () => { ui.mes = M.addMonths(ui.mes, 1); desenhar(main); };
    $$("[data-envia]", main).forEach(b => b.onclick = async () => {
      const [tipo, id, ref] = b.dataset.envia.split("|");
      b.disabled = true;
      try { await marcar(tipo, id, ref, ui.mes); toast(`Marcado: relatório de ${fmt.mes(ref)} enviado.`, "ok"); desenhar(main); }
      catch (e) { b.disabled = false; toast(e.message, "bad"); }
    });
    $$("[data-desfaz]", main).forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { await api(`envios/${encodeURIComponent(b.dataset.desfaz)}`, { method: "DELETE" }); await carregar(true); toast("Envio desmarcado.", "ok"); desenhar(main); }
      catch (e) { b.disabled = false; toast(e.message, "bad"); }
    });
  }

  // Aviso do painel: relatórios do mês que ainda não foram enviados.
  function aviso() {
    if (!dados.carregado) {
      carregar().then(() => { if (window.P3.state.route === "painel" && pendentes(hojeIso().slice(0, 7)).length) window.P3.render(); }).catch(() => {});
      return "";
    }
    const mes = hojeIso().slice(0, 7), p = pendentes(mes);
    if (!p.length) return "";
    return `<div class="note info" style="margin-bottom:14px"><b>Relatórios de ${esc(fmt.mes(mes))} a enviar:</b> ${p.map(l => `${esc(l.nome)} (${esc(fmt.mes(l.ref))})`).join(", ")}. <a href="#/envios">Abrir envios →</a></div>`;
  }

  window.P3_ENVIOS = { carregar, situacao, marcar, pendentes, linhas, aviso };
  window.P3.register("envios", { render });
})();
