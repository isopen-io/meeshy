/**
 * **LE BLOCAGE FERME LE PROFIL, ET IL LE FERME DANS UN SEUL SENS** (#7184).
 *
 * ## Le fait mesuré avant ce lot
 *
 * `servirProfilPublic` (`routes/users/public-profile.ts:255-259`) composait un
 * `where` qui ne portait QUE l'identité — `{ id }` ou `{ username }` — sans
 * clause `NOT`, sans condition d'amitié ni de blocage, sur une route dont
 * l'authentification est OPTIONNELLE. Le dépôt le SAVAIT et l'écrivait déjà
 * dans un témoin voisin :
 *
 * > « Un compte qui a BLOQUÉ le viewer reste joignable par
 * > `servirProfilPublic` (aucune clause `NOT`), quand
 * > `getUserByEmail`/`getUserByPhone` l'auraient exclu. »
 * > — `profile-email-phone-scope-caveat.test.ts:221-222`
 *
 * La même personne était donc masquée ou servie selon la porte empruntée, et
 * c'était la porte la plus ouverte qui ne gardait rien.
 *
 * ## LA GARDE EST ASYMÉTRIQUE, ET C'EST LE CŒUR DU LOT
 *
 * Elle ne peut pas reprendre `blockedIdsAroundViewer`
 * (`ContactDirectoryService.ts:194`), qui confond les deux directions à dessein
 * pour la recherche d'annuaire. Ici les deux sens veulent des réponses
 * CONTRAIRES :
 *
 * - **la cible m'a bloqué** ⇒ son profil ne m'est plus servi ;
 * - **je l'ai bloquée** ⇒ son profil m'est servi, RÉDUIT, parce que c'est de
 *   là qu'on débloque. Les deux clients le dessinent déjà —
 *   `ProfileBlockedCard` (`user-profile-sections.tsx:120-144`) et
 *   `UserProfileSheet.swift:165-177` : identité, « Débloquer », ni
 *   publications ni statistiques. Refuser ce profil enfermerait le lecteur
 *   dans son propre blocage.
 *
 * Le champ qui porte le second sens existe déjà : `blockedByViewer` (#7125).
 * Ce lot ajoute le PREMIER.
 *
 * ## LA GARDE NE PEUT PAS VIVRE DANS `relationAvec`
 *
 * `relationAvec` n'est appelé que si `demande.has('relation')`
 * (`person.ts:307`). Une garde posée là serait LEVABLE par l'appelant — il lui
 * suffirait d'omettre `expand`. C'est mot pour mot le piège que le code voisin
 * dénonce pour la présence, dix lignes plus haut :
 *
 * > « poser la question seulement sur `expand` ferait de l'omission du
 * > paramètre une garde, c'est-à-dire une garde qu'un appelant peut lever. »
 *
 * D'où le témoin central de ce fichier : **la requête SANS `expand`**. Sans
 * lui, une garde rangée dans `relationAvec` passerait au vert tout en laissant
 * la porte grande ouverte.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('../../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));

jest.mock('../../../../routes/users/presence-gate', () => ({
  ...(jest.requireActual('../../../../routes/users/presence-gate') as object),
  getOptionalAuth: () => async () => undefined,
}));

import { directoryPersonRoutes } from '../../../../routes/directory/person';

const PREFIXE = '/api/v1';
const CIBLE = '507f1f77bcf86cd799439011';
const LECTEUR = '507f1f77bcf86cd799439022';

/**
 * Le double distingue les DEUX directions du blocage par le `where.id` de la
 * requête, et c'est la seule chose qui les sépare : les deux interrogent
 * `user.findFirst` avec `blockedUserIds: { has: … }`.
 *
 * - `{ id: LECTEUR, blockedUserIds: { has: CIBLE } }` ⇒ « ai-je bloqué la
 *   cible ? » (`blockedByViewer`, #7125) ;
 * - `{ id: CIBLE, blockedUserIds: { has: LECTEUR } }` ⇒ « la cible m'a-t-elle
 *   bloqué ? » — la question de ce lot.
 *
 * Un double qui ne regarderait que `blockedUserIds` répondrait la même chose
 * aux deux, et le témoin d'asymétrie ne pourrait pas tomber.
 */
function prismaDouble(options: {
  readonly jaiBloque?: readonly string[];
  readonly mOntBloque?: readonly string[];
}) {
  const jaiBloque = options.jaiBloque ?? [];
  const mOntBloque = options.mOntBloque ?? [];
  return {
    user: {
      findFirst: jest.fn<any>(async (args?: any) => {
        const where = args?.where ?? {};
        if (where.blockedUserIds) {
          const cible = where.blockedUserIds.has;
          const porteur = where.id;
          if (porteur === LECTEUR) return jaiBloque.includes(cible) ? { id: LECTEUR } : null;
          if (porteur === CIBLE) return mOntBloque.includes(cible) ? { id: CIBLE } : null;
          return null;
        }
        return {
          id: CIBLE,
          username: 'cible',
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
          updatedAt: new Date('2026-08-28T00:00:00Z'),
          isActive: true,
          systemLanguage: 'fr',
          regionalLanguage: 'en',
          customDestinationLanguage: 'es',
          voiceModel: null,
        };
      }),
      findUnique: jest.fn<any>(async () => ({ createdAt: new Date('2025-01-01T00:00:00Z') })),
    },
    message: { count: jest.fn<any>(async () => 69), groupBy: jest.fn<any>(async () => []) },
    participant: { count: jest.fn<any>(async () => 12) },
    friendRequest: { count: jest.fn<any>(async () => 3), findFirst: jest.fn<any>(async () => null) },
    post: { count: jest.fn<any>(async () => 7) },
  };
}

async function monter(
  viewerId: string | null,
  options: { readonly jaiBloque?: readonly string[]; readonly mOntBloque?: readonly string[] } = {}
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prismaDouble(options) as never);
  (app as unknown as { redis?: unknown }).redis = undefined;
  /* LA FORME DE L'IDENTITÉ EST CELLE QUE `lecteurInscrit` LIT, et rien
     d'autre : `authContext.registeredUser`. Un `req.user` posé à côté paraît
     juste et ne change RIEN — mesuré au premier jet de ce fichier, où tous les
     viewers ressortaient anonymes et où `blockedByViewer` rendait `false` par
     la branche « pas de viewer », sans qu'aucune requête de blocage ne parte. */
  app.addHook('onRequest', async (req: any) => {
    req.authContext = viewerId
      ? { isAuthenticated: true, userId: viewerId, registeredUser: { id: viewerId, role: 'USER' } }
      : { isAuthenticated: false, isAnonymous: true, type: 'anonymous', userId: 'anonymous' };
  });
  await app.register(directoryPersonRoutes, { prefix: `${PREFIXE}/directory` });
  await app.ready();
  return app;
}

describe('la cible qui a BLOQUÉ le lecteur ne lui est plus servie', () => {
  /**
   * LE TÉMOIN CENTRAL — **sans `expand`**. Une garde rangée dans `relationAvec`
   * ne s'exécuterait pas sur cette requête et laisserait le profil partir
   * entier. C'est ce cas, et lui seul, qui distingue une garde POSÉE d'une
   * garde LEVABLE.
   */
  it('refuse le profil même quand la requête ne demande AUCUN expand', async () => {
    const app = await monter(LECTEUR, { mOntBloque: [LECTEUR] });

    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/directory/people/${CIBLE}` });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('le refuse aussi avec `expand=relation,stats,presence`', async () => {
    const app = await monter(LECTEUR, { mOntBloque: [LECTEUR] });

    const res = await app.inject({
      method: 'GET',
      url: `${PREFIXE}/directory/people/${CIBLE}?expand=relation,stats,presence`,
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  /**
   * ET RIEN NE PART DANS LE CORPS. Un refus qui transporterait le pseudo, le
   * nom ou l'avatar de la cible rendrait la garde décorative — c'est la forme
   * du cycle 125 : une protection se mesure sur tout ce que la charge
   * TRANSPORTE, pas sur son verdict.
   */
  it('et le corps du refus ne porte rien de la cible', async () => {
    const app = await monter(LECTEUR, { mOntBloque: [LECTEUR] });

    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/directory/people/${CIBLE}` });

    expect(res.body).not.toContain('Lovelace');
    expect(res.body).not.toContain('cible');
    await app.close();
  });
});

describe('mais celle que le LECTEUR a bloquée lui reste servie', () => {
  /**
   * L'ASYMÉTRIE. C'est de cette fiche qu'on DÉBLOQUE : les deux clients y
   * dessinent l'identité et le bouton « Débloquer » (`ProfileBlockedCard`,
   * `UserProfileSheet.swift:165-177`). La refuser enfermerait le lecteur dans
   * son propre blocage, sans chemin de retour.
   */
  it('sert le profil, pour que le bouton « Débloquer » ait une page où vivre', async () => {
    const app = await monter(LECTEUR, { jaiBloque: [CIBLE] });

    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/directory/people/${CIBLE}` });

    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('et `blockedByViewer` dit au client de la réduire (#7125)', async () => {
    const app = await monter(LECTEUR, { jaiBloque: [CIBLE] });

    const res = await app.inject({
      method: 'GET',
      url: `${PREFIXE}/directory/people/${CIBLE}?expand=relation`,
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.blockedByViewer).toBe(true);
    await app.close();
  });
});

describe('les cas où la garde ne doit RIEN faire', () => {
  /** Sans blocage, la route ne change pas de comportement — le contre-témoin
      sans lequel « tout refuser » passerait les trois cas du haut. */
  it('sert le profil quand personne n’a bloqué personne', async () => {
    const app = await monter(LECTEUR);

    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/directory/people/${CIBLE}` });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.username).toBe('cible');
    await app.close();
  });

  /**
   * LE LECTEUR ANONYME est traité EXPLICITEMENT : il n'a bloqué personne et
   * personne ne l'a bloqué, donc il voit le profil public. C'est un choix, pas
   * un oubli — et il coûte zéro requête, ce que ce témoin garde aussi en
   * mesurant qu'aucune interrogation de blocage n'est émise.
   */
  it('sert le profil à un anonyme, sans interroger le blocage', async () => {
    const app = await monter(null);

    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/directory/people/${CIBLE}` });

    expect(res.statusCode).toBe(200);
    const findFirst = (app as unknown as { prisma: { user: { findFirst: { mock: { calls: any[][] } } } } }).prisma.user
      .findFirst;
    const interrogationsDeBlocage = findFirst.mock.calls.filter((call) => call[0]?.where?.blockedUserIds);
    expect(interrogationsDeBlocage).toHaveLength(0);
    await app.close();
  });

  /** Sa PROPRE fiche ne se refuse jamais — `hasBlocked` rend déjà `false` sur
      soi-même, mais la route ne doit pas non plus payer la question. */
  it('sert sa propre fiche', async () => {
    const app = await monter(CIBLE);

    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/directory/people/${CIBLE}` });

    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
