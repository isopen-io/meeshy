/**
 * LA RÉPONSE DE `GET /api/v1/relations/summary` — la rangée « Mes cercles » de ma fiche (#19375).
 *
 * Un AGRÉGAT sans identité : combien de personnes j'atteins à chaque niveau, et combien de demandes
 * attendent ma réponse. Aucun identifiant, aucune présence, aucun nom.
 *
 * - `COMMUNITY` : les co-membres actifs d'une communauté active que je partage, comptes utilisables,
 *   hors blocage dans un sens ou dans l'autre, et hors personnes déjà liées à moi à Connaissance ou
 *   plus (chacune se compte UNE fois, à son niveau effectif).
 * - `ACQUAINTANCE` … `BLOOD` : la répartition exacte des liens que `GET /relations` sert.
 * - `pendingRequests` : les demandes REÇUES en attente, hors blocage.
 *
 * Public n'est pas un cercle (c'est l'absence de lien) : il ne se compte pas.
 */
import { z } from 'zod';

export const RELATION_SUMMARY_LEVELS = ['COMMUNITY', 'ACQUAINTANCE', 'FRIEND', 'CLOSE', 'BLOOD'] as const;

export type RelationSummaryLevel = (typeof RELATION_SUMMARY_LEVELS)[number];

const count = z.number().int().nonnegative();

export const relationCirclesSummarySchema = z.object({
  counts: z.object({
    COMMUNITY: count,
    ACQUAINTANCE: count,
    FRIEND: count,
    CLOSE: count,
    BLOOD: count,
  }),
  pendingRequests: count,
});

export type RelationCirclesSummary = z.infer<typeof relationCirclesSummarySchema>;
