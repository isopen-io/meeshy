import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createFakeIndexedDB, type FakeIndexedDB } from '@/test-support/fake-indexed-db';
import {
  DELIVERY_RECEIPT_DB_NAME,
  DELIVERY_RECEIPT_KEY,
  DELIVERY_RECEIPT_STORE_NAME,
  type DeliveryReceiptCredential,
} from '@/lib/notifications/delivery-receipt-credential';

/**
 * LE HARNAIS DU SERVICE WORKER DE PUSH — `public/sw-push.js` monté dans un
 * `self` bouchonné, ses écouteurs capturés. Partagé par les témoins des
 * bannières (`sw-push.test.ts`) et de l'appel entrant (`sw-push-call.test.ts`) :
 * un seul bouchon de la Notifications API, donc une seule idée de ce que le
 * navigateur refuse.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
export const SOURCE = readFileSync(join(HERE, '../../public/sw-push.js'), 'utf8');

/** Le CODE seul : un doc-comment qui NOMME un champ interdit le documente, il ne le lit pas. */
export const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

type Listener = (event: ExtendableEventLike) => void;

export type ExtendableEventLike = {
  readonly data?: { json(): unknown };
  readonly notification?: NotificationLike;
  /** L'action d'une notification touchée — `''` pour le corps. */
  readonly action?: string;
  waitUntil(promise: Promise<unknown>): void;
};

export type NotificationLike = {
  readonly data: Record<string, unknown>;
  readonly tag?: string;
  close(): void;
};

export type ShownNotification = { readonly title: string; readonly options: Record<string, unknown> };

/** Une bannière de la barre de notifications, telle que `getNotifications()` la rend. */
export type TrayBanner = {
  readonly title: string;
  readonly body: string;
  readonly tag: string;
  readonly data: Record<string, unknown>;
  close(): void;
};

export type ClientStub = {
  readonly visibilityState: string;
  readonly url: string;
  focused: boolean;
  readonly messages: unknown[];
  focus(): Promise<void>;
  postMessage(message: unknown): void;
};

/** Une requête `fetch` captée par le bouchon, telle que `accuserRemise` la compose. */
export type CapturedFetch = { readonly url: string; readonly init: Record<string, unknown> };

export type WorkerHarness = {
  readonly listeners: Map<string, Listener>;
  readonly shown: ShownNotification[];
  readonly tray: TrayBanner[];
  readonly opened: string[];
  readonly badges: number[];
  readonly clients: ClientStub[];
  /** Les accusés de remise partis — vide tant qu'aucun push éligible n'a de crédential. */
  readonly deliveries: CapturedFetch[];
  readonly exports: {
    readonly PUSH_ROUTE_PATTERNS: Readonly<Record<string, string>>;
    readonly pushTargetUrl: (data: Record<string, unknown>) => string;
  };
  dispatch(type: string, event: Omit<ExtendableEventLike, 'waitUntil'>): Promise<void>;
};

export const windowClient = (visibilityState: string, url = 'https://meeshy.me/'): ClientStub => {
  const client: ClientStub = {
    visibilityState,
    url,
    focused: false,
    messages: [],
    focus: async () => {
      client.focused = true;
    },
    postMessage: (message) => void client.messages.push(message),
  };
  return client;
};

/**
 * `credential`, sème le double IndexedDB EXACTEMENT comme
 * `writeDeliveryReceiptCredential` (`delivery-receipt-credential.ts`, la
 * moitié « page » du jumeau) l'aurait écrit — même base, même magasin, même
 * clé — pour que ces témoins prouvent l'absence de dérive plutôt que de la
 * supposer. `fetchFails`, un accusé qui échoue au réseau ne doit ni lever ni
 * empêcher la bannière (best-effort, doc-comment de `accuserRemise`).
 */
export function mount({
  clients = [] as ClientStub[],
  already = [] as Record<string, unknown>[],
  credential,
  fetchFails = false,
}: {
  readonly clients?: ClientStub[];
  readonly already?: Record<string, unknown>[];
  readonly credential?: DeliveryReceiptCredential;
  readonly fetchFails?: boolean;
} = {}): WorkerHarness {
  const listeners = new Map<string, Listener>();
  const shown: ShownNotification[] = [];
  const opened: string[] = [];
  const badges: number[] = [];
  const deliveries: CapturedFetch[] = [];
  const idb: FakeIndexedDB = createFakeIndexedDB();
  if (credential !== undefined) idb.seed(DELIVERY_RECEIPT_DB_NAME, DELIVERY_RECEIPT_STORE_NAME, DELIVERY_RECEIPT_KEY, credential);
  /* La barre de notifications du navigateur : `getNotifications()` la lit, et
     `showNotification` y REMPLACE, à sa place, la bannière de même tag
     (« show steps » de la Notifications API). `already` y pose des bannières
     réduites à leur `data`. */
  const tray: TrayBanner[] = [];
  const onTray = (title: string, body: string, tag: string, data: Record<string, unknown>): TrayBanner => {
    const banner: TrayBanner = {
      title,
      body,
      tag,
      data,
      close: () => {
        const index = tray.indexOf(banner);
        if (index >= 0) tray.splice(index, 1);
      },
    };
    return banner;
  };
  already.forEach((data) => tray.push(onTray('', '', '', data)));

  const self = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    clients: {
      matchAll: async () => clients,
      openWindow: async (url: string) => {
        opened.push(url);
        return null;
      },
    },
    registration: {
      getNotifications: async (filter?: { readonly tag?: string }) =>
        filter?.tag === undefined ? [...tray] : tray.filter((existing) => existing.tag === filter.tag),
      showNotification: async (title: string, options: Record<string, unknown>) => {
        /* Les deux TypeError de « create a notification » (Notifications API) :
           le bouchon refuse ce que le navigateur refuserait, et la bannière
           qu'il refuse n'est jamais montrée. */
        if (options['silent'] === true && options['vibrate'] !== undefined) {
          throw new TypeError('silent ne se combine pas avec vibrate');
        }
        if (options['renotify'] === true && (typeof options['tag'] !== 'string' || options['tag'] === '')) {
          throw new TypeError('renotify exige un tag non vide');
        }
        shown.push({ title, options });
        const tag = typeof options['tag'] === 'string' ? options['tag'] : '';
        const data = typeof options['data'] === 'object' && options['data'] !== null ? (options['data'] as Record<string, unknown>) : {};
        const banner = onTray(title, typeof options['body'] === 'string' ? options['body'] : '', tag, data);
        const replaced = tag === '' ? -1 : tray.findIndex((existing) => existing.tag === tag);
        if (replaced >= 0) tray.splice(replaced, 1, banner);
        else tray.push(banner);
      },
    },
    navigator: {
      setAppBadge: async (count: number) => {
        badges.push(count);
      },
    },
    indexedDB: idb,
    fetch: async (url: string, init: Record<string, unknown>) => {
      deliveries.push({ url, init });
      if (fetchFails) throw new TypeError('Failed to fetch');
      return { ok: true, status: 200 };
    },
  } as Record<string, unknown>;

  new Function('self', SOURCE)(self);

  const pending: Promise<unknown>[] = [];
  return {
    listeners,
    shown,
    tray,
    opened,
    badges,
    clients,
    deliveries,
    exports: self['meeshyPushTarget'] as WorkerHarness['exports'],
    async dispatch(type, event) {
      const listener = listeners.get(type);
      if (listener === undefined) throw new Error(`aucun écouteur « ${type} »`);
      listener({ ...event, waitUntil: (promise) => void pending.push(promise) });
      await Promise.all(pending.splice(0));
    },
  };
}

export const push = (payload: unknown): Omit<ExtendableEventLike, 'waitUntil'> => ({ data: { json: () => payload } });

export const banner = (data: Record<string, unknown>) => ({ notification: { title: 'Awa', body: 'Bonjour' }, data });
