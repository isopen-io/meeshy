import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { requirePermission } from '../../middleware/authorize';
import { sendSuccess } from '../../utils/response';
import {
  getRouteUsageCounter,
  type InstantaneUsage,
  type RouteUsageCounter,
  type SeauUsage,
} from '../../services/route-usage.service';

/**
 * `GET /api/v1/admin/route-usage` — la mesure LISIBLE SANS SSH (#4275, critere 2).
 *
 * ## Pourquoi une route, et pas un journal
 *
 * Quatre issues (#4178, #4181, #4182, #4184) exigent un compteur a zero avant
 * de retirer une adresse depreciee, et **interdisent** de le prouver par revue
 * de code client. Un `grep` dans les journaux du conteneur ne repond pas : il
 * suppose un acces SSH a la production, il ne survit pas a la rotation des
 * fichiers, et surtout il ne distingue pas « appelee zero fois » de « jamais
 * observee ». La charge de cette route, elle, le dit.
 *
 * ## S5, comme `/health/metrics`
 *
 * `canAccessAdmin` **et** `canViewAnalytics` — BIGBOSS, ADMIN, AUDIT.
 * L'intersection est celle qu'a fixee #4219 pour les internes du processus, et
 * la table de routage en est un : `canViewAnalytics` seule admettrait ANALYST,
 * qui n'a pas de panneau d'administration ; `canAccessAdmin` seule admettrait
 * MODERATOR, dont le metier est le contenu. Ce que cette route rend — la liste
 * des adresses montees et leur trafic — est une carte de la surface du service,
 * pas de la donnee produit.
 *
 * ## La charge est BORNEE, et le defaut ne sert que ce qui decide
 *
 * Mesure sur une instance saturee (24 tranches au plafond) : la table complete
 * fait **118 666 entrees, 16 Mo de JSON, 154 ms de composition**. Une lecture
 * d'administration qui coute cela est un bug au sens de ce depot, pas un
 * detail — et elle serait servie a chaque ouverture d'un onglet.
 *
 * Le defaut est donc `scope=watched` : les adresses DEPRECIEES et rien d'autre,
 * c'est-a-dire exactement ce qui decide d'un retrait, soit quelques dizaines de
 * lignes. `scope=all` reste disponible, plafonne par `limit` (500 par defaut),
 * et la charge DECLARE sa troncature (`entriesTotal`, `entriesTruncated`) :
 * une liste coupee en silence serait un faux zero de plus.
 *
 * ## La charge porte ses propres angles morts
 *
 * `blindSpots` voyage DANS la reponse. Un compteur qui rend un zero sans dire
 * ce qu'il ne voit pas est plus dangereux que pas de compteur du tout : il
 * autorise un retrait avec l'autorite d'une mesure. Le lecteur de ce zero lit
 * ses limites dans le meme document, jamais dans un fichier a cote.
 *
 * De meme `instrumented` : si le hook global n'est pas pose, la route rend un
 * tapis de zeros PARFAITEMENT credible. Le drapeau est ce qui empeche de le
 * croire.
 */

/** Combien d'entrees la table complete sert par defaut, et au plus. */
const LIMITE_DEFAUT = 500;
const LIMITE_MAX = 5_000;

type Portee = 'watched' | 'all';

type ChargeUsage = Omit<InstantaneUsage, 'entries'> & {
  readonly scope: Portee;
  readonly entriesTotal: number;
  readonly entriesTruncated: boolean;
  readonly entries: readonly SeauUsage[];
};

const seauSchema = {
  type: 'object',
  properties: {
    method: { type: 'string' },
    route: { type: 'string' },
    platform: { type: 'string' },
    version: { type: 'string' },
    count: { type: 'number' },
    lastSeenAt: { type: ['string', 'null'] },
    total: { type: 'boolean' },
  },
} as const;

const surveilleeSchema = {
  type: 'object',
  properties: {
    method: { type: 'string' },
    route: { type: 'string' },
    issue: { type: 'number' },
    matched: { type: ['boolean', 'null'] },
    count: { type: 'number' },
    lastSeenAt: { type: ['string', 'null'] },
  },
} as const;

type FiltreUsage = {
  readonly scope?: string;
  readonly route?: string;
  readonly issue?: string;
  readonly limit?: string;
};

function entierBorne(brut: string | undefined, defaut: number, max: number): number {
  const n = brut === undefined ? Number.NaN : Number.parseInt(brut, 10);
  if (!Number.isFinite(n) || n <= 0) return defaut;
  return Math.min(n, max);
}

/**
 * Compose la charge servie depuis l'instantane brut.
 *
 * `?issue=4181` implique la portee surveillee : demander le lot d'une issue et
 * recevoir la table entiere serait une reponse a une autre question.
 */
function porteeDemandee(filtre: FiltreUsage): Portee {
  const issue = filtre.issue ? Number.parseInt(filtre.issue, 10) : Number.NaN;
  return filtre.scope === 'all' && !Number.isFinite(issue) ? 'all' : 'watched';
}

function servir(instantane: InstantaneUsage, filtre: FiltreUsage): ChargeUsage {
  const issueDemandee = filtre.issue ? Number.parseInt(filtre.issue, 10) : Number.NaN;
  const issue = Number.isFinite(issueDemandee) ? issueDemandee : undefined;
  const scope: Portee = porteeDemandee(filtre);
  const limite = entierBorne(filtre.limit, LIMITE_DEFAUT, LIMITE_MAX);

  const watched = instantane.watched.filter((w) => issue === undefined || w.issue === issue);
  const adressesSurveillees = new Set(watched.map((w) => `${w.method} ${w.route}`));

  const retenues = instantane.entries.filter((e) => {
    if (scope === 'watched' && !adressesSurveillees.has(`${e.method} ${e.route}`)) return false;
    if (filtre.route && !e.route.includes(filtre.route)) return false;
    return true;
  });

  return {
    ...instantane,
    scope,
    watched,
    entriesTotal: retenues.length,
    entriesTruncated: retenues.length > limite,
    entries: retenues.slice(0, limite),
  };
}

export async function routeUsageAdminRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: FiltreUsage }>(
    '/route-usage',
    {
      onRequest: [
        fastify.authenticate,
        requirePermission('canAccessAdmin'),
        requirePermission('canViewAnalytics'),
      ],
      schema: {
        description:
          "Le compte des acces par route et par version de client sur la fenetre glissante. Aucune identite d'appelant n'est collectee.",
        tags: ['admin'],
        summary: 'Read route usage counters',
        querystring: {
          type: 'object',
          properties: {
            scope: { type: 'string', enum: ['watched', 'all'] },
            route: { type: 'string' },
            issue: { type: 'string' },
            limit: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  instrumented: { type: 'boolean' },
                  reconciled: { type: 'boolean' },
                  instanceId: { type: 'string' },
                  observingSince: { type: 'string' },
                  observedForMs: { type: 'number' },
                  windowMs: { type: 'number' },
                  sliceCount: { type: 'number' },
                  generatedAt: { type: 'string' },
                  saturated: { type: 'boolean' },
                  droppedSamples: { type: 'number' },
                  distinctKeys: { type: 'number' },
                  maxKeysPerSlice: { type: 'number' },
                  scope: { type: 'string' },
                  entriesTotal: { type: 'number' },
                  entriesTruncated: { type: 'boolean' },
                  watched: { type: 'array', items: surveilleeSchema },
                  entries: { type: 'array', items: seauSchema },
                  blindSpots: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest<{ Querystring: FiltreUsage }>, reply: FastifyReply) => {
      const filtre = request.query ?? {};
      const compteur: RouteUsageCounter = getRouteUsageCounter();
      // La portee est resolue AVANT l'instantane : elle decide de ce que le
      // compteur MATERIALISE, pas seulement de ce que la route rend ensuite.
      // Filtrer apres coup aurait laisse la composition des 118 666 entrees se
      // faire quand meme — et c'est elle qui coute les 154 ms.
      const instantane = compteur.snapshot({ portee: porteeDemandee(filtre) });
      return sendSuccess(reply, servir(instantane, filtre));
    }
  );
}
