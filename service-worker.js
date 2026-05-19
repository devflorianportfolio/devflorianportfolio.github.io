// public/service-worker.js — VERSION 5
// PWA amélioré : galerie offline complète + sync en arrière-plan

const CACHE_VERSION = 'v5';
const CACHE_NAME            = `gallery-cache-${CACHE_VERSION}`;
const API_CACHE_NAME        = `api-cache-${CACHE_VERSION}`;
const BOOTSTRAP_CACHE_NAME  = `bootstrap-cache-${CACHE_VERSION}`;
const GALLERY_OFFLINE_CACHE = `gallery-offline-${CACHE_VERSION}`;  // ← NOUVEAU
const EGRESS_DB_NAME        = 'egress-tracker';
const EGRESS_STORE_NAME     = 'daily-egress';
const OFFLINE_GALLERY_STORE = 'offline-gallery';                    // ← NOUVEAU IndexedDB store

// Assets statiques à précacher
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
];

// Patterns API Supabase à cacher
const SUPABASE_REST_PATTERNS = [
  /rest\/v1\/site_config/,
  /rest\/v1\/gallery_images/,
  /rest\/v1\/about_content/,
  /rest\/v1\/skills/,
  /rest\/v1\/contact_info/,
  /rest\/v1\/social_links/,
  /rest\/v1\/notifications/,
  /rest\/v1\/advertisements/,
  /rest\/v1\/projects/,
];

const BOOTSTRAP_PATTERN = /functions\/v1\/bootstrap/;

// Durées de cache
const API_CACHE_DURATION       = 30 * 60 * 1000;  // 30 min
const BOOTSTRAP_CACHE_DURATION = 60 * 60 * 1000;  // 1h
const IMAGE_CACHE_MAX_AGE      = 7 * 24 * 60 * 60 * 1000; // 7 jours

// Limite de photos en cache offline (pour ne pas saturer le disque)
const MAX_OFFLINE_IMAGES = 200;

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

const openDB = (dbName, version, upgradeCallback) =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, version);
    req.onupgradeneeded = e => upgradeCallback && upgradeCallback(e.target.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  });

const openEgressDB = () =>
  openDB(EGRESS_DB_NAME, 1, db => {
    if (!db.objectStoreNames.contains(EGRESS_STORE_NAME))
      db.createObjectStore(EGRESS_STORE_NAME, { keyPath: 'date' });
  });

// ← NOUVEAU : base IndexedDB pour la méta-galerie offline
const openOfflineDB = () =>
  openDB('offline-meta', 2, db => {
    if (!db.objectStoreNames.contains(OFFLINE_GALLERY_STORE))
      db.createObjectStore(OFFLINE_GALLERY_STORE, { keyPath: 'url' });
  });

const getTodayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

// ─── Egress tracking (inchangé) ───────────────────────────────────────────────

const trackEgress = async (url, responseSize, category) => {
  try {
    const db    = await openEgressDB();
    const tx    = db.transaction(EGRESS_STORE_NAME, 'readwrite');
    const store = tx.objectStore(EGRESS_STORE_NAME);
    const dateKey = getTodayKey();
    const existing = await new Promise(res => {
      const r = store.get(dateKey);
      r.onsuccess = () => res(r.result);
      r.onerror   = () => res(null);
    });
    const record = existing || {
      date: dateKey, totalBytes: 0, requestCount: 0,
      categories: { api: 0, images: 0, fonts: 0, bootstrap: 0, other: 0 },
      cacheHits: 0, cacheMisses: 0,
    };
    record.totalBytes              += responseSize;
    record.requestCount            += 1;
    record.categories[category]     = (record.categories[category] || 0) + responseSize;
    record.cacheMisses             += 1;
    store.put(record);
    db.close();
  } catch {}
};

const trackCacheHit = async category => {
  try {
    const db    = await openEgressDB();
    const tx    = db.transaction(EGRESS_STORE_NAME, 'readwrite');
    const store = tx.objectStore(EGRESS_STORE_NAME);
    const dateKey = getTodayKey();
    const existing = await new Promise(res => {
      const r = store.get(dateKey);
      r.onsuccess = () => res(r.result);
      r.onerror   = () => res(null);
    });
    const record = existing || {
      date: dateKey, totalBytes: 0, requestCount: 0,
      categories: {}, cacheHits: 0, cacheMisses: 0,
    };
    record.cacheHits += 1;
    store.put(record);
    db.close();
  } catch {}
};

const getResponseSize = response => {
  const cl = response.headers.get('content-length');
  if (cl) return parseInt(cl, 10);
  const ct = response.headers.get('content-type') || '';
  if (ct.includes('image')) return 200 * 1024;
  if (ct.includes('font'))  return 50  * 1024;
  return 5 * 1024;
};

// ─── URL helpers ──────────────────────────────────────────────────────────────

const isCacheableUrl = url => {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
};

const isSupabaseApiRequest = url => SUPABASE_REST_PATTERNS.some(p => p.test(url));
const isBootstrapRequest   = url => BOOTSTRAP_PATTERN.test(url);
const isImageRequest       = url => /\.(jpg|jpeg|png|gif|webp|avif|svg)(\?|$)/i.test(url);
const isFontRequest        = url =>
  /\.(woff|woff2|ttf|otf|eot)(\?|$)/i.test(url) ||
  url.includes('fonts.googleapis.com') ||
  url.includes('fonts.gstatic.com');

// ─── NOUVEAU : enregistrer une image dans la méta offline ──────────────────────

const registerOfflineImage = async (url, metadata = {}) => {
  try {
    const db    = await openOfflineDB();
    const tx    = db.transaction(OFFLINE_GALLERY_STORE, 'readwrite');
    const store = tx.objectStore(OFFLINE_GALLERY_STORE);
    store.put({ url, cachedAt: Date.now(), ...metadata });

    // Rotation LRU : virer les plus vieilles au-delà de MAX_OFFLINE_IMAGES
    const all = await new Promise(res => {
      const r = store.getAll();
      r.onsuccess = () => res(r.result);
      r.onerror   = () => res([]);
    });
    if (all.length > MAX_OFFLINE_IMAGES) {
      all.sort((a, b) => a.cachedAt - b.cachedAt);
      const toDelete = all.slice(0, all.length - MAX_OFFLINE_IMAGES);
      const delTx    = db.transaction(OFFLINE_GALLERY_STORE, 'readwrite');
      const delStore = delTx.objectStore(OFFLINE_GALLERY_STORE);
      for (const item of toDelete) {
        delStore.delete(item.url);
        const galleryCache = await caches.open(GALLERY_OFFLINE_CACHE);
        galleryCache.delete(item.url);
      }
    }
    db.close();
  } catch {}
};

const getOfflineGalleryList = async () => {
  try {
    const db    = await openOfflineDB();
    const tx    = db.transaction(OFFLINE_GALLERY_STORE, 'readonly');
    const store = tx.objectStore(OFFLINE_GALLERY_STORE);
    return await new Promise(res => {
      const r = store.getAll();
      r.onsuccess = () => res(r.result);
      r.onerror   = () => res([]);
    });
  } catch { return []; }
};

// ─── Handlers réseau ──────────────────────────────────────────────────────────

const handleBootstrapRequest = async request => {
  const cache    = await caches.open(BOOTSTRAP_CACHE_NAME);
  const url      = new URL(request.url);
  const cacheKey = url.origin + url.pathname;
  const cached   = await cache.match(cacheKey);

  if (cached) {
    const cachedTime = cached.headers.get('x-cache-time');
    if (cachedTime && Date.now() - parseInt(cachedTime) < BOOTSTRAP_CACHE_DURATION) {
      trackCacheHit('bootstrap');
      // Revalidation silencieuse en arrière-plan
      fetch(request.clone()).then(async res => {
        if (res.ok) {
          const headers = new Headers(res.headers);
          headers.set('x-cache-time', Date.now().toString());
          const body = await res.blob();
          cache.put(cacheKey, new Response(body, { status: res.status, statusText: res.statusText, headers }));
        }
      }).catch(() => {});
      return cached;
    }
  }

  try {
    const netRes  = await fetch(request);
    if (netRes.ok) {
      const headers = new Headers(netRes.headers);
      headers.set('x-cache-time', Date.now().toString());
      const body    = await netRes.clone().blob();
      cache.put(cacheKey, new Response(body, { status: netRes.status, statusText: netRes.statusText, headers }));
      trackEgress(request.url, getResponseSize(netRes), 'bootstrap');
    }
    return netRes;
  } catch {
    if (cached) return cached;
    return new Response(JSON.stringify({ success: false, offline: true }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }
};

const handleApiRequest = async request => {
  const cache  = await caches.open(API_CACHE_NAME);
  const cached = await cache.match(request);

  if (cached) {
    const cachedTime = cached.headers.get('x-cache-time');
    if (cachedTime && Date.now() - parseInt(cachedTime) < API_CACHE_DURATION) {
      trackCacheHit('api');
      return cached;
    }
  }

  try {
    const netRes = await fetch(request);
    if (netRes.ok) {
      const headers = new Headers(netRes.headers);
      headers.set('x-cache-time', Date.now().toString());
      const body    = await netRes.clone().blob();
      cache.put(request, new Response(body, { status: netRes.status, statusText: netRes.statusText, headers }));
      trackEgress(request.url, getResponseSize(netRes), 'api');
    }
    return netRes;
  } catch {
    if (cached) return cached;
    // Retourner un tableau vide plutôt qu'une erreur pour la galerie
    return new Response(JSON.stringify([]), {
      status: 200, headers: { 'Content-Type': 'application/json', 'x-served-offline': 'true' },
    });
  }
};

// ← MODIFIÉ : handler image avec double cache (normal + offline dédié)
const handleImageRequest = async request => {
  // 1. Chercher dans le cache offline dédié d'abord
  const offlineCache  = await caches.open(GALLERY_OFFLINE_CACHE);
  const galleryCache  = await caches.open(CACHE_NAME);

  const cachedOffline = await offlineCache.match(request);
  if (cachedOffline) {
    trackCacheHit('images');
    return cachedOffline;
  }
  const cached = await galleryCache.match(request);
  if (cached) {
    trackCacheHit('images');
    // Revalider en arrière-plan
    fetch(request.clone()).then(res => {
      if (res.ok) { galleryCache.put(request, res); }
    }).catch(() => {});
    return cached;
  }

  // 2. Réseau
  try {
    const netRes = await fetch(request);
    if (netRes.ok) {
      trackEgress(request.url, getResponseSize(netRes), 'images');
      galleryCache.put(request, netRes.clone());
    }
    return netRes;
  } catch {
    // Image de remplacement offline
    return new Response(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
        <rect fill="#1a1a2e" width="400" height="300" rx="8"/>
        <text x="200" y="140" text-anchor="middle" fill="#4a4a6a" font-size="14" font-family="sans-serif">📷 Photo non disponible offline</text>
        <text x="200" y="165" text-anchor="middle" fill="#3a3a5a" font-size="11" font-family="sans-serif">Reconnectez-vous pour charger cette image</text>
      </svg>`,
      { headers: { 'Content-Type': 'image/svg+xml', 'x-served-offline': 'true' } }
    );
  }
};

const handleFontRequest = async request => {
  const cache  = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) { trackCacheHit('fonts'); return cached; }
  try {
    const netRes = await fetch(request);
    if (netRes.ok) { cache.put(request, netRes.clone()); trackEgress(request.url, getResponseSize(netRes), 'fonts'); }
    return netRes;
  } catch { throw request; }
};

// ─── Install & Activate ───────────────────────────────────────────────────────

self.addEventListener('install', event => {
  console.log('🔧 Service Worker v5: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(CORE_ASSETS.filter(a => !a.startsWith('chrome-extension://')))
        .catch(() => {})
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('✅ Service Worker v5: Activating...');
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(n => !n.includes(CACHE_VERSION))
          .map(n => { console.log('🗑️ Purge cache obsolète:', n); return caches.delete(n); })
      ))
      .then(() => self.clients.claim())
  );
});

// ─── Fetch handler ────────────────────────────────────────────────────────────

self.addEventListener('fetch', event => {
  const { request } = event;
  if (!isCacheableUrl(request.url)) return;
  if (request.method !== 'GET') return;

  if (isBootstrapRequest(request.url)) {
    event.respondWith(handleBootstrapRequest(request)); return;
  }
  if (isSupabaseApiRequest(request.url)) {
    event.respondWith(handleApiRequest(request)); return;
  }
  if (isImageRequest(request.url)) {
    // Enregistrer automatiquement les images Supabase dans la méta offline
    if (request.url.includes('supabase')) {
      registerOfflineImage(request.url);
    }
    event.respondWith(handleImageRequest(request)); return;
  }
  if (isFontRequest(request.url)) {
    event.respondWith(handleFontRequest(request)); return;
  }

  // Défaut : network first + fallback cache
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.status === 200) {
          trackEgress(request.url, getResponseSize(response), 'other');
          caches.open(CACHE_NAME).then(c => c.put(request, response.clone()).catch(() => {}));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') return caches.match('/offline.html');
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      })
  );
});

// ─── Message handler ──────────────────────────────────────────────────────────

self.addEventListener('message', event => {
  const { type, urls, url } = event.data || {};

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting(); break;

    case 'CLEAR_ALL_CACHES':
      Promise.all([
        caches.delete(CACHE_NAME),
        caches.delete(API_CACHE_NAME),
        caches.delete(BOOTSTRAP_CACHE_NAME),
        caches.delete(GALLERY_OFFLINE_CACHE),
      ]).then(() => console.log('🗑️ All caches cleared'));
      break;

    case 'CLEAR_API_CACHE':
      caches.delete(API_CACHE_NAME); break;

    case 'CLEAR_BOOTSTRAP_CACHE':
      caches.delete(BOOTSTRAP_CACHE_NAME); break;

    // ← NOUVEAU : precacher la galerie complète pour offline
    case 'CACHE_GALLERY_OFFLINE': {
      if (!Array.isArray(urls)) break;
      event.waitUntil(
        (async () => {
          const cache    = await caches.open(GALLERY_OFFLINE_CACHE);
          const validUrls = urls.filter(isCacheableUrl);
          let success = 0;
          await Promise.allSettled(
            validUrls.map(async u => {
              try {
                const res = await fetch(u);
                if (res.ok) {
                  await cache.put(u, res.clone());
                  await registerOfflineImage(u);
                  success++;
                }
              } catch {}
            })
          );
          console.log(`✅ ${success}/${validUrls.length} images en cache offline`);
          // Notifier le client
          event.source?.postMessage({ type: 'OFFLINE_CACHE_DONE', success, total: validUrls.length });
        })()
      );
      break;
    }

    // ← NOUVEAU : lister les images en cache offline
    case 'GET_OFFLINE_GALLERY':
      event.waitUntil(
        (async () => {
          const list = await getOfflineGalleryList();
          event.source?.postMessage({ type: 'OFFLINE_GALLERY_LIST', data: list });
        })()
      );
      break;

    // ← NOUVEAU : vider uniquement le cache galerie offline
    case 'CLEAR_OFFLINE_GALLERY':
      event.waitUntil(
        (async () => {
          await caches.delete(GALLERY_OFFLINE_CACHE);
          try {
            const db = await openOfflineDB();
            const tx = db.transaction(OFFLINE_GALLERY_STORE, 'readwrite');
            tx.objectStore(OFFLINE_GALLERY_STORE).clear();
            db.close();
          } catch {}
          event.source?.postMessage({ type: 'OFFLINE_GALLERY_CLEARED' });
        })()
      );
      break;

    // Ancien format toujours supporté
    case 'CACHE_GALLERY_IMAGES':
      if (Array.isArray(urls)) {
        event.waitUntil(
          caches.open(CACHE_NAME).then(async cache => {
            const valid = urls.filter(isCacheableUrl);
            await Promise.allSettled(
              valid.map(u =>
                fetch(u).then(res => { if (res.ok) return cache.put(u, res); }).catch(() => {})
              )
            );
          })
        );
      }
      break;

    case 'PREFETCH_BOOTSTRAP':
      event.waitUntil(
        fetch(url || '/functions/v1/bootstrap', { method: 'POST' })
          .then(res => { if (res.ok) console.log('✅ Bootstrap prefetched'); })
          .catch(() => {})
      );
      break;

    case 'GET_EGRESS_STATS':
      event.waitUntil(
        (async () => {
          try {
            const db    = await openEgressDB();
            const tx    = db.transaction(EGRESS_STORE_NAME, 'readonly');
            const store = tx.objectStore(EGRESS_STORE_NAME);
            const data  = await new Promise(res => {
              const r = store.getAll();
              r.onsuccess = () => res(r.result);
              r.onerror   = () => res([]);
            });
            db.close();
            event.source?.postMessage({ type: 'EGRESS_STATS_RESPONSE', data });
          } catch {
            event.source?.postMessage({ type: 'EGRESS_STATS_RESPONSE', data: [] });
          }
        })()
      );
      break;

    case 'CLEAR_EGRESS_STATS':
      event.waitUntil(
        (async () => {
          try {
            const db = await openEgressDB();
            const tx = db.transaction(EGRESS_STORE_NAME, 'readwrite');
            tx.objectStore(EGRESS_STORE_NAME).clear();
            db.close();
          } catch {}
        })()
      );
      break;
  }
});

// ─── Background sync ──────────────────────────────────────────────────────────

self.addEventListener('sync', event => {
  if (event.tag === 'sync-analytics') {
    event.waitUntil(Promise.resolve());
  }
  // ← NOUVEAU : re-sync galerie offline en arrière-plan quand réseau revient
  if (event.tag === 'sync-gallery-cache') {
    event.waitUntil(
      (async () => {
        try {
          // Récupérer la liste des images à mettre à jour depuis l'API
          const res  = await fetch('/rest/v1/gallery_images?select=url&order=created_at.desc&limit=50');
          if (!res.ok) return;
          const images = await res.json();
          const urls   = images.map(img => img.url).filter(Boolean);
          const cache  = await caches.open(GALLERY_OFFLINE_CACHE);
          await Promise.allSettled(
            urls.map(async u => {
              const imgRes = await fetch(u);
              if (imgRes.ok) { await cache.put(u, imgRes.clone()); await registerOfflineImage(u); }
            })
          );
          console.log('✅ Background sync: galerie mise à jour');
        } catch {}
      })()
    );
  }
});

// ─── Push notifications ───────────────────────────────────────────────────────

self.addEventListener('push', event => {
  if (event.data) {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.body, icon: '/favicon.ico', badge: '/favicon.ico',
        vibrate: [100, 50, 100], data: { url: data.url || '/' },
      })
    );
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
