# Iteration 95 — Plan d'implémentation (2026-07-04)

## Objectifs
Éliminer la dérive de frontière F57 : `hasMentions` (ASCII `\w`) sous-détecte les `@DisplayName`
accentués/non-latins que `parseMentions` (Unicode `\p{L}\p{N}_`) résout pourtant. Corriger via une
**source de vérité unique** du jeu de caractères de nom + délégation des copies dupliquées.

## Modules affectés
- `packages/shared/utils/mention-parser.ts` — source de vérité (`NAME_CHAR`, frontières, `hasMentions`).
- `packages/shared/types/mention.ts` — `hasMentions` délègue au parser.
- `apps/web/services/mentions.service.ts` — `hasMentions` délègue au partagé.
- `apps/web/services/messages.service.ts` — `hasMentions` délègue au partagé.
- Tests : `packages/shared/__tests__/mention-parser.test.ts`,
  `apps/web/__tests__/services/{mentions,messages}.service.test.ts`.

## Phases d'implémentation
1. **RED** — tests de régression : `@Éric` / `@André` / cyrillique → `true` ; `@ ` (e-mail) → `false`
   (shared + 2 services web). ✅
2. **GREEN** — `NAME_CHAR` unique dans `mention-parser.ts` ; frontières + `hasMentions` en dérivent
   (`/@[\p{L}\p{N}_]/u`). ✅
3. **DRY** — `types/mention.ts` + 2 services web délèguent à la détection partagée. ✅
4. **Validation** — suites shared/web/gateway vertes ; build shared tsc. ✅

## Dépendances
Aucune (pas de nouvelle dépendance, pas de migration, pas d'événement socket).

## Risques estimés
FAIBLE — `hasMentions` s'élargit en sur-ensemble strict (aucun `true`→`false`). `parseMentions`
inchangé (même jeu de caractères, seule la provenance change). Import `types → utils`
unidirectionnel (zéro cycle, tsc vert).

## Stratégie de rollback
Revert du commit unique — restaure les 4 implémentations ASCII locales. Aucune donnée persistée
touchée.

## Critères de validation
- [x] `mention-parser` shared 25/25 ; shared complet 1256/1256.
- [x] `mentions.service` + `messages.service` web 79/79.
- [x] Gateway `MentionService` 113/113 (parseMentions inchangé).
- [x] `bun run build` shared 0 erreur.

## Statut de complétion
**COMPLÉté** — F57 résolu, 4 fichiers de production + 3 tests, source de vérité unique établie.

## Suivi de progression
- it.95 : F57 fermé. Reste F51b, F56b, F58, F59 (LOW) + F60 neuf (unifier `extractMentions`).

## Améliorations futures
Voir la section « Améliorations futures (report) » de l'analyse it.95 — F60 (unifier les 4
`extractMentions`, gérer la casse + le `-` des handles) est le prolongement DRY naturel de F57.
