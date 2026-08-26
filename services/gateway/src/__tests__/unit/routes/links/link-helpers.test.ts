/**
 * link-helpers unit tests
 *
 * @jest-environment node
 */

import {
  createLegacyHybridRequest,
  resolveShareLinkId,
  generateShareLinkId,
  generateUniqueShareLinkId,
  generateConversationIdentifier,
  ensureUniqueShareLinkIdentifier,
  SHARE_LINK_ID_LENGTH,
  SHARE_LINK_ID_PREFIX,
} from '../../../../routes/links/utils/link-helpers';
import type { UnifiedAuthRequest } from '../../../../middleware/auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRegisteredUserRequest(): UnifiedAuthRequest {
  return {
    authContext: {
      type: 'user',
      isAuthenticated: true,
      isAnonymous: false,
      hasFullAccess: true,
      displayName: 'Alice Dupont',
      userLanguage: 'fr',
      canSendMessages: true,
      registeredUser: {
        id: 'user_001',
        username: 'alice',
        email: 'alice@meeshy.me',
        role: 'USER',
        systemLanguage: 'fr',
        regionalLanguage: 'fr',
      } as any,
    },
  } as unknown as UnifiedAuthRequest;
}

function makeAnonymousUserRequest(): UnifiedAuthRequest {
  return {
    authContext: {
      type: 'anonymous',
      isAuthenticated: true,
      isAnonymous: true,
      hasFullAccess: false,
      displayName: 'Guest User',
      userLanguage: 'en',
      canSendMessages: true,
      anonymousUser: {
        id: 'anon_001',
        sessionToken: 'sess_abc',
        username: 'GuestUser',
        firstName: 'Guest',
        lastName: 'User',
        language: 'en',
        shareLinkId: 'link_001',
        permissions: {
          canSendMessages: true,
          canSendFiles: false,
          canSendImages: true,
        },
      },
    },
  } as unknown as UnifiedAuthRequest;
}

function makeUnauthenticatedRequest(): UnifiedAuthRequest {
  return {
    authContext: {
      type: 'anonymous',
      isAuthenticated: false,
      isAnonymous: true,
      hasFullAccess: false,
      displayName: '',
      userLanguage: 'en',
      canSendMessages: false,
    },
  } as unknown as UnifiedAuthRequest;
}

function makePrisma(shareLink: { id: string } | null = null) {
  return {
    conversationShareLink: {
      findFirst: jest.fn().mockResolvedValue(shareLink),
    },
  } as any;
}

// ---------------------------------------------------------------------------
// createLegacyHybridRequest
// ---------------------------------------------------------------------------

describe('createLegacyHybridRequest', () => {
  it('returns registered user shape for authenticated registered user', () => {
    const result = createLegacyHybridRequest(makeRegisteredUserRequest());
    expect(result.isAuthenticated).toBe(true);
    expect(result.isAnonymous).toBe(false);
    expect(result.user).toBeDefined();
    expect(result.user.id).toBe('user_001');
    expect(result.anonymousParticipant).toBeNull();
  });

  it('returns anonymous participant shape for anonymous user', () => {
    const result = createLegacyHybridRequest(makeAnonymousUserRequest());
    expect(result.isAuthenticated).toBe(true);
    expect(result.isAnonymous).toBe(true);
    expect(result.user).toBeNull();
    expect(result.anonymousParticipant).not.toBeNull();
    expect(result.anonymousParticipant.id).toBe('sess_abc');
    expect(result.anonymousParticipant.username).toBe('GuestUser');
    expect(result.anonymousParticipant.canSendMessages).toBe(true);
    expect(result.anonymousParticipant.canSendFiles).toBe(false);
  });

  it('returns unauthenticated shape when no user is present', () => {
    const result = createLegacyHybridRequest(makeUnauthenticatedRequest());
    expect(result.isAuthenticated).toBe(false);
    expect(result.isAnonymous).toBe(false);
    expect(result.user).toBeNull();
    expect(result.anonymousParticipant).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveShareLinkId
// ---------------------------------------------------------------------------

describe('resolveShareLinkId', () => {
  it('returns identifier directly when it is a 24-char hex ObjectId', async () => {
    const id = 'a'.repeat(24);
    const prisma = makePrisma();
    const result = await resolveShareLinkId(prisma, id);
    expect(result).toBe(id);
    expect(prisma.conversationShareLink.findFirst).not.toHaveBeenCalled();
  });

  it('queries by identifier when input is not an ObjectId', async () => {
    const prisma = makePrisma({ id: 'found_id_xyz' });
    const result = await resolveShareLinkId(prisma, 'my-share-link');
    expect(result).toBe('found_id_xyz');
    expect(prisma.conversationShareLink.findFirst).toHaveBeenCalledWith({
      where: { identifier: 'my-share-link' },
    });
  });

  it('returns null when share link not found', async () => {
    const prisma = makePrisma(null);
    const result = await resolveShareLinkId(prisma, 'no-such-link');
    expect(result).toBeNull();
  });

  it('accepts exactly 24 hex chars (ObjectId boundary)', async () => {
    const id = '0123456789abcdef01234567';
    const prisma = makePrisma();
    const result = await resolveShareLinkId(prisma, id);
    expect(result).toBe(id);
  });

  it('queries when identifier is 23 chars (not 24)', async () => {
    const prisma = makePrisma({ id: 'found' });
    await resolveShareLinkId(prisma, '0'.repeat(23));
    expect(prisma.conversationShareLink.findFirst).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// generateShareLinkId — l'identifiant PUBLIC compact
//
// SUPERSEDE `generateInitialLinkId` / `generateFinalLinkId`, dont le couple
// produisait `mshy_<ObjectId 24>.<yymmddhhmm>_<8 base36>` — 49 caracteres qui
// publiaient la cle primaire de la ligne ET son instant de creation, tires d un
// `Math.random()` predictible. Les temoins ci-dessous attestent les trois
// proprietes que le couple n avait pas, plutot que de disparaitre avec lui.
// ---------------------------------------------------------------------------

describe('generateShareLinkId', () => {
  it('rend `mshy_` + 8 caracteres base62 — 13 caracteres en tout', () => {
    const result = generateShareLinkId();
    expect(result).toMatch(/^mshy_[A-Za-z0-9]{8}$/);
    expect(result).toHaveLength(SHARE_LINK_ID_PREFIX.length + SHARE_LINK_ID_LENGTH);
  });

  it('reste bien plus court que le format qu il remplace (49 caracteres)', () => {
    expect(generateShareLinkId().length).toBeLessThan(49 / 3);
  });

  it('ne porte NI ObjectId NI horodatage — un lien ne dit pas quand il est ne', () => {
    const result = generateShareLinkId();
    expect(result).not.toContain('.');
    expect(result).not.toMatch(/[0-9a-f]{24}/);
    expect(result).not.toContain(String(new Date().getUTCFullYear()));
  });

  it('tire une valeur differente a chaque appel', () => {
    const drawn = new Set(Array.from({ length: 200 }, () => generateShareLinkId()));
    // 200 tirages dans 62^8 : une repetition serait un defaut du generateur,
    // pas de la malchance.
    expect(drawn.size).toBe(200);
  });

  it('accepte une longueur explicite (escalade anti-collision)', () => {
    expect(generateShareLinkId(16)).toMatch(/^mshy_[A-Za-z0-9]{16}$/);
  });
});

// ---------------------------------------------------------------------------
// generateUniqueShareLinkId — la garde anti-collision
// ---------------------------------------------------------------------------

describe('generateUniqueShareLinkId', () => {
  it('rend le premier candidat libre', async () => {
    const prisma = makePrisma(null);
    const result = await generateUniqueShareLinkId(prisma);
    expect(result).toMatch(/^mshy_[A-Za-z0-9]{8}$/);
    expect(prisma.conversationShareLink.findFirst).toHaveBeenCalledTimes(1);
  });

  it('verifie l UNION des deux colonnes publiques, jamais la seule `linkId`', async () => {
    // La resolution accepte les deux colonnes (`getShareLinkByIdentifier`,
    // `TrackingLinkService.resolveTarget`) : une valeur unique dans SA colonne
    // mais presente dans l autre resoudrait le MAUVAIS lien.
    const prisma = makePrisma(null);
    await generateUniqueShareLinkId(prisma);
    const where = prisma.conversationShareLink.findFirst.mock.calls[0][0].where;
    expect(where.OR).toHaveLength(2);
    expect(where.OR[0]).toHaveProperty('linkId');
    expect(where.OR[1]).toHaveProperty('identifier');
  });

  it('retire un candidat deja pris et en tire un autre', async () => {
    const prisma = {
      conversationShareLink: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ id: 'taken' })
          .mockResolvedValueOnce(null),
      },
    } as any;
    const result = await generateUniqueShareLinkId(prisma);
    expect(result).toMatch(/^mshy_[A-Za-z0-9]{8}$/);
    expect(prisma.conversationShareLink.findFirst).toHaveBeenCalledTimes(2);
  });

  it('ESCALADE la longueur plutot que d insister quand 8 caracteres collisionnent', async () => {
    const findFirst = jest.fn()
      .mockResolvedValueOnce({ id: 'a' })
      .mockResolvedValueOnce({ id: 'b' })
      .mockResolvedValueOnce({ id: 'c' })
      .mockResolvedValueOnce({ id: 'd' })
      .mockResolvedValueOnce(null);
    const result = await generateUniqueShareLinkId({ conversationShareLink: { findFirst } } as any);
    expect(result).toMatch(/^mshy_[A-Za-z0-9]{12}$/);
  });

  it('leve plutot que de boucler quand TOUTES les longueurs collisionnent', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'always-taken' });
    await expect(
      generateUniqueShareLinkId({ conversationShareLink: { findFirst } } as any)
    ).rejects.toThrow(/unique/i);
    // 3 longueurs x 4 tentatives : borne, jamais une boucle infinie.
    expect(findFirst).toHaveBeenCalledTimes(12);
  });
});

// ---------------------------------------------------------------------------
// generateConversationIdentifier
// ---------------------------------------------------------------------------

describe('generateConversationIdentifier', () => {
  it('returns a string starting with mshy_', () => {
    expect(generateConversationIdentifier()).toMatch(/^mshy_/);
  });

  it('includes sanitized title when provided', () => {
    const result = generateConversationIdentifier('My Conversation');
    expect(result).toContain('my-conversation');
    expect(result.startsWith('mshy_')).toBe(true);
  });

  it('strips special characters from title', () => {
    const result = generateConversationIdentifier('Hello! World?');
    expect(result).toMatch(/^mshy_helloworld-\d+$|^mshy_hello-world-\d+$/);
  });

  it('falls back to random ID when title is empty string', () => {
    const result = generateConversationIdentifier('');
    // Le repli n a plus de suffixe horodate : sans titre a rendre lisible,
    // l identifiant est COMPACT et opaque (mshy_ + 12 base64url = 17 car.).
    expect(result).toMatch(/^mshy_[A-Za-z0-9_-]{12}$/);
  });

  it('falls back to random ID when title reduces to empty after sanitization', () => {
    const result = generateConversationIdentifier('!!! ---');
    // Le repli n a plus de suffixe horodate : sans titre a rendre lisible,
    // l identifiant est COMPACT et opaque (mshy_ + 12 base64url = 17 car.).
    expect(result).toMatch(/^mshy_[A-Za-z0-9_-]{12}$/);
  });

  it('falls back to random ID when title is undefined', () => {
    const result = generateConversationIdentifier(undefined);
    // Le repli n a plus de suffixe horodate : sans titre a rendre lisible,
    // l identifiant est COMPACT et opaque (mshy_ + 12 base64url = 17 car.).
    expect(result).toMatch(/^mshy_[A-Za-z0-9_-]{12}$/);
  });

  it('includes a numeric timestamp suffix', () => {
    const result = generateConversationIdentifier('test');
    // Suffix should be digits (YYYYMMDDHHMMSS format)
    expect(result).toMatch(/-\d{14}$/);
  });

  it('transliterates accents instead of deleting them (SSOT parity)', () => {
    // Drifted local impl deleted the `é` entirely → `mshy_caf-…`.
    // The shared SSOT strips the diacritic but keeps the base letter → `cafe`.
    const result = generateConversationIdentifier('Café');
    expect(result).toContain('cafe');
    expect(result).not.toMatch(/mshy_caf-/);
  });

  it('maps German characters to roman equivalents (SSOT parity)', () => {
    // ü→ue, ö→oe, ß→ss — the drifted local impl dropped all three.
    const result = generateConversationIdentifier('Münchner Größe');
    expect(result).toContain('muenchner-groesse');
  });

  it('uses a UTC timestamp consistent with the conversations path (SSOT parity)', () => {
    // The shared SSOT builds the timestamp from getUTC* methods so identifiers
    // are stable across server timezones; the drifted copy used local time.
    const before = new Date();
    const result = generateConversationIdentifier('utc check');
    const stamp = result.match(/-(\d{14})$/)?.[1];
    expect(stamp).toBeDefined();
    const utcYear = before.getUTCFullYear().toString();
    expect(stamp!.startsWith(utcYear)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ensureUniqueShareLinkIdentifier
// ---------------------------------------------------------------------------

describe('ensureUniqueShareLinkIdentifier', () => {
  it('returns base identifier when no conflict exists', async () => {
    const prisma = makePrisma(null);
    const result = await ensureUniqueShareLinkIdentifier(prisma, 'my-link');
    expect(result).toBe('my-link');
  });

  it('verifie l UNION des deux colonnes publiques', async () => {
    // Meme loi que `generateUniqueShareLinkId`, et pour la meme raison : la
    // resolution accepte `linkId` OU `identifier`. Un slug personnalise egal au
    // `linkId` d un AUTRE lien resoudrait le mauvais — `findFirst` choisirait
    // sans le dire.
    const prisma = makePrisma(null);
    await ensureUniqueShareLinkIdentifier(prisma, 'my-link');
    const where = prisma.conversationShareLink.findFirst.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ linkId: 'my-link' }, { identifier: 'my-link' }]);
  });

  it('desambigue par un suffixe ALEATOIRE, jamais par un horodatage', async () => {
    // L ancien suffixe `-YYYYmmddHHMMSS` publiait l instant de creation sur un
    // identifiant que l utilisateur a justement choisi de rendre public.
    const prisma = {
      conversationShareLink: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ id: 'existing' })
          .mockResolvedValueOnce(null),
      },
    } as any;
    const result = await ensureUniqueShareLinkIdentifier(prisma, 'my-link');
    expect(result).toMatch(/^my-link-[A-Za-z0-9]{6}$/);
    expect(result).not.toContain(String(new Date().getUTCFullYear()));
  });

  it('retire un suffixe deja pris et en tire un autre', async () => {
    const prisma = {
      conversationShareLink: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ id: 'base' })
          .mockResolvedValueOnce({ id: 'suffix-1' })
          .mockResolvedValueOnce(null),
      },
    } as any;
    const result = await ensureUniqueShareLinkIdentifier(prisma, 'my-link');
    expect(result).toMatch(/^my-link-[A-Za-z0-9]{6}$/);
    expect(prisma.conversationShareLink.findFirst).toHaveBeenCalledTimes(3);
  });

  it('abandonne la lisibilite plutot que de boucler quand le slug reste indisponible', async () => {
    // L ancienne forme incrementait un compteur dans un `while (true)` : elle
    // supposait que la base finirait par ceder. Ici on borne, et on retombe sur
    // un identifiant opaque, qui a sa propre escalade.
    const findFirst = jest.fn()
      // 1 (base) + 6 suffixes = 7 refus, puis le repli opaque est libre
      .mockResolvedValueOnce({ id: 'x' })
      .mockResolvedValueOnce({ id: 'x' })
      .mockResolvedValueOnce({ id: 'x' })
      .mockResolvedValueOnce({ id: 'x' })
      .mockResolvedValueOnce({ id: 'x' })
      .mockResolvedValueOnce({ id: 'x' })
      .mockResolvedValueOnce({ id: 'x' })
      .mockResolvedValueOnce(null);
    const result = await ensureUniqueShareLinkIdentifier(
      { conversationShareLink: { findFirst } } as any,
      'my-link'
    );
    expect(result).toMatch(/^mshy_[A-Za-z0-9]{8}$/);
    expect(findFirst).toHaveBeenCalledTimes(8);
  });

  it('rend un identifiant COMPACT quand rien de lisible n est propose (chaine vide)', async () => {
    // Le repli valait `mshy_link-<Date.now()>-<Math.random()>` : 30 caracteres,
    // l instant de creation a la milliseconde, et un PRNG predictible.
    const prisma = makePrisma(null);
    const result = await ensureUniqueShareLinkIdentifier(prisma, '');
    expect(result).toMatch(/^mshy_[A-Za-z0-9]{8}$/);
    expect(result).not.toContain('mshy_link-');
  });

  it('idem pour une chaine d espaces', async () => {
    const prisma = makePrisma(null);
    const result = await ensureUniqueShareLinkIdentifier(prisma, '   ');
    expect(result).toMatch(/^mshy_[A-Za-z0-9]{8}$/);
  });

  it('tolere un identifiant absent (undefined)', async () => {
    const prisma = makePrisma(null);
    const result = await ensureUniqueShareLinkIdentifier(prisma, undefined as any);
    expect(result).toMatch(/^mshy_[A-Za-z0-9]{8}$/);
  });
});
