/**
 * Les schémas de RÉPONSE des lectures de signalements (#8876, § 6.4).
 *
 * Fermés : chaque champ servi est NOMMÉ — les quatorze colonnes que la table
 * `Report` servait déjà, plus les trois que l'enrichissement ajoute
 * (`reporter`, `moderator`, `reportedEntity`). Un champ que la route sert sans
 * le déclarer ici disparaît au sérialiseur, et les témoins d'`app.inject()` le
 * voient ; un schéma ouvert aurait laissé partir toute colonne future.
 */
import { OBJECT_ID_PATTERN } from '@meeshy/shared/utils/object-id';
import { namePreviewSchema } from './conversation-name-preview';
import {
  booleen,
  chaine,
  chaineNulle,
  dateNulle,
  dateServie,
  enveloppe,
  enveloppePaginee,
  paginationSchema,
  personneSchema,
} from './oversight-schemas';

const reportedEntitySchema = {
  type: 'object',
  nullable: true,
  properties: {
    type: chaine,
    id: chaine,
    label: chaineNulle,
    owner: personneSchema,
    excerpt: chaineNulle,
    isProtected: booleen,
    deleted: booleen,
    conversation: {
      type: 'object',
      nullable: true,
      properties: { id: chaine, title: chaineNulle },
    },
    ...namePreviewSchema,
  },
} as const;

export const reportItemSchema = {
  type: 'object',
  properties: {
    id: chaine,
    reportedType: chaine,
    reportedEntityId: chaine,
    reporterId: chaineNulle,
    reporterName: chaineNulle,
    reportType: chaine,
    reason: chaineNulle,
    status: chaine,
    moderatorId: chaineNulle,
    moderatorNotes: chaineNulle,
    actionTaken: chaineNulle,
    createdAt: dateServie,
    updatedAt: dateServie,
    resolvedAt: dateNulle,
    reporter: personneSchema,
    moderator: personneSchema,
    reportedEntity: reportedEntitySchema,
  },
} as const;

/**
 * Les schémas du code 200 — déclarés ICI, posés en littéral dans la route
 * (`response: { 200: …, ...reponsesEnErreur }`) : le balayage des schémas de
 * réponse absents (`response-schema-closure-guard`) lit un bloc `response:`
 * littéral, et un identifiant importé lui ferait croire que la route n'en
 * déclare aucun.
 */

/** `GET /admin/reports` — la forme V2 imbriquée : `data: { reports, pagination }`. */
export const reportsListSuccess = enveloppe({
  type: 'object',
  properties: { reports: { type: 'array', items: reportItemSchema }, pagination: paginationSchema },
});

/** `GET /admin/reports/:id` — un signalement. */
export const reportOneSuccess = enveloppe(reportItemSchema);

/** `GET /admin/reports/recent`, `GET /admin/reports/moderator/mine` — `data` est un tableau. */
export const reportArraySuccess = enveloppe({ type: 'array', items: reportItemSchema });

/** `GET /admin/reports/entity/:type/:id` — liste paginée V1. */
export const reportPageSuccess = enveloppePaginee(reportItemSchema);

/**
 * Les deux filtres NEUFS de la liste. `sortBy`/`sortOrder` ne sont volontairement
 * PAS déclarés : une clé hors liste retombe sur `createdAt` (régime de
 * `resolveReportSortKey`), et un schéma qui les refuserait en 400 confirmerait
 * au client l'existence de la colonne qu'il vient de nommer.
 */
export const reportsListQuerystring = {
  type: 'object',
  properties: {
    reportedEntityId: {
      type: 'string',
      pattern: OBJECT_ID_PATTERN,
      description: "Les signalements qui visent cette entité, quel qu'en soit le genre",
    },
    assigned: {
      type: 'string',
      enum: ['me', 'none'],
      description: "`me` : pris en charge par l'appelant ; `none` : sans modérateur assigné",
    },
  },
} as const;
