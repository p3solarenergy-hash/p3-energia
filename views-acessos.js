// Acessos: logins dos donos e clientes ao portal, e os relatórios publicados para cada um.
(function () {
  "use strict";
  const { esc, $, $$, api, toast, opts, modal, confirmar, formData, db, badge } = window.P3;
  const quando = iso => iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "nunca";
  const endereco = () => `${location.origin}${location.pathname.replace(/[^/]*$/, "")}login.html`;

  // A senha provisória só aparece aqui, uma vez.
  function mostrarSenha(email, senha) {
    modal("Senha provisória", `<p>Envie estes dados para a pessoa por um canal seguro (WhatsApp direto, por exemplo). <b>A senha aparece só agora</b>; no primeiro acesso ela vai ter que criar a própria.</p>
      <div class="card" style="font-size:15px;margin:0"><div>Endereço: <b class="mono">${esc(endereco())}</b></div><div>E-mail: <b class="mono">${esc(email)}</b></div><div>Senha provisória: <b class="mono">${esc(senha)}</b></div></div>
      <button class="btn sm" id="copiarAcesso" style="margin-top:10px">Copiar os três</button>`);
    $("#copiarAcesso").onclick = async () => {
      try { await navigator.clipboard.writeText(`Portal P3 Energy\n${endereco()}\nE-mail: ${email}\nSenha provisória: ${senha}`); toast("Copiado.", "ok"); } catch (_) { toast("Não consegui copiar.", "bad"); }
    };
  }

  async function render(main) {
    main.innerHTML = `<div class="head"><div><p class="kicker">Controle</p><h1>Acessos</h1><p>Logins dos donos e clientes ao portal. Eles só veem os relatórios que você publicar para eles, nada mais da base.</p></div>
      <div class="actions"><button class="btn primary" id="novo">+ Novo acesso</button></div></div><div class="card" id="corpoAcessos"><p class="muted">Carregando…</p></div>`;
    $("#novo").onclick = () => novo(main);
    let logins, pubs;
    try { [logins, pubs] = await Promise.all([api("acessos", { method: "POST", body: { acao: "listar" } }), api("publicacoes")]); }
    catch (e) { if ($("#corpoAcessos")) $("#corpoAcessos").innerHTML = `<div class="note bad">${esc(e.message)}</div>`; return; }
    if (!$("#corpoAcessos")) return; // saiu da tela enquanto carregava
    const D = db();
    const nomeDe = x => x.dono_id ? (D.by.donos.get(x.dono_id) || {}).nome : (D.by.clientes.get(x.cliente_id) || {}).nome;
    $("#corpoAcessos").outerHTML = `
      <div class="card"><h2>Logins</h2>
      ${logins.length ? `<div class="table-wrap" style="box-shadow:none"><table><thead><tr><th>Pessoa</th><th>Tipo</th><th>E-mail</th><th>Último acesso</th><th>Situação</th><th></th></tr></thead><tbody>
      ${logins.map(l => `<tr><td><b>${esc(nomeDe(l) || l.nome || "—")}</b></td><td>${l.papel === "dono" ? "Dono" : "Cliente"}</td><td class="mono">${esc(l.email)}</td><td>${esc(quando(l.ultimo_acesso))}${l.trocar_senha ? `<small>ainda com a senha provisória</small>` : ""}</td>
        <td>${l.ativo ? badge("Ativo", "ok") : badge("Desativado", "bad")}</td>
        <td class="right"><button class="btn ghost sm" data-a="nova_senha" data-u="${esc(l.user_id)}">Nova senha</button><button class="btn ghost sm" data-a="${l.ativo ? "desativar" : "reativar"}" data-u="${esc(l.user_id)}">${l.ativo ? "Desativar" : "Reativar"}</button><button class="btn ghost sm" data-a="excluir" data-u="${esc(l.user_id)}">Excluir</button></td></tr>`).join("")}
      </tbody></table></div>` : `<p class="muted" style="margin:0">Nenhum login ainda. Use <b>+ Novo acesso</b> quando quiser liberar o portal para um dono ou cliente.</p>`}</div>
      <div class="card"><h2>Relatórios publicados no portal</h2><p class="sub">Publique pela tela <a href="#/relatorios">Relatórios</a>, no botão <b>Publicar no portal</b>.</p>
      ${pubs.length ? `<div class="table-wrap" style="box-shadow:none"><table><thead><tr><th>Para</th><th>Relatório</th><th>Publicado em</th><th></th></tr></thead><tbody>
      ${pubs.map(p => `<tr><td><b>${esc(nomeDe(p) || "—")}</b><small>${p.tipo === "dono" ? "Dono" : "Cliente"}</small></td><td>${esc(p.titulo)}</td><td>${esc(quando(p.publicado_em))}</td><td class="right"><button class="btn ghost sm" data-retirar="${esc(p.id)}">Retirar</button></td></tr>`).join("")}
      </tbody></table></div>` : `<p class="muted" style="margin:0">Nada publicado ainda.</p>`}</div>`;

    const textos = {
      nova_senha: ["Gerar nova senha", e => `A senha atual de ${e} deixa de valer e é criada uma provisória.`],
      desativar: ["Desativar acesso", e => `${e} não consegue mais entrar até ser reativado.`],
      reativar: ["Reativar acesso", e => `${e} volta a entrar com a senha que já tinha.`],
      excluir: ["Excluir login", e => `O login de ${e} é apagado. Os relatórios publicados continuam guardados.`]
    };
    $$("[data-a]", main).forEach(b => b.onclick = async () => {
      const acao = b.dataset.a, l = logins.find(x => x.user_id === b.dataset.u);
      if (!await confirmar(textos[acao][0], esc(textos[acao][1](l.email)), textos[acao][0])) return;
      try {
        const r = await api("acessos", { method: "POST", body: { acao, user_id: l.user_id } });
        await render(main);
        if (r.senha) mostrarSenha(r.email, r.senha); else toast("Feito.", "ok");
      } catch (e) { toast(e.message, "bad"); }
    });
    $$("[data-retirar]", main).forEach(b => b.onclick = async () => {
      if (!await confirmar("Retirar do portal", "O relatório deixa de aparecer para a pessoa. Você pode publicar de novo quando quiser.", "Retirar")) return;
      try { await api(`publicacoes/${encodeURIComponent(b.dataset.retirar)}`, { method: "DELETE" }); toast("Retirado.", "ok"); render(main); } catch (e) { toast(e.message, "bad"); }
    });
  }

  async function novo(main) {
    const D = db();
    const html = `<div class="grid-form">
      <label class="f">Tipo<select name="papel" id="aPapel">${opts([["cliente", "Cliente (quem arrenda)"], ["dono", "Dono de usina"]], "cliente")}</select></label>
      <label class="f">Quem<select name="alvo" id="aAlvo"></select></label>
      <label class="f wide">E-mail de acesso<input name="email" type="email" autocomplete="off" placeholder="pessoa@empresa.com.br"></label></div>
      <p class="muted" style="font-size:12.5px">A pessoa recebe uma senha provisória e cria a dela no primeiro acesso. Ela só vê os relatórios que você publicar para ela.</p>`;
    let criado = null;
    const p = modal("Novo acesso ao portal", html, {
      saveLabel: "Criar acesso",
      onSave: async bg => {
        const d = formData(bg);
        if (!d.alvo) throw new Error("Escolha quem vai receber o acesso.");
        criado = await api("acessos", { method: "POST", body: { acao: "criar", email: d.email, papel: d.papel, [d.papel === "dono" ? "dono_id" : "cliente_id"]: d.alvo } });
      }
    });
    const encher = () => { const dono = $("#aPapel").value === "dono"; $("#aAlvo").innerHTML = opts((dono ? D.donos : D.clientes).map(x => [x.id, x.nome]), "", "Escolha…"); };
    $("#aPapel").onchange = encher; encher();
    if (await p && criado) { await render(main); mostrarSenha(criado.email, criado.senha); }
  }

  window.P3.register("acessos", { render });
})();
