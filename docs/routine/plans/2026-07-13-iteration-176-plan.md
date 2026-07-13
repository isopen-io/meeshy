# Iteration 176 — Plan : `getTranslationFromJSON` insensible à la casse

## Objectifs
1. Aligner `getTranslationFromJSON` sur la résolution de langue insensible à la
   casse déjà appliquée par `transformTranslationsToArray` (même module, même
   structure `Message.translations`).
2. Préserver le fast path exact-case (coût + comportement historique) et retourner
   la clé stockée comme représentation canonique.
3. Résorber la dette tracée depuis iter-130 sans élargir le périmètre.

## Modules affectés
- `services/gateway/src/utils/translation-transformer.ts` (implémentation).
- `services/gateway/src/utils/__tests__/translation-transformer.test.ts` (régression).

## Phases
- [x] **P1 — RED** : 4 tests (upper-case request, store upper-case, préférence
      exact-case, no-match). 2 rouges avant fix confirmés.
- [x] **P2 — GREEN** : garde `!translations` + fast path exact + fallback
      `Object.keys().find(toLowerCase)` ; `matchedKey` canonique pour `id` /
      `targetLanguage`.
- [x] **P3 — Validation** : 2 suites transformer (38/38) ; `tsc --noEmit`
      (0 erreur sur le fichier).

## Dépendances
Aucune (fonction pure, signature et type de retour `MessageTranslation` inchangés ;
aucun consommateur de production impacté).

## Risques & rollback
- Risque : régression sur un appel exact-case. Mitigé par le fast path conservé +
  les 34 tests existants restés verts.
- Risque : collision de casse (deux clés différant seulement par la casse). Levé
  par la préférence au match exact (test dédié).
- Rollback : `git revert` du commit (fichier + test isolés).

## Critères de validation
- [x] 2 tests rouges avant / verts après (+ 2 tests confirmant l'invariance des
      comportements exact-case et no-match).
- [x] Zéro régression sur les 2 suites transformer.
- [x] Aucune nouvelle erreur `tsc`.

## Statut : COMPLET

## Améliorations futures
- Si un consommateur de production de `getTranslationFromJSON` apparaît, envisager
  d'exposer un helper de normalisation de code langue partagé avec `@meeshy/shared`.
- Dette restante tracée : `sanitizeFileName` overlong sans extension (F69).
