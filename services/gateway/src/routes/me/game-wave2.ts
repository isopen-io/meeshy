/**
 * LES ROUTES DE LA VAGUE 2 DU JEU MEESHY (#9384 à #9390) — le contrat est dans
 * `@meeshy/shared/types/game-routes` (adresses, codes d'erreur) et
 * `@meeshy/shared/types/game-v2` (schémas) ; cette route n'en invente aucun.
 *
 *   POST /me/game/league/consent             consentir à la ligue publique (ou le retirer)
 *   PUT  /me/game/league/pseudonym           choisir son pseudonyme (fermé par défaut)
 *   GET  /me/game/league/week                le classement de MA semaine, sous pseudonymes
 *   GET  /me/game/league/friends             la ligue Amis
 *   POST /me/game/duo/invite                 inviter un ami au duo de la semaine
 *   POST /me/game/duo/:duoId/accept          accepter
 *   POST /me/game/duo/:duoId/abandon         décliner, annuler ou quitter
 *   POST /me/game/season/steps/:step/claim   réclamer une étape de la saison
 *   POST /me/game/season/seal                acheter le Sceau (10 Meeshes)
 *   PUT  /me/game/showcase/order             ranger les trophées
 *   GET  /me/game/privacy                    relire les réglages du jeu (#9481)
 *   PUT  /me/game/visibility                 régler qui voit la vitrine, le rang, le trésor, l'Atlas
 *   POST /me/game/prestige                   passer en Prestige au niveau 100
 *
 * Aucune ne prend d'`userId` pour AGIR : l'utilisateur est celui de
 * l'authentification. Les écritures portent un `requestId` ; un REFUS de l'état
 * du compte est un 409 avec le code du contrat, un corps mal formé un 400.
 *
 * ## Ce que les réponses de lecture ne portent jamais
 *
 * Le classement de la ligue publique est servi sous schéma STRICT
 * (`additionalProperties: false`) : un pseudonyme, un total, une zone, une
 * coupe — ni identifiant, ni avatar, ni drapeau, ni langue, ni présence
 * (conformité A-4, A-6). Un champ qu'un service ajouterait demain est supprimé
 * par le sérialiseur, pas servi.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import type { EngagementAxisKey } from '@meeshy/shared/types/engagement';
import { SHOWCASE_VISIBILITIES, orderShowcase, type ShowcaseVisibility } from '@meeshy/shared/utils/game/trophies';
import { DuoService } from '../../services/game/DuoService';
import { GameProfileService } from '../../services/game/GameProfileService';
import { LeagueService } from '../../services/game/LeagueService';
import { PrestigeService } from '../../services/game/PrestigeService';
import { SeasonService } from '../../services/game/SeasonService';
import { TrophyService } from '../../services/game/TrophyService';
import { sendBadRequest } from '../../utils/response.js';
import { CONSENT_POLICY_VERSION } from './consents';
import { gameRateLimitConfig, refusalResponse, requestIdSchema, runGameWrite, writeBody } from './game-shared';
import {
  duoAbandonResponse,
  duoAcceptResponse,
  duoInviteResponse,
  gameSettingsResponse,
  leagueConsentResponse,
  leagueFriendsResponse,
  leaguePseudonymResponse,
  leagueWeekResponse,
  prestigeResponse,
  privacyResponse,
  seasonClaimResponse,
  seasonSealResponse,
  showcaseOrderResponse,
  visibilityResponse,
} from './game-wave2-schemas';

export type GameWave2Options = {
  readonly creditPoints: (userId: string, points: number, axisKey: EngagementAxisKey) => Promise<void>;
  readonly grantFreeze: (userId: string) => Promise<void>;
};

const visibilityEnum = { type: 'string', enum: [...SHOWCASE_VISIBILITIES] } as const;

const reasonedErrors = { 401: errorResponseSchema, 409: refusalResponse, 429: errorResponseSchema, 500: errorResponseSchema } as const;

export async function meGameWave2Routes(fastify: FastifyInstance, options: GameWave2Options) {
  const prisma = fastify.prisma;
  const profile = new GameProfileService(prisma);
  const trophies = new TrophyService(prisma, { profile });
  const seasons = new SeasonService(prisma, { creditPoints: options.creditPoints, grantFreeze: options.grantFreeze, trophies });
  const duo = new DuoService(prisma, { creditPoints: options.creditPoints, seasons });
  const league = new LeagueService(prisma, { profile });
  const prestige = new PrestigeService(prisma, { trophies });

  const read = <T>(request: FastifyRequest, reply: FastifyReply, work: (userId: string) => Promise<T>) => runGameWrite(request, reply, work);

  // --- La ligue ---

  fastify.post(
    '/game/league/consent',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: gameRateLimitConfig('league-consent', 10, false) },
      schema: {
        description:
          'Consent à la ligue PUBLIQUE, ou retire son consentement (#9384). Daté par le serveur, avec la version de la notice, ' +
          'dans la MÊME colonne que `PUT /me/consents/public-league`. Le retrait emporte pseudonyme et appartenance.',
        tags: ['me', 'game'],
        summary: 'Consent to the public league',
        body: {
          type: 'object',
          required: ['requestId', 'consent'],
          properties: { requestId: requestIdSchema, consent: { type: 'boolean' }, pseudonym: { type: 'string', minLength: 3, maxLength: 20 } },
          additionalProperties: false,
        },
        response: { 200: leagueConsentResponse, ...reasonedErrors },
      },
    },
    (request: FastifyRequest<{ Body: { requestId: string; consent: boolean; pseudonym?: string } }>, reply: FastifyReply) =>
      runGameWrite(request, reply, (userId) =>
        league.setConsent({
          userId,
          consent: request.body.consent,
          policyVersion: CONSENT_POLICY_VERSION,
          ...(request.body.pseudonym !== undefined ? { pseudonym: request.body.pseudonym } : {}),
        }),
      ),
  );

  fastify.put(
    '/game/league/pseudonym',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: gameRateLimitConfig('league-pseudonym', 10, false) },
      schema: {
        description:
          'Choisit son pseudonyme de ligue (#9384). FERMÉ par défaut tant que la modération (filtre, signalement, recours) n\'est pas ouverte : ' +
          'LEAGUE_PSEUDONYM_FORBIDDEN. Ouvert, forme, noms réservés et identité de la personne sont refusés avec leur motif.',
        tags: ['me', 'game'],
        summary: 'Choose the league pseudonym',
        body: {
          type: 'object',
          required: ['requestId', 'pseudonym'],
          properties: { requestId: requestIdSchema, pseudonym: { type: 'string', minLength: 1, maxLength: 64 } },
          additionalProperties: false,
        },
        response: { 200: leaguePseudonymResponse, ...reasonedErrors },
      },
    },
    (request: FastifyRequest<{ Body: { requestId: string; pseudonym: string } }>, reply: FastifyReply) =>
      runGameWrite(request, reply, async (userId) => ({ pseudonym: await league.choosePseudonym(userId, request.body.pseudonym) })),
  );

  fastify.get(
    '/game/league/week',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: gameRateLimitConfig('league-week', 60, false) },
      schema: {
        description:
          'Le classement de MA semaine dans la ligue publique, sous pseudonymes (#9384). Les autres membres sont servis sur l\'instantané ' +
          'de 4 h du groupe, jamais en direct ; seule ma ligne est vive. Aucun identifiant, avatar, drapeau, langue ni présence.',
        tags: ['me', 'game'],
        summary: 'Get my league week',
        response: { 200: leagueWeekResponse, ...reasonedErrors },
      },
    },
    (request: FastifyRequest, reply: FastifyReply) => read(request, reply, (userId) => league.weekBoard(userId)),
  );

  fastify.get(
    '/game/league/friends',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: gameRateLimitConfig('league-friends', 60, false) },
      schema: {
        description:
          'La ligue Amis (#9385) : le même classement, restreint à moi et à mes amis acceptés. Un ami qui a coupé sa présence se montre ' +
          'à la fin de la veille ; l\'opposition, « Jeu masqué » et les blocages retirent un compte.',
        tags: ['me', 'game'],
        summary: 'Get my friends league',
        response: { 200: leagueFriendsResponse, ...reasonedErrors },
      },
    },
    (request: FastifyRequest, reply: FastifyReply) => read(request, reply, (userId) => league.friendsBoard(userId)),
  );

  // --- Le duo ---

  fastify.post(
    '/game/duo/invite',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: gameRateLimitConfig('duo-invite', 10, false) },
      schema: {
        description: 'Invite un ami accepté, non bloqué, à la mission en duo de la semaine (#9385). Une invitation par semaine ; rejouée, elle rend `already-invited`.',
        tags: ['me', 'game'],
        summary: 'Invite a friend to the weekly duo',
        body: {
          type: 'object',
          required: ['requestId', 'friendId'],
          properties: { requestId: requestIdSchema, friendId: { type: 'string', minLength: 1, maxLength: 64 } },
          additionalProperties: false,
        },
        response: { 200: duoInviteResponse, ...reasonedErrors },
      },
    },
    (request: FastifyRequest<{ Body: { requestId: string; friendId: string } }>, reply: FastifyReply) =>
      runGameWrite(request, reply, (userId) => duo.invite({ inviterId: userId, friendId: request.body.friendId })),
  );

  const duoParams = { type: 'object', required: ['duoId'], properties: { duoId: { type: 'string', minLength: 1, maxLength: 64 } } } as const;

  fastify.post(
    '/game/duo/:duoId/accept',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: gameRateLimitConfig('duo-accept', 20, false) },
      schema: {
        description: 'Accepte une invitation au duo (#9385) — seul l\'invité le peut.',
        tags: ['me', 'game'],
        summary: 'Accept a duo invitation',
        params: duoParams,
        body: writeBody,
        response: { 200: duoAcceptResponse, ...reasonedErrors },
      },
    },
    (request: FastifyRequest<{ Params: { duoId: string } }>, reply: FastifyReply) =>
      runGameWrite(request, reply, (userId) => duo.accept({ userId, duoId: request.params.duoId })),
  );

  fastify.post(
    '/game/duo/:duoId/abandon',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: gameRateLimitConfig('duo-abandon', 20, false) },
      schema: {
        description: 'Décline, annule ou quitte le duo, à tout moment (#9385).',
        tags: ['me', 'game'],
        summary: 'Leave or decline a duo',
        params: duoParams,
        body: writeBody,
        response: { 200: duoAbandonResponse, ...reasonedErrors },
      },
    },
    (request: FastifyRequest<{ Params: { duoId: string } }>, reply: FastifyReply) =>
      runGameWrite(request, reply, (userId) => duo.abandon({ userId, duoId: request.params.duoId })),
  );

  // --- La saison ---

  fastify.post(
    '/game/season/steps/:step/claim',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: gameRateLimitConfig('season-claim', 30, true) },
      schema: {
        description: 'Réclame la récompense d\'une étape de la saison (#9386). Une fois par étape ; rejouée, `already-claimed`. L\'étape 40 règle la saison.',
        tags: ['me', 'game'],
        summary: 'Claim a season step',
        params: { type: 'object', required: ['step'], properties: { step: { type: 'integer' } } },
        body: writeBody,
        response: { 200: seasonClaimResponse, ...reasonedErrors },
      },
    },
    (request: FastifyRequest<{ Params: { step: number } }>, reply: FastifyReply) =>
      runGameWrite(request, reply, (userId) => seasons.claim({ userId, step: Number(request.params.step) })),
  );

  fastify.post(
    '/game/season/seal',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: gameRateLimitConfig('season-seal', 10, true) },
      schema: {
        description: 'Achète le Sceau de la saison : 10 Meeshes, une fois (#9386). Idempotent par `requestId`. Hors argent.',
        tags: ['me', 'game'],
        summary: 'Buy the season seal',
        body: writeBody,
        response: { 200: seasonSealResponse, ...reasonedErrors },
      },
    },
    (request: FastifyRequest<{ Body: { requestId: string } }>, reply: FastifyReply) =>
      runGameWrite(request, reply, (userId) => seasons.buySeal({ userId, requestId: request.body.requestId })),
  );

  // --- La vitrine et la visibilité ---

  fastify.put(
    '/game/showcase/order',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: gameRateLimitConfig('showcase-order', 20, false) },
      schema: {
        description: 'Range les trophées de la vitrine (#9387). Seules les clés POSSÉDÉES sont gardées, sans doublon.',
        tags: ['me', 'game'],
        summary: 'Order the trophy showcase',
        body: {
          type: 'object',
          required: ['requestId', 'order'],
          properties: { requestId: requestIdSchema, order: { type: 'array', maxItems: 200, items: { type: 'string', minLength: 1, maxLength: 96 } } },
          additionalProperties: false,
        },
        response: { 200: showcaseOrderResponse, ...reasonedErrors },
      },
    },
    (request: FastifyRequest<{ Body: { requestId: string; order: string[] } }>, reply: FastifyReply) =>
      runGameWrite(request, reply, async (userId) => {
        const owned = await trophies.list(userId);
        const kept = await profile.setShowcaseOrder(userId, request.body.order, owned.map((t) => t.key));
        return { order: [...orderShowcase({ owned, order: kept })] };
      }),
  );

  fastify.put(
    '/game/visibility',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: gameRateLimitConfig('visibility', 20, false) },
      schema: {
        description:
          'Règle qui voit la vitrine, le rang, le trésor et l\'Atlas (#9387, #9388) : « tout le monde », « amis » ou « moi seul ». ' +
          'Le serveur plafonne selon « caché de la recherche » et « Jeu masqué ». Au moins un réglage.',
        tags: ['me', 'game'],
        summary: 'Set the game visibility',
        body: {
          type: 'object',
          required: ['requestId'],
          properties: { requestId: requestIdSchema, showcase: visibilityEnum, rank: visibilityEnum, treasury: visibilityEnum, atlas: visibilityEnum },
          additionalProperties: false,
        },
        response: { 200: visibilityResponse, 400: errorResponseSchema, ...reasonedErrors },
      },
    },
    async (
      request: FastifyRequest<{ Body: { requestId: string; showcase?: ShowcaseVisibility; rank?: ShowcaseVisibility; treasury?: ShowcaseVisibility; atlas?: ShowcaseVisibility } }>,
      reply: FastifyReply,
    ) => {
      const { requestId: _requestId, ...patch } = request.body;
      if (Object.keys(patch).length === 0) return sendBadRequest(reply, 'VISIBILITY_EMPTY', { message: 'au moins un réglage' });
      return runGameWrite(request, reply, async (userId) => ({ visibility: await profile.updateVisibility(userId, patch) }));
    },
  );

  fastify.put(
    '/game/privacy',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: gameRateLimitConfig('privacy', 20, false) },
      schema: {
        description:
          '« Jeu masqué » et l\'opposition à la ligue Amis (#9384, #9385) : deux interrupteurs, à tout moment. « Jeu masqué » sort le compte des ' +
          'classements, des vitrines et des listes (la vitrine retombe à « moi seul ») ; l\'opposition le retire de la ligue Amis des autres. Au moins un.',
        tags: ['me', 'game'],
        summary: 'Hide the game or opt out of the friends league',
        body: {
          type: 'object',
          required: ['requestId'],
          properties: { requestId: requestIdSchema, gameHidden: { type: 'boolean' }, friendsLeagueOptOut: { type: 'boolean' } },
          additionalProperties: false,
        },
        response: { 200: privacyResponse, 400: errorResponseSchema, ...reasonedErrors },
      },
    },
    async (request: FastifyRequest<{ Body: { requestId: string; gameHidden?: boolean; friendsLeagueOptOut?: boolean } }>, reply: FastifyReply) => {
      const { gameHidden, friendsLeagueOptOut } = request.body;
      if (gameHidden === undefined && friendsLeagueOptOut === undefined) return sendBadRequest(reply, 'PRIVACY_EMPTY', { message: 'au moins un interrupteur' });
      return runGameWrite(request, reply, async (userId) => {
        if (gameHidden !== undefined) await profile.setGameHidden(userId, gameHidden);
        if (friendsLeagueOptOut !== undefined) await profile.setFriendsLeagueOptOut(userId, friendsLeagueOptOut);
        const settings = await profile.settings(userId);
        return { gameHidden: settings.gameHidden, friendsLeagueOptOut: settings.friendsLeagueOptedOut };
      });
    },
  );

  fastify.get(
    '/game/privacy',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: gameRateLimitConfig('settings', 60, false) },
      schema: {
        description:
          "Les réglages du jeu de l'authentifié, LUS depuis le serveur (#9481) : « Jeu masqué », l'opposition à la ligue Amis et les quatre " +
          "visibilités (vitrine, rang, trésor, Atlas). Les clients relisent cet état ; ils ne gardent plus la dernière réponse `PUT`.",
        tags: ['me', 'game'],
        summary: 'Get the game settings',
        response: { 200: gameSettingsResponse, ...reasonedErrors },
      },
    },
    (request: FastifyRequest, reply: FastifyReply) =>
      read(request, reply, async (userId) => {
        const settings = await profile.settings(userId);
        return { gameHidden: settings.gameHidden, friendsLeagueOptOut: settings.friendsLeagueOptedOut, visibility: settings.visibility };
      }),
  );

  // --- Le Prestige ---

  fastify.post(
    '/game/prestige',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: gameRateLimitConfig('prestige', 5, true) },
      schema: {
        description:
          'Passe en Prestige au niveau 100 (#9389) : une étoile de plus, score et niveau à 1, +1000 de Gloire, trophée numéroté. ' +
          'Ferme les ligues et le duo jusqu\'à ce qu\'ils soient rouverts. Idempotent par `requestId`.',
        tags: ['me', 'game'],
        summary: 'Pass to the next Prestige',
        body: writeBody,
        response: { 200: prestigeResponse, ...reasonedErrors },
      },
    },
    (request: FastifyRequest<{ Body: { requestId: string } }>, reply: FastifyReply) =>
      runGameWrite(request, reply, (userId) => prestige.pass({ userId, requestId: request.body.requestId })),
  );
}

