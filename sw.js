const CACHE_NAME = 'florian-portfolio-v3';
const BOOTSTRAP_CACHE = 'bootstrap-data-v3';
const STATIC_ASSETS = [
  '/florian.ico',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

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

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (
    url.pathname.startsWith('/@vite/') ||
    url.pathname.startsWith('/@fs/') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/') ||
    url.searchParams.has('token') ||
    url.searchParams.has('t')
  ) return;

  if (url.pathname.includes('/functions/v1/bootstrap')) {
    event.respondWith(networkFirstBootstrap(event.request));
    return;
  }


  if (url.hostname.includes('supabase.co') && url.pathname.includes('/storage/')) {
    if (event.request.method !== 'GET') return;
    event.respondWith(cacheFirstImages(event.request));
    return;
  }

  if (url.hostname.includes('supabase.co') && url.pathname.includes('/rest/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (
    event.request.destination === 'script' ||
    event.request.destination === 'style' ||
    event.request.destination === 'font'
  ) {
    event.respondWith(cacheFirstStatic(event.request));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cached = await caches.match('/index.html', { ignoreSearch: true });
        return cached || new Response('Hors ligne', { status: 503 });
      })
    );
    return;
  }

});

async function networkFirstBootstrap(request) {
  try {
    const response = await fetch(request);
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

self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_BOOTSTRAP_CACHE') {
    caches.delete(BOOTSTRAP_CACHE).then(() => {
      event.ports[0]?.postMessage({ success: true });
    });
  }

  if (event.data?.type === 'DELETE_IMAGE_CACHE') {
    const { urls } = event.data;
    caches.open(CACHE_NAME).then((cache) => {
      urls.forEach((url) => cache.delete(url));
      event.ports[0]?.postMessage({ success: true });
    });
  }
});