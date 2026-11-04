/*
  No lugar de um servidor: as telas continuam chamando fetch("/api/..."), e aqui cada rota é atendida
  no navegador, direto no Supabase. Sem sessão válida, responde 401 e a tela manda para o login.
*/
(function () {
  "use strict";
  const { Base } = window.P3_BASE;
  const { Servico } = window.P3_SERVICO;
  const sb = window.supabase.createClient(window.P3_CONFIG.url, window.P3_CONFIG.chave);
  const base = new Base(sb), servico = new Servico(base);
  const R = window.P3_RELATORIOS, F = window.P3_FINANCEIRO, C = window.P3_CONFERENCIA;
  const CRUD = new Set(["donos", "clientes", "usinas", "ucs", "vinculos", "faturas", "usina_mes", "projecoes", "custos", "custos_fixos"]);
  const COPIAS = "copias", BUCKET = "p3", MANTER_COPIAS = 30, SEIS_HORAS = 6 * 3600 * 1000;
  const r2 = window.P3_MOTOR.r2;
  const num = v => { const s = String(v).trim(); return Number(/,/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s); };
  const hoje = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const prontos = new Map(); // relatórios prontos para imprimir: nome → HTML

  // A gestão é só da P3. Dono e cliente vão para o portal; sem perfil, volta ao login.
  // (As regras do banco já bloqueiam os dados; isto só leva cada um para a tela certa.)
  sb.rpc("meu_perfil").then(r => {
    const p = (r.data && r.data[0]) || null;
    if (!p) location.replace("login.html"); else if (p.papel !== "admin") location.replace("portal.html");
  });

  async function garantirUcGeradora(u) {
    if (!u.uc_geradora && !u.uc_geradora_conces) return;
    const uc = await base.findUc(u.uc_geradora, u.uc_geradora_conces);
    if (!uc) await base.insert("ucs", { numero: u.uc_geradora || null, numero_conces: u.uc_geradora_conces || null, usina_geradora_id: u.id, descricao: `Geradora · ${u.nome}`, ativa: 1 }, `UC geradora da ${u.nome}`);
    else if (uc.usina_geradora_id !== u.id && !uc.cliente_id) await base.update("ucs", uc.id, { usina_geradora_id: u.id });
  }

  const htmlDe = async (tipo, q) => tipo === "projecao" ? R.projecao(await base.get("projecoes", q.id)) : R.render(await base.snapshot(), tipo, q);
  const nomeDe = async (tipo, q) => {
    if (tipo !== "projecao") return R.nomeArquivo(await base.snapshot(), tipo, q);
    const pj = (await base.get("projecoes", q.id)) || {};
    return `Projecao - ${String(pj.cliente || pj.nome || "").replace(/[\\/:*?"<>|]+/g, " ").trim()}.pdf`;
  };

  async function fazerCopia(motivo) {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
    const nome = `p3-${stamp}-${motivo}.json`;
    const blob = new Blob([JSON.stringify(await base.exportar())], { type: "application/json" });
    const r = await sb.storage.from(BUCKET).upload(`${COPIAS}/${nome}`, blob, { contentType: "application/json" });
    if (r.error) throw new Error(`Não consegui guardar a cópia: ${r.error.message}`);
    return nome;
  }
  const listarCopias = async () => {
    const r = await sb.storage.from(BUCKET).list(COPIAS, { limit: 1000, sortBy: { column: "name", order: "desc" } });
    if (r.error) throw new Error(r.error.message);
    return r.data.filter(x => x.name.endsWith(".json")).map(x => ({ nome: x.name, tamanho: (x.metadata && x.metadata.size) || 0, em: x.created_at }));
  };
  // Cópia automática a cada 6 horas de uso, mantendo as mais recentes (as manuais ficam).
  async function copiaAutomatica() {
    const lista = await listarCopias();
    const ultima = lista.find(x => !x.nome.endsWith("-manual.json"));
    if (ultima && Date.now() - new Date(ultima.em).getTime() < SEIS_HORAS) return;
    await fazerCopia("periodico");
    const velhas = lista.filter(x => !x.nome.endsWith("-manual.json")).slice(MANTER_COPIAS - 1).map(x => `${COPIAS}/${x.nome}`);
    if (velhas.length) await sb.storage.from(BUCKET).remove(velhas);
  }

  async function atender(m, p, q, corpo, blob, cab) {
    if (m === "GET" && p[0] === "estado") {
      const estado = await base.snapshot();
      copiaAutomatica().catch(e => console.error("Cópia automática falhou:", e.message));
      return { ...estado, hoje: hoje() };
    }
    if (m === "GET" && p[0] === "info") return { pastas: { dados: "nuvem (Supabase)", backups: "nuvem (Supabase)" }, navegadorPdf: "navegador" };
    if (m === "GET" && p[0] === "conferencia") return C.conferir(await base.snapshot(), hoje());
    if (m === "GET" && p[0] === "auditoria") return base.auditoria(q.limit);
    if (m === "GET" && p[0] === "geracao-local") {
      const perdas = Number(q.perdas) || 14;
      const r = await sb.functions.invoke("geracao-local", { body: { local: q.local, perdas } });
      if (r.error) throw new Error("Não consegui calcular a geração deste local agora.");
      if (r.data.erro) throw new Error(r.data.erro);
      return r.data;
    }
    if (m === "POST" && p[0] === "ler-pdf") {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (!bytes.length) throw new Error("Arquivo vazio.");
      return servico.ler(bytes, decodeURIComponent(cab["X-Nome"] || "fatura.pdf"), cab["X-So-Ler"] === "1");
    }
    if (m === "POST" && p[0] === "lancar") return { resultados: await servico.lancar(corpo.itens || []) };
    if (m === "POST" && p[0] === "conferir-arquivo") return servico.conferirArquivo();
    if (m === "PUT" && p[0] === "fechamento") {
      const { usina_id, competencia, ...dados } = corpo;
      if (!usina_id || !competencia) throw new Error("Informe a usina e a competência.");
      return base.upsertUsinaMes(usina_id, competencia, dados);
    }
    if (m === "POST" && p[0] === "custos" && p[1] === "gerar") {
      const novos = F.gerarDoMes(await base.all("custos_fixos"), await base.all("custos"), corpo.competencia);
      for (const c of novos) await base.insert("custos", c);
      return { criados: novos.length };
    }
    if (m === "PUT" && p[0] === "config") {
      for (const [k, v] of Object.entries(corpo)) if (["usuario", "empresa"].includes(k)) { await base.setConfig(k, v); if (k === "usuario") base.usuario = v || "P3"; }
      await base.audit("alterar", "config", null, `Configuração: ${Object.keys(corpo).join(", ")}`, null, corpo);
      return { ok: true };
    }
    if (p[0] === "backups") {
      if (m === "GET") return listarCopias();
      if (m === "POST" && !p[1]) { const nome = await fazerCopia("manual"); await base.audit("backup", null, null, `Backup manual: ${nome}`); return { nome }; }
      if (m === "POST" && p[1] === "restaurar") {
        const r = await sb.storage.from(BUCKET).download(`${COPIAS}/${corpo.nome}`);
        if (r.error) throw new Error("Backup não encontrado.");
        const dados = JSON.parse(await r.data.text());
        const antes = await fazerCopia("antes-de-restaurar");
        await base.restaurar(dados);
        await base.audit("restaurar", null, null, `Base restaurada do backup ${corpo.nome}. A base anterior foi guardada em ${antes}.`);
        return { ok: true, anterior: antes };
      }
    }
    if (m === "POST" && p[0] === "relatorio" && p[1] === "pdf") {
      const { tipo, ...d } = corpo;
      const nome = await nomeDe(tipo, d);
      prontos.set(nome, await htmlDe(tipo, d));
      await base.audit("relatorio", null, null, `PDF gerado: ${nome}`, null, { tipo, ...d });
      return { nome, caminho: nome };
    }
    // Publica o relatório no portal do cliente/dono (substitui o mesmo período, se já publicado).
    if (m === "POST" && p[0] === "publicar") {
      const { tipo, ...d } = corpo;
      if (!["cliente", "dono"].includes(tipo)) throw new Error("Só extratos de cliente e de dono vão para o portal.");
      const db = await base.snapshot();
      const html = R.render(db, tipo, d);
      const alvo = tipo === "cliente" ? (db.clientes.find(c => c.id === d.cliente_id) || {}).nome : (db.donos.find(x => x.id === d.dono_id) || {}).nome;
      const titulo = `${tipo === "cliente" ? "Relatório de economia" : "Extrato do proprietário"} · ${d.de === d.ate ? window.P3_MOTOR.monthLong(d.de) : `${window.P3_MOTOR.monthLong(d.de)} a ${window.P3_MOTOR.monthLong(d.ate)}`}`;
      const linha = { tipo, cliente_id: tipo === "cliente" ? d.cliente_id : null, dono_id: tipo === "dono" ? d.dono_id : null, de: d.de, ate: d.ate, titulo, html, resumo: R.resumo(db, tipo, d), publicado_em: new Date().toISOString() };
      const r = await sb.from("publicacoes").upsert(linha, { onConflict: "tipo,cliente_id,dono_id,de,ate" }).select("id").single();
      if (r.error) throw new Error(`Não consegui publicar: ${r.error.message}`);
      await base.audit("publicar", "publicacoes", r.data.id, `Publicado no portal: ${titulo} · ${alvo || ""}`);
      return { id: r.data.id, titulo };
    }
    if (p[0] === "publicacoes") {
      if (m === "GET") { const r = await sb.from("publicacoes").select("id, tipo, cliente_id, dono_id, de, ate, titulo, publicado_em").order("publicado_em", { ascending: false }); if (r.error) throw r.error; return r.data; }
      if (m === "DELETE" && p[1]) { const r = await sb.from("publicacoes").delete().eq("id", p[1]); if (r.error) throw r.error; await base.audit("excluir", "publicacoes", p[1], "Relatório retirado do portal"); return { ok: true }; }
    }
    // Logins de donos e clientes: tudo passa pela função "acessos", que confere se quem pede é admin.
    if (m === "POST" && p[0] === "acessos") {
      const r = await sb.functions.invoke("acessos", { body: corpo });
      if (r.error) { let msg = r.error.message; try { msg = (await r.error.context.json()).erro || msg; } catch (_) { } throw new Error(msg); }
      return r.data;
    }
    if (m === "POST" && p[0] === "abrir-pasta") throw new Error("Na versão online não há pasta para abrir: os PDFs e os backups ficam guardados na nuvem.");
    if (CRUD.has(p[0])) {
      const t = p[0], id = p[1];
      if (m === "GET" && !id) return base.all(t);
      if (m === "GET") { const r = await base.get(t, id); if (!r) throw new Error("Não encontrado."); return r; }
      if (m === "POST" && !id) {
        const b = { ...corpo };
        if (t === "faturas" && !b.competencia && b.uc_id && b.referencia) { const uc = await base.get("ucs", b.uc_id); b.competencia = window.P3_MOTOR.addMonths(b.referencia, (uc && uc.defasagem) || 0); }
        if (t === "faturas" && b.total != null && b.valor_creditos != null) b.sem_usina = r2(num(b.total) + num(b.valor_creditos));
        if (t === "faturas" && !b.origem) b.origem = "manual";
        const r = await base.insert(t, b);
        if (t === "usinas") await garantirUcGeradora(r);
        return r;
      }
      if (m === "PUT" && id) {
        const b = { ...corpo };
        if (t === "faturas" && (b.total != null || b.valor_creditos != null)) {
          const cur = await base.get("faturas", id);
          b.sem_usina = r2(num(b.total != null ? b.total : cur.total) + num(b.valor_creditos != null ? b.valor_creditos : cur.valor_creditos));
        }
        const r = await base.update(t, id, b);
        if (t === "usinas") await garantirUcGeradora(r);
        return r;
      }
      if (m === "DELETE" && id) return base.remove(t, id);
    }
    throw new Error("Rota não encontrada.");
  }

  const resposta = (status, dados) => ({ status, ok: status < 400, headers: { get: () => "application/json" }, json: async () => dados, text: async () => JSON.stringify(dados) });
  const original = window.fetch.bind(window);
  window.fetch = async (url, o = {}) => {
    if (typeof url !== "string" || !url.startsWith("/api/")) return original(url, o);
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return resposta(401, { erro: "Entre com a senha." });
    const [c, qs] = url.replace(/^\/api\//, "").split("?");
    try {
      const corpo = o.body && !(o.body instanceof Blob) ? JSON.parse(o.body) : undefined;
      return resposta(200, await atender(o.method || "GET", c.split("/").map(decodeURIComponent), Object.fromEntries(new URLSearchParams(qs || "")), corpo, o.body instanceof Blob ? o.body : null, o.headers || {}));
    } catch (e) {
      console.error(e);
      return resposta(e.sessao ? 401 : 400, { erro: e.message || String(e) });
    }
  };

  // PDF: o navegador imprime o relatório; em "Destino", escolha "Salvar como PDF".
  window.P3_IMPRIMIR = nome => {
    const html = prontos.get(nome);
    if (!html) { if (window.P3) window.P3.toast("Gere o PDF de novo.", "bad"); return; }
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;width:0;height:0;border:0;left:-9999px";
    f.onload = () => { const titulo = document.title; document.title = nome.replace(/\.pdf$/i, ""); f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => { document.title = titulo; f.remove(); }, 60000); };
    f.srcdoc = html.replace(/<title>[^<]*<\/title>/, `<title>${nome.replace(/\.pdf$/i, "").replace(/[<&]/g, "")}</title>`);
    document.body.appendChild(f);
  };

  document.addEventListener("click", async e => {
    const a = e.target.closest && e.target.closest("a[href^='/api/'], a#sair");
    if (!a) return;
    e.preventDefault();
    if (a.id === "sair") { await sb.auth.signOut(); location.href = "login.html"; return; }
    const url = new URL(a.getAttribute("href"), location.href);
    if (url.pathname.startsWith("/api/relatorio/arquivo")) return window.P3_IMPRIMIR(url.searchParams.get("caminho"));
    const id = decodeURIComponent(url.pathname.split("/").pop());
    const d = await servico.baixarDocumento(id);
    if (!d) return window.P3 && window.P3.toast("PDF não encontrado.", "bad");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(d.blob);
    link.download = d.nome;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 60000);
  });

  // Prévia dos relatórios: a tela pede /relatorio/tipo?...; aqui o HTML é montado no navegador.
  const previas = () => document.querySelectorAll("iframe.preview[src^='/relatorio/']").forEach(async f => {
    const [c, qs] = f.getAttribute("src").split("?");
    f.removeAttribute("src");
    const q = Object.fromEntries(new URLSearchParams(qs || ""));
    if (q.anonimo) q.anonimo = q.anonimo === "1" || q.anonimo === "true";
    try { f.srcdoc = await htmlDe(c.split("/")[2], q); }
    catch (e) { f.srcdoc = `<p style="font-family:sans-serif;padding:20px">${String(e.message).replace(/</g, "&lt;")}</p>`; }
  });
  new MutationObserver(previas).observe(document.documentElement, { childList: true, subtree: true });
})();
