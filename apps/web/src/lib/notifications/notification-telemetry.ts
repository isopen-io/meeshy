import type { NotificationAction, SocialEventV2Input } from '@/lib/api/social-events-v2-types';
import type { NotificationChannel } from '@meeshy/shared/types/social-events-v2';

import { appelNatifMethode, type CoqueNative } from '@/lib/native-shell';

/**
 * **L'ENTONNOIR DES NOTIFICATIONS, CÔTÉ PAGE** (#10507) — le service worker
 * (`public/sw-push.js`, JUMEAU de ces trois noms) écrit `received`,
 * `displayed`, `opened` et `dismissed` dans IndexedDB ; la page, à son
 * chargement, VIDE la file et verse chaque événement dans la file v2, avec
 * l'`eventId` et l'heure que le worker leur a donnés (un rejeu ne recompte
 * rien). La file est vidée AVANT d'être versée : un double chargement ne
 * l'envoie pas deux fois.
 */
export const NOTIFICATION_TELEMETRY_DB_NAME = 'meeshy-telemetry';
export const NOTIFICATION_TELEMETRY_DB_VERSION = 1;
export const NOTIFICATION_TELEMETRY_STORE_NAME = 'outbox';
export const NOTIFICATION_TELEMETRY_KEY = 'notification-events';

type IdbRequest = { result: unknown; onsuccess: ((event: unknown) => void) | null; onerror: ((event: unknown) => void) | null };
type IdbStore = { get(key: string): IdbRequest; put(value: unknown, key: string): IdbRequest };
type IdbDatabase = {
  readonly objectStoreNames: { contains(name: string): boolean };
  createObjectStore(name: string): unknown;
  transaction(name: string, mode?: 'readwrite'): { objectStore(name: string): IdbStore };
  close(): void;
};
type IdbOpenRequest = IdbRequest & { onupgradeneeded: ((event: unknown) => void) | null };
export type IdbFactoryLike = { open(name: string, version?: number): IdbOpenRequest };

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const TECHNICAL_CODE = /^[A-Za-z0-9_.:-]{1,64}$/;

const textOf = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * L'événement d'une notification depuis la `data` de son push — JUMEAU
 * d'`evenementDeNotification` (`sw-push.js`) et de `SocialNotificationEvents`
 * (iOS) : l'identifiant de la notification, son type et le post visé, jamais
 * un titre ni un corps. `null` sans identifiant vérifiable par la passerelle.
 */
export function notificationEventOf(
  data: unknown,
  action: NotificationAction,
  channel: NotificationChannel,
): SocialEventV2Input | null {
  const fields = data !== null && typeof data === 'object' ? (data as Readonly<Record<string, unknown>>) : {};
  const id = textOf(fields.notificationId);
  if (!OBJECT_ID.test(id)) return null;
  const postId = textOf(fields.postId);
  const type = textOf(fields.type);
  return {
    type: 'notification',
    action,
    target: { kind: 'notification', id, ...(OBJECT_ID.test(postId) ? { parent: { kind: 'post', id: postId } } : {}) },
    surface: 'notifications',
    channel,
    ...(TECHNICAL_CODE.test(type) ? { notificationType: type } : {}),
  };
}

const isNotificationEvent = (value: unknown): value is SocialEventV2Input =>
  value !== null && typeof value === 'object' && (value as { readonly type?: unknown }).type === 'notification';

function open(idb: IdbFactoryLike): Promise<IdbDatabase | null> {
  return new Promise((resolve) => {
    let request: IdbOpenRequest;
    try {
      request = idb.open(NOTIFICATION_TELEMETRY_DB_NAME, NOTIFICATION_TELEMETRY_DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result as IdbDatabase;
      if (!db.objectStoreNames.contains(NOTIFICATION_TELEMETRY_STORE_NAME)) db.createObjectStore(NOTIFICATION_TELEMETRY_STORE_NAME);
    };
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const db = request.result as IdbDatabase;
      resolve(db.objectStoreNames.contains(NOTIFICATION_TELEMETRY_STORE_NAME) ? db : null);
    };
  });
}

function takeAll(db: IdbDatabase): Promise<readonly unknown[]> {
  return new Promise((resolve) => {
    try {
      const store = db.transaction(NOTIFICATION_TELEMETRY_STORE_NAME, 'readwrite').objectStore(NOTIFICATION_TELEMETRY_STORE_NAME);
      const read = store.get(NOTIFICATION_TELEMETRY_KEY);
      read.onsuccess = () => {
        const pending = Array.isArray(read.result) ? (read.result as readonly unknown[]) : [];
        if (pending.length === 0) {
          resolve([]);
          return;
        }
        const clear = store.put([], NOTIFICATION_TELEMETRY_KEY);
        clear.onsuccess = () => resolve(pending);
        clear.onerror = () => resolve([]);
      };
      read.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/** Vide la file du worker vers `record` ; rend le nombre d'événements versés. */
export async function drainNotificationTelemetry(
  idb: IdbFactoryLike | Pick<IDBFactory, 'open'> | undefined,
  record: (event: SocialEventV2Input) => void,
): Promise<number> {
  if (idb === undefined) return 0;
  /* Le vrai `IDBFactory` porte des rappels typés par `this` ; ce module n'en
     lit que le sous-ensemble ci-dessus, le même que le double des témoins. */
  const db = await open(idb as IdbFactoryLike);
  if (db === null) return 0;
  const pending = await takeAll(db);
  db.close();
  const events = pending.filter(isNotificationEvent);
  events.forEach(record);
  return events.length;
}

const shellEventOf = (line: unknown): SocialEventV2Input | null => {
  if (typeof line !== 'string') return null;
  try {
    const event: unknown = JSON.parse(line);
    return isNotificationEvent(event) && (event as { readonly channel?: unknown }).channel === 'fcm' ? event : null;
  } catch {
    return null;
  }
};

/**
 * **CE QUE LA COQUE ANDROID A NOTÉ APP FERMÉE** (#10938) — une bannière posée
 * par FCM lui-même ne passe ni par le plugin ni par la page : le natif la note
 * (`NotificationFunnelRules`, jumeau de `sw-push.js`) et la page la vide ici,
 * au démarrage, à côté de la file du worker. Un navigateur, ou une coque
 * construite avant la méthode, ne verse rien.
 */
export async function drainShellNotificationTelemetry(
  coque: CoqueNative | undefined,
  record: (event: SocialEventV2Input) => void,
): Promise<number> {
  const drain = appelNatifMethode(coque, 'MeeshyNotificationSettings', 'drainNotificationEvents');
  if (drain === null) return 0;
  const result = await drain({}).catch((): unknown => null);
  const lines = result !== null && typeof result === 'object' ? (result as { readonly events?: unknown }).events : undefined;
  const events = (Array.isArray(lines) ? lines : []).map(shellEventOf).filter((event) => event !== null);
  events.forEach(record);
  return events.length;
}

export type ReturningPage = {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
};

/**
 * **ET AU RETOUR DE LA PAGE, PAS SEULEMENT AU DÉMARRAGE** (#12585) — la coque
 * est `singleTask` : toucher une bannière, ou revenir de l'écran d'accueil,
 * reprend la page sans la recharger. Sans cette écoute, « reçue » et
 * « affichée » attendaient le prochain démarrage à froid pendant que
 * « ouverte » partait tout de suite, et la file native (100 lignes) perdait
 * les plus anciennes. Les deux files se vident en les lisant : relancer la
 * vidange ne renvoie rien deux fois.
 */
export function drainOnEachReturn(page: ReturningPage, drain: () => void): () => void {
  const onChange = (): void => {
    if (page.visibilityState === 'visible') drain();
  };
  drain();
  page.addEventListener('visibilitychange', onChange);
  return () => page.removeEventListener('visibilitychange', onChange);
}
