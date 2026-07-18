# Plan — Iteration 179 : normaliser les codes de `getUserLanguageChoices` (SSOT Prisme)

## Objectifs
Aligner `getUserLanguageChoices` sur la source unique de normalisation du Prisme
(`normalizeLanguageCode`), pour que les codes de langue offerts à la composition
(web) soient la forme canonique employée par la traduction et
`resolveUserPreferredLanguage`.

## Modules affectés
- `apps/web/utils/user-language-preferences.ts` (fix cœur)
- `apps/web/components/common/bubble-stream-page.tsx` (alignement consommateur)
- `apps/web/__tests__/utils/user-language-preferences.test.ts` (tests)
- `ConversationLayout.tsx` : aucun changement (déjà conforme, corrigé par ricochet)

## Phases
1. **RED** — +6 tests de normalisation & meta système (échouent sur la base).
2. **GREEN cœur** — `normalizeLanguageCode(...)` pour system/regional/custom codes ;
   dedup sur forme normalisée ; meta système raw→normalisé avec fallback 🇫🇷.
3. **GREEN consommateur** — état initial + reset de `selectedInputLanguage` sur des
   codes normalisés/garantis présents dans `languageChoices`.
4. **Validation** — jest ciblé + répertoire utils complet + tsc diff.

## Dépendances
- `packages/shared` construit (`dist/`) + client Prisma généré (parité jest web).
- `normalizeLanguageCode` déjà exporté par `@meeshy/shared/utils/language-normalize`.

## Risques estimés
Faible : type de retour inchangé, comportement préservé pour tous les codes déjà
canoniques ; convergence stricte pour les tags région/script/casse.

## Stratégie de rollback
Revert du commit unique — aucune migration de données, aucun changement de schéma
ni de contrat API.

## Critères de validation
- 47/47 (util) · 65/65 (consommateurs) · 994/994 (utils) verts.
- 0 nouvelle erreur `tsc` sur les fichiers touchés.

## Statut de complétion
**Terminé.** Cœur + alignement consommateur implémentés, testés, validés.

## Suivi de progression / améliorations futures
- Backlog 178 : `displayName` blank-leak (`messages.ts`) via resolver partagé.
- Envisager un lint-rule interdisant `?.toLowerCase()` sur un code de langue hors
  `normalizeLanguageCode`, pour prévenir la réintroduction de la divergence.
