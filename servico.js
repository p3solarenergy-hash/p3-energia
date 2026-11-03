/*
  Documentos da Copel: ler (sem gravar) e lançar (gravar). A leitura é no navegador, com o mesmo pdf.js e o
  mesmo leitor (copel.js) da versão anterior. O PDF fica guardado no Supabase Storage ao ser lançado.
*/
(function () {
  "use strict";
  const { ucKey, res } = window.P3_BASE;
  const copel = window.P3_COPEL;
  const M = window.P3_MOTOR;
  const BUCKET = "p3";
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const digits = s => String(s || "").replace(/\D/g, "");
  const safeName = s => String(s || "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  const COLS_VAL = ["saldoAnterior", "credRecebido", "energiaInjetada", "energiaAtiva", "creditoUtilizado", "saldoFinal"];
  // O Storage recusa acento nos nomes: na nuvem cada caractere fora da lista vira =HH (reversível).
  const paraChave = p => [...p].map(c => /[A-Za-z0-9 _\-.()/,]/.test(c) ? c : [...new TextEncoder().encode(c)].map(b => "=" + b.toString(16).toUpperCase().padStart(2, "0")).join("")).join("");

  async function extract(bytes) {
    const doc = await window.pdfjsLib.getDocument({ data: bytes.slice(0), verbosity: 0, isEvalSupported: false }).promise;
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      pages.push(tc.items.map(i => i.str).filter(s => s && s.trim()).join("\n"));
    }
    await doc.destroy();
    return pages.join("\n");
  }
  const sha256 = async bytes => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(b => b.toString(16).padStart(2, "0")).join("");

  class Servico {
    constructor(base) { this.base = base; this.sb = base.sb; this.entrada = new Map(); }

    async usinaPorGeradora(numero) {
      const k = ucKey(numero);
      if (!k) return null;
      const r = res(await this.sb.from("usinas").select("*").or(`uc_geradora.eq.${k},uc_geradora_conces.eq.${k}`).limit(1));
      return r[0] || null;
    }
    async clientePorTitular(titular, documento) {
      const doc = digits(documento);
      const todos = await this.base.all("clientes");
      if (doc) { const c = todos.find(c => digits(c.documento) === doc); if (c) return c; }
      const t = norm(titular);
      if (!t) return null;
      return todos.find(c => norm(c.nome) === t) || todos.find(c => norm(c.nome).length > 5 && (t.includes(norm(c.nome)) || norm(c.nome).includes(t))) || null;
    }

    async ler(bytes, nomeOriginal, soLer) {
      const sha = await sha256(bytes);
      if (!soLer) this.entrada.set(sha, { bytes, nome: nomeOriginal });
      const info = { sha, nome: nomeOriginal, tamanho: bytes.length };
      const jaDoc = res(await this.sb.from("documentos").select("id").eq("sha256", sha).maybeSingle());
      let texto;
      try { texto = await extract(bytes); } catch (e) { return { ...info, ok: false, erro: `Não consegui abrir o PDF: ${e.message}` }; }
      if (!texto.trim()) return { ...info, ok: false, erro: "O PDF não tem texto (é imagem escaneada). Baixe a 2ª via no site da Copel." };
      const r = copel.parse(texto);
      if (!r.ok) return { ...info, ok: false, erro: r.erro };
      const out = { ...info, ok: true, tipo: r.campos.tipo, campos: r.campos, avisos: r.avisos, documentoJaArquivado: !!jaDoc };
      Object.assign(out, r.campos.tipo === "fatura" ? await this.casarFatura(r.campos) : await this.casarDemonstrativo(r.campos));
      return out;
    }

    async casarFatura(f) {
      const b = this.base;
      const uc = await b.findUc(f.uc, f.ucConces);
      const out = { uc_id: uc ? uc.id : null, status: "ok" };
      if (uc) {
        out.ucDescricao = uc.descricao || uc.endereco || "";
        out.cliente = uc.cliente_id ? await b.get("clientes", uc.cliente_id) : null;
        out.geradoraDe = uc.usina_geradora_id ? await b.get("usinas", uc.usina_geradora_id) : null;
        const vs = res(await this.sb.from("vinculos").select("percentual, usinas(id, nome)").eq("uc_id", uc.id));
        out.usinas = vs.map(v => ({ id: v.usinas.id, nome: v.usinas.nome, percentual: v.percentual }));
        out.competencia = M.addMonths(f.referencia, uc.defasagem || 0);
        const dup = res(await this.sb.from("faturas").select("id,total,origem").eq("uc_id", uc.id).eq("referencia", f.referencia).maybeSingle());
        if (dup) {
          out.duplicada = dup;
          out.status = Math.abs(Number(dup.total) - f.total) < 0.005 && dup.origem === "pdf" ? "repetida" : "substituir";
        }
        if (!out.usinas.length && !out.geradoraDe && out.status === "ok") out.status = "sem-usina";
        // A fatura diz qual é a geradora; se a UC está vinculada a outra usina, avisa.
        if (f.geradoraConces && out.usinas.length) {
          const ger = await this.usinaPorGeradora(f.geradoraConces);
          if (ger && !out.usinas.some(u => u.id === ger.id)) out.alertaGeradora = `A fatura diz que a geradora é a UC ${f.geradoraConces} (${ger.nome}), mas esta UC está vinculada a ${out.usinas.map(u => u.nome).join(", ")}.`;
        }
      } else {
        out.status = "uc-nova";
        out.competencia = f.referencia;
        const ger = await this.usinaPorGeradora(f.geradoraConces);
        const propria = (await this.usinaPorGeradora(f.uc)) || (await this.usinaPorGeradora(f.ucConces));
        const cli = await this.clientePorTitular(f.titular, f.documento);
        out.sugestao = {
          numero: f.uc || "", numero_conces: f.ucConces || "", descricao: f.endereco || "", endereco: [f.endereco, f.cidade].filter(Boolean).join(" · "),
          cliente_id: cli ? cli.id : null, novoCliente: cli ? null : { nome: f.titular || "", documento: f.documento || "" },
          usina_id: ger ? ger.id : null, usina_geradora_id: propria ? propria.id : null
        };
      }
      return out;
    }

    async casarDemonstrativo(d) {
      const ucs = [];
      for (const u of d.ucs) {
        const uc = await this.base.findUc(u.uc, u.ucConces);
        const usina = u.papel === "geradora" ? ((await this.usinaPorGeradora(u.uc)) || (await this.usinaPorGeradora(u.ucConces))) : null;
        ucs.push({ uc: u.uc, ucConces: u.ucConces, nome: u.nome, papel: u.papel, uc_id: uc ? uc.id : null, usina_id: usina ? usina.id : null, usinaNome: usina ? usina.nome : null, meses: u.meses.filter(m => COLS_VAL.some(c => Number(m[c]))).length });
      }
      return { status: "demonstrativo", demonstrativoUcs: ucs };
    }

    async arquivar(sha, nomeAmigavel, tipo) {
      const ja = res(await this.sb.from("documentos").select("*").eq("sha256", sha).maybeSingle());
      if (ja) return ja;
      const e = this.entrada.get(sha);
      if (!e) throw new Error("O PDF lido não está mais na memória: leia de novo.");
      const ano = (nomeAmigavel.match(/^(\d{4})/) || [, "sem-data"])[1];
      const blob = new Blob([e.bytes], { type: "application/pdf" });
      let caminho = `documentos/${ano}/${safeName(nomeAmigavel)}.pdf`;
      let up = await this.sb.storage.from(BUCKET).upload(paraChave(caminho), blob, { contentType: "application/pdf" });
      if (up.error && /exist|duplicate/i.test(up.error.message || "")) {
        caminho = `documentos/${ano}/${safeName(nomeAmigavel)} ${sha.slice(0, 6)}.pdf`;
        up = await this.sb.storage.from(BUCKET).upload(paraChave(caminho), blob, { contentType: "application/pdf" });
      }
      if (up.error) throw new Error(`Não consegui guardar o PDF: ${up.error.message}`);
      const doc = { id: `dc_${sha.slice(0, 10)}`, sha256: sha, nome_original: e.nome || null, tipo, caminho, tamanho: e.bytes.length, enviado_em: new Date().toISOString() };
      res(await this.sb.from("documentos").insert(doc));
      await this.base.audit("arquivar", "documentos", doc.id, `PDF arquivado: ${doc.caminho}`, null, doc);
      return doc;
    }

    async lancar(itens) {
      const out = [];
      for (const it of itens || []) {
        try {
          const r = it.tipo === "demonstrativo" ? await this.lancarDemonstrativo(it) : await this.lancarFatura(it);
          out.push({ sha: it.sha, ok: true, ...r });
          if (it.sha) this.entrada.delete(it.sha);
        } catch (e) { out.push({ sha: it.sha, ok: false, erro: e.message }); }
      }
      return out;
    }

    async lancarFatura(it) {
      const f = it.campos, b = this.base;
      if (!f || f.tipo !== "fatura") throw new Error("Dados da fatura ausentes.");
      let ucId = it.uc_id;
      if (!ucId && it.novaUc) ucId = (await this.criarUc(it.novaUc, f)).id;
      if (!ucId) throw new Error("Escolha a UC (ou cadastre a nova) antes de lançar.");
      const uc = await b.get("ucs", ucId);
      const cliente = uc.cliente_id ? await b.get("clientes", uc.cliente_id) : null;
      const dono = cliente ? cliente.nome : (uc.usina_geradora_id ? `Geradora ${((await b.get("usinas", uc.usina_geradora_id)) || {}).nome || ""}` : "");
      const dup = res(await this.sb.from("faturas").select("id").eq("uc_id", ucId).eq("referencia", f.referencia).maybeSingle());
      if (dup && !it.substituir) throw new Error(`Já existe fatura desta UC em ${f.referencia}. Marque "substituir" para trocar.`);
      const doc = it.sha ? await this.arquivar(it.sha, `${f.referencia} - UC ${uc.numero || uc.numero_conces} - ${dono || f.titular || ""}`, "fatura") : null;
      const row = {
        uc_id: ucId, referencia: f.referencia, competencia: M.addMonths(f.referencia, uc.defasagem || 0),
        leitura_anterior: f.leituraAnterior, leitura_atual: f.leituraAtual, dias: f.dias, vencimento: f.vencimento, emissao: f.emissao,
        total: f.total, valor_creditos: f.valorCreditos, sem_usina: f.semUsina, consumo_kwh: f.consumoKwh, compensado_kwh: f.compensadoKwh,
        iluminacao_publica: f.iluminacaoPublica, encargos: f.encargos, bandeira_valor: f.bandeiraValor, saldo_creditos_kwh: f.saldoCreditosKwh,
        geradora_conces: f.geradoraConces, nota_fiscal: f.notaFiscal, titular: f.titular, itens: f.itens || [], avisos: it.avisos || [],
        origem: it.sha ? "pdf" : "manual", documento_id: doc ? doc.id : null
      };
      // Completa o cadastro da UC com o número que faltava (a Copel mostra um ou outro conforme a época).
      const comp = {};
      if (f.uc && !uc.numero) comp.numero = f.uc;
      if (f.ucConces && !uc.numero_conces) comp.numero_conces = f.ucConces;
      // E os dados de acesso à Copel, quando ainda estão em branco (nunca troca o que já foi digitado).
      if (f.titular && !uc.titular) comp.titular = f.titular;
      if (f.documento && !uc.titular_documento) comp.titular_documento = f.documento;
      if (f.cidade && !uc.cidade) comp.cidade = f.cidade;
      if (f.endereco && !uc.endereco) comp.endereco = f.endereco;
      if (Object.keys(comp).length) await b.update("ucs", ucId, comp, `UC ${uc.numero || uc.numero_conces}: cadastro completado pela fatura`);
      const fatura = dup ? await b.update("faturas", dup.id, row, `Fatura ${f.referencia} substituída pelo PDF`) : await b.insert("faturas", row);
      return { fatura_id: fatura.id, uc_id: ucId, competencia: fatura.competencia, substituida: !!dup };
    }

    async criarUc(n, f) {
      const b = this.base;
      let clienteId = n.cliente_id || null;
      if (!clienteId && n.novoCliente && n.novoCliente.nome && !n.usina_geradora_id) {
        const ja = await this.clientePorTitular(n.novoCliente.nome, n.novoCliente.documento);
        clienteId = ja ? ja.id : (await b.insert("clientes", { nome: n.novoCliente.nome, documento: n.novoCliente.documento }, `Cliente criado pela fatura: ${n.novoCliente.nome}`)).id;
      }
      const uc = await b.insert("ucs", {
        numero: n.numero || f.uc, numero_conces: n.numero_conces || f.ucConces, cliente_id: n.usina_geradora_id ? null : clienteId,
        usina_geradora_id: n.usina_geradora_id || null, descricao: n.descricao || f.endereco, endereco: n.endereco, defasagem: n.defasagem || 0, ativa: 1
      }, `UC criada pela fatura: ${n.numero || f.uc || f.ucConces}`);
      if (n.usina_id && !n.usina_geradora_id) await b.insert("vinculos", { uc_id: uc.id, usina_id: n.usina_id, percentual: n.percentual || 100 });
      return uc;
    }

    async lancarDemonstrativo(it) {
      const d = it.campos, b = this.base;
      const primeiro = d.ucs.find(u => u.meses.length) || d.ucs[0] || {};
      const ref = (primeiro.meses && primeiro.meses[0] && primeiro.meses[0].referencia) || "sem-data";
      const doc = it.sha ? await this.arquivar(it.sha, `${ref} - Demonstrativo SCEE - UC ${primeiro.uc || primeiro.ucConces || ""}`, "demonstrativo") : null;
      let linhas = 0, geracao = 0;
      for (const u of d.ucs) {
        // O demonstrativo traz os dois números da UC: completa o cadastro (faturas antigas só têm o curto).
        if (u.uc && u.ucConces) {
          const uc = await b.findUc(u.uc, u.ucConces);
          const fill = {};
          if (uc && !uc.numero) fill.numero = u.uc;
          if (uc && !uc.numero_conces) fill.numero_conces = u.ucConces;
          if (Object.keys(fill).length) await b.update("ucs", uc.id, fill, `UC ${u.uc}: número completado pelo demonstrativo`);
          const us = u.papel === "geradora" ? ((await this.usinaPorGeradora(u.uc)) || (await this.usinaPorGeradora(u.ucConces))) : null;
          if (us && (!us.uc_geradora || !us.uc_geradora_conces)) await b.update("usinas", us.id, { uc_geradora: us.uc_geradora || u.uc, uc_geradora_conces: us.uc_geradora_conces || u.ucConces }, `${us.nome}: UC geradora completada pelo demonstrativo`);
        }
        for (const m of u.meses) {
          if (!COLS_VAL.some(c => Number(m[c]))) continue;
          const lista = res(await this.sb.from("scee").select("id,emitido_em,geradora_conces").eq("uc_conces", u.ucConces || u.uc).eq("referencia", m.referencia));
          const cur = lista.find(x => (x.geradora_conces || "") === (u.geradoraConces || ""));
          // Um demonstrativo mais antigo não sobrescreve o que veio de um mais novo.
          if (cur && cur.emitido_em && u.emitidoEm && cur.emitido_em > u.emitidoEm) continue;
          const row = {
            uc: u.uc, uc_conces: u.ucConces || u.uc, papel: u.papel, geradora: u.geradora, geradora_conces: u.geradoraConces || "", referencia: m.referencia,
            saldo_anterior: m.saldoAnterior, cred_recebido: m.credRecebido, energia_injetada: m.energiaInjetada, energia_ativa: m.energiaAtiva,
            credito_utilizado: m.creditoUtilizado, percentual: m.percentual, saldo_final: m.saldoFinal, documento_id: doc ? doc.id : null, emitido_em: u.emitidoEm
          };
          // Geradora_conces "" fica como texto vazio, igual à versão anterior.
          if (cur) res(await this.sb.from("scee").update({ ...row, atualizado_em: new Date().toISOString() }).eq("id", cur.id));
          else res(await this.sb.from("scee").insert({ ...row, id: `sc_${crypto.randomUUID().slice(0, 10)}`, criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }));
          linhas++;
          // Geração da usina = energia injetada da UC geradora no mês.
          if (u.papel === "geradora" && Number(m.energiaInjetada) > 0) {
            const usina = (await this.usinaPorGeradora(u.uc)) || (await this.usinaPorGeradora(u.ucConces));
            if (usina) { await b.upsertUsinaMes(usina.id, m.referencia, { geracao_kwh: m.energiaInjetada }); geracao++; }
          }
        }
      }
      if (doc) await b.audit("alterar", "scee", null, `Demonstrativo SCEE lançado: ${linhas} linha(s)`);
      return { linhas, geracao };
    }

    async baixarDocumento(id) {
      const doc = res(await this.sb.from("documentos").select("*").eq("id", id).maybeSingle());
      if (!doc) return null;
      const rel = String(doc.caminho).replace(/\\/g, "/"); // a base veio do Windows com caminhos em "\"
      const r = await this.sb.storage.from(BUCKET).download(paraChave(rel));
      if (r.error) return null;
      return { blob: r.data, nome: rel.split("/").pop() };
    }

    // Lê de novo todos os PDFs arquivados e compara com o que está gravado (auditoria da leitura).
    async conferirArquivo() {
      const out = [];
      const faturas = (await this.base.all("faturas")).filter(f => f.documento_id);
      for (const f of faturas) {
        const d = await this.baixarDocumento(f.documento_id);
        if (!d) { out.push({ fatura_id: f.id, problema: "PDF arquivado não encontrado." }); continue; }
        const r = copel.parse(await extract(new Uint8Array(await d.blob.arrayBuffer())));
        if (!r.ok) { out.push({ fatura_id: f.id, problema: r.erro }); continue; }
        const c = r.campos, dif = [];
        if (Math.abs(c.total - f.total) > 0.005) dif.push(`total ${f.total} × PDF ${c.total}`);
        if (Math.abs(c.valorCreditos - f.valor_creditos) > 0.005) dif.push(`créditos ${f.valor_creditos} × PDF ${c.valorCreditos}`);
        if (c.referencia !== f.referencia) dif.push(`referência ${f.referencia} × PDF ${c.referencia}`);
        if (Math.round(c.compensadoKwh) !== Math.round(f.compensado_kwh)) dif.push(`kWh compensado ${f.compensado_kwh} × PDF ${c.compensadoKwh}`);
        if (dif.length) out.push({ fatura_id: f.id, problema: `Diferente do PDF: ${dif.join("; ")}` });
      }
      return { conferidas: faturas.length, problemas: out };
    }
  }
  window.P3_SERVICO = { Servico, paraChave };
})();
