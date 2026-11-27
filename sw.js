// Service worker da Agenda da Ala: deixa o site abrir sem internet (só consulta).
// Guarda apenas os arquivos do site. Os dados das atividades ficam no próprio
// aparelho, salvos pelo site depois de cada carregamento.
const VERSAO = 'agenda-v1';
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/dist/umd/supabase.js';
const ARQUIVOS = ['/', '/publico/', '/config.js', '/manifest.webmanifest', '/publico/manifest.webmanifest',
  '/icones/icon-192.png', '/icones/icon-512.png', '/icones/apple-touch-icon.png', '/google-g.svg', SUPABASE_JS];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => Promise.all(ARQUIVOS.map(u =>
    fetch(u, u === SUPABASE_JS ? {mode: 'cors', credentials: 'omit'} : {cache: 'no-cache'})
      .then(r => r.ok ? c.put(u, r) : null).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const chavePagina = u => {
  const p = new URL(u).pathname;
  if (p === '/' || p === '/index.html') return '/';
  if (p === '/publico' || p === '/publico/' || p === '/publico/index.html') return '/publico/';
  return null;
};

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Biblioteca do Supabase (endereço fixo): primeiro do aparelho.
  if (req.url === SUPABASE_JS) {
    e.respondWith(caches.match(SUPABASE_JS).then(r => r || fetch(req).then(res => {
      if (res.ok) caches.open(VERSAO).then(c => c.put(SUPABASE_JS, res.clone()));
      return res;
    })));
    return;
  }
  if (url.origin !== location.origin) return;              // banco de dados, fontes etc.: sempre pela internet
  if (url.pathname.startsWith('/api/') || url.pathname.endsWith('.ics') || url.pathname === '/sw.js') return;

  // Páginas: sempre a versão mais nova; sem internet, a última guardada.
  if (req.mode === 'navigate') {
    const k = chavePagina(req.url);
    e.respondWith(fetch(req).then(res => {
      if (res.ok && k) caches.open(VERSAO).then(c => c.put(k, res.clone()));
      return res;
    }).catch(() => caches.match(k || '/').then(r => r || caches.match('/'))));
    return;
  }

  // Demais arquivos do site: entrega o guardado e atualiza em segundo plano.
  e.respondWith(caches.open(VERSAO).then(c => c.match(req, {ignoreSearch: true}).then(guardado => {
    const rede = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => guardado);
    return guardado || rede;
  })));
});
