const CACHE_NAME = 'florian-portfolio-v5';
const BOOTSTRAP_CACHE = 'bootstrap-data-v4';
const MAX_CACHED_IMAGES = 400;
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
    event.respondWith(fetchNetworkRequest(event.request));
    return;
  }

  if (url.hostname.includes('supabase.co')) {
    event.respondWith(fetchNetworkRequest(event.request));
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

async function fetchNetworkRequest(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const origin = new URL(request.url).origin;
    const requestOrigin = request.headers.get('Origin');
    console.warn('[SW] Network request failed:', origin, error instanceof Error ? error.message : 'unknown error');
    const headers = new Headers({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
    });
    if (requestOrigin) headers.set('Access-Control-Allow-Origin', requestOrigin);
    return new Response(
      JSON.stringify({ error: 'network_unavailable', message: 'La requête réseau a échoué.' }),
      { status: 503, headers }
    );
  }
}

async function networkFirstBootstrap(request) {
  const forceLive = request.headers.get('x-force-live') === 'true';
  if (forceLive) await caches.delete(BOOTSTRAP_CACHE);
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
  const cache = await caches.open(CACHE_NAME);
  const cacheKey = getImageCacheKey(request.url);
  const cached = await cache.match(cacheKey);
  if (cached && !isExpiredSignedStorageUrl(request.url)) {
    return cached;
  }
  if (cached) {
    await cache.delete(cacheKey);
  }
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(cacheKey, response.clone());
      const keys = await cache.keys();
      if (keys.length > MAX_CACHED_IMAGES) {
        await Promise.all(keys.slice(0, keys.length - MAX_CACHED_IMAGES).map((key) => cache.delete(key)));
      }
    }
    return response;
  } catch {
    return new Response('Image non disponible hors ligne', { status: 503 });
  }
}

function getImageCacheKey(rawUrl) {
  const url = new URL(rawUrl);
  url.searchParams.delete('token');
  return url.toString();
}

function isExpiredSignedStorageUrl(rawUrl) {
  try {
    const token = new URL(rawUrl).searchParams.get('token');
    if (!token) return false;
    const encodedPayload = token.split('.')[1];
    if (!encodedPayload) return false;
    const base64 = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now();
  } catch {
    // Unknown token format: rely on the server response instead of blocking an image.
    return false;
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
      Promise.all(urls.map((url) => cache.delete(getImageCacheKey(url)))).then(() => {
        event.ports[0]?.postMessage({ success: true });
      });
    });
  }
});