/**
 * LE SERVICE WORKER RANGE L'ISSUE D'UN ENVOI DE FOND (#11311, W5).
 *
 * Quand la page passe à l'arrière-plan en plein envoi, elle confie le reste du
 * fichier au navigateur (Background Fetch, `src/lib/api/tus-background.ts`) :
 * il le poursuit page suspendue, voire fermée. Ce script reçoit l'issue et la
 * range sur le checkpoint IndexedDB de l'envoi (`src/lib/api/tus-checkpoint.ts`) —
 * la page qui revient rend alors le média sans réseau, ou reprend au premier
 * plan si l'envoi de fond a échoué.
 *
 * Chargé par `importScripts` EN TÊTE du service worker généré
 * (`SERVICE_WORKER_SCRIPTS`, `vite.config.ts`). Il n'écoute QUE les envois de
 * fond de ce module (préfixe `meeshy-tus:`) et n'intercepte aucune requête.
 *
 * ## BORNES
 *
 * Un « succès » dont la réponse n'est pas l'accusé de la dernière tranche
 * (`tus-handler.ts:612-652`, `data.attachment` complet) ne fabrique AUCUN média :
 * le marqueur de fond part, le checkpoint reste, et la page reprend au premier
 * plan. Un checkpoint effacé entre-temps (envoi annulé) n'est pas ressuscité.
 * Un échec de stockage n'empêche pas de prévenir les pages.
 *
 * ## LE JUMEAU
 *
 * Les littéraux (nom, version et magasin de la base, préfixe, type du message)
 * sont ceux de `tus-checkpoint.ts` et `tus-background.ts` : un script classique
 * ne peut importer aucun module. `sw-background-upload.test.ts` exécute ce
 * fichier sur le MÊME double d'IndexedDB que le module TypeScript.
 */
const TUS_DB_NAME = 'meeshy-tus';
const TUS_DB_VERSION = 1;
const TUS_STORE_NAME = 'checkpoints';
const TUS_ID_PREFIX = 'meeshy-tus:';
const TUS_MESSAGE = 'meeshy:tus-background';

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const finishedMedia = async (response) => {
  if (response.status !== 200) return null;
  try {
    const payload = await response.json();
    const attachment = isRecord(payload) && payload.success === true && isRecord(payload.data) ? payload.data.attachment : null;
    if (!isRecord(attachment)) return null;
    const { id, fileUrl, mimeType, thumbHash } = attachment;
    if (typeof id !== 'string' || id === '' || typeof fileUrl !== 'string' || typeof mimeType !== 'string') return null;
    return { postMediaId: id, fileUrl, mimeType, ...(typeof thumbHash === 'string' && thumbHash !== '' ? { thumbHash } : {}) };
  } catch {
    return null;
  }
};

const mediaOf = async (registration) => {
  try {
    const records = await registration.matchAll();
    const response = records.length === 0 ? null : await records[0].responseReady;
    return response === null ? null : await finishedMedia(response);
  } catch {
    return null;
  }
};

const update = (fingerprint, change) =>
  new Promise((resolve) => {
    try {
      const open = indexedDB.open(TUS_DB_NAME, TUS_DB_VERSION);
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains(TUS_STORE_NAME)) open.result.createObjectStore(TUS_STORE_NAME);
      };
      open.onerror = () => resolve();
      open.onsuccess = () => {
        const db = open.result;
        const settle = () => {
          db.close();
          resolve();
        };
        try {
          const tx = db.transaction(TUS_STORE_NAME, 'readwrite');
          const rows = tx.objectStore(TUS_STORE_NAME);
          const read = rows.get(fingerprint);
          read.onsuccess = () => {
            if (isRecord(read.result)) rows.put(change(read.result), fingerprint);
          };
          tx.oncomplete = settle;
          tx.onerror = settle;
          tx.onabort = settle;
        } catch {
          settle();
        }
      };
    } catch {
      resolve();
    }
  });

const withoutBackground = (row) => {
  const { background, ...rest } = row;
  return rest;
};

const notify = async (fingerprint) => {
  try {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach((client) => client.postMessage({ type: TUS_MESSAGE, fingerprint }));
  } catch {
    /* aucune page ouverte à prévenir : elle lira le checkpoint à son retour */
  }
};

const settle = async (registration, succeeded) => {
  const fingerprint = registration.id.slice(TUS_ID_PREFIX.length);
  const media = succeeded ? await mediaOf(registration) : null;
  await update(fingerprint, (row) => (media === null ? withoutBackground(row) : { ...withoutBackground(row), offset: row.fileSize, finished: media }));
  await notify(fingerprint);
};

const listen = (type, succeeded) =>
  self.addEventListener(type, (event) => {
    const { registration } = event;
    if (typeof registration.id !== 'string' || !registration.id.startsWith(TUS_ID_PREFIX)) return;
    event.waitUntil(settle(registration, succeeded));
  });

listen('backgroundfetchsuccess', true);
listen('backgroundfetchfail', false);
listen('backgroundfetchabort', false);
