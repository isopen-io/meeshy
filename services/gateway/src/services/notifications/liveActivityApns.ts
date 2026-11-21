/**
 * LA FIN D'UN PARTAGE DE POSITION HORS DE L'APP (#19463) — les deux poussées.
 *
 * 1. `buildLocationShareEndedPush` : la poussée SILENCIEUSE de données vers iPhone et Android du
 *    seul lecteur servi. Type, émetteur, heure : rien de la position. `collapseId` par émetteur :
 *    deux fins en vol se remplacent. Signal de CONTRÔLE (`push-delivery-preferences.ts`) : il
 *    retire un compte à rebours, il ne montre rien.
 * 2. `sendViaLiveActivity` : `apns-push-type: liveactivity`, topic `<bundle>.push-type.liveactivity`,
 *    priorité 10, `event: end`, l'état final `{ endedAt }` et une disparition immédiate de l'écran
 *    verrouillé — sur le modèle de `talkie/pushToTalkApns.ts`. Un jeton d'Activité n'est pas un
 *    `PushToken` : son échec ne désactive rien, il est seulement rendu.
 */
import type {
  LocationShareEndedPushData,
  SharedLocationLiveActivityEndState,
} from '@meeshy/shared/types/shared-location-live-activity';
import type { PushResult, SendPushOptions } from '../PushNotificationService';
import { apnsFailureOutcome } from '../pushFailureClassification';
import type { ApnsEnvironment, PushToTalkTransport } from '../talkie/pushToTalkApns';

export function buildLocationShareEndedPush(readerId: string, data: LocationShareEndedPushData): SendPushOptions {
  return {
    userId: readerId,
    bypassDnd: true,
    types: ['apns', 'fcm'],
    platforms: ['ios', 'android'],
    payload: {
      title: '',
      body: '',
      silent: true,
      collapseId: `location-share-${data.userId}`,
      data: { type: data.type, userId: data.userId, endedAt: data.endedAt },
    },
  };
}

export type LiveActivityTarget = { readonly token: string; readonly apnsEnvironment: 'development' | 'production' };

export type LiveActivityTransport = PushToTalkTransport;
export type LiveActivityEndState = SharedLocationLiveActivityEndState;

const LIVE_ACTIVITY_TOKEN_ID = 'live-activity';

export async function sendViaLiveActivity(
  transport: LiveActivityTransport,
  target: LiveActivityTarget,
  state: SharedLocationLiveActivityEndState,
): Promise<PushResult> {
  const env: ApnsEnvironment = target.apnsEnvironment === 'development' ? 'sandbox' : 'production';
  if (!transport.hasClient(env)) {
    return { success: false, tokenId: LIVE_ACTIVITY_TOKEN_ID, error: `APNS ${env} client not initialized` };
  }
  try {
    const apn = await import('@parse/node-apn');
    const notification = new apn.Notification();
    const nowSeconds = Math.floor(Date.now() / 1000);
    notification.topic = `${transport.defaultBundleId}.push-type.liveactivity`;
    notification.pushType = 'liveactivity';
    notification.priority = 10;
    notification.alert = undefined as never;
    notification.sound = undefined as never;
    notification.badge = undefined as never;
    notification.aps = { ...notification.aps, timestamp: nowSeconds, event: 'end', 'content-state': { endedAt: state.endedAt }, 'dismissal-date': nowSeconds };
    notification.payload = {};
    const corr = { tokenId: LIVE_ACTIVITY_TOKEN_ID, apnsEnv: env, topic: notification.topic, pushType: 'liveactivity' };
    const result = await transport.send(env, notification, target.token, corr);
    if (result.failed.length > 0) {
      const { error, transient } = apnsFailureOutcome(result.failed[0]);
      transport.log('failure', { ...corr, reason: error, statusCode: result.failed[0].status });
      return { success: false, tokenId: LIVE_ACTIVITY_TOKEN_ID, error, transient };
    }
    transport.log('success', corr);
    return { success: true, tokenId: LIVE_ACTIVITY_TOKEN_ID };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'APNS error';
    transport.log('failure', { tokenId: LIVE_ACTIVITY_TOKEN_ID, apnsEnv: env, errorMessage: message });
    return { success: false, tokenId: LIVE_ACTIVITY_TOKEN_ID, error: message, transient: true };
  }
}
