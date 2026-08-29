/**
 * Témoins unitaires du calcul PARTAGÉ de « qui suis-je » (#4178).
 *
 * `handleGetMe`, `me/get-me.ts`, est le SEUL site qui répond à cette question
 * — servi par `GET /api/v1/me` (routes/me/index.ts) ET par l'alias déprécié
 * `GET /api/v1/auth/me` (routes/auth/magic-link.ts). Les témoins HTTP de bout
 * en bout (les deux montages, JWT + session réelle, ETag/304 réel, en-têtes
 * de dépréciation) vivent dans `me-unified-read.test.ts`, à côté. Ce fichier
 * couvre les PURES fonctions : filtrage `?fields=`, `?expand=`, la synthèse
 * `security`, et la clé du limiteur de débit.
 */

import { describe, it, expect, jest } from '@jest/globals';
import fastJson from 'fast-json-stringify';
import {
  parseExpandParam,
  parseFieldsParam,
  pickFields,
  loadSecuritySummary,
  buildAnonymousMeUser,
  buildRegisteredMeUser,
  meRateLimitKeyGenerator,
  ME_READ_RATE_LIMIT_MAX,
  meResponseSchema,
} from '../../../../routes/me/get-me';
import type { UnifiedAuthContext } from '../../../../middleware/auth';

// ─── parseExpandParam ───────────────────────────────────────────────────────

describe('parseExpandParam', () => {
  it('rend un tableau vide sans querystring', () => {
    expect(parseExpandParam(undefined)).toEqual([]);
    expect(parseExpandParam('')).toEqual([]);
  });

  it('reconnaît "security" seul', () => {
    expect(parseExpandParam('security')).toEqual(['security']);
  });

  it('accepte les trois jetons connus, séparés par des virgules et des espaces', () => {
    expect(parseExpandParam('security, preferences,stats')).toEqual([
      'security',
      'preferences',
      'stats',
    ]);
  });

  it('ignore silencieusement un jeton inconnu — jamais de 400 sur une valeur future', () => {
    expect(parseExpandParam('security,quelquechose-de-futur')).toEqual(['security']);
  });

  it('ignore une valeur non-string (défense en profondeur si le typage de la querystring est contourné)', () => {
    expect(parseExpandParam(42)).toEqual([]);
    expect(parseExpandParam(null)).toEqual([]);
  });
});

// ─── parseFieldsParam ───────────────────────────────────────────────────────

describe('parseFieldsParam', () => {
  it('rend undefined sans querystring — aucun filtre', () => {
    expect(parseFieldsParam(undefined)).toBeUndefined();
    expect(parseFieldsParam('')).toBeUndefined();
  });

  it('découpe et nettoie la liste', () => {
    expect(parseFieldsParam('id, username ,role')).toEqual(['id', 'username', 'role']);
  });
});

// ─── pickFields ─────────────────────────────────────────────────────────────

describe('pickFields', () => {
  it('sans fields, rend l\'objet TEL QUEL (même référence — pas de copie inutile)', () => {
    const obj = { id: '1', username: 'alice' };
    expect(pickFields(obj, undefined)).toBe(obj);
  });

  it('ne garde que les clés demandées, présentes dans l\'objet', () => {
    const obj = { id: '1', username: 'alice', email: 'a@b.c', role: 'USER' };
    expect(pickFields(obj, ['id', 'username', 'role'])).toEqual({
      id: '1',
      username: 'alice',
      role: 'USER',
    });
  });

  it('une clé demandée mais absente de l\'objet est simplement omise (pas d\'erreur, pas de undefined)', () => {
    const obj = { id: '1' };
    const result = pickFields(obj, ['id', 'nope']);
    expect(result).toEqual({ id: '1' });
    expect('nope' in result).toBe(false);
  });

  it('composé avec ?expand : `security` ajouté APRÈS pickFields n\'est jamais retiré par le filtre `fields`', () => {
    // Réplique l'exemple de la source (me.md § « GET /me — la seule lecture de
    // soi ») : ?fields=id,username,displayName,avatar,role&expand=security
    // doit rendre CES QUATRE CHAMPS *PLUS* security, jamais security exclu
    // parce qu'il n'est pas nommé dans `fields`.
    const obj = { id: '1', username: 'alice', displayName: 'Alice', avatar: null, role: 'USER', email: 'a@b.c' };
    const filtered = pickFields(obj, ['id', 'username', 'displayName', 'avatar', 'role']);
    const withSecurity = { ...filtered, security: { hasSignalKeys: true, signalRegistrationId: 1, lastKeyRotation: null } };
    expect(withSecurity).toEqual({
      id: '1',
      username: 'alice',
      displayName: 'Alice',
      avatar: null,
      role: 'USER',
      security: { hasSignalKeys: true, signalRegistrationId: 1, lastKeyRotation: null },
    });
  });
});

// ─── loadSecuritySummary — exactement la requête de me/preferences/index.ts ──

describe('loadSecuritySummary', () => {
  function makePrisma(bundle: unknown) {
    return {
      signalPreKeyBundle: {
        findUnique: jest.fn<any>().mockResolvedValue(bundle),
      },
    } as any;
  }

  it('interroge signalPreKeyBundle PAR userId — jamais les colonnes miroir de User', async () => {
    const prisma = makePrisma(null);
    await loadSecuritySummary(prisma, 'user-1');
    expect(prisma.signalPreKeyBundle.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { registrationId: true, isActive: true, lastRotatedAt: true },
    });
  });

  it('aucun bundle ⇒ hasSignalKeys=false, le reste à null', async () => {
    const prisma = makePrisma(null);
    await expect(loadSecuritySummary(prisma, 'user-1')).resolves.toEqual({
      hasSignalKeys: false,
      signalRegistrationId: null,
      lastKeyRotation: null,
    });
  });

  it('un bundle INACTIF compte comme aucun bundle — la colonne isActive gouverne, pas la présence de la ligne', async () => {
    const prisma = makePrisma({ registrationId: 99, isActive: false, lastRotatedAt: new Date('2026-01-01') });
    await expect(loadSecuritySummary(prisma, 'user-1')).resolves.toEqual({
      hasSignalKeys: false,
      signalRegistrationId: null,
      lastKeyRotation: null,
    });
  });

  it('un bundle actif rend son registrationId et sa date de rotation', async () => {
    const rotatedAt = new Date('2026-03-04T05:06:07.000Z');
    const prisma = makePrisma({ registrationId: 4242, isActive: true, lastRotatedAt: rotatedAt });
    await expect(loadSecuritySummary(prisma, 'user-1')).resolves.toEqual({
      hasSignalKeys: true,
      signalRegistrationId: 4242,
      lastKeyRotation: rotatedAt,
    });
  });
});

// ─── buildAnonymousMeUser / buildRegisteredMeUser ──────────────────────────

function anonymousAuthContext(overrides: Partial<UnifiedAuthContext> = {}): UnifiedAuthContext {
  return {
    type: 'anonymous',
    isAuthenticated: true,
    isAnonymous: true,
    userId: 'participant-1',
    displayName: 'Visiteur Anonyme',
    userLanguage: 'es',
    hasFullAccess: false,
    canSendMessages: true,
    anonymousUser: {
      id: 'participant-1',
      sessionToken: 'raw-token',
      username: 'anon-user',
      firstName: undefined,
      lastName: undefined,
      language: 'es',
      shareLinkId: 'link-1',
      permissions: {} as never,
    },
    ...overrides,
  };
}

describe('buildAnonymousMeUser', () => {
  it("sert role: 'ANONYMOUS' — c'est le porteur qui varie, jamais le chemin (critère 1 de #4178)", () => {
    const user = buildAnonymousMeUser(anonymousAuthContext());
    expect(user.role).toBe('ANONYMOUS');
    expect(user.id).toBe('participant-1');
    expect(user.email).toBeNull();
  });

  it('sert le défaut PARTAGÉ pour autoTranslateEnabled — un participant anonyme n\'a pas de ligne UserPreferences', () => {
    const user = buildAnonymousMeUser(anonymousAuthContext());
    // resolveAutoTranslateEnabled(null) est la loi partagée ; on n'affirme que
    // le comportement observable ici : true (le défaut connu du dépôt).
    expect(user.autoTranslateEnabled).toBe(true);
  });

  it('lève plutôt que de servir un objet à moitié rempli quand anonymousUser est absent', () => {
    expect(() => buildAnonymousMeUser(anonymousAuthContext({ anonymousUser: undefined }))).toThrow();
  });
});

describe('buildRegisteredMeUser', () => {
  function registeredAuthContext(role: string): UnifiedAuthContext {
    return {
      type: 'user',
      isAuthenticated: true,
      isAnonymous: false,
      userId: 'user-1',
      displayName: 'Alice',
      userLanguage: 'fr',
      hasFullAccess: true,
      canSendMessages: true,
      registeredUser: {
        id: 'user-1',
        username: 'alice',
        email: 'alice@example.com',
        role,
        systemLanguage: 'fr',
        regionalLanguage: 'en',
        isOnline: true,
        lastActiveAt: new Date(),
      },
    };
  }

  it('délègue les permissions à servedUserPermissions(role) — la MÊME fonction que AuthService.getUserPermissions', () => {
    const admin = buildRegisteredMeUser(registeredAuthContext('ADMIN'));
    const user = buildRegisteredMeUser(registeredAuthContext('USER'));
    expect(admin.permissions).toMatchObject({ canAccessAdmin: true });
    expect(user.permissions).toMatchObject({ canAccessAdmin: false });
  });

  it('lève plutôt que de servir un objet à moitié rempli quand registeredUser est absent', () => {
    const ctx = registeredAuthContext('USER');
    (ctx as { registeredUser?: unknown }).registeredUser = undefined;
    expect(() => buildRegisteredMeUser(ctx)).toThrow();
  });
});

// ─── meRateLimitKeyGenerator — critère 5 : userId, JAMAIS request.ip ───────

describe('meRateLimitKeyGenerator', () => {
  it('clé par userId quand authContext le porte', () => {
    const request = { ip: '10.0.0.7', authContext: { userId: 'user-42' } } as any;
    expect(meRateLimitKeyGenerator(request)).toBe('me:read:user-42');
  });

  it("ne se replie sur l'IP que si authContext ne porte AUCUN userId — jamais le chemin nominal", () => {
    const request = { ip: '10.0.0.7', authContext: undefined } as any;
    expect(meRateLimitKeyGenerator(request)).toBe('me:read:ip:10.0.0.7');
  });

  it('deux comptes distincts obtiennent deux clés distinctes (le seau n\'est pas partagé)', () => {
    const a = meRateLimitKeyGenerator({ ip: '1.1.1.1', authContext: { userId: 'user-a' } } as any);
    const b = meRateLimitKeyGenerator({ ip: '1.1.1.1', authContext: { userId: 'user-b' } } as any);
    expect(a).not.toBe(b);
  });

  it('le plafond documenté est bien 600 (critère 5 de #4178)', () => {
    expect(ME_READ_RATE_LIMIT_MAX).toBe(600);
  });
});

// ─── meResponseSchema — le cliquet additionalProperties, SEUL (isolé de
//     formatUserResponse, qui recopie déjà un jeu de clés nommées et ne
//     laisserait jamais passer passwordHash jusqu'ici) ────────────────────

describe('meResponseSchema — additionalProperties (fast-json-stringify), en isolation', () => {
  const stringify = fastJson(meResponseSchema as unknown as Record<string, unknown>);

  it("supprime un champ NON DÉCLARÉ sur l'objet user — même s'il n'a jamais traversé formatUserResponse", () => {
    const served = JSON.parse(
      stringify({
        success: true,
        data: {
          user: {
            id: 'u1',
            username: 'alice',
            passwordHash: '$2b$10$secretbcrypthash',
            pendingEmail: 'nouvel-email@example.com',
          },
        },
      })
    );
    expect(served.data.user.id).toBe('u1');
    expect(served.data.user.username).toBe('alice');
    expect('passwordHash' in served.data.user).toBe(false);
    // `pendingEmail` N'EST PAS déclaré par `userSchema` (vérifié, #4178) :
    // même retenue que `passwordHash`, pour une raison différente (champ mort
    // plutôt que secret) — la garde ne distingue pas les deux, et c'est
    // voulu.
    expect('pendingEmail' in served.data.user).toBe(false);
  });

  it('supprime un champ NON DÉCLARÉ sous `security` — la carte imbriquée est gardée aussi, pas seulement le premier niveau', () => {
    const served = JSON.parse(
      stringify({
        success: true,
        data: {
          user: {
            id: 'u1',
            security: {
              hasSignalKeys: true,
              signalRegistrationId: 1,
              lastKeyRotation: null,
              identityKeyPrivate: 'CLE-PRIVEE-QUI-NE-DOIT-JAMAIS-SORTIR',
            },
          },
        },
      })
    );
    expect(served.data.user.security.hasSignalKeys).toBe(true);
    expect('identityKeyPrivate' in served.data.user.security).toBe(false);
  });

  it('laisse passer les champs déclarés intacts (le cliquet ne vide pas tout — c\'est un filtre, pas une purge)', () => {
    const served = JSON.parse(
      stringify({
        success: true,
        data: { user: { id: 'u1', username: 'alice', role: 'ADMIN', isActive: true } },
      })
    );
    expect(served).toEqual({
      success: true,
      data: { user: { id: 'u1', username: 'alice', role: 'ADMIN', isActive: true } },
    });
  });
});
