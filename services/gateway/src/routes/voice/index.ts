/**
 * Voice API Routes - Main entry point
 * All voice operations go through Gateway -> ZMQ -> Translator
 */

import { FastifyInstance } from 'fastify';
import { apiPath } from '@meeshy/shared/api/prefix';
import { AudioTranslateService } from '../../services/AudioTranslateService';
import { MessageTranslationService } from '../../services/message-translation/MessageTranslationService';
import { logger } from '../../utils/logger';
import { sendError } from '../../utils/response';
import { registerTranslationRoutes } from './translation';
import { registerAnalysisRoutes } from './analysis';

/**
 * Corps RÉEL de l'enregistrement, partagé par les deux points d'entrée de ce
 * module (#4277). `audioTranslateService: null` bascule sur un 503 EXPLICITE
 * — critère 4 : avant ce lot, `route-registration.ts` n'appelait
 * `registerVoiceRoutes` que `if (zmqClient)`, et l'ABSENCE de client ZMQ
 * faisait disparaître toute la surface `/api/v1/voice/*` en SILENCE (aucune
 * route enregistrée ⇒ 404 Fastify générique, indiscernable d'une route qui
 * n'a jamais existé). `fastify.all('/*', …)` couvre l'intégralité de ce que
 * `registerTranslationRoutes`/`registerAnalysisRoutes` déclareraient — sans
 * les énumérer ici, ce qui dériverait au premier endpoint que ces modules
 * ajoutent — et répond 503 à CHAQUE appelant, authentifié ou non : un
 * service indisponible n'est pas une question d'autorisation. Vérifié
 * empiriquement (harnais de #4277) : une route STATIQUE enregistrée dans un
 * AUTRE `server.register()` (`voiceProfileRoutes`, sous
 * `/api/v1/voice/profile`) continue de gagner sur ce catch-all — find-my-way
 * priorise un segment statique sur un segment `*`, quelle que soit
 * l'encapsulation d'origine.
 *
 * `subRoutePrefix` distingue les DEUX appelants : le point d'entrée HISTORIQUE
 * (`registerVoiceRoutes`, appel direct hors `server.register()`, aucun
 * préfixe Fastify en vigueur) doit encore préfixer LUI-MÊME chaque route,
 * comme avant ce lot ; le plugin CIBLE (`voiceRoutesPlugin`, monté via
 * `server.register(voiceRoutesPlugin, { prefix })`) laisse Fastify le faire
 * et passe une chaîne vide — repasser `subRoutePrefix` à `${prefix}` sous ce
 * second appelant additionnerait les deux préfixages.
 */
function registerVoiceRoutesBody(
  fastify: FastifyInstance,
  audioTranslateService: AudioTranslateService | null,
  translationService: MessageTranslationService | undefined,
  subRoutePrefix: string
): void {
  if (!audioTranslateService) {
    fastify.all('/*', async (_request, reply) => {
      return sendError(reply, 503, 'VOICE_SERVICE_UNAVAILABLE', {
        message: 'Voice service unavailable: translator ZMQ client not connected',
      });
    });
    logger.warn(`[VoiceRoutes] ZMQ client unavailable — ${fastify.prefix || subRoutePrefix}/* responds 503`);
    return;
  }

  // Register translation and transcription routes
  registerTranslationRoutes(fastify, audioTranslateService, translationService, subRoutePrefix);

  // Register analysis, feedback, and monitoring routes
  registerAnalysisRoutes(fastify, audioTranslateService, subRoutePrefix);

  logger.info(`[VoiceRoutes] Voice API routes registered at ${fastify.prefix || subRoutePrefix}/*`);
}

/**
 * @deprecated Point d'entrée HISTORIQUE — appel DIRECT hors encapsulation
 * Fastify (`registerVoiceRoutes(server, audioTranslateService, translationService)`,
 * jamais `server.register(...)`), conservé UNIQUEMENT pour que
 * `route-registration.ts` (hors territoire, #4277) continue de compiler ET
 * de servir `/api/v1/voice/*` sans interruption tant que son édit
 * d'enregistrement n'est pas appliqué — et pour que
 * `__tests__/unit/routes/voice-identity-spoofing.test.ts`, qui exerce ce
 * signature exact, continue de garder la faille qu'il nomme (identité
 * exclusivement depuis la session vérifiée, jamais depuis `x-user-id`).
 * SUPPRIMER cet export dès que `route-registration.ts` bascule sur
 * `voiceRoutesPlugin` et que ce test est repointé dessus.
 *
 * Ne présente PAS le 503 explicite du critère 4 : sous ce chemin,
 * l'appelant garde la responsabilité de ne PAS invoquer cette fonction sans
 * client ZMQ (le `if (zmqClient)` historique) — exactement le défaut que ce
 * lot corrige pour le SECOND point d'entrée, `voiceRoutesPlugin`.
 */
export function registerVoiceRoutes(
  fastify: FastifyInstance,
  audioTranslateService: AudioTranslateService,
  translationService?: MessageTranslationService
): void {
  registerVoiceRoutesBody(fastify, audioTranslateService, translationService, apiPath('/voice'));
}

/**
 * Options du plugin CIBLE (#4277, critère 4). `audioTranslateService: null`
 * signale l'absence de client ZMQ — la même information que le `if (zmqClient)`
 * historique de `route-registration.ts`, désormais lue À L'INTÉRIEUR du
 * plugin plutôt que de gouverner s'il est appelé DU TOUT.
 */
export type VoiceRoutesPluginOptions = {
  readonly audioTranslateService: AudioTranslateService | null;
  readonly translationService?: MessageTranslationService;
};

/**
 * Point d'entrée CIBLE (#4277, critère 4) : un plugin Fastify enregistré
 * SANS condition — `server.register(voiceRoutesPlugin, { prefix: '/api/v1/voice',
 * audioTranslateService, translationService })` — remplaçant le `if (zmqClient)`
 * qui faisait disparaître toute la surface `/api/v1/voice/*` en silence
 * (§ `registerVoiceRoutesBody`). Comme les 61 autres plugins de
 * `route-registration.ts`, le préfixe vient de Fastify (`{ prefix }`), jamais
 * d'une chaîne codée en dur dans ce module (critère 2) — `subRoutePrefix`
 * est donc vide : les routes qu'il enregistre sont RELATIVES, Fastify les
 * range sous le préfixe que `server.register()` lui a donné.
 */
export async function voiceRoutesPlugin(
  fastify: FastifyInstance,
  opts: VoiceRoutesPluginOptions
): Promise<void> {
  registerVoiceRoutesBody(fastify, opts.audioTranslateService, opts.translationService, '');
}
