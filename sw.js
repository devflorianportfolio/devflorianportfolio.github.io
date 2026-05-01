const CACHE_NAME = 'florian-portfolio-v2';
const BOOTSTRAP_CACHE = 'bootstrap-data-v2';

// Assets statiques à précacher
const STATIC_ASSETS = [
  '/florian.ico',
];

// ── Install : précache les assets statiques ──────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate : nettoie les anciens caches ────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== BOOTSTRAP_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch : stratégie par type de ressource ──────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 0. Ignorer les schémas non supportés par la Cache API (ex: chrome-extension://)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // 1. Ignorer toutes les requêtes Vite dev (HMR, modules, token)
  if (
    url.pathname.startsWith('/@vite/') ||
    url.pathname.startsWith('/@fs/') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/') ||
    url.searchParams.has('token') ||
    url.searchParams.has('t') // timestamp Vite HMR
  ) return;

  // 2. Edge function bootstrap → Network first, fallback cache
  if (url.pathname.includes('/functions/v1/bootstrap')) {
    event.respondWith(networkFirstBootstrap(event.request));
    return;
  }

  // 3. Images Supabase Storage → Cache first (longue durée)
  if (url.hostname.includes('supabase.co') && url.pathname.includes('/storage/')) {
    event.respondWith(cacheFirstImages(event.request));
    return;
  }

  // 4. API Supabase REST → Network only (données dynamiques)
  if (url.hostname.includes('supabase.co') && url.pathname.includes('/rest/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 5. Supabase Auth & Realtime → Network only
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 6. Assets JS/CSS/fonts → Cache first avec fallback réseau
  if (
    event.request.destination === 'script' ||
    event.request.destination === 'style' ||
    event.request.destination === 'font'
  ) {
    event.respondWith(cacheFirstStatic(event.request));
    return;
  }

  // 7. Navigation (HTML) → Network only en dev, fallback index.html en prod
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cached = await caches.match('/index.html', { ignoreSearch: true });
        return cached || new Response('Hors ligne', { status: 503 });
      })
    );
    return;
  }

  // 8. Tout le reste → Network only (ne pas cacher l'inconnu)
});

// ── Stratégies ───────────────────────────────────────────────────

async function networkFirstBootstrap(request) {
  try {
    const response = await fetch(request);
    // La Cache API ne supporte que les requêtes GET
    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(BOOTSTRAP_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = request.method === 'GET' ? await caches.match(request) : null;
    if (cached) return cached;
    return new Response(
      JSON.stringify({ success: false, error: 'Offline — données en cache non disponibles' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function cacheFirstImages(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Image non disponible hors ligne', { status: 503 });
  }
}

async function cacheFirstStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Asset non disponible hors ligne', { status: 503 });
  }
}

// ── Message : forcer la mise à jour du cache bootstrap ───────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_BOOTSTRAP_CACHE') {
    caches.delete(BOOTSTRAP_CACHE).then(() => {
      event.ports[0]?.postMessage({ success: true });
    });
  }
});