const CACHE_VERSION = 'v1';
const CACHE_NAME = `gallery-cache-${CACHE_VERSION}`;

// Resources essentielles à mettre en cache
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Vérifier si une URL est cacheable
const isCacheableUrl = (url) => {
  try {
    const urlObj = new URL(url);
    // Accepter uniquement http:// et https://
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
};

// Installation du Service Worker
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker: Installation');
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Filtrer les assets valides avant de les cacher
      const validAssets = CORE_ASSETS.filter(isCacheableUrl);
      return cache.addAll(validAssets).catch((error) => {
        console.warn('⚠️ Erreur cache assets:', error);
        // Ne pas bloquer l'installation si certains assets échouent
        return Promise.resolve();
      });
    })
  );
  
  // Forcer l'activation immédiate
  self.skipWaiting();
});

// Activation du Service Worker
self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker: Activation');
  
  event.waitUntil(
    // Vérifier la connexion avant de nettoyer les caches
    Promise.race([
      // Essayer de fetch avec timeout
      fetch(self.registration.scope, { 
        method: 'HEAD',
        cache: 'no-cache',
        mode: 'no-cors' // Évite les erreurs CORS
      }),
      // Timeout de 3 secondes
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 3000)
      )
    ])
      .then(() => {
        console.log('🌐 Connexion disponible - Nettoyage des anciens caches');
        // Connexion OK, on peut nettoyer les anciens caches
        return caches.keys().then((cacheNames) => {
          return Promise.all(
            cacheNames
              .filter((name) => name !== CACHE_NAME)
              .map((name) => {
                console.log('🗑️ Suppression ancien cache:', name);
                return caches.delete(name);
              })
          );
        });
      })
      .catch((error) => {
        console.log('📴 Hors ligne ou timeout - Conservation de tous les caches');
        console.log('   Raison:', error.message);
        // Pas de connexion, on garde tous les caches
        return Promise.resolve();
      })
      .then(() => {
        // Prendre le contrôle immédiatement
        return self.clients.claim();
      })
  );
});

// Interception des requêtes
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Ignorer les requêtes non-HTTP(S)
  if (!isCacheableUrl(request.url)) {
    return;
  }

  // Stratégie: Network First avec fallback sur Cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Mettre en cache uniquement les réponses réussies
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
        // Si réseau échoue, chercher dans le cache
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          
          // Page offline de secours
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

// Messages depuis l'application
self.addEventListener('message', (event) => {
  const { type, urls } = event.data;

  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (type === 'CACHE_GALLERY_IMAGES' && Array.isArray(urls)) {
    event.waitUntil(
      caches.open(CACHE_NAME).then(async (cache) => {
        // Filtrer les URLs valides
        const validUrls = urls.filter(isCacheableUrl);
        
        console.log(`📦 Mise en cache de ${validUrls.length} images`);
        
        // Cacher les images une par une pour éviter les erreurs
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
        console.log(`✅ ${successCount}/${validUrls.length} images mises en cache`);
      })
    );
  }
});