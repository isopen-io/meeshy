import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { zodIssueSchema } from '../../utils/zod-issue-schema';

/**
 * Le 400 des DEUX écritures à scène de `core.ts` — `POST /posts` et
 * `PUT /posts/:postId` (#4648, cinquième site du lot #4487).
 *
 * ## Pourquoi une déclaration là où rien n'était supprimé
 *
 * `sendError` étale `details` à la RACINE de l'enveloppe, et
 * fast-json-stringify retire toute propriété qu'un schéma de réponse ne
 * déclare pas. Ces deux routes n'en déclaraient AUCUN : Fastify ne compile de
 * sérialiseur que pour les codes de statut déclarés, donc `issues` et
 * `mediaIds` passaient — par ABSENCE de contrat, jamais par contrat.
 *
 * C'est le piège armé du cycle 84, dans sa forme la plus banale : le premier
 * lot qui déclare un `400` sur ces routes — geste que la doctrine du dépôt
 * RÉCLAME — supprimait les deux champs sans qu'aucune ligne ne le dise. Une
 * non-suppression accidentelle se garde par une déclaration, pas par le
 * silence.
 *
 * ## Pourquoi un fichier voisin plutôt qu'une déclaration en ligne
 *
 * `me/consents.ts` déclare la sienne sur place, et c'est la forme reprise ici
 * — on ÉTEND `errorResponseSchema`, on ne le recopie pas : le recopier
 * figerait l'enveloppe au jour de ce lot. Seule l'ADRESSE change :
 * `routes/posts/core.ts` est à 970 lignes sur les 1000 du cliquet #4284, qui
 * n'accorde aucune exemption. La règle de la directive 2026-08-28 est
 * explicite — « on extrait d'abord, on ajoute ensuite ».
 *
 * ## Le SUPERSET, pas le champ du jour
 *
 * Déclarer partiellement une enveloppe qui passait ENTIÈRE tronque ce qui
 * marchait. Les deux routes servent DEUX champs d'appoint sur un 400 :
 * `issues` (refus `CANVAS_INVALID`) et `mediaIds` (refus `MEDIA_NOT_CLAIMED`,
 * la ligne voisine du même fichier). Les deux sont ici, et le témoin
 * `posts-canvas-refusal-contract.test.ts` les exerce tous les deux — le second
 * n'a rien à voir avec ce lot, et c'est exactement pour cela qu'il y est.
 *
 * Le 426 des deux refus de version (`minVersion`, `storeUrl`) n'est PAS
 * déclaré : ce lot ne touche pas ce code de statut, donc rien n'y compile de
 * sérialiseur et rien n'y est supprimé. Le déclarer serait un lot à lui, avec
 * son propre inventaire de champs servis.
 *
 * ## La forme des issues est celle de Zod, mesurée
 *
 * `zodIssueSchema` est le site UNIQUE de cette forme (#4487) : les quatre
 * autres routes qui refusent un corps la servent déjà, et une seconde forme
 * divergerait de la première au premier changement de version de Zod. Elle
 * décrit ce que `issuesServies()` PRODUIT — `path` en tableau de CHAÎNES,
 * `keys` pour une clé refusée par `.strict()` — jamais la `ZodIssue` brute,
 * dont `path` porte les index NUMÉRIQUES d'un tableau et dont les clés
 * internes (`expected`, `received`, `origin`) n'ont aucun contrat.
 */
export const postWriteBadRequestSchema = {
  ...errorResponseSchema,
  properties: {
    ...errorResponseSchema.properties,
    issues: {
      type: 'array',
      items: zodIssueSchema,
      description: 'Une entrée par champ du canvas refusé par CanvasV3Schema (borné à 5)',
    },
    mediaIds: {
      type: 'array',
      items: { type: 'string' },
      description: 'Les médias que le canvas référence hors du jeu réclamé par `mediaIds`',
    },
  },
} as const;
