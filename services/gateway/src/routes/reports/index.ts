import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { assessReportPriority } from '../../services/reports/reportPriority';
import { logError } from '../../utils/logger';
import { sendSuccess, sendInternalError, sendBadRequest, sendNotFound } from '../../utils/response';
import { getReportService } from '../../services/admin/report.service';
import { createCustomRateLimiter } from '../../utils/rate-limiter';
import { clientRateKey } from '../../utils/client-rate-key';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { verifierCible, type TypeSignale } from './target';

/**
 * `POST /reports` — signaler un contenu, niveau **S2** (#4155).
 *
 * ## Pourquoi cette adresse existe
 *
 * Le signalement vivait sous `/admin/reports`, avec `onRequest:
 * [fastify.authenticate]` et AUCUNE garde de rôle : c'était la seule route de
 * `routes/admin/` ouverte à un utilisateur ordinaire, et la seule route
 * d'administration que les trois clients appelaient.
 *
 * > **L'adresse mentait sur le privilège.** Toute règle d'infrastructure posée
 * > sur le préfixe `/admin` — liste blanche d'IP, WAF, journalisation
 * > renforcée — aurait CASSÉ le signalement sur les trois plateformes. Le
 * > piège ne se déclenche pas au moment où on l'écrit : il se déclenche le
 * > jour où quelqu'un durcit `/admin` en croyant ne toucher qu'à
 * > l'administration.
 *
 * ## Trois seuils, trois clés — et c'est la troisième qui compte
 *
 * `10/h user:<id>` et `30/h ip:<ip>` bornent l'APPELANT. Aucune clé par
 * appelant ne peut empêcher le harcèlement par signalement en masse d'une même
 * cible : dix comptes complices tiennent chacun leur quota. `3/h
 * target:<entityId>` borne la CIBLE, et c'est le seul seuil qui protège la
 * personne signalée.
 *
 * Le seuil par cible se compte APRÈS la vérification de la cible, sur un
 * signalement qui s'écrirait (#14110, audit M1), et il ne rend JAMAIS 429 : un
 * refus distinct dirait au signalé, qui sonde son propre identifiant, qu'on l'a
 * signalé — et trois auto-signalements refusés, comptés avant la vérification,
 * rendaient la cible insignalable. Au-delà du seuil, le signalant reçoit le même
 * accusé qu'un signalement accepté, et l'excédent n'est pas écrit.
 *
 * ## L'identité du signalant ne vient jamais du corps
 *
 * `reporterName` était lu dans `request.body` alors que `reporterId` était
 * forcé à l'identité serveur : un inscrit signait donc son signalement d'un nom
 * qu'il choisissait. `reporterId` était par ailleurs un CHAMP MORT du schéma —
 * inatteignable, mais présent dans le contrat public, donc trompeur pour la
 * prochaine main. Les deux disparaissent du corps.
 */

const creerSchema = z.object({
  reportedType: z.enum(['message', 'user', 'conversation', 'community', 'post', 'story', 'comment', 'sound']),
  reportedEntityId: z.string().min(1, "ID de l'entite requis"),
  reportType: z.enum([
    'spam',
    'inappropriate',
    'harassment',
    'violence',
    'hate_speech',
    'fake_profile',
    'impersonation',
    'other',
  ]),
  reason: z.string().max(2000).optional(),
});

/**
 * L'accusé de réception d'un signalement — SIX champs, délibérément.
 *
 * `fast-json-stringify` retire tout ce que ce schéma ne DÉCLARE pas. C'est ici
 * une décision, pas un effet de bord : la ligne `Report` porte aussi
 * `reporterId`, `reporterName`, `moderatorId`, `moderatorNotes` et
 * `actionTaken`. Renvoyer les notes d'un modérateur à la personne qui vient de
 * signaler serait une fuite ; lui renvoyer sa propre identité est du poids
 * pour rien.
 *
 * Mesuré côté clients : iOS lit `data.id` (`ReportResponseData`), Android lit
 * `data.id` (`ReportAck`), le web JETTE la valeur de retour de ses six
 * méthodes. Aucun ne perd quoi que ce soit.
 */
export const reportResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    message: { type: 'string' },
    data: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        reportedType: { type: 'string' },
        reportedEntityId: { type: 'string' },
        reportType: { type: 'string' },
        status: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  },
} as const;

/**
 * L'identité du signalant, telle que le SERVEUR la connaît.
 *
 * Un participant anonyme n'a pas de `userId` : il a l'identifiant de sa ligne
 * `Participant` (`anonymousUser.id`), et c'est par elle que sa participation à
 * une conversation se vérifie. L'ancienne route acceptait explicitement les
 * signalements anonymes ; les perdre au passage aurait été une régression
 * silencieuse.
 */
function signalant(request: FastifyRequest): { id?: string; participantId?: string; nom?: string } {
  const ctx = (request as UnifiedAuthRequest).authContext;
  return {
    id: ctx?.registeredUser?.id,
    participantId: ctx?.registeredUser?.id ? undefined : ctx?.anonymousUser?.id,
    nom: ctx?.registeredUser?.username ?? ctx?.anonymousUser?.username,
  };
}

/**
 * Le geste, écrit UNE fois — l'adresse historique `/admin/reports` le rejoue,
 * elle ne le recopie pas. Une copie porterait sa propre loi, et c'est
 * exactement ce que ce lot supprime.
 */
type Accuse = { id: string; reportedType: string; reportedEntityId: string; reportType: string; status: string; createdAt: Date };

const accuse = (reply: FastifyReply, accuseDeReception: Accuse) =>
  sendSuccess(reply, accuseDeReception, { statusCode: 201, message: 'Signalement cree avec succes' });

export async function signaler(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<unknown> {
  const cible = limiteurDeCible(fastify);
  try {
    const corps = creerSchema.parse(request.body);
    const moi = signalant(request);

    // La cible existe-t-elle, et pouvait-il l'atteindre ? Un signalement sur un
    // ObjectId inventé coûte le temps d'un modérateur à chaque fois.
    const verdict = await verifierCible({
      prisma: fastify.prisma,
      signalant: { userId: moi.id, participantId: moi.participantId },
      type: corps.reportedType as TypeSignale,
      entityId: corps.reportedEntityId,
    });

    if (!verdict.atteignable) {
      // Un seul message pour les deux refus : distinguer « n'existe pas » de
      // « pas d'accès » ferait de la route un oracle d'existence.
      return sendNotFound(reply, 'Contenu introuvable', {
        message: "Ce contenu n'existe pas ou n'est pas accessible",
      });
    }

    // #14110 (audit M1) — au-delà du seuil par cible, l'accusé est le même et
    // rien ne s'écrit : l'excédent est dédoublonné en silence.
    const surCible = await cible.consume(`target:${corps.reportedEntityId}`, 1);
    if (surCible?.retryAfter !== undefined) {
      return accuse(reply, { id: new ObjectId().toHexString(), reportedType: corps.reportedType, reportedEntityId: corps.reportedEntityId, reportType: corps.reportType, status: 'pending', createdAt: new Date() });
    }

    const priorite = await assessReportPriority(fastify.prisma, {
      reportedType: corps.reportedType,
      reportedEntityId: corps.reportedEntityId,
      reporterId: moi.id ?? null,
    });
    const rapport = await getReportService(fastify.prisma).createReport({
      reportedType: corps.reportedType,
      reportedEntityId: corps.reportedEntityId,
      reportType: corps.reportType,
      reporterId: moi.id,
      reporterName: moi.nom,
      reason: corps.reason,
      ...priorite,
    });

    // #14110 (SEC-06, MIN-04) — le signalant ne reçoit que l'accusé : jamais la
    // priorité ni ses raisons (« mineur » dirait l'âge du signalé), y compris par
    // l'alias historique `/admin/reports`, qui ne déclare aucun schéma.
    const { id, reportedType, reportedEntityId, reportType, status, createdAt } = rapport;
    return accuse(reply, { id, reportedType, reportedEntityId, reportType, status, createdAt });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendBadRequest(reply, 'Donnees invalides');
    }
    logError(fastify.log, 'Create report error:', error);
    return sendInternalError(reply, 'Erreur lors de la creation du signalement');
  }
}

const UNE_HEURE = 60 * 60 * 1000;

/**
 * Les trois limiteurs — construits ici, pour les DEUX adresses.
 *
 * Ce ne sont pas les OBJETS qui sont partagés (chaque plugin monte les siens)
 * mais les COMPTEURS : même préfixe, même clé, donc mêmes entrées Redis. C'est
 * ce qui empêche un appelant de doubler son quota en alternant entre l'adresse
 * neuve et l'alias historique. Sans Redis — tests, exécution locale — chaque
 * jeu compte pour lui : dit ici plutôt que subi en silence.
 */
export function limiteursDeSignalement(fastify: FastifyInstance) {
  const redis = fastify.redis ?? undefined;

  const parCompte = createCustomRateLimiter(
    {
      max: 10,
      windowMs: UNE_HEURE,
      keyPrefix: 'reports:u',
      message: 'Trop de signalements. Veuillez patienter avant de recommencer.',
      keyGenerator: (request) => {
        const id = (request as UnifiedAuthRequest).authContext?.registeredUser?.id;
        return id ? `user:${id}` : clientRateKey(request);
      },
    },
    redis
  );

  const parAdresse = createCustomRateLimiter(
    {
      max: 30,
      windowMs: UNE_HEURE,
      keyPrefix: 'reports:ip',
      message: 'Trop de signalements depuis ce reseau.',
      keyGenerator: clientRateKey,
    },
    redis
  );

  return [parCompte.middleware(), parAdresse.middleware()];
}

const limiteursDeCible = new WeakMap<FastifyInstance, ReturnType<typeof createCustomRateLimiter>>();

/**
 * Le seuil par CIBLE — compté DANS le geste, après la vérification de la cible
 * (audit M1). Un seul par instance, partagé par les deux adresses : sans Redis,
 * l'alias et l'adresse neuve comptent ainsi dans le même seau.
 */
function limiteurDeCible(fastify: FastifyInstance) {
  const existant = limiteursDeCible.get(fastify);
  if (existant) return existant;
  const neuf = createCustomRateLimiter({ max: 3, windowMs: UNE_HEURE, keyPrefix: 'reports:target', message: '' }, fastify.redis ?? undefined);
  limiteursDeCible.set(fastify, neuf);
  return neuf;
}

export async function reportCreationRoutes(fastify: FastifyInstance) {
  const debits = limiteursDeSignalement(fastify);

  fastify.post('/', {
    onRequest: [fastify.authenticate],
    preHandler: debits,
    schema: {
      description: 'Report a content or an account. S2 — any authenticated caller.',
      tags: ['reports'],
      summary: 'Create a report',
      response: {
        201: reportResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema,
        429: errorResponseSchema,
        500: errorResponseSchema,
      },
      security: [{ bearerAuth: [] }],
    },
  }, (request, reply) => signaler(fastify, request, reply));
}
