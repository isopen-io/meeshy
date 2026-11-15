import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isSeasonThemeKey } from '@meeshy/shared/utils/game/season-schedule';
import { SEASON_THEME_KEYS, type SeasonThemeKey } from '@meeshy/shared/utils/game/season';
import { isDayKey } from '@meeshy/shared/utils/game/day-prng';
import type { LlmProvider } from '../llm/types';
import { proposeSeason } from '../game/season-proposal';
import { INTERNAL_TOKEN_HEADER, checkInternalToken, slidingWindowLimiter } from './internal-auth';

/**
 * #10234 — la porte interne de la proposition de saison (appelée par la gateway).
 *
 * Un seul verbe, et il ne fait que PROPOSER : la réponse est un brouillon que l'admin relit
 * et valide ailleurs. Aucune base, aucune file, aucune programmation n'est atteignable d'ici
 * (témoin : `__tests__/game/season-proposal-non-writing.test.ts`).
 *
 * 200 `{ success, data: { themeKey, stepPoints, copy, model } }` — validé par la loi partagée ;
 * 400 body invalide ; 422 `proposal-invalid` (deux sorties refusées) ; 503 `llm-unavailable`.
 *
 * Ouverte à la SEULE passerelle : en-tête `x-meeshy-internal-token` = `AGENT_INTERNAL_TOKEN` (temps constant) —
 * 401 sinon ; secret non configuré côté agent ⇒ 503 `internal-auth-not-configured` pour tout appel (fermée).
 * Débit borné (le LLM coûte) : `SEASON_PROPOSAL_RATE_LIMIT` par minute, 429 au-delà ; un refus 401 ne le consomme pas.
 */

export const SEASON_PROPOSAL_RATE_LIMIT = { max: 10, windowMs: 60_000 } as const;

export type SeasonProposalRouteOptions = {
  /** `env.AGENT_INTERNAL_TOKEN` ; absent ou trop court, la route refuse tout. */
  readonly internalToken: string | undefined;
  readonly rateLimit?: { readonly max: number; readonly windowMs: number };
};

const bodySchema = z.strictObject({
  number: z.number().int().min(1),
  startDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isDayKey, 'invalid day'),
  themeKey: z.string().refine(isSeasonThemeKey, 'unknown theme'),
  previousThemes: z.array(z.string().min(1).max(64)).max(8),
  brief: z.string().max(500).nullable(),
});

export async function seasonProposalRoutes(fastify: FastifyInstance, llm: LlmProvider, options: SeasonProposalRouteOptions) {
  const limiter = slidingWindowLimiter(options.rateLimit ?? SEASON_PROPOSAL_RATE_LIMIT);
  fastify.post('/api/agent/game/season-proposal', async (req, reply) => {
    const verdict = checkInternalToken(options.internalToken, req.headers[INTERNAL_TOKEN_HEADER]);
    if (verdict === 'not-configured') {
      fastify.log.error('[SeasonProposal] AGENT_INTERNAL_TOKEN absent ou trop court : route fermée');
      return reply.status(503).send({ success: false, message: 'internal-auth-not-configured' });
    }
    if (verdict === 'refused') return reply.status(401).send({ success: false, message: 'unauthorized' });
    if (!limiter.take()) return reply.status(429).send({ success: false, message: 'rate-limited' });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, message: 'Invalid payload', errors: z.flattenError(parsed.error) });
    }

    const body = parsed.data;
    const result = await proposeSeason(
      llm,
      {
        number: body.number,
        startDay: body.startDay,
        themeKey: body.themeKey as SeasonThemeKey,
        previousThemes: body.previousThemes,
        brief: body.brief,
      },
      SEASON_THEME_KEYS,
    );

    if (!result.ok) {
      if (result.reason === 'llm-unavailable') {
        fastify.log.warn('[SeasonProposal] LLM unavailable');
        return reply.status(503).send({ success: false, message: 'llm-unavailable' });
      }
      fastify.log.warn('[SeasonProposal] proposal refused by the season law twice');
      return reply.status(422).send({ success: false, message: 'proposal-invalid' });
    }

    return { success: true, data: result.proposal };
  });
}
