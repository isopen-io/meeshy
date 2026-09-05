# Plan — Itération 288 : canonicalisation des langues cibles d'une diffusion admin

## Objectifs

Fermer le dernier résolveur de langue serveur alimenté DIRECTEMENT par un
`systemLanguage` persisté verbatim sans passer par la SSOT de canonicalisation
(`normalizeLanguageForDedup`) : le calcul des langues cibles d'une diffusion admin
(`POST /admin/broadcasts/:id/translate`). Objectif = les traductions stockées sont
keyées en codes canoniques, donc retrouvées par la livraison (elle-même canonique),
et le translator ne reçoit ni doublon régional ni cible non-NLLB.

## Modules affectés

- `services/gateway/src/jobs/broadcast-recipients.ts` — nouvelle fonction pure
  `broadcastTargetLanguages` (module des helpers PURS de diffusion).
- `services/gateway/src/routes/admin/broadcasts.ts` — appel substitué ;
  suppression du cast `(g: any)`.
- `services/gateway/src/__tests__/unit/jobs/broadcast-target-languages.test.ts` —
  nouveau (6 témoins).

## Phases d'implémentation

1. RED : écrire les 6 témoins de `broadcastTargetLanguages` (dédup régional,
   sortie canonique, exclusion source des deux côtés, rejet des vides, legacy
   `iw → he`, ordre stable). Sans implémentation, la suite échoue (import manquant).
2. GREEN : implémenter `broadcastTargetLanguages` (map `normalizeLanguageForDedup`
   → exclusion source canonique → dédup ordre-préservant).
3. Câblage : substituer dans `broadcasts.ts`, retirer `(g: any)`, ajouter l'import.

## Dépendances

- `normalizeLanguageForDedup` (`packages/shared/utils/language-normalize.ts`),
  déjà consommée par une dizaine de sites gateway.
- Type Prisma `groupBy(['systemLanguage'])` → `{ systemLanguage: string | null }`.

## Risques estimés

Très faible. Fonction pure, convergence uniquement (les variantes s'effondrent).
Aucune frontière réseau ni schéma modifié. `translateContent` conserve son filtre
interne `l !== sourceLanguage` (désormais inoffensif).

## Stratégie de rollback

Révoquer le commit : le handler retrouve son `map/filter` verbatim. Aucune
migration, aucun état persistant modifié par le lot lui-même.

## Critères de validation

- 6/6 nouveaux témoins ; RED prouvé par `git stash`.
- 203/203 sur les 26 suites `broadcast`.
- `tsc --noEmit` gateway : EXIT=0.

## Statut d'achèvement

LIVRÉ (itération 288). Analyse : `docs/routine/analyses/2026-09-04-iteration-288-broadcast-target-languages-canonical-dedup-analyse.md`.

## Améliorations futures

- Canonicaliser le `sourceLanguage` à la SOURCE (à la création d'une diffusion),
  pour que `subjects[sourceLanguage]` / `bodies[sourceLanguage]` soient aussi
  keyés en canonique — à ouvrir en issue si un second appelant de
  `translateContent` apparaît.
- Balayage des résolveurs de langue CLIENT (web/iOS/Android) restés hors SSOT
  (déjà largement couvert par les cycles 118→123 côté Prisme).
