import { appelNatifMethode, coqueCourante, type CoqueNative } from '@/lib/native-shell';

/**
 * **OUVRIR UNE CONVERSATION RETIRE SES BANNIÈRES** (#8781) — iOS vide le fil
 * consommé du centre de notifications (#6999,
 * `NotificationActionHandler.removeDeliveredBanners(forThreadOf:)`). Le web et
 * la coque Android laissaient les bannières d'un fil lu dans la barre.
 *
 * La maille est celle d'iOS, « par le fil » : le TAG de la bannière est la
 * conversation (`sw-push.js` sur le web, `android.notification.tag = threadId`
 * côté passerelle, #8171). Une bannière sans ce tag — `groupNotifications`
 * coupé, notification hors conversation — reste. Tout échec est avalé : la
 * lecture ne dépend jamais de la barre.
 */

export type BannerTray<Entry> = {
  readonly list: () => Promise<readonly Entry[]>;
  readonly tagOf: (entry: Entry) => string | null;
  readonly remove: (entries: readonly Entry[]) => Promise<void>;
};

async function sweep<Entry>(conversationId: string, tray: BannerTray<Entry> | null): Promise<void> {
  if (tray === null) return;
  try {
    const matching = (await tray.list()).filter((entry) => tray.tagOf(entry) === conversationId);
    if (matching.length > 0) await tray.remove(matching);
  } catch {
    /* Barre illisible, permission retirée : la lecture est déjà faite. */
  }
}

type Delivered = { readonly tag?: unknown };

const tagOf = (entry: Delivered): string | null => (typeof entry.tag === 'string' && entry.tag !== '' ? entry.tag : null);

/** La barre de la coque Android, par `@capacitor/push-notifications` — `null` hors coque. */
export function shellTray(coque: CoqueNative | undefined): BannerTray<Delivered> | null {
  const get = appelNatifMethode(coque, 'PushNotifications', 'getDeliveredNotifications');
  const remove = appelNatifMethode(coque, 'PushNotifications', 'removeDeliveredNotifications');
  if (get === null || remove === null) return null;
  return {
    list: async () => {
      const notifications = ((await get({})) as { readonly notifications?: unknown } | null)?.notifications;
      return Array.isArray(notifications) ? (notifications as readonly Delivered[]) : [];
    },
    tagOf,
    remove: async (entries) => {
      await remove({ notifications: entries });
    },
  };
}

type WorkerBanner = Delivered & { readonly close: () => void };
type WorkerRegistration = { readonly getNotifications: () => Promise<readonly WorkerBanner[]> };

/** La barre du web, par le service worker inscrit — vide sans lui. */
export function workerTray(registration: () => Promise<WorkerRegistration | null>): BannerTray<WorkerBanner> {
  return {
    list: async () => (await registration())?.getNotifications() ?? [],
    tagOf,
    remove: (entries) => {
      entries.forEach((entry) => entry.close());
      return Promise.resolve();
    },
  };
}

const serviceWorkerRegistration = (): Promise<WorkerRegistration | null> =>
  typeof navigator === 'undefined' || navigator.serviceWorker === undefined
    ? Promise.resolve(null)
    : navigator.serviceWorker.getRegistration().then((registration) => registration ?? null);

/** Sans barre donnée, celle de CET hôte : la coque quand elle la déclare, sinon le service worker. */
export function clearConversationBanners(conversationId: string): Promise<void>;
export function clearConversationBanners<Entry>(conversationId: string, tray: BannerTray<Entry> | null): Promise<void>;
export function clearConversationBanners<Entry>(conversationId: string, tray?: BannerTray<Entry> | null): Promise<void> {
  if (tray !== undefined) return sweep(conversationId, tray);
  const shell = shellTray(coqueCourante());
  return shell === null ? sweep(conversationId, workerTray(serviceWorkerRegistration)) : sweep(conversationId, shell);
}
