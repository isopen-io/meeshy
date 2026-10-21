/**
 * #10477 — **une session prouvée par un lien et jamais adoptée expire en
 * minutes, pas en jours.**
 *
 * Un lien magique ou une vérification d'adresse ouvre une session AVANT que
 * l'appareil ait décidé d'en vouloir : quand le lien prouve un AUTRE compte
 * (#10474), l'appareil pose la question, et tuer l'appli pendant cette question
 * ne referme rien. La session naît donc courte, et prend sa durée normale au
 * premier passage d'une porte d'authentification (REST, socket, TUS,
 * renouvellement) — un ancien client qui s'en sert l'adopte de fait. La
 * déconnexion, qui est le refus, ne l'adopte pas.
 *
 * Les témoins passent par les VRAIS `createSession`, `markSessionTrusted` et
 * `sessionAdmissionRefusal`, sur une table de sessions en mémoire.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { SessionLoginMethod } from '@meeshy/shared/utils/client-session';
import { createSession, initSessionService, markSessionTrusted } from '../../SessionService';
import { sessionAdmissionRefusal } from '../session-admission';
import { PROVEN_SESSION_ADOPTION_WINDOW_MS, adoptProvenSession, provenSessionAdoption, servedSession } from '../session-adoption';
import { PENDING_TWO_FACTOR_TTL_MS, provenChallengeAdoption } from '../pending-two-factor';
import {
  PROVEN_ADOPTION_CLIENT_FALLBACK_MS,
  PROVEN_ADOPTION_CLIENT_MARGIN_MS,
  PROVEN_ADOPTION_CLIENT_MAX_MS,
  provenAdoptionClientWindowMs,
} from '@meeshy/shared/utils/proven-session-adoption';
import type { RequestContext } from '../../GeoIPService';
import { MagicLinkService } from '../../MagicLinkService';

const USER_ID = '507f1f77bcf86cd799439011';
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

type Row = Record<string, unknown> & { id: string };
type Where = Record<string, unknown>;

const browser: RequestContext = {
  ip: '81.2.69.160',
  userAgent: 'Mozilla/5.0 (Macintosh) Safari/605.1.15',
  geoData: null,
  deviceInfo: null,
};

function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = row[key];
    if (expected instanceof Date) return actual instanceof Date && actual.getTime() === expected.getTime();
    if (expected && typeof expected === 'object' && 'gt' in expected) {
      const bound = (expected as { gt: Date }).gt;
      return actual instanceof Date && actual.getTime() > bound.getTime();
    }
    return actual === expected;
  });
}

function sessionTable(options: { readonly failAdoption?: boolean } = {}) {
  const rows: Row[] = [];
  const updateMany = jest.fn(async (args: { where: Where; data: Record<string, unknown> }) => {
    if (options.failAdoption) throw new Error('primary unavailable');
    const hit = rows.filter((row) => matches(row, args.where));
    hit.forEach((row) => Object.assign(row, args.data));
    return { count: hit.length };
  });
  const prisma = {
    user: { findUnique: jest.fn(async (_args: unknown) => ({ birthDate: null })) },
    securityEvent: { create: jest.fn(async (_args: unknown) => ({})) },
    userSession: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: Row = { id: `507f1f77bcf86cd7994390${String(rows.length + 21)}`, createdAt: new Date(), ...data };
        rows.push(row);
        return row;
      }),
      findMany: jest.fn(async (_args: unknown) => rows),
      findFirst: jest.fn(async ({ where }: { where: Where }) => {
        const row = rows.find((candidate) => matches(candidate, where));
        return row ? { ...row } : null;
      }),
      findUnique: jest.fn(async ({ where }: { where: Where }) => {
        const row = rows.find((candidate) => candidate.id === where.id);
        return row ? { ...row } : null;
      }),
      update: jest.fn(async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
        const row = rows.find((candidate) => candidate.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      }),
      updateMany,
    },
  };
  initSessionService(prisma as never);
  return { prisma, rows, updateMany };
}

async function open(loginMethod: SessionLoginMethod, options: { readonly failAdoption?: boolean } = {}) {
  const table = sessionTable(options);
  const session = await createSession({ userId: USER_ID, token: `tok-${loginMethod}`, requestContext: browser, loginMethod });
  const openedAt = Date.now();
  const admit = (afterMs: number, adopt?: boolean) =>
    sessionAdmissionRefusal(table.prisma as never, {
      claims: { sid: session.id },
      userId: USER_ID,
      now: new Date(openedAt + afterMs),
      ...(adopt === undefined ? {} : { adopt }),
    });
  const row = () => table.rows[0];
  return { ...table, session, openedAt, admit, row };
}

describe('une session prouvée par un lien naît courte', () => {
  it.each<SessionLoginMethod>(['magic_link', 'email_verification'])(
    '%s jamais utilisée ⇒ refusée passé la fenêtre d’adoption',
    async (loginMethod) => {
      const { row, openedAt, admit } = await open(loginMethod);

      expect((row().expiresAt as Date).getTime()).toBeLessThanOrEqual(openedAt + PROVEN_SESSION_ADOPTION_WINDOW_MS);
      expect(await admit(PROVEN_SESSION_ADOPTION_WINDOW_MS + MINUTE)).toBe('session-expired');
    }
  );

  it('la fenêtre se compte en minutes, pas en heures', () => {
    expect(PROVEN_SESSION_ADOPTION_WINDOW_MS).toBeGreaterThanOrEqual(5 * MINUTE);
    expect(PROVEN_SESSION_ADOPTION_WINDOW_MS).toBeLessThanOrEqual(15 * MINUTE);
  });

  it('une session ouverte par mot de passe garde sa durée normale dès sa naissance', async () => {
    const { row, openedAt, admit, updateMany } = await open('password');

    expect((row().expiresAt as Date).getTime()).toBeGreaterThan(openedAt + 29 * DAY);
    expect(row().adoptedExpiresAt ?? null).toBeNull();
    expect(await admit(PROVEN_SESSION_ADOPTION_WINDOW_MS + MINUTE)).toBeNull();
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe('utilisée, elle prend la durée normale', () => {
  it('le premier passage d’une porte l’adopte : elle vit au-delà de la fenêtre, avec la durée d’une connexion', async () => {
    const { row, openedAt, admit } = await open('magic_link');

    expect(await admit(MINUTE)).toBeNull();

    expect(row().adoptedExpiresAt).toBeNull();
    expect((row().expiresAt as Date).getTime()).toBeGreaterThan(openedAt + 29 * DAY);
    expect(await admit(PROVEN_SESSION_ADOPTION_WINDOW_MS + MINUTE)).toBeNull();
    expect(await admit(29 * DAY)).toBeNull();
  });

  it('une seule écriture : les passages suivants ne réécrivent rien', async () => {
    const { admit, updateMany } = await open('email_verification');

    await admit(MINUTE);
    await admit(2 * MINUTE);
    await admit(3 * MINUTE);

    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it('l’adoption est conditionnelle : elle ne touche qu’une session encore valide et encore en attente', async () => {
    const { admit, updateMany, session } = await open('magic_link');

    await admit(MINUTE);

    const where = updateMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: session.id, isValid: true, expiresAt: { gt: expect.any(Date) } });
    expect(where.adoptedExpiresAt).toBeInstanceOf(Date);
  });

  it('une adoption qui échoue n’empêche pas la requête, et se retente au passage suivant', async () => {
    const { admit, updateMany, row } = await open('magic_link', { failAdoption: true });

    expect(await admit(MINUTE)).toBeNull();
    expect(await admit(2 * MINUTE)).toBeNull();

    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(row().adoptedExpiresAt).toBeInstanceOf(Date);
  });
});

describe('une session échue n’est jamais ressuscitée par l’adoption', () => {
  it('lue vivante puis échue avant l’écriture : l’adoption ne la touche pas', async () => {
    const { prisma, row, session } = await open('magic_link');
    const attendue = row().adoptedExpiresAt as Date;
    row().expiresAt = new Date(Date.now() - MINUTE);

    await adoptProvenSession(prisma as never, { sessionId: session.id, adoptedExpiresAt: attendue, now: new Date() });

    expect((row().expiresAt as Date).getTime()).toBeLessThan(Date.now());
    expect(row().adoptedExpiresAt).toBe(attendue);
  });
});

describe('la déconnexion, qui est le refus, n’adopte pas', () => {
  it('admise sans adoption, la session reste courte', async () => {
    const { admit, updateMany, row, openedAt } = await open('magic_link');

    expect(await admit(MINUTE, false)).toBeNull();

    expect(updateMany).not.toHaveBeenCalled();
    expect((row().expiresAt as Date).getTime()).toBeLessThanOrEqual(openedAt + PROVEN_SESSION_ADOPTION_WINDOW_MS);
  });
});

describe('« se souvenir de cet appareil » ne court-circuite pas l’adoption', () => {
  it('marquée de confiance, une session prouvée reste courte tant qu’elle n’est pas adoptée', async () => {
    const { session, row, openedAt, admit } = await open('magic_link');

    expect(await markSessionTrusted(session.id, { userId: USER_ID, source: 'magic_link' })).toBe(true);

    expect(row().isTrusted).toBe(true);
    expect((row().expiresAt as Date).getTime()).toBeLessThanOrEqual(openedAt + PROVEN_SESSION_ADOPTION_WINDOW_MS);
    expect(await admit(PROVEN_SESSION_ADOPTION_WINDOW_MS + MINUTE)).toBe('session-expired');
  });

  it('adoptée ensuite, elle prend la durée d’un appareil de confiance', async () => {
    const { session, row, openedAt, admit } = await open('magic_link');

    await markSessionTrusted(session.id, { userId: USER_ID, source: 'magic_link' });
    await admit(MINUTE);

    expect((row().expiresAt as Date).getTime()).toBeGreaterThan(openedAt + 364 * DAY);
  });
});

describe('la passerelle SERT la fenêtre qu’elle applique (#10518)', () => {
  const WINDOW_SECONDS = PROVEN_SESSION_ADOPTION_WINDOW_MS / 1000;
  const bornAt = (row: Row) => (row.expiresAt as Date).getTime() - PROVEN_SESSION_ADOPTION_WINDOW_MS;

  it.each<SessionLoginMethod>(['magic_link', 'email_verification'])(
    '%s : à sa naissance, le délai servi est la fenêtre entière — lue sur la ligne, pas recopiée',
    async (loginMethod) => {
      const { session, row } = await open(loginMethod);

      expect(session.adoptBy).toEqual(row().expiresAt);
      expect(provenSessionAdoption(session, new Date(bornAt(row())))).toEqual({ adoptWithinSeconds: WINDOW_SECONDS });
    }
  );

  it('le délai servi est ce qui RESTE sur l’horloge du serveur, arrondi vers le bas', async () => {
    const { session, row } = await open('magic_link');

    expect(provenSessionAdoption(session, new Date(bornAt(row()) + 3 * MINUTE + 400))).toEqual({
      adoptWithinSeconds: WINDOW_SECONDS - 3 * 60 - 1,
    });
  });

  it('passé l’échéance : zéro, jamais un délai négatif', async () => {
    const { session, row } = await open('magic_link');

    expect(provenSessionAdoption(session, new Date(bornAt(row()) + PROVEN_SESSION_ADOPTION_WINDOW_MS + MINUTE))).toEqual({
      adoptWithinSeconds: 0,
    });
  });

  it('jamais plus que la fenêtre de la passerelle, même quand son horloge a reculé entre-temps', async () => {
    const { session, row } = await open('magic_link');

    expect(provenSessionAdoption(session, new Date(bornAt(row()) - 60 * MINUTE))).toEqual({ adoptWithinSeconds: WINDOW_SECONDS });
  });

  it('« se souvenir de cet appareil » ne l’allonge pas : l’échéance d’adoption reste celle de la ligne', async () => {
    const { session, row } = await open('magic_link');

    await markSessionTrusted(session.id, { userId: USER_ID, source: 'magic_link' });

    expect(session.adoptBy).toEqual(row().expiresAt);
  });

  it('une session ouverte par mot de passe n’attend rien : rien n’est servi', async () => {
    const { session } = await open('password');

    expect(session.adoptBy).toBeUndefined();
    expect(provenSessionAdoption(session, new Date())).toEqual({});
  });

  it.each([undefined, null, new Date(Number.NaN), '2099-01-01T00:00:00.000Z', 4102444800000])(
    'une échéance absente ou illisible (%p) ne sert rien — le client garde son repli, plus court',
    (adoptBy) => {
      expect(provenSessionAdoption({ adoptBy } as never, new Date())).toEqual({});
    }
  );

  it('un défi de second facteur sert sa propre durée de vie', () => {
    expect(provenChallengeAdoption()).toEqual({ adoptWithinSeconds: PENDING_TWO_FACTOR_TTL_MS / 1000 });
  });

  it('ce qu’un client en tire se ferme AVANT le refus de la passerelle', async () => {
    const { session, row, openedAt, admit } = await open('magic_link');
    const served = provenSessionAdoption(session, new Date(bornAt(row()))).adoptWithinSeconds;
    const clientWindow = provenAdoptionClientWindowMs('session', served);

    expect(clientWindow).toBeLessThan(PROVEN_SESSION_ADOPTION_WINDOW_MS);
    expect((row().expiresAt as Date).getTime()).toBeGreaterThan(openedAt + clientWindow);
    expect(await admit(clientWindow)).toBeNull();
  });

  it('le repli d’un client sans délai servi tient dans les VRAIES fenêtres de la passerelle, marge comprise', () => {
    expect(PROVEN_ADOPTION_CLIENT_FALLBACK_MS.session + PROVEN_ADOPTION_CLIENT_MARGIN_MS).toBeLessThanOrEqual(
      PROVEN_SESSION_ADOPTION_WINDOW_MS
    );
    expect(PROVEN_ADOPTION_CLIENT_FALLBACK_MS['second-factor'] + PROVEN_ADOPTION_CLIENT_MARGIN_MS).toBeLessThanOrEqual(
      PENDING_TWO_FACTOR_TTL_MS
    );
  });

  it('les vraies fenêtres tiennent sous la borne dure des clients : elle ne tronque rien de ce que la passerelle sert', () => {
    expect(PROVEN_SESSION_ADOPTION_WINDOW_MS).toBeLessThanOrEqual(PROVEN_ADOPTION_CLIENT_MAX_MS);
    expect(PENDING_TWO_FACTOR_TTL_MS).toBeLessThanOrEqual(PROVEN_ADOPTION_CLIENT_MAX_MS);
  });

  it('la session part vers le client SANS son échéance d’adoption — par construction, pas par le schéma', async () => {
    const { session } = await open('magic_link');

    const served = servedSession(session);

    expect(session.adoptBy).toBeInstanceOf(Date);
    expect(served).not.toHaveProperty('adoptBy');
    expect(served).toMatchObject({ id: session.id, userId: USER_ID, loginMethod: 'magic_link' });
  });
});

describe('le VRAI `validateMagicLink` remet l’échéance de la ligne à la route (#10518)', () => {
  const account = (twoFactorEnabledAt: Date | null) => ({
    id: USER_ID,
    username: 'alice',
    firstName: 'Alice',
    lastName: 'Martin',
    email: 'alice@example.com',
    phoneNumber: null,
    displayName: 'Alice Martin',
    bio: null,
    avatar: null,
    role: 'USER',
    systemLanguage: 'fr',
    regionalLanguage: 'fr',
    customDestinationLanguage: null,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
    emailReleasedAt: null,
    phoneVerifiedAt: null,
    twoFactorEnabledAt,
    userPreferences: null,
  });

  async function validate(twoFactorEnabledAt: Date | null) {
    const table = sessionTable();
    const prisma = {
      ...table.prisma,
      user: { ...table.prisma.user, update: jest.fn(async (_args: unknown) => ({ id: USER_ID })) },
      magicLinkToken: {
        findUnique: jest.fn(async (_args: unknown) => ({
          id: '507f1f77bcf86cd799439099',
          userId: USER_ID,
          usedAt: null,
          isRevoked: false,
          expiresAt: new Date(Date.now() + 5 * MINUTE),
          rememberDevice: true,
          user: account(twoFactorEnabledAt),
        })),
        updateMany: jest.fn(async (_args: unknown) => ({ count: 1 })),
      },
    };
    const cache = { get: jest.fn(async (_key: string) => null), set: jest.fn(async (_key: string) => undefined), del: jest.fn(async (_key: string) => undefined) };
    const service = new MagicLinkService(prisma as never, cache as never, {} as never, {} as never);
    initSessionService(prisma as never);
    const result = await service.validateMagicLink({ token: 'raw-token', requestContext: browser, confirmed: true });
    return { result, rows: table.rows };
  }

  it('session prouvée : `result.session.adoptBy` est l’`expiresAt` de la ligne écrite, et la route en tire le délai', async () => {
    const before = Date.now();
    const { result, rows } = await validate(null);

    expect(result.success).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0].loginMethod).toBe('magic_link');
    expect(result.session?.adoptBy).toBeInstanceOf(Date);
    expect(result.session?.adoptBy).toEqual(rows[0].expiresAt);
    expect((rows[0].expiresAt as Date).getTime()).toBeLessThanOrEqual(Date.now() + PROVEN_SESSION_ADOPTION_WINDOW_MS);
    expect(provenSessionAdoption(result.session ?? {}, new Date(before)).adoptWithinSeconds).toBe(
      PROVEN_SESSION_ADOPTION_WINDOW_MS / 1000
    );
  });

  it('compte à second facteur : aucune session, donc aucune échéance d’adoption à remettre', async () => {
    const { result, rows } = await validate(new Date('2026-02-01T00:00:00Z'));

    expect(result.requires2FA).toBe(true);
    expect(result.session).toBeUndefined();
    expect(rows).toHaveLength(0);
  });
});
