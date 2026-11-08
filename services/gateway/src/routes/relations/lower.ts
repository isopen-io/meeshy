import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { RELATION_LEVELS, type RelationLevel } from '@meeshy/shared/types/relation';
import { appVersionFloorPreHandler } from '../../middleware/app-version-floor';
import { sendBadRequest, sendInternalError, sendSuccess } from '../../utils/response';
import { logError } from '../../utils/logger';
import { captureNowPlayingBefore, refreshNowPlayingAfter } from '../../services/nowPlaying/nowPlayingDeps';
import { captureSharedLocationBefore, refreshSharedLocationAfter } from '../../services/sharedLocation/sharedLocationDeps';
import { rejudgeTogetherAfter } from '../../services/together/togetherDeps';
import { relationIoOf } from '../../socketio/relationEvents';
import { cooldownEnd, lowerGrant } from '../../services/relations/userRelationWriter';
import { loadRelationLink } from '../../services/relations/relationLinks';
import { thresholdsNow } from '../../services/relations/relationRequestGate';
import { forgetFriends } from '../../services/relations/relationCaches';
import { withdrawListeningCategoryBetween, withdrawRitualSharesBetween } from '../../services/relations/ritualShareWithdrawal';
import { asseoirLienHerite, retirerDemandesAuDessus } from '../directory/friend-request-withdraw';
import { errorResponses, otherUserOf, relationLimiter, relationLinkSchema, sendCoded, userIdParams } from './shared';

/** Les niveaux qu'un accord peut prendre : Communauté est calculée et Atome réservé, aucun ne s'accorde. */
const GRANTABLE: readonly string[] = RELATION_LEVELS.filter((level) => level !== 'COMMUNITY');

const corpsNiveau = z.object({ level: z.unknown() });

/**
 * BAISSER ou SORTIR (#13933) : `POST /relations/:userId/level { level }`. Je baisse MON
 * accord — jamais celui de l'autre —, vers un niveau plus bas que celui que j'accorde.
 *
 * SILENCIEUX (RG-07) : ni notification, ni événement, vers personne. L'autre n'en
 * apprend rien ; il se voit seulement retenir de redemander une montée pendant 30 jours
 * (RG-08), et ne l'apprend qu'en essayant. Monter par cette porte est refusé : une
 * montée est une demande, qui veut l'accord de l'autre.
 *
 * Sous le Sang, les partages consentis au rituel s'éteignent des DEUX côtés (#14910) :
 * le consentement a été donné à un Sang, pas au cercle d'en dessous.
 */
export function registerRelationLower(fastify: FastifyInstance): void {
  const writes = relationLimiter(fastify, 'rel:level:u', 30);

  fastify.post<{ Params: { userId: string } }>('/:userId/level', {
    onRequest: [fastify.authenticate],
    preHandler: [appVersionFloorPreHandler, writes.middleware()],
    schema: {
      description: 'Lower my grant towards one person, or leave their circle (PUBLIC). Silent: nobody is notified.',
      tags: ['relations'],
      summary: 'Lower or leave a circle',
      params: userIdParams,
      body: { type: 'object', required: ['level'], properties: { level: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { success: { type: 'boolean' }, data: relationLinkSchema } }, ...errorResponses },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    try {
      const otherId = otherUserOf(request, reply);
      if (otherId === null) return reply;
      const viewerId = request.user!.userId;

      const { level } = corpsNiveau.parse(request.body);
      if (typeof level !== 'string' || !GRANTABLE.includes(level)) {
        return sendCoded(reply, 400, 'Niveau illisible', 'RELATION_LEVEL_INVALID');
      }

      const now = new Date();
      const ecoute = { prisma: fastify.prisma, io: relationIoOf(fastify), report: (error: unknown) => logError(fastify.log, 'Now playing not refreshed after drop:', error) };
      const ecouteAvant = await captureNowPlayingBefore(ecoute, { userA: viewerId, userB: otherId });
      const position = { ...ecoute, report: (error: unknown) => logError(fastify.log, 'Shared location not refreshed after drop:', error) };
      const positionAvant = await captureSharedLocationBefore(position, { userA: viewerId, userB: otherId });
      await asseoirLienHerite(fastify.prisma, viewerId, otherId, now);
      const outcome = await lowerGrant(fastify.prisma, {
        actorId: viewerId, otherId, level: level as RelationLevel, at: now, cooldownUntil: cooldownEnd(now, thresholdsNow().cooldownDays),
      });
      if (outcome === 'not-a-drop') return sendCoded(reply, 400, 'Une montée se demande', 'RELATION_NOT_A_DROP');

      // Rejouée sans condition : une baisse écrite dont le retrait aurait échoué se solde au rejeu.
      await retirerDemandesAuDessus(fastify.prisma, viewerId, otherId);
      if (outcome === 'lowered') await forgetFriends(fastify, [viewerId, otherId]);
      const link = await loadRelationLink(fastify.prisma, { viewerId, otherId, now });
      // Rejoué sans condition, comme le retrait des demandes : sous le Sang, aucun partage du rituel ne reste allumé.
      if (link.effectiveLevel !== 'BLOOD') await withdrawRitualSharesBetween(fastify.prisma, { actorId: viewerId, otherId, at: now });
      // #13934 — sous Proche, l'accord de la catégorie d'écoute s'éteint aussi ; l'écoute s'efface chez qui la voyait.
      if (link.effectiveLevel !== 'BLOOD' && link.effectiveLevel !== 'CLOSE') {
        await withdrawListeningCategoryBetween(fastify.prisma, { actorId: viewerId, otherId, at: now });
      }
      await refreshNowPlayingAfter(ecoute, { userA: viewerId, userB: otherId, before: ecouteAvant });
      // #16980 — sous Ami, la position partagée s'efface chez qui la voyait.
      await refreshSharedLocationAfter(position, { userA: viewerId, userB: otherId, before: positionAvant });
      // #17012 — sous Proche, la séance « ensemble » de la paire s'arrête chez les deux.
      await rejudgeTogetherAfter(ecoute, { userA: viewerId, userB: otherId });
      return sendSuccess(reply, link);
    } catch (error) {
      if (error instanceof z.ZodError) return sendBadRequest(reply, 'Donnees invalides');
      logError(fastify.log, 'Lower relation error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
