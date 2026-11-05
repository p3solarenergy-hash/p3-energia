// Comprovantes das obras: PDF ou foto que chegam pelo "Compartilhar" do celular (WhatsApp) ou escolhidos à mão.
// O arquivo é lido aqui mesmo no aparelho (texto do PDF; foto pelo leitor de imagem), os campos vêm sugeridos,
// você confere e lança: o arquivo vai para o Storage privado e vira um lançamento da obra.
(function () {
  "use strict";
  const { esc, $, $$, fmt, api, toast, opts } = window.P3;
  const RECEBIDOS = "p3-compartilhado";
  const OCR_JS = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  const OCR_LINGUA = "https://cdn.jsdelivr.net/npm/@tesseract.js-data/por@1.0.0/4.0.0_best_int";
  const n = v => {
    if (v == null || v === "") return 0; if (typeof v === "number") return v;
    let s = String(v).trim().replace(/[R$\s]/g, "");
    if (/,/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    const x = Number(s); return Number.isFinite(x) ? x : 0;
  };
  const semAcento = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const ehPdf = f => f.type === "application/pdf" || /\.pdf$/i.test(f.name || "");

  // ───────── leitura ─────────
  let aviso = () => {};
  let ocr = null;
  const script = src => new Promise((ok, erro) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => erro(new Error("sem internet para carregar o leitor de fotos")); document.head.appendChild(s); });
  async function lerImagem(img) {
    if (!ocr) ocr = (async () => {
      if (!window.Tesseract) await script(OCR_JS);
      return window.Tesseract.createWorker("por", 1, { langPath: OCR_LINGUA, logger: m => { if (m.status === "recognizing text") aviso(`Lendo a foto… ${Math.round(m.progress * 100)}%`); else if (/load|initializ/i.test(m.status)) aviso("Preparando o leitor de fotos (só demora na primeira vez)…"); } });
    })().catch(e => { ocr = null; throw e; });
    const w = await ocr;
    const { data } = await w.recognize(img);
    return data.text || "";
  }
  async function lerPdf(file) {
    const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    let texto = "";
    for (let p = 1; p <= Math.min(doc.numPages, 4); p++) {
      const t = await (await doc.getPage(p)).getTextContent();
      texto += t.items.map(i => i.str + (i.hasEOL ? "\n" : " ")).join("") + "\n";
    }
    if (texto.replace(/\s/g, "").length > 20) return texto;
    // PDF escaneado (só imagem): desenha a 1ª página e lê como foto.
    const pg = await doc.getPage(1), vp = pg.getViewport({ scale: 2 });
    const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
    await pg.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
    return lerImagem(c);
  }
  const ler = (file, cb) => { aviso = cb || (() => {}); return ehPdf(file) ? lerPdf(file) : lerImagem(file); };

  // ───────── interpretação do texto ─────────
  const MESES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
  const iso = (d, m, a) => { a = Number(a); if (a < 100) a += 2000; d = Number(d); m = Number(m); if (!(d >= 1 && d <= 31 && m >= 1 && m <= 12 && a >= 2015 && a <= 2099)) return ""; return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`; };
  function acharData(t) {
    const s = semAcento(t);
    let m = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/); if (m) { const r = iso(m[1], m[2], m[3]); if (r) return r; }
    m = s.match(/\b(\d{1,2})\s*(?:de\s+|\/\s*|-\s*)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?\s*(?:de\s+|\/\s*|-\s*)?(\d{4})\b/); if (m) { const r = iso(m[1], MESES[m[2]], m[3]); if (r) return r; }
    m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/); if (m) return iso(m[3], m[2], m[1]);
    return "";
  }
  function acharValor(t) {
    const dinheiro = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/;
    for (const l of t.split(/\n/)) if (/valor|total|pago|transferi|quantia|montante/i.test(l)) { const m = l.match(dinheiro); if (m && n(m[1]) > 0) return n(m[1]); }
    const comRs = [...t.matchAll(/R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/g)].map(m => n(m[1])).filter(v => v > 0);
    return comRs.length ? Math.max(...comRs) : 0;
  }
  // "Para: FULANO", "Destino ↵ Nome ↵ FULANO", "Recebedor FULANO"…
  function acharNome(t, rotulos) {
    const L = t.split(/\n/).map(x => x.trim()).filter(Boolean);
    const re = new RegExp(`^(?:${rotulos})\\b\\s*:?\\s*(.*)$`, "i");
    const ruim = v => !v || /^nome\b/i.test(v) || /^(cpf|cnpj|institui|banco|ag[eê]ncia|conta|chave|tipo)/i.test(v);
    for (let i = 0; i < L.length; i++) {
      const m = L[i].match(re); if (!m) continue;
      let v = m[1].replace(/^nome\b\s*:?\s*/i, "").trim();
      for (let j = i + 1; ruim(v) && j < Math.min(L.length, i + 4); j++) v = L[j].replace(/^nome\b\s*:?\s*/i, "").trim();
      if (!ruim(v) && v.length <= 80) return v.replace(/\s{2,}/g, " ");
    }
    return "";
  }
  const P3 = /p3\s*(energy|recharge|solar|energia)|prochet|45\.?173\.?949/i;
  function interpretar(texto, nomeArquivo) {
    const destino = acharNome(texto, "para|destino|destinat[áa]rio|recebedor|favorecido|benefici[áa]rio|quem recebeu|dados do recebedor");
    const origem = acharNome(texto, "de|origem|pagador|quem pagou|dados do pagador|remetente");
    const recebimento = P3.test(destino) && !P3.test(origem);
    const s = semAcento(texto);
    const desc = (texto.match(/(?:descri[cç][aã]o|mensagem|identifica[cç][aã]o)\s*:?\s*([^\n]{3,80})/i) || [])[1];
    const tipoDoc = /boleto|linha digitavel|codigo de barras/.test(s) ? "Boleto" : /\bpix\b/.test(s) ? "Pix" : /nota fiscal|nf-?e|danfe/.test(s) ? "Nota fiscal" : /\bted\b|transferencia/.test(s) ? "Transferência" : "";
    return {
      tipo: recebimento ? "recebimento" : "pagamento",
      valor: acharValor(texto),
      data: acharData(texto),
      parte: (recebimento ? origem : destino) || "",
      descricao: (desc || [tipoDoc, recebimento ? "recebido" : ""].filter(Boolean).join(" ") || String(nomeArquivo || "Comprovante").replace(/\.[a-z0-9]+$/i, "")).trim()
    };
  }

  // ───────── gravação ─────────
  async function anexar(obraId, file) {
    const r = await api("anexo", { method: "POST", raw: true, body: file, headers: { "X-Nome": encodeURIComponent(file.name || "comprovante"), "X-Obra": obraId } });
    return { caminho: r.caminho, nome: file.name || "comprovante", tipo: file.type || "" };
  }
  async function abrirAnexo(caminho) {
    const janela = window.open("about:blank", "_blank");
    try { const r = await api(`anexo?caminho=${encodeURIComponent(caminho)}`); if (janela) janela.location.href = r.url; else location.href = r.url; }
    catch (e) { if (janela) janela.close(); toast(e.message, "bad"); }
  }
  window.P3_COMPROVANTE = { ler, interpretar, anexar, abrirAnexo, ehPdf, n };

  // ───────── tela "Lançar comprovante" ─────────
  async function doCompartilhar() {
    if (!("caches" in window)) return [];
    try {
      const c = await caches.open(RECEBIDOS), out = [];
      for (const req of await c.keys()) {
        const r = await c.match(req); if (!r) continue;
        const blob = await r.blob();
        const nome = decodeURIComponent(r.headers.get("X-Nome") || "comprovante");
        out.push({ chave: req.url, file: new File([blob], nome, { type: blob.type || r.headers.get("Content-Type") || "" }), texto: decodeURIComponent(r.headers.get("X-Texto") || "") });
      }
      return out;
    } catch (_) { return []; }
  }
  const esquecer = async chave => { if (chave && "caches" in window) try { await (await caches.open(RECEBIDOS)).delete(chave); } catch (_) { } };
  const ultimaObra = { get: () => { try { return localStorage.getItem("p3-ultima-obra") || ""; } catch (_) { return ""; } }, set: v => { try { localStorage.setItem("p3-ultima-obra", v); } catch (_) { } } };

  let fila = [], obras = [], seq = 0;
  async function render(main) {
    main.innerHTML = `<div class="head"><div><p class="kicker">Obras</p><h1>Lançar comprovante</h1><p>Recibos, Pix, boletos e cobranças das obras, em PDF ou foto. Confira o que foi lido e lance na obra certa: o arquivo fica guardado junto do lançamento.</p></div>
      <div class="actions"><label class="btn primary" for="cpArq">+ Escolher arquivos</label><input id="cpArq" type="file" accept="image/*,application/pdf,.pdf" multiple hidden></div></div>
      <div id="cpFila"><div class="loading">Carregando…</div></div>`;
    $("#cpArq").onchange = e => { adicionar([...e.target.files].map(file => ({ file }))); e.target.value = ""; };
    try { obras = (await api("obras")).filter(o => o.status !== "cancelada"); } catch (e) { $("#cpFila").innerHTML = `<div class="note bad">${esc(e.message)}</div>`; return; }
    if (window.P3.state.route !== "comprovante") return;
    const ordem = { andamento: 0, orcamento: 1, concluida: 2 };
    obras.sort((a, b) => (ordem[a.status] ?? 3) - (ordem[b.status] ?? 3) || a.nome.localeCompare(b.nome));
    const ja = new Set(fila.map(x => x.chave).filter(Boolean));
    const chegaram = (await doCompartilhar()).filter(x => !ja.has(x.chave));
    if (chegaram.length) adicionar(chegaram); else desenhar();
  }

  function sugerirObra(texto) {
    const t = semAcento(texto);
    const achada = obras.find(o => o.nome.length >= 4 && t.includes(semAcento(o.nome)));
    if (achada) return achada.id;
    const u = ultimaObra.get(); if (obras.some(o => o.id === u)) return u;
    return (obras.find(o => o.status === "andamento") || obras[0] || {}).id || "";
  }

  function adicionar(itens) {
    for (const it of itens) {
      const x = { id: ++seq, chave: it.chave, file: it.file, url: URL.createObjectURL(it.file), estado: "lendo", aviso: "Lendo…", campos: { tipo: "pagamento", data: "", valor: "", parte: "", descricao: "" }, obra: "", texto: "" };
      fila.push(x);
      ler(it.file, a => { x.aviso = a; const el = $(`[data-cp="${x.id}"] .cp-aviso`); if (el) el.textContent = a; })
        .then(texto => { x.texto = texto; const c = interpretar(texto, it.file.name); x.campos = { ...c, valor: c.valor ? fmt.num(c.valor, 2) : "" }; x.obra = sugerirObra(`${it.texto || ""}\n${texto}`); x.aviso = ""; })
        .catch(e => { x.aviso = `Não consegui ler (${e.message}). Preencha à mão.`; x.obra = sugerirObra(it.texto || ""); })
        .finally(() => { x.estado = "pronto"; desenhar(); });
    }
    desenhar();
  }

  function desenhar() {
    const box = $("#cpFila"); if (!box) return;
    if (!fila.length) { box.innerHTML = `<div class="empty">Nenhum comprovante na fila.<br><small>No celular: no WhatsApp, segure o comprovante → <b>Compartilhar</b> → <b>P3 Usinas</b>. Ou use <b>+ Escolher arquivos</b>.</small></div>`; return; }
    const obrasOpts = sel => opts(obras.map(o => [o.id, `${o.nome}${o.status === "andamento" ? " · em andamento" : ""}`]), sel, "Escolha a obra…");
    box.innerHTML = fila.map(x => `<div class="card cp-card" data-cp="${x.id}">
      <div class="cp-prev">${ehPdf(x.file) ? `<div class="cp-pdf">PDF</div>` : `<img src="${x.url}" alt="">`}<a href="${x.url}" target="_blank" rel="noopener" class="muted">abrir</a></div>
      <div class="cp-corpo">
        <p class="cp-nome"><b>${esc(x.file.name || "comprovante")}</b> ${x.estado === "lancado" ? `<span class="badge ok">Lançado</span>` : x.aviso ? `<span class="cp-aviso${/^Não/.test(x.aviso) ? " cp-erro" : " muted"}">${esc(x.aviso)}</span>` : ""}</p>
        ${x.estado === "lancado" ? `<p class="muted" style="margin:0">${esc(x.resumo)}</p>` : `<div class="grid-form">
          <label class="f wide">Obra<select data-c="obra">${obrasOpts(x.obra)}</select></label>
          <label class="f">Tipo<select data-c="tipo">${opts([["pagamento", "Pagamento (saiu)"], ["recebimento", "Recebimento (entrou)"]], x.campos.tipo)}</select></label>
          <label class="f">Valor (R$)<input data-c="valor" inputmode="decimal" value="${esc(x.campos.valor)}"></label>
          <label class="f">Data<input data-c="data" type="date" value="${esc(x.campos.data)}"></label>
          <label class="f">${x.campos.tipo === "recebimento" ? "Quem pagou" : "Fornecedor / quem recebeu"}<input data-c="parte" value="${esc(x.campos.parte)}"></label>
          <label class="f wide">Descrição<input data-c="descricao" value="${esc(x.campos.descricao)}"></label></div>
          ${x.texto ? `<details class="cp-texto"><summary>Ver o texto lido</summary><pre>${esc(x.texto.trim().slice(0, 3000))}</pre></details>` : ""}
          <p class="ob-acoes"><button class="btn primary" data-lancar ${x.estado !== "pronto" ? "disabled" : ""}>${x.estado === "enviando" ? "Lançando…" : x.estado === "lendo" ? "Lendo…" : "Lançar na obra"}</button><button class="btn ghost" data-tirar>Descartar</button></p>`}
      </div></div>`).join("") + (fila.some(x => x.estado === "lancado") ? `<p><button class="btn ghost sm" id="cpLimpar">Tirar os já lançados da lista</button></p>` : "");

    $$("[data-cp]", box).forEach(card => {
      const x = fila.find(f => f.id === Number(card.dataset.cp));
      $$("[data-c]", card).forEach(i => { i[i.tagName === "SELECT" ? "onchange" : "oninput"] = () => { if (i.dataset.c === "obra") x.obra = i.value; else x.campos[i.dataset.c] = i.value; if (i.dataset.c === "tipo") desenhar(); }; });
      const tirar = $("[data-tirar]", card); if (tirar) tirar.onclick = async () => { await esquecer(x.chave); URL.revokeObjectURL(x.url); fila = fila.filter(f => f !== x); desenhar(); };
      const lancar = $("[data-lancar]", card); if (lancar) lancar.onclick = () => lancarItem(x);
    });
    const limpar = $("#cpLimpar"); if (limpar) limpar.onclick = () => { fila.filter(f => f.estado === "lancado").forEach(f => URL.revokeObjectURL(f.url)); fila = fila.filter(f => f.estado !== "lancado"); desenhar(); };
  }

  async function lancarItem(x) {
    const c = x.campos, valor = n(c.valor);
    if (!x.obra) return toast("Escolha a obra.", "bad");
    if (!(valor > 0)) return toast("Informe o valor.", "bad");
    x.estado = "enviando"; desenhar();
    try {
      const anexo = await anexar(x.obra, x.file);
      const obra = await api(`obras/${encodeURIComponent(x.obra)}`);
      const lanc = { data: c.data || new Date().toISOString().slice(0, 10), tipo: c.tipo, descricao: c.descricao || "Comprovante", parte: c.parte || "", valor, anexo };
      await api(`obras/${encodeURIComponent(x.obra)}`, { method: "PUT", body: { lancamentos: [...(obra.lancamentos || []), lanc] } });
      ultimaObra.set(x.obra);
      await esquecer(x.chave);
      x.estado = "lancado"; x.resumo = `${c.tipo === "recebimento" ? "Recebimento" : "Pagamento"} de ${fmt.brl(valor)} em ${obra.nome}${lanc.parte ? ` · ${lanc.parte}` : ""}`;
      toast("Lançado na obra.", "ok");
    } catch (e) { x.estado = "pronto"; toast(e.message, "bad"); }
    desenhar();
  }

  window.P3.register("comprovante", { render });
})();
