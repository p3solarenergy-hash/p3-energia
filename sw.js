// Deixa a P3 instalável como app. Sempre busca a versão nova na internet (sem esperar o cache de 10 min do GitHub);
// a cópia guardada só abre a tela se a rede cair. Os dados (Supabase) nunca passam por aqui: só os arquivos do próprio site.
// Também recebe o "Compartilhar" do celular (comprovantes do WhatsApp): guarda os arquivos e abre a tela de lançamento.
const CACHE = "p3-site-v17";
const RECEBIDOS = "p3-compartilhado";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== RECEBIDOS).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
const buscar = async req => {
  const r = await fetch(req.url, { cache: "no-cache" });
  return r.redirected && req.mode === "navigate" ? fetch(req) : r;
};
async function receber(req) {
  const dados = await req.formData();
  const c = await caches.open(RECEBIDOS);
  const agora = Date.now();
  let i = 0;
  for (const f of dados.getAll("arquivos")) {
    if (!f || typeof f === "string" || !f.size) continue;
    await c.put(new Request(`./compartilhado/${agora}-${i++}`), new Response(f, { headers: { "Content-Type": f.type || "application/octet-stream", "X-Nome": encodeURIComponent(f.name || "comprovante"), "X-Texto": encodeURIComponent(String(dados.get("text") || dados.get("title") || "").slice(0, 500)) } }));
  }
  return Response.redirect("./index.html#/comprovante", 303);
}
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method === "POST" && u.origin === location.origin && u.pathname.endsWith("/compartilhar")) return e.respondWith(receber(e.request));
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(buscar(e.request).then(r => {
    if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request)));
});
