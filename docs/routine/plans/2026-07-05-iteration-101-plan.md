# Iteration 101 — Plan d'implémentation (2026-07-05)

## Objectifs
Durcir trois utilitaires **purs** de présentation/validation du frontend web contre des défauts de
frontière/edge-case prouvés (F65/F66/F67), sans changer de signature ni de contrat public. Cible
strictement disjointe des 9 PR ouvertes (reactions/calls/mentions/langue/notifications/read-status).

## Modules affectés
- `apps/web/utils/format-number.ts` — `formatCompactNumber` (F65)
- `apps/web/utils/truncate.ts` — `truncateFilename` (F66)
- `apps/web/utils/messaging-utils.ts` — `validateMessageContent` (F67)
- Tests : `apps/web/__tests__/utils/{format-number,truncate,messaging-utils}.test.ts`

## Phases d'implémentation
1. **RED** — ajouter aux 3 suites existantes les cas de frontière/edge manquants (promotion de
   palier ; nom sans extension/à extension longue/dotfile/point de queue ; longueur trimmée).
   Confirmé : 6 assertions RED.
2. **GREEN** —
   - `formatCompactNumber` : sélection du palier sur la valeur post-arrondi (miroir de
     `formatCallDataSize`).
   - `truncateFilename` : extension = point interne uniquement, budget de nom clampé, sortie bornée
     par `maxLength`, garde `maxLength ≤ 3`.
   - `validateMessageContent` : `content.trim().length > maxLength`.
3. **REFACTOR** — commentaires de contrat sur chaque garde ; aucune autre modification.

## Dépendances
Aucune (fonctions pures, pas d'I/O, pas de dépendance prisma/ML).

## Risques estimés
Très faibles. Sorties identiques pour les données nominales ; changements limités aux frontières
d'arrondi / edge-cases de nom / frange espaces-de-fin. Aucun caller impacté (signatures inchangées).

## Stratégie de rollback
Revert du commit unique ; chaque changement est additif/défensif, sans migration.

## Critères de validation
- [x] 3 suites jest = 53/53 vertes (6 nouvelles).
- [x] RED confirmé avant fix.
- [x] Aucun test préexistant n'assertait les sorties buggées (grep vide).
- [x] Signatures/exports inchangés.

## Statut de complétion
**Complété.** F65, F66, F67 implémentés et validés.

## Suivi / prochaines priorités
- F68 (décision produit) : sémantique swap des réactions post/comment.
- F65b : palier trillion optionnel pour `formatCompactNumber`.
</content>
