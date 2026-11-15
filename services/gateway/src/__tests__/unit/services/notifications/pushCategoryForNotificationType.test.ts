/**
 * GW4 — la table PURE `type de notification → catégorie iOS`.
 *
 * Ces deux témoins vivaient dans `NotificationService.pushMessage.test.ts`,
 * la suite de la CLASSE, parce que la fonction y vivait aussi. Le découpage
 * #7093 l'a sortie vers `services/notifications/push-header.ts` : son témoin
 * la suit, à côté de ceux de ses voisines de module (`buildPushHeader`,
 * `dedupePushSubtitle`). Une loi pure et son témoin ne se séparent pas — et
 * les laisser dans la suite de la classe aurait fait porter à celle-ci, déjà
 * hors budget, le poids d'un code qu'elle n'héberge plus.
 *
 * La divergence délibérée avec la table du NSE est la famille APPEL, scindée
 * en `MEESHY_CALL_INCOMING` (répondre / refuser) et `MEESHY_CALL_MISSED`
 * (rappeler / voir) : un appel terminé ne doit jamais proposer « Répondre ».
 *
 * @jest-environment node
 */

import { pushCategoryForNotificationType } from '../../../../services/notifications/push-header';

describe('pushCategoryForNotificationType', () => {
  it('mirrors the iOS NSE mapping with the CALL split (incoming vs missed)', () => {
    expect(pushCategoryForNotificationType('new_message')).toBe('MEESHY_MESSAGE');
    expect(pushCategoryForNotificationType('message_reply')).toBe('MEESHY_MESSAGE');
    expect(pushCategoryForNotificationType('message_reaction')).toBe('MEESHY_MESSAGE');
    expect(pushCategoryForNotificationType('new_conversation_direct')).toBe('MEESHY_MESSAGE');
    expect(pushCategoryForNotificationType('user_mentioned')).toBe('MEESHY_MENTION');
    expect(pushCategoryForNotificationType('mention')).toBe('MEESHY_MENTION');
    expect(pushCategoryForNotificationType('friend_request')).toBe('MEESHY_FRIEND_REQUEST');
    expect(pushCategoryForNotificationType('contact_request')).toBe('MEESHY_FRIEND_REQUEST');
    expect(pushCategoryForNotificationType('post_like')).toBe('MEESHY_SOCIAL');
    expect(pushCategoryForNotificationType('post_comment')).toBe('MEESHY_SOCIAL');
    expect(pushCategoryForNotificationType('story_new_comment')).toBe('MEESHY_SOCIAL');
    expect(pushCategoryForNotificationType('friend_new_post')).toBe('MEESHY_SOCIAL');
    expect(pushCategoryForNotificationType('incoming_call')).toBe('MEESHY_CALL_INCOMING');
    expect(pushCategoryForNotificationType('missed_call')).toBe('MEESHY_CALL_MISSED');
    expect(pushCategoryForNotificationType('call_ended')).toBe('MEESHY_CALL_MISSED');
    expect(pushCategoryForNotificationType('call_declined')).toBe('MEESHY_CALL_MISSED');
  });

  it('returns undefined for unmapped types (no misleading actions)', () => {
    expect(pushCategoryForNotificationType('system')).toBeUndefined();
    expect(pushCategoryForNotificationType('login_new_device')).toBeUndefined();
    expect(pushCategoryForNotificationType('made_up_type')).toBeUndefined();
  });
});
