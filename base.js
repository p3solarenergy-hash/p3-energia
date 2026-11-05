/*
  Base da P3 no Supabase (tabelas de verdade), usada direto pelo navegador. Tudo que muda passa por aqui
  e fica registrado na auditoria com o antes e o depois. Quem pode ler e gravar é decidido no banco
  (só e-mails da tabela "autorizados"); as validações daqui são as mesmas da versão anterior.
*/
(function () {
  "use strict";
  const TABLES = {
    donos: { prefix: "do", fields: ["nome", "documento", "email", "telefone", "pix", "obs"], required: ["nome"] },
    clientes: { prefix: "cl", fields: ["nome", "documento", "email", "telefone", "obs"], required: ["nome"] },
    usinas: { prefix: "us", required: ["nome"], fields: ["nome", "dono_id", "uc_geradora", "uc_geradora_conces", "potencia_kwp", "cidade", "valor_investido", "arrendamento_mensal", "gestao_modo", "gestao_pct", "gestao_valor", "rateio_modo", "geradora_paga_por", "arrendamento_recebe", "inicio_operacao", "fim_operacao", "status", "obs"] },
    custos_fixos: { prefix: "cf", required: ["descricao"], fields: ["usina_id", "descricao", "categoria", "valor", "dia_vencimento", "pago_por", "reembolso", "inicio", "fim", "ativo", "obs"] },
    custos: { prefix: "ct", required: ["competencia", "descricao", "valor"], fields: ["usina_id", "competencia", "descricao", "categoria", "valor", "vencimento", "pago_por", "reembolso", "status", "pago_em", "reembolso_status", "reembolsado_em", "fixo_id", "obs"] },
    ucs: { prefix: "uc", fields: ["numero", "numero_conces", "cliente_id", "usina_geradora_id", "descricao", "endereco", "cidade", "defasagem", "ativa", "titular", "titular_documento", "copel_login", "obs"], required: [] },
    vinculos: { prefix: "vi", fields: ["uc_id", "usina_id", "percentual"], required: ["uc_id", "usina_id"] },
    faturas: { prefix: "fa", required: ["uc_id", "referencia"], json: ["itens", "avisos"], fields: ["uc_id", "referencia", "competencia", "leitura_anterior", "leitura_atual", "dias", "vencimento", "emissao", "total", "valor_creditos", "sem_usina", "consumo_kwh", "compensado_kwh", "iluminacao_publica", "encargos", "bandeira_valor", "saldo_creditos_kwh", "geradora_conces", "nota_fiscal", "titular", "itens", "avisos", "origem", "documento_id", "obs"] },
    usina_mes: { prefix: "um", required: ["usina_id", "competencia"], json: ["custos"], fields: ["usina_id", "competencia", "arrendamento", "gestao_modo", "gestao_pct", "gestao_valor", "custos", "status", "geracao_kwh", "obs"] },
    projecoes: { prefix: "pj", fields: ["nome", "cliente", "params", "contas", "resumo", "obs"], required: ["nome"], json: ["params", "contas", "resumo"] },
    obras: { prefix: "ob", required: ["nome"], json: ["itens", "lancamentos"], fields: ["nome", "contratante", "tipo", "cidade", "vendedor", "status", "data_inicio", "data_fim", "kwp", "carregadores_dc", "carregadores_ac", "potencia_kw", "modo", "venda", "custo", "custo_material", "custo_mao_obra", "custo_outros", "imposto_pct", "admin_pct", "gestao_pct", "desconto", "valor_contratado", "itens", "lancamentos", "origem", "obs"] },
    nf_regras: { prefix: "nr", required: ["usina_id"], fields: ["usina_id", "descricao", "emitente", "tomador", "dia", "valor_padrao", "custo_pct", "repasse", "ativo", "obs"] },
    notas_fiscais: { prefix: "nf", required: ["usina_id", "competencia"], fields: ["regra_id", "usina_id", "competencia", "emitente", "tomador", "numero", "data_emissao", "valor", "custo_pct", "gestao_valor", "repasse_valor", "repasse_status", "repasse_em", "arquivo", "status", "obs"] },
    scee: { prefix: "sc", required: ["referencia"], fields: ["uc", "uc_conces", "papel", "geradora", "geradora_conces", "referencia", "saldo_anterior", "cred_recebido", "energia_injetada", "energia_ativa", "credito_utilizado", "percentual", "saldo_final", "documento_id", "emitido_em"] }
  };
  const NUMERIC = new Set(["potencia_kwp", "valor_investido", "arrendamento_mensal", "gestao_pct", "gestao_valor", "defasagem", "ativa", "percentual", "dias", "total", "valor_creditos", "sem_usina", "consumo_kwh", "compensado_kwh", "iluminacao_publica", "encargos", "bandeira_valor", "saldo_creditos_kwh", "arrendamento", "geracao_kwh", "saldo_anterior", "cred_recebido", "energia_injetada", "energia_ativa", "credito_utilizado", "saldo_final", "valor", "dia_vencimento", "kwp", "carregadores_dc", "carregadores_ac", "potencia_kw", "venda", "custo", "custo_material", "custo_mao_obra", "custo_outros", "imposto_pct", "admin_pct", "gestao_pct", "desconto", "valor_contratado", "dia", "valor_padrao", "repasse", "repasse_valor", "custo_pct"]);
  const TODAS = ["config", "donos", "clientes", "usinas", "ucs", "vinculos", "documentos", "faturas", "usina_mes", "scee", "projecoes", "custos_fixos", "custos", "obras", "nf_regras", "notas_fiscais"];

  const now = () => new Date().toISOString();
  const newId = prefix => `${prefix}_${[...crypto.getRandomValues(new Uint8Array(5))].map(b => b.toString(16).padStart(2, "0")).join("")}`;
  const ucKey = s => String(s || "").replace(/\D/g, "").replace(/^0+/, "");
  const toNumber = v => {
    if (typeof v === "number") return v;
    const s = String(v).trim();
    return Number(/,/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s);
  };
  const mes = v => !v || /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
  // Mensagem do banco em português para os casos que a tela pode provocar.
  const res = r => {
    if (!r.error) return r.data;
    const m = r.error.message || "";
    if (/row-level security|permission denied/i.test(m)) throw new Error("Seu usuário não tem acesso a esta base.");
    if (/JWT|session/i.test(m)) { const e = new Error("Sessão encerrada: entre de novo."); e.sessao = true; throw e; }
    throw new Error(m);
  };

  class Base {
    constructor(sb) { this.sb = sb; this.usuario = "P3"; }

    async all(table) {
      const out = [];
      for (let de = 0; ; de += 1000) {
        const linhas = res(await this.sb.from(table).select("*").order(table === "config" ? "chave" : "id").range(de, de + 999));
        out.push(...linhas);
        if (linhas.length < 1000) break;
      }
      return out.map(r => this.decode(table, r));
    }
    decode(table, row) {
      if (!row) return row;
      const out = { ...row };
      for (const k of (TABLES[table] && TABLES[table].json) || []) if (out[k] == null) out[k] = [];
      return out;
    }
    async get(table, id) { return this.decode(table, res(await this.sb.from(table).select("*").eq("id", id).maybeSingle())); }
    async getConfig(k) { const r = res(await this.sb.from("config").select("valor").eq("chave", k).maybeSingle()); return r ? r.valor : null; }
    async setConfig(k, v) { res(await this.sb.from("config").upsert({ chave: k, valor: v == null ? null : String(v) })); }

    clean(table, data, partial) {
      const spec = TABLES[table];
      if (!spec) throw new Error(`Tabela desconhecida: ${table}`);
      const out = {};
      for (const f of spec.fields) {
        if (!(f in data)) continue;
        let v = data[f];
        if (v === "" || v === undefined) v = null;
        if (v !== null && NUMERIC.has(f)) {
          const num = toNumber(v);
          if (!Number.isFinite(num)) throw new Error(`Valor inválido em "${f}".`);
          v = num;
        }
        if (typeof v === "string") v = v.trim();
        out[f] = v;
      }
      if (!partial) for (const r of spec.required) if (out[r] == null || out[r] === "") throw new Error(`Preencha "${r}".`);
      if (table === "ucs" || table === "usinas") for (const f of ["numero", "numero_conces", "uc_geradora", "uc_geradora_conces"]) if (out[f]) out[f] = ucKey(out[f]);
      return out;
    }

    async audit(acao, tabela, id, resumo, antes, depois) {
      res(await this.sb.from("auditoria").insert({ em: now(), acao, tabela: tabela || null, registro_id: id || null, resumo: resumo || null, antes: antes || null, depois: depois || null, usuario: this.usuario }));
    }

    async insert(table, data, resumo) {
      const row = this.clean(table, data, false);
      row.id = data.id || newId(TABLES[table].prefix);
      row.criado_em = row.atualizado_em = now();
      await this.validate(table, row);
      const depois = this.decode(table, res(await this.sb.from(table).insert(row).select().single()));
      await this.audit("criar", table, row.id, resumo || await this.label(table, depois), null, depois);
      return depois;
    }

    async update(table, id, data, resumo) {
      const antes = await this.get(table, id);
      if (!antes) throw new Error("Registro não encontrado.");
      const row = this.clean(table, data, true);
      const igual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
      const mudou = Object.keys(row).filter(k => !igual(row[k], antes[k]));
      if (!mudou.length) return antes;
      const set = { atualizado_em: now() };
      mudou.forEach(k => { set[k] = row[k]; });
      await this.validate(table, { ...antes, ...set });
      const depois = this.decode(table, res(await this.sb.from(table).update(set).eq("id", id).select().single()));
      await this.audit("alterar", table, id, resumo || `${await this.label(table, depois)} · ${mudou.join(", ")}`, antes, depois);
      // Mudar a defasagem da UC recalcula a competência das faturas dela.
      if (table === "ucs" && Number(antes.defasagem || 0) !== Number(depois.defasagem || 0)) {
        for (const f of res(await this.sb.from("faturas").select("id,referencia,competencia").eq("uc_id", id))) {
          const comp = window.P3_MOTOR.addMonths(f.referencia, depois.defasagem || 0);
          if (comp !== f.competencia) await this.update("faturas", f.id, { competencia: comp }, `Competência ${f.competencia} → ${comp} (defasagem da UC)`);
        }
      }
      return depois;
    }

    async remove(table, id, resumo) {
      const antes = await this.get(table, id);
      if (!antes) throw new Error("Registro não encontrado.");
      const deps = {
        donos: [["usinas", "dono_id"]], clientes: [["ucs", "cliente_id"]],
        usinas: [["vinculos", "usina_id"], ["usina_mes", "usina_id"], ["ucs", "usina_geradora_id"], ["custos", "usina_id"], ["custos_fixos", "usina_id"], ["nf_regras", "usina_id"], ["notas_fiscais", "usina_id"]],
        ucs: [["faturas", "uc_id"], ["vinculos", "uc_id"]]
      }[table] || [];
      for (const [t, c] of deps) {
        const r = await this.sb.from(t).select("id", { count: "exact", head: true }).eq(c, id);
        if (r.error) res(r);
        if (r.count) throw new Error(`Não dá para excluir: há ${r.count} registro(s) em "${t}" ligados a este. Exclua ou mude esses antes.`);
      }
      res(await this.sb.from(table).delete().eq("id", id));
      await this.audit("excluir", table, id, resumo || await this.label(table, antes), antes, null);
      return antes;
    }

    async existe(t, id) { return !id || !!res(await this.sb.from(t).select("id").eq("id", id).maybeSingle()); }

    async validate(table, row) {
      if (table === "usinas") {
        if (!await this.existe("donos", row.dono_id)) throw new Error("Dono não encontrado.");
        if (!mes(row.inicio_operacao) || !mes(row.fim_operacao)) throw new Error("Início/fim da operação devem ser AAAA-MM.");
        if (row.gestao_modo && !["pct", "valor"].includes(row.gestao_modo)) throw new Error("Gestão P3: use % ou valor fixo.");
        if (row.rateio_modo && !["kwh", "percentual"].includes(row.rateio_modo)) throw new Error("Rateio inválido.");
        if (row.geradora_paga_por && !["cliente", "dono", "p3"].includes(row.geradora_paga_por)) throw new Error("Quem paga a geradora: cliente, dono ou P3.");
        if (row.arrendamento_recebe && !["p3", "dono"].includes(row.arrendamento_recebe)) throw new Error("Quem recebe o arrendamento: P3 ou dono.");
      }
      if (table === "custos" || table === "custos_fixos") {
        if (!await this.existe("usinas", row.usina_id)) throw new Error("Usina não encontrada.");
        if (row.pago_por && !["p3", "dono", "cliente"].includes(row.pago_por)) throw new Error("Quem paga: P3, dono ou cliente.");
        if (row.reembolso && !["nao", "dono", "cliente"].includes(row.reembolso)) throw new Error("Reembolso: não, dono ou cliente.");
        if ((row.reembolso || "nao") !== "nao" && (row.pago_por || "p3") !== "p3") throw new Error("Só há reembolso quando a P3 paga o custo.");
        if (row.reembolso === "dono" && !row.usina_id) throw new Error("Escolha a usina: o reembolso do dono é pela usina.");
        if (!mes(row.competencia) || !mes(row.inicio) || !mes(row.fim)) throw new Error("Mês deve ser AAAA-MM.");
        if (row.valor != null && row.valor < 0) throw new Error("O valor não pode ser negativo.");
        if (row.dia_vencimento != null && !(row.dia_vencimento >= 1 && row.dia_vencimento <= 31)) throw new Error("Dia de vencimento: de 1 a 31.");
        if (row.status && !["a_pagar", "pago"].includes(row.status)) throw new Error("Situação inválida.");
      }
      if (table === "ucs") {
        if (!row.numero && !row.numero_conces) throw new Error("Informe o número da UC (o longo, o curto ou os dois).");
        if (!await this.existe("clientes", row.cliente_id)) throw new Error("Cliente não encontrado.");
        if (!await this.existe("usinas", row.usina_geradora_id)) throw new Error("Usina não encontrada.");
        for (const f of ["numero", "numero_conces"]) {
          if (!row[f]) continue;
          const dup = res(await this.sb.from("ucs").select("id").or(`numero.eq.${row[f]},numero_conces.eq.${row[f]}`).neq("id", row.id || ""));
          if (dup.length) throw new Error(`A UC ${row[f]} já está cadastrada.`);
        }
      }
      if (table === "vinculos") {
        if (!await this.existe("ucs", row.uc_id) || !await this.existe("usinas", row.usina_id)) throw new Error("UC ou usina não encontrada.");
        const p = Number(row.percentual == null ? 100 : row.percentual);
        if (!(p > 0 && p <= 100)) throw new Error("Percentual deve ser entre 0 e 100.");
        const outros = res(await this.sb.from("vinculos").select("percentual").eq("uc_id", row.uc_id).neq("id", row.id || ""));
        const soma = outros.reduce((s, v) => s + Number(v.percentual || 0), 0);
        if (soma + p > 100.0001) throw new Error(`A UC já tem ${soma}% vinculado a outras usinas: o total não pode passar de 100%.`);
      }
      if (table === "faturas") {
        if (!mes(row.referencia) || !mes(row.competencia)) throw new Error("Referência e competência devem ser AAAA-MM.");
        if (row.total == null) throw new Error("Informe o total da fatura.");
        if (!await this.existe("ucs", row.uc_id)) throw new Error("UC não encontrada.");
        const dup = res(await this.sb.from("faturas").select("id").eq("uc_id", row.uc_id).eq("referencia", row.referencia).neq("id", row.id || ""));
        if (dup.length) throw new Error(`Já existe fatura desta UC com referência ${row.referencia}.`);
      }
      if (table === "obras") {
        if (row.contratante && !["uby", "terceiro", "p3"].includes(row.contratante)) throw new Error("Contratante: Uby, terceiro ou P3.");
        if (row.status && !["orcamento", "andamento", "concluida", "cancelada"].includes(row.status)) throw new Error("Situação da obra inválida.");
        if (row.modo && !["simples", "detalhado"].includes(row.modo)) throw new Error("Modo do custo inválido.");
        for (const f of ["data_inicio", "data_fim"]) if (row[f] && !/^\d{4}-\d{2}-\d{2}$/.test(String(row[f]).slice(0, 10))) throw new Error("Data deve ser AAAA-MM-DD.");
        for (const f of ["venda", "custo", "custo_material", "custo_mao_obra", "custo_outros"]) if (row[f] != null && row[f] < 0) throw new Error("Valores não podem ser negativos.");
      }
      if (table === "nf_regras" || table === "notas_fiscais") {
        if (!await this.existe("usinas", row.usina_id)) throw new Error("Usina não encontrada.");
        if (row.emitente && !["p3", "dono"].includes(row.emitente)) throw new Error("Quem emite: P3 ou dono.");
        if (row.dia != null && !(row.dia >= 1 && row.dia <= 31)) throw new Error("Dia de emitir: de 1 a 31.");
        if (!mes(row.competencia)) throw new Error("Mês deve ser AAAA-MM.");
        if (row.data_emissao && !/^\d{4}-\d{2}-\d{2}$/.test(String(row.data_emissao))) throw new Error("Data deve ser AAAA-MM-DD.");
        if (row.status && !["emitida", "cancelada"].includes(row.status)) throw new Error("Situação da NF inválida.");
        if (row.repasse_status && !["pendente", "pago"].includes(row.repasse_status)) throw new Error("Situação do repasse inválida.");
        if (row.custo_pct != null && !(row.custo_pct >= 0 && row.custo_pct < 100)) throw new Error("Custo da NF: de 0 a 99%.");
        for (const f of ["valor", "valor_padrao", "repasse_valor", "gestao_valor"]) if (row[f] != null && row[f] < 0) throw new Error("Valores não podem ser negativos.");
      }
      if (table === "usina_mes") {
        if (!mes(row.competencia)) throw new Error("Competência deve ser AAAA-MM.");
        if (row.status && !["aberto", "cobrado", "recebido", "repassado"].includes(row.status)) throw new Error("Situação inválida.");
      }
    }

    async label(table, r) {
      if (!r) return "";
      if (table === "faturas") {
        const uc = await this.get("ucs", r.uc_id);
        return `Fatura ${r.referencia} · UC ${uc ? uc.numero || uc.numero_conces : r.uc_id} · R$ ${Number(r.total || 0).toFixed(2)}`;
      }
      if (table === "ucs") return `UC ${r.numero || r.numero_conces}${r.descricao ? " · " + r.descricao : ""}`;
      if (table === "usina_mes") { const u = await this.get("usinas", r.usina_id); return `Fechamento ${r.competencia} · ${u ? u.nome : r.usina_id}`; }
      if (table === "vinculos") return `Vínculo UC × usina (${r.percentual}%)`;
      if (table === "scee") return `Créditos SCEE ${r.referencia} · UC ${r.uc || r.uc_conces}`;
      if (table === "notas_fiscais") { const u = await this.get("usinas", r.usina_id); return `NF ${r.numero || "s/ nº"} · ${r.competencia} · ${u ? u.nome : r.usina_id} · R$ ${Number(r.valor || 0).toFixed(2)}`; }
      if (table === "custos") return `Custo ${r.competencia} · ${r.descricao} · R$ ${Number(r.valor || 0).toFixed(2)}`;
      return r.nome || r.descricao || r.id;
    }

    async findUc(numero, conces) {
      for (const k of [ucKey(numero), ucKey(conces)]) {
        if (!k) continue;
        const r = res(await this.sb.from("ucs").select("*").or(`numero.eq.${k},numero_conces.eq.${k}`).limit(1));
        if (r.length) return r[0];
      }
      return null;
    }

    async upsertUsinaMes(usinaId, comp, data) {
      const cur = res(await this.sb.from("usina_mes").select("id").eq("usina_id", usinaId).eq("competencia", comp).maybeSingle());
      if (cur) return this.update("usina_mes", cur.id, data);
      return this.insert("usina_mes", { status: "aberto", ...data, usina_id: usinaId, competencia: comp });
    }

    async snapshot() {
      const [donos, clientes, usinas, ucs, vinculos, faturas, usinaMes, scee, custos, custosFixos, documentos, config] = await Promise.all(["donos", "clientes", "usinas", "ucs", "vinculos", "faturas", "usina_mes", "scee", "custos", "custos_fixos", "documentos", "config"].map(t => this.all(t)));
      const cfg = Object.fromEntries(config.map(r => [r.chave, r.valor]));
      if (cfg.usuario) this.usuario = cfg.usuario;
      return { donos, clientes, usinas, ucs, vinculos, faturas, usinaMes, scee, custos, custosFixos, documentos: documentos.map(({ caminho, ...d }) => d), config: cfg };
    }

    async auditoria(limit) {
      return res(await this.sb.from("auditoria").select("*").order("id", { ascending: false }).limit(Number(limit) || 300));
    }

    // Cópia de segurança: todas as tabelas num arquivo JSON, guardado na nuvem.
    async exportar() {
      const out = {};
      await Promise.all(TODAS.map(async t => { out[t] = await this.all(t); }));
      return out;
    }
    async restaurar(dados) { res(await this.sb.rpc("p3_restaurar", { dados })); }
  }

  window.P3_BASE = { Base, TABLES, ucKey, res };
})();
