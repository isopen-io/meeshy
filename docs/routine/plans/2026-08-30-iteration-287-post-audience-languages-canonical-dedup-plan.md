# Plan — Itération 287 : canonicaliser les langues cibles d'audience de story

## Objectifs
Faire passer `PostService.audienceLanguages` par la SSOT de canonicalisation
`normalizeLanguageForDedup` avant le filtre de langue-pivot NLLB et la
déduplication, à parité avec le reste des résolveurs de langue serveur.

## Modules affectés
- `services/gateway/src/services/PostService.ts` — import + fonction pure
  `audienceLanguages`.
- `services/gateway/src/__tests__/unit/services/PostService.audienceLanguages.test.ts`
  — 4 témoins de canonicalisation.

## Phases
1. **RED** — ajouter les 4 témoins (dédup variantes, pivot région-tagué, codes
   canoniques émis, cap 10 réelles). Prouver l'échec contre l'implémentation
   verbatim.
2. **GREEN** — importer `normalizeLanguageForDedup`, canonicaliser chaque code
   avant filtre + `Set`.
3. **Validation** — suite ciblée + `PostService|reelAffinity` + `tsc --noEmit`.

## Dépendances
Aucune. `normalizeLanguageForDedup` existe déjà (`packages/shared`).

## Risques estimés
Très faibles. Fonction pure, convergence seule (aucune cible nouvelle pour une
langue réelle). Aucune frontière réseau ni schéma modifié.

## Stratégie de rollback
Revert du commit unique — fonction pure isolée, sans état ni migration.

## Critères de validation
- 4 témoins RED contre l'ancien code, 8/8 GREEN après correctif.
- 312/312 sur `PostService|reelAffinity`.
- Gateway `tsc --noEmit` EXIT=0.

## Statut
COMPLÉTÉ — implémenté, validé, prêt à merger sur `main`.

## Améliorations futures
Balayer les autres agrégateurs de `systemLanguage` verbatim restants
(`broadcast-recipients.ts`, `admin/broadcasts.ts` `where.systemLanguage.in`,
`admin/languages.ts` groupBy) : ceux-ci comparent en base contre des valeurs
persistées verbatim et pourraient sous-compter/rater des variantes régionales —
à instruire au prochain passage (nature différente : requête Prisma, pas cœur pur).
