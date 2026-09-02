/**
 * routes/links/types unit tests — Zod schema validation
 *
 * @jest-environment node
 */

import {
  createLinkSchema,
  updateLinkSchema,
  sendMessageSchema,
} from '../../../../routes/links/types';

// ---------------------------------------------------------------------------
// createLinkSchema
// ---------------------------------------------------------------------------

describe('createLinkSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    expect(createLinkSchema.safeParse({}).success).toBe(true);
  });

  it('accepts valid minimal config with conversationId', () => {
    const result = createLinkSchema.safeParse({ conversationId: 'conv_abc' });
    expect(result.success).toBe(true);
  });

  it('accepts all boolean flags', () => {
    const result = createLinkSchema.safeParse({
      allowAnonymousMessages: true,
      allowAnonymousFiles: false,
      allowAnonymousImages: true,
      allowViewHistory: false,
      requireAccount: false,
      requireNickname: true,
      requireEmail: false,
      requireBirthday: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts numeric limit fields as positive integers', () => {
    const result = createLinkSchema.safeParse({
      maxUses: 100,
      maxConcurrentUsers: 10,
      maxUniqueSessions: 50,
    });
    expect(result.success).toBe(true);
  });

  it('rejects maxUses that is not positive', () => {
    expect(createLinkSchema.safeParse({ maxUses: 0 }).success).toBe(false);
    expect(createLinkSchema.safeParse({ maxUses: -1 }).success).toBe(false);
  });

  it('rejects maxUses that is not an integer', () => {
    expect(createLinkSchema.safeParse({ maxUses: 1.5 }).success).toBe(false);
  });

  it('accepte allowedLanguages et allowedIpRanges — les deux filtres RÉELS', () => {
    const result = createLinkSchema.safeParse({
      allowedLanguages: ['fr', 'en'],
      allowedIpRanges: ['192.168.1.0/24'],
    });
    expect(result.success).toBe(true);
  });

  /**
   * `allowedCountries` : ce témoin affirmait l'inverse jusqu'au 2026-08-31.
   *
   * #4167 avait retiré le champ de la loi d'admission — un filtre par pays
   * exigerait une base GeoIP que la passerelle n'embarque pas. La décision
   * n'avait pas atteint la porte de création, qui l'acceptait encore, ni
   * l'affichage, qui le montrait comme appliqué : quelqu'un pouvait cocher
   * « limiter aux pays suivants », le voir confirmé, et partager le lien en
   * croyant qu'il était géo-restreint (#4354).
   *
   * Un contrôle décoratif est pire qu'une absence, parce qu'on compte dessus.
   */
  it('REFUSE une liste de pays non vide — la restriction n\'existe pas, le refus le DIT', () => {
    const result = createLinkSchema.safeParse({ allowedCountries: ['FR', 'US'] });
    expect(result.success).toBe(false);
    // Le message NOMME la raison : un 400 muet enverrait chercher une faute de
    // frappe là où il n'y a pas de fonctionnalité.
    expect(JSON.stringify(result)).toContain('GeoIP');
  });

  it('accepte une liste de pays VIDE — dix liens sur dix l\'envoient ainsi', () => {
    // Mesuré sur l'intégration le 2026-08-31 : les clients publiés envoient le
    // champ à vide à chaque création. Un refus sur sa PRÉSENCE casserait toute
    // création de lien jusqu'à leur mise à jour — le refus vise la DEMANDE de
    // restriction, pas le champ.
    expect(createLinkSchema.safeParse({ allowedCountries: [] }).success).toBe(true);
    expect(createLinkSchema.safeParse({}).success).toBe(true);
  });

  it('accepts valid expiresAt ISO datetime', () => {
    const result = createLinkSchema.safeParse({ expiresAt: '2027-01-01T00:00:00Z' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid expiresAt', () => {
    expect(createLinkSchema.safeParse({ expiresAt: 'not-a-date' }).success).toBe(false);
  });

  it('accepts newConversation with valid title', () => {
    const result = createLinkSchema.safeParse({
      newConversation: { title: 'New Chat', description: 'A conversation', memberIds: ['u1'] },
    });
    expect(result.success).toBe(true);
  });

  it('rejects newConversation with empty title', () => {
    expect(
      createLinkSchema.safeParse({ newConversation: { title: '' } }).success
    ).toBe(false);
  });

  it('accepts newConversation with only title', () => {
    const result = createLinkSchema.safeParse({ newConversation: { title: 'Chat' } });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// updateLinkSchema
// ---------------------------------------------------------------------------

describe('updateLinkSchema', () => {
  it('accepts empty object', () => {
    expect(updateLinkSchema.safeParse({}).success).toBe(true);
  });

  it('accepts isActive boolean', () => {
    expect(updateLinkSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it('accepts null for maxUses to unset limit', () => {
    const result = updateLinkSchema.safeParse({ maxUses: null });
    expect(result.success).toBe(true);
  });

  it('accepts null for expiresAt to remove expiry', () => {
    const result = updateLinkSchema.safeParse({ expiresAt: null });
    expect(result.success).toBe(true);
  });

  it('rejects maxConcurrentUsers that is not positive', () => {
    expect(updateLinkSchema.safeParse({ maxConcurrentUsers: 0 }).success).toBe(false);
  });

  it('accepts all optional string fields', () => {
    const result = updateLinkSchema.safeParse({ name: 'New name', description: 'Updated' });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// sendMessageSchema
// ---------------------------------------------------------------------------

describe('sendMessageSchema', () => {
  function makeValidMessage(overrides: Record<string, unknown> = {}) {
    return {
      clientMessageId: 'cid_550e8400-e29b-41d4-a716-446655440000',
      content: 'Hello',
      ...overrides,
    };
  }

  it('accepts valid message with content', () => {
    expect(sendMessageSchema.safeParse(makeValidMessage()).success).toBe(true);
  });

  it('defaults originalLanguage to fr', () => {
    const result = sendMessageSchema.safeParse(makeValidMessage());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.originalLanguage).toBe('fr');
  });

  it('defaults messageType to text', () => {
    const result = sendMessageSchema.safeParse(makeValidMessage());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.messageType).toBe('text');
  });

  it('accepts custom originalLanguage', () => {
    const result = sendMessageSchema.safeParse(makeValidMessage({ originalLanguage: 'en' }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.originalLanguage).toBe('en');
  });

  it('canonicalizes a region-tagged originalLanguage at the write boundary', () => {
    // Clients emit the raw platform locale (iOS `fr_FR`, web `fr-FR`, `en-US`).
    // Persisting it verbatim mirrors iteration 218's MessagingService bug on the
    // anonymous/registered share-link message-create paths. The schema is the
    // single write boundary for both those `prisma.message.create` sites, so it
    // must canonicalize via the `normalizeLanguageCode` SSOT before persistence.
    const cases: ReadonlyArray<[string, string]> = [
      ['fr-FR', 'fr'],
      ['fr_FR', 'fr'],
      ['FR', 'fr'],
      ['en-US', 'en'],
      ['zh-Hant-HK', 'zh'],
    ];
    cases.forEach(([raw, canonical]) => {
      const result = sendMessageSchema.safeParse(makeValidMessage({ originalLanguage: raw }));
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.originalLanguage).toBe(canonical);
    });
  });

  it('preserves an irreducible originalLanguage verbatim (no data loss)', () => {
    // ISO 639-3 codes supported by Meeshy without a 639-1 equivalent (`bas`)
    // and unknown codes are irreducible: `normalizeLanguageCode` returns
    // undefined, so the `?? raw` fallback keeps them unchanged — identical to
    // iteration 218's claim-path behavior, zero data loss.
    ['bas', 'xx'].forEach((raw) => {
      const result = sendMessageSchema.safeParse(makeValidMessage({ originalLanguage: raw }));
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.originalLanguage).toBe(raw);
    });
  });

  it('rejects missing clientMessageId', () => {
    expect(sendMessageSchema.safeParse({ content: 'Hi' }).success).toBe(false);
  });

  it('rejects invalid clientMessageId format', () => {
    expect(
      sendMessageSchema.safeParse({ ...makeValidMessage(), clientMessageId: 'bad-id' }).success
    ).toBe(false);
  });

  it('rejects clientMessageId with uppercase UUID', () => {
    // Must be lowercase
    expect(
      sendMessageSchema.safeParse({
        ...makeValidMessage(),
        clientMessageId: 'cid_550E8400-E29B-41D4-A716-446655440000',
      }).success
    ).toBe(false);
  });

  it('rejects content exceeding 1000 chars', () => {
    expect(
      sendMessageSchema.safeParse(makeValidMessage({ content: 'a'.repeat(1001) })).success
    ).toBe(false);
  });

  it('requires content (refine)', () => {
    expect(
      sendMessageSchema.safeParse({
        clientMessageId: 'cid_550e8400-e29b-41d4-a716-446655440000',
      }).success
    ).toBe(false);
  });

  it('rejects attachments without content', () => {
    // Le `refine` admettait ce corps au nom d'une fonctionnalité inexistante :
    // ni la route anonyme ni son jumeau authentifié ne lisent `attachments`.
    // La branche ne menait pas à l'envoi d'un fichier mais à
    // `processMessageLinks(content: string)`, appelé avec `undefined` — un 500
    // déclenchable par un invité anonyme. Tant que ces routes ne servent pas
    // les pièces jointes, le champ ne peut pas dispenser du contenu.
    const result = sendMessageSchema.safeParse({
      clientMessageId: 'cid_550e8400-e29b-41d4-a716-446655440000',
      attachments: ['attachment-id-1'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only content', () => {
    // `trim()` vide ⇒ le refine refuse.
    const result = sendMessageSchema.safeParse({
      clientMessageId: 'cid_550e8400-e29b-41d4-a716-446655440000',
      content: '   ',
    });
    expect(result.success).toBe(false);
  });

  it('accepts attachments alongside content (le champ reste toléré)', () => {
    // Un client qui joint le champ à un message avec contenu n'est pas refusé —
    // il est simplement ignoré en aval.
    const result = sendMessageSchema.safeParse(makeValidMessage({ attachments: ['a'] }));
    expect(result.success).toBe(true);
  });

  it('accepts attachments as empty array when content is provided', () => {
    const result = sendMessageSchema.safeParse(makeValidMessage({ attachments: [] }));
    expect(result.success).toBe(true);
  });
});
