const CACHE_VERSION = 'v2';
const CACHE_NAME = `gallery-cache-${CACHE_VERSION}`;
const API_CACHE_NAME = `api-cache-${CACHE_VERSION}`;

// Assets statiques à mettre en cache
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
];

// URLs de l'API Supabase à cacher
const SUPABASE_PATTERNS = [
  /rest\/v1\/site_config/,
  /rest\/v1\/gallery_images/,
  /rest\/v1\/about_content/,
  /rest\/v1\/skills/,
  /rest\/v1\/contact_info/,
  /rest\/v1\/social_links/,
];

// Durée du cache API en ms (30 minutes)
const API_CACHE_DURATION = 30 * 60 * 1000;

const isCacheableUrl = (url) => {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
};

const isSupabaseApiRequest = (url) => {
  return SUPABASE_PATTERNS.some(pattern => pattern.test(url));
};

const isImageRequest = (url) => {
  return /\.(jpg|jpeg|png|gif|webp|avif|svg)(\?|$)/i.test(url);
};

// Installation - Précacher les assets statiques
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      const validAssets = CORE_ASSETS.filter(asset => 
        !asset.startsWith('chrome-extension://') && 
        (asset.startsWith('/') || isCacheableUrl(asset))
      );
      return cache.addAll(validAssets).catch((error) => {
        console.warn('⚠️ Erreur cache assets:', error);
        return Promise.resolve();
      });
    })
  );
  self.skipWaiting();
});

// Activation - Nettoyer les anciens caches
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
              .filter((name) => name !== CACHE_NAME && name !== API_CACHE_NAME)
              .map((name) => caches.delete(name))
          );
        });
      })
      .catch((error) => {
        console.log('📴 Hors ligne ou timeout - Conservation de tous les caches');
        return Promise.resolve();
      })
      .then(() => self.clients.claim())
  );
});

// Stratégie de cache pour les requêtes API Supabase
const handleApiRequest = async (request) => {
  const cache = await caches.open(API_CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    const cachedTime = cachedResponse.headers.get('x-cache-time');
    if (cachedTime && Date.now() - parseInt(cachedTime) < API_CACHE_DURATION) {
      console.log('📦 API cache hit:', request.url.split('?')[0]);
      return cachedResponse;
    }
  }
  
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cloner et ajouter un header de timestamp
      const responseToCache = networkResponse.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('x-cache-time', Date.now().toString());
      
      const body = await responseToCache.blob();
      const cachedResponse = new Response(body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers
      });
      
      cache.put(request, cachedResponse);
      console.log('💾 API cached:', request.url.split('?')[0]);
    }
    
    return networkResponse;
  } catch (error) {
    // Retourner le cache même expiré en mode hors-ligne
    if (cachedResponse) {
      console.log('📴 Offline - returning stale cache:', request.url.split('?')[0]);
      return cachedResponse;
    }
    throw error;
  }
};

// Stratégie stale-while-revalidate pour les images
const handleImageRequest = async (request) => {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  // Retourner immédiatement le cache s'il existe
  if (cachedResponse) {
    // Revalider en arrière-plan
    fetch(request).then(response => {
      if (response.ok) {
        cache.put(request, response);
      }
    }).catch(() => {});
    
    return cachedResponse;
  }
  
  // Pas de cache, fetch depuis le réseau
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return new Response('Image not available offline', { status: 503 });
  }
};

// Fetch handler principal
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  if (!isCacheableUrl(request.url)) {
    return;
  }
  
  // Ignorer les requêtes POST, etc.
  if (request.method !== 'GET') {
    return;
  }
  
  // Stratégie spéciale pour les API Supabase
  if (isSupabaseApiRequest(request.url)) {
    event.respondWith(handleApiRequest(request));
    return;
  }
  
  // Stratégie stale-while-revalidate pour les images
  if (isImageRequest(request.url)) {
    event.respondWith(handleImageRequest(request));
    return;
  }
  
  // Network first pour le reste
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone).catch(() => {});
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
            return caches.match('/offline.html');
          }
          return new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable',
          });
        });
      })
  );
});

// Messages du client
self.addEventListener('message', (event) => {
  const { type, urls } = event.data;
  
  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  
  if (type === 'CLEAR_API_CACHE') {
    caches.delete(API_CACHE_NAME).then(() => {
      console.log('🗑️ API cache cleared');
    });
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
                console.warn(`⚠️ Erreur cache ${url}:`, error.message);
              })
          )
        );
        
        const successCount = results.filter(r => r.status === 'fulfilled').length;
        console.log(`✅ ${successCount}/${validUrls.length} images cached`);
      })
    );
  }
});
