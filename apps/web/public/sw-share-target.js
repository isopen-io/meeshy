/**
 * LE SERVICE WORKER REÇOIT CE QU'UNE AUTRE APPLICATION PARTAGE À MEESHY (#8884).
 *
 * Le manifeste de la PWA déclare un `share_target` (`vite.config.ts`) : le
 * système envoie le partage en `POST /share` (multipart — fichiers, titre,
 * texte, adresse). Une page statique ne sait pas lire un POST ; le worker, si.
 * Il range le contenu dans IndexedDB et répond par une redirection 303 vers
 * `/share`, que la page lit (`src/lib/share-incoming/web-inbox.ts`), ouvre sur
 * la feuille d'envoi, puis purge.
 *
 * Chargé par `importScripts` EN TÊTE du service worker généré
 * (`SERVICE_WORKER_SCRIPTS`, `vite.config.ts`). Il n'intercepte QUE ce POST.
 *
 * ## BORNES
 *
 * Un partage vient d'un tiers : dix fichiers et 100 Mo au plus, le reste est
 * écarté (et non tronqué) — la feuille d'envoi plafonne de toute façon. Seules
 * les images et les vidéos sont rangées (les types du `share_target`), et les
 * textes sont bornés à 20 000 caractères, comme dans la coque Android
 * (`ShareIntentRules.MAX_TEXT_CHARS`). Les
 * fichiers ne restent que le temps d'être lus : la page les purge à la lecture,
 * et rejette tout partage de plus d'une heure.
 *
 * ## UN ÉCHEC DE STOCKAGE N'EMPÊCHE PAS LE RETOUR
 *
 * Quota épuisé, IndexedDB refusée (navigation privée) : la redirection part
 * quand même, la page ne trouve rien et retourne à l'accueil. Une réponse
 * d'erreur sur un POST de partage est une page blanche dans l'app qui partage.
 *
 * ## LE JUMEAU
 *
 * Les quatre littéraux de base (nom, version, magasin, clé) sont ceux de
 * `src/lib/share-incoming/web-inbox.ts` : un script classique ne peut importer
 * aucun module. `sw-share-target.test.ts` écrit avec ce fichier et lit avec le
 * module TypeScript sur le MÊME double d'IndexedDB.
 */
const SHARE_PATH = '/share';
const SHARE_DB_NAME = 'meeshy-share';
const SHARE_DB_VERSION = 1;
const SHARE_STORE_NAME = 'incoming';
const SHARE_KEY = 'current';
const SHARE_MAX_FILES = 10;
const SHARE_MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const SHARE_MAX_TEXT_CHARS = 20000;

const textOf = (form, name) => {
  const value = form.get(name);
  return typeof value === 'string' ? value.slice(0, SHARE_MAX_TEXT_CHARS) : '';
};

const isShareable = (file) => typeof file.type === 'string' && (file.type.startsWith('image/') || file.type.startsWith('video/'));

const filesOf = (form) => {
  const kept = [];
  let total = 0;
  for (const [, value] of form.entries()) {
    if (typeof value === 'string' || !isShareable(value)) continue;
    if (kept.length >= SHARE_MAX_FILES || total + value.size > SHARE_MAX_TOTAL_BYTES) break;
    total += value.size;
    kept.push(value);
  }
  return kept;
};

const store = (record) =>
  new Promise((resolve) => {
    try {
      const open = indexedDB.open(SHARE_DB_NAME, SHARE_DB_VERSION);
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains(SHARE_STORE_NAME)) open.result.createObjectStore(SHARE_STORE_NAME);
      };
      open.onerror = () => resolve();
      open.onsuccess = () => {
        const db = open.result;
        try {
          const tx = db.transaction(SHARE_STORE_NAME, 'readwrite');
          tx.objectStore(SHARE_STORE_NAME).put(record, SHARE_KEY);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            resolve();
          };
          tx.onabort = tx.onerror;
        } catch {
          db.close();
          resolve();
        }
      };
    } catch {
      resolve();
    }
  });

const receive = async (request) => {
  try {
    const form = await request.formData();
    await store({
      receivedAt: Date.now(),
      files: filesOf(form),
      text: textOf(form, 'text'),
      title: textOf(form, 'title'),
      url: textOf(form, 'url'),
    });
  } catch {
    /* rien de lisible : la page n'y trouvera rien */
  }
  return Response.redirect(self.location.origin + SHARE_PATH, 303);
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'POST') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname !== SHARE_PATH) return;
  event.respondWith(receive(request));
});
