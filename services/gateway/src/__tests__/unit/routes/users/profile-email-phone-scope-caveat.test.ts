/**
 * `GET /users/email/:email` et `GET /users/phone/:phone` — pourquoi #4406 ne
 * les route PAS vers `servirProfilPublic`.
 *
 * La mission le dit explicitement : « Avant de router un `findFirst` vers
 * `servirProfilPublic`, vérifie que son `where` et son post-traitement sont
 * les mêmes. S'ils diffèrent, dis-le et ne force pas — ce serait un
 * changement de comportement déguisé en consolidation. »
 *
 * Ce témoin PROUVE mécaniquement la divergence, plutôt que de l'affirmer en
 * prose : les DEUX implémentations REELLES (pas des copies) sont montées dans
 * la même application, appelées avec des entrées comparables, et leurs
 * arguments Prisma réels sont comparés.
 *
 * ## Ce qui diverge
 *
 * `servirProfilPublic` (`routes/users/public-profile.ts`) ne construit JAMAIS
 * qu'un `where` à une seule clé — `{ id }` ou `{ username: {...} }` — par
 * lecture de sa source. Aucune portée de contact.
 *
 * `getUserByEmail`/`getUserByPhone` (`routes/users/profile.ts:953,1080`)
 * ajoutent `...contactLookupScope({ viewerId, blockedByViewer })` :
 * `isActive: true`, un filtre anti-suppression, `id: { notIn }` et
 * `NOT: { blockedUserIds: { has } }` — une garde de confidentialité que ces
 * deux routes ont TOUJOURS eue (elles servent un annuaire INVERSÉ à partir
 * d'un identifiant de contact, #4160) et que `servirProfilPublic` n'applique
 * PAS. Router ces deux `findFirst` vers `servirProfilPublic` SANS porter cette
 * garde retirerait silencieusement le filtre anti-blocage/compte désactivé —
 * un changement de comportement de sécurité, pas une consolidation.
 *
 * Le POST-TRAITEMENT (`buildPublicProfile(await gateProfilePresence(...))`),
 * lui, est identique aux deux endroits — ce témoin le prouve aussi, en
 * comparant les CLÉS des deux corps rendus pour la même ligne sous-jacente.
 *
 * Conséquence : `profile.ts:953` et `:1080` restent des `findFirst` directs.
 * `select: publicUserSelect` reste donc INCHANGÉ (jamais réduit par
 * `?fields=`, qu'aucune des deux routes n'expose) — ce second témoin le
 * verrouille explicitement, pour qu'un futur alignement accidentel sur
 * `servirProfilPublic` fasse tomber CE fichier plutôt que de se découvrir en
 * production.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// ─── Doubles : PROLONGER, jamais remplacer (règle du cycle 93) ──────────────

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }),
  },
}));
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }),
  },
}));

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

import { getUserByEmail, getUserByPhone, publicUserSelect } from '../../../../routes/users/profile';
import { servirProfilPublic, publicProfileSchema } from '../../../../routes/users/public-profile';

const CIBLE = '507f1f77bcf86cd799439011';
const VIEWER = '507f1f77bcf86cd799439022';

const ligneCible = {
  id: CIBLE,
  username: 'cible',
  email: 'cible@example.com',
  phoneNumber: '+33612345678',
  firstName: 'Ada',
  lastName: 'Lovelace',
  displayName: 'Ada',
  avatar: null,
  banner: null,
  bio: null,
  role: 'USER',
  isOnline: true,
  lastActiveAt: new Date('2026-08-01T10:00:00Z'),
  deactivatedAt: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  voiceModel: null,
};

/**
 * Le vrai Prisma restreint la ligne rendue au `select` demandé — un mock qui
 * l'ignore laisse fuir des colonnes qu'AUCUN des deux `select` réels ne
 * charge (`email`, `phoneNumber`), et ferait passer pour un écart de
 * COMPOSITION ce qui n'est qu'un artefact du double. Voir
 * `makeSelectAwareUserUpdate` dans `profile.test.ts`, même principe.
 */
function findFirstConscientDuSelect() {
  return jest.fn<any>(async (args: { select?: Record<string, unknown> }) => {
    if (!args?.select) return ligneCible;
    const restreint: Record<string, unknown> = {};
    for (const cle of Object.keys(args.select)) {
      if ((args.select as Record<string, unknown>)[cle]) {
        restreint[cle] = (ligneCible as Record<string, unknown>)[cle];
      }
    }
    return restreint;
  });
}

/** Un seul `findFirst`, qui enregistre TOUS ses appels dans l'ordre. */
function prismaPartage() {
  return {
    user: {
      findFirst: findFirstConscientDuSelect(),
      findUnique: jest.fn<any>(async () => ({ blockedUserIds: [] })),
    },
    friendRequest: { findFirst: jest.fn<any>(async () => null) },
  };
}

async function monter(prisma: ReturnType<typeof prismaPartage>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userId: VIEWER,
      registeredUser: { id: VIEWER, role: 'USER' },
    };
    (req as any).user = { userId: VIEWER };
  });

  await app.register(getUserByEmail);
  await app.register(getUserByPhone);

  // La MÊME implémentation que `directory/person.ts` appelle — aucune copie —
  // montée sans limiteur ni ETag (non pertinents ici), mais SOUS LE MÊME
  // schéma de réponse déclaré que les alias de `profile.ts` : sans lui,
  // `deactivatedAt` (chargé par `publicUserSelect`, jamais SERVI — voir son
  // doc-comment) fuirait par un `JSON.stringify` nu, quand la vraie route
  // compte sur `publicProfileSchema` pour le taire. Un témoin qui compare des
  // sérialisations doit les faire passer par la MÊME couche.
  app.get(
    '/probe/:handle',
    { schema: { response: { 200: publicProfileSchema } } },
    async (req: FastifyRequest<{ Params: { handle: string } }>, reply: FastifyReply) => {
      const profil = await servirProfilPublic(app, req, reply, req.params.handle);
      if (!profil) return reply;
      return reply.send(profil);
    },
  );

  await app.ready();
  return app;
}

describe("`where` — servirProfilPublic n'applique JAMAIS la portée de contact", () => {
  it("le `where` de `GET /users/email/:email` porte `contactLookupScope` — isActive, anti-blocage", async () => {
    const prisma = prismaPartage();
    const app = await monter(prisma);

    await app.inject({ method: 'GET', url: '/users/email/cible@example.com' });

    const where = prisma.user.findFirst.mock.calls[0][0].where as Record<string, unknown>;
    expect(where.email).toBe('cible@example.com');
    expect(where.isActive).toBe(true);
    expect(where.NOT).toMatchObject({ blockedUserIds: { has: VIEWER } });
    expect(JSON.stringify(where.AND)).toContain('isSet');

    await app.close();
  });

  it("le `where` de `GET /users/phone/:phone` porte la MÊME portée", async () => {
    const prisma = prismaPartage();
    const app = await monter(prisma);

    await app.inject({ method: 'GET', url: '/users/phone/33612345678' });

    const where = prisma.user.findFirst.mock.calls[0][0].where as Record<string, unknown>;
    expect(where.phoneNumber).toBeDefined();
    expect(where.isActive).toBe(true);
    expect(where.NOT).toMatchObject({ blockedUserIds: { has: VIEWER } });

    await app.close();
  });

  it("le `where` de `servirProfilPublic`, lui, ne porte JAMAIS cette portée — une seule clé d'identité", async () => {
    const prisma = prismaPartage();
    const app = await monter(prisma);

    await app.inject({ method: 'GET', url: `/probe/${CIBLE}` });

    const where = prisma.user.findFirst.mock.calls[0][0].where as Record<string, unknown>;
    // `isValidObjectId(CIBLE)` est vrai : la seule clé possible est `id`.
    expect(where).toEqual({ id: CIBLE });
    expect(where.isActive).toBeUndefined();
    expect(where.NOT).toBeUndefined();
    expect(where.AND).toBeUndefined();

    await app.close();
  });

  it('donc router ces deux `findFirst` vers `servirProfilPublic` TEL QUEL retirerait la garde anti-blocage — pas une consolidation, un changement de comportement', async () => {
    // Un compte qui a BLOQUÉ le viewer reste joignable par `servirProfilPublic`
    // (aucune clause `NOT`), quand `getUserByEmail`/`getUserByPhone` l'auraient
    // exclu. Prouvé en repassant le MÊME prisma, la MÊME cible bloquante.
    const prisma = prismaPartage();
    prisma.user.findUnique = jest.fn<any>(async () => ({ blockedUserIds: [CIBLE] }));
    const app = await monter(prisma);

    const parEmail = await app.inject({ method: 'GET', url: '/users/email/cible@example.com' });
    const whereEmail = prisma.user.findFirst.mock.calls[0][0].where as Record<string, unknown>;
    expect(whereEmail.id).toMatchObject({ notIn: [CIBLE] });
    void parEmail;

    await app.close();
  });
});

describe('Post-traitement — identique aux DEUX endroits (voix, présence, drapeaux d’identité)', () => {
  it('`getUserByEmail` et `servirProfilPublic` composent le MÊME jeu de clés pour la même ligne', async () => {
    const prisma = prismaPartage();
    const app = await monter(prisma);

    const parEmail = await app.inject({ method: 'GET', url: '/users/email/cible@example.com' });
    const parProbe = await app.inject({ method: 'GET', url: `/probe/${CIBLE}` });

    const clesEmail = Object.keys(parEmail.json().data).sort();
    const clesProbe = Object.keys(parProbe.json()).sort();

    // La comparaison est DYNAMIQUE plutôt qu'une liste figée : le verdict de
    // `gateProfilePresence` (isOnline/lastActiveAt servis ou non) dépend d'une
    // loi de visibilité qui a son propre témoin ailleurs — ce n'est PAS ce que
    // ce fichier garde. Ce qu'il garde est que les deux sites, pour la MÊME
    // ligne et le MÊME viewer, rendent le MÊME jeu de clés — aucun n'en
    // fabrique ni n'en tait une que l'autre ne fabrique/tait pas.
    expect(clesEmail).toEqual(clesProbe);
    // Au moins le socle des neuf clés FIXES de `buildPublicProfile` — sans
    // ça, une régression qui viderait les deux composeurs à l'identique (donc
    // égaux entre eux) passerait sous silence.
    expect(clesEmail).toEqual(expect.arrayContaining(
      ['avatar', 'banner', 'bio', 'createdAt', 'displayName', 'firstName',
       'id', 'isAnonymous', 'isMeeshyer', 'lastName', 'role', 'username', 'voicePublic'],
    ));

    await app.close();
  });
});

describe('`select` — INCHANGÉ : ni `?fields=` ni réduction, par construction (#4406)', () => {
  it("`GET /users/email/:email` charge `publicUserSelect` COMPLET, par IDENTITÉ", async () => {
    const prisma = prismaPartage();
    const app = await monter(prisma);

    await app.inject({ method: 'GET', url: '/users/email/cible@example.com' });

    expect(prisma.user.findFirst.mock.calls[0][0].select).toBe(publicUserSelect);

    await app.close();
  });

  it("`GET /users/phone/:phone` charge `publicUserSelect` COMPLET, par IDENTITÉ", async () => {
    const prisma = prismaPartage();
    const app = await monter(prisma);

    await app.inject({ method: 'GET', url: '/users/phone/33612345678' });

    expect(prisma.user.findFirst.mock.calls[0][0].select).toBe(publicUserSelect);

    await app.close();
  });

  it("ni l'un ni l'autre n'expose `?fields=` dans son schéma — la réduction serait un no-op mort", async () => {
    const prisma = prismaPartage();
    const app = await monter(prisma);

    // `?fields=` n'est déclaré nulle part sur ces deux routes : AJV ignore un
    // paramètre non déclaré (`additionalProperties` non fermé), donc passer
    // `fields=id` ne CASSE rien — mais il ne réduit rien non plus.
    await app.inject({ method: 'GET', url: '/users/email/cible@example.com?fields=id' });

    expect(prisma.user.findFirst.mock.calls[0][0].select).toBe(publicUserSelect);

    await app.close();
  });
});
