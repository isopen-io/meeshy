# Plan — Iteration 104i (2026-07-01)

## Objectif
Accessibilité `EditPostSheet` (feuille d'édition d'un post/réel) : **Dynamic Type** + **VoiceOver**
(placeholder média masqué + libellé bouton retrait média). iOS exclusivement (suffixe `i`).
Branche = `claude/upbeat-euler-bx683k`, base = `main` HEAD `5a47053b`.

## Diagnostic
- `EditPostSheet.swift` : 9 sites `.font(.system(size:))` → la feuille ignore Dynamic Type.
- Bouton de retrait de média sans `.accessibilityLabel` → VoiceOver lit le nom du SF Symbol.
- Glyphe placeholder de type de média (22pt, tuile fixe 64×64) non masqué.
- Couleurs déjà tokenisées (`MeeshyColors.warning/indigo300`, `theme.*`) ; i18n déjà complet.

## Étapes
1. [x] Contention extrême (29 PRs, labels 100i–103i pris) → `EditPostSheet` absent de toute PR/analyse ;
   `relative=0` sur `main` confirmé. Numéro **104i** (> labels pris).
2. [x] Migrer 8/9 sites `.system(size:)` → `MeeshyFont.relative(size, weight:)` (weight préservé).
3. [x] Garder figé le placeholder `mediaIcon` (22pt en tuile fixe 64×64) + `.accessibilityHidden(true)`.
4. [x] Ajouter `.accessibilityLabel` conditionnel (retirer/restaurer) au bouton de retrait média
   (clés inline `feed.post.edit.media.remove`/`.restore` defaultValue FR — 0 édition catalogue).
5. [x] Rédiger analyse `2026-07-01-iteration-104i.md` + ce plan.
6. [ ] Commit + push branche + PR (104i).
7. [ ] Attendre CI `iOS Tests` verte.
8. [ ] Merger dans `main` ; supprimer la branche mergée.
9. [ ] Mettre à jour `branch-tracking.md` (pointeur autoritaire iOS → 104i + ligne History).

## Risques / mitigations
- **Pas de compile locale** (SwiftUI/Linux) → gate = CI `ios-tests.yml`. Swap mécanique.
- **Clés a11y inline** : `String(localized:defaultValue:)` résout au defaultValue sans catalogue
  (pattern déjà utilisé dans tout le fichier) → 0 churn xcstrings, 0 risque.
- **Débordement glyphe** : seul le placeholder 22pt en tuile fixe reste figé.
- **Contention/collision** : numéro 104i > labels pris ; fichier absent de toute PR ouverte.
- **⚠️ Pipeline** : une régression web `Build (bun)` (dup import copyToClipboard) avait jammé main ;
  vérifiée **résolue** avant ce lot (import unique sur `main`). Gate iOS = `iOS Tests`.

## Hors-scope (différé, documenté dans l'analyse)
- Couleurs (déjà tokenisées).
- Autres surfaces Dynamic Type (`AudioEffectsPanel`, `StoryTrayView`, `FeedPostCard`,
  `OnboardingFlowView`, `MessageOverlayMenu`) → 105i+.
