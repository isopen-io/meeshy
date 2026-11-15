/**
 * #7593 — les avis de vie du groupe (retrait, départ, renommage, image) et
 * l'ajout par un tiers portent leur sens dans `Message.metadata`, validé par
 * `parseConversationNotice` / `parseJoinNotice` — jamais par un cast.
 */

import { describe, it, expect } from 'vitest';
import {
  parseConversationNotice,
  CONVERSATION_NOTICE_KINDS,
} from '../utils/conversation-notice.js';
import { parseJoinNotice, JOIN_NOTICE_KIND } from '../utils/join-notice.js';

const demo = { participantId: 'p-demo', displayName: 'Demo' };
const bob = { participantId: 'p-bob', displayName: 'Bob' };

describe('parseConversationNotice', () => {
  it('reconnaît un retrait par un tiers : acteur et cible', () => {
    const notice = { kind: 'member-removed', actor: demo, target: bob };
    expect(parseConversationNotice(notice)).toEqual(notice);
  });

  it('reconnaît un départ volontaire, un renommage et un changement d’image', () => {
    for (const kind of ['member-left', 'conversation-renamed', 'conversation-image'] as const) {
      expect(parseConversationNotice({ kind, actor: demo })).toEqual({ kind, actor: demo });
    }
  });

  it('les quatre familles sont déclarées une fois', () => {
    expect([...CONVERSATION_NOTICE_KINDS].sort()).toEqual(
      ['conversation-image', 'conversation-renamed', 'member-left', 'member-removed'],
    );
  });

  it('rend null pour une forme partielle, un autre kind ou un non-objet', () => {
    expect(parseConversationNotice({ kind: 'member-removed', actor: demo })).toBeNull();
    expect(parseConversationNotice({ kind: 'member-left', actor: { participantId: 'p' } })).toBeNull();
    expect(parseConversationNotice({ kind: 'member-left', actor: { participantId: '', displayName: 'X' } })).toBeNull();
    expect(parseConversationNotice({ kind: 'call', actor: demo })).toBeNull();
    expect(parseConversationNotice(null)).toBeNull();
    expect(parseConversationNotice('member-left')).toBeNull();
  });

  it('ne garde que les champs déclarés', () => {
    expect(parseConversationNotice({ kind: 'member-left', actor: { ...demo, extra: 1 }, junk: true })).toEqual({
      kind: 'member-left',
      actor: demo,
    });
  });
});

describe('parseJoinNotice — ajout par un tiers', () => {
  const base = { kind: JOIN_NOTICE_KIND, participantId: 'p-bob', displayName: 'Bob', isAnonymous: false, viaShareLink: false };

  it('porte l’auteur de l’ajout quand un membre en a ajouté un autre', () => {
    expect(parseJoinNotice({ ...base, addedBy: demo })).toEqual({ ...base, addedBy: demo });
  });

  it('un avis sans auteur d’ajout reste une arrivée de soi-même', () => {
    expect(parseJoinNotice(base)).toEqual(base);
  });

  it('un auteur d’ajout mal formé est ignoré, l’avis reste reconnu', () => {
    expect(parseJoinNotice({ ...base, addedBy: { displayName: 'Demo' } })).toEqual(base);
  });
});
