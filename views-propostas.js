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

  const TIPOS = { solar: "Energia solar", bateria: "Solar com bateria", ev: "Carregador EV" };
  const STATUS = { rascunho: ["Rascunho", ""], enviada: ["Enviada", "info"], aceita: ["Aceita", "ok"], recusada: ["Recusada", "bad"] };
  const VENDEDORES = {
    eduardo: { nome: "Eduardo Berger Prochet", tel: "(43) 98861-7800", email: "eduardo@p3energy.com.br" },
    rafael: { nome: "Rafael Berger Prochet", tel: "(43) 99925-8220", email: "rafael@p3energy.com.br" }
  };
  const CNPJ = "45.173.949/0001-21";
  const DISPONIBILIDADE = { mono: 30, bi: 50, tri: 100 }; // kWh mínimos cobrados pela concessionária

  // Valores de partida de cada tipo (tudo editável na tela).
  const COMUM = { cliente: "", cidade: "Londrina", data: "", validade_dias: 15, vendedor: "eduardo", logo_cliente: "", foto_capa: "", layout_img: "", fechamento: "" };
  const PADRAO = {
    solar: {
      consumo_kwh: 1000, conta_atual: 1000, fase: "bi", fio_b_pct: 14, custo_com_solar: "",
      qtd_modulos: 16, modulo_w: 620, modulo_marca: "Canadian", inversor: "1 inversor Canadian 7 kW", fator_kwh_kwp: 105, estrutura: "Telhado",
      garantia_modulo: "12 anos contra defeito de fabricação e 25 anos de garantia de performance", garantia_inversor: "10 anos contra defeito de fabricação",
      valor_equip: 0, valor_impl: 0, avista: "", parcelas: "3, 6, 12", juros_parcela: 3, prazo: "2 meses",
      pagamento_obs: "Sujeito à validação da estrutura do telhado.", reajuste: 5, degradacao: 0.5, anos: 25
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
      variaveis: "8 a 10% sobre o faturamento — software e gateway de cobrança\n10% sobre o faturamento — gestão operacional da P3",
      pagamento: "40% na assinatura do contrato\n40% na entrega dos materiais para início das obras\n20% na ligação do carregador",
      resp_p3: "Fornecimento e instalação dos carregadores\nQuadro dedicado, proteção e botoeiras de emergência\nInfraestrutura elétrica a partir do ponto de espera\nConfiguração, testes e comissionamento\nManutenção preventiva P3",
      resp_cliente: "Disponibilizar o ponto de espera para conexão\nLiberar a área para execução da instalação\nFornecimento de internet"
    }
  };
  PADRAO.bateria = { ...PADRAO.solar, bat_qtd: 1, bat_kwh: 10, bat_modelo: "Bateria de lítio LiFePO4", inv_hibrido: "Inversor híbrido", carga_critica_kw: 2, valor_bateria: 0, bat_garantia: "10 anos ou 6.000 ciclos" };
  const novaDados = tipo => ({ ...COMUM, ...JSON.parse(JSON.stringify(PADRAO[tipo])), data: hoje() });
  const dadosDe = p => ({ ...novaDados(p.tipo), ...(p.dados && !Array.isArray(p.dados) ? p.dados : {}) });

  // ───────── cálculos ─────────
  // Conta com solar: o que não é compensado paga a tarifa cheia (inclui a taxa mínima da ligação); o compensado
  // ainda paga o fio B e encargos (Lei 14.300). Ex. Multicampo: 1.244 kWh, R$ 1.287, trifásico, 14% → ~R$ 269.
  function calcSolar(d, tipo) {
    const kwp = r2(n(d.qtd_modulos) * n(d.modulo_w) / 1000);
    const geracao = Math.round(kwp * n(d.fator_kwh_kwp));
    const consumo = n(d.consumo_kwh), conta = n(d.conta_atual);
    const tarifa = consumo ? conta / consumo : 0;
    const disp = DISPONIBILIDADE[d.fase] || 50;
    const compensado = Math.max(0, Math.min(geracao, consumo - disp));
    const estimado = r2((consumo - compensado) * tarifa + compensado * tarifa * n(d.fio_b_pct) / 100);
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
    return { kwp, geracao, consumo, conta, tarifa, comSolar, estimado, mensal, pct: conta ? mensal / conta : 0, investimento, porAno, ano1: soma(1), ano5: soma(5), ano20: soma(Math.min(20, anos)), total: soma(anos), anos, payback, avista, parcelas, autonomia, cobertura: consumo ? geracao / consumo : 0 };
  }
  function calcEv(d) {
    const qtd = Math.max(1, n(d.qtd));
    const investimento = r2((d.investimento || []).reduce((s, l) => s + n(l.valor), 0));
    const software = r2(qtd * n(d.software_mensal)), manut = r2(qtd * n(d.manutencao_mensal));
    return { qtd, investimento, software, manut, fixoCom: r2(software + manut), fixoSem: software };
  }
  const calc = p => p.tipo === "ev" ? calcEv(dadosDe(p)) : calcSolar(dadosDe(p), p.tipo);

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
    .dark .lista li{border-color:rgba(255,255,255,.12)} .lista li:before{content:"";position:absolute;left:4px;top:18px;width:13px;height:13px;border-radius:50%;background:var(--lim)}
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
    const paginas = p.tipo === "ev" ? paginasEv(p, d, c, v) : paginasSolar(p, d, c, v);
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
        <div class="kicker" style="margin-top:56px">Proposta comercial · ${esc(mesAno(d.data))}${p.numero ? ` · ${esc(p.numero)}` : ""}</div>
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

  function paginasSolar(p, d, c, v) {
    const bat = p.tipo === "bateria", capKwh = n(d.bat_kwh) * (n(d.bat_qtd) || 1);
    const pgs = [];
    pgs.push(capa(p, d, bat ? "Energia solar<br>com bateria" : "Energia solar", d.cidade ? `${d.cidade} · ${dataLonga(d.data)}` : dataLonga(d.data),
      [[`${num(c.kwp, 2)} kWp`, "Potência do sistema"], [`${num(c.geracao)} kWh`, "Geração média mensal"], [`${Math.round(c.pct * 100)}%`, "Economia na conta"]].concat(bat ? [[`${numx(capKwh)} kWh`, "Armazenamento"]] : [])));
    pgs.push(empresa(d));
    pgs.push(`<section class="slide">${topo("Estudo de consumo", "Simulação de economia")}
      <div class="grid g3">
        <div class="card"><small>Custo sem solar (estimado)</small><b class="big">${brl(c.conta)}</b><span class="mut">por mês · ${num(c.consumo)} kWh</span></div>
        <div class="card"><small>Custo com solar (estimado)</small><b class="big">${brl(c.comSolar)}</b><span class="mut">por mês · taxa mínima e encargos</span></div>
        <div class="card lim"><small>Economia projetada</small><b class="big">${brl(c.mensal)}</b><span>por mês · cerca de ${Math.round(c.pct * 100)}%</span></div>
      </div>
      <div class="grid g2" style="margin-top:28px;gap:40px">
        <div><h3>Energia</h3><ul class="lista"><li>Consumo médio: <b>${num(c.consumo)} kWh/mês</b></li><li>Geração projetada: <b>${num(c.geracao)} kWh/mês</b></li><li>Cobertura do consumo: <b>${Math.round(c.cobertura * 100)}%</b></li></ul></div>
        <div><h3>Projeto</h3><ul class="lista"><li>Potência do sistema: <b>${num(c.kwp, 2)} kWp</b></li><li>${esc(`${num(d.qtd_modulos)} módulos ${d.modulo_marca} ${num(d.modulo_w)} W`)}</li><li>${esc(bat ? d.inv_hibrido : d.inversor)}</li></ul></div>
      </div>${pe(d)}</section>`);
    pgs.push(`<section class="slide">${topo("Retorno do investimento", "Retorno ao longo dos anos")}
      <div class="grid g4">
        <div class="card"><small>Economia 1º ano</small><b class="big">${brl(c.ano1)}</b></div>
        <div class="card"><small>Economia 5 anos</small><b class="big">${brl(c.ano5)}</b></div>
        <div class="card"><small>Economia ${Math.min(20, c.anos)} anos</small><b class="big">${brl(c.ano20)}</b></div>
        <div class="card esc"><small>Payback estimado</small><b class="big">${c.payback != null ? `${num(c.payback, 1)} anos` : "—"}</b></div>
      </div>
      <div style="margin-top:24px">${graficoRetorno(c)}</div>
      <p class="nota">Economia acumulada em ${c.anos} anos: ${brl(c.total)}. Valores estimados com ${num(d.reajuste, 1)}% de reajuste anual da tarifa e ${num(d.degradacao, 1)}% de perda de rendimento dos módulos por ano.</p>${pe(d)}</section>`);
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
    if (bat) pgs.push(`<section class="slide dark">${topo("Armazenamento de energia", "Energia quando a rede falta", true)}
      <div class="grid g3">
        <div class="card"><small>Capacidade</small><b class="big">${numx(capKwh)} kWh</b><span class="mut">${esc(d.bat_modelo)}</span></div>
        <div class="card"><small>Cargas essenciais</small><b class="big">${num(d.carga_critica_kw, 1)} kW</b><span class="mut">potência média atendida no backup</span></div>
        <div class="card lim"><small>Autonomia estimada</small><b class="big">${num(c.autonomia, 1)} h</b><span>com as cargas essenciais ligadas</span></div>
      </div>
      <ul class="lista" style="margin-top:28px"><li>Backup automático das cargas essenciais em quedas de energia</li><li>Guarda a sobra do dia para usar à noite e no horário de ponta</li><li>O inversor híbrido gerencia solar, bateria e rede de forma automática</li></ul>
      <p class="nota" style="color:#b9c1ae">Autonomia estimada com 90% da capacidade útil das baterias; varia conforme o consumo real no momento da falta.</p>${pe(d)}</section>`);
    const itens = [["Equipamentos", "Módulos, inversor, estrutura e materiais", n(d.valor_equip)], ...(bat ? [["Baterias", `${d.bat_modelo} · ${d.inv_hibrido}`, n(d.valor_bateria)]] : []), ["Projeto e implantação", "Engenharia, homologação, instalação e materiais complementares", n(d.valor_impl)]].filter(x => x[2]);
    pgs.push(`<section class="slide">${topo("Investimento", "Condições comerciais")}
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

    const comum = bloco("Cliente e proposta", `
      ${campo("cliente", "Cliente")}${campo("cidade", "Cidade")}${campo("data", "Data", "date")}${campo("validade_dias", "Validade (dias)", "num")}
      ${escolha("vendedor", "Contato na proposta", Object.entries(VENDEDORES).map(([k, x]) => [k, x.nome]))}
      ${img("logo_cliente", "Logo do cliente", "Aparece na capa (opcional).")}${img("foto_capa", "Foto da capa", "Foto do local ou do projeto (opcional).")}
      ${campo("fechamento", "Frase final (opcional)", "area", 2)}`);
    const solar = () => bloco("Consumo e conta", `
        ${campo("consumo_kwh", "Consumo médio (kWh/mês)", "num")}${campo("conta_atual", "Conta atual (R$/mês)", "num")}
        ${escolha("fase", "Ligação", [["mono", "Monofásica (30 kWh)"], ["bi", "Bifásica (50 kWh)"], ["tri", "Trifásica (100 kWh)"]])}
        ${campo("fio_b_pct", "Fio B e encargos sobre o compensado (%)", "num")}
        ${campo("custo_com_solar", "Custo com solar (R$/mês) — vazio = calcular", "num")}`)
      + bloco("Sistema", `
        ${campo("qtd_modulos", "Quantidade de módulos", "num")}${campo("modulo_w", "Potência do módulo (W)", "num")}${campo("modulo_marca", "Marca do módulo")}
        ${p.tipo === "bateria" ? campo("inv_hibrido", "Inversor híbrido") : campo("inversor", "Inversor")}
        <label class="f">Geração (kWh por kWp ao mês)<span style="display:flex;gap:6px"><input data-k="fator_kwh_kwp" inputmode="decimal" value="${esc(String(d.fator_kwh_kwp).replace(".", ","))}"><button type="button" class="btn sm" id="prGeracao" title="Calcula pela cidade (dados de satélite)">Pela cidade</button></span></label>
        ${campo("estrutura", "Estrutura")}${campo("garantia_modulo", "Garantia dos módulos", "area", 2)}${campo("garantia_inversor", "Garantia do inversor", "area", 2)}
        ${img("layout_img", "Layout projetado", "Imagem do layout dos módulos (opcional): vira uma página.")}`)
      + (p.tipo === "bateria" ? bloco("Bateria", `
        ${campo("bat_qtd", "Quantidade de baterias", "num")}${campo("bat_kwh", "Capacidade de cada (kWh)", "num")}${campo("bat_modelo", "Modelo")}
        ${campo("carga_critica_kw", "Cargas essenciais no backup (kW)", "num")}${campo("bat_garantia", "Garantia das baterias")}${campo("valor_bateria", "Valor das baterias (R$)", "num")}`) : "")
      + bloco("Investimento e condições", `
        ${campo("valor_equip", "Equipamentos (R$)", "num")}${campo("valor_impl", "Projeto e implantação (R$)", "num")}
        ${campo("avista", "À vista (R$) — vazio = valor total", "num")}${campo("parcelas", "Parcelas (ex.: 3, 6, 12)")}${campo("juros_parcela", "Acréscimo no parcelado (%)", "num")}
        ${campo("prazo", "Tempo de execução")}${campo("pagamento_obs", "Observação das condições", "area", 2)}
        ${campo("reajuste", "Reajuste da tarifa ao ano (%)", "num")}${campo("degradacao", "Perda dos módulos ao ano (%)", "num")}${campo("anos", "Anos da projeção", "num")}`);
    const ev = () => bloco("Carregadores", `
        ${campo("qtd", "Quantidade", "num")}${escolha("corrente", "Tipo", [["AC", "AC"], ["DC", "DC"]])}${campo("potencia_kw", "Potência (kW)", "num")}${campo("modelo", "Modelo")}
        ${campo("clamper", "Mobi Smart Clamper (um por carregador)", "check")}${campo("quadro", "Quadro dedicado", "check")}${campo("desligamento", "Desligamento rápido (um por carregador)", "check")}${campo("operacao", "Incluir operação e cobrança pelo app", "check")}
        ${campo("conexao", "Conexão", "area", 2)}${campo("escopo_extra", "Outros itens do escopo (um por linha)", "area", 3)}
        ${campo("objetivo", "Objetivo — vazio = texto automático", "area", 3)}`)
      + bloco("Solução técnica (opcional)", `${campo("justificativa_titulo", "Título")}${campo("justificativa", "Texto (uma ideia por linha; comece com - para tópico)", "area", 6)}`, !!d.justificativa)
      + bloco("Valores", `<div class="wide" id="prInv"></div>
        ${campo("software_mensal", "Software por carregador (R$/mês)", "num")}${campo("manutencao_mensal", "Manutenção preventiva por carregador (R$/mês)", "num")}${campo("manutencao_opcional", "Manutenção é opcional", "check")}
        ${campo("variaveis", "Custos variáveis (um por linha)", "area", 2)}${campo("pagamento", "Condições de pagamento (uma por linha)", "area", 3)}`)
      + bloco("Responsabilidades", `${campo("resp_p3", "P3 Energy (uma por linha)", "area", 5)}${campo("resp_cliente", "Cliente (uma por linha)", "area", 4)}`, false);

    main.innerHTML = `
      <div class="head"><div><p class="kicker"><a href="#/propostas">Propostas</a> · ${esc(TIPOS[p.tipo])}</p><h1>${esc(p.numero || "Nova proposta")}</h1><p id="prResumo"></p></div>
        <div class="actions"><select id="prStatus" aria-label="Situação">${opts(Object.entries(STATUS).map(([k, [l]]) => [k, l]), p.status)}</select>
          <button class="btn" id="prPdf">Gerar PDF</button><button class="btn primary" id="prSalvar">Salvar</button></div></div>
      <div class="pr-ed">
        <div class="pr-form">${comum}${p.tipo === "ev" ? ev() : solar()}
          <div class="pr-acoes">${p.id && p.status === "aceita" && !p.obra_id ? `<button class="btn" id="prObra">Virar obra</button>` : ""}${p.obra_id ? `<a class="btn ghost" href="#/obras">Ver em Obras</a>` : ""}${p.id ? `<button class="btn ghost" id="prCopia">Duplicar</button><button class="btn ghost danger" id="prExcluir">Excluir</button>` : ""}</div></div>
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
        $("#prResumo", main).textContent = p.tipo === "ev"
          ? `${d.cliente || "Cliente"} · ${c.qtd} carregador(es) · investimento ${brl(c.investimento)}${d.operacao ? ` · fixo mensal ${brl(n(d.manutencao_mensal) ? c.fixoCom : c.fixoSem)}` : ""}`
          : `${d.cliente || "Cliente"} · ${num(c.kwp, 2)} kWp · ${num(c.geracao)} kWh/mês · economia ${brl(c.mensal)}/mês (${Math.round(c.pct * 100)}%) · ${brl(c.investimento)} · payback ${c.payback != null ? num(c.payback, 1) + " anos" : "—"}`;
      }, 250);
    };
    const NUMS = new Set(["validade_dias", "consumo_kwh", "conta_atual", "fio_b_pct", "qtd_modulos", "modulo_w", "fator_kwh_kwp", "valor_equip", "valor_impl", "juros_parcela", "reajuste", "degradacao", "anos", "bat_qtd", "bat_kwh", "carga_critica_kw", "valor_bateria", "qtd", "potencia_kw", "software_mensal", "manutencao_mensal"]);
    const OPCIONAL = new Set(["avista", "custo_com_solar"]);
    $$("[data-k]", main).forEach(el => {
      el.oninput = el.onchange = () => {
        const k = el.dataset.k;
        d[k] = el.type === "checkbox" ? el.checked : NUMS.has(k) ? n(el.value) : OPCIONAL.has(k) ? (el.value.trim() === "" ? "" : n(el.value)) : el.value;
        sujo = true; atualizar();
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
      box.innerHTML = `<div class="pr-inv-t">Investimento</div>${d.investimento.map((l, i) => `<div class="pr-inv"><input data-i="${i}" data-c="descricao" value="${esc(l.descricao)}" placeholder="Item" aria-label="Item"><input data-i="${i}" data-c="detalhe" value="${esc(l.detalhe)}" placeholder="Detalhe (opcional)" aria-label="Detalhe"><input data-i="${i}" data-c="valor" inputmode="decimal" value="${esc(String(l.valor || "").replace(".", ","))}" placeholder="R$" aria-label="Valor"><button type="button" class="btn ghost sm" data-del="${i}" aria-label="Tirar linha">✕</button></div>`).join("")}
        <button type="button" class="btn sm" id="prInvMais">+ Linha</button> <b style="margin-left:8px">Total: <span id="prInvTot">${brl(calcEv(d).investimento)}</span></b>`;
      $$("[data-i]", box).forEach(el => el.oninput = () => { const l = d.investimento[Number(el.dataset.i)]; l[el.dataset.c] = el.dataset.c === "valor" ? n(el.value) : el.value; $("#prInvTot", box).textContent = brl(calcEv(d).investimento); sujo = true; atualizar(); });
      $$("[data-del]", box).forEach(b => b.onclick = () => { d.investimento.splice(Number(b.dataset.del), 1); desenharInv(); sujo = true; atualizar(); });
      $("#prInvMais", box).onclick = () => { d.investimento.push({ descricao: "", detalhe: "", valor: 0 }); desenharInv(); };
    };
    if (p.tipo === "ev") desenharInv();

    const g = $("#prGeracao", main);
    if (g) g.onclick = async () => {
      if (!d.cidade) return toast("Preencha a cidade.", "bad");
      g.disabled = true; g.textContent = "Buscando…";
      try {
        const r = await api(`geracao-local?local=${encodeURIComponent(d.cidade)}&perdas=14`);
        d.fator_kwh_kwp = Math.round(r.anual / 12 * 10) / 10;
        $('[data-k="fator_kwh_kwp"]', main).value = String(d.fator_kwh_kwp).replace(".", ",");
        toast(`${r.local}: ${num(r.anual)} kWh por kWp ao ano (${num(d.fator_kwh_kwp, 1)} ao mês).`, "ok"); sujo = true; atualizar();
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
      const tipoObra = p.tipo === "ev" ? (d.corrente === "DC" ? "Eletroposto DC" : "Carregador EV comercial") : c.kwp >= 75 ? "Usina solar" : "Sistema solar residencial";
      if (!await confirmar("Virar obra", `Cria a obra "${esc(d.cliente || p.numero)}" (${esc(tipoObra)}) com venda de ${brl(c.investimento)} na tela Obras. Continuar?`, "Criar obra")) return;
      try {
        const o = await api("obras", { method: "POST", body: { nome: d.cliente || p.numero, contratante: p.tipo === "ev" ? "terceiro" : "p3", tipo: tipoObra, cidade: d.cidade, vendedor: (VENDEDORES[d.vendedor] || {}).nome, status: "andamento", modo: "simples", venda: c.investimento, kwp: p.tipo === "ev" ? null : c.kwp, carregadores_dc: p.tipo === "ev" && d.corrente === "DC" ? c.qtd : null, carregadores_ac: p.tipo === "ev" && d.corrente === "AC" ? c.qtd : null, potencia_kw: p.tipo === "ev" ? n(d.potencia_kw) * c.qtd : null, data_inicio: hoje(), origem: "proposta", obs: `Gerada da proposta ${p.numero}.` } });
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

  window.P3_PROPOSTA = { montar, calcSolar, calcEv, calc, dadosDe };
  window.P3.register("propostas", { render });
})();
