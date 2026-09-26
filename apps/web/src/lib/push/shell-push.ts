import type { HttpTransport } from '@/lib/api/http';
import type { SessionState } from '@/lib/api/session';
import { DELIVERY_RECEIPT_TYPES } from '@/lib/notifications/delivery-receipt-types';
import { pushTapTarget, type NotificationTargetInput, type PushTapTarget } from '@/lib/notifications/target';

/**
 * **LA COQUE ANDROID REÇOIT UN PUSH, APPLICATION FERMÉE** (#7307, ombrelle #7282).
 *
 * La WebView Android n'implémente pas le Push API et la coque n'embarque aucun
 * service worker (`scripts/check-shell-dist.mjs`) : son chemin est FCM NATIF,
 * par `@capacitor/push-notifications`. Un seul chemin d'ENVOI pour autant — la
 * passerelle sert déjà `platform: 'android'` (`PushNotificationService`,
 * bloc `android.notification`), et le jeton s'enregistre par le MÊME port
 * qu'iOS et que le navigateur (`POST /api/v1/users/register-device-token`).
 *
 * Ce module ne REND rien : application en arrière-plan ou tuée, le bloc
 * `notification` de FCM est affiché par le SYSTÈME, dans le canal que la
 * passerelle nomme. Il ne re-résout pas non plus le Prisme — le corps est
 * composé serveur (`servedBannerBody`) ; de la carte `data`, seuls les champs
 * qui servent à NAVIGUER et à ACCUSER la remise sont lus.
 *
 * Tout est injecté : le plugin, la session, le transport, la navigation.
 * `startShellPushInShell()` (`shell-push-runtime.ts`) branche les réels.
 */

/**
 * **LE CANAL QUE LA PASSERELLE NOMME** (`android.notification.channelId`).
 * Sur Android 8+, une notification adressée à un canal INEXISTANT est jetée en
 * silence — FCM rend un succès, rien n'apparaît. Le créer au démarrage n'est
 * donc pas un réglage : c'est la condition pour qu'une bannière existe.
 */
export const SHELL_PUSH_CHANNEL_ID = 'meeshy_notifications';

export type ShellPushPermission = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied';

type Listener<T> = (event: T) => void;

/** La tranche du plugin que ce module consomme — `PushNotificationsPlugin` la satisfait par structure. */
export type ShellPushPlugin = {
  checkPermissions(): Promise<{ readonly receive: ShellPushPermission }>;
  requestPermissions(): Promise<{ readonly receive: ShellPushPermission }>;
  register(): Promise<void>;
  unregister(): Promise<void>;
  createChannel(channel: {
    readonly id: string;
    readonly name: string;
    readonly importance?: 1 | 2 | 3 | 4 | 5;
    readonly visibility?: -1 | 0 | 1;
  }): Promise<void>;
  addListener(eventName: 'registration', listener: Listener<{ readonly value: string }>): Promise<unknown>;
  addListener(eventName: 'registrationError', listener: Listener<{ readonly error: string }>): Promise<unknown>;
  addListener(eventName: 'pushNotificationReceived', listener: Listener<{ readonly data?: unknown }>): Promise<unknown>;
  addListener(
    eventName: 'pushNotificationActionPerformed',
    listener: Listener<{ readonly notification: { readonly data?: unknown } }>,
  ): Promise<unknown>;
};

export type ShellPushSessionStore = {
  getState(): { readonly session: SessionState };
  subscribe(listener: (state: { readonly session: SessionState }) => void): () => void;
};

export type ShellPushEnvironment = {
  readonly plugin: ShellPushPlugin;
  readonly sessionStore: ShellPushSessionStore;
  readonly transport: Pick<HttpTransport, 'request'>;
  readonly navigate: (url: string) => void;
  readonly urlOf: (target: PushTapTarget) => string;
  readonly appVersion: string;
};

/** La carte `data` d'un push FCM : des chaînes plates, `''` valant absence. */
function dataOf(raw: unknown): Readonly<Record<string, string>> {
  if (raw === null || typeof raw !== 'object') return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

/** Les SEULS champs de navigation — jamais `translatedContent`, `content` ni `encryptedContent`. */
export function shellPushTargetInput(raw: unknown): NotificationTargetInput {
  const data = dataOf(raw);
  return {
    type: data.type,
    conversationId: data.conversationId,
    postId: data.postId,
    postType: data.postType,
    contentType: data.contentType,
    friendRequestId: data.friendRequestId,
    senderUsername: data.senderUsername,
    route: data.route,
  };
}

/** La conversation et le message dont un push annonce la REMISE, ou `null`. */
export function deliveredMessageOf(raw: unknown): { readonly conversationId: string; readonly messageId: string } | null {
  const data = dataOf(raw);
  const conversationId = (data.conversationId ?? '').trim();
  const messageId = (data.messageId ?? '').trim();
  if (!DELIVERY_RECEIPT_TYPES.has((data.type ?? '').trim())) return null;
  if (conversationId === '' || messageId === '') return null;
  return { conversationId, messageId };
}

const userIdOf = (session: SessionState): string | null => (session.status === 'authenticated' ? session.user.id : null);

/**
 * Monte la coque sur FCM. Idempotent par construction : appelé UNE fois au
 * démarrage (`main.tsx`, derrière `__SHELL__`), il suit ensuite la session.
 *
 * - une session enregistrée qui s'ouvre ⇒ permission demandée si elle ne l'a
 *   jamais été, puis `register()` si elle est accordée ;
 * - le jeton reçu ⇒ enregistré auprès de la passerelle sous le compte COURANT ;
 * - la session qui se ferme ⇒ `unregister()` : le jeton FCM est détruit sur
 *   l'appareil, la passerelle le désactive au premier envoi refusé
 *   (`TOKEN_INVALID`) — aucune requête n'a besoin d'un crédential déjà effacé.
 */
export async function startShellPush(env: ShellPushEnvironment): Promise<void> {
  const { plugin, sessionStore, transport } = env;
  let token: string | null = null;
  let activeUser: string | null = null;

  const registerToken = (): void => {
    if (token === null || activeUser === null) return;
    void transport
      .request({
        method: 'POST',
        path: '/api/v1/users/register-device-token',
        body: { token, platform: 'android', type: 'fcm', appVersion: env.appVersion },
      })
      .catch(() => undefined);
  };

  await plugin.addListener('registration', ({ value }) => {
    token = value;
    registerToken();
  });
  await plugin.addListener('registrationError', () => undefined);

  await plugin.addListener('pushNotificationActionPerformed', ({ notification }) => {
    env.navigate(env.urlOf(pushTapTarget(shellPushTargetInput(notification.data))));
  });

  await plugin.addListener('pushNotificationReceived', ({ data }) => {
    const delivered = deliveredMessageOf(data);
    if (delivered === null || activeUser === null) return;
    void transport
      .request({
        method: 'POST',
        path: `/api/v1/conversations/${encodeURIComponent(delivered.conversationId)}/receipts`,
        body: { type: 'delivered', messageIds: [delivered.messageId] },
      })
      .catch(() => undefined);
  });

  await plugin.createChannel({ id: SHELL_PUSH_CHANNEL_ID, name: 'Meeshy', importance: 4, visibility: 0 }).catch(() => undefined);

  const opened = async (): Promise<void> => {
    const current = await plugin.checkPermissions().catch(() => ({ receive: 'denied' as const }));
    const permission =
      current.receive === 'prompt' || current.receive === 'prompt-with-rationale'
        ? (await plugin.requestPermissions().catch(() => ({ receive: 'denied' as const }))).receive
        : current.receive;
    if (permission !== 'granted') return;
    await plugin.register().catch(() => undefined);
  };

  const follow = (session: SessionState): void => {
    const next = userIdOf(session);
    if (next === activeUser) return;
    const previous = activeUser;
    activeUser = next;
    if (previous !== null) {
      token = null;
      void plugin.unregister().catch(() => undefined);
    }
    if (next !== null) void opened();
  };

  follow(sessionStore.getState().session);
  sessionStore.subscribe((state) => follow(state.session));
}
