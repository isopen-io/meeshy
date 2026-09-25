import { describe, expect, test } from 'bun:test';

import { ATTACHMENT_REACTION_BADGE_MAX_EMOJIS, attachmentReactionBadge } from './attachment-reactions';

/**
 * LA PASTILLE DES RÉACTIONS D'UNE PIÈCE (#7894) — miroir de
 * `AttachmentReactionBadgeModel.make` (`apps/ios/.../AttachmentReactionBadge.swift`).
 */
describe('attachmentReactionBadge — ce que la pastille a à dire', () => {
  test('aucun résumé, ou un résumé vide ⇒ aucune pastille (loi 4)', () => {
    expect(attachmentReactionBadge({})).toBe(null);
    expect(attachmentReactionBadge({ reactionSummary: {} })).toBe(null);
  });

  test('des comptes tous tombés à zéro ⇒ aucune pastille, jamais « 0 »', () => {
    expect(attachmentReactionBadge({ reactionSummary: { '🔥': 0 } })).toBe(null);
  });

  test('émojis triés, total de TOUTES les réactions, la mienne signalée', () => {
    expect(
      attachmentReactionBadge({ reactionSummary: { '😍': 1, '🔥': 2 }, currentUserReactions: ['🔥'] }),
    ).toEqual({ emojis: ['🔥', '😍'].sort(), total: 3, mine: true });
  });

  test('au plus trois émojis — le total rattrape ceux qui restent dehors', () => {
    const badge = attachmentReactionBadge({ reactionSummary: { '👍': 1, '❤️': 1, '😂': 1, '🔥': 4 } });
    expect(badge?.emojis.length).toBe(ATTACHMENT_REACTION_BADGE_MAX_EMOJIS);
    expect(badge?.total).toBe(7);
    expect(badge?.mine).toBe(false);
  });

  test('« la mienne » ne tient que si son émoji compte encore dans le résumé servi', () => {
    expect(attachmentReactionBadge({ reactionSummary: { '👍': 2 }, currentUserReactions: ['🔥'] })?.mine).toBe(false);
  });
});
