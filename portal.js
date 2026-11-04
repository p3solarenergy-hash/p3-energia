// Portal do dono e do cliente: só leitura. O banco só entrega os relatórios publicados para quem está logado.
(function () {
  "use strict";
  const sb = window.supabase.createClient(window.P3_CONFIG.url, window.P3_CONFIG.chave);
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const brl = v => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const pct = v => `${((Number(v) || 0) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  const data = iso => new Date(iso).toLocaleDateString("pt-BR");
  const kpi = (t, v, s, dest) => `<div class="kpi${dest ? " dest" : ""}"><small>${esc(t)}</small><b>${v}</b><span>${esc(s || "")}</span></div>`;

  async function iniciar() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return location.replace("login.html");
    const r = await sb.rpc("meu_perfil");
    const eu = r.data && r.data[0];
    if (!eu) { await sb.auth.signOut(); return location.replace("login.html"); }
    if (eu.papel === "admin") return location.replace("index.html");
    $("#nome").textContent = eu.nome || eu.email;
    $("#papel").textContent = eu.papel === "dono" ? "Proprietário" : "Cliente";
    $("#titulo").textContent = eu.papel === "dono" ? "Seus extratos de repasse" : "Sua economia com a energia solar";
    if (eu.trocar_senha) abrirSenha(true);

    const pubs = await sb.from("publicacoes").select("id, tipo, de, ate, titulo, resumo, publicado_em").order("ate", { ascending: false }).order("de", { ascending: false });
    if (pubs.error) { $("#lista").innerHTML = `<div class="vazio">Não consegui carregar os relatórios. Tente de novo em instantes.</div>`; return; }
    const lista = pubs.data || [];
    if (!lista.length) { $("#lista").innerHTML = `<div class="vazio">Ainda não há relatórios publicados para você.</div>`; return; }
    const ult = lista[0], z = ult.resumo || {};
    $("#kpis").innerHTML = eu.papel === "dono"
      ? kpi("Líquido do último extrato", brl(z.liquido), ult.titulo.split(" · ")[1], true) + kpi("Arrendamento", brl(z.arrendamento), "no mesmo período") + kpi("Recebido desde o início", brl(z.acumulado), "líquido acumulado")
      : kpi("Economia do último mês", brl(z.economia), `${pct(z.pct)} · ${ult.titulo.split(" · ")[1] || ""}`, true) + kpi("Conta sem a usina", brl(z.copel_sem), "o que pagaria") + kpi("Economia desde o início", brl(z.acumulado), "acumulado com a P3");
    $("#lista").innerHTML = `<div class="lista">${lista.map(p => `<button type="button" data-id="${esc(p.id)}"><b>${esc(p.titulo)}</b><span>${eu.papel === "dono" ? brl((p.resumo || {}).liquido) : brl((p.resumo || {}).economia)} · ${esc(data(p.publicado_em))}</span></button>`).join("")}</div>`;
    document.querySelectorAll("[data-id]").forEach(b => b.onclick = () => abrir(b.dataset.id, b));
  }

  async function abrir(id, botao) {
    document.querySelectorAll("[data-id]").forEach(b => b.classList.toggle("on", b === botao));
    const r = await sb.from("publicacoes").select("titulo, html").eq("id", id).single();
    if (r.error) return alert("Não consegui abrir este relatório.");
    $("#verTitulo").textContent = r.data.titulo;
    $("#quadro").srcdoc = r.data.html;
    $("#ver").hidden = false;
    $("#ver").scrollIntoView({ behavior: "smooth" });
  }

  function abrirSenha(obrigatoria) {
    $("#mSenha").hidden = false;
    $("#sFechar").hidden = !!obrigatoria;
    $("#mSenhaTxt").textContent = obrigatoria ? "Para sua segurança, troque a senha provisória por uma só sua." : "Escolha uma nova senha.";
  }
  $("#fSenha").onsubmit = async e => {
    e.preventDefault();
    const a = $("#s1").value, b = $("#s2").value;
    if (a.length < 10) return ($("#sErro").textContent = "Use pelo menos 10 caracteres.");
    if (a !== b) return ($("#sErro").textContent = "As senhas não são iguais.");
    const r = await sb.auth.updateUser({ password: a });
    if (r.error) return ($("#sErro").textContent = /weak|pwned|leaked/i.test(r.error.message) ? "Essa senha é fraca ou já vazou na internet. Escolha outra." : "Não consegui trocar a senha. Tente outra.");
    await sb.rpc("senha_trocada");
    $("#mSenha").hidden = true; $("#s1").value = $("#s2").value = ""; $("#sErro").textContent = "";
  };
  $("#sFechar").onclick = () => { $("#mSenha").hidden = true; };
  $("#trocar").onclick = () => abrirSenha(false);
  $("#sair").onclick = async () => { await sb.auth.signOut(); location.replace("login.html"); };
  $("#imprimir").onclick = () => { const w = $("#quadro").contentWindow; w.focus(); w.print(); };
  iniciar();
})();
