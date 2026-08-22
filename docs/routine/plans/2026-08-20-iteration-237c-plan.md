# Plan d'itération 237 — Propager « un message système forme son propre groupe » au mode Focal

## Objectifs
Éliminer le jumeau non corrigé du défaut de regroupement 2026-08-20 : `isFirstInFocalGroup`
(`apps/web/components/conversations/focal/focal-row-utils.ts`) doit refuser de regrouper une bulle
derrière un message SYSTÈME, en déléguant au résolveur canonique
`apps/web/utils/message-grouping.ts` (Single Source of Truth).

## Modules affectés
- `apps/web/components/conversations/focal/focal-row-utils.ts` — délégation + import.
- `apps/web/components/conversations/focal/__tests__/focal-row-utils.test.ts` — 2 cas système
  ajoutés ; 3 cas existants complétés du champ `messageSource` (désormais requis par la signature
  `Pick<Message, 'senderId' | 'messageSource'>`).

## Phases d'implémentation
1. **RED** — ajouter au test les deux cas système (bulle après avis système même auteur ⇒ ouvre ;
   avis système lui-même ⇒ ouvre). Échoue contre l'ancien corps.
2. **GREEN** — réécrire `isFirstInFocalGroup` pour déléguer à `computeIsFirstInGroup`, en adaptant
   la forme plate `senderId` → `{ sender: { id }, messageSource }`. Élargir la signature à
   `Pick<Message, 'senderId' | 'messageSource'>`.
3. **Ajustement de type** — `messageSource` étant REQUIS sur `Message` (`conversation.ts:120`),
   compléter les cas de test existants.
4. **REFACTOR** — la règle vit désormais en un seul endroit ; le prédicat Focal n'est qu'un
   adaptateur documenté.

## Dépendances
Aucune nouvelle dépendance. Réutilise `@/utils/message-grouping` (fichier web pur, sans import
partagé), créé par le commit `368b936f`.

## Risques estimés
Très faible — fonction pure, changement additif (n'ouvre que des groupes), court-circuit `script`
et branche « même auteur » préservés. Pas de contrat réseau, pas de schéma, pas de miroir
iOS/Android pour cet util Focal web.

## Stratégie de rollback
Revert du commit unique — deux fichiers, sans migration ni changement de contrat.

## Critères de validation
- [x] RED prouvé avant correctif (ancien corps ⇒ `false` sur le cas système).
- [x] `focal-row-utils.test.ts` : 24/24.
- [x] Suites Focal complètes : 14 suites / 145 tests verts.
- [x] `tsc` : 0 erreur introduite dans les fichiers touchés.

## Statut de complétion
**Complet.** Correctif + tests posés, suites vertes.

## Suivi de progression
- Itération 234 : `transcriptionSegmentSchema` `endMs >= startMs` (gate partagé).
- Itération 235 : type de page cache infini débarrassé de l'enveloppe delta morte.
- Itération 236 : `socketTranscriptionSegmentSchema` `endMs >= startMs` (jumeau live).
- **Itération 237 : mode Focal converge sur la loi de regroupement corrigée (message système =
  groupe propre).**

## Améliorations futures
1. Loi partagée `river-lanes.ts` `isGroupHead` — extension cross-plateforme (type d'entrée +
   miroir iOS), à traiter avec toolchain iOS.
2. Monotonie de collection : `transcriptionSegmentSchema[]`, `KeyframeSchema.time[]`.
