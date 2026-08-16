/**
 * message-formatters unit tests
 *
 * @jest-environment node
 */

import {
  formatMessageWithUnifiedSender,
  formatLinkMessageWithDetails,
} from '../../../../routes/links/utils/message-formatters';

function makeUserSender(overrides: Record<string, unknown> = {}) {
  return {
    type: 'user',
    user: {
      id: 'user_001',
      username: 'alice',
      firstName: 'Alice',
      lastName: 'Dupont',
      displayName: 'Alice Dupont',
      avatar: 'https://cdn.meeshy.me/avatars/alice.jpg',
      systemLanguage: 'fr',
    },
    ...overrides,
  };
}

function makeAnonSender(overrides: Record<string, unknown> = {}) {
  return {
    type: 'anonymous',
    id: 'anon_session_abc',
    displayName: 'Guest User',
    avatar: null,
    language: 'en',
    ...overrides,
  };
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg_001',
    content: 'Hello world',
    originalLanguage: 'en',
    createdAt: new Date('2026-01-01T12:00:00Z'),
    status: [],
    sender: makeUserSender(),
    translations: {},
    messageType: 'text',
    isEdited: false,
    editedAt: null,
    deletedAt: null,
    replyToId: null,
    updatedAt: new Date('2026-01-01T12:00:00Z'),
    statusEntries: [],
    attachments: [],
    reactions: [],
    replyTo: null,
    ...overrides,
  };
}

describe('formatMessageWithUnifiedSender', () => {
  it('returns message id, content, originalLanguage, createdAt', () => {
    const result = formatMessageWithUnifiedSender(makeMessage());
    expect(result.id).toBe('msg_001');
    expect(result.content).toBe('Hello world');
    expect(result.originalLanguage).toBe('en');
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it('extracts sender info from user type sender', () => {
    const result = formatMessageWithUnifiedSender(makeMessage());
    expect(result.sender.id).toBe('user_001');
    expect(result.sender.username).toBe('alice');
    expect(result.sender.isMeeshyer).toBe(true);
  });

  it('returns isMeeshyer=false for anonymous sender', () => {
    const result = formatMessageWithUnifiedSender(makeMessage({ sender: makeAnonSender() }));
    expect(result.sender.isMeeshyer).toBe(false);
    expect(result.sender.id).toBe('anon_session_abc');
    expect(result.sender.username).toBe('Guest User');
  });

  it('returns unknown sender when sender is null', () => {
    const result = formatMessageWithUnifiedSender(makeMessage({ sender: null }));
    expect(result.sender.id).toBe('unknown');
    expect(result.sender.username).toBe('unknown');
    expect(result.sender.isMeeshyer).toBe(false);
  });

  it('falls back to fr when originalLanguage is missing', () => {
    const result = formatMessageWithUnifiedSender(makeMessage({ originalLanguage: undefined }));
    expect(result.originalLanguage).toBe('fr');
  });

  it('returns translations as array (delegates to transformTranslationsToArray)', () => {
    const result = formatMessageWithUnifiedSender(makeMessage({ translations: {} }));
    expect(Array.isArray(result.translations)).toBe(true);
  });

  it('passes status to result', () => {
    const result = formatMessageWithUnifiedSender(makeMessage({ status: [{ userId: 'u1', status: 'read' }] }));
    expect(result.status).toHaveLength(1);
  });
});

describe('formatLinkMessageWithDetails', () => {
  // Le formateur recopiait `statusEntries` — des accusés NOMINATIFS — que
  // `messageSchema` (routes/links/types.ts) ne déclare pas, donc que
  // `fast-json-stringify` retirait juste après. Ne plus les recopier retire du
  // même geste la dépense ET le piège : le jour où quelqu'un déclarerait le
  // champ au schéma pour « réparer » l'absence, il publierait des accusés sans
  // le gate `showReadReceipts` que les cinq lecteurs du service appliquent.
  it("ne recopie pas les accusés nominatifs que le schéma de sortie ne déclare pas", () => {
    const result = formatLinkMessageWithDetails(
      makeMessage({ statusEntries: [{ participantId: 'part_001', readAt: new Date() }] })
    );
    expect(result).not.toHaveProperty('statusEntries');
  });

  it('porte l\'identité d\'un auteur INSCRIT dans `sender`', () => {
    const result = formatLinkMessageWithDetails(makeMessage());
    expect(result.sender).not.toBeNull();
    expect(result.sender!.id).toBe('user_001');
    expect(result.sender!.isMeeshyer).toBe(true);
  });

  // `sender: null` + identité rangée dans `anonymousSender` = message d'invité
  // SANS NOM sur le fil : `messageSchema` ne déclarait pas `anonymousSender`
  // (retiré à la sérialisation) et aucun client ne l'a jamais lu. `sender` est
  // le seul champ que les bulles regardent, sur ce point de service comme sur
  // `GET /links/:identifier`.
  it('porte l\'identité d\'un auteur ANONYME dans `sender`, pas dans une seconde voie', () => {
    const result = formatLinkMessageWithDetails(makeMessage({ sender: makeAnonSender() }));
    expect(result.sender).not.toBeNull();
    expect(result.sender!.id).toBe('anon_session_abc');
    expect(result.sender!.username).toBe('Guest User');
    expect(result.sender!.isMeeshyer).toBe(false);
    expect(result).not.toHaveProperty('anonymousSender');
  });

  it('returns all top-level fields', () => {
    const result = formatLinkMessageWithDetails(makeMessage());
    expect(result.id).toBe('msg_001');
    expect(result.content).toBe('Hello world');
    expect(result.messageType).toBe('text');
    expect(result.isEdited).toBe(false);
    expect(result.attachments).toEqual([]);
    expect(result.reactions).toEqual([]);
    expect(Array.isArray(result.translations)).toBe(true);
  });

  it('includes replyTo when provided', () => {
    const replyTo = {
      id: 'msg_000',
      content: 'Original',
      originalLanguage: 'fr',
      messageType: 'text',
      createdAt: new Date(),
      sender: makeUserSender(),
    };
    const result = formatLinkMessageWithDetails(makeMessage({ replyTo }));
    expect(result.replyTo).not.toBeNull();
    expect(result.replyTo!.id).toBe('msg_000');
    expect(result.replyTo!.sender!.id).toBe('user_001');
    expect(result.replyTo!.sender!.isMeeshyer).toBe(true);
  });

  it('nomme aussi l\'auteur ANONYME d\'un message cité', () => {
    const replyTo = {
      id: 'msg_anon',
      content: 'Anon reply',
      originalLanguage: 'en',
      messageType: 'text',
      createdAt: new Date(),
      sender: makeAnonSender(),
    };
    const result = formatLinkMessageWithDetails(makeMessage({ replyTo }));
    expect(result.replyTo!.sender!.username).toBe('Guest User');
    expect(result.replyTo!.sender!.isMeeshyer).toBe(false);
    expect(result.replyTo!).not.toHaveProperty('anonymousSender');
  });

  // Le message cité ne rend que son texte et son auteur : ne pas recopier ses
  // pièces jointes / réactions est ce qui justifie de ne plus les CHARGER
  // (`getConversationMessagesWithDetails`).
  it('ne recopie ni pièces jointes ni réactions du message cité', () => {
    const replyTo = {
      id: 'msg_000',
      content: 'Original',
      originalLanguage: 'fr',
      messageType: 'text',
      createdAt: new Date(),
      sender: makeUserSender(),
      attachments: [{ id: 'att_1' }],
      reactions: [{ id: 'rea_1', emoji: '👍' }],
    };
    const result = formatLinkMessageWithDetails(makeMessage({ replyTo }));
    expect(result.replyTo!).not.toHaveProperty('attachments');
    expect(result.replyTo!).not.toHaveProperty('reactions');
  });

  it('sets replyTo to null when missing', () => {
    const result = formatLinkMessageWithDetails(makeMessage({ replyTo: null }));
    expect(result.replyTo).toBeNull();
  });

  // `systemLanguage` n'a jamais franchi le sérialiseur — `messageSenderSchema`
  // ne le déclare pas — et aucun client ne le lit : les bulles décident de la
  // traduction sur `message.originalLanguage`. Le recopier était une dépense
  // muette de plus.
  it('ne recopie pas `systemLanguage` sur le sender', () => {
    const result = formatLinkMessageWithDetails(makeMessage());
    expect(result.sender!).not.toHaveProperty('systemLanguage');
  });

  it('falls back to fr for missing originalLanguage', () => {
    const result = formatLinkMessageWithDetails(makeMessage({ originalLanguage: undefined }));
    expect(result.originalLanguage).toBe('fr');
  });
});
