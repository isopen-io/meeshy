# Plan d'implémentation — Itération 218

## Objectifs
Canonicaliser `Message.originalLanguage` au **write boundary** (funnel unique `MessagingService.handleMessage`)
via le SSOT `normalizeLanguageCode`, pour rendre la base auto-cohérente et supprimer la dépendance à la
re-normalisation défensive par site de lecture.

## Modules affectés
- `services/gateway/src/services/messaging/MessagingService.ts` — import + branche claim.
- `services/gateway/src/__tests__/unit/services/MessagingService.test.ts` — 2 tests RED→GREEN.

## Phases
1. **RED** — test « canonicalize a BCP-47 / region-tagged originalLanguage claim » : claim `'fr-FR'`
   → attendu `originalLanguage: 'fr'` (échoue tant que la branche claim renvoie verbatim). `fetch` mocké
   en rejet dur pour prouver qu'aucun round-trip détecteur n'est déclenché.
2. **GREEN** — `normalizeLanguageCode(claimedLanguage) ?? claimedLanguage` sur la branche claim.
3. **Non-régression** — test « keep an irreducible claim verbatim » (claim `'bas'` → `'bas'`), + suite
   existante (`'fr'` inchangé, vide/whitespace → détecteur).
4. **Validation** — jest `MessagingService.test.ts`, tsc gateway `--noEmit`, smoke suite gateway.

## Dépendances
Aucune. `normalizeLanguageCode` est **déjà exporté sur `main`** et déjà consommé par
`MessageTranslationService`. **Aucune dépendance** au `normalizeLanguageForDedup` de #2357 (non mergé).
Jest gateway mappe `@meeshy/shared/*` → source → pas de rebuild `dist`.

## Risques estimés
Faible — seul le chemin claim change ; repli verbatim pour les codes irréductibles (zéro perte, zéro
round-trip ajouté) ; idempotent sur les codes canoniques (tests existants intacts).

## Stratégie de rollback
Revert du commit unique. Aucune migration de données, aucune écriture de schéma. Les lignes historiques
restent couvertes par la défense au read (216).

## Critères de validation
- claim `'fr-FR'` → `message.create` `originalLanguage: 'fr'`, `fetch` non appelé.
- claim `'bas'` → `'bas'` ; claim `'fr'` → `'fr'` ; vide/whitespace → détecteur.
- tsc gateway 0 erreur ; suite `MessagingService.test.ts` verte.

## Statut de complétion
✅ **Complété** — RED prouvé (revert temporaire → `'fr-FR'` persisté, test rouge), GREEN vert,
non-régression validée sur la surface gateway testable.

## Suivi de progression
- [x] Test RED (claim `'fr-FR'` → `'fr'`) prouvé rouge (revert temporaire de la ligne claim)
- [x] Import `normalizeLanguageCode` + branche claim normalisée (GREEN)
- [x] Test non-régression irréductible (`'bas'` → `'bas'`)
- [x] tsc gateway 0 erreur + suite `MessagingService.test.ts` 67/67 verte
- [x] Non-régression : MessageTranslationService + messaging + handlers = 14 suites / 690 tests verts
- [x] Commit + push

## Améliorations futures
- Auditer les chemins d'édition (`handleMessageEdit`, `messages-advanced.ts`) et links pour la même
  canonicalisation.
- Migration idempotente optionnelle des `Message.originalLanguage` historiques région-taggés.
- Convergence write-boundary des préférences in-app (`systemLanguage` & co).
