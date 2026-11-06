(function () {
/*
  Relatórios (HTML A4 pronto para PDF). Números só do motor (lib/motor.js).

    cliente(db, { cliente_id, de, ate })            Extrato de economia do cliente
    dono(db, { dono_id, de, ate, usina_id, anonimo }) Extrato do dono da usina
    consolidado(db, { de, ate })                    Visão P3: receita de gestão, repasses, pendências
*/
"use strict";
const motor = window.P3_MOTOR;
const { conferir } = window.P3_CONFERENCIA;

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = v => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const kwh = v => `${Math.round(Number(v) || 0).toLocaleString("pt-BR")} kWh`;
const pct = v => `${((Number(v) || 0) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const pctN = v => `${(Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const dataBR = iso => iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";
const agora = () => new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const periodo = (de, ate) => de === ate ? motor.monthLong(de) : `${motor.monthLong(de)} a ${motor.monthLong(ate)}`;
// A Copel imprime o nº longo com 15 dígitos (zeros à esquerda); a base guarda sem os zeros.
const ucFmt = n => { const s = String(n || ""); return s.length >= 11 ? s.padStart(15, "0") : s; };
const ucNum = u => ucFmt((u && (u.numero || u.numero_conces)) || "");
const iniciais = nome => String(nome || "").split(/\s+/).filter(w => w.length > 2 || /^[A-Z]/.test(w)).map(w => w[0].toUpperCase() + ".").join("") || "—";
const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
// Logo da P3 em vetor (redesenhada do arquivo oficial). a = cor do P e do "ENERGY", b = cor do 3.
const logo = (a, b, alt) => `<svg viewBox="129 169 1743 757" style="height:${alt || 30}px;width:auto;display:block" role="img" aria-label="P3 Energy"><path fill="${a}" d="M129 169H993V623H320V461H817V313H287V926H129Z"/><path fill="${b}" d="M1052 169H1872V926H1052V771H1731V313H1052Z"/><rect fill="${b}" x="1061" y="461" width="636" height="162"/><text x="330" y="923" font-size="206" textLength="690" lengthAdjust="spacingAndGlyphs" fill="${a}" font-family="'Arial Narrow','Roboto Condensed',Arial,sans-serif">ENERGY</text></svg>`;
const STATUS = { aberto: "Em aberto", cobrado: "Cobrado", recebido: "Recebido", repassado: "Repassado" };
const GER = { cliente: "paga pelo cliente", dono: "paga pelo dono", p3: "paga pela P3" };

const CSS = `
@page { size: A4; margin: 14mm 13mm 16mm; @bottom-left { content: "P3 Energy · Gestão de Usinas"; font: 8pt Inter, Arial, sans-serif; color: #6b7a70; } @bottom-right { content: "Página " counter(page) " de " counter(pages); font: 8pt Inter, Arial, sans-serif; color: #6b7a70; } }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font: 9.5pt/1.45 Inter, "Segoe UI", Arial, sans-serif; color: #17221b; background: #fff; }
.page { max-width: 184mm; margin: 0 auto; }
@media screen { body { background: #e9ede9; padding: 24px 0; } .page { background: #fff; padding: 14mm 13mm; box-shadow: 0 2px 18px rgba(0,0,0,.12); } }
header.top { display: flex; justify-content: space-between; align-items: center; background: linear-gradient(90deg, #4f5f42, #6f8547); color: #fff; border-radius: 10px; padding: 12px 16px; margin-bottom: 14px; }
.brand { display: flex; gap: 12px; align-items: center; }
.brand small { color: #dfe7d2; font-size: 8pt; border-left: 1px solid rgba(255,255,255,.35); padding-left: 12px; }
.doc { text-align: right; } .doc h1 { margin: 0; font-size: 14pt; letter-spacing: -.2px; color: #fff; } .doc p { margin: 2px 0 0; color: #dfe7d2; }
/* Extrato do cliente */
.hero { display: flex; justify-content: space-between; gap: 16px; background: #eef3ea; border: 1px solid #dbe5d5; border-radius: 10px; padding: 12px 16px; margin-bottom: 10px; break-inside: avoid; }
.hero h3 { margin: 0; font-size: 10.5pt; } .hero p { margin: 3px 0 0; color: #5b6b61; font-size: 8pt; max-width: 85mm; }
.hero .v { text-align: right; } .hero .v b { display: block; font-size: 20pt; color: #53663a; letter-spacing: -.3px; font-variant-numeric: tabular-nums; }
.hero .v span { display: block; font-size: 8.3pt; color: #4b5a50; } .hero .v .acum { margin-top: 4px; } .hero .v .acum b { display: inline; font-size: 8.3pt; color: #53663a; letter-spacing: 0; }
.cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 8px; break-inside: avoid; }
.card { border: 1px solid #dfe6df; border-radius: 10px; padding: 9px 12px; }
.card small { display: block; color: #6b7a70; font-size: 7.3pt; text-transform: uppercase; letter-spacing: .4px; font-weight: 600; }
.card b { display: block; font-size: 14pt; margin: 2px 0 1px; font-variant-numeric: tabular-nums; } .card span { color: #6b7a70; font-size: 7.8pt; line-height: 1.35; display: block; }
.card.dest { border: 1.5px solid #53663a; } .card.dest b { color: #53663a; } .card b.ver { color: #b4372f; }
.mini { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 4px; break-inside: avoid; }
.mini .card b { font-size: 12pt; }
.pill { display: inline-block; padding: 1px 7px; border-radius: 9px; background: #e2f3e6; color: #4a6b22; font-weight: 600; } .pill.neg { background: #fbe4e1; color: #a1302a; }
.ind { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; break-inside: avoid; }
.ind div.c { border: 1px solid #dfe6df; border-radius: 10px; overflow: hidden; }
.ind h4 { margin: 0; padding: 7px 11px; background: #66793f; color: #fff; font-size: 8.8pt; }
.ind dl { margin: 0; padding: 7px 11px; display: grid; grid-template-columns: 1fr auto; gap: 3px 8px; font-size: 8.3pt; }
.ind dt { color: #4b5a50; } .ind dd { margin: 0; text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
table.cli th, table.cli td { font-size: 7.4pt; padding: 4px 3px; } table.cli th { font-size: 6.3pt; } table.cli td.n { white-space: normal; } table.cli .pill { padding: 1px 5px; }
.nota { color: #6b7a70; font-size: 7.6pt; margin-top: 12px; line-height: 1.5; }
.who { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; background: #f3f6f2; border-radius: 8px; padding: 9px 12px; margin-bottom: 12px; }
.who div small { display: block; color: #6b7a70; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .4px; } .who div b { font-weight: 600; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 0 0 14px; }
.kpi { border: 1px solid #dfe6df; border-radius: 8px; padding: 8px 10px; }
.kpi small { display: block; color: #6b7a70; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .4px; }
.kpi b { display: block; font-size: 13pt; margin-top: 2px; font-variant-numeric: tabular-nums; }
.kpi span { color: #6b7a70; font-size: 8pt; }
.kpi.lead { background: #53663a; border-color: #53663a; color: #fff; } .kpi.lead small, .kpi.lead span { color: #c9e2c9; } .kpi.lead b { color: #d8ef7a; }
h2 { font-size: 10.5pt; margin: 16px 0 6px; color: #53663a; break-after: avoid; }
h2 small { color: #6b7a70; font-weight: 400; font-size: 8.5pt; margin-left: 6px; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; break-inside: auto; }
th, td { padding: 4px 4px; font-size: 8.3pt; border-bottom: 1px solid #e3e9e3; text-align: left; vertical-align: top; }
th { font-size: 6.8pt; text-transform: uppercase; letter-spacing: .2px; color: #4b5a50; background: #f3f6f2; font-weight: 600; }
td.n, th.n { text-align: right; white-space: nowrap; }
tr { break-inside: avoid; }
tfoot td { font-weight: 700; border-top: 1.5px solid #53663a; border-bottom: 0; background: #fafcf9; }
td small { display: block; color: #6b7a70; font-size: 7.5pt; font-weight: 400; }
.pos { color: #4f7d28; } .neg { color: #b4372f; }
.badge { display: inline-block; padding: 1px 6px; border-radius: 9px; font-size: 7.5pt; background: #eef2ee; color: #4b5a50; }
.badge.ok { background: #e2f3e6; color: #4a6b22; } .badge.warn { background: #fdf1d8; color: #8a5a00; } .badge.bad { background: #fbe4e1; color: #a1302a; }
.box { border: 1px solid #dfe6df; border-left: 3px solid #53663a; border-radius: 6px; padding: 8px 11px; margin-top: 14px; background: #fbfcfb; break-inside: avoid; }
.box h3 { margin: 0 0 4px; font-size: 9pt; } .box p, .box li { margin: 2px 0; color: #34433a; font-size: 8.5pt; } .box ul { margin: 0; padding-left: 16px; }
.section { break-inside: avoid-page; }
.bars { display: flex; align-items: flex-end; gap: 4px; height: 70px; margin: 6px 0 2px; }
.bars div { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: stretch; gap: 1px; }
.bars i { display: block; background: #c9d8cc; border-radius: 2px 2px 0 0; } .bars i.e { background: #7b934a; }
.bars-l { display: flex; gap: 4px; font-size: 7pt; color: #6b7a70; } .bars-l span { flex: 1; text-align: center; }
.legend { font-size: 7.5pt; color: #6b7a70; } .legend i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin: 0 3px 0 8px; vertical-align: -1px; }
.empty { color: #6b7a70; font-style: italic; padding: 10px 0; }
.foot { margin-top: 18px; padding-top: 8px; border-top: 1px solid #dfe6df; color: #6b7a70; font-size: 7.5pt; display: flex; justify-content: space-between; gap: 12px; }
`;

function shell(titulo, subtitulo, corpo, meta, rodape) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)} · ${esc(subtitulo)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><style>${CSS}</style></head><body><div class="page">
<header class="top"><div class="brand">${logo("#eef3e2", "#cfe07a", 34)}<small>Gestão de usinas solares</small></div>
<div class="doc"><h1>${esc(titulo)}</h1><p>${esc(subtitulo)}</p></div></header>
${corpo}
<div class="foot"><span>Gerado em ${agora()} · ${esc(rodape || "números calculados a partir das faturas da Copel lançadas na base P3.")}</span><span>${esc(meta || "")}</span></div>
</div></body></html>`;
}

const brlK = v => Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toFixed(1).replace(".", ",")} mil` : brl(v);

// Linhas mês a mês em SVG (sai igual na tela e no PDF). series: [{ get, cor, nome, area, rotuloFim }]
function grafico(meses, series, opts) {
  const o = opts || {}, W = 680, H = o.altura || 150, L = 58, R = 12, T = 14, B = 22;
  const vals = meses.flatMap(m => series.map(sr => sr.get(m)));
  // o.justo: eixo começa perto do menor valor, para a diferença entre as linhas aparecer.
  const topo = Math.max(1, ...vals) * 1.08, base = o.justo ? Math.max(0, Math.min(...vals) * 0.8) : Math.min(0, ...vals);
  const x = i => meses.length === 1 ? (L + W - R) / 2 : L + i * (W - L - R) / (meses.length - 1);
  const y = v => T + (H - T - B) * (1 - (v - base) / (topo - base));
  const grade = [0, 0.5, 1].map(k => base + (topo / 1.08 - base) * k).map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#e3e9e3"/><text x="${L - 6}" y="${y(v) + 3}" text-anchor="end" font-size="8" fill="#6b7a70">${esc(brlK(v))}</text>`).join("");
  const passo = Math.ceil(meses.length / 12);
  const rotulos = meses.map((m, i) => i % passo && i !== meses.length - 1 ? "" : `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="8" fill="#6b7a70">${esc(motor.monthLabel(m.competencia))}</text>`).join("");
  const linhas = series.map(sr => {
    const pts = meses.map((m, i) => `${x(i).toFixed(1)},${y(sr.get(m)).toFixed(1)}`).join(" ");
    const zero = y(Math.max(base, 0)), ult = meses.length - 1, vu = sr.get(meses[ult]);
    return (sr.area ? `<polygon points="${x(0)},${zero} ${pts} ${x(ult)},${zero}" fill="${sr.cor}" opacity=".18"/>` : "")
      + `<polyline points="${pts}" fill="none" stroke="${sr.cor}" stroke-width="2" stroke-linejoin="round"/>`
      + meses.map((m, i) => `<circle cx="${x(i)}" cy="${y(sr.get(m))}" r="2.4" fill="${sr.cor}"/>`).join("")
      + (sr.rotuloFim ? `<text x="${x(ult)}" y="${y(vu) - 7}" text-anchor="end" font-size="9" font-weight="700" fill="${sr.cor}">${esc(brl(vu))}</text>` : "");
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;margin:4px 0 2px" role="img">${grade}${linhas}${rotulos}</svg>
  <div class="legend">${series.map(sr => `<i style="background:${sr.cor}"></i>${esc(sr.nome)}`).join("")}</div>`;
}

// ───────────── Cliente ─────────────
function cliente(db, q) {
  const cli = (db.clientes || []).find(c => c.id === q.cliente_id);
  if (!cli) throw new Error("Cliente não encontrado.");
  const linha = m => {
    const ucs = m.ucs;
    return {
      competencia: m.competencia, ucs,
      consumo: sum(ucs, u => u.consumoKwh), compensado: sum(ucs, u => u.compensadoKwh), sem: sum(ucs, u => u.semUsina), com: sum(ucs, u => u.comUsina),
      arr: sum(ucs, u => u.arrendamento), ger: sum(ucs, u => u.geradora), custo: sum(ucs, u => u.custoTotal), eco: sum(ucs, u => u.economia), nFat: sum(ucs, u => u.faturas.length),
      parcial: ucs.some(u => u.parcial)
    };
  };
  const p = motor.calcPeriodo(db, q.de, q.ate, { cliente_id: cli.id });
  const ix = p.ix;
  const meses = p.meses.map(linha).filter(m => m.nFat > 0);
  const T = k => sum(meses, m => m[k]);
  const ucsCli = (db.ucs || []).filter(u => u.cliente_id === cli.id);
  const usinasCli = [...new Set(ucsCli.flatMap(u => (ix.vincPorUc.get(u.id) || []).map(v => v.usina_id)))].map(id => ix.usinas.get(id)).filter(Boolean);
  const ecoPct = T("sem") > 0 ? T("eco") / T("sem") : 0;

  // Histórico: da primeira fatura do cliente até o fim do período, com a mesma conta do extrato.
  const ucIds = new Set(ucsCli.map(u => u.id));
  const primeira = (db.faturas || []).filter(f => ucIds.has(f.uc_id) && f.competencia).map(f => f.competencia).sort()[0];
  let soma = 0;
  const hist = primeira && primeira <= q.ate ? motor.calcPeriodo(db, primeira, q.ate, { cliente_id: cli.id }).meses.map(linha).filter(m => m.nFat > 0).map(m => ({ ...m, acum: (soma += m.eco) })) : [];
  const ano = q.ate.slice(0, 4);
  const doAno = hist.filter(m => m.competencia.startsWith(ano));
  const A = k => sum(doAno, m => m[k]);
  const desdeInicio = soma;
  const temGer = T("ger") > 0 || A("ger") > 0;
  // Comparação com o mês anterior (só quando o período é um mês).
  const iUlt = hist.findIndex(m => m.competencia === q.ate);
  const ant = q.de === q.ate && iUlt > 0 ? hist[iUlt - 1] : null;
  const varAnt = ant && ant.eco ? (T("eco") - ant.eco) / Math.abs(ant.eco) : null;

  const porUc = new Map();
  for (const m of meses) for (const u of m.ucs) {
    const r = porUc.get(u.uc_id) || { uc: u.uc, consumo: 0, compensado: 0, sem: 0, com: 0, arr: 0, ger: 0, custo: 0, eco: 0 };
    r.consumo += u.consumoKwh; r.compensado += u.compensadoKwh; r.sem += u.semUsina; r.com += u.comUsina; r.arr += u.arrendamento; r.ger += u.geradora; r.custo += u.custoTotal; r.eco += u.economia;
    porUc.set(u.uc_id, r);
  }
  const ucRows = [...porUc.values()].sort((a, b) => b.sem - a.sem);
  const rotulo = periodo(q.de, q.ate), curto = q.de === q.ate ? motor.monthLabel(q.ate) : rotulo;
  const ecoCls = v => v >= 0 ? "pill" : "pill neg";
  const cabec = `<th>Mês</th><th class="n">Consumo kWh</th><th class="n">Créditos kWh</th><th class="n">Copel sem usina</th><th class="n">Copel com créditos</th><th class="n">Arrendamento</th>${temGer ? `<th class="n">UC geradora</th>` : ""}<th class="n">Custo total</th><th class="n">Economia</th><th class="n">%</th>`;
  const n0 = v => Math.round(Number(v) || 0).toLocaleString("pt-BR");
  const celulas = m => `<td class="n">${n0(m.consumo)}</td><td class="n">${n0(m.compensado)}</td><td class="n neg">${brl(m.sem)}</td><td class="n">${brl(m.com)}</td><td class="n">${brl(m.arr)}</td>${temGer ? `<td class="n">${brl(m.ger)}</td>` : ""}<td class="n">${brl(m.custo)}</td><td class="n pos"><b>${brl(m.eco)}</b></td><td class="n"><span class="${ecoCls(m.eco)}">${pct(m.sem ? m.eco / m.sem : 0)}</span></td>`;

  const corpo = `
${meses.some(m => m.parcial) ? `<div class="box" style="border-left-color:#b4372f;margin:0 0 12px"><h3>Atenção: período com mês parcial</h3><p>Em ${meses.filter(m => m.parcial).map(m => esc(motor.monthLabel(m.competencia))).join(", ")} ainda faltam faturas de outras UCs ligadas à mesma usina. O arrendamento do mês foi todo para as UCs já lançadas; ele será redistribuído quando as demais faturas entrarem. Confira antes de enviar ao cliente.</p></div>` : ""}
<div class="hero">
  <div><h3>Economia com a energia da usina</h3><p>Diferença entre a conta da Copel sem a usina e o que foi pago com ela: Copel com os créditos + arrendamento${temGer ? " + parte da conta da UC geradora" : ""}.</p></div>
  <div class="v"><b>${brl(T("eco"))}</b><span>${pct(ecoPct)} · ${esc(curto)}${varAnt != null ? ` · ${varAnt >= 0 ? "▲" : "▼"} ${pct(Math.abs(varAnt))} vs. mês anterior` : ""}</span>
  <span class="acum">Acumulado ${ano}: <b>${brl(A("eco"))}</b> (${pct(A("sem") ? A("eco") / A("sem") : 0)}) · Desde o início: <b>${brl(desdeInicio)}</b></span></div>
</div>
<div class="cards">
  <div class="card"><small>Copel sem usina</small><b class="ver">${brl(T("sem"))}</b><span>O que pagaria sem a energia solar</span></div>
  <div class="card dest"><small>Custo total com usina</small><b>${brl(T("custo"))}</b><span>Copel com créditos ${brl(T("com"))}<br>Arrendamento ${brl(T("arr"))}${temGer ? `<br>UC geradora ${brl(T("ger"))}` : ""}</span></div>
  <div class="card"><small>Arrendamento pago</small><b>${brl(T("arr"))}</b><span>${usinasCli.length ? esc(usinasCli.map(u => u.nome).join(", ")) : "Usina"} · ${esc(curto)}</span></div>
</div>
<div class="mini">
  <div class="card"><small>kWh consumido</small><b>${Math.round(T("consumo")).toLocaleString("pt-BR")}</b></div>
  <div class="card"><small>kWh em créditos</small><b>${Math.round(T("compensado")).toLocaleString("pt-BR")}</b><span>${pct(T("consumo") ? T("compensado") / T("consumo") : 0)} do consumo</span></div>
  <div class="card"><small>Unidades</small><b>${ucsCli.length}</b><span>contas vinculadas</span></div>
  <div class="card"><small>Meses com dados</small><b>${doAno.length} / 12</b><span>${ano}</span></div>
</div>
<h2>Detalhamento por conta <small>${esc(rotulo)}</small></h2>
${ucRows.length ? `<table class="cli"><thead><tr><th>Conta / endereço</th><th class="n">Consumo kWh</th><th class="n">Créditos kWh</th><th class="n">Copel sem usina</th><th class="n">Copel c/ usina</th><th class="n">Arrendamento</th>${temGer ? `<th class="n">UC geradora</th>` : ""}<th class="n">Custo total</th><th class="n">Economia</th><th class="n">%</th></tr></thead>
<tbody>${ucRows.map(r => `<tr><td><b>${esc(r.uc.descricao || ucNum(r.uc))}</b><small>${esc(ucNum(r.uc))}${r.uc.endereco ? " · " + esc(r.uc.endereco) : ""}</small></td>${celulas(r)}</tr>`).join("")}</tbody>
${ucRows.length > 1 ? `<tfoot><tr><td>Total</td>${celulas({ consumo: T("consumo"), compensado: T("compensado"), sem: T("sem"), com: T("com"), arr: T("arr"), ger: T("ger"), custo: T("custo"), eco: T("eco") })}</tr></tfoot>` : ""}</table>` : `<p class="empty">Nenhuma fatura lançada neste período.</p>`}
${doAno.length ? `<div class="section"><h2>Extrato mensal ${ano}</h2>
${doAno.length > 1 ? `${combo(doAno)}<div class="legend"><i style="background:#9aae2e"></i>Economia do mês<i style="background:#53663a"></i>Acumulado ${ano}</div>` : ""}</div>
<table class="cli" style="margin-top:8px"><thead><tr>${cabec}</tr></thead>
<tbody>${doAno.map(m => `<tr><td><b>${esc(motor.monthLabel(m.competencia))}</b>${m.parcial ? `<small class="neg">parcial*</small>` : ""}</td>${celulas(m)}</tr>`).join("")}</tbody>
<tfoot><tr><td>Total ${ano}</td>${celulas({ consumo: A("consumo"), compensado: A("compensado"), sem: A("sem"), com: A("com"), arr: A("arr"), ger: A("ger"), custo: A("custo"), eco: A("eco") })}</tr></tfoot></table>` : ""}
${doAno.length > 1 ? `<div class="section"><h2>Evolução da conta <small>Copel sem usina × custo total com usina</small></h2>${grafico(doAno, [{ get: m => m.sem, cor: "#b4372f", nome: "Copel sem usina" }, { get: m => m.custo, cor: "#53663a", nome: "Custo total com usina" }], { justo: true, altura: 130 })}</div>` : ""}
<h2>Indicadores gerais</h2>
<div class="ind">
  <div class="c"><h4>${esc(cli.nome)}</h4><dl>${cli.documento ? `<dt>CPF/CNPJ</dt><dd>${esc(cli.documento)}</dd>` : ""}<dt>Unidades beneficiárias</dt><dd>${ucsCli.length}</dd><dt>Usina(s)</dt><dd>${esc(usinasCli.map(u => u.nome).join(", ") || "—")}</dd><dt>Cliente desde</dt><dd>${hist.length ? esc(motor.monthLabel(hist[0].competencia)) : "—"}</dd></dl></div>
  <div class="c"><h4>Resultado · ${esc(curto)}</h4><dl><dt>kWh consumido</dt><dd>${kwh(T("consumo"))}</dd><dt>kWh em créditos</dt><dd>${kwh(T("compensado"))}</dd><dt>Economia</dt><dd class="pos">${brl(T("eco"))} (${pct(ecoPct)})</dd><dt>Acumulado ${ano}</dt><dd class="pos">${brl(A("eco"))}</dd><dt>Desde o início</dt><dd class="pos">${brl(desdeInicio)}</dd></dl></div>
  <div class="c"><h4>Composição do custo</h4><dl><dt>Copel com créditos</dt><dd>${brl(T("com"))}</dd><dt>Arrendamento</dt><dd>${brl(T("arr"))}</dd>${temGer ? `<dt>UC geradora</dt><dd>${brl(T("ger"))}</dd>` : ""}<dt>Custo total</dt><dd>${brl(T("custo"))}</dd><dt>Redução da conta</dt><dd class="pos">− ${brl(T("eco"))}</dd></dl></div>
</div>
<p class="nota"><b>Como calculamos.</b> Copel sem usina = total da fatura + valor dos créditos da usina que a própria Copel abateu (linhas "Energia injetada"). Custo total = fatura da Copel + arrendamento${temGer ? " + parte da fatura da UC geradora" : ""}; o arrendamento é dividido entre as contas pelos kWh que cada uma recebeu. Economia = Copel sem usina − custo total. Tudo sai das faturas originais da Copel, arquivadas pela P3.</p>`;
  return shell("Relatório de economia", `${cli.nome} · ${rotulo}`, corpo, `${meses.length} mês(es) · ${sum(meses, m => m.nFat)} fatura(s)`);
}

// Colunas da economia do mês (com o valor escrito) e linha do acumulado do ano, cada uma na sua escala.
function combo(meses) {
  const W = 680, H = 180, L = 10, R = 10, T = 22, B = 22;
  const larg = (W - L - R) / meses.length, bw = Math.min(42, larg * 0.56);
  const maxE = Math.max(1, ...meses.map(m => m.eco)), minE = Math.min(0, ...meses.map(m => m.eco));
  const yE = v => T + 26 + (H - T - B - 26) * (maxE - v) / (maxE - minE);
  let a = 0; const acs = meses.map(m => (a += m.eco));
  const maxA = Math.max(1, ...acs), yA = v => T + (H - T - B - 40) * (1 - Math.max(0, v) / maxA);
  const cx = i => L + larg * (i + 0.5);
  const barras = meses.map((m, i) => {
    const v = m.eco, cor = v >= 0 ? "#9aae2e" : "#b4372f", y0 = yE(0), y1 = yE(v);
    return `<rect x="${cx(i) - bw / 2}" y="${Math.min(y0, y1)}" width="${bw}" height="${Math.max(1, Math.abs(y1 - y0))}" rx="3" fill="${cor}"/>
    <text x="${cx(i)}" y="${v >= 0 ? y1 - 4 : y1 + 10}" text-anchor="middle" font-size="7.5" fill="#4b5a50">${esc(brlK(v))}</text>
    <text x="${cx(i)}" y="${H - 6}" text-anchor="middle" font-size="8" fill="#6b7a70">${esc(motor.monthLabel(m.competencia))}</text>`;
  }).join("");
  const pts = acs.map((v, i) => `${cx(i).toFixed(1)},${yA(v).toFixed(1)}`).join(" ");
  const u = meses.length - 1;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;margin:4px 0 2px" role="img"><line x1="${L}" x2="${W - R}" y1="${yE(0)}" y2="${yE(0)}" stroke="#d5ddd3"/>${barras}
  <polyline points="${pts}" fill="none" stroke="#53663a" stroke-width="2.2" stroke-linejoin="round"/>${acs.map((v, i) => `<circle cx="${cx(i)}" cy="${yA(v)}" r="2.8" fill="#fff" stroke="#53663a" stroke-width="1.8"/>`).join("")}
  <text x="${cx(u)}" y="${yA(acs[u]) - 8}" text-anchor="${meses.length > 1 ? "end" : "middle"}" font-size="9" font-weight="700" fill="#53663a">${esc(brl(acs[u]))}</text></svg>`;
}

// ───────────── Dono ─────────────
function dono(db, q) {
  const dn = (db.donos || []).find(d => d.id === q.dono_id);
  if (!dn) throw new Error("Dono não encontrado.");
  const p = motor.calcPeriodo(db, q.de, q.ate, { dono_id: dn.id, usina_id: q.usina_id || undefined });
  const ix = p.ix;
  const usinas = (db.usinas || []).filter(u => u.dono_id === dn.id && (!q.usina_id || u.id === q.usina_id));
  const nomeCli = id => { const c = ix.clientes.get(id); return c ? (q.anonimo ? iniciais(c.nome) : c.nome) : "—"; };
  const linhas = p.meses.flatMap(m => m.usinas);
  const L = k => sum(linhas, r => r[k]);
  const temGerDono = linhas.some(r => r.geradoraDono > 0);

  // Desde o início (para retorno e payback), independentemente do período pedido.
  const inicio = motor.primeiraCompetencia(db) || q.de;
  const total = motor.calcPeriodo(db, inicio, q.ate, { dono_id: dn.id, usina_id: q.usina_id || undefined });
  const linhasTotal = total.meses.flatMap(m => m.usinas);
  const liquidoDesdeInicio = id => sum(linhasTotal.filter(r => r.usina_id === id), r => r.liquidoDono);
  const mesesOper = id => linhasTotal.filter(r => r.usina_id === id && r.arrendamento > 0).length;

  const secoes = usinas.map(us => {
    const rs = linhas.filter(r => r.usina_id === us.id);
    const S = k => sum(rs, r => r[k]);
    const liq = liquidoDesdeInicio(us.id), nOp = mesesOper(us.id);
    const inv = Number(us.valor_investido) || 0;
    const media = nOp ? liq / nOp : 0;
    const roi = inv ? liq / inv : 0;
    const payback = media > 0 && inv ? inv / media : 0;
    const clientes = [...new Set(rs.flatMap(r => r.ucs.map(u => u.cliente_id)))].filter(Boolean);
    const temGer = rs.some(r => r.geracaoKwh);
    return `<div class="section">
<h2>${esc(us.nome)} <small>${us.potencia_kwp ? `${Number(us.potencia_kwp).toLocaleString("pt-BR")} kWp · ` : ""}UC geradora ${esc(ucFmt(us.uc_geradora || us.uc_geradora_conces) || "—")} · arrendamento contratual ${brl(us.arrendamento_mensal)}/mês</small></h2>
${rs.length ? `<table><thead><tr><th>Mês</th><th class="n">Arrendamento</th><th class="n">Gestão P3</th><th class="n">Custos</th>${temGerDono ? `<th class="n">UC geradora</th>` : ""}<th class="n">Líquido</th>${temGer ? `<th class="n">Geração</th>` : ""}<th class="n">Energia entregue</th><th>Situação</th></tr></thead>
<tbody>${rs.map(r => `<tr><td><b>${esc(motor.monthLabel(r.competencia))}</b></td><td class="n">${brl(r.arrendamento)}${r.arrendamentoOrigem === "mes" && Math.abs(r.arrendamento - us.arrendamento_mensal) > 0.004 ? `<small>ajustado no mês</small>` : ""}</td><td class="n">${brl(r.gestao)}<small>${r.gestaoModo === "pct" ? pctN(r.gestaoPct) : "valor fixo"}</small></td><td class="n">${r.custosDono ? brl(r.custosDono) : "—"}${r.custos.length ? `<small>${esc(r.custos.map(c => c.descricao).join(", "))}</small>` : ""}</td>${temGerDono ? `<td class="n">${r.geradoraDono ? brl(r.geradoraDono) : "—"}</td>` : ""}<td class="n"><b>${brl(r.liquidoDono)}</b></td>${temGer ? `<td class="n">${r.geracaoKwh ? kwh(r.geracaoKwh) : "—"}</td>` : ""}<td class="n">${kwh(r.kwhCompensado)}</td><td><span class="badge ${r.status === "repassado" ? "ok" : r.status === "aberto" ? "warn" : ""}">${esc(STATUS[r.status] || r.status)}</span>${r.faltam ? `<small class="neg">faltam ${r.faltam} fatura(s)</small>` : ""}</td></tr>`).join("")}</tbody>
<tfoot><tr><td>Total</td><td class="n">${brl(S("arrendamento"))}</td><td class="n">${brl(S("gestao"))}</td><td class="n">${brl(S("custosDono"))}</td>${temGerDono ? `<td class="n">${brl(S("geradoraDono"))}</td>` : ""}<td class="n">${brl(S("liquidoDono"))}</td>${temGer ? `<td class="n">${kwh(S("geracaoKwh"))}</td>` : ""}<td class="n">${kwh(S("kwhCompensado"))}</td><td></td></tr></tfoot></table>` : `<p class="empty">Sem movimento neste período.</p>`}
<div class="kpis" style="margin-top:8px">
  <div class="kpi"><small>Valor investido</small><b>${inv ? brl(inv) : "—"}</b><span>${nOp} mês(es) com arrendamento</span></div>
  <div class="kpi"><small>Líquido desde o início</small><b>${brl(liq)}</b><span>média ${brl(media)}/mês</span></div>
  <div class="kpi"><small>Retorno acumulado</small><b>${inv ? pct(roi) : "—"}</b><span>${inv && nOp ? `~${pct(roi / nOp * 12)} ao ano` : ""}</span></div>
  <div class="kpi"><small>Payback estimado</small><b>${payback ? `${(payback / 12).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} anos` : "—"}</b><span>pela média mensal</span></div>
</div>
<p style="color:#4b5a50;font-size:8.5pt;margin:4px 0 0">Clientes atendidos no período: ${clientes.map(id => esc(nomeCli(id))).join(", ") || "—"}. Fatura da UC geradora ${esc(GER[us.geradora_paga_por || "cliente"])}.</p>
</div>`;
  }).join("");

  const corpo = `
<div class="who">
  <div><small>Proprietário</small><b>${esc(dn.nome)}</b>${dn.documento ? ` · ${esc(dn.documento)}` : ""}</div>
  <div><small>Período</small><b>${esc(periodo(q.de, q.ate))}</b></div>
  <div><small>Usinas</small><b>${usinas.map(u => esc(u.nome)).join(", ") || "—"}</b></div>
  <div><small>Pagamento</small><b>${esc(dn.pix ? `PIX ${dn.pix}` : "—")}</b></div>
</div>
<div class="kpis">
  <div class="kpi"><small>Arrendamento bruto</small><b>${brl(L("arrendamento"))}</b><span>cobrado dos arrendatários</span></div>
  <div class="kpi"><small>Gestão P3</small><b>${brl(L("gestao"))}</b><span>${L("arrendamento") ? pct(L("gestao") / L("arrendamento")) : "—"} do bruto</span></div>
  <div class="kpi"><small>Custos${temGerDono ? " e UC geradora" : ""}</small><b>${brl(L("custosDono") + L("geradoraDono"))}</b><span>manutenção, terreno etc.</span></div>
  <div class="kpi lead"><small>Líquido ao proprietário</small><b>${brl(L("liquidoDono"))}</b><span>${esc(periodo(q.de, q.ate))}</span></div>
</div>
${secoes || `<p class="empty">Nenhuma usina deste proprietário.</p>`}
<div class="box"><h3>Como calculamos</h3><ul>
<li><b>Arrendamento</b>: valor contratual da usina, ou o valor ajustado no fechamento do mês. É o mesmo valor cobrado dos arrendatários, dividido entre eles pelos kWh recebidos.</li>
<li><b>Gestão P3</b>: percentual (ou valor fixo) combinado sobre o arrendamento. <b>Líquido</b> = arrendamento − gestão P3 − custos do proprietário${temGerDono ? " − fatura da UC geradora" : ""}.</li>
<li><b>Energia entregue</b>: kWh que a Copel compensou nas faturas dos arrendatários, vindos desta usina.</li></ul></div>`;
  return shell("Extrato do proprietário", dn.nome, corpo, `${usinas.length} usina(s)`);
}

// ───────────── Consolidado P3 ─────────────
function consolidado(db, q) {
  const p = motor.calcPeriodo(db, q.de, q.ate);
  const ix = p.ix;
  const M = p.meses;
  const T = k => sum(M, m => m.totais[k]);
  const conf = conferir(db);
  const porUsina = [...ix.usinas.values()].map(us => {
    const rs = M.flatMap(m => m.usinas).filter(r => r.usina_id === us.id);
    return { us, arr: sum(rs, r => r.arrendamento), gest: sum(rs, r => r.gestao), liq: sum(rs, r => r.liquidoDono), kwh: sum(rs, r => r.kwhCompensado), cred: sum(rs, r => r.creditosClientes), n: rs.length };
  }).filter(r => r.n);
  const porCli = [...ix.clientes.values()].map(c => {
    const us = M.flatMap(m => m.ucs).filter(u => u.cliente_id === c.id);
    return { c, sem: sum(us, u => u.semUsina), custo: sum(us, u => u.custoTotal), eco: sum(us, u => u.economia), n: sum(us, u => u.faturas.length) };
  }).filter(r => r.n).sort((a, b) => b.eco - a.eco);
  const erros = conf.achados.filter(a => a.gravidade === "erro").slice(0, 12);
  const corpo = `
<div class="who"><div><small>Período</small><b>${esc(periodo(q.de, q.ate))}</b></div><div><small>Base</small><b>${ix.usinas.size} usinas · ${ix.clientes.size} clientes · ${(db.ucs || []).filter(u => !u.usina_geradora_id).length} UCs</b></div></div>
<div class="kpis">
  <div class="kpi lead"><small>Receita P3 (gestão)</small><b>${brl(T("gestao"))}</b><span>${T("arrendamento") ? pct(T("gestao") / T("arrendamento")) : "—"} do arrendamento</span></div>
  <div class="kpi"><small>Arrendamento bruto</small><b>${brl(T("arrendamento"))}</b><span>cobrado dos clientes</span></div>
  <div class="kpi"><small>Repasse aos donos</small><b>${brl(T("liquidoDonos"))}</b><span>após gestão e custos</span></div>
  <div class="kpi"><small>Economia dos clientes</small><b>${brl(T("economia"))}</b><span>${pct(T("semUsina") ? T("economia") / T("semUsina") : 0)} da conta</span></div>
</div>
<h2>Mês a mês</h2>
<table><thead><tr><th>Mês</th><th class="n">Faturas</th><th class="n">Compensado</th><th class="n">Copel sem usina</th><th class="n">Copel com usina</th><th class="n">Arrendamento</th><th class="n">Gestão P3</th><th class="n">Líquido donos</th><th class="n">Economia clientes</th></tr></thead>
<tbody>${M.map(m => `<tr><td><b>${esc(motor.monthLabel(m.competencia))}</b></td><td class="n">${m.totais.faturas}</td><td class="n">${kwh(m.totais.compensadoKwh)}</td><td class="n">${brl(m.totais.semUsina)}</td><td class="n">${brl(m.totais.comUsina)}</td><td class="n">${brl(m.totais.arrendamento)}</td><td class="n">${brl(m.totais.gestao)}</td><td class="n">${brl(m.totais.liquidoDonos)}</td><td class="n">${brl(m.totais.economia)}<small>${pct(m.totais.economiaPct)}</small></td></tr>`).join("")}</tbody>
<tfoot><tr><td>Total</td><td class="n">${T("faturas")}</td><td class="n">${kwh(T("compensadoKwh"))}</td><td class="n">${brl(T("semUsina"))}</td><td class="n">${brl(T("comUsina"))}</td><td class="n">${brl(T("arrendamento"))}</td><td class="n">${brl(T("gestao"))}</td><td class="n">${brl(T("liquidoDonos"))}</td><td class="n">${brl(T("economia"))}</td></tr></tfoot></table>
<h2>Por usina</h2>
<table><thead><tr><th>Usina</th><th>Dono</th><th class="n">Arrendamento</th><th class="n">Gestão P3</th><th class="n">Líquido dono</th><th class="n">Energia entregue</th><th class="n">Créditos aos clientes</th></tr></thead>
<tbody>${porUsina.map(r => `<tr><td><b>${esc(r.us.nome)}</b></td><td>${esc((ix.donos.get(r.us.dono_id) || {}).nome || "—")}</td><td class="n">${brl(r.arr)}</td><td class="n">${brl(r.gest)}</td><td class="n">${brl(r.liq)}</td><td class="n">${kwh(r.kwh)}</td><td class="n">${brl(r.cred)}</td></tr>`).join("")}</tbody></table>
<h2>Por cliente</h2>
<table><thead><tr><th>Cliente</th><th class="n">Faturas</th><th class="n">Copel sem usina</th><th class="n">Pagou</th><th class="n">Economia</th></tr></thead>
<tbody>${porCli.map(r => `<tr><td><b>${esc(r.c.nome)}</b></td><td class="n">${r.n}</td><td class="n">${brl(r.sem)}</td><td class="n">${brl(r.custo)}</td><td class="n pos">${brl(r.eco)}<small>${pct(r.sem ? r.eco / r.sem : 0)}</small></td></tr>`).join("")}</tbody></table>
<div class="box"><h3>Conferência da base</h3><p>${conf.resumo.erro} erro(s), ${conf.resumo.atencao} ponto(s) de atenção e ${conf.resumo.info} observação(ões).</p>
${erros.length ? `<ul>${erros.map(a => `<li>${esc(a.texto)}</li>`).join("")}</ul>` : ""}</div>`;
  return shell("Consolidado P3", periodo(q.de, q.ate), corpo, `${M.length} mês(es)`);
}

// ───────── Projeção de economia (proposta para cliente novo) ─────────
// Página 1: o que o cliente quer ver — economia por mês, % médio e o ano, gráfico e tabela enxuta.
// Página 2: como chegamos lá — energia/geração, transição do Fio B, tarifas e premissas.
const CSS_PROJ = `
.hero { display: grid; grid-template-columns: 1.25fr 1fr 1fr; gap: 0; background: #53663a; color: #fff; border-radius: 10px; overflow: hidden; margin: 2px 0 9px; }
.hero > div { padding: 9px 15px; border-left: 1px solid rgba(255,255,255,.14); }
.hero > div:first-child { border-left: 0; }
.hero small { display: block; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .5px; color: #c9e2c9; }
.hero b { display: block; font-size: 20pt; line-height: 1.1; color: #d8ef7a; margin-top: 3px; letter-spacing: -.5px; font-variant-numeric: tabular-nums; }
.hero span { font-size: 8.5pt; color: #dfeee0; }
.hero .main b { font-size: 24pt; }
.compare { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 10px; border: 1px solid #dfe6df; border-radius: 10px; padding: 7px 14px; margin-bottom: 10px; }
.compare small { display: block; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .4px; color: #6b7a70; }
.compare b { font-size: 14pt; font-variant-numeric: tabular-nums; }
.compare .arrow { font-size: 16pt; color: #7b934a; }
.compare .right { text-align: right; }
.compare em, .who em { display: block; font-style: normal; color: #6b7a70; font-size: 7.8pt; margin-top: 1px; }
.who3 { grid-template-columns: 1.3fr 1fr 1fr; }
.mchart { display: flex; align-items: flex-end; gap: 6px; height: 68px; margin: 2px 0 2px; }
.mchart .c { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; height: 100%; }
.mchart-t { display: flex; gap: 6px; margin-top: 4px; } .mchart-t span { flex: 1; text-align: center; font-size: 7.4pt; font-weight: 700; color: #4f7d28; } .mchart-t span.neg { color: #b4372f; }
.mchart .bars { display: flex; gap: 2px; align-items: flex-end; width: 100%; }
.mchart .bars i { flex: 1; display: block; border-radius: 2px 2px 0 0; }
.mchart .h { background: #c9d8cc; } .mchart .p { background: #7b934a; }
.mchart-l { display: flex; gap: 6px; font-size: 7pt; color: #6b7a70; } .mchart-l span { flex: 1; text-align: center; }
table.proj td, table.proj th { font-size: 8.1pt; padding: 1.9px 6px; }
table.proj td.eco { font-weight: 700; }
.pill { display: inline-block; min-width: 42px; text-align: right; padding: 0 5px; border-radius: 8px; background: #e2f3e6; color: #4a6b22; font-weight: 700; font-size: 7.8pt; }
.pill.neg { background: #fbe4e1; color: #a1302a; }
.cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.mini td, .mini th { font-size: 7.9pt; padding: 2px 5px; }
.pb { break-before: page; }
`;
function projecao(pj) {
  if (!pj) throw new Error("Projeção não encontrada.");
  const P = window.P3_PROJECAO;
  const p = pj.params || {};
  const r = P.projetar(pj.contas || [], p);
  const A = r.anual, M = r.meses, nM = M.length, t0 = r.contas[0].tarifas;
  const G = A.geracao != null;
  const ecoMes = A.economia / nM, hojeMes = A.hoje / nM, novoMes = A.total / nM;
  const pctMedio = A.hoje ? A.economia / A.hoje : 0;
  const cliente = pj.cliente || r.contas[0].titular || "—";
  const acordoTxt = p.acordo === "kwh" ? `${brl(p.valorKwh)} por kWh compensado` : p.acordo === "desconto" ? `${fmtPct(p.desconto)} de desconto sobre o valor do crédito` : `${brl(p.valorFixo)} fixos por mês`;
  const geracaoTxt = p.geracaoModo === "kwp" ? `${num(p.kwp).toLocaleString("pt-BR")} kWp${p.local && p.local.meses ? ` em ${p.local.achado || p.local.nome} — ${num(p.local.anual).toLocaleString("pt-BR")} kWh/kWp/ano (${p.local.fonte})` : " — média do Paraná, ~1.400 kWh/kWp/ano"}`
    : p.geracaoModo === "usina" ? "histórico real de geração da usina (demonstrativos da Copel)" : p.geracaoModo === "fixa" ? `${kwh(p.geracaoUsina)} por mês` : "";
  const localCurto = p.local ? String(p.local.achado || p.local.nome || "").split(",").map(x => x.trim()).filter(x => x && !/^Região/i.test(x) && !/^d+$/.test(x)).slice(0, 2).join(", ") : "";
  const usinaTxt = p.geracaoModo === "kwp" ? `${num(p.kwp).toLocaleString("pt-BR")} kWp${localCurto ? ` em ${localCurto}` : ""}`
    : p.geracaoModo === "usina" ? "geração real da usina (demonstrativos Copel)" : p.geracaoModo === "fixa" ? `${kwh(p.geracaoUsina)}/mês` : "";
  const custoUsina = A.custosUsinaCliente ? A.custosUsinaCliente / nM : 0;
  const arrendTxt = p.acordo === "kwh" ? `${brl(p.valorKwh)} por kWh compensado` : p.acordo === "desconto" ? `${fmtPct(p.desconto)} de desconto sobre o crédito` : `${brl(p.valorFixo)} por mês`;
  const max = Math.max(1, ...M.map(m => m.hoje));
  const ucsTxt = r.contas.map(c => `${String(c.uc || "").length >= 11 ? String(c.uc).padStart(15, "0") : c.uc}`).join(", ");
  const mesesPositivos = M.filter(m => m.economia > 0).length;
  // Com geração: 1º ano (saldo zero) e 2º ano em diante (saldo acumulado) têm resultados diferentes.
  const regime = p.saldoModo === "regime";
  const anosSeq = P.porAnos(pj.contas || [], p, 5);
  const media5 = anosSeq.reduce((s, a) => s + a.economia, 0) / anosSeq.length;
  const cenarioTxt = !G ? "" : p.saldoModo === "manual" ? `saldo inicial de ${kwh(p.saldoInicial)}` : regime ? "usina já operando (com saldo de créditos acumulado)" : "1º ano da usina (o saldo de créditos começa em zero)";

  const pag1 = `
<div class="who who3">
  <div><small>Cliente</small><b>${esc(cliente)}</b></div>
  <div><small>Unidade consumidora</small><b>${esc(ucsTxt)}</b></div>
  <div><small>Período projetado</small><b>${esc(motor.monthLabel(M[0].mes))} a ${esc(motor.monthLabel(M[nM - 1].mes))}</b><em>consumo real dos mesmos meses · tarifas de ${esc(motor.monthLabel(r.contas[0].referencia))}</em></div>
  <div><small>Arrendamento</small><b>${esc(arrendTxt)}</b>${custoUsina ? `<em>+ custos da usina: ${brl(custoUsina)}/mês (previstos)</em>` : ""}</div>
  ${usinaTxt ? `<div><small>Usina</small><b>${esc(usinaTxt)}</b></div>` : ""}
  <div><small>Cobertura</small><b>${fmtPct(p.cobertura ?? 100)} do consumo compensável</b></div>
</div>
<div class="hero">
  <div class="main"><small>Economia média por mês · 1º ano</small><b>${brl(ecoMes)}</b><span>${mesesPositivos} de ${nM} meses com economia</span></div>
  <div><small>Economia média</small><b>${pct(pctMedio)}</b><span>da conta toda · ${pct(A.economiaAtendidaPct)} na energia atendida pela usina${A.atendidoPct < 0.98 ? ` (${pct(A.atendidoPct)} do consumo)` : ""}</span></div>
  <div><small>Economia no 1º ano</small><b>${brl(A.economia)}</b><span>média de ${brl(media5)}/ano em 5 anos</span></div>
</div>
<div class="compare">
  <div><small>Hoje, por mês (média)</small><b>${brl(hojeMes)}</b><em>conta da Copel</em></div>
  <div class="arrow">→</div>
  <div class="right"><small>Com a usina P3, por mês (média)</small><b>${brl(novoMes)}</b>
    <em>Copel ${brl(A.comUsina / nM)} · arrendamento ${brl(A.arrendamento / nM)}${custoUsina ? ` · custos da usina ${brl(custoUsina)}` : ""}</em></div>
</div>
<h2>Economia mês a mês <small>conta de hoje × com a usina P3</small></h2>
<div class="mchart-t">${M.map(m => `<span class="${m.economia < 0 ? "neg" : ""}">${m.hoje ? pct(m.economia / m.hoje) : ""}</span>`).join("")}</div>
<div class="mchart">${M.map(m => `<div class="c"><div class="bars"><i class="h" style="height:${m.hoje / max * 64}px"></i><i class="p" style="height:${Math.max(0, m.total) / max * 64}px"></i></div></div>`).join("")}</div>
<div class="mchart-l">${M.map(m => `<span>${esc(motor.monthLabel(m.mes))}</span>`).join("")}</div>
<div class="legend"><i style="background:#c9d8cc"></i>Conta hoje<i style="background:#7b934a"></i>Com a usina P3 · acima de cada mês, a economia em %</div>
<table class="proj" style="margin-top:10px"><thead><tr><th>Mês</th><th class="n">Consumo</th><th class="n">Conta hoje</th><th class="n">Com a usina P3</th><th class="n">Economia</th><th class="n">%</th></tr></thead>
<tbody>${M.map(m => `<tr><td><b>${esc(motor.monthLabel(m.mes))}</b></td><td class="n">${kwh(m.consumo)}</td><td class="n">${brl(m.hoje)}</td><td class="n">${brl(m.total)}</td><td class="n eco ${m.economia >= 0 ? "pos" : "neg"}">${brl(m.economia)}</td><td class="n"><span class="pill ${m.economia < 0 ? "neg" : ""}">${pct(m.hoje ? m.economia / m.hoje : 0)}</span></td></tr>`).join("")}</tbody>
<tfoot><tr><td>Total ${nM} meses</td><td class="n">${kwh(A.consumo)}</td><td class="n">${brl(A.hoje)}</td><td class="n">${brl(A.total)}</td><td class="n">${brl(A.economia)}</td><td class="n"><span class="pill">${pct(pctMedio)}</span></td></tr>
<tr><td>Média por mês</td><td class="n">${kwh(A.consumo / nM)}</td><td class="n">${brl(hojeMes)}</td><td class="n">${brl(novoMes)}</td><td class="n">${brl(ecoMes)}</td><td class="n"></td></tr></tfoot></table>
<div class="box" style="border-left-color:#c9e265;margin-top:10px;padding:6px 11px"><h3>Condições</h3><ul>
<li style="font-size:7.5pt;margin:0">O arrendamento é de ${esc(arrendTxt)}${custoUsina ? `, mais os custos da UC geradora (previstos em ${brl(custoUsina)}/mês), cobrados à parte desde que se mantenham dentro do previsto, com pequenas diferenças` : ""}.</li>
<li style="font-size:7.5pt;margin:0">Se houver problemas de compensação (como falta de geração), grande diferença no consumo da UC geradora ou custos da geradora diferentes do projetado, a diferença será ajustada na cobrança do próximo ciclo.</li></ul></div>`;

  const visao = A.intermediacao ? (p.visao || "todos") : "cliente";
  if (visao === "dono") return projecaoDono(pj, P, r, anosSeq);
  const ck = P.custoKwh(r), interno = visao === "todos";
  const R4 = v => `R$ ${(Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
  const custoKwhHtml = !A.compensado ? "" : `
<h2>Custo do kWh <small>por kWh compensado · Fio B não compensado ${fmtPct(ck.pctFioB * 100)}</small></h2>
<table class="mini" style="width:60%"><tbody>
${interno ? `<tr><td>Usina (pago ao dono)</td><td class="n">${R4(ck.usina)}</td></tr><tr><td>Margem da P3</td><td class="n">${R4(ck.margemP3)}</td></tr>` : `<tr><td>Usina (arrendamento)</td><td class="n">${R4(ck.arrendamento)}</td></tr>`}
<tr><td>Fio B não compensado (Copel)</td><td class="n">${R4(ck.fioB)}</td></tr>
<tr><td>Impostos que não compensam (ICMS da TUSD + PIS/COFINS do Fio B)</td><td class="n">${R4(ck.impostos)}</td></tr>
<tr><td><b>Total por kWh</b></td><td class="n"><b>${R4(ck.total)}</b></td></tr>
<tr><td>Tarifa cheia da Copel hoje</td><td class="n">${R4(ck.tarifaCheia)}</td></tr>
<tr><td><b>Economia por kWh</b></td><td class="n"><b>${R4(ck.economia)}</b> (${pct(ck.economiaPct)})</td></tr>
</tbody></table>
<p style="color:#6b7a70;font-size:7.6pt;margin:3px 0 8px">Mínimo da ligação e iluminação pública são fixos por mês e não entram no custo por kWh.</p>`;
  const opHtml = !interno ? "" : `
<div class="pb"></div>
<h2>Resultado da operação <small>uso interno · cliente, dono da usina e P3</small></h2>
<div class="hero">
  <div><small>Economia do cliente · 1º ano</small><b>${brl(A.economia)}</b><span>${pct(A.economiaPct)} da conta</span></div>
  <div><small>Dono da usina · 1º ano</small><b>${brl(A.donoLiquido)}</b><span>${brl(A.donoLiquido / nM)}/mês</span></div>
  <div class="main"><small>Lucro da P3 · 1º ano</small><b>${brl(A.p3Lucro)}</b><span>${brl(A.p3Lucro / nM)}/mês · ${R4(A.margemKwh)}/kWh</span></div>
</div>
<table class="proj"><thead><tr><th>Mês</th><th class="n">Compensado</th><th class="n">Economia cliente</th><th class="n">Cliente paga à P3</th><th class="n">P3 paga ao dono</th>${A.p3Custos || A.donoCustos ? `<th class="n">Custos UC</th>` : ""}${A.p3Imposto ? `<th class="n">Imposto P3</th>` : ""}<th class="n">Lucro P3</th></tr></thead>
<tbody>${M.map(m => `<tr><td><b>${esc(motor.monthLabel(m.mes))}</b></td><td class="n">${kwh(m.compensado)}</td><td class="n">${brl(m.economia)}</td><td class="n">${brl(m.p3Recebe)}</td><td class="n">${brl(m.donoRecebe)}</td>${A.p3Custos || A.donoCustos ? `<td class="n">${brl(m.p3Custos || m.donoCustos)}</td>` : ""}${A.p3Imposto ? `<td class="n">${brl(m.p3Imposto)}</td>` : ""}<td class="n eco">${brl(m.p3Lucro)}</td></tr>`).join("")}</tbody>
<tfoot><tr><td>Total</td><td class="n">${kwh(A.compensado)}</td><td class="n">${brl(A.economia)}</td><td class="n">${brl(A.p3Recebe)}</td><td class="n">${brl(A.donoRecebe)}</td>${A.p3Custos || A.donoCustos ? `<td class="n">${brl(A.p3Custos || A.donoCustos)}</td>` : ""}${A.p3Imposto ? `<td class="n">${brl(A.p3Imposto)}</td>` : ""}<td class="n">${brl(A.p3Lucro)}</td></tr></tfoot></table>
<h2>Ano a ano</h2>
<table class="proj"><thead><tr><th>Ano</th><th class="n">Compensado</th><th class="n">Economia cliente</th><th class="n">Líquido do dono</th><th class="n">Lucro P3</th></tr></thead>
<tbody>${anosSeq.map(a => `<tr><td><b>${a.n}º ano</b> <span style="color:#6b7a70">${esc(a.periodo)}</span></td><td class="n">${kwh(a.compensado)}</td><td class="n">${brl(a.economia)}</td><td class="n">${brl(a.donoLiquido)}</td><td class="n eco">${brl(a.p3Lucro)}</td></tr>`).join("")}</tbody>
<tfoot><tr><td>5 anos</td><td class="n">${kwh(anosSeq.reduce((s, a) => s + a.compensado, 0))}</td><td class="n">${brl(anosSeq.reduce((s, a) => s + a.economia, 0))}</td><td class="n">${brl(anosSeq.reduce((s, a) => s + num(a.donoLiquido), 0))}</td><td class="n">${brl(anosSeq.reduce((s, a) => s + num(a.p3Lucro), 0))}</td></tr></tfoot></table>`;

  const pag2 = `
<div class="pb"></div>${custoKwhHtml}
<h2>Ano a ano <small>${G ? "o saldo de créditos que sobra num ano passa para o seguinte" : "com a transição do Fio B"}${num(p.reajusteTarifa) ? ` · tarifa Copel corrigida ${fmtPct(p.reajusteTarifa)} ao ano` : ""}</small></h2>
<table class="proj"><thead><tr><th>Ano</th><th class="n">Fio B não comp.</th>${G ? `<th class="n">Saldo no início</th>` : ""}<th class="n">Economia/mês</th><th class="n">%</th><th class="n">Economia no ano</th>${G ? `<th class="n">Saldo no fim</th>` : ""}</tr></thead>
<tbody>${anosSeq.map(a => `<tr><td style="white-space:nowrap"><b>${a.n}º ano</b> <span style="color:#6b7a70">${esc(a.periodo)}</span></td><td class="n">${a.pctsFioB.map(x => fmtPct(x * 100)).join(" → ")}</td>${G ? `<td class="n">${kwh(a.saldoInicio)}</td>` : ""}<td class="n eco pos">${brl(a.economiaMes)}</td><td class="n"><span class="pill">${pct(a.economiaPct)}</span></td><td class="n">${brl(a.economia)}${a.faltou ? `<small class="neg">faltam ${kwh(a.faltou)}</small>` : ""}</td>${G ? `<td class="n">${kwh(a.saldoFim)}</td>` : ""}</tr>`).join("")}</tbody>
<tfoot><tr><td>5 anos</td><td></td>${G ? "<td></td>" : ""}<td class="n">${brl(anosSeq.reduce((s, a) => s + a.economia, 0) / (anosSeq.length * nM))}</td><td></td><td class="n">${brl(anosSeq.reduce((s, a) => s + a.economia, 0))}</td>${G ? "<td></td>" : ""}</tr></tfoot></table>
<p style="color:#6b7a70;font-size:7.8pt;margin:3px 0 10px">Fio B não compensado (Lei 14.300), pelo ano de cada mês: 60% em 2026, 75% em 2027 e 90% a partir de 2028.${G ? " A sobra de cada mês vira saldo de créditos; o 1º ano começa em zero e o saldo passa para o ano seguinte (créditos valem 60 meses)." : ""}</p>
<h2>Energia <small>${G ? "geração da usina, compensação e saldo de créditos" : "consumo e energia compensada"}</small></h2>
${G && usinaTxt ? `<p style="margin:0 0 6px;color:#34433a;font-size:8.6pt">Usina: <b>${esc(usinaTxt)}</b></p>` : ""}
<table class="mini"><thead><tr><th>Mês</th><th class="n">Consumo</th>${G ? `<th class="n">Geração</th>` : ""}<th class="n">Compensado</th>${G ? `<th class="n">Saldo de créditos</th>` : ""}<th class="n">Valor dos créditos</th></tr></thead>
<tbody>${M.map(m => `<tr><td><b>${esc(motor.monthLabel(m.mes))}</b></td><td class="n">${kwh(m.consumo)}</td>${G ? `<td class="n">${kwh(m.geracao)}</td>` : ""}<td class="n">${kwh(m.compensado)}</td>${G ? `<td class="n">${kwh(m.saldo)}</td>` : ""}<td class="n">${brl(m.valorCredito)}</td></tr>`).join("")}</tbody>
<tfoot><tr><td>Total</td><td class="n">${kwh(A.consumo)}</td>${G ? `<td class="n">${kwh(A.geracao)}</td>` : ""}<td class="n">${kwh(A.compensado)}</td>${G ? `<td class="n">${kwh(A.saldoFinal)}</td>` : ""}<td class="n">${brl(A.valorCredito)}</td></tr></tfoot></table>
${A.faltou ? `<p style="color:#a1302a;font-size:8.4pt;margin:4px 0 0">A geração não cobre todo o consumo: faltam ${kwh(A.faltou)} no ano, pagos normalmente à Copel.</p>` : ""}
<div class="cols2 section">
  <div><h2>Tarifas usadas <small>fatura Copel de ${esc(motor.monthLabel(r.contas[0].referencia))}</small></h2>
    <table class="mini" style="width:100%"><tbody>
      <tr><td>Energia + distribuição (TE + TUSD, com tributos)</td><td class="n"><b>R$ ${num6(t0.tarifa)}</b>/kWh</td></tr>
      <tr><td>Valor do crédito da usina (GD II, ${fmtPct(t0.pctFioB * 100)} do Fio B não compensado)</td><td class="n"><b>R$ ${num6(t0.credito)}</b>/kWh</td></tr>
      <tr><td>Fio B integral</td><td class="n">R$ ${num6(t0.fioB)}/kWh</td></tr>
      <tr><td>Bandeira tarifária</td><td class="n">${t0.bandeira ? `R$ ${num6(t0.bandeira)}/kWh` : "verde"}</td></tr>
      <tr><td>Iluminação pública</td><td class="n">${brl(t0.iluminacao)}/mês</td></tr>
      <tr><td>Mínimo da ligação (${esc({ monofasico: "monofásica", bifasico: "bifásica", trifasico: "trifásica" }[t0.fase] || t0.fase)})</td><td class="n">${t0.minimo} kWh/mês</td></tr>
    </tbody></table></div>
  <div><div class="box" style="margin-top:0"><h3>Premissas</h3><ul>
<li style="font-size:7.3pt;margin:0">Consumo: o mesmo mês do ano no histórico da fatura da Copel (ex.: out/26 usa out/25). Tarifas, tributos e bandeira: os da fatura mais recente.</li>
<li style="font-size:7.3pt;margin:0">Conta de hoje = consumo × (energia + distribuição + bandeira) + iluminação pública${(pj.contas || []).some(c => num((c.campos || c).compensadoKwh)) ? (p.manterCreditosAtuais === false ? "; os créditos que a UC já recebe hoje foram desconsiderados (a projeção mostra só a usina P3)" : " − créditos que a UC já recebe hoje (mantidos; a usina P3 cobre o restante)") : ""}.</li>
<li style="font-size:7.3pt;margin:0">Com a usina P3 = conta de hoje − valor dos créditos da usina + arrendamento (${esc(acordoTxt)}). Cobertura: ${fmtPct(p.cobertura ?? 100)} do consumo compensável.</li>
${A.custoUsinaMes ? `<li style="font-size:7.3pt;margin:0">Custos da UC geradora (ANEEL): mínimo da ligação ${esc({ monofasico: "monofásica", bifasico: "bifásica", trifasico: "trifásica" }[(p.custosUsina || {}).fase || "trifasico"])} + iluminação pública${num((p.custosUsina || {}).outros) ? " + outros" : ""} = ${brl(A.custoUsinaMes)}/mês, ${{ p3: A.intermediacao ? "pagos pela P3" : "pagos pela P3/dono", dono: "pagos pelo dono da usina" }[(p.custosUsina || {}).quemPaga] || "cobrados à parte, além do arrendamento"}.</li>` : ""}
${num(p.reajusteTarifa) ? `<li style="font-size:7.3pt;margin:0">Tarifa da Copel corrigida em ${fmtPct(p.reajusteTarifa)} ao ano a partir do 2º ano (energia, distribuição e crédito); arrendamento e iluminação pública sem correção.</li>` : ""}
${G ? `<li style="font-size:7.3pt;margin:0">Geração: ${p.geracaoModo === "kwp" && p.local && p.local.meses ? `${num(p.local.anual).toLocaleString("pt-BR")} kWh/kWp/ano no local (PVGIS)` : esc(usinaTxt)}, com margem de ${A.ajusteGeracao}%; ${esc(cenarioTxt)}.</li>` : ""}
<li style="font-size:7.3pt;margin:0">É uma projeção: reajustes da Copel, bandeiras, mudanças de consumo e de geração alteram o resultado.</li></ul></div></div>
</div>

`;
  return shell("Projeção de economia", cliente, `<style>${CSS_PROJ}</style>${pag1}${pag2}${opHtml}`, `Projeção · ${pj.nome}`, "projeção calculada a partir das faturas da Copel do cliente.");
}

// PDF para o dono da usina: quanto ele recebe da P3 pelo arrendamento (sem os números do cliente).
function projecaoDono(pj, P, r, anosSeq) {
  const p = pj.params || {}, im = p.intermediacao || {}, A = r.anual, M = r.meses, nM = M.length;
  const valorTxt = im.modo === "fixo" ? `${brl(im.valorFixo)} por mês` : `${brl(im.valorKwh)} por kWh compensado`;
  const dono = im.dono || "Proprietário da usina";
  const custos = A.donoCustos > 0;
  const total5 = anosSeq.reduce((s, a) => s + num(a.donoLiquido), 0);
  const corpo = `
<div class="who who3">
  <div><small>Proprietário</small><b>${esc(dono)}</b></div>
  <div><small>Arrendamento à P3</small><b>${esc(valorTxt)}</b></div>
  <div><small>Período projetado</small><b>${esc(motor.monthLabel(M[0].mes))} a ${esc(motor.monthLabel(M[nM - 1].mes))}</b></div>
</div>
<div class="hero">
  <div class="main"><small>Recebimento médio por mês · 1º ano</small><b>${brl(A.donoLiquido / nM)}</b><span>${custos ? "já descontados os custos da UC geradora" : "líquido para o proprietário"}</span></div>
  <div><small>No 1º ano</small><b>${brl(A.donoLiquido)}</b><span>${kwh(A.compensado)} compensados</span></div>
  <div><small>Em 5 anos</small><b>${brl(total5)}</b><span>média de ${brl(total5 / anosSeq.length)}/ano</span></div>
</div>
<h2>Mês a mês</h2>
<table class="proj"><thead><tr><th>Mês</th><th class="n">Energia compensada</th><th class="n">Arrendamento</th>${custos ? `<th class="n">Custos da UC geradora</th>` : ""}<th class="n">Líquido</th></tr></thead>
<tbody>${M.map(m => `<tr><td><b>${esc(motor.monthLabel(m.mes))}</b></td><td class="n">${kwh(m.compensado)}</td><td class="n">${brl(m.donoRecebe)}</td>${custos ? `<td class="n">${brl(m.donoCustos)}</td>` : ""}<td class="n eco">${brl(m.donoLiquido)}</td></tr>`).join("")}</tbody>
<tfoot><tr><td>Total ${nM} meses</td><td class="n">${kwh(A.compensado)}</td><td class="n">${brl(A.donoRecebe)}</td>${custos ? `<td class="n">${brl(A.donoCustos)}</td>` : ""}<td class="n">${brl(A.donoLiquido)}</td></tr></tfoot></table>
<h2>Ano a ano</h2>
<table class="proj"><thead><tr><th>Ano</th><th class="n">Energia compensada</th><th class="n">Recebimento no ano</th><th class="n">Por mês</th></tr></thead>
<tbody>${anosSeq.map(a => `<tr><td><b>${a.n}º ano</b> <span style="color:#6b7a70">${esc(a.periodo)}</span></td><td class="n">${kwh(a.compensado)}</td><td class="n eco">${brl(a.donoLiquido)}</td><td class="n">${brl(num(a.donoLiquido) / 12)}</td></tr>`).join("")}</tbody>
<tfoot><tr><td>5 anos</td><td class="n">${kwh(anosSeq.reduce((s, a) => s + a.compensado, 0))}</td><td class="n">${brl(total5)}</td><td></td></tr></tfoot></table>
<div class="box" style="margin-top:10px"><h3>Premissas</h3><ul>
<li style="font-size:7.5pt;margin:0">A P3 arrenda a usina e paga ${esc(valorTxt)}${im.modo === "fixo" ? "" : " pela energia efetivamente compensada nas unidades atendidas"}.</li>
${custos ? `<li style="font-size:7.5pt;margin:0">Os custos da UC geradora (mínimo da ligação e iluminação pública, ${brl(A.custoUsinaMes)}/mês) ficam com o proprietário.</li>` : `<li style="font-size:7.5pt;margin:0">Os custos da UC geradora não ficam com o proprietário.</li>`}
<li style="font-size:7.5pt;margin:0">Energia compensada projetada pelo consumo real das unidades atendidas${A.geracao != null ? " e pela geração estimada da usina" : ""}. É uma projeção: geração e consumo reais alteram o resultado.</li></ul></div>`;
  return shell("Projeção de arrendamento", dono, `<style>${CSS_PROJ}</style>${corpo}`, `Projeção · ${pj.nome}`, "projeção do arrendamento da usina à P3 Energy.");
}
const num = v => Number(v) || 0;
const num6 = v => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 6, maximumFractionDigits: 6 });
const fmtPct = v => `${(Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

function render(db, tipo, q) {
  if (!q.de || !q.ate) throw new Error("Informe o período (de / até).");
  if (q.de > q.ate) throw new Error("O início do período é depois do fim.");
  if (tipo === "cliente") return cliente(db, q);
  if (tipo === "dono") return dono(db, q);
  if (tipo === "consolidado") return consolidado(db, q);
  throw new Error("Tipo de relatório desconhecido.");
}

function nomeArquivo(db, tipo, q) {
  const alvo = tipo === "cliente" ? ((db.clientes || []).find(c => c.id === q.cliente_id) || {}).nome
    : tipo === "dono" ? ((db.donos || []).find(d => d.id === q.dono_id) || {}).nome : "P3";
  const per = q.de === q.ate ? q.de : `${q.de} a ${q.ate}`;
  const t = { cliente: "Extrato cliente", dono: "Extrato proprietario", consolidado: "Consolidado" }[tipo] || tipo;
  return `${t} - ${String(alvo || "").replace(/[\\/:*?"<>|]+/g, " ").trim()} - ${per}.pdf`;
}

// Números principais de um relatório, guardados junto da publicação para o portal mostrar sem recalcular.
function resumo(db, tipo, q) {
  const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
  if (tipo === "cliente") {
    const linhas = ms => ms.flatMap(m => m.ucs);
    const per = linhas(motor.calcPeriodo(db, q.de, q.ate, { cliente_id: q.cliente_id }).meses);
    const ucIds = new Set((db.ucs || []).filter(u => u.cliente_id === q.cliente_id).map(u => u.id));
    const ini = (db.faturas || []).filter(f => ucIds.has(f.uc_id) && f.competencia).map(f => f.competencia).sort()[0] || q.de;
    const tudo = linhas(motor.calcPeriodo(db, ini, q.ate, { cliente_id: q.cliente_id }).meses);
    const sem = r2(sum(per, u => u.semUsina)), eco = r2(sum(per, u => u.economia));
    return { economia: eco, copel_sem: sem, custo: r2(sum(per, u => u.custoTotal)), pct: sem ? eco / sem : 0, kwh_creditos: Math.round(sum(per, u => u.compensadoKwh)), acumulado: r2(sum(tudo, u => u.economia)) };
  }
  if (tipo === "dono") {
    const f = { dono_id: q.dono_id };
    const per = motor.calcPeriodo(db, q.de, q.ate, f).meses.flatMap(m => m.usinas);
    const tudo = motor.calcPeriodo(db, motor.primeiraCompetencia(db) || q.de, q.ate, f).meses.flatMap(m => m.usinas);
    return { arrendamento: r2(sum(per, r => r.arrendamento)), liquido: r2(sum(per, r => r.liquidoDono)), acumulado: r2(sum(tudo, r => r.liquidoDono)) };
  }
  return null;
}

window.P3_RELATORIOS = { render, nomeArquivo, projecao, resumo };

})();
