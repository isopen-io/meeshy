import { apiConfig } from '@/lib/api/config';
import { type Credential } from '@/lib/api/http';
import { credentialFromSession } from '@/lib/api/client';
import { sessionStore, type SessionState } from '@/lib/api/session';

/**
 * **LE CRÉDENTIAL QUE LE SERVICE WORKER PARTAGE AVEC LA PAGE** (#7368, W4).
 *
 * `public/sw-push.js` est un script CLASSIQUE (`importScripts`, voir son
 * propre en-tête) : il ne peut lire ni `localStorage` (portée FENÊTRE,
 * jamais worker — la session vit là, `session.ts:14`) ni aucun module de
 * `src/`. Sans une frontière PARTAGÉE, un push reçu onglet fermé / PWA
 * suspendue ne peut jamais accuser sa remise — exactement le symptôme du
 * relevé (#7368 § Contexte) : « ✓ jusqu'à reconnexion ».
 *
 * IndexedDB est cette frontière : même ORIGINE, visible fenêtre ET worker,
 * et PERSISTANTE au-delà d'une fermeture d'onglet — le seul candidat qui
 * couvre le cas visé. Miroir du Keychain partagé par App Group côté iOS
 * (`NSEDataSync.readAuthToken`, `NSEDataSync.swift`).
 *
 * **JUMEAU GATÉ avec `public/sw-push.js`** (même doctrine que `sw-caches.ts`
 * § `LEGACY_CACHE_NAMESPACE`) : les TROIS littéraux ci-dessous doivent rester
 * identiques aux constantes miroir du worker — `sw-push.test.ts` écrit et lit
 * au travers du MÊME double (`test-support/fake-indexed-db.ts`), preuve
 * comportementale qu'aucune dérive n'a eu lieu entre les deux fichiers.
 */
export const DELIVERY_RECEIPT_DB_NAME = 'meeshy-push';
export const DELIVERY_RECEIPT_DB_VERSION = 1;
export const DELIVERY_RECEIPT_STORE_NAME = 'credential';
export const DELIVERY_RECEIPT_KEY = 'current';

/**
 * `apiBase` voyage AVEC le crédential — `apiConfig.base` (résolue au BUILD,
 * `config.ts`) est une origine ABSOLUE en déploiement (aucun proxy `/api`
 * devant `meeshy.me`, #5872) ; un script statique non transpilé ne peut pas
 * lire `import.meta.env.VITE_API_BASE`, donc rien d'autre ne la lui donne.
 */
export type DeliveryReceiptCredential = {
  readonly apiBase: string;
  readonly credential: Credential | null;
};

export function deliveryReceiptCredentialOf(session: SessionState): DeliveryReceiptCredential {
  return { apiBase: apiConfig.base, credential: credentialFromSession(session) };
}

export type CredentialWriter = (value: DeliveryReceiptCredential) => Promise<void>;

/**
 * La forme MINIMALE que ce module lit du magasin de session — jamais
 * `SessionStoreApi` entier (`session.ts`) : un témoin qui n'a besoin que de
 * `{ session }` n'a pas à fabriquer les six actions de la session réelle pour
 * satisfaire le type. `sessionStore` (réel) la satisfait par structure.
 */
export type SessionStoreLike = {
  getState(): { readonly session: SessionState };
  subscribe(listener: (state: { readonly session: SessionState }) => void): () => void;
};

/**
 * Pose le crédential courant, puis à chaque changement de session — même
 * discipline que `ensureSessionWatch` (`api/receipts.ts`) : une déconnexion
 * doit RETIRER le crédential du magasin partagé, jamais laisser le worker
 * accuser sous une identité qui n'est plus celle du lecteur.
 */
export function watchDeliveryReceiptCredential(params: {
  readonly sessionStore: SessionStoreLike;
  readonly write: CredentialWriter;
}): () => void {
  const push = (): void => {
    void params.write(deliveryReceiptCredentialOf(params.sessionStore.getState().session));
  };
  push();
  return params.sessionStore.subscribe(push);
}

/**
 * L'écriture RÉELLE — `best-effort` : une IndexedDB indisponible (portée
 * privée restrictive, quota épuisé, navigateur qui ne l'implémente pas)
 * laisse simplement le worker sans crédential au prochain push, jamais une
 * erreur qui remonterait à l'écran (même doctrine que `poserBadge`,
 * `sw-push.js`).
 */
export const writeDeliveryReceiptCredential: CredentialWriter = (value) =>
  new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve();
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DELIVERY_RECEIPT_DB_NAME, DELIVERY_RECEIPT_DB_VERSION);
    } catch {
      resolve();
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DELIVERY_RECEIPT_STORE_NAME)) db.createObjectStore(DELIVERY_RECEIPT_STORE_NAME);
    };
    request.onerror = () => resolve();
    request.onsuccess = () => {
      const db = request.result;
      try {
        const tx = db.transaction(DELIVERY_RECEIPT_STORE_NAME, 'readwrite');
        tx.objectStore(DELIVERY_RECEIPT_STORE_NAME).put(value, DELIVERY_RECEIPT_KEY);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          resolve();
        };
      } catch {
        db.close();
        resolve();
      }
    };
  });

/** L'ENVIRONNEMENT RÉEL — même découpage que `listenNotificationTapsInBrowser`. */
export function startDeliveryReceiptCredentialSync(): () => void {
  return watchDeliveryReceiptCredential({ sessionStore, write: writeDeliveryReceiptCredential });
}
