/**
 * `?fields=` sur les trois alias de profil public (#4449).
 *
 * `GET /u/:username`, `GET /users/:id` et `GET /users/id/:id` servent le MÊME
 * profil public que `GET /directory/people/:handle`, par la MÊME fonction
 * partagée (`servirProfilPublic`, `routes/users/public-profile.ts`), que #4356
 * a rendue capable de traduire `?fields=` en `select` Prisma. Mesuré sur
 * staging (build `c39f5b4`) : elle le faisait sur la première adresse et
 * restait muette sur ces trois-là — quinze clés servies, `select` complet,
 * quel que soit `?fields=`.
 *
 * ## La cause MESURÉE, et pourquoi elle diffère de l'hypothèse de l'issue
 *
 * L'issue proposait qu'un bloc `querystring` INCOMPLET fasse retirer `fields`
 * par Ajv avant le handler (`removeAdditional`). Sondé contre la configuration
 * Ajv réelle du serveur (`server.ts` : `customOptions` ne pose ni
 * `removeAdditional` ni `additionalProperties` — seuls les défauts de
 * `@fastify/ajv-compiler` s'appliquent) : `removeAdditional: true` ne retire
 * une propriété que si son schéma porte `additionalProperties: false`
 * EXPLICITEMENT (vérifié par un faux schéma partiel ET par le schéma réel
 * de `directory/person.ts`, aucun des deux ne le pose). Et ces trois routes ne
 * déclaraient AUCUN bloc `querystring`, même incomplet — un paramètre non
 * couvert par un schéma traverse Fastify INTACT.
 *
 * La cause réelle, mesurée en ouvrant `profile-lookups.ts` : ces trois
 * handlers ne lisaient jamais `request.query`, et appelaient
 * `servirProfilPublic` sans son cinquième argument — `undefined`, qui y vaut
 * `null` par défaut, c'est-à-dire « rien demandé ». L'hypothèse de l'issue
 * était donc FAUSSE pour ce dépôt ; l'effet qu'elle prédisait était juste.
 *
 * ## Deux familles de témoins — la forme de #4356 (`sparse-fieldset-wiring.test.ts`)
 *
 * 1. **Sans paramètre, la réponse est INCHANGÉE, clé à clé.** Les listes
 *    ci-dessous ont été relevées MÉCANIQUEMENT (`publicUserSelect` moins ce
 *    que chaque schéma NE déclare PAS, plus ce que `buildPublicProfile`
 *    FABRIQUE) puis confrontées au VRAI sérialiseur (`app.inject`), jamais à
 *    un schéma lu des yeux.
 * 2. **Avec `fields`, l'assertion qui compte porte sur l'ARGUMENT Prisma**,
 *    jamais sur le corps de la réponse : un double Prisma rend ce qu'on lui
 *    dit quel que soit le `select` reçu, donc seul l'argument passé à
 *    `findFirst` prouve que la REQUÊTE a changé. La réduction de la réponse
 *    est vérifiée en plus, jamais à sa place.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Doubles : PROLONGER, jamais remplacer (règle du cycle 93) ──────────────

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }),
  },
}));

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

// Seul `getOptionalAuth` est substitué : il pose directement un authContext
// ANONYME, sans construire le vrai middleware JWT/session. `gateProfilePresence`
// reste le VRAI code — c'est la loi de présence du 2026-08-25 que ces charges
// traversent, exactement comme dans `sparse-fieldset-wiring.test.ts`.
jest.mock('../../../../routes/users/presence-gate', () => ({
  ...(jest.requireActual('../../../../routes/users/presence-gate') as object),
  getOptionalAuth: () => async (req: { authContext?: unknown }) => {
    req.authContext = {
      isAuthenticated: false,
      isAnonymous: true,
      type: 'anonymous',
      userId: 'anonymous',
    };
  },
}));

import { getUserByUsername, getUserById, getUserByIdDedicated } from '../../../../routes/users/profile-lookups';
import { publicUserSelect } from '../../../../routes/users/public-profile';

const PREFIXE = '/api/v1';
const CIBLE = '507f1f77bcf86cd799439011';
const USERNAME = 'cible';

function prismaProfil() {
  return {
    user: {
      findFirst: jest.fn<any>(async () => ({
        id: CIBLE,
        username: USERNAME,
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
      })),
    },
    // Non exercé par un viewer anonyme (`resolveForTarget` court-circuite sur
    // `!viewer`) — présent par défensivité, comme dans le harnais de #4356.
    friendRequest: { findFirst: jest.fn<any>(async () => null) },
  };
}

async function monterAlias(
  route: (f: FastifyInstance) => Promise<void>,
): Promise<{ app: FastifyInstance; prisma: ReturnType<typeof prismaProfil> }> {
  const prisma = prismaProfil();
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  await app.register(route, { prefix: PREFIXE });
  await app.ready();
  return { app, prisma };
}

/**
 * Les quinze clés servies par `/users/:id` et `/users/id/:id` SANS paramètre —
 * relevées mécaniquement : `publicUserSelect` (14 colonnes) moins `voiceModel`
 * (relation dépouillée par `withVoiceFields`) et moins `deactivatedAt` (chargé,
 * jamais déclaré par `publicProfileSchema`), plus les trois clés FABRIQUÉES
 * par `buildPublicProfile` — `voicePublic`, `isAnonymous`, `isMeeshyer`.
 * Identiques, clé pour clé, aux quinze clés mesurées sur staging par #4449
 * pour ces deux adresses (voir le corps de l'issue).
 */
const CLES_PROFIL_ID = [
  'avatar', 'banner', 'bio', 'createdAt', 'displayName', 'firstName', 'id',
  'isAnonymous', 'isMeeshyer', 'isOnline', 'lastActiveAt', 'lastName', 'role',
  'username', 'voicePublic',
].sort();

/**
 * Les treize clés servies par `/u/:username` SANS paramètre — même dérivation
 * que ci-dessus, moins `isAnonymous`/`isMeeshyer` : cette route déclare un
 * schéma de réponse INLINE, plus court, qui ne les porte pas. Écart
 * PRÉEXISTANT et documenté (`public-profile.ts` : « GET /u/:username ... en
 * servait une version plus courte ») — ce lot ne le touche pas, et ce témoin
 * fige qu'il ne bouge pas EN CORRIGEANT `fields`.
 */
const CLES_PROFIL_USERNAME = [
  'avatar', 'banner', 'bio', 'createdAt', 'displayName', 'firstName', 'id',
  'isOnline', 'lastActiveAt', 'lastName', 'role', 'username', 'voicePublic',
].sort();

type Cas = {
  readonly nom: string;
  readonly route: (f: FastifyInstance) => Promise<void>;
  readonly url: string;
  readonly clesSansParametre: readonly string[];
};

const CAS: readonly Cas[] = [
  {
    nom: 'GET /u/:username',
    route: getUserByUsername,
    url: `${PREFIXE}/u/${USERNAME}`,
    clesSansParametre: CLES_PROFIL_USERNAME,
  },
  {
    nom: 'GET /users/:id',
    route: getUserById,
    url: `${PREFIXE}/users/${CIBLE}`,
    clesSansParametre: CLES_PROFIL_ID,
  },
  {
    nom: 'GET /users/id/:id',
    route: getUserByIdDedicated,
    url: `${PREFIXE}/users/id/${CIBLE}`,
    clesSansParametre: CLES_PROFIL_ID,
  },
];

for (const cas of CAS) {
  describe(`${cas.nom} — sans paramètre, rien ne bouge (#4449)`, () => {
    it('sert exactement les clés attendues, ni une de plus ni une de moins', async () => {
      const { app } = await monterAlias(cas.route);

      const data = (await app.inject({ method: 'GET', url: cas.url })).json().data as Record<string, unknown>;

      expect(Object.keys(data).sort()).toEqual(cas.clesSansParametre);
      await app.close();
    });

    it('charge le `select` public COMPLET — par IDENTITÉ, pas par ressemblance', async () => {
      const { app, prisma } = await monterAlias(cas.route);

      await app.inject({ method: 'GET', url: cas.url });

      expect(prisma.user.findFirst.mock.calls[0][0].select).toBe(publicUserSelect);
      await app.close();
    });
  });

  describe(`${cas.nom} — \`fields\` réduit la REQUÊTE, pas seulement la réponse (#4449)`, () => {
    it('ne charge que la colonne demandée, plus les épinglées (id + matière du gate de présence)', async () => {
      const { app, prisma } = await monterAlias(cas.route);

      await app.inject({ method: 'GET', url: `${cas.url}?fields=username` });

      // L'ASSERTION QUI COMPTE (critère #4449 point 2) : l'ARGUMENT reçu par
      // Prisma, jamais le corps de la réponse — un double Prisma rend ce
      // qu'on lui dit quel que soit le `select` qu'on lui passe.
      expect(prisma.user.findFirst.mock.calls[0][0].select).toEqual({
        id: true,
        username: true,
        isOnline: true,
        lastActiveAt: true,
        deactivatedAt: true,
      });
      await app.close();
    });

    it('reproduit #4449 : `?fields=id,username` réduit AUSSI la réponse à deux clés', async () => {
      const { app, prisma } = await monterAlias(cas.route);

      const res = await app.inject({ method: 'GET', url: `${cas.url}?fields=id,username` });

      expect(prisma.user.findFirst.mock.calls[0][0].select).toEqual({
        id: true,
        username: true,
        isOnline: true,
        lastActiveAt: true,
        deactivatedAt: true,
      });
      expect(Object.keys(res.json().data).sort()).toEqual(['id', 'username']);
      await app.close();
    });

    it('un champ INCONNU ne charge aucune colonne de plus — `fields` ne peut que RESTREINDRE', async () => {
      const { app, prisma } = await monterAlias(cas.route);

      const res = await app.inject({ method: 'GET', url: `${cas.url}?fields=email,password` });

      expect(Object.keys(prisma.user.findFirst.mock.calls[0][0].select).sort()).toEqual([
        'deactivatedAt',
        'id',
        'isOnline',
        'lastActiveAt',
      ]);
      // Et la charge servie ne fabrique rien : `id` (épinglé) seul survit.
      expect(Object.keys(res.json().data)).toEqual(['id']);
      await app.close();
    });

    it('`?fields=` VIDE vaut absent — le `select` complet, par identité', async () => {
      const { app, prisma } = await monterAlias(cas.route);

      await app.inject({ method: 'GET', url: `${cas.url}?fields=` });

      expect(prisma.user.findFirst.mock.calls[0][0].select).toBe(publicUserSelect);
      await app.close();
    });
  });
}
