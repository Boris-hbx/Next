const CACHE_NAME = 'next-v6';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/login.html',
    '/assets/css/base.css',
    '/assets/css/style.css',
    '/assets/css/components.css',
    '/assets/css/mobile.css',
    '/assets/css/abao.css',
    '/assets/js/api.js',
    '/assets/js/utils.js',
    '/assets/js/app.js',
    '/assets/js/tasks.js',
    '/assets/js/modal.js',
    '/assets/js/drag.js',
    '/assets/js/review.js',
    '/assets/js/routines.js',
    '/assets/js/features.js',
    '/assets/js/abao.js',
    '/assets/js/settings.js',
];

// Install: cache static assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// Fetch: network first, fallback to cache
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // API requests: always network
    if (url.pathname.startsWith('/api/')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Cache successful responses
                if (response.ok) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Fallback to cache
                return caches.match(event.request);
            })
    );
});
