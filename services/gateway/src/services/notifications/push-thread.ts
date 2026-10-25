/**
 * LE FIL D'UNE BANNIÈRE (`threadId` → `apns` `thread-id`, #10267, § 5.16.4) — une conversation empile ses
 * bannières sous son identifiant ; les notifications du JEU s'empilent dans UN fil « jeu », qui ne porte ni
 * conversation ni compte. Le reste n'a pas de fil. `groupNotifications: false` retire le fil au chokepoint
 * (`push-delivery-preferences.ts`), quel qu'il soit.
 */
import { isGameNotificationType } from '@meeshy/shared/utils/game/notifications';

export const GAME_PUSH_THREAD_ID = 'game';

export function pushThreadFields(params: {
  readonly type: string;
  readonly conversationId: string | null | undefined;
}): { readonly threadId?: string } {
  if (params.conversationId) return { threadId: params.conversationId };
  return isGameNotificationType(params.type) ? { threadId: GAME_PUSH_THREAD_ID } : {};
}
