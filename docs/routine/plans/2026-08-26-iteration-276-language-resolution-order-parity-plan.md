# Plan — Itération 276 — Témoin de parité pour l'ORDRE de résolution du Prisme

## Objectifs

Fermer le trou « N miroirs, zéro témoin de parité » sur l'ORDRE de résolution du
Prisme Linguistique — l'invariant central, gardé jusqu'ici par des doc-comments
jumeaux uniquement sur les trois clients.

## Modules affectés

- **Ajout** : `packages/shared/__tests__/language-resolution-order-parity.test.ts`
  (test seul).
- **Lus (non modifiés)** :
  - `packages/shared/utils/conversation-helpers.ts` (SSOT — `resolveUserLanguage`,
    `resolveUserLanguagesOrdered`).
  - `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift`
    (`preferredContentLanguages`).
  - `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/lang/LanguageResolver.kt`
    (`preferredContentLanguages`, `resolveUserLanguage`, `FALLBACK_LANGUAGE`).

## Phases

1. **Lecture des trois miroirs** — confirmer que l'ordre et le repli sont
   identiques sur TS/Swift/Kotlin. ✅ (fait : ordre canonique confirmé, repli
   `'fr'` partout.)
2. **Écrire le témoin** — ordre de référence LU du SSOT par comportement ;
   extraction Swift/Kotlin par la FORME de chaque appel. ✅
3. **Prouver le VERT** sur l'état d'origine (7/7). ✅
4. **Prouver le ROUGE** — une mutation par miroir, chacune sur son test. ✅
   (a révélé et corrigé un extracteur qui visait la mauvaise fonction Kotlin.)
5. **Non-régression** — suite `packages/shared` complète. ✅ (113/2691.)

## Dépendances

Aucune. Le SSOT TS est déjà en place ; les miroirs existent.

## Risques estimés

- **Fragilité d'extraction** : mitigée par des messages d'erreur explicites (« la
  déclaration a-t-elle changé de forme ? ») et des contre-épreuves de taille
  (`order.length === 4` avant `toEqual`) qui empêchent une extraction vide de
  « passer ».
- **Faux négatif** : écarté par la preuve du ROUGE sur les cinq mutations nommées.

## Stratégie de rollback

Supprimer le fichier de test. Zéro impact production.

## Critères de validation

Voir l'analyse (§ Critères de validation) : 7/7 vert à l'origine, cinq
contre-épreuves rouges chacune sur son test, suite `packages/shared` verte.

## Statut de complétion

**LIVRÉ.** Témoin ajouté, vert à l'origine, rouge sous chaque mutation nommée,
suite complète verte.

## Améliorations futures

- **Familles adjacentes non gardées par un témoin de parité** (à ouvrir en
  issue si le trou se confirme) :
  - `autoTranslateTargetLanguages` (systemLanguage + regionalLanguage) — la
    fonction `LanguageResolver.autoTranslateTargets` (Kotlin, ligne ~80) et ses
    jumeaux TS/Swift : ordre et composition à comparer.
  - La CANONICALISATION au point de comparaison (`canon` iOS
    `resolvedLastMessagePreview`, `normalizeForDedup` TS `resolvePrismTranslation`,
    équivalent Kotlin) — les trois normalisent avant de matcher les clés de
    traduction ; leur ÉQUIVALENCE (mêmes règles de casse/région) n'est pas
    attestée bout à bout.
