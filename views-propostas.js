// Gerador de propostas comerciais da P3 Energy: carregador EV, energia solar e solar com bateria.
// Segue os modelos da P3 (Thiago Nunes / Multicampo / Roberto Daher para solar; Cacau Show / Hotel JK / Sanambi para EV),
// sempre com a marca P3 Energy (nunca "P3 Recharge"). A proposta é um conjunto de páginas 16:9 que vira PDF pela impressão.
(function () {
  "use strict";
  const { esc, $, $$, fmt, api, toast, opts, confirmar } = window.P3;
  const n = v => { if (v == null || v === "") return 0; if (typeof v === "number") return v; let s = String(v).trim().replace(/[R$\s%]/g, ""); if (/,/.test(s)) s = s.replace(/\./g, "").replace(",", "."); else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); const x = Number(s); return Number.isFinite(x) ? x : 0; };
  const r2 = v => Math.round(v * 100) / 100;
  const brl = v => fmt.brl(v);
  const num = (v, d = 0) => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const numx = v => (Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 }); // até 2 casas, sem zeros sobrando
  const linhas = s => String(s || "").split("\n").map(x => x.trim()).filter(Boolean);
  const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const dataLonga = iso => { const [a, m, d] = String(iso || hoje()).split("-").map(Number); return `${d} de ${MESES[m - 1]} de ${a}`; };
  const mesAno = iso => { const [a, m] = String(iso || hoje()).split("-").map(Number); return `${MESES[m - 1]} ${a}`; };

  const TIPOS = { solar: "Energia solar", bateria: "Bateria (com ou sem solar)", ev: "Carregador EV", manutencao: "Manutenção" };
  const STATUS = { rascunho: ["Rascunho", ""], enviada: ["Enviada", "info"], aceita: ["Aceita", "ok"], executada: ["Executada", "ok"], recusada: ["Recusada", "bad"] };
  const VENDEDORES = {
    eduardo: { nome: "Eduardo Berger Prochet", tel: "(43) 98861-7800", email: "eduardo@p3energy.com.br" },
    rafael: { nome: "Rafael Berger Prochet", tel: "(43) 99925-8220", email: "rafael@p3energy.com.br" }
  };
  const CNPJ = "45.173.949/0001-21";
  const DISPONIBILIDADE = { mono: 30, bi: 50, tri: 100 };
  const GER_PADRAO = { telhado: 108.3, solo: 120.8 }; // kWh por kWp ao mês (planilha da P3: 1.300 e 1.450 por ano) // kWh mínimos cobrados pela concessionária

  // Valores de partida de cada tipo (tudo editável na tela).
  const COMUM = { cliente: "", cidade: "Londrina", data: "", validade_dias: 15, vendedor: "eduardo", logo_cliente: "", foto_capa: "", layout_img: "", fechamento: "" };
  const PADRAO = {
    solar: {
      consumo_kwh: 1000, conta_atual: 1000, fase: "bi", fio_b_pct: 14, custo_com_solar: "",
      qtd_modulos: 16, modulo_w: 620, modulo_marca: "Canadian", inversor: "1 inversor Canadian 7 kW", fator_kwh_kwp: 105, estrutura: "Telhado",
      // Telhado × solo geram diferente (planilha da P3: 1.300 e 1.450 kWh por kWp ao ano; pela cidade, PVGIS de cada montagem).
      // Simultaneidade: parte da geração consumida na hora, que não passa pela rede nem paga Fio B.
      instalacao: "telhado", simultaneidade: 0, ger_telhado: "", ger_solo: "", fatura_info: "",
      // Economia pela Lei 14.300 (eco_v2): tarifas da ANEEL por distribuidora/subgrupo, Grupo A ou B, Fio B escalonado.
      eco_v2: false, mostrar_economia: true, grupo: "B", distribuidora: "COPEL-DIS", subgrupo: "B1", subgrupo_a: "A4", modalidade: "Verde", icms_pct: 19, pis_cofins_pct: 5, aneel: null,
      tarifa_kwh: "", fio_b_kwh: "", fio_b_parcela: 28, ilum_publica: 0, regra: "gd2", ano_inicio: "", fatura_uso: "tudo", fat: null,
      ucs: [], demanda_kw: 0, tar_demanda: "", consumo_fp: 0, consumo_p: 0, tar_fp: "", tar_p: "", fio_fp: "", fio_p: "", te_fp: "", te_p: "",
      garantia_modulo: "12 anos contra defeito de fabricação e 25 anos de garantia de performance", garantia_inversor: "10 anos contra defeito de fabricação",
      valor_equip: 0, valor_impl: 0, avista: "", parcelas: "3, 6, 12", juros_parcela: 3, prazo: "2 meses",
      // Pagamento separado (como na proposta da Multicampo): cada parte com seu à vista e seu parcelado, e tudo junto.
      pag_separado: true, pag_junto: true,
      avista_equip: "", parcelas_equip: "3, 6, 12", juros_equip: 3,
      avista_bat: "", parcelas_bat: "3, 6, 12", juros_bat: 3,
      avista_impl: "", parcelas_impl: "3", juros_impl: 0,
      pagamento_obs: "Sujeito à validação da estrutura do telhado.", reajuste: 5, degradacao: 0.5, anos: 25,
      // Custo da obra pela planilha de obra solar (o mesmo modelo da tela Obras). Não aparece no PDF.
      c_instalacao: "telhado", c_km: 0, c_viagens_eng: 1, c_viagens_equipe: 1, c_pessoas: 4, c_dias: 5, c_margem_kwp: 620, c_faturamento: "p3", c_imp_total: 5.93, c_imp_servico: 16.33,
      c_kit: 0, c_bateria: 0, c_estrutura: 0, c_transformador: 0, c_padrao: 0, c_descarregamento: 0, c_conexao: 0, c_comissao: 0, c_terrenista: 0
    },
    ev: {
      qtd: 1, corrente: "AC", potencia_kw: 7, modelo: "Livoltek 7,3 kW", clamper: true, quadro: true, desligamento: true,
      conexao: "Conexão a partir do ponto de espera saindo do quadro geral.", escopo_extra: "", objetivo: "",
      justificativa_titulo: "", justificativa: "", operacao: true,
      investimento: [
        { descricao: "Equipamentos e materiais elétricos", detalhe: "Carregador Livoltek 7,3 kW · cabo e infraestrutura antichama · Mobi Smart Clamper", valor: 0 },
        { descricao: "Engenharia e implantação", detalhe: "Conexão e proteções · configuração, testes e comissionamento", valor: 0 }
      ],
      software_mensal: 30, manutencao_mensal: 100, manutencao_opcional: true,
      pag_separado: false, pag_junto: true, avista: "", parcelas: "", juros_parcela: 0,
      variaveis: "8 a 10% sobre o faturamento — software e gateway de cobrança\n10% sobre o faturamento — gestão operacional da P3",
      pagamento: "40% na assinatura do contrato\n40% na entrega dos materiais para início das obras\n20% na ligação do carregador",
      resp_p3: "Fornecimento e instalação dos carregadores\nQuadro dedicado, proteção e botoeiras de emergência\nInfraestrutura elétrica a partir do ponto de espera\nConfiguração, testes e comissionamento\nManutenção preventiva P3",
      resp_cliente: "Disponibilizar o ponto de espera para conexão\nLiberar a área para execução da instalação\nFornecimento de internet"
    }
  };
  // Manutenção (O&M) pela planilha "CONTROLE O & M": preventiva, monitoramento, limpeza e visita técnica avulsas.
  PADRAO.manutencao = {
    kwp: 5, modulos: "", estrutura: "telhado", km: 0, beneficiarias: 0, endereco: "",
    srv_preventiva: true, srv_monitoramento: false, srv_limpeza: false, srv_visita: false,
    pag_3x: true, pag_12x: false, pag_avista: false, garantia_meses: 3,
    fiscal_pct: 6, markup_3x: 60, markup_anual: 50, markup_avulso: 50, arredondar: true, tarifa_kwh: 0.82,
    inclusos: "Visita técnica com check-list completo\nReaperto dos grampos de fixação dos módulos\nRevisão da força mecânica nas estruturas do sistema\nLimpeza e reaperto dos terminais elétricos\nLimpeza da carcaça e dos exaustores do inversor\nLimpeza dos módulos (1 vez ao ano)",
    exclusos: "Substituição de componentes\nHospedagem e alimentação\nLimpeza dos módulos mais de 1 vez ao ano\nDeslocamento mais de 1 vez ao ano"
  };
  PADRAO.bateria = { ...PADRAO.solar, bat_qtd: 1, bat_kwh: 10, bat_modelo: "Bateria de lítio LiFePO4", inv_hibrido: "Inversor híbrido", carga_critica_kw: 2, valor_bateria: 0, bat_garantia: "10 anos ou 6.000 ciclos", cargas: [], cargas_pdf: true,
    // bat_modo: "solar" = solar + bateria; "bateria" = só bateria (sem solar); "ambas" = as duas opções na mesma proposta.
    bat_modo: "solar", valor_impl_bat: 0 };
  // Calculadora de cargas do backup: potência típica (W), horas ligado durante a falta, % do tempo que o aparelho
  // puxa de verdade (compressor de geladeira/freezer/ar liga e desliga) e o pico na partida (motor puxa 3 a 5×).
  // Ar-condicionado vai em BTU: inverter ~0,09 W por BTU (12.000 BTU ≈ 1.080 W), convencional ~0,10.
  const APARELHOS = [
    { nome: "Lâmpada LED", w: 9, h: 6, uso: 100, partida: 1 },
    { nome: "Geladeira", w: 150, h: 8, uso: 40, partida: 4 },
    { nome: "Geladeira duplex / frost free", w: 250, h: 8, uso: 40, partida: 4 },
    { nome: "Freezer", w: 200, h: 8, uso: 45, partida: 4 },
    { nome: "Ar-condicionado inverter", btu: 12000, fbtu: 0.09, h: 4, uso: 70, partida: 1.3 },
    { nome: "Ar-condicionado convencional", btu: 12000, fbtu: 0.1, h: 4, uso: 80, partida: 3 },
    { nome: "Ventilador", w: 80, h: 6, uso: 100, partida: 1 },
    { nome: "TV", w: 100, h: 4, uso: 100, partida: 1 },
    { nome: "Internet (roteador e modem)", w: 20, h: 8, uso: 100, partida: 1 },
    { nome: "Notebook", w: 65, h: 4, uso: 100, partida: 1 },
    { nome: "Computador de mesa", w: 250, h: 4, uso: 100, partida: 1 },
    { nome: "Câmeras / alarme", w: 40, h: 8, uso: 100, partida: 1 },
    { nome: "Portão eletrônico", w: 350, h: 0.2, uso: 100, partida: 3 },
    { nome: "Bomba d'água 1/2 cv", w: 450, h: 1, uso: 100, partida: 3 },
    { nome: "Micro-ondas", w: 1200, h: 0.3, uso: 100, partida: 1 },
    { nome: "Máquina de lavar", w: 500, h: 1, uso: 60, partida: 3 },
    { nome: "Chuveiro elétrico", w: 5500, h: 0.5, uso: 100, partida: 1 },
    { nome: "Outro aparelho", w: 100, h: 4, uso: 100, partida: 1 }
  ];
  const UTIL_BAT = 0.9; // fração útil da bateria (a mesma da autonomia)
  const wCarga = c => n(c.btu) && n(c.fbtu) ? n(c.btu) * n(c.fbtu) : n(c.w);
  function calcCargas(d) {
    const linhas = (d.cargas || []).filter(c => n(c.qtd) > 0 && wCarga(c) > 0).map(c => {
      const w = wCarga(c), pot = w * n(c.qtd), uso = c.uso === "" || c.uso == null ? 100 : n(c.uso);
      return { ...c, wUn: w, pot, kwh: pot * n(c.h) * uso / 100 / 1000, extraPartida: pot * (Math.max(1, n(c.partida) || 1) - 1) };
    });
    const potKw = linhas.reduce((a, l) => a + l.pot, 0) / 1000;
    // Pico: tudo ligado + o maior motor partindo (os motores não partem todos no mesmo segundo).
    const picoKw = potKw + Math.max(0, ...linhas.map(l => l.extraPartida)) / 1000;
    const kwh = linhas.reduce((a, l) => a + l.kwh, 0), horas = Math.max(0, ...linhas.map(l => n(l.h)));
    const mediaKw = horas ? kwh / horas : 0, porBat = n(d.bat_kwh) * UTIL_BAT;
    const nBat = porBat && kwh ? Math.ceil(kwh / porBat - 1e-9) : 0;
    return { linhas, potKw, picoKw, kwh, horas, mediaKw, nBat, capAtual: n(d.bat_kwh) * (n(d.bat_qtd) || 1) };
  }
  const novaDados = tipo => ({ ...COMUM, ...JSON.parse(JSON.stringify(PADRAO[tipo])), data: hoje() });
  const dadosDe = p => ({ ...novaDados(p.tipo), ...(p.dados && !Array.isArray(p.dados) ? p.dados : {}) });

  // ───────── cálculos ─────────
  // Conta com solar: o que não é compensado paga a tarifa cheia (inclui a taxa mínima da ligação); o compensado
  // ainda paga o fio B e encargos (Lei 14.300). Ex. Multicampo: 1.244 kWh, R$ 1.287, trifásico, 14% → ~R$ 269.
  // ───────── economia pela Lei 14.300/2022 e REN ANEEL 1.059/2023 ─────────
  // Fio B (TUSD de remuneração da rede) sobre a energia COMPENSADA, em escalonamento para GD II (conexão a partir de 2023):
  // 15% em 2023, 30% em 2024, 45% em 2025, 60% em 2026, 75% em 2027, 90% em 2028 e 100% a partir de 2029.
  // GD I (direito adquirido, protocolado até 07/01/2023) não paga Fio B sobre o compensado até 2045.
  const TRANSICAO = { 2023: 0.15, 2024: 0.30, 2025: 0.45, 2026: 0.60, 2027: 0.75, 2028: 0.90 };
  const fatorFioB = (ano, regra) => regra === "gd1" || ano < 2023 ? 0 : ano >= 2029 ? 1 : TRANSICAO[ano];
  const vazioOuE = (v, padrao) => v === "" || v == null ? padrao : n(v);
  // Tarifas com impostos (a ANEEL publica sem ICMS e PIS/COFINS): valor ÷ (1 − ICMS − PIS/COFINS).
  function tarifasEco(d) {
    const imp = 1 - (n(d.icms_pct) + n(d.pis_cofins_pct)) / 100, ci = v => imp > 0 ? v / imp : v;
    const a = d.aneel && d.aneel.postos ? d.aneel : null, P = a ? a.postos : {};
    const consumoB = n(d.consumo_kwh), ilum = n(d.ilum_publica);
    if (d.grupo === "A") {
      const fp = P.foraPonta || {}, pt = P.ponta || {};
      return {
        tarFp: vazioOuE(d.tar_fp, ci(n(fp.te) + n(fp.tusd))), tarP: vazioOuE(d.tar_p, ci(n(pt.te) + n(pt.tusd))),
        fioFp: vazioOuE(d.fio_fp, ci(n(fp.fioB))), fioP: vazioOuE(d.fio_p, ci(n(pt.fioB))),
        teFp: vazioOuE(d.te_fp, n(fp.te)), teP: vazioOuE(d.te_p, n(pt.te)),
        tarDem: vazioOuE(d.tar_demanda, ci(n(a && a.demanda))), ilum
      };
    }
    const u = P.unico || {};
    const tar = vazioOuE(d.tarifa_kwh, a ? ci(n(u.te) + n(u.tusd)) : consumoB ? Math.max(0, n(d.conta_atual) - ilum) / consumoB : 0);
    const fio = vazioOuE(d.fio_b_kwh, a && u.fioB != null ? ci(n(u.fioB)) : tar * (n(d.fio_b_parcela) || 28) / 100);
    return { tar, fio, ilum };
  }
  // Uma UC do Grupo B recebendo "credito" kWh (energia injetada ou créditos): o compensado paga Fio B, o resto a tarifa,
  // e vale o maior entre isso e o mínimo da ligação (sem duplicidade).
  function contaB(consRede, consTotal, disp, tar, fio, fat, reaj, ilum, credito) {
    const comp = Math.min(credito, consRede), naoComp = consRede - comp;
    const energia = naoComp * tar * reaj, fioV = comp * fio * fat * reaj, minimo = disp * tar * reaj;
    const minimoAplicado = minimo > energia + fioV;
    return { sem: consTotal * tar * reaj + ilum * reaj, com: Math.max(energia + fioV, minimo) + ilum * reaj, comp, naoComp, energia, fio: fioV, minimo, minimoAplicado, ilum: ilum * reaj, sobra: Math.max(0, credito - comp), disp };
  }
  // Uma UC do Grupo A: o crédito abate primeiro o fora de ponta; o que sobra abate a ponta pelo fator de ajuste (TE fp ÷ TE p).
  function contaA(cfpRede, cfpTotal, cp, t, fat, reaj, ilum, credito, demanda) {
    const compFp = Math.min(credito, cfpRede), sobra1 = credito - compFp;
    const ajuste = t.teP ? t.teFp / t.teP : 1;
    const compP = Math.min(cp, sobra1 * ajuste), sobra = Math.max(0, sobra1 - (ajuste ? compP / ajuste : 0));
    const dem = demanda * reaj;
    const energia = ((cfpRede - compFp) * t.tarFp + (cp - compP) * t.tarP) * reaj, fio = (compFp * t.fioFp + compP * t.fioP) * fat * reaj;
    return { sem: dem + (cfpTotal * t.tarFp + cp * t.tarP) * reaj + ilum * reaj, com: dem + energia + fio + ilum * reaj, comp: compFp + compP, compFp, compP, naoComp: (cfpRede - compFp) + (cp - compP), sobra, energia, fio, dem, ilum: ilum * reaj, minimo: 0, minimoAplicado: false, ajuste };
  }
  // Tarifas de uma UC beneficiária: as dela, ou as da UC principal quando é do mesmo grupo.
  function tarifasUc(d, u, t) {
    if ((u.grupo || "B") === "A") {
      const mesmo = d.grupo === "A";
      return { tarFp: vazioOuE(u.tar_fp, mesmo ? t.tarFp : 0), tarP: vazioOuE(u.tar_p, mesmo ? t.tarP : 0), fioFp: vazioOuE(u.fio_fp, mesmo ? t.fioFp : 0), fioP: vazioOuE(u.fio_p, mesmo ? t.fioP : 0),
        teFp: mesmo ? t.teFp : 1, teP: mesmo ? t.teP : 1, tarDem: vazioOuE(u.tar_demanda, mesmo ? t.tarDem : 0) };
    }
    const tar = vazioOuE(u.tarifa, d.grupo === "A" ? 0 : t.tar);
    return { tar, fio: vazioOuE(u.fio, d.grupo === "A" ? tar * (n(d.fio_b_parcela) || 28) / 100 : t.fio) };
  }
  const consumoUc = u => (u.grupo || "B") === "A" ? n(u.consumo_fp) + n(u.consumo_p) : n(u.consumo);
  // Conta de um mês no ano k (1 = primeiro ano), com e sem o sistema, somando a UC principal e as beneficiárias.
  function contaMes(d, t, geracaoMes, k, ano0) {
    const reaj = Math.pow(1 + n(d.reajuste) / 100, k - 1), ger = geracaoMes * Math.pow(1 - n(d.degradacao) / 100, k - 1);
    const s = n(d.simultaneidade) / 100, fat = fatorFioB(ano0 + k - 1, d.regra);
    let p;
    if (d.grupo === "A") {
      const cfp = n(d.consumo_fp), auto = Math.min(ger * s, cfp);
      p = contaA(cfp - auto, cfp, n(d.consumo_p), t, fat, reaj, t.ilum, ger - auto, n(d.demanda_kw) * t.tarDem);
      p.auto = auto;
    } else {
      const consumo = n(d.consumo_kwh), auto = Math.min(ger * s, consumo);
      p = contaB(consumo - auto, consumo, DISPONIBILIDADE[d.fase] || 50, t.tar, t.fio, fat, reaj, t.ilum, ger - auto);
      p.auto = auto;
    }
    p.fat = fat;
    // Créditos que sobraram na principal → beneficiárias, pelo rateio informado ou proporcional ao consumo.
    const ucs = (d.ucs || []).filter(u => consumoUc(u) > 0);
    const credito = p.sobra, comPct = ucs.some(u => u.rateio_pct !== "" && u.rateio_pct != null);
    const totalCons = ucs.reduce((a, u) => a + consumoUc(u), 0);
    const outras = ucs.map(u => {
      const pct = comPct ? n(u.rateio_pct) / 100 : (totalCons ? consumoUc(u) / totalCons : 0);
      const cr = credito * pct, tu = tarifasUc(d, u, t);
      const r = (u.grupo || "B") === "A" ? contaA(n(u.consumo_fp), n(u.consumo_fp), n(u.consumo_p), tu, fat, reaj, n(u.ilum), cr, n(u.demanda_kw) * tu.tarDem)
        : contaB(n(u.consumo), n(u.consumo), DISPONIBILIDADE[u.fase] || 50, tu.tar, tu.fio, fat, reaj, n(u.ilum), cr);
      return { nome: u.nome || "UC", grupo: u.grupo || "B", pct, credito: cr, ...r };
    });
    const usado = outras.reduce((a, u) => a + (u.credito - u.sobra), 0);
    return { ...p, principal: { sem: p.sem, com: p.com }, sem: p.sem + outras.reduce((a, u) => a + u.sem, 0), com: p.com + outras.reduce((a, u) => a + u.com, 0),
      ucs: outras, sobraPrincipal: p.sobra, sobra: Math.max(0, credito - usado) };
  }
  function calcSolar(d, tipo) {
    if (!d.eco_v2) return calcSolarAntigo(d, tipo);
    const kwp = r2(n(d.qtd_modulos) * n(d.modulo_w) / 1000);
    const geracao = Math.round(kwp * n(d.fator_kwh_kwp));
    const consumo = (d.grupo === "A" ? n(d.consumo_fp) + n(d.consumo_p) : n(d.consumo_kwh)) + (d.ucs || []).reduce((a, u) => a + consumoUc(u), 0);
    const t = tarifasEco(d), ano0 = n(d.ano_inicio) || new Date().getFullYear();
    const m1 = contaMes(d, t, geracao, 1, ano0);
    const conta = r2(m1.sem);
    const manual = d.custo_com_solar !== "" && d.custo_com_solar != null;
    const comSolar = manual ? n(d.custo_com_solar) : r2(m1.com);
    const mensal = r2(Math.max(0, conta - comSolar));
    const investimento = r2(n(d.valor_equip) + n(d.valor_impl) + (tipo === "bateria" ? n(d.valor_bateria) : 0));
    const anos = Math.max(5, Math.min(30, n(d.anos) || 25));
    const ajusteManual = manual ? comSolar - m1.com : 0;
    const porAno = []; let acum = 0, payback = null;
    for (let k = 1; k <= anos; k++) {
      const mk = contaMes(d, t, geracao, k, ano0);
      const e = r2(Math.max(0, mk.sem - (mk.com + ajusteManual)) * 12);
      const antes = acum; acum = r2(acum + e);
      if (payback == null && investimento > 0 && e > 0 && acum >= investimento) payback = (k - 1) + (investimento - antes) / e;
      porAno.push({ ano: k, anoCal: ano0 + k - 1, economia: e, acumulado: acum, fat: mk.fat });
    }
    const soma = k => r2(porAno.slice(0, k).reduce((s, x) => s + x.economia, 0));
    const avista = d.avista !== "" && d.avista != null ? n(d.avista) : investimento;
    const parcelas = String(d.parcelas || "").split(/[,;\s]+/).map(Number).filter(x => x > 1).map(q => ({ q, valor: r2(investimento * (1 + n(d.juros_parcela) / 100) / q) }));
    const autonomia = n(d.carga_critica_kw) ? r2(n(d.bat_kwh) * (n(d.bat_qtd) || 1) * 0.9 / n(d.carga_critica_kw)) : 0;
    return { eco: true, kwp, geracao, consumo, conta, tarifa: d.grupo === "A" ? t.tarFp : t.tar, t, m1, ano0, autoconsumo: Math.round(m1.auto), compensado: Math.round(m1.comp),
      comSolar, estimado: r2(m1.com), mensal, pct: conta ? mensal / conta : 0, investimento, porAno, ano1: soma(1), ano5: soma(5), ano20: soma(Math.min(20, anos)), total: soma(anos), anos, payback, avista, parcelas, autonomia, cobertura: consumo ? geracao / consumo : 0 };
  }
  function calcSolarAntigo(d, tipo) {
    const kwp = r2(n(d.qtd_modulos) * n(d.modulo_w) / 1000);
    const geracao = Math.round(kwp * n(d.fator_kwh_kwp));
    const consumo = n(d.consumo_kwh), conta = n(d.conta_atual);
    const tarifa = consumo ? conta / consumo : 0;
    const disp = DISPONIBILIDADE[d.fase] || 50;
    const autoconsumo = Math.round(Math.min(geracao * n(d.simultaneidade) / 100, consumo));
    const consumoRede = consumo - autoconsumo, injetada = geracao - autoconsumo;
    const compensado = Math.max(0, Math.min(injetada, consumoRede - disp));
    const estimado = r2((consumoRede - compensado) * tarifa + compensado * tarifa * n(d.fio_b_pct) / 100);
    const comSolar = d.custo_com_solar !== "" && d.custo_com_solar != null ? n(d.custo_com_solar) : estimado;
    const mensal = r2(Math.max(0, conta - comSolar));
    const investimento = r2(n(d.valor_equip) + n(d.valor_impl) + (tipo === "bateria" ? n(d.valor_bateria) : 0));
    const fator = (1 + n(d.reajuste) / 100) * (1 - n(d.degradacao) / 100);
    const anos = Math.max(5, Math.min(30, n(d.anos) || 25));
    const porAno = []; let acum = 0, payback = null;
    for (let k = 1; k <= anos; k++) {
      const e = r2(mensal * 12 * Math.pow(fator, k - 1));
      const antes = acum; acum = r2(acum + e);
      if (payback == null && investimento > 0 && e > 0 && acum >= investimento) payback = (k - 1) + (investimento - antes) / e;
      porAno.push({ ano: k, economia: e, acumulado: acum });
    }
    const soma = k => r2(porAno.slice(0, k).reduce((s, x) => s + x.economia, 0));
    const avista = d.avista !== "" && d.avista != null ? n(d.avista) : investimento;
    const parcelas = String(d.parcelas || "").split(/[,;\s]+/).map(Number).filter(x => x > 1).map(q => ({ q, valor: r2(investimento * (1 + n(d.juros_parcela) / 100) / q) }));
    const autonomia = n(d.carga_critica_kw) ? r2(n(d.bat_kwh) * (n(d.bat_qtd) || 1) * 0.9 / n(d.carga_critica_kw)) : 0;
    return { kwp, geracao, consumo, conta, tarifa, autoconsumo, compensado, comSolar, estimado, mensal, pct: conta ? mensal / conta : 0, investimento, porAno, ano1: soma(1), ano5: soma(5), ano20: soma(Math.min(20, anos)), total: soma(anos), anos, payback, avista, parcelas, autonomia, cobertura: consumo ? geracao / consumo : 0 };
  }
  // Proposta de bateria sem solar (backup puro): não há geração nem economia, só armazenamento e autonomia.
  const soBateria = p => p.tipo === "bateria" && (p.dados || {}).bat_modo === "bateria";
  const autonomiaDe = d => n(d.carga_critica_kw) ? r2(n(d.bat_kwh) * (n(d.bat_qtd) || 1) * UTIL_BAT / n(d.carga_critica_kw)) : 0;
  function calcSoBateria(d) {
    const temAvista = d.avista !== "" && d.avista != null;
    // Só o à vista preenchido (sem valor por parte): ele vira o valor do sistema.
    const investimento = r2(n(d.valor_bateria) + n(d.valor_impl_bat)) || (temAvista ? n(d.avista) : 0);
    const avista = temAvista ? n(d.avista) : investimento;
    const parcelas = listaParcelas(investimento, d.parcelas, d.juros_parcela);
    return { soBateria: true, kwp: 0, geracao: 0, consumo: 0, conta: 0, mensal: 0, pct: 0, payback: null, investimento, avista, parcelas, autonomia: autonomiaDe(d), capKwh: n(d.bat_kwh) * (n(d.bat_qtd) || 1) };
  }
  // A obra por trás da proposta solar, pela planilha de custos de obra solar (views-obras.js): itens com cálculo
  // pelos parâmetros + os valores à mão (kit, estrutura…). Dá o preço sugerido (custos + margem por kWp) e o lucro
  // líquido do preço que está na proposta. Também é o orçamento detalhado da obra quando a proposta vira obra.
  const CUSTO_MANUAL = [["c_kit", "Sistema fotovoltaico (kit)"], ["c_estrutura", "Estrutura"], ["c_transformador", "Transformador"], ["c_padrao", "Padrão de entrada"], ["c_descarregamento", "Descarregamento"], ["c_conexao", "Conexão (concessionária)"], ["c_comissao", "Comissão"], ["c_terrenista", "Terrenista"]];
  function obraSolar(d, tipo) {
    const S = window.P3_OBRA_SOLAR; if (!S) return null;
    const kwp = r2(n(d.qtd_modulos) * n(d.modulo_w) / 1000);
    const o = { tipo: kwp >= 75 ? "Usina solar" : "Sistema solar residencial", kwp, modo: "detalhado", itens: [], lancamentos: [],
      solar: { instalacao: d.instalacao || d.c_instalacao || "telhado", km: n(d.c_km), viagens_eng: n(d.c_viagens_eng), viagens_equipe: n(d.c_viagens_equipe), pessoas: n(d.c_pessoas), dias: n(d.c_dias), margem_kwp: n(d.c_margem_kwp), faturamento: d.c_faturamento || "p3", imp_total: n(d.c_imp_total), imp_servico: n(d.c_imp_servico) } };
    S.aplicarModeloSolar(o);
    for (const [k, nome] of CUSTO_MANUAL) { const it = o.itens.find(i => i.item === nome); if (it) { it.qtd = 1; it.unit = n(d[k]); } }
    if (tipo === "bateria" && n(d.c_bateria)) o.itens.splice(1, 0, { categoria: "Equipamentos", item: "Baterias e inversor híbrido", unid: "un", qtd: 1, unit: n(d.c_bateria), imp: false, direto: true });
    const sugerido = S.calc(o).sugerido;
    const venda = r2(n(d.valor_equip) + n(d.valor_impl) + (tipo === "bateria" ? n(d.valor_bateria) : 0));
    o.valor_contratado = venda || null;
    return { obra: o, c: S.calc(o), sugerido, venda };
  }
  function calcEv(d) {
    const qtd = Math.max(1, n(d.qtd));
    const investimento = r2((d.investimento || []).reduce((s, l) => s + n(l.valor), 0));
    const software = r2(qtd * n(d.software_mensal)), manut = r2(qtd * n(d.manutencao_mensal));
    return { qtd, investimento, software, manut, fixoCom: r2(software + manut), fixoSem: software };
  }
  // Manutenção, igual à planilha CONTROLE O & M:
  //  custo preventiva = limpeza (R$ 10/8/6 por módulo até 50/200/acima) + visita (km × 2 + R$ 100) + preventiva por faixa de módulos;
  //  preço 3× = custo + 6% fiscal, + 60%, em 3 parcelas (arredondadas a R$ 5); plano à vista = custo + 50%;
  //  monitoramento = kWp × 10 + beneficiárias × 2,50 + 3,38 por ano → venda mensal arredondada a múltiplos de R$ 15;
  //  visita técnica avulsa = (R$ 100 ou R$ 5 por kW de inversor acima de 75 kW) + km + R$ 100; limpeza avulsa = R$ 15/módulo + 2 deslocamentos; ambos + 50%.
  function calcManut(d) {
    const kwp = n(d.kwp), mod = n(d.modulos) || kwp * 1000 / 550, km = n(d.km);
    const arr = v => d.arredondar ? Math.ceil(v / 5 - 1e-9) * 5 : r2(v);
    const limpeza = r2((mod <= 50 ? 10 : mod <= 200 ? 8 : 6) * mod);
    const visita = km > 0 ? km * 2 + 100 : 0;
    const prev = mod <= 20 ? 350 : mod <= 50 ? 500 : mod <= 100 ? 650 : mod <= 200 ? 800 : mod <= 300 ? 1000 : mod <= 500 ? 2000 : 2500;
    const custo = r2(limpeza + visita + prev), fiscal = r2(custo * (1 + n(d.fiscal_pct) / 100));
    const parcela3 = arr(fiscal * (1 + n(d.markup_3x) / 100) / 3), parcela12 = arr(fiscal * (1 + n(d.markup_3x) / 100) / 12);
    const avista = arr(custo * (1 + n(d.markup_anual) / 100));
    const plano = d.pag_3x ? parcela3 * 3 : d.pag_12x ? parcela12 * 12 : avista;
    const monitAnual = kwp * 10 + n(d.beneficiarias) * 2.5 + 3.38, monitCusto = r2(monitAnual / 12), monitVenda = Math.ceil(monitCusto / 10 - 1e-9) * 15;
    const inv = kwp / 1.4, desl = km > 0 ? km + 100 : 0;
    const visitaCusto = r2((inv <= 75 ? 100 : inv * 5) + desl), visitaPreco = arr(visitaCusto * (1 + n(d.markup_avulso) / 100));
    const limpezaCusto = r2(mod * 15 + desl * 2), limpezaPreco = arr(limpezaCusto * (1 + n(d.markup_avulso) / 100));
    const fis = 1 + n(d.fiscal_pct) / 100;
    const linhas = [];
    if (d.srv_preventiva) linhas.push({ k: "preventiva", nome: "Manutenção preventiva anual", preco: plano, custo: fiscal });
    if (d.srv_limpeza) linhas.push({ k: "limpeza", nome: "Limpeza dos módulos (avulsa)", preco: limpezaPreco, custo: r2(limpezaCusto * fis) });
    if (d.srv_visita) linhas.push({ k: "visita", nome: "Visita técnica / laudo (avulsa)", preco: visitaPreco, custo: r2(visitaCusto * fis) });
    if (d.srv_monitoramento) linhas.push({ k: "monitoramento", nome: "Monitoramento (12 meses)", preco: monitVenda * 12, custo: r2(monitCusto * 12) });
    const investimento = r2(linhas.reduce((s, l) => s + l.preco, 0)), custoTotal = r2(linhas.reduce((s, l) => s + l.custo, 0));
    const economiaAnual = r2((d.estrutura === "solo" ? 1550 : 1250) * kwp * n(d.tarifa_kwh));
    return { kwp, mod, km, limpeza, visita, prev, custo, fiscal, parcela3, parcela12, avista, plano, monitAnual, monitCusto, monitVenda, visitaCusto, visitaPreco, limpezaCusto, limpezaPreco,
      linhas, investimento, custoTotal, lucro: r2(investimento - custoTotal), economiaAnual, pctEconomia: economiaAnual ? plano / economiaAnual : 0 };
  }
  const calc = p => p.tipo === "ev" ? calcEv(dadosDe(p)) : p.tipo === "manutencao" ? calcManut(dadosDe(p)) : soBateria(p) ? calcSoBateria(dadosDe(p)) : calcSolar(dadosDe(p), p.tipo);

  // ───────── a proposta (HTML das páginas) ─────────
  const LOGO = (cor1, cor2) => `<svg class="logo" viewBox="129 169 1743 757" role="img" aria-label="P3 Energy"><path fill="${cor1}" d="M129 169H993V623H320V461H817V313H287V926H129Z"/><path fill="${cor2}" d="M1052 169H1872V926H1052V771H1731V313H1052Z"/><rect fill="${cor2}" x="1061" y="461" width="636" height="162"/><text fill="${cor1}" x="330" y="923" font-size="206" textLength="690" lengthAdjust="spacingAndGlyphs" font-family="'Arial Narrow','Roboto Condensed',Arial,sans-serif">ENERGY</text></svg>`;
  const CSS = `
    :root{--esc:#22301a;--ver:#4f6337;--lim:#a8c23c;--off:#f3f4ee;--txt:#1d2617;--mut:#5f6858;--lin:#dde1d4}
    *{box-sizing:border-box} html,body{margin:0;padding:0} body{font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:var(--txt);-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .slide{position:relative;width:1440px;height:810px;overflow:hidden;background:var(--off);padding:64px 84px;page-break-after:always;break-after:page}
    .slide.dark{background:var(--esc);color:#eef0e8} .slide.dark .mut{color:#b9c1ae}
    .kicker{letter-spacing:.3em;font-size:14px;font-weight:700;color:var(--ver);text-transform:uppercase} .dark .kicker{color:var(--lim)}
    h1,h2{font-family:'Arial Narrow','Roboto Condensed','Segoe UI',sans-serif;font-stretch:condensed;text-transform:uppercase;font-weight:800;margin:10px 0 0;line-height:1}
    h1{font-size:76px} h2{font-size:46px;max-width:1080px} h3{font-size:20px;margin:0 0 10px;text-transform:uppercase;letter-spacing:.04em}
    .traco{width:56px;height:4px;background:var(--lim);margin:22px 0 26px}
    .logo{position:absolute;top:52px;right:84px;width:118px;height:auto} .capa .logo{position:static;width:280px}
    .pg{position:absolute;right:84px;bottom:32px;font-size:13px;letter-spacing:.2em;color:var(--mut)} .dark .pg{color:#9aa58d}
    .rod{position:absolute;left:84px;bottom:32px;font-size:13px;color:var(--mut);letter-spacing:.06em} .dark .rod{color:#9aa58d}
    .mut{color:var(--mut)} p{font-size:21px;line-height:1.5;margin:0 0 14px}
    .grid{display:grid;gap:22px} .g2{grid-template-columns:1fr 1fr} .g3{grid-template-columns:repeat(3,1fr)} .g4{grid-template-columns:repeat(4,1fr)}
    .card{background:#fff;border:1px solid var(--lin);border-radius:8px;padding:24px 28px;font-size:18px;line-height:1.45} .dark .card{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.12)}
    .card small{display:block;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);font-weight:700;margin-bottom:10px} .dark .card small{color:#b9c1ae}
    .card b.big{font-size:40px;font-weight:800;display:block;line-height:1.05;margin-bottom:4px}
    .card.lim{background:var(--lim);border-color:var(--lim);color:var(--esc)} .card.lim small{color:var(--esc)}
    .card.esc{background:var(--esc);border-color:var(--esc);color:#fff} .card.esc small{color:var(--lim)}
    .lista{list-style:none;padding:0;margin:0} .lista li{font-size:19px;line-height:1.4;padding:10px 0 10px 32px;border-bottom:1px solid var(--lin);position:relative}
    .dark .lista li{border-color:rgba(255,255,255,.12)} .lista.x li:before{background:#c0533f} .lista li:before{content:"";position:absolute;left:4px;top:18px;width:13px;height:13px;border-radius:50%;background:var(--lim)}
    table{border-collapse:collapse;width:100%;font-size:19px} td,th{padding:13px 16px;text-align:left;border-bottom:1px solid var(--lin)} th{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut)}
    td.n,th.n{text-align:right;white-space:nowrap} tr.tot td{font-weight:800;font-size:23px;border-bottom:0;background:var(--esc);color:#fff}
    td small{display:block;font-size:15px;color:var(--mut);margin-top:4px}
    .stat{border-left:2px solid var(--lim);padding:0 26px} .stat b{font-size:44px;font-weight:300;display:block;white-space:nowrap} .stat span{font-size:15px;color:#b9c1ae}
    .passo{display:flex;gap:16px;align-items:center;font-size:20px} .passo i{font-style:normal;flex:0 0 44px;height:44px;border-radius:50%;background:var(--lim);color:var(--esc);display:grid;place-items:center;font-weight:800;font-size:17px}
    .foto{position:absolute;top:0;right:0;bottom:0;width:46%;background-size:cover;background-position:center}
    .foto:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,var(--esc) 0%,rgba(34,48,26,.35) 40%,rgba(34,48,26,0) 100%)}
    .cli-logo{max-width:240px;max-height:110px;object-fit:contain;background:#fff;border-radius:8px;padding:10px;margin-top:6px}
    .nota{font-size:15px;color:var(--mut);margin-top:14px}
    @page{size:1440px 810px;margin:0}
    @media screen{body{background:#5d6656;padding:18px 0} .slide{margin:0 auto 18px;box-shadow:0 6px 24px rgba(0,0,0,.25)}}`;

  function montar(p) {
    const d = dadosDe(p), c = calc(p), v = VENDEDORES[d.vendedor] || VENDEDORES.eduardo;
    const paginas = p.tipo === "ev" ? paginasEv(p, d, c, v) : p.tipo === "manutencao" ? paginasManut(p, d, c, v) : paginasSolar(p, d, c, v);
    const total = String(paginas.length).padStart(2, "0");
    const corpo = paginas.map((pg, i) => pg.replace("{{PG}}", `${String(i + 1).padStart(2, "0")} / ${total}`)).join("");
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Proposta ${esc(p.numero || "")} ${esc(d.cliente || "")}</title><style>${CSS}</style></head><body>${corpo}</body></html>`;
  }
  const topo = (kicker, titulo, dark) => `${LOGO(dark ? "#eef0e8" : "#22301a", "#a8c23c")}<div class="kicker">${esc(kicker)}</div><h2>${titulo}</h2><div class="traco"></div>`;
  const pe = d => `<div class="rod">P3 ENERGY${d.cliente ? ` · ${esc(d.cliente.toUpperCase())}` : ""}</div><div class="pg">{{PG}}</div>`;
  const capa = (p, d, titulo, sub, stats) => `
    <section class="slide dark capa">${d.foto_capa ? `<div class="foto" style="background-image:url('${d.foto_capa}')"></div>` : ""}
      <div style="position:relative;max-width:${d.foto_capa ? "760px" : "100%"}">
        ${LOGO("#eef0e8", "#a8c23c")}
        <div class="kicker" style="margin-top:56px">${esc(d._kicker || "Proposta comercial")} · ${esc(mesAno(d.data))}${p.numero ? ` · ${esc(p.numero)}` : ""}</div>
        <h1>${titulo}</h1><div class="traco"></div>
        <p style="font-size:28px;margin:0">${esc(d.cliente || "Cliente")}</p><p class="mut" style="font-size:19px">${esc(sub)}</p>
        ${d.logo_cliente ? `<img class="cli-logo" src="${d.logo_cliente}" alt="">` : ""}
      </div>
      <div style="position:absolute;left:84px;bottom:66px;display:flex">${stats.map(([b, s]) => `<div class="stat"><b>${b}</b><span>${esc(s)}</span></div>`).join("")}</div>
      <div class="pg">{{PG}}</div></section>`;
  const empresa = d => `
    <section class="slide">${topo("A empresa", "P3 Energy")}
      <div class="grid g2" style="gap:60px">
        <div><p>Empresa paranaense de energia renovável fundada em 2021, com projetos personalizados em geração distribuída, mercado livre e mobilidade elétrica.</p>
          <p class="mut">Cuidamos de tudo — do planejamento à operação — com atendimento personalizado, equipe técnica especializada e equipamentos dos melhores fabricantes do mundo.</p>
          <div class="grid g2" style="margin-top:30px"><div class="card"><small>Estados</small><b class="big">5</b><span class="mut">PR · MT · MS · SC · SP</span></div><div class="card"><small>Desde</small><b class="big">2021</b><span class="mut">Ano de fundação</span></div></div></div>
        <div><h3 class="mut" style="font-size:14px;letter-spacing:.2em">Linhas de serviço</h3><ul class="lista">
          <li><b>Energia solar fotovoltaica</b><br><span class="mut" style="font-size:15px">Projeto · Homologação · Instalação · Monitoramento</span></li>
          <li><b>GD compartilhada</b><br><span class="mut" style="font-size:15px">Assinatura de energia · Créditos compartilhados</span></li>
          <li><b>Mercado livre de energia (ACL)</b><br><span class="mut" style="font-size:15px">Migração e gestão para consumidores livres</span></li>
          <li><b>Armazenamento de energia (BESS)</b><br><span class="mut" style="font-size:15px">Baterias de lítio · Backup</span></li>
          <li><b>Mobilidade elétrica</b><br><span class="mut" style="font-size:15px">Eletropostos em Londrina, Maringá, Cascavel e mais</span></li></ul></div>
      </div>${pe(d)}</section>`;
  const contato = (d, v, passos, frase) => `
    <section class="slide dark">${topo("Cronograma", "Próximos passos", true)}
      <div class="grid ${passos.length > 4 ? "g3" : "g2"}" style="gap:22px 40px;margin-bottom:40px">${passos.map((s, i) => `<div class="passo"><i>${String(i + 1).padStart(2, "0")}</i><span>${esc(s)}</span></div>`).join("")}</div>
      <div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:30px">
        <div><small>P3 Energy · contato</small><p style="margin:0;font-size:21px">${esc(frase)}</p>${d.fechamento ? `<p class="mut" style="margin:8px 0 0;font-size:17px">${esc(d.fechamento)}</p>` : ""}</div>
        <div style="text-align:right;font-size:19px;line-height:1.6;white-space:nowrap"><b>${esc(v.nome)}</b><br>${esc(v.tel)}<br><span style="color:var(--lim)">${esc(v.email)}</span></div>
      </div>
      <p class="mut" style="margin-top:20px;font-size:15px">P3 Energy · CNPJ ${CNPJ} · Proposta válida por ${n(d.validade_dias) || 15} dias a partir de ${esc(dataLonga(d.data))}.</p>
      <div class="pg">{{PG}}</div></section>`;

  function graficoRetorno(c) {
    const W = 1270, H = 270, ult = c.porAno[c.porAno.length - 1].acumulado, max = Math.max(c.investimento, ult, 1), bw = W / c.porAno.length;
    const y = v => H - (v / max) * (H - 16);
    const barras = c.porAno.map((a, i) => `<rect x="${i * bw + 3}" y="${y(a.acumulado)}" width="${bw - 6}" height="${H - y(a.acumulado)}" rx="3" fill="${c.investimento && a.acumulado >= c.investimento ? "#a8c23c" : "#c9cfbd"}"/>${(i + 1) % 5 === 0 || i === 0 ? `<text x="${i * bw + bw / 2}" y="${H + 22}" font-size="15" text-anchor="middle" fill="#5f6858">ano ${a.ano}</text>` : ""}`).join("");
    const inv = c.investimento ? `<line x1="0" x2="${W}" y1="${y(c.investimento)}" y2="${y(c.investimento)}" stroke="#22301a" stroke-width="2" stroke-dasharray="8 6"/><text x="6" y="${y(c.investimento) - 8}" font-size="15" fill="#22301a" font-weight="700">Investimento ${brl(c.investimento)}</text>` : "";
    return `<svg viewBox="0 -10 ${W} ${H + 40}" width="100%" height="${H + 40}" role="img" aria-label="Economia acumulada ao longo dos anos">${barras}${inv}</svg>`;
  }

  // Como fica a conta com solar no 1º ano (Lei 14.300 / REN 1.059), linha a linha.
  function composicaoConta(d, c) {
    const m = c.m1, linhas = [];
    if (d.grupo === "A") {
      linhas.push(["Demanda contratada", `${numx(d.demanda_kw)} kW`, m.dem]);
      linhas.push(["Energia da rede não compensada", `${num(m.naoComp)} kWh`, m.energia]);
      linhas.push([`Fio B sobre a energia compensada (${Math.round(m.fat * 100)}% em ${c.ano0})`, `${num(m.comp)} kWh`, m.fio]);
    } else if (m.minimoAplicado) {
      linhas.push(["Mínimo da ligação (custo de disponibilidade)", `${num(m.disp)} kWh`, m.minimo]);
    } else {
      linhas.push(["Energia da rede não compensada", `${num(m.naoComp)} kWh`, m.energia]);
      linhas.push([`Fio B sobre a energia compensada (${Math.round(m.fat * 100)}% em ${c.ano0})`, `${num(m.comp)} kWh`, m.fio]);
    }
    if (m.ilum) linhas.push(["Iluminação pública", "", m.ilum]);
    if (m.ucs && m.ucs.length) {
      linhas.unshift(["UC principal", "onde fica o sistema", null]);
      for (const u of m.ucs) linhas.push([`${u.nome} (Grupo ${u.grupo})`, `recebe ${num(u.credito)} kWh em créditos (${num(u.pct * 100)}%) · compensa ${num(u.comp)} kWh${u.minimoAplicado ? " · paga o mínimo" : ""}`, u.com]);
    }
    const ag = d.aneel && d.aneel.agente ? `${d.aneel.agente} ${d.aneel.subgrupo}${d.grupo === "A" ? " " + d.aneel.modalidade : ""}` : "";
    return `<div><h3>Conta com solar · 1º ano</h3><table style="font-size:16px"><tbody>${linhas.map(([a, b, x]) => `<tr><td style="padding:${linhas.length > 5 ? 5 : 8}px 10px">${x == null ? `<b>${esc(a)}</b>` : esc(a)}${b ? `<small>${esc(b)}</small>` : ""}</td><td class="n" style="padding:${linhas.length > 5 ? 5 : 8}px 10px">${x == null ? "" : brl(x)}</td></tr>`).join("")}
      <tr class="tot"><td style="padding:9px 10px">Total por mês</td><td class="n" style="padding:9px 10px">${brl(c.estimado)}</td></tr></tbody></table>
</div>`;
  }
  function notaConta(d, c) {
    const m = c.m1, ag = d.aneel && d.aneel.agente ? `${d.aneel.agente} ${d.aneel.subgrupo}${d.grupo === "A" ? " " + d.aneel.modalidade : ""}` : "";
    return `<p class="nota" style="font-size:13px;line-height:1.4;margin-top:14px">Lei 14.300/2022 e REN ANEEL 1.059/2023${d.regra === "gd1" ? " (GD I: sem Fio B sobre o compensado)" : ": Fio B escalonado sobre a energia compensada"}; o mínimo da ligação não é cobrado em duplicidade.${m.sobra > 1 ? ` Sobram cerca de ${num(m.sobra)} kWh/mês em créditos (válidos por 60 meses).` : ""}${ag ? ` Tarifas: ${esc(ag)} (ANEEL), com ICMS ${num(d.icms_pct)}% e PIS/COFINS ${num(d.pis_cofins_pct)}%.` : ""}</p>`;
  }
  // Páginas da bateria: o armazenamento (capacidade, cargas, autonomia) e, se a calculadora tiver aparelhos,
  // a lista das cargas atendidas no backup.
  function slidesBateria(d, c, comSolar) {
    const capKwh = n(d.bat_kwh) * (n(d.bat_qtd) || 1), k = calcCargas(d);
    const pgs = [`<section class="slide dark">${topo("Armazenamento de energia", "Energia quando a rede falta", true)}
      <div class="grid g3">
        <div class="card"><small>Capacidade</small><b class="big">${numx(capKwh)} kWh</b><span class="mut">${esc(d.bat_modelo)}</span></div>
        <div class="card"><small>Cargas essenciais</small><b class="big">${num(d.carga_critica_kw, 1)} kW</b><span class="mut">potência média atendida no backup</span></div>
        <div class="card lim"><small>Autonomia estimada</small><b class="big">${num(c.autonomia, 1)} h</b><span>com as cargas essenciais ligadas</span></div>
      </div>
      <ul class="lista" style="margin-top:28px"><li>Backup automático das cargas essenciais em quedas de energia</li>${comSolar ? "<li>Guarda a sobra do dia para usar à noite e no horário de ponta</li><li>O inversor híbrido gerencia solar, bateria e rede de forma automática</li>" : "<li>Recarrega pela rede e fica pronta para a próxima falta</li><li>Preparada para receber placas solares no futuro, se o inversor híbrido permitir</li>"}</ul>
      <p class="nota" style="color:#b9c1ae">Autonomia estimada com ${num(UTIL_BAT * 100)}% da capacidade útil das baterias; varia conforme o consumo real no momento da falta.</p>${pe(d)}</section>`];
    if (k.linhas.length && d.cargas_pdf !== false) {
      const muitas = k.linhas.length > 8, pad = muitas ? "6px 12px" : "9px 14px";
      pgs.push(`<section class="slide">${topo("Dimensionamento do backup", "O que fica ligado quando a energia cai")}
      <div class="grid" style="grid-template-columns:1.6fr 1fr;gap:40px">
        <table style="font-size:${muitas ? 15 : 17}px"><thead><tr><th style="padding:${pad}">Aparelho</th><th class="n" style="padding:${pad}">Qtd</th><th class="n" style="padding:${pad}">Potência</th><th class="n" style="padding:${pad}">Horas</th><th class="n" style="padding:${pad}">Energia</th></tr></thead><tbody>
          ${k.linhas.slice(0, 14).map(l => `<tr><td style="padding:${pad}">${esc(l.nome || "Aparelho")}${n(l.btu) ? ` <span class="mut">${num(l.btu)} BTU</span>` : ""}</td><td class="n" style="padding:${pad}">${num(l.qtd)}</td><td class="n" style="padding:${pad}">${num(l.pot)} W</td><td class="n" style="padding:${pad}">${numx(l.h)} h</td><td class="n" style="padding:${pad}">${numx(r2(l.kwh))} kWh</td></tr>`).join("")}
          <tr class="tot"><td style="padding:${pad}" colspan="4">Energia no período</td><td class="n" style="padding:${pad}">${numx(r2(k.kwh))} kWh</td></tr></tbody></table>
        <div class="grid" style="gap:16px;align-content:start">
          <div class="card"><small>Tudo ligado ao mesmo tempo</small><b class="big">${num(k.potKw, 1)} kW</b><span class="mut">pico de ${num(k.picoKw, 1)} kW na partida dos motores</span></div>
          <div class="card lim"><small>Baterias necessárias</small><b class="big">${numx(k.kwh / UTIL_BAT > 0 ? r2(k.kwh / UTIL_BAT) : 0)} kWh</b><span>proposta: ${numx(capKwh)} kWh (${num(n(d.bat_qtd) || 1)} × ${numx(d.bat_kwh)} kWh)</span></div>
        </div>
      </div>
      <p class="nota">Geladeira, freezer e ar-condicionado contam só o tempo em que o compressor está ligado. Valores típicos de mercado; o consumo real depende dos aparelhos do local.</p>${pe(d)}</section>`);
    }
    return pgs;
  }
  // "As duas opções" na mesma proposta: solar + bateria × só bateria.
  function slideOpcoes(d, c) {
    const b = calcSoBateria(d);
    return `<section class="slide">${topo("Opções", "Duas formas de fazer")}
      <div class="grid g2" style="gap:32px">
        <div class="card lim" style="padding:30px"><small>Opção 1 · Solar + bateria</small><b class="big">${brl(c.investimento)}</b>
          <ul class="lista" style="margin-top:14px"><li>${num(c.kwp, 2)} kWp gerando cerca de ${num(c.geracao)} kWh/mês</li>${d.mostrar_economia === false ? "" : `<li>Economia de cerca de ${brl(c.mensal)} por mês na conta</li>`}<li>Backup de ${numx(b.capKwh)} kWh · cerca de ${num(b.autonomia, 1)} h</li></ul></div>
        <div class="card" style="padding:30px"><small>Opção 2 · Só bateria (sem solar)</small><b class="big">${brl(b.investimento)}</b>
          <ul class="lista" style="margin-top:14px"><li>Backup de ${numx(b.capKwh)} kWh · cerca de ${num(b.autonomia, 1)} h</li><li>Protege as cargas essenciais nas quedas de energia</li><li>Sem geração: a conta de luz não muda</li></ul></div>
      </div>
      <p class="nota">As condições de pagamento da opção 1 estão na próxima página. A opção 2: ${brl(b.avista)} à vista${b.parcelas.length ? ` ou ${b.parcelas.map(x => `${x.q}× de ${brl(x.valor)}`).join(", ")}` : ""}.</p>${pe(d)}</section>`;
  }
  function paginasBateria(p, d, c, v) {
    const pgs = [];
    pgs.push(capa(p, d, "Armazenamento<br>de energia", d.cidade ? `${d.cidade} · ${dataLonga(d.data)}` : dataLonga(d.data),
      [[`${numx(c.capKwh)} kWh`, "Armazenamento"], [`${num(c.autonomia, 1)} h`, "Autonomia estimada"], [brl(c.investimento), "Investimento"]]));
    pgs.push(empresa(d));
    pgs.push(...slidesBateria(d, c, false));
    const det = [["Baterias", `${num(n(d.bat_qtd) || 1)} × ${numx(d.bat_kwh)} kWh · ${d.bat_modelo}`], ["Inversor híbrido", d.inv_hibrido], ["Capacidade total", `${numx(c.capKwh)} kWh`], ["Garantia das baterias", d.bat_garantia]];
    let itens = [["Sistema", `${d.bat_modelo} · ${d.inv_hibrido}`, n(d.valor_bateria)], ["Implantação", "Engenharia, instalação, quadro de cargas essenciais e comissionamento", n(d.valor_impl_bat)]].filter(x => x[2]);
    if (!itens.length && c.investimento) itens = [["Sistema + implantação", `Baterias, ${String(d.inv_hibrido || "inversor híbrido").toLowerCase()}, instalação e comissionamento`, c.investimento]];
    const fp = formasPagamento(p, d, c);
    pgs.push(`<section class="slide">${topo("Investimento", "O sistema e as condições")}
      <div class="grid g2" style="gap:40px">
        <table style="font-size:16px"><tbody>${det.filter(x => x[1]).map(([a, b]) => `<tr><td class="mut" style="width:38%;padding:7px 12px">${esc(a)}</td><td style="padding:7px 12px"><b>${esc(b)}</b></td></tr>`).join("")}</tbody></table>
        <table style="font-size:16px"><tbody>${itens.map(([a, b, x]) => `<tr><td style="padding:7px 12px"><b>${esc(a)}</b><small style="font-size:13px">${esc(b)}</small></td><td class="n" style="padding:7px 12px">${brl(x)}</td></tr>`).join("") || `<tr><td class="mut">Preencha os valores.</td><td></td></tr>`}
          <tr class="tot"><td style="padding:9px 12px">Valor total</td><td class="n" style="padding:9px 12px">${brl(c.investimento)}</td></tr></tbody></table>
      </div>
      <h3 style="margin:20px 0 10px;font-size:14px;letter-spacing:.16em;color:var(--mut)">Formas de pagamento</h3>
      ${cardsPagamento(fp)}
      <p class="nota" style="margin-top:10px">Tempo de execução: <b>${esc(d.prazo)}</b>. Parcelamento sujeito à aprovação.</p>${pe(d)}</section>`);
    pgs.push(contato(d, v, ["Levantamento das cargas essenciais", "Assinatura do contrato", "Aquisição dos equipamentos", "Montagem do quadro de cargas essenciais", "Instalação e comissionamento", "Teste de falta de energia"], "Estamos prontos para garantir a sua energia."));
    return pgs;
  }
  function paginasSolar(p, d, c, v) {
    if (c.soBateria) return paginasBateria(p, d, c, v);
    const bat = p.tipo === "bateria", capKwh = n(d.bat_kwh) * (n(d.bat_qtd) || 1);
    const pgs = [];
    pgs.push(capa(p, d, bat ? "Energia solar<br>com bateria" : "Energia solar", d.cidade ? `${d.cidade} · ${dataLonga(d.data)}` : dataLonga(d.data),
      [[`${num(c.kwp, 2)} kWp`, "Potência do sistema"], [`${num(c.geracao)} kWh`, "Geração média mensal"], ...(d.mostrar_economia === false ? [] : [[`${Math.round(c.pct * 100)}%`, "Economia na conta"]])].concat(bat ? [[`${numx(capKwh)} kWh`, "Armazenamento"]] : [])));
    pgs.push(empresa(d));
    if (d.mostrar_economia !== false) pgs.push(`<section class="slide">${topo("Estudo de consumo", "Simulação de economia")}
      <div class="grid g3">
        <div class="card"><small>Custo sem solar (estimado)</small><b class="big">${brl(c.conta)}</b><span class="mut">por mês · ${num(c.consumo)} kWh</span></div>
        <div class="card"><small>Custo com solar (estimado)</small><b class="big">${brl(c.comSolar)}</b><span class="mut">por mês · taxa mínima e encargos</span></div>
        <div class="card lim"><small>Economia projetada</small><b class="big">${brl(c.mensal)}</b><span>por mês · cerca de ${Math.round(c.pct * 100)}%</span></div>
      </div>
      <div class="grid g2" style="margin-top:28px;gap:40px">
        <div><h3>Energia</h3><ul class="lista"><li>Consumo médio: <b>${num(c.consumo)} kWh/mês</b></li><li>Geração projetada: <b>${num(c.geracao)} kWh/mês</b></li><li>Cobertura do consumo: <b>${Math.round(c.cobertura * 100)}%</b></li>${c.autoconsumo ? `<li>Consumido na hora (simultaneidade ${num(d.simultaneidade)}%): <b>${num(c.autoconsumo)} kWh/mês</b></li>` : ""}</ul>${c.eco ? notaConta(d, c) : ""}</div>
        ${c.eco ? composicaoConta(d, c) : `<div><h3>Projeto</h3><ul class="lista"><li>Potência do sistema: <b>${num(c.kwp, 2)} kWp</b></li><li>${esc(`${num(d.qtd_modulos)} módulos ${d.modulo_marca} ${num(d.modulo_w)} W`)}</li><li>${esc(bat ? d.inv_hibrido : d.inversor)}</li></ul></div>`}
      </div>${pe(d)}</section>`);
    if (d.mostrar_economia !== false) pgs.push(`<section class="slide">${topo("Retorno do investimento", "Retorno ao longo dos anos")}
      <div class="grid g4">
        <div class="card"><small>Economia 1º ano</small><b class="big">${brl(c.ano1)}</b></div>
        <div class="card"><small>Economia 5 anos</small><b class="big">${brl(c.ano5)}</b></div>
        <div class="card"><small>Economia ${Math.min(20, c.anos)} anos</small><b class="big">${brl(c.ano20)}</b></div>
        <div class="card esc"><small>Payback estimado</small><b class="big">${c.payback != null ? `${num(c.payback, 1)} anos` : "—"}</b></div>
      </div>
      <div style="margin-top:24px">${graficoRetorno(c)}</div>
      <p class="nota">Economia acumulada em ${c.anos} anos: ${brl(c.total)}. Valores estimados com ${num(d.reajuste, 1)}% de reajuste anual da tarifa e ${num(d.degradacao, 1)}% de perda de rendimento dos módulos por ano${c.eco && d.regra !== "gd1" ? ", com o Fio B sobre a energia compensada subindo conforme a Lei 14.300 (até 100% em 2029)" : ""}.</p>${pe(d)}</section>`);
    const det = [["Potência do sistema", `${num(c.kwp, 2)} kWp`], ["Módulos", `${num(d.qtd_modulos)} × ${num(d.modulo_w)} W ${d.modulo_marca}`], [bat ? "Inversor híbrido" : "Inversor", bat ? d.inv_hibrido : d.inversor], ["Geração média mensal", `${num(c.geracao)} kWh/mês`], ["Estrutura", d.estrutura]];
    if (bat) det.push(["Baterias", `${num(n(d.bat_qtd) || 1)} × ${numx(d.bat_kwh)} kWh · ${d.bat_modelo}`]);
    pgs.push(`<section class="slide">${topo("Detalhamento do projeto", "O sistema")}
      <div class="grid" style="grid-template-columns:1.35fr 1fr;gap:40px">
        <table><tbody>${det.filter(x => x[1]).map(([a, b]) => `<tr><td class="mut" style="width:40%">${esc(a)}</td><td><b>${esc(b)}</b></td></tr>`).join("")}</tbody></table>
        <div class="grid" style="gap:16px;align-content:start">
          <div class="card lim"><small>Garantia dos módulos</small>${esc(d.garantia_modulo)}</div>
          <div class="card"><small>Garantia do inversor</small>${esc(d.garantia_inversor)}</div>
          ${bat ? `<div class="card"><small>Garantia das baterias</small>${esc(d.bat_garantia)}</div>` : ""}
        </div>
      </div>${pe(d)}</section>`);
    if (bat) pgs.push(...slidesBateria(d, c, true));
    if (bat && d.bat_modo === "ambas") pgs.push(slideOpcoes(d, c));
    const itens = [["Equipamentos", "Módulos, inversor, estrutura e materiais", n(d.valor_equip)], ...(bat ? [["Baterias", `${d.bat_modelo} · ${d.inv_hibrido}`, n(d.valor_bateria)]] : []), ["Projeto e implantação", "Engenharia, homologação, instalação e materiais complementares", n(d.valor_impl)]].filter(x => x[2]);
    const fp = formasPagamento(p, d, c);
    if (fp.separado) pgs.push(`<section class="slide">${topo("Investimento", "Condições comerciais")}
      <table style="font-size:18px"><tbody>
        ${itens.map(([a, b, x]) => `<tr><td style="padding:10px 16px"><b>${esc(a)}</b><small>${esc(b)}</small></td><td class="n" style="padding:10px 16px">${brl(x)}</td></tr>`).join("")}
        <tr class="tot"><td style="padding:11px 16px">Valor total do projeto</td><td class="n" style="padding:11px 16px">${brl(c.investimento)}</td></tr></tbody></table>
      <h3 style="margin:20px 0 10px;font-size:14px;letter-spacing:.16em;color:var(--mut)">Formas de pagamento · cada parte separada${fp.mostrarJunto ? " ou o sistema completo" : ""}</h3>
      ${cardsPagamento(fp)}
      <p class="nota" style="margin-top:10px">Tempo de execução: <b>${esc(d.prazo)}</b>. ${esc(d.pagamento_obs || "")} Parcelamento sujeito à aprovação.</p>${pe(d)}</section>`);
    else pgs.push(`<section class="slide">${topo("Investimento", "Condições comerciais")}
      <div class="grid" style="grid-template-columns:1.3fr 1fr;gap:44px">
        <div><table><thead><tr><th>Item</th><th class="n">Valor</th></tr></thead><tbody>
          ${itens.map(([a, b, x]) => `<tr><td><b>${esc(a)}</b><small>${esc(b)}</small></td><td class="n">${brl(x)}</td></tr>`).join("") || `<tr><td class="mut">Preencha os valores do projeto.</td><td></td></tr>`}
          <tr class="tot"><td>Valor total do projeto</td><td class="n">${brl(c.investimento)}</td></tr></tbody></table>
          <p class="nota">Tempo de execução: <b>${esc(d.prazo)}</b>. ${esc(d.pagamento_obs || "")}</p></div>
        <div class="grid" style="gap:16px;align-content:start">
          <div class="card lim"><small>À vista</small><b class="big">${brl(c.avista)}</b>${c.avista < c.investimento ? `<span>desconto de ${brl(c.investimento - c.avista)}</span>` : ""}</div>
          ${c.parcelas.length ? `<div class="card"><small>Parcelado</small>${c.parcelas.map(x => `<div style="font-size:21px;padding:3px 0">${x.q}× <b>${brl(x.valor)}</b></div>`).join("")}<span class="mut" style="font-size:15px">sujeito à aprovação</span></div>` : ""}
        </div>
      </div>${pe(d)}</section>`);
    if (d.layout_img) pgs.push(`<section class="slide">${topo("Implantação", "Layout projetado")}<div style="position:absolute;left:84px;right:84px;top:220px;bottom:70px;background:#fff url('${d.layout_img}') center/contain no-repeat;border:1px solid var(--lin);border-radius:8px"></div>${pe(d)}</section>`);
    pgs.push(contato(d, v, ["Validação do projeto executivo", "Assinatura do contrato", "Homologação na concessionária", "Aquisição dos equipamentos", "Instalação e comissionamento", "Vistoria e conexão à rede"], "Estamos prontos para dar início ao seu projeto de energia."));
    return pgs;
  }

  // ───────── formas de pagamento ─────────
  // Por parte (solar: equipamentos, baterias e implantação; EV: cada linha do investimento), cada uma com seu
  // à vista (vazio = o valor) e seu parcelado (acréscimo % sobre o valor), e também tudo junto.
  const listaParcelas = (base, txt, juros) => String(txt || "").split(/[,;\s]+/).map(Number).filter(x => x > 1).map(q => ({ q, valor: r2(base * (1 + n(juros) / 100) / q) }));
  const vazioOu = (v, padrao) => v === "" || v == null ? padrao : n(v);
  function formasPagamento(p, d, c) {
    const grupos = p.tipo === "ev"
      ? (d.investimento || []).filter(l => n(l.valor)).map(l => ({ nome: l.descricao || "Item", valor: n(l.valor), avista: vazioOu(l.avista, n(l.valor)), parcelas: listaParcelas(n(l.valor), l.parcelas, l.juros) }))
      : (c.soBateria ? [["Sistema", n(d.valor_bateria), d.avista_bat, d.parcelas_bat, d.juros_bat], ["Implantação", n(d.valor_impl_bat), d.avista_impl, d.parcelas_impl, d.juros_impl]]
        : [["Equipamentos", n(d.valor_equip), d.avista_equip, d.parcelas_equip, d.juros_equip], ...(p.tipo === "bateria" ? [["Baterias", n(d.valor_bateria), d.avista_bat, d.parcelas_bat, d.juros_bat]] : []), ["Implantação", n(d.valor_impl), d.avista_impl, d.parcelas_impl, d.juros_impl]])
        .filter(g => g[1]).map(([nome, valor, av, par, j]) => ({ nome, valor, avista: vazioOu(av, valor), parcelas: listaParcelas(valor, par, j) }));
    // Sem valores por parte, mas com o à vista preenchido: o parcelado sai do à vista (antes saía R$ 0).
    const baseJunto = c.investimento || vazioOu(d.avista, 0);
    const junto = { junto: true, nome: p.tipo === "ev" ? "Investimento total" : "Sistema + implantação", valor: baseJunto, avista: vazioOu(d.avista, baseJunto), parcelas: listaParcelas(baseJunto, d.parcelas, d.juros_parcela) };
    const separado = !!d.pag_separado && grupos.length > 1;
    return { grupos, junto, separado, mostrarJunto: !separado || d.pag_junto !== false };
  }
  const cardPagamento = (g, destaque) => `<div class="card ${destaque ? "lim" : ""}" style="padding:20px 22px"><small>${esc(g.nome)}${!g.junto ? ` · ${brl(g.valor)}` : ""}</small>
    <b class="big" style="font-size:30px;white-space:nowrap">${brl(g.avista)}</b><span ${destaque ? "" : 'class="mut"'} style="font-size:15px">à vista${g.avista < g.valor ? ` · desconto de ${brl(g.valor - g.avista)}` : ""}</span>
    ${g.parcelas.length ? `<div style="margin-top:10px;font-size:18px;line-height:1.55">${g.parcelas.map(x => `ou ${x.q}× <b>${brl(x.valor)}</b>`).join("<br>")}</div>` : ""}</div>`;
  const cardsPagamento = fp => { const cards = [...(fp.separado ? fp.grupos.map(g => cardPagamento(g, false)) : []), ...(fp.mostrarJunto ? [cardPagamento(fp.junto, true)] : [])]; return `<div class="grid" style="grid-template-columns:repeat(${cards.length},1fr);gap:16px">${cards.join("")}</div>`; };
  const textoForma = g => `${g.nome}${!g.junto ? ` (${brl(g.valor)})` : ""}: ${brl(g.avista)} à vista${g.parcelas.length ? ` ou ${g.parcelas.map(x => `${x.q}× de ${brl(x.valor)}`).join(", ")}` : ""}`;

  function paginasEv(p, d, c, v) {
    const q = c.qtd, pl = (x, s, pp) => `${x} ${x > 1 ? pp : s}`;
    const pgs = [];
    pgs.push(capa(p, d, "Carregador<br>veicular", d.cidade ? `${d.cidade} · ${dataLonga(d.data)}` : dataLonga(d.data),
      [[pl(q, "ponto", "pontos"), "de recarga"], [`${num(d.potencia_kw)} kW`, `${d.corrente} por carregador`], [brl(c.investimento), "investimento"]]));
    pgs.push(empresa(d));
    const objetivo = d.objetivo || `Implantar ${pl(q, "ponto", "pontos")} de recarga ${d.corrente} de ${num(d.potencia_kw)} kW, com infraestrutura elétrica dedicada e conexão a partir do ponto de espera${d.cliente ? ` do cliente ${d.cliente}` : ""}. A proposta prioriza execução direta, segurança operacional e preparo para acompanhamento de uso desde o início da operação.`;
    const escopo = [`${pl(q, `carregador ${d.corrente} ${num(d.potencia_kw)} kW`, `carregadores ${d.corrente} ${num(d.potencia_kw)} kW`)}${d.modelo ? ` · ${d.modelo}` : ""}`];
    if (d.clamper) escopo.push(`${q} Mobi Smart Clamper`);
    if (d.quadro) escopo.push(`1 quadro dedicado para ${q > 1 ? "os carregadores" : "o carregador"}`);
    escopo.push("Proteção dedicada");
    if (d.desligamento) escopo.push(pl(q, "dispositivo de desligamento rápido", "dispositivos de desligamento rápido"));
    escopo.push(...linhas(d.escopo_extra));
    pgs.push(`<section class="slide">${topo("Objetivo e escopo", "Implantação simples, segura e pronta para operar")}
      <div class="grid g2" style="gap:56px">
        <div><p style="font-size:22px">${esc(objetivo)}</p><div class="card esc" style="margin-top:18px"><small>Conexão</small>${esc(d.conexao)}</div></div>
        <div><h3>Escopo de implantação</h3><ul class="lista">${escopo.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
          <p class="nota">A implantação contempla montagem, interligação elétrica, proteção, configuração inicial, testes e comissionamento.</p></div>
      </div>${pe(d)}</section>`);
    if (d.justificativa) pgs.push(`<section class="slide">${topo("Solução técnica", esc(d.justificativa_titulo || "Por que esta solução"))}
      <div style="columns:2;column-gap:56px">${linhas(d.justificativa).map(l => /^[-•]/.test(l) ? `<p style="font-size:18px;margin:0 0 7px;padding-left:22px;position:relative;break-inside:avoid"><span style="position:absolute;left:0;color:var(--ver)">●</span>${esc(l.replace(/^[-•]\s*/, ""))}</p>` : `<p style="font-size:18px;margin:8px 0 8px;break-inside:avoid"><b>${esc(l)}</b></p>`).join("")}</div>${pe(d)}</section>`);
    if (d.operacao) pgs.push(`<section class="slide dark">${topo("Operação de recarga", "Controle operacional", true)}
      <p style="max-width:1080px">A operação é gerida pela P3, com controle dos carregadores, monitoramento remoto, suporte técnico e acompanhamento das sessões de recarga. A cobrança pelo aplicativo organiza o uso, registra os pagamentos e gera relatórios de desempenho, receita e demanda.</p>
      <div class="grid g2" style="gap:56px;margin-top:16px">
        <div><h3 style="color:var(--lim)">Gestão P3</h3><ul class="lista"><li>Gestão operacional e financeira da recarga</li><li>Relatórios e análises operacionais</li><li>Controle de disponibilidade e performance dos equipamentos</li><li>Suporte técnico${d.cliente ? ` para ${esc(d.cliente)}` : ""}</li><li>Monitoramento em tempo real dos carregamentos</li></ul></div>
        <div><h3 style="color:var(--lim)">Serviço de cobrança (app)</h3><ul class="lista"><li>Software e monitoramento remoto</li><li>Gateway de pagamento e carteira digital</li><li>Cobrança automática por aplicativo, cartão e Pix</li><li>Suporte técnico para o cliente final</li></ul></div>
      </div>${pe(d)}</section>`);
    const inv = (d.investimento || []).filter(l => l.descricao || n(l.valor));
    pgs.push(`<section class="slide">${topo("Valores", "Investimento e custos")}
      <div class="grid" style="grid-template-columns:1.25fr 1fr;gap:44px">
        <div><h3>Investimento · ${pl(q, "carregador", "carregadores")}</h3><table><tbody>
          ${inv.map(l => `<tr><td><b>${esc(l.descricao)}</b>${l.detalhe ? `<small>${esc(l.detalhe)}</small>` : ""}</td><td class="n">${brl(n(l.valor))}</td></tr>`).join("")}
          <tr class="tot"><td>Investimento total</td><td class="n">${brl(c.investimento)}</td></tr></tbody></table>
          ${linhas(d.pagamento).length ? `<h3 style="margin-top:24px">Condições de pagamento</h3>${linhas(d.pagamento).map(l => `<div style="font-size:18px;padding:4px 0">• ${esc(l)}</div>`).join("")}` : ""}</div>
        <div>${d.operacao ? `<h3>Custos fixos mensais</h3><table><tbody>
          <tr><td>Software de gestão<small>${brl(n(d.software_mensal))} por carregador</small></td><td class="n">${brl(c.software)}</td></tr>
          ${n(d.manutencao_mensal) ? `<tr><td>Manutenção preventiva P3${d.manutencao_opcional ? " (opcional)" : ""}<small>${brl(n(d.manutencao_mensal))} por carregador</small></td><td class="n">${brl(c.manut)}</td></tr>` : ""}
          <tr class="tot"><td>Total fixo mensal</td><td class="n">${brl(n(d.manutencao_mensal) ? c.fixoCom : c.fixoSem)}</td></tr></tbody></table>
          ${n(d.manutencao_mensal) && d.manutencao_opcional ? `<p class="nota">Sem a manutenção preventiva: ${brl(c.fixoSem)} por mês.</p>` : ""}
          ${linhas(d.variaveis).length ? `<h3 style="margin-top:20px">Custos variáveis</h3>${linhas(d.variaveis).map(l => `<div style="font-size:17px;padding:4px 0">• ${esc(l)}</div>`).join("")}` : ""}` : ""}</div>
      </div>${pe(d)}</section>`);
    // Formas de pagamento: página própria quando há pagamento por linha ou parcelado no total.
    const fp = formasPagamento(p, d, c);
    if (fp.separado || fp.junto.parcelas.length || fp.junto.avista < fp.junto.valor) pgs.push(`<section class="slide">${topo("Investimento", "Formas de pagamento")}
      ${cardsPagamento(fp)}
      ${linhas(d.pagamento).length ? `<h3 style="margin:26px 0 8px">Condições</h3>${linhas(d.pagamento).map(l => `<div style="font-size:18px;padding:4px 0">• ${esc(l)}</div>`).join("")}` : ""}
      <p class="nota">Parcelamento sujeito à aprovação.</p>${pe(d)}</section>`);
    // Manutenção só aparece nas responsabilidades quando está nos valores.
    const respP3 = linhas(d.resp_p3).filter(l => !(/manuten/i.test(l) && (!d.operacao || !n(d.manutencao_mensal))));
    pgs.push(`<section class="slide">${topo("Responsabilidades", "Papéis de implantação")}
      <div class="grid g2" style="gap:44px">
        <div class="card"><h3 style="color:var(--ver)">P3 Energy</h3><ul class="lista">${respP3.map(l => `<li>${esc(l)}${/manuten/i.test(l) && d.manutencao_opcional ? " (opcional)" : ""}</li>`).join("")}</ul></div>
        <div class="card"><h3 style="color:var(--ver)">${esc(d.cliente || "Cliente")}</h3><ul class="lista">${linhas(d.resp_cliente).map(l => `<li>${esc(l)}</li>`).join("")}</ul></div>
      </div>${pe(d)}</section>`);
    pgs.push(contato(d, v, ["Validação do ponto de espera e da alimentação disponível", "Aprovação da proposta comercial", "Execução da instalação elétrica, proteções e comissionamento", d.operacao ? "Entrada em operação com software ativo e acompanhamento de uso" : "Entrega técnica e início da operação"], "Estrutura pronta para controle, geração de dados, manutenção recorrente e futura expansão."));
    return pgs;
  }

  // Formas de pagamento da preventiva: o à vista sempre aparece; o parcelado em 3× (padrão) e/ou 12×.
  function formasManut(d, c) {
    const f = [{ rot: "À vista", valor: brl(c.avista), sub: "pagamento único", texto: brl(c.avista) }];
    if (d.pag_3x || !d.pag_12x) f.push({ rot: "Parcelado em 3×", valor: `3× ${brl(c.parcela3)}`, sub: `total de ${brl(c.parcela3 * 3)}`, texto: `3× de ${brl(c.parcela3)}` });
    if (d.pag_12x) f.push({ rot: "Parcelado em 12×", valor: `12× ${brl(c.parcela12)}`, sub: `total de ${brl(c.parcela12 * 12)}`, texto: `12× de ${brl(c.parcela12)}` });
    return f;
  }
  function paginasManut(p, d, c, v) {
    const g = n(d.garantia_meses) || 3, pgs = [];
    pgs.push(capa(p, d, "Manutenção<br>preventiva", `Manutenção inteligente da sua energia solar${d.cidade ? ` · ${d.cidade}` : ""}`,
      [[`${numx(c.kwp)} kWp`, "Potência instalada"], [`${Math.round(c.mod)}`, "Módulos"], [`${g} meses`, "de garantia nos serviços"]]));
    pgs.push(empresa(d));
    pgs.push(`<section class="slide">${topo("Por que fazer", "Tenha o melhor desempenho do seu sistema")}
      <div class="grid g2" style="gap:56px">
        <div><p>A <b>manutenção preventiva</b> é essencial para manter a eficiência e a durabilidade do sistema de energia solar. Inspeções e ajustes regulares evitam falhas maiores e garantem a segurança e o desempenho da usina.</p>
          <p class="mut">Fazemos a manutenção completa, com inspeção técnica e limpeza programada, protegendo o seu investimento e prolongando a vida útil do sistema.</p>
          ${c.economiaAnual ? `<div class="card lim" style="margin-top:18px"><small>Seu sistema economiza cerca de</small><b class="big">${brl(c.economiaAnual)}/ano</b>${d.srv_preventiva && c.pctEconomia ? `<span>A manutenção preventiva representa ${num(c.pctEconomia * 100, 1)}% disso.</span>` : ""}</div>` : ""}</div>
        <div class="grid" style="gap:16px;align-content:start">
          <div class="card"><small>Eficiência</small>Preserva a eficiência do sistema e a geração de energia.</div>
          <div class="card"><small>Segurança</small>Evita falhas, paradas e custos inesperados.</div>
          <div class="card esc"><small>Durabilidade</small>Prolonga a vida útil dos módulos, do inversor e da estrutura.</div>
        </div>
      </div>${pe(d)}</section>`);
    pgs.push(`<section class="slide dark">${topo("O que fazemos", "Manutenção completa, com check-list", true)}
      <div class="grid g3">
        <div class="card"><small>Visita técnica</small><p style="font-size:19px;margin:0">Visita com check-list completo e garantia de ${g} meses sobre os serviços.</p></div>
        <div class="card"><small>Inversor e terminais</small><p style="font-size:19px;margin:0">Limpeza da carcaça e dos exaustores do inversor e limpeza e reaperto dos terminais elétricos.</p></div>
        <div class="card lim"><small>Estrutura</small><p style="font-size:19px;margin:0">Revisão da força mecânica das estruturas, fixadores, grampos e terminais.</p></div>
      </div>
      ${d.srv_monitoramento ? `<div class="card" style="margin-top:20px"><small>Monitoramento</small><p style="font-size:19px;margin:0">Acompanhamento da geração todos os meses, com alerta quando o sistema produz menos do que deveria.</p></div>` : ""}
      ${pe(d)}</section>`);
    pgs.push(`<section class="slide">${topo("Escopo", "Serviços e itens exclusos")}
      <div class="grid g2" style="gap:44px">
        <div class="card"><h3 style="color:var(--ver)">Serviços</h3><ul class="lista">${linhas(d.inclusos).map(l => `<li>${esc(l)}</li>`).join("")}<li>Garantia de ${g} meses na execução dos serviços</li></ul></div>
        <div class="card"><h3 style="color:#a23b2a">Itens exclusos</h3><ul class="lista x">${linhas(d.exclusos).map(l => `<li>${esc(l)}</li>`).join("")}</ul></div>
      </div>${pe(d)}</section>`);
    const formas = formasManut(d, c);
    pgs.push(`<section class="slide">${topo("Investimento", "Sua manutenção")}
      <div class="grid" style="grid-template-columns:1fr 1.3fr;gap:40px">
        <div class="grid" style="gap:16px;align-content:start">
          <div class="card"><small>Cliente</small><b style="font-size:22px">${esc(d.cliente || "—")}</b>${d.endereco || d.cidade ? `<div class="mut">${esc([d.endereco, d.cidade].filter(Boolean).join(" · "))}</div>` : ""}</div>
          <div class="card esc"><small>Potência instalada</small><b class="big">${numx(c.kwp)} kWp</b><span>${Math.round(c.mod)} módulos · ${d.estrutura === "solo" ? "solo" : "telhado"}</span></div>
          <div class="card"><small>Consultor</small>${esc(v.nome)} · ${esc(v.tel)}</div>
        </div>
        <div><table><thead><tr><th>Serviço</th><th class="n">Investimento</th></tr></thead><tbody>
          ${d.srv_preventiva ? `<tr><td><b>Manutenção preventiva</b><small>visita anual com check-list, limpeza dos módulos, inversor e estrutura</small></td><td class="n"><b style="font-size:24px">${brl(c.avista)}</b><small>à vista · ou parcelado (abaixo)</small></td></tr>` : ""}
          ${d.srv_monitoramento ? `<tr><td><b>Monitoramento da geração</b><small>acompanhamento mensal com alertas</small></td><td class="n"><b style="font-size:24px">${brl(c.monitVenda)}/mês</b></td></tr>` : ""}
          ${d.srv_limpeza ? `<tr><td><b>Limpeza dos módulos</b><small>avulsa, ${Math.round(c.mod)} módulos</small></td><td class="n"><b style="font-size:24px">${brl(c.limpezaPreco)}</b></td></tr>` : ""}
          ${d.srv_visita ? `<tr><td><b>Visita técnica / laudo</b><small>avulsa, com relatório</small></td><td class="n"><b style="font-size:24px">${brl(c.visitaPreco)}</b></td></tr>` : ""}
        </tbody></table>
        ${d.srv_preventiva ? `<h3 style="margin:22px 0 10px;font-size:15px;letter-spacing:.14em;color:var(--mut)">Escolha a forma de pagamento da preventiva</h3>
        <div class="grid g${formas.length}" style="gap:14px">${formas.map((f, i) => `<div class="card ${i === 0 ? "lim" : ""}"><small>${esc(f.rot)}</small><b class="big" style="white-space:nowrap;font-size:${formas.length > 2 ? 29 : 36}px">${esc(f.valor)}</b><span ${i ? 'class="mut"' : ""}>${esc(f.sub)}</span></div>`).join("")}</div>` : ""}
        <p class="nota">Valores para uma visita por ano. Deslocamentos e limpezas adicionais são orçados à parte.</p></div>
      </div>${pe(d)}</section>`);
    pgs.push(contato(d, v, ["Aprovação da proposta", "Agendamento da visita técnica", "Execução da manutenção com check-list", "Relatório do sistema e próxima visita"], "Seu sistema protegido e gerando o máximo, todos os anos."));
    return pgs;
  }

  // ───────── texto para mandar junto com o PDF no WhatsApp ─────────
  // Um texto curto por tipo, com os números da proposta, a validade e quem está mandando.
  function textoWhats(p) {
    const d = dadosDe(p), c = calc(p), v = VENDEDORES[d.vendedor] || VENDEDORES.eduardo;
    const eu = v.nome.split(" ")[0];
    const validade = (() => { const x = new Date((d.data || hoje()) + "T12:00:00"); x.setDate(x.getDate() + (n(d.validade_dias) || 15)); return x.toLocaleDateString("pt-BR"); })();
    const para = d.cliente ? ` para ${d.cliente}` : "", nr = p.numero ? ` ${p.numero}` : "";
    const msg = [`Olá! Tudo bem? Aqui é o ${eu}, da P3 Energy.`, ""];
    if (c.soBateria) {
      const k = calcCargas(d);
      msg.push(`Segue em anexo a proposta${nr} do sistema de baterias${para} 🔋`, "",
        `*O sistema*`,
        `• ${num(n(d.bat_qtd) || 1)} × ${numx(d.bat_kwh)} kWh (${d.bat_modelo}) com ${d.inv_hibrido}: ${numx(c.capKwh)} kWh armazenados`,
        `• Quando a energia cai, mantém as cargas essenciais (${num(d.carga_critica_kw, 1)} kW em média) ligadas por cerca de ${num(c.autonomia, 1)} h`,
        ...(k.linhas.length ? [`• Cargas no backup: ${k.linhas.map(l => `${num(l.qtd)} ${l.nome}`).join(", ")}`] : []),
        `• Garantia das baterias: ${d.bat_garantia}`);
      if (d.prazo) msg.push(`• Prazo de execução: ${d.prazo}`);
      msg.push("", `*Investimento*`);
      { const fp = formasPagamento(p, d, c); msg.push(...[...(fp.separado ? fp.grupos : []), ...(fp.mostrarJunto ? [fp.junto] : [])].map(g => `• ${textoForma(g)}`)); }
    } else if (p.tipo === "solar" || p.tipo === "bateria") {
      const bat = p.tipo === "bateria", capKwh = n(d.bat_kwh) * (n(d.bat_qtd) || 1);
      const parc = c.parcelas.length ? c.parcelas[c.parcelas.length - 1] : null;
      msg.push(`Segue em anexo a proposta${nr} do sistema de energia solar${bat ? " com baterias" : ""}${para} ☀️`, "",
        `*O sistema*`,
        `• ${num(c.kwp, 2)} kWp: ${num(d.qtd_modulos)} módulos ${d.modulo_marca} de ${num(d.modulo_w)} W e ${bat ? d.inv_hibrido : d.inversor}`,
        `• Geração média de cerca de ${num(c.geracao)} kWh por mês (${Math.round(c.cobertura * 100)}% do consumo de ${num(c.consumo)} kWh${(d.ucs || []).length ? `, somando ${(d.ucs || []).length + 1} unidades consumidoras` : ""})`);
      if (bat) msg.push(`• ${numx(capKwh)} kWh em baterias (${d.bat_modelo}): quando a energia cai, mantêm as cargas essenciais ligadas por cerca de ${num(c.autonomia, 1)} h`);
      msg.push("", `*O que está incluso*`,
        `• Projeto e homologação na concessionária`,
        `• Equipamentos, estrutura${d.estrutura ? ` (${String(d.estrutura).toLowerCase()})` : ""} e materiais`,
        `• Instalação completa, testes e ligação do sistema`,
        `• Garantia dos módulos: ${d.garantia_modulo}`,
        `• Garantia do inversor: ${d.garantia_inversor}`);
      if (d.prazo) msg.push(`• Prazo de execução: ${d.prazo}`);
      msg.push("", d.mostrar_economia === false ? `*Investimento*` : `*Economia e investimento*`,
        ...(d.mostrar_economia === false ? [] : [`• Conta de luz de ${brl(c.conta)} para cerca de ${brl(c.comSolar)} por mês: economia de ${brl(c.mensal)} (${Math.round(c.pct * 100)}%)`]),
        ...(() => { const fp = formasPagamento(p, d, c); return fp.separado ? [`• Investimento total de ${brl(c.investimento)}. Formas de pagamento:`, ...fp.grupos.map(g => `  – ${textoForma(g)}`), ...(fp.mostrarJunto ? [`  – ${textoForma(fp.junto)}`] : [])] : [`• Investimento de ${brl(c.investimento)}${c.avista < c.investimento ? ` (à vista ${brl(c.avista)})` : ""}${parc ? `, ou em até ${parc.q}× de ${brl(parc.valor)}` : ""}`]; })());
      if (c.payback != null && d.mostrar_economia !== false) msg.push(`• O sistema se paga em cerca de ${num(c.payback, 1)} anos, e em ${c.anos} anos a economia passa de ${brl(c.total)}`);
      if (bat && d.bat_modo === "ambas") { const b = calcSoBateria(d); msg.push("", `*Opção 2: só a bateria (sem solar)*`, `• ${numx(b.capKwh)} kWh de backup, cerca de ${num(b.autonomia, 1)} h, por ${brl(b.investimento)}${b.avista < b.investimento ? ` (à vista ${brl(b.avista)})` : ""}`, `• Não gera energia: protege nas quedas, mas a conta de luz não muda`); }
    } else if (p.tipo === "ev") {
      const q = c.qtd, escopo = [`${q} ${q > 1 ? "carregadores" : "carregador"} ${d.corrente} de ${num(d.potencia_kw)} kW${d.modelo ? ` (${d.modelo})` : ""}`];
      if (d.clamper) escopo.push(`${q} Mobi Smart Clamper`);
      if (d.quadro) escopo.push(`Quadro dedicado com proteção para ${q > 1 ? "os carregadores" : "o carregador"}`);
      if (d.desligamento) escopo.push(`${q} ${q > 1 ? "botões" : "botão"} de desligamento rápido (emergência)`);
      escopo.push(...linhas(d.escopo_extra), "Montagem, ligação elétrica, configuração, testes e comissionamento");
      msg.push(`Segue em anexo a proposta${nr} de implantação de recarga para veículos elétricos${para} ⚡`, "",
        `*O que está incluso*`, ...escopo.map(x => `• ${x}`));
      if (d.conexao) msg.push(`• ${d.conexao}`);
      if (d.operacao) msg.push("", `*Operação pela P3*`,
        `• Gestão dos carregadores, monitoramento em tempo real e suporte técnico`,
        `• Cobrança automática pelo aplicativo, com cartão e Pix, e relatórios de uso e receita`,
        `• Custo fixo de ${brl(c.fixoSem)} por mês (software)${n(d.manutencao_mensal) ? ` + ${brl(c.manut)} de manutenção preventiva${d.manutencao_opcional ? " (opcional)" : ""}` : ""}`);
      if (d.operacao && linhas(d.variaveis).length) msg.push(...linhas(d.variaveis).map(x => `• ${x}`));
      msg.push("", `*Investimento*`, `• ${brl(c.investimento)} na implantação`);
      { const fp = formasPagamento(p, d, c); if (fp.separado || fp.junto.parcelas.length) msg.push(...[...(fp.separado ? fp.grupos : []), ...(fp.mostrarJunto ? [fp.junto] : [])].map(g => `• ${textoForma(g)}`)); }
      if (linhas(d.pagamento).length) msg.push(...linhas(d.pagamento).map(x => `• ${x}`));
    } else if (p.tipo === "manutencao") {
      msg.push(`Segue em anexo a proposta${nr} de manutenção${para}, para o sistema de ${numx(c.kwp)} kWp (${Math.round(c.mod)} módulos) 🔧`, "");
      if (d.srv_preventiva) {
        msg.push(`*Manutenção preventiva (1 visita por ano)*`, ...linhas(d.inclusos).map(x => `• ${x}`), `• Garantia de ${n(d.garantia_meses) || 3} meses nos serviços`, "",
          `*Investimento da preventiva (escolha a forma)*`, ...formasManut(d, c).map(f => `• ${f.rot}: ${f.texto}`));
      }
      const extras = [d.srv_monitoramento && `• Monitoramento da geração, com alerta quando o sistema produz menos: ${brl(c.monitVenda)} por mês`, d.srv_limpeza && `• Limpeza dos módulos (avulsa): ${brl(c.limpezaPreco)}`, d.srv_visita && `• Visita técnica / laudo com relatório (avulsa): ${brl(c.visitaPreco)}`].filter(Boolean);
      if (extras.length) msg.push("", `*Outros serviços*`, ...extras);
      if (linhas(d.exclusos).length) msg.push("", `Não inclui: ${linhas(d.exclusos).map(x => x.charAt(0).toLowerCase() + x.slice(1)).join("; ")}.`);
      if (d.srv_preventiva && c.economiaAnual) msg.push("", `O sistema economiza cerca de ${brl(c.economiaAnual)} por ano. A manutenção mantém essa economia, evita paradas e prolonga a vida útil dos equipamentos.`);
    }
    msg.push("", `A proposta vale até ${validade}. Qualquer dúvida, é só me chamar por aqui. Posso te ligar para explicar os detalhes?`, "", `${v.nome} · P3 Energy`, v.tel);
    return msg.join("\n");
  }
  function mostrarWhats(p) {
    window.P3.modal("Texto para o WhatsApp", `<p class="muted" style="margin:0 0 8px;font-size:12.5px">Mande junto com o PDF. Dá para ajustar o texto antes de copiar.</p>
      <textarea id="prWhats" rows="16" style="width:100%;font:inherit;font-size:14px">${esc(textoWhats(p))}</textarea>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn primary" id="prWhatsCopiar">Copiar</button><a class="btn" id="prWhatsZap" target="_blank" rel="noopener">Abrir no WhatsApp</a></div>`);
    const bgs = document.querySelectorAll(".modal-bg"), bg = bgs[bgs.length - 1];
    const ta = $("#prWhats", bg), zap = $("#prWhatsZap", bg);
    const atual = () => { zap.href = `https://wa.me/?text=${encodeURIComponent(ta.value)}`; };
    ta.oninput = atual; atual();
    $("#prWhatsCopiar", bg).onclick = async () => {
      try { await navigator.clipboard.writeText(ta.value); } catch (_) { ta.select(); document.execCommand("copy"); }
      toast("Texto copiado.", "ok");
    };
  }

  // ───────── imprimir (PDF) ─────────
  function imprimir(p) {
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;width:0;height:0;border:0;left:-9999px";
    f.onload = () => { const t = document.title; document.title = `Proposta P3 - ${dadosDe(p).cliente || p.numero || ""}`; f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => { document.title = t; f.remove(); }, 60000); };
    f.srcdoc = montar(p);
    document.body.appendChild(f);
  }

  // Foto/logo para dentro da proposta: reduz e guarda como imagem embutida.
  function imagem(file, max) {
    return new Promise((ok, erro) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement("canvas");
        cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
        const png = /png|svg/.test(file.type);
        const ctx = cv.getContext("2d"); if (!png) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height); }
        ctx.drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
        ok(cv.toDataURL(png ? "image/png" : "image/jpeg", 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); erro(new Error("Não consegui abrir a imagem.")); };
      img.src = url;
    });
  }

  // ───────── lista ─────────
  async function render(main, params) {
    if (params && params[0]) return editor(main, params[0], params[1]);
    main.innerHTML = `<div class="loading">Carregando as propostas…</div>`;
    let lista;
    try { lista = await api("propostas"); } catch (e) { main.innerHTML = `<div class="note bad">${esc(e.message)}</div>`; return; }
    if (window.P3.state.route !== "propostas") return;
    lista.sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
    const soma = s => lista.filter(p => p.status === s).reduce((t, p) => t + n(p.valor_total), 0);
    main.innerHTML = `
      <div class="head"><div><p class="kicker">Comercial</p><h1>Propostas</h1><p>Proposta da P3 Energy para carregador EV, energia solar ou solar com bateria, com os cálculos prontos e o PDF no padrão da P3.</p></div>
        <div class="actions">${Object.entries(TIPOS).map(([k, l]) => `<a class="btn ${k === "solar" ? "primary" : ""}" href="#/propostas/nova/${k}">+ ${esc(l)}</a>`).join("")}</div></div>
      <div class="kpis">${window.P3.kpi("Propostas", String(lista.length), `${lista.filter(p => p.status === "enviada").length} enviada(s) aguardando`, "lead")}${window.P3.kpi("Em negociação", brl(soma("enviada")), "enviadas")}${window.P3.kpi("Aceitas", brl(soma("aceita")), `${lista.filter(p => p.status === "aceita").length} proposta(s)`)}</div>
      <div class="section"><div class="table-wrap"><table><thead><tr><th>Nº</th><th>Cliente</th><th>Tipo</th><th>Cidade</th><th>Data</th><th class="n">Valor</th><th>Situação</th></tr></thead><tbody>
        ${lista.map(p => { const [l, k] = STATUS[p.status] || [p.status, ""]; const d = dadosDe(p); return `<tr class="clickable" data-go="#/propostas/${encodeURIComponent(p.id)}"><td>${esc(p.numero || "—")}</td><td><b>${esc(p.cliente || "(sem nome)")}</b></td><td>${esc(TIPOS[p.tipo])}</td><td>${esc(p.cidade || "")}</td><td>${fmt.data(d.data)}</td><td class="n">${brl(p.valor_total)}</td><td>${window.P3.badge(l, k)}${p.obra_id ? " " + window.P3.badge("Virou obra", "ok") : ""}</td></tr>`; }).join("") || `<tr><td colspan="7" class="empty">Nenhuma proposta ainda. Comece por um dos botões acima.</td></tr>`}</tbody></table></div></div>`;
    $$("[data-go]", main).forEach(tr => tr.onclick = () => window.P3.go(tr.dataset.go));
    // Agendar a execução: abre a tarefa já ligada a esta proposta (vira cobrança quando for concluída).
    $$("thead tr", main).forEach(tr => tr.insertAdjacentHTML("beforeend", "<th></th>"));
    $$("tr[data-go]", main).forEach(tr => tr.insertAdjacentHTML("beforeend", `<td class="right"><button type="button" class="btn ghost sm" data-agendar="${esc(decodeURIComponent(tr.dataset.go.split("/").pop()))}">📅 Agendar</button></td>`));
    $$("[data-agendar]", main).forEach(b => b.onclick = e => { e.stopPropagation(); window.P3_TAREFAS.agendar("proposta", b.dataset.agendar); });
  }

  async function numeroNovo() {
    const ano = new Date().getFullYear(), todas = await api("propostas");
    const doAno = todas.map(p => String(p.numero || "")).filter(x => x.startsWith(`P3-${ano}-`)).map(x => Number(x.split("-")[2]) || 0);
    return `P3-${ano}-${String(Math.max(0, ...doAno) + 1).padStart(3, "0")}`;
  }

  // ───────── editor ─────────
  async function editor(main, id, tipoNovo) {
    let p;
    if (id === "nova") {
      if (!TIPOS[tipoNovo]) return window.P3.go("#/propostas");
      p = { tipo: tipoNovo, status: "rascunho", dados: novaDados(tipoNovo) };
      if (tipoNovo !== "ev" && tipoNovo !== "manutencao") Object.assign(p.dados, { simultaneidade: 30, fator_kwh_kwp: GER_PADRAO.telhado, eco_v2: true, ano_inicio: new Date().getFullYear() });
    } else {
      main.innerHTML = `<div class="loading">Abrindo a proposta…</div>`;
      try { p = await api(`propostas/${encodeURIComponent(id)}`); } catch (e) { main.innerHTML = `<div class="note bad">${esc(e.message)}</div>`; return; }
      p.dados = dadosDe(p);
    }
    const d = p.dados;
    let sujo = false;
    const campo = (k, rot, tipo = "text", extra = "") => {
      if (tipo === "area") return `<label class="f wide">${rot}<textarea data-k="${k}" rows="${extra || 3}">${esc(d[k] ?? "")}</textarea></label>`;
      if (tipo === "check") return `<label class="f pr-check"><span><input type="checkbox" data-k="${k}" ${d[k] ? "checked" : ""}> ${rot}</span></label>`;
      return `<label class="f">${rot}<input data-k="${k}" ${tipo === "num" ? 'inputmode="decimal"' : `type="${tipo}"`} value="${esc(tipo === "num" ? String(d[k] ?? "").replace(".", ",") : d[k] ?? "")}" ${extra}></label>`;
    };
    const escolha = (k, rot, lista) => `<label class="f">${rot}<select data-k="${k}">${opts(lista, d[k])}</select></label>`;
    const img = (k, rot, ajuda) => `<label class="f wide">${rot}<span class="pr-img">${d[k] ? `<img src="${d[k]}" alt="">` : ""}<input type="file" accept="image/*" data-img="${k}">${d[k] ? `<button type="button" class="btn ghost sm" data-tirar="${k}">Tirar</button>` : ""}</span><small>${ajuda}</small></label>`;
    const bloco = (titulo, html, aberto = true) => `<details class="pr-bloco" ${aberto ? "open" : ""}><summary>${titulo}</summary><div class="grid-form">${html}</div></details>`;
    // Proposta de bateria: "solar" = some no modo só bateria; "bat" = só aparece quando há a opção só bateria.
    const marca = (m, html) => html.replace(/^(\s*)<(details|label|p) /, `$1<$2 data-m="${m}" `);

    const comum = bloco("Cliente e proposta", `
      ${campo("cliente", "Cliente")}${campo("cidade", "Cidade")}${campo("data", "Data", "date")}${campo("validade_dias", "Validade (dias)", "num")}
      ${escolha("vendedor", "Contato na proposta", Object.entries(VENDEDORES).map(([k, x]) => [k, x.nome]))}
      ${img("logo_cliente", "Logo do cliente", "Aparece na capa (opcional).")}${img("foto_capa", "Foto da capa", "Foto do local ou do projeto (opcional).")}
      ${campo("fechamento", "Frase final (opcional)", "area", 2)}`);
    const blocoBat = () => p.tipo !== "bateria" ? "" : bloco("Bateria", `
        ${escolha("bat_modo", "O que vai na proposta", [["solar", "Solar + bateria"], ["bateria", "Só bateria (sem solar)"], ["ambas", "As duas opções na mesma proposta"]])}
        <p class="muted wide" style="margin:0;font-size:12px">Para mandar em propostas separadas: salve esta, toque em Duplicar e troque a opção na cópia.</p>
        ${campo("bat_qtd", "Quantidade de baterias", "num")}${campo("bat_kwh", "Capacidade de cada (kWh)", "num")}${campo("bat_modelo", "Modelo")}
        ${campo("inv_hibrido", "Inversor híbrido")}${campo("carga_critica_kw", "Cargas essenciais no backup (kW)", "num")}${campo("bat_garantia", "Garantia das baterias")}
        <p class="muted wide" style="margin:0;font-size:12px">Os valores ficam em "Investimento e condições".</p>`)
      + bloco("Calculadora de cargas do backup", `<div class="wide" id="prCargas"></div>`);
    const solar = () => blocoBat() + marca("solar", d.eco_v2 ? blocoEco() : bloco("Consumo e conta", `
        <div class="wide note" style="font-size:12.5px">Esta proposta usa o cálculo antigo. <button type="button" class="btn sm" id="prEcoV2">Usar o cálculo da Lei 14.300</button></div>
        <div class="wide"><label class="btn sm" for="prFatura">Ler fatura da Copel (PDF)</label><input type="file" id="prFatura" accept="application/pdf,.pdf" hidden> <span class="muted" id="prFaturaMsg" style="font-size:12.5px">${esc(d.fatura_info || "Puxa o consumo médio dos 12 meses, a tarifa real e o tipo de ligação.")}</span></div>
        ${campo("consumo_kwh", "Consumo médio (kWh/mês)", "num")}${campo("conta_atual", "Conta atual (R$/mês)", "num")}
        ${escolha("fase", "Ligação", [["mono", "Monofásica (30 kWh)"], ["bi", "Bifásica (50 kWh)"], ["tri", "Trifásica (100 kWh)"]])}
        ${campo("fio_b_pct", "Fio B e encargos sobre o compensado (%)", "num")}
        ${campo("simultaneidade", "Simultaneidade (% da geração usada na hora)", "num")}${campo("custo_com_solar", "Custo com solar (R$/mês) — vazio = calcular", "num")}`))
      + marca("solar", bloco("Sistema", `
        ${escolha("instalacao", "Instalação", [["telhado", "Telhado"], ["solo", "Solo"]])}${campo("qtd_modulos", "Quantidade de módulos", "num")}${campo("modulo_w", "Potência do módulo (W)", "num")}${campo("modulo_marca", "Marca do módulo")}
        ${p.tipo === "bateria" ? "" : campo("inversor", "Inversor")}
        <label class="f">Geração (kWh por kWp ao mês)<span style="display:flex;gap:6px"><input data-k="fator_kwh_kwp" inputmode="decimal" value="${esc(String(d.fator_kwh_kwp).replace(".", ","))}"><button type="button" class="btn sm" id="prGeracao" title="Calcula pela cidade (dados de satélite)">Pela cidade</button></span></label>
        ${campo("estrutura", "Estrutura")}${campo("garantia_modulo", "Garantia dos módulos", "area", 2)}${campo("garantia_inversor", "Garantia do inversor", "area", 2)}
        ${img("layout_img", "Layout projetado", "Imagem do layout dos módulos (opcional): vira uma página.")}`))
      + marca("solar", bloco("Custo da obra (planilha solar · não sai no PDF)", `
        ${campo("c_km", "Distância até a obra (km, ida)", "num")}
        ${campo("c_viagens_eng", "Viagens da engenharia", "num")}${campo("c_viagens_equipe", "Viagens da equipe", "num")}${campo("c_pessoas", "Pessoas na equipe", "num")}${campo("c_dias", "Dias de obra (hospedagem)", "num")}
        ${campo("c_kit", "Custo do kit fotovoltaico (R$)", "num")}${p.tipo === "bateria" ? campo("c_bateria", "Custo das baterias e inversor híbrido (R$)", "num") : ""}${campo("c_estrutura", "Estrutura (R$)", "num")}${campo("c_transformador", "Transformador (R$)", "num")}
        ${campo("c_padrao", "Padrão de entrada (R$)", "num")}${campo("c_descarregamento", "Descarregamento (R$)", "num")}${campo("c_conexao", "Conexão (R$)", "num")}${campo("c_comissao", "Comissão (R$)", "num")}${campo("c_terrenista", "Terrenista (R$)", "num")}
        ${campo("c_margem_kwp", "Margem P3 (R$/kWp)", "num")}${escolha("c_faturamento", "Faturamento", [["p3", "Tudo pela P3 (5,93%)"], ["direto", "Kit direto ao cliente (16,33% no serviço)"]])}
        ${campo("c_imp_total", "% imposto · tudo pela P3", "num")}${campo("c_imp_servico", "% imposto · NF de serviço", "num")}
        <div class="wide"><button type="button" class="btn sm primary" id="prCustos">Calcular preço pela planilha</button><p class="muted" id="prLucro" style="margin:8px 0 0;font-size:12.5px;white-space:pre-line"></p></div>`))
      + bloco("Investimento e condições", `
        ${marca("solar", campo("valor_equip", "Equipamentos (R$)", "num"))}${p.tipo === "bateria" ? campo("valor_bateria", "Sistema: baterias e inversor híbrido (R$)", "num") : ""}${marca("solar", campo("valor_impl", p.tipo === "bateria" ? "Implantação com solar (R$)" : "Projeto e implantação (R$)", "num"))}${p.tipo === "bateria" ? marca("bat", campo("valor_impl_bat", "Implantação só da bateria (R$)", "num")) : ""}
        ${campo("pag_separado", "Pagamento separado (cada parte à vista ou parcelada)", "check")}${campo("pag_junto", "Mostrar também o sistema + implantação", "check")}${marca("solar", '<p class="muted wide" style="margin:4px 0 0;font-size:12px;font-weight:600">Equipamentos</p>')}${marca("solar", campo("avista_equip", "À vista (R$) — vazio = valor", "num"))}${marca("solar", campo("parcelas_equip", "Parcelas (ex.: 3, 6, 12)"))}${marca("solar", campo("juros_equip", "Acréscimo no parcelado (%)", "num"))}${p.tipo === "bateria" ? `<p class="muted wide" style="margin:4px 0 0;font-size:12px;font-weight:600">Sistema (baterias e inversor)</p>${campo("avista_bat", "À vista (R$) — vazio = valor", "num")}${campo("parcelas_bat", "Parcelas")}${campo("juros_bat", "Acréscimo no parcelado (%)", "num")}` : ""}<p class="muted wide" style="margin:4px 0 0;font-size:12px;font-weight:600">Implantação</p>${campo("avista_impl", "À vista (R$) — vazio = valor", "num")}${campo("parcelas_impl", "Parcelas (ex.: 3)")}${campo("juros_impl", "Acréscimo no parcelado (%)", "num")}<p class="muted wide" style="margin:4px 0 0;font-size:12px;font-weight:600">Sistema + implantação (valor total)</p>${campo("avista", "À vista (R$) — vazio = valor total", "num")}${campo("parcelas", "Parcelas (ex.: 3, 6, 12)")}${campo("juros_parcela", "Acréscimo no parcelado (%)", "num")}
        ${campo("prazo", "Tempo de execução")}${campo("pagamento_obs", "Observação das condições", "area", 2)}
        ${marca("solar", campo("reajuste", "Reajuste da tarifa ao ano (%)", "num"))}${marca("solar", campo("degradacao", "Perda dos módulos ao ano (%)", "num"))}${marca("solar", campo("anos", "Anos da projeção", "num"))}`);
    const manut = () => bloco("Sistema do cliente", `
        ${campo("kwp", "Potência (kWp)", "num")}${campo("modulos", "Módulos — vazio = kWp ÷ 550 W", "num")}
        ${escolha("estrutura", "Estrutura", [["telhado", "Telhado"], ["solo", "Solo"]])}${campo("km", "Distância até o cliente (km, ida)", "num")}
        ${campo("beneficiarias", "UCs beneficiárias (monitoramento)", "num")}${campo("endereco", "Endereço")}`)
      + bloco("Serviços e pagamento", `
        ${campo("srv_preventiva", "Manutenção preventiva anual", "check")}${campo("srv_monitoramento", "Monitoramento mensal", "check")}
        ${campo("srv_limpeza", "Limpeza dos módulos (avulsa)", "check")}${campo("srv_visita", "Visita técnica / laudo (avulsa)", "check")}
        ${campo("pag_3x", "Oferecer parcelado em 3×", "check")}${campo("pag_12x", "Oferecer parcelado em 12×", "check")}<p class="muted wide" style="margin:0;font-size:12px">O preço à vista sempre aparece na proposta, ao lado do parcelado.</p>
        ${campo("garantia_meses", "Garantia dos serviços (meses)", "num")}`)
      + bloco("Calculadora (planilha de O&M · não sai no PDF)", `
        ${campo("fiscal_pct", "Custo fiscal (%)", "num")}${campo("markup_3x", "Margem no parcelado (%)", "num")}${campo("markup_anual", "Margem à vista / plano anual (%)", "num")}
        ${campo("markup_avulso", "Margem dos avulsos (%)", "num")}${campo("tarifa_kwh", "Tarifa para a economia (R$/kWh)", "num")}${campo("arredondar", "Arredondar preços para R$ 5", "check")}
        <p class="muted wide" id="prManut" style="margin:4px 0 0;font-size:12.5px;white-space:pre-line"></p>`)
      + bloco("Textos", `${campo("inclusos", "Serviços inclusos (um por linha)", "area", 6)}${campo("exclusos", "Itens exclusos (um por linha)", "area", 4)}`, false);
    // Consumo e conta pela Lei 14.300: Grupo B ou A, tarifas da ANEEL (distribuidora/subgrupo) ou da fatura, impostos e regra.
    const so = (g, html) => html.replace(/^<label class="f/, `<label data-g="${g}" class="f`);
    const blocoEco = () => bloco("Consumo, tarifas e economia", `
        ${campo("mostrar_economia", "Mostrar a economia na proposta (desmarque se ainda não há dados de consumo e custo)", "check")}
        ${escolha("grupo", "Grupo", [["B", "Grupo B (baixa tensão)"], ["A", "Grupo A (média tensão)"]])}
        <label class="f">Distribuidora<input data-k="distribuidora" list="prDistrib" value="${esc(d.distribuidora || "")}" placeholder="COPEL-DIS"><datalist id="prDistrib"></datalist></label>
        ${so("B", escolha("subgrupo", "Subgrupo", [["B1", "B1 residencial"], ["B2", "B2 rural"], ["B3", "B3 comercial/industrial"]]))}
        ${so("A", escolha("subgrupo_a", "Subgrupo A", [["A4", "A4 (2,3 a 25 kV)"], ["A3a", "A3a (30 a 44 kV)"], ["A3", "A3 (69 kV)"], ["A2", "A2 (88 a 138 kV)"]]))}
        ${so("A", escolha("modalidade", "Modalidade", [["Verde", "Verde"], ["Azul", "Azul"]]))}
        <div class="wide"><button type="button" class="btn sm" id="prAneel">Buscar tarifas na ANEEL</button> <span class="muted" id="prAneelMsg" style="font-size:12.5px">${esc(d.aneel && d.aneel.info || "TE, TUSD e Fio B vigentes da distribuidora (sem impostos; os impostos abaixo entram por cima).")}</span></div>
        ${campo("icms_pct", "ICMS (%)", "num")}${campo("pis_cofins_pct", "PIS/COFINS (%)", "num")}
        <div class="wide" data-gb="B"><label class="btn sm" for="prFatura">Ler fatura da Copel (PDF)</label><input type="file" id="prFatura" accept="application/pdf,.pdf" hidden> <select data-k="fatura_uso" aria-label="O que usar da fatura">${opts([["tudo", "Usar tudo (consumo, tarifa, ligação)"], ["tarifa", "Só o custo do kWh (projetar outro consumo)"]], d.fatura_uso)}</select> <span class="muted" id="prFaturaMsg" style="font-size:12.5px">${esc(d.fatura_info || "")}</span></div>
        ${so("B", campo("consumo_kwh", "Consumo médio (kWh/mês)", "num"))}${so("B", escolha("fase", "Ligação", [["mono", "Monofásica (mín. 30 kWh)"], ["bi", "Bifásica (mín. 50 kWh)"], ["tri", "Trifásica (mín. 100 kWh)"]]))}
        ${so("B", campo("tarifa_kwh", "Tarifa com impostos (R$/kWh) — vazio = ANEEL", "num"))}${so("B", campo("fio_b_kwh", "Fio B com impostos (R$/kWh) — vazio = ANEEL", "num"))}
        ${so("A", campo("demanda_kw", "Demanda contratada (kW)", "num"))}${so("A", campo("tar_demanda", "Tarifa da demanda (R$/kW) — vazio = ANEEL", "num"))}
        ${so("A", campo("consumo_fp", "Consumo fora de ponta (kWh/mês)", "num"))}${so("A", campo("consumo_p", "Consumo na ponta (kWh/mês)", "num"))}
        ${so("A", campo("tar_fp", "Tarifa fora de ponta c/ impostos — vazio = ANEEL", "num"))}${so("A", campo("tar_p", "Tarifa na ponta c/ impostos — vazio = ANEEL", "num"))}
        ${so("A", campo("fio_fp", "Fio B fora de ponta c/ impostos — vazio = ANEEL", "num"))}${so("A", campo("fio_p", "Fio B na ponta c/ impostos — vazio = ANEEL", "num"))}
        ${campo("ilum_publica", "Iluminação pública (R$/mês)", "num")}${campo("simultaneidade", "Simultaneidade (% da geração usada na hora)", "num")}
        ${escolha("regra", "Regra da geração distribuída", [["gd2", "GD II · Lei 14.300 (paga Fio B escalonado)"], ["gd1", "GD I · direito adquirido (sem Fio B até 2045)"]])}${campo("ano_inicio", "Ano de início da operação", "num")}
        ${campo("custo_com_solar", "Conta com solar (R$/mês) — vazio = calcular", "num")}
        <div class="wide"><p style="margin:6px 0 4px;font-weight:600;font-size:13px">Outras unidades consumidoras (recebem os créditos que sobram)</p><div id="prUcs"></div></div>
        <p class="muted wide" id="prEco" style="margin:2px 0 0;font-size:12.5px;white-space:pre-line"></p>`);
    const ev = () => bloco("Carregadores", `
        ${campo("qtd", "Quantidade", "num")}${escolha("corrente", "Tipo", [["AC", "AC"], ["DC", "DC"]])}${campo("potencia_kw", "Potência (kW)", "num")}${campo("modelo", "Modelo")}
        ${campo("clamper", "Mobi Smart Clamper (um por carregador)", "check")}${campo("quadro", "Quadro dedicado", "check")}${campo("desligamento", "Desligamento rápido (um por carregador)", "check")}${campo("operacao", "Incluir operação e cobrança pelo app", "check")}
        ${campo("conexao", "Conexão", "area", 2)}${campo("escopo_extra", "Outros itens do escopo (um por linha)", "area", 3)}
        ${campo("objetivo", "Objetivo — vazio = texto automático", "area", 3)}`)
      + bloco("Solução técnica (opcional)", `${campo("justificativa_titulo", "Título")}${campo("justificativa", "Texto (uma ideia por linha; comece com - para tópico)", "area", 6)}`, !!d.justificativa)
      + bloco("Valores", `<div class="wide" id="prInv"></div>
        ${campo("software_mensal", "Software por carregador (R$/mês)", "num")}${campo("manutencao_mensal", "Manutenção preventiva por carregador (R$/mês)", "num")}${campo("manutencao_opcional", "Manutenção é opcional", "check")}
        ${campo("variaveis", "Custos variáveis (um por linha)", "area", 2)}${campo("pagamento", "Condições de pagamento (uma por linha)", "area", 3)}${campo("pag_separado", "Pagamento separado por linha (à vista ou parcelado)", "check")}${campo("pag_junto", "Mostrar também o investimento total", "check")}<p class="muted wide" style="margin:4px 0 0;font-size:12px;font-weight:600">Investimento total</p>${campo("avista", "À vista (R$) — vazio = valor total", "num")}${campo("parcelas", "Parcelas (ex.: 3, 6, 12) — vazio = sem parcelado")}${campo("juros_parcela", "Acréscimo no parcelado (%)", "num")}`)
      + bloco("Responsabilidades", `${campo("resp_p3", "P3 Energy (uma por linha)", "area", 5)}${campo("resp_cliente", "Cliente (uma por linha)", "area", 4)}`, false);

    main.innerHTML = `
      <div class="head"><div><p class="kicker"><a href="#/propostas">Propostas</a> · ${esc(TIPOS[p.tipo])}</p><h1>${esc(p.numero || "Nova proposta")}</h1><p id="prResumo"></p></div>
        <div class="actions"><select id="prStatus" aria-label="Situação">${opts(Object.entries(STATUS).map(([k, [l]]) => [k, l]), p.status)}</select>
          <button class="btn" id="prWhatsBtn">Texto p/ WhatsApp</button><button class="btn" id="prPdf">Gerar PDF</button><button class="btn primary" id="prSalvar">Salvar</button></div></div>
      <div class="pr-ed">
        <div class="pr-form">${comum}${p.tipo === "ev" ? ev() : p.tipo === "manutencao" ? manut() : solar()}
          <div class="pr-acoes">${p.id && p.status === "aceita" && !p.obra_id ? `<button class="btn" id="prObra">Virar obra</button>` : ""}${p.obra_id ? `<a class="btn ghost" href="#/obras">Ver em Obras</a>` : ""}${p.id && ["aceita", "executada"].includes(p.status) ? `<a class="btn" href="#/laudos/proposta/${encodeURIComponent(p.id)}">Relatório técnico</a>` : ""}${p.id ? `<button class="btn ghost" id="prCopia">Duplicar</button><button class="btn ghost danger" id="prExcluir">Excluir</button>` : ""}</div></div>
        <div class="pr-prev"><iframe id="prFrame" title="Prévia da proposta"></iframe></div>
      </div>`;

    const frame = $("#prFrame", main);
    const ajustarZoom = () => { const doc = frame.contentDocument; if (doc && doc.documentElement) doc.documentElement.style.zoom = String(frame.clientWidth / 1480); };
    let timer = null;
    const atualizar = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const y = frame.contentWindow ? frame.contentWindow.scrollY : 0;
        frame.onload = () => { ajustarZoom(); frame.contentWindow.scrollTo(0, y); };
        frame.srcdoc = montar(p);
        const c = calc(p);
        const cm = $("#prManut", main);
        if (cm && p.tipo === "manutencao") cm.textContent = [
          `Preventiva — custo: limpeza ${brl(c.limpeza)} (${num(c.mod, 1)} módulos) + visita ${brl(c.visita)} + preventiva ${brl(c.prev)} = ${brl(c.custo)}; com fiscal ${brl(c.fiscal)}.`,
          `Preço: 3× ${brl(c.parcela3)} (${brl(c.parcela3 * 3)}) · 12× ${brl(c.parcela12)} · à vista ${brl(c.avista)}.`,
          `Monitoramento: custo ${brl(c.monitCusto)}/mês → venda ${brl(c.monitVenda)}/mês. Limpeza avulsa: custo ${brl(c.limpezaCusto)} → ${brl(c.limpezaPreco)}. Visita avulsa: custo ${brl(c.visitaCusto)} → ${brl(c.visitaPreco)}.`,
          `Proposta: ${brl(c.investimento)} · custo com fiscal ${brl(c.custoTotal)} · lucro ${brl(c.lucro)}${c.investimento ? ` (${num(c.lucro / c.investimento * 100, 1)}%)` : ""}.`
        ].join("\n");
        $("#prResumo", main).textContent = p.tipo === "manutencao"
          ? `${d.cliente || "Cliente"} · ${numx(c.kwp)} kWp · ${Math.round(c.mod)} módulos · ${c.linhas.map(l => l.nome.split(" (")[0]).join(" + ") || "nenhum serviço"} · ${brl(c.investimento)} · lucro ${brl(c.lucro)}`
          : p.tipo === "ev"
          ? `${d.cliente || "Cliente"} · ${c.qtd} carregador(es) · investimento ${brl(c.investimento)}${d.operacao ? ` · fixo mensal ${brl(n(d.manutencao_mensal) ? c.fixoCom : c.fixoSem)}` : ""}`
          : `${d.cliente || "Cliente"} · ${num(c.kwp, 2)} kWp · ${num(c.geracao)} kWh/mês · economia ${brl(c.mensal)}/mês (${Math.round(c.pct * 100)}%) · ${brl(c.investimento)} · payback ${c.payback != null ? num(c.payback, 1) + " anos" : "—"}`;
        const ec = $("#prEco", main);
        if (ec && c.eco) {
          const m = c.m1, t = c.t;
          ec.textContent = [
            d.grupo === "A" ? `Tarifas c/ impostos: fora de ponta R$ ${num(t.tarFp, 3)} · ponta R$ ${num(t.tarP, 3)} · Fio B fp R$ ${num(t.fioFp, 3)} / p R$ ${num(t.fioP, 3)} · demanda R$ ${num(t.tarDem, 2)}/kW`
              : `Tarifa c/ impostos R$ ${num(t.tar, 3)}/kWh · Fio B R$ ${num(t.fio, 3)}/kWh (${t.tar ? Math.round(t.fio / t.tar * 100) : 0}% da tarifa)`,
            `Mês 1 (${c.ano0}): gera ${num(c.geracao)} kWh · usa na hora ${num(m.auto)} · compensa ${num(m.comp)} · da rede sem compensar ${num(m.naoComp)}${m.sobra > 1 ? ` · sobra ${num(m.sobra)} em créditos` : ""}`,
            `Conta sem solar ${brl(c.conta)} → com solar ${brl(c.estimado)}${m.minimoAplicado ? " (vale o mínimo da ligação)" : ` (Fio B ${Math.round(m.fat * 100)}%: ${brl(m.fio)})`} · economia ${brl(c.mensal)}/mês`,
            ...(m.ucs && m.ucs.length ? [`Créditos que sobram na principal: ${num(m.sobraPrincipal)} kWh → ${m.ucs.map(u => `${u.nome || "UC"} ${num(u.credito)} kWh (conta ${brl(u.com)})`).join(" · ")}${m.sobra > 1 ? ` · ainda sobram ${num(m.sobra)} kWh` : ""}`] : []),
            `Economia por ano: ${c.porAno.slice(0, 5).map(x => `${x.anoCal} ${brl(x.economia)}`).join(" · ")}`
          ].join("\n");
        }
        // Custo e lucro da obra (só na tela): o preço que está na proposta contra a planilha de obra solar.
        const lucro = $("#prLucro", main), os = (p.tipo === "solar" || p.tipo === "bateria") && obraSolar(d, p.tipo);
        if (lucro && os) {
          const k = os.c, kwp = n(os.obra.kwp);
          lucro.textContent = `Custos da obra ${brl(k.sub)} + margem ${brl(k.margemP3)} = preço sugerido ${brl(os.sugerido)}${kwp ? ` (${brl(os.sugerido / kwp)}/kWp)` : ""}.`
            + (os.venda ? `\nNa proposta: ${brl(os.venda)} · imposto ${brl(k.imposto)} · lucro líquido ${brl(k.lucro)} (${num(k.margem * 100, 1)}%).` : "\nToque em \"Calcular preço pela planilha\" para preencher os valores da proposta.");
          lucro.style.color = os.venda && k.lucro < 0 ? "var(--bad)" : "";
        }
      }, 250);
    };
    const NUMS = new Set(["validade_dias", "consumo_kwh", "conta_atual", "fio_b_pct", "qtd_modulos", "modulo_w", "fator_kwh_kwp", "valor_equip", "valor_impl", "juros_parcela", "reajuste", "degradacao", "anos", "bat_qtd", "bat_kwh", "carga_critica_kw", "valor_bateria", "valor_impl_bat", "qtd", "potencia_kw", "software_mensal", "manutencao_mensal",
      "c_km", "c_viagens_eng", "c_viagens_equipe", "c_pessoas", "c_dias", "c_margem_kwp", "c_imp_total", "c_imp_servico", "c_kit", "c_bateria", "c_estrutura", "c_transformador", "c_padrao", "c_descarregamento", "c_conexao", "c_comissao", "c_terrenista",
      "kwp", "km", "beneficiarias", "simultaneidade", "icms_pct", "pis_cofins_pct", "fio_b_parcela", "ilum_publica", "ano_inicio", "demanda_kw", "consumo_fp", "consumo_p", "juros_equip", "juros_bat", "juros_impl", "garantia_meses", "fiscal_pct", "markup_3x", "markup_anual", "markup_avulso", "tarifa_kwh"]);
    const OPCIONAL = new Set(["tarifa_kwh", "fio_b_kwh", "tar_demanda", "tar_fp", "tar_p", "fio_fp", "fio_p", "te_fp", "te_p", "avista", "custo_com_solar", "modulos", "avista_equip", "avista_bat", "avista_impl"]);
    $$("[data-k]", main).forEach(el => {
      el.oninput = el.onchange = () => {
        const k = el.dataset.k;
        d[k] = el.type === "checkbox" ? el.checked : NUMS.has(k) ? n(el.value) : OPCIONAL.has(k) ? (el.value.trim() === "" ? "" : n(el.value)) : el.value;
        sujo = true; atualizar();
        if (k === "pag_separado" && p.tipo === "ev") desenharInv();
        if (k === "instalacao") ajustarGeracao();
        if (k === "grupo") mostrarGrupo();
        if (k === "bat_modo") mostrarModo();
        if (["bat_kwh", "bat_qtd", "bat_modo"].includes(k)) resumoCargas();
        if (k === "fatura_uso") aplicarFatura();
      };
    });
    $$("[data-img]", main).forEach(el => el.onchange = async () => {
      const f = el.files[0]; if (!f) return;
      try {
        d[el.dataset.img] = await imagem(f, el.dataset.img === "logo_cliente" ? 600 : 1600); sujo = true; atualizar();
        const box = el.closest(".pr-img"); let im = $("img", box); if (!im) { im = document.createElement("img"); box.prepend(im); } im.src = d[el.dataset.img];
      } catch (e) { toast(e.message, "bad"); }
    });
    $$("[data-tirar]", main).forEach(b => b.onclick = () => { d[b.dataset.tirar] = ""; sujo = true; const im = $("img", b.closest(".pr-img")); if (im) im.remove(); b.remove(); atualizar(); });

    // Linhas do investimento (EV): descrição, detalhe e valor.
    const desenharInv = () => {
      const box = $("#prInv", main); if (!box) return;
      box.innerHTML = `<div class="pr-inv-t">Investimento</div>${d.investimento.map((l, i) => `<div class="pr-inv"><input data-i="${i}" data-c="descricao" value="${esc(l.descricao)}" placeholder="Item" aria-label="Item"><input data-i="${i}" data-c="detalhe" value="${esc(l.detalhe)}" placeholder="Detalhe (opcional)" aria-label="Detalhe"><input data-i="${i}" data-c="valor" inputmode="decimal" value="${esc(String(l.valor || "").replace(".", ","))}" placeholder="R$" aria-label="Valor"><button type="button" class="btn ghost sm" data-del="${i}" aria-label="Tirar linha">✕</button></div>${d.pag_separado ? `<div class="pr-inv pr-inv2"><input data-i="${i}" data-c="avista" inputmode="decimal" value="${esc(String(l.avista ?? "").replace(".", ","))}" placeholder="À vista (vazio = valor)" aria-label="À vista"><input data-i="${i}" data-c="parcelas" value="${esc(l.parcelas || "")}" placeholder="Parcelas (ex.: 3, 6)" aria-label="Parcelas"><input data-i="${i}" data-c="juros" inputmode="decimal" value="${esc(String(l.juros ?? "").replace(".", ","))}" placeholder="Acréscimo %" aria-label="Acréscimo"><span></span></div>` : ""}`).join("")}
        <button type="button" class="btn sm" id="prInvMais">+ Linha</button> <b style="margin-left:8px">Total: <span id="prInvTot">${brl(calcEv(d).investimento)}</span></b>`;
      $$("[data-i]", box).forEach(el => el.oninput = () => { const l = d.investimento[Number(el.dataset.i)]; l[el.dataset.c] = el.dataset.c === "valor" || el.dataset.c === "juros" ? n(el.value) : el.dataset.c === "avista" ? (el.value.trim() === "" ? "" : n(el.value)) : el.value; $("#prInvTot", box).textContent = brl(calcEv(d).investimento); sujo = true; atualizar(); });
      $$("[data-del]", box).forEach(b => b.onclick = () => { d.investimento.splice(Number(b.dataset.del), 1); desenharInv(); sujo = true; atualizar(); });
      $("#prInvMais", box).onclick = () => { d.investimento.push({ descricao: "", detalhe: "", valor: 0 }); desenharInv(); };
    };
    if (p.tipo === "ev") desenharInv();

    // Modo da proposta de bateria: esconde o que é só do solar (ou só da opção sem solar).
    const mostrarModo = () => {
      const modo = p.tipo === "bateria" ? d.bat_modo || "solar" : "solar";
      $$("[data-m]", main).forEach(el => { el.style.display = (el.dataset.m === "solar" ? modo !== "bateria" : modo !== "solar") ? "" : "none"; });
    };
    // Calculadora de cargas: aparelhos (do catálogo ou livres) → potência, pico, energia e quantas baterias.
    const resumoCargas = () => {
      const box = $("#prCargasRes", main); if (!box) return;
      const k = calcCargas(d);
      if (!k.linhas.length) { box.innerHTML = `<span class="muted">Adicione os aparelhos que devem continuar ligados quando a energia cair.</span>`; return; }
      const falta = k.kwh > k.capAtual * UTIL_BAT + 1e-9;
      box.innerHTML = `<div class="pr-carga-kpis">
          <div><small>Tudo ligado</small><b>${num(k.potKw, 2)} kW</b></div>
          <div><small>Pico na partida</small><b>${num(k.picoKw, 2)} kW</b></div>
          <div><small>Energia no período</small><b>${num(k.kwh, 2)} kWh</b></div>
          <div><small>Carga média</small><b>${num(k.mediaKw, 2)} kW</b></div>
        </div>
        <p style="margin:8px 0 4px">Precisa de <b>${num(k.kwh / UTIL_BAT, 1)} kWh</b> de bateria (${num(UTIL_BAT * 100)}% útil) → <b>${k.nBat} × ${numx(d.bat_kwh)} kWh</b>. Inversor híbrido de pelo menos <b>${num(Math.ceil(k.potKw * 10) / 10, 1)} kW</b> contínuos e pico de ${num(k.picoKw, 1)} kW.</p>
        <p style="margin:0;${falta ? "color:var(--bad)" : ""}">Na proposta hoje: ${numx(k.capAtual)} kWh → ${falta ? `faltam ${num(k.kwh - k.capAtual * UTIL_BAT, 1)} kWh para as ${numx(k.horas)} h` : `atende, com autonomia de cerca de ${num(k.mediaKw ? k.capAtual * UTIL_BAT / k.mediaKw : 0, 1)} h nessa carga`}.</p>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button type="button" class="btn sm primary" id="prCargasUsar">Usar na proposta (${k.nBat} bateria${k.nBat > 1 ? "s" : ""} · ${num(k.mediaKw, 2)} kW)</button>
          <label class="pr-check" style="margin:0"><span><input type="checkbox" id="prCargasPdf" ${d.cargas_pdf !== false ? "checked" : ""}> Mostrar a lista de cargas no PDF</span></label></div>`;
      $("#prCargasUsar", box).onclick = () => {
        d.bat_qtd = Math.max(1, k.nBat); d.carga_critica_kw = r2(k.mediaKw);
        poe("bat_qtd", d.bat_qtd); poe("carga_critica_kw", d.carga_critica_kw);
        sujo = true; atualizar(); resumoCargas(); toast(`Baterias: ${d.bat_qtd} × ${numx(d.bat_kwh)} kWh · cargas ${num(d.carga_critica_kw, 2)} kW.`, "ok");
      };
      $("#prCargasPdf", box).onchange = e => { d.cargas_pdf = e.target.checked; sujo = true; atualizar(); };
    };
    const desenharCargas = () => {
      const box = $("#prCargas", main); if (!box) return;
      if (!Array.isArray(d.cargas)) d.cargas = [];
      const v = x => esc(String(x ?? "").replace(".", ","));
      box.innerHTML = `${d.cargas.length ? `<div class="pr-carga pr-carga-h"><span>Aparelho</span><span>Qtd</span><span>Potência</span><span>Horas</span><span title="Parte do tempo em que o aparelho puxa energia (compressor liga e desliga)">% uso</span><span></span></div>` : ""}
        ${d.cargas.map((c, i) => `<div class="pr-carga">
          <input data-ci="${i}" data-cc="nome" value="${esc(c.nome || "")}" aria-label="Aparelho">
          <input data-ci="${i}" data-cc="qtd" inputmode="decimal" value="${v(c.qtd)}" aria-label="Quantidade">
          <span class="pr-carga-un"><input data-ci="${i}" data-cc="${n(c.fbtu) ? "btu" : "w"}" inputmode="decimal" value="${v(n(c.fbtu) ? c.btu : c.w)}" aria-label="${n(c.fbtu) ? "BTU" : "Watts"}"><i>${n(c.fbtu) ? "BTU" : "W"}</i></span>
          <input data-ci="${i}" data-cc="h" inputmode="decimal" value="${v(c.h)}" aria-label="Horas ligado na falta">
          <input data-ci="${i}" data-cc="uso" inputmode="decimal" value="${v(c.uso)}" aria-label="% do tempo puxando energia">
          <button type="button" class="btn ghost sm" data-cdel="${i}" aria-label="Tirar aparelho">✕</button></div>`).join("")}
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0 2px"><select id="prCargaAdd" aria-label="Adicionar aparelho"><option value="">+ Adicionar aparelho…</option>${APARELHOS.map((a, j) => `<option value="${j}">${esc(a.nome)}${a.btu ? " (BTU)" : ` · ${num(a.w)} W`}</option>`).join("")}</select>
          ${d.cargas.length ? `<span class="muted" style="font-size:12px">Horas = tempo ligado durante a falta de energia.</span>` : ""}</div>
        <div id="prCargasRes" class="pr-carga-res"></div>`;
      $$("[data-ci]", box).forEach(el => el.oninput = () => {
        const c = d.cargas[Number(el.dataset.ci)], k = el.dataset.cc;
        c[k] = k === "nome" ? el.value : n(el.value);
        sujo = true; resumoCargas(); atualizar();
      });
      $$("[data-cdel]", box).forEach(b => b.onclick = () => { d.cargas.splice(Number(b.dataset.cdel), 1); sujo = true; desenharCargas(); atualizar(); });
      $("#prCargaAdd", box).onchange = e => {
        const a = APARELHOS[Number(e.target.value)]; if (!a) return;
        d.cargas.push({ nome: a.nome, qtd: 1, w: a.w || 0, btu: a.btu || "", fbtu: a.fbtu || "", h: a.h, uso: a.uso, partida: a.partida });
        sujo = true; desenharCargas(); atualizar();
        const q = $$('[data-cc="qtd"]', box); if (q.length) q[q.length - 1].select();
      };
      resumoCargas();
    };
    desenharCargas();

    // Preço pela planilha de obra solar: equipamentos = kit; baterias = custo delas; o resto do preço sugerido
    // (implantação, projeto, logística, demais itens e a margem P3) vai em "Projeto e implantação".
    const bc = $("#prCustos", main);
    if (bc) bc.onclick = () => {
      const os = obraSolar(d, p.tipo);
      if (!os) return toast("Abra a tela Obras uma vez e tente de novo.", "bad");
      if (!n(os.obra.kwp)) return toast("Preencha os módulos para ter a potência (kWp).", "bad");
      d.valor_equip = r2(n(d.c_kit));
      if (p.tipo === "bateria") d.valor_bateria = r2(n(d.c_bateria));
      d.valor_impl = r2(Math.max(0, os.sugerido - d.valor_equip - (p.tipo === "bateria" ? d.valor_bateria : 0)));
      for (const k of ["valor_equip", "valor_impl", "valor_bateria"]) { const el = $(`[data-k="${k}"]`, main); if (el) el.value = String(d[k] ?? "").replace(".", ","); }
      sujo = true; atualizar(); toast(`Preço pela planilha: ${brl(os.sugerido)}.`, "ok");
    };
    // Telhado × solo: usa a geração da cidade (se já buscou) ou o padrão da planilha da P3.
    const ajustarGeracao = () => {
      const k = d.instalacao === "solo" ? "solo" : "telhado", outra = k === "solo" ? "telhado" : "solo";
      const daCidade = n(d["ger_" + k]);
      if (daCidade) d.fator_kwh_kwp = daCidade;
      else if (!n(d.fator_kwh_kwp) || [105, GER_PADRAO[outra]].includes(n(d.fator_kwh_kwp))) d.fator_kwh_kwp = GER_PADRAO[k];
      const el = $('[data-k="fator_kwh_kwp"]', main); if (el) el.value = String(d.fator_kwh_kwp).replace(".", ",");
      atualizar();
    };
    // Grupo A × B: mostra só os campos do grupo escolhido.
    const mostrarGrupo = () => { $$("[data-g], [data-gb]", main).forEach(l => { l.style.display = (l.dataset.g || l.dataset.gb) === (d.grupo || "B") ? "" : "none"; }); };
    const poe = (k, v) => { const el = $(`[data-k="${k}"]`, main); if (el) el.value = typeof v === "number" ? String(v).replace(".", ",") : (v ?? ""); };
    // Fatura da Copel: consumo médio do histórico (12 meses), tarifa real sem a iluminação pública e tipo de ligação.
    // "Só o custo do kWh" usa a tarifa e a iluminação, e deixa o consumo livre para projetar outro tamanho.
    const aplicarFatura = () => {
      const f = d.fat; if (!f) return;
      if (d.eco_v2) { d.tarifa_kwh = r2(f.tarifa * 1000) / 1000; d.ilum_publica = f.ilum; poe("tarifa_kwh", d.tarifa_kwh); poe("ilum_publica", d.ilum_publica); }
      if (!d.eco_v2 || d.fatura_uso !== "tarifa") {
        d.consumo_kwh = f.consumo; poe("consumo_kwh", f.consumo);
        if (f.fase) { d.fase = f.fase; poe("fase", f.fase); }
        if (!d.eco_v2) { d.conta_atual = r2(f.consumo * f.tarifa + f.ilum); poe("conta_atual", d.conta_atual); }
      }
    };
    const fat = $("#prFatura", main);
    if (fat) fat.onchange = async e => {
      const arq = e.target.files[0]; e.target.value = ""; if (!arq) return;
      const msg = $("#prFaturaMsg", main); msg.textContent = "Lendo a fatura…";
      try {
        const r = await api("ler-pdf", { method: "POST", raw: true, body: arq, headers: { "X-Nome": encodeURIComponent(arq.name || "fatura.pdf"), "X-So-Ler": "1" } });
        if (!r.ok) throw new Error(r.erro || "Não consegui ler a fatura.");
        const f = r.campos || {};
        const hist = (f.historico || []).map(h => n(h.kwh)).filter(x => x > 0);
        const consumo = hist.length >= 3 ? Math.round(hist.reduce((a, b) => a + b, 0) / hist.length) : n(f.consumoKwh);
        if (!consumo) throw new Error("A fatura não trouxe o consumo em kWh.");
        const ilum = n(f.iluminacaoPublica);
        const tarifa = n(f.consumoKwh) ? Math.max(0, (n(f.semUsina) || n(f.total)) - ilum) / n(f.consumoKwh) : 0;
        d.fat = { consumo, tarifa, ilum, fase: { monofasico: "mono", bifasico: "bi", trifasico: "tri" }[f.fase] || "" };
        if (!d.cliente && f.titular) { d.cliente = f.titular; poe("cliente", d.cliente); }
        if ((!d.cidade || d.cidade === "Londrina") && f.cidade) { d.cidade = f.cidade; poe("cidade", d.cidade); }
        d.fatura_info = `Fatura ${f.referencia || ""}${f.uc || f.ucConces ? ` · UC ${f.uc || f.ucConces}` : ""}: consumo médio ${num(consumo)} kWh${hist.length >= 3 ? ` (${hist.length} meses)` : ""} · tarifa R$ ${num(tarifa, 3)}/kWh com impostos${ilum ? ` · iluminação ${brl(ilum)}` : ""}.`;
        aplicarFatura();
        msg.textContent = d.fatura_info; sujo = true; atualizar(); toast("Fatura lida. Confira os números.", "ok");
      } catch (err) { msg.textContent = err.message; toast(err.message, "bad"); }
    };
    // Tarifas da ANEEL pela distribuidora e subgrupo.
    let distribuidoras = null;
    const dl = $("#prDistrib", main), di = $('[data-k="distribuidora"]', main);
    if (di) di.addEventListener("focus", async () => {
      if (distribuidoras) return;
      try { distribuidoras = (await api("tarifas-aneel", { method: "POST", body: {} })).distribuidoras || []; dl.innerHTML = distribuidoras.map(x => `<option value="${esc(x)}">`).join(""); } catch (_) { distribuidoras = []; }
    });
    const bA = $("#prAneel", main);
    if (bA) bA.onclick = async () => {
      const msg = $("#prAneelMsg", main), sub = d.grupo === "A" ? (d.subgrupo_a || "A4") : (d.subgrupo || "B1");
      if (!d.distribuidora) return toast("Escolha a distribuidora.", "bad");
      bA.disabled = true; msg.textContent = "Buscando na ANEEL…";
      try {
        const r = await api("tarifas-aneel", { method: "POST", body: { agente: d.distribuidora, subgrupo: sub, modalidade: d.grupo === "A" ? d.modalidade : "Convencional" } });
        const P = r.postos || {}, f3 = v => num(v, 4);
        const partes = Object.entries(P).map(([k, x]) => `${{ unico: "", foraPonta: "fora de ponta: ", ponta: "ponta: ", intermediario: "intermediário: " }[k] || ""}TE ${f3(x.te)} + TUSD ${f3(x.tusd)}${x.fioB != null ? ` (Fio B ${f3(x.fioB)})` : ""}`);
        r.info = `${r.agente} ${r.subgrupo}${d.grupo === "A" ? " " + r.modalidade : ""} · vigente desde ${fmt.data(r.vigencia.inicio)} · R$/kWh sem impostos: ${partes.join(" · ")}${r.demanda ? ` · demanda R$ ${num(r.demanda, 2)}/kW` : ""}.`;
        d.aneel = r; msg.textContent = r.info; sujo = true; atualizar(); toast("Tarifas da ANEEL carregadas.", "ok");
      } catch (err) { msg.textContent = err.message; toast(err.message, "bad"); }
      finally { bA.disabled = false; }
    };
    // Proposta antiga: passa a usar o cálculo da Lei 14.300 (a tarifa vem da conta que já estava nela).
    const up = $("#prEcoV2", main);
    if (up) up.onclick = async () => {
      d.eco_v2 = true; if (!d.ano_inicio) d.ano_inicio = new Date().getFullYear();
      if (d.tarifa_kwh === "" && n(d.consumo_kwh)) d.tarifa_kwh = r2(n(d.conta_atual) / n(d.consumo_kwh) * 1000) / 1000;
      try { if (p.id) { await salvar(); editor(main, p.id); } else editor(main, "nova", p.tipo); } catch (err) { toast(err.message, "bad"); }
    };
    mostrarGrupo();
    mostrarModo();
    // Unidades consumidoras extras: nome, grupo, consumo, ligação, tarifa e Fio B (vazio = da principal), iluminação e rateio.
    const desenharUcs = () => {
      const box = $("#prUcs", main); if (!box) return;
      d.ucs = Array.isArray(d.ucs) ? d.ucs : [];
      const inp = (i, k, ph) => `<input data-u="${i}" data-uc="${k}" value="${esc(String(d.ucs[i][k] ?? "").replace(".", ","))}" placeholder="${esc(ph)}" aria-label="${esc(ph)}">`;
      box.innerHTML = d.ucs.map((u, i) => `<div class="pr-bloco" style="padding:8px 10px;margin-bottom:6px"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px">
          ${inp(i, "nome", "Nome da UC")}<select data-u="${i}" data-uc="grupo" aria-label="Grupo">${opts([["B", "Grupo B"], ["A", "Grupo A"]], u.grupo || "B")}</select>
          ${(u.grupo || "B") === "A" ? inp(i, "consumo_fp", "Consumo fora de ponta (kWh)") + inp(i, "consumo_p", "Consumo ponta (kWh)") + inp(i, "demanda_kw", "Demanda (kW)") + inp(i, "tar_fp", "Tarifa fp (vazio = principal)") + inp(i, "tar_p", "Tarifa p (vazio = principal)")
            : inp(i, "consumo", "Consumo (kWh/mês)") + `<select data-u="${i}" data-uc="fase" aria-label="Ligação">${opts([["mono", "Monofásica"], ["bi", "Bifásica"], ["tri", "Trifásica"]], u.fase || "bi")}</select>` + inp(i, "tarifa", "Tarifa (vazio = principal)") + inp(i, "fio", "Fio B (vazio = principal)")}
          ${inp(i, "ilum", "Iluminação (R$)")}${inp(i, "rateio_pct", "Rateio % (vazio = proporcional)")}
        </div><p style="margin:4px 0 0"><button type="button" class="btn ghost sm danger" data-utira="${i}">Tirar</button></p></div>`).join("") + `<button type="button" class="btn sm" id="prUcMais">+ Unidade consumidora</button>`;
      $$("[data-uc]", box).forEach(el => { el.oninput = el.onchange = () => {
        const u = d.ucs[Number(el.dataset.u)], k = el.dataset.uc;
        u[k] = ["nome", "grupo", "fase"].includes(k) ? el.value : (el.value.trim() === "" ? "" : n(el.value));
        sujo = true; atualizar(); if (k === "grupo") desenharUcs();
      }; });
      $$("[data-utira]", box).forEach(b => b.onclick = () => { d.ucs.splice(Number(b.dataset.utira), 1); sujo = true; desenharUcs(); atualizar(); });
      $("#prUcMais", box).onclick = () => { d.ucs.push({ nome: "", grupo: "B", consumo: "", fase: "bi", tarifa: "", fio: "", ilum: "", rateio_pct: "" }); desenharUcs(); };
    };
    desenharUcs();
    const g = $("#prGeracao", main);
    if (g) g.onclick = async () => {
      if (!d.cidade) return toast("Preencha a cidade.", "bad");
      g.disabled = true; g.textContent = "Buscando…";
      try {
        const r = await api(`geracao-local?local=${encodeURIComponent(d.cidade)}&perdas=14`);
        d.ger_telhado = Math.round((r.telhado ? r.telhado.anual : r.anual * 1300 / 1450) / 12 * 10) / 10;
        d.ger_solo = Math.round((r.solo ? r.solo.anual : r.anual) / 12 * 10) / 10;
        d.fator_kwh_kwp = d.instalacao === "solo" ? d.ger_solo : d.ger_telhado;
        $('[data-k="fator_kwh_kwp"]', main).value = String(d.fator_kwh_kwp).replace(".", ",");
        toast(`${r.local}: telhado ${num(d.ger_telhado, 1)} e solo ${num(d.ger_solo, 1)} kWh por kWp ao mês. Usando ${d.instalacao === "solo" ? "solo" : "telhado"}.`, "ok"); sujo = true; atualizar();
      } catch (e) { toast(e.message, "bad"); }
      finally { g.disabled = false; g.textContent = "Pela cidade"; }
    };

    const salvar = async () => {
      const c = calc(p);
      const corpo = { tipo: p.tipo, cliente: d.cliente || null, cidade: d.cidade || null, vendedor: (VENDEDORES[d.vendedor] || {}).nome || null, status: $("#prStatus", main).value, valor_total: c.investimento, dados: d };
      if (!p.id) corpo.numero = await numeroNovo();
      const r = p.id ? await api(`propostas/${encodeURIComponent(p.id)}`, { method: "PUT", body: corpo }) : await api("propostas", { method: "POST", body: corpo });
      sujo = false; return r;
    };
    $("#prSalvar", main).onclick = async e => {
      const b = e.currentTarget; b.disabled = true;
      try { const r = await salvar(); toast("Proposta salva.", "ok"); if (!p.id) return window.P3.go(`#/propostas/${encodeURIComponent(r.id)}`); editor(main, p.id); }
      catch (err) { toast(err.message, "bad"); } finally { b.disabled = false; }
    };
    $("#prStatus", main).onchange = () => { sujo = true; };
    $("#prWhatsBtn", main).onclick = () => mostrarWhats(p);
    $("#prPdf", main).onclick = async () => {
      try {
        if (sujo || !p.id) {
          const r = await salvar();
          if (!p.id) { p.id = r.id; p.numero = r.numero; history.replaceState(null, "", `#/propostas/${encodeURIComponent(r.id)}`); window.P3.state.params = [r.id]; }
        }
      } catch (err) { return toast(err.message, "bad"); }
      toast("Na janela de impressão, escolha \"Salvar como PDF\".", "ok"); imprimir(p);
    };
    const obra = $("#prObra", main);
    if (obra) obra.onclick = async () => {
      const c = calc(p);
      const tipoObra = p.tipo === "manutencao" ? "Manutenção" : p.tipo === "ev" ? (d.corrente === "DC" ? "Eletroposto DC" : "Carregador EV comercial") : c.kwp >= 75 ? "Usina solar" : "Sistema solar residencial";
      if (!await confirmar("Virar obra", `Cria a obra "${esc(d.cliente || p.numero)}" (${esc(tipoObra)}) com venda de ${brl(c.investimento)} na tela Obras. Continuar?`, "Criar obra")) return;
      try {
        const corpo = { nome: d.cliente || p.numero, contratante: p.tipo === "ev" ? "terceiro" : "p3", tipo: tipoObra, cidade: d.cidade, vendedor: (VENDEDORES[d.vendedor] || {}).nome, status: "andamento", modo: "simples", venda: c.investimento, kwp: p.tipo === "ev" ? null : c.kwp, custo: p.tipo === "manutencao" ? c.custoTotal : null, carregadores_dc: p.tipo === "ev" && d.corrente === "DC" ? c.qtd : null, carregadores_ac: p.tipo === "ev" && d.corrente === "AC" ? c.qtd : null, potencia_kw: p.tipo === "ev" ? n(d.potencia_kw) * c.qtd : null, data_inicio: hoje(), origem: "proposta", obs: `Gerada da proposta ${p.numero}.` };
        // Solar: a obra já nasce com o orçamento detalhado da planilha de obra solar e o valor da proposta como contratado.
        const os = (p.tipo === "solar" || p.tipo === "bateria") && !soBateria(p) && obraSolar(d, p.tipo);
        if (os) Object.assign(corpo, { modo: "detalhado", itens: os.obra.itens.filter(i => n(i.qtd) * n(i.unit)), solar: os.obra.solar, valor_contratado: c.investimento, custo: os.c.custo });
        const o = await api("obras", { method: "POST", body: corpo });
        await api(`propostas/${encodeURIComponent(p.id)}`, { method: "PUT", body: { obra_id: o.id } });
        toast("Obra criada.", "ok"); window.P3.go("#/obras");
      } catch (e) { toast(e.message, "bad"); }
    };
    const copia = $("#prCopia", main);
    if (copia) copia.onclick = async () => {
      try {
        const nome = d.cliente ? `${d.cliente} (cópia)` : "";
        const r = await api("propostas", { method: "POST", body: { tipo: p.tipo, cliente: nome || null, cidade: d.cidade, vendedor: p.vendedor, status: "rascunho", valor_total: calc(p).investimento, numero: await numeroNovo(), dados: { ...d, cliente: nome, data: hoje() } } });
        toast("Cópia criada.", "ok"); window.P3.go(`#/propostas/${encodeURIComponent(r.id)}`);
      } catch (e) { toast(e.message, "bad"); }
    };
    const exc = $("#prExcluir", main);
    if (exc) exc.onclick = async () => {
      if (!await confirmar("Excluir proposta", `Excluir a proposta ${esc(p.numero || "")}${d.cliente ? ` de ${esc(d.cliente)}` : ""}?`, "Excluir")) return;
      try { sujo = false; await api(`propostas/${encodeURIComponent(p.id)}`, { method: "DELETE" }); toast("Proposta excluída.", "ok"); window.P3.go("#/propostas"); }
      catch (e) { toast(e.message, "bad"); }
    };
    // Avisa antes de sair da tela com mudanças não salvas.
    window.onbeforeunload = () => sujo ? true : undefined;
    const aoSair = () => { if (!location.hash.startsWith("#/propostas/")) { window.onbeforeunload = null; window.removeEventListener("hashchange", aoSair); if (sujo) toast("A proposta tinha mudanças não salvas.", "bad"); } };
    window.addEventListener("hashchange", aoSair);
    window.addEventListener("resize", ajustarZoom);
    atualizar();
  }

  // Peças do visual da P3 usadas também pelos relatórios técnicos (views-laudos.js).
  const imprimirHtml = (html, titulo) => { const f = document.createElement("iframe"); f.style.cssText = "position:fixed;width:0;height:0;border:0;left:-9999px"; f.onload = () => { const t = document.title; document.title = titulo; f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => { document.title = t; f.remove(); }, 60000); }; f.srcdoc = html; document.body.appendChild(f); };
  window.P3_PROPOSTA = { montar, calcSolar, calcEv, calc, dadosDe, textoWhats, visual: { CSS, LOGO, topo, pe, capa, contato, empresa, imagem, imprimirHtml, VENDEDORES, CNPJ, dataLonga, mesAno, numx, num, linhas, hoje } };
  window.P3.register("propostas", { render });
})();
