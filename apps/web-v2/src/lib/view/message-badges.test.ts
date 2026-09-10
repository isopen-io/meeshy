import { describe, expect, test } from 'bun:test';

import type { Message } from '@/lib/api/types';

import { badgesOf, forwardAttributionOf, forwardLabelOf, isSystemMessage, systemRowOf, systemRowText } from './message-badges';

const NOW = new Date('2026-09-10T10:00:00.000Z').getTime();

const message = (partial: Partial<Message> = {}): Message =>
  ({
    id: 'm1',
    conversationId: 'c-a',
    senderId: 'u-bruno',
    content: 'Bonjour',
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    translations: [],
    createdAt: new Date('2026-09-10T09:00:00.000Z'),
    ...partial,
  }) as Message;

describe('badgesOf — l’ordre iOS et rien d’autre', () => {
  test('épinglé + transféré (groupe public) + modifié, dans cet ordre', () => {
    const badges = badgesOf(
      message({
        pinnedAt: new Date('2026-09-10T09:30:00.000Z'),
        forwardedFromId: 'm-far',
        forwardedFromConversation: { id: 'c-salon', title: 'Salon', type: 'public' },
        isEdited: true,
      }),
      NOW,
    );

    expect(badges).toEqual([
      { kind: 'pinned' },
      { kind: 'forwarded', attribution: { kind: 'group', name: 'Salon' } },
      { kind: 'edited' },
    ]);
  });

  test('un message nu ne porte aucun badge', () => {
    expect(badgesOf(message(), NOW)).toEqual([]);
  });

  test('un `expiresAt` futur place l’éphémère en 3ᵉ position, AVANT « modifié »', () => {
    const badges = badgesOf(
      message({
        pinnedAt: new Date('2026-09-10T09:30:00.000Z'),
        forwardedFromId: 'm-far',
        forwardedFromConversation: { id: 'c-salon', title: 'Salon', type: 'public' },
        expiresAt: new Date('2026-09-10T11:00:00.000Z'),
        isEdited: true,
      }),
      NOW,
    );

    expect(badges.map((b) => b.kind)).toEqual(['pinned', 'forwarded', 'ephemeral', 'edited']);
  });

  test('un `expiresAt` déjà échu ne pose aucun badge éphémère', () => {
    const badges = badgesOf(message({ expiresAt: new Date('2026-09-10T09:00:00.000Z') }), NOW);
    expect(badges.some((b) => b.kind === 'ephemeral')).toBe(false);
  });
});

describe('forwardAttributionOf — la liste blanche iOS', () => {
  test('forwardedFromId sans conversation ⇒ anonymous', () => {
    expect(forwardAttributionOf(message({ forwardedFromId: 'm-far' }))).toEqual({ kind: 'anonymous' });
  });

  test('{type:"public", title:"Salon"} ⇒ group("Salon")', () => {
    expect(
      forwardAttributionOf(
        message({ forwardedFromId: 'm-far', forwardedFromConversation: { id: 'c1', title: 'Salon', type: 'public' } }),
      ),
    ).toEqual({ kind: 'group', name: 'Salon' });
  });

  test('{type:"global"|"broadcast"|"channel"|"community"} ⇒ group', () => {
    for (const type of ['global', 'broadcast', 'channel', 'community'] as const) {
      expect(
        forwardAttributionOf(
          message({ forwardedFromId: 'm-far', forwardedFromConversation: { id: 'c1', title: 'Diffusion', type } }),
        ),
      ).toEqual({ kind: 'group', name: 'Diffusion' });
    }
  });

  test('{type:"group", title:"Privé"} ⇒ anonymous — sous le seuil (ForwardBadgePolicy.swift:56-60)', () => {
    expect(
      forwardAttributionOf(
        message({ forwardedFromId: 'm-far', forwardedFromConversation: { id: 'c1', title: 'Privé', type: 'group' } }),
      ),
    ).toEqual({ kind: 'anonymous' });
  });

  test('{type:null} ⇒ anonymous', () => {
    expect(
      forwardAttributionOf(
        message({ forwardedFromId: 'm-far', forwardedFromConversation: { id: 'c1', title: 'X', type: null } }),
      ),
    ).toEqual({ kind: 'anonymous' });
  });

  test('{type:"public", title:"  "} ⇒ anonymous (titre blanc, aucun repli)', () => {
    expect(
      forwardAttributionOf(
        message({ forwardedFromId: 'm-far', forwardedFromConversation: { id: 'c1', title: '  ', type: 'public' } }),
      ),
    ).toEqual({ kind: 'anonymous' });
  });

  test('{type:"public", title:null, identifier:"salon-public"} ⇒ group("salon-public") — repli identifier', () => {
    expect(
      forwardAttributionOf(
        message({
          forwardedFromId: 'm-far',
          forwardedFromConversation: { id: 'c1', title: null, identifier: 'salon-public', type: 'public' },
        }),
      ),
    ).toEqual({ kind: 'group', name: 'salon-public' });
  });

  test('{type:"direct"} ⇒ anonymous — la personne n’est pas servie au type', () => {
    expect(
      forwardAttributionOf(
        message({ forwardedFromId: 'm-far', forwardedFromConversation: { id: 'c1', title: 'Bruno', type: 'direct' } }),
      ),
    ).toEqual({ kind: 'anonymous' });
  });

  test('aucun champ de transfert ⇒ null', () => {
    expect(forwardAttributionOf(message())).toBeNull();
  });
});

describe('forwardLabelOf', () => {
  test('anonymous ⇒ « Transféré »', () => {
    expect(forwardLabelOf({ kind: 'anonymous' })).toBe('Transféré');
  });
  test('group("Salon") ⇒ « Transféré depuis Salon »', () => {
    expect(forwardLabelOf({ kind: 'group', name: 'Salon' })).toBe('Transféré depuis Salon');
  });
  test('person("Bruno") ⇒ « Transféré de Bruno »', () => {
    expect(forwardLabelOf({ kind: 'person', name: 'Bruno' })).toBe('Transféré de Bruno');
  });
});

describe('isSystemMessage / systemRowOf', () => {
  test('messageSource:"system" ⇒ vrai', () => {
    expect(isSystemMessage(message({ messageSource: 'system' }))).toBe(true);
  });

  test('messageType:"system" seul (notice de chiffrement) ⇒ vrai', () => {
    expect(isSystemMessage(message({ messageType: 'system', messageSource: 'user' }))).toBe(true);
  });

  test('"user"/"text" ⇒ faux', () => {
    expect(isSystemMessage(message())).toBe(false);
  });

  test('résumé d’appel : metadata.kind="call" ⇒ {kind:"call", text: content}', () => {
    const row = systemRowOf(
      message({
        messageType: 'system',
        messageSource: 'system',
        content: 'Appel vidéo · 04:32',
        metadata: { kind: 'call', callId: 'call-1', initiatorId: 'u-kwame', callType: 'video', outcome: 'completed', durationSeconds: 272, bytesTotal: null, bytesEstimated: false, networkQuality: null },
      }),
    );
    expect(row).toEqual({ kind: 'call', text: 'Appel vidéo · 04:32', callType: 'video' });
  });

  test('avis d’arrivée (parseJoinNotice) ⇒ {kind:"join", displayName, isAnonymous, handle}', () => {
    const row = systemRowOf(
      message({
        messageType: 'system',
        messageSource: 'system',
        content: 'Bruno Bêta a rejoint la conversation',
        metadata: { kind: 'member-joined', participantId: 'p-bruno', displayName: 'Bruno Bêta', isAnonymous: false, viaShareLink: false },
      }),
    );
    expect(row).toEqual({ kind: 'join', displayName: 'Bruno Bêta', handle: null, isAnonymous: false });
  });

  test('avis d’arrivée : le nom DONNÉ prime, le pseudo descend en handle', () => {
    const row = systemRowOf(
      message({
        messageType: 'system',
        messageSource: 'system',
        content: 'repli',
        metadata: {
          kind: 'member-joined',
          participantId: 'p-ano',
          displayName: 'ano_7f3',
          givenName: 'Camille',
          username: 'ano_7f3',
          isAnonymous: true,
          viaShareLink: true,
        },
      }),
    );
    expect(row).toEqual({ kind: 'join', displayName: 'Camille', handle: '@ano_7f3', isAnonymous: true });
  });

  test('système sans metadata ⇒ {kind:"notice", text: content}', () => {
    const row = systemRowOf(message({ messageType: 'system', messageSource: 'user', content: 'Le chiffrement de bout en bout est activé' }));
    expect(row).toEqual({ kind: 'notice', text: 'Le chiffrement de bout en bout est activé' });
  });

  test('système au content vide et sans metadata ⇒ null (EmptyView, FocalSystemRows.swift:151)', () => {
    expect(systemRowOf(message({ messageType: 'system', messageSource: 'system', content: '' }))).toBeNull();
  });

  test('un message système est système AVANT d’être supprimé', () => {
    const row = systemRowOf(
      message({ messageType: 'system', messageSource: 'system', content: 'Appel manqué', deletedAt: new Date() }),
    );
    expect(row).not.toBeNull();
  });

  test('un message ordinaire ⇒ null', () => {
    expect(systemRowOf(message())).toBeNull();
  });
});

describe('systemRowText', () => {
  test('call/notice rendent leur texte tel quel', () => {
    expect(systemRowText({ kind: 'call', text: 'Appel vidéo · 04:32', callType: 'video' })).toBe('Appel vidéo · 04:32');
    expect(systemRowText({ kind: 'notice', text: 'Le chiffrement est activé' })).toBe('Le chiffrement est activé');
  });

  test('join compose « {nom} a rejoint la conversation »', () => {
    expect(systemRowText({ kind: 'join', displayName: 'Bruno Bêta', handle: null, isAnonymous: false })).toBe(
      'Bruno Bêta a rejoint la conversation',
    );
  });
});
