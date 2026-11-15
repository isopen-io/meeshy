/**
 * LE FIL D'UNE BANNIÈRE (#10267, § 5.16.4) — deux fils, parce que les plateformes ne font pas la même chose d'un fil :
 *
 * - `threadId` : le fil d'une CONVERSATION, lu partout. iOS empile (`aps.thread-id`) ; Android et le web en font
 *   le `tag` de la bannière, et la plus récente REMPLACE la précédente (`android-push-config.ts`, `web-push-config.ts`).
 * - `apnsThreadId` : le fil « jeu », lu par iOS SEUL, qui regroupe sans remplacer. Sur Android et sur le web, un
 *   fil commun deviendrait un tag commun : l'invitation de duo de Bob effacerait celle d'Alice, et la révocation
 *   de la coque, qui annule par `notificationId`, ne retrouverait plus la bannière. Ils gardent donc le tag
 *   propre de chaque notification.
 *
 * Le reste n'a pas de fil. `groupNotifications: false` retire les deux au chokepoint (`push-delivery-preferences.ts`).
 */
import { isGameNotificationType } from '@meeshy/shared/utils/game/notifications';

export const GAME_PUSH_THREAD_ID = 'game';

export type PushThreadFields = { readonly threadId?: string; readonly apnsThreadId?: string };

export function pushThreadFields(params: {
  readonly type: string;
  readonly conversationId: string | null | undefined;
}): PushThreadFields {
  if (params.conversationId) return { threadId: params.conversationId };
  return isGameNotificationType(params.type) ? { apnsThreadId: GAME_PUSH_THREAD_ID } : {};
}

/** Le `thread-id` APNs d'une charge : le fil de sa conversation, sinon son fil iOS seul. */
export function apnsThreadIdOf(payload: PushThreadFields): string | undefined {
  return payload.threadId ?? payload.apnsThreadId;
}
