const CACHE_VERSION = 'v1';
const CACHE_NAME = `gallery-cache-${CACHE_VERSION}`;
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];
const isCacheableUrl = (url) => {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
};
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      const validAssets = CORE_ASSETS.filter(isCacheableUrl);
      return cache.addAll(validAssets).catch((error) => {
        console.warn('⚠️ Erreur cache assets:', error);
        return Promise.resolve();
      });
    })
  );
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.race([
      fetch(self.registration.scope, { 
        method: 'HEAD',
        cache: 'no-cache',
        mode: 'no-cors'
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 3000)
      )
    ])
      .then(() => {
        return caches.keys().then((cacheNames) => {
          return Promise.all(
            cacheNames
              .filter((name) => name !== CACHE_NAME)
              .map((name) => {
                return caches.delete(name);
              })
          );
        });
      })
      .catch((error) => {
        console.log('📴 Hors ligne ou timeout - Conservation de tous les caches');
        console.log('   Raison:', error.message);
        return Promise.resolve();
      })
      .then(() => {
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!isCacheableUrl(request.url)) {
    return;
  }
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone).catch((error) => {
              console.warn('⚠️ Erreur mise en cache:', error);
            });
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable',
          });
        });
      })
  );
});

self.addEventListener('message', (event) => {
  const { type, urls } = event.data;
  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (type === 'CACHE_GALLERY_IMAGES' && Array.isArray(urls)) {
    event.waitUntil(
      caches.open(CACHE_NAME).then(async (cache) => {
        const validUrls = urls.filter(isCacheableUrl);
        const results = await Promise.allSettled(
          validUrls.map(url => 
            fetch(url)
              .then(response => {
                if (response.ok) {
                  return cache.put(url, response);
                }
                throw new Error(`HTTP ${response.status}`);
              })
              .catch(error => {
                console.warn(`⚠️ Erreur cache ${url}:`, error);
              })
          )
        );
        
        const successCount = results.filter(r => r.status === 'fulfilled').length;
      })
    );
  }
});