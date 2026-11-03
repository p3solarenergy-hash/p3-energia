// Deixa a P3 instalável como app. Sempre busca a versão nova na internet (sem esperar o cache de 10 min do GitHub);
// a cópia guardada só abre a tela se a rede cair. Os dados (Supabase) nunca passam por aqui: só os arquivos do próprio site.
const CACHE = "p3-site-v3";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
const buscar = async req => {
  const r = await fetch(req.url, { cache: "no-cache" });
  return r.redirected && req.mode === "navigate" ? fetch(req) : r;
};
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(buscar(e.request).then(r => {
    if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request)));
});
