# Plan — Itération 69wb (Web)

> **Scope** : `apps/web` exclusivement. Base : `main` HEAD (`43f2c24`, post-#1076). Branche : `claude/practical-fermat-d16tav`.

## Objectif
Rendre opérables au clavier (Enter/Space), focusables et exposés au lecteur d'écran les **segments de la timeline d'effets audio** (`AudioEffectsTimeline`), aujourd'hui `<div onClick>` souris-only pour le *seek*. Catégorie « différé prioritaire 69w+ » (candidat nommé `audio/AudioEffectsTimeline.tsx`). **Numérotée 69wb** (69w occupé par #1084 create-link-modal en vol).

## Étapes
1. **Vérif PR en vol** (`list_pull_requests`) : #1084 (create-link-modal a11y) + #1077 (verify-phone i18n) → surface choisie orthogonale aux deux. ✅
2. **Confirmer LIVE** : `AudioEffectsTimeline` ← `AudioEffectsPanel` ← `SimpleAudioPlayer` (lecture messages audio). ✅
3. **AudioEffectsTimeline.tsx** : segment `<div>` → `role="button"` + `tabIndex={0}` + `aria-label` (réutilise la chaîne `title` déjà i18n) + `onKeyDown` Enter/Space (`preventDefault` → `onSeekToTime`) + `focus-visible:ring-inset` (parent `overflow-hidden`). ✅
4. **Test** : nouvelle suite `AudioEffectsTimeline.test.tsx` (6 cas). ✅
5. **CI vert** → merge `main` via PR → supprimer branche → MAJ branch-tracking. ⏳

## Contraintes
- 0 nouvelle clé i18n (le `title` existant — déjà `t('timeline.clickToSeek')` — sert de nom accessible).
- Pattern clavier identique à 67w/68w/69w (inline `onKeyDown`, pas de hook partagé — aucun n'existe).
- `ring-inset` obligatoire (conteneur timeline `overflow-hidden` rognerait un anneau extérieur).
- Aucune modification du comportement souris (clic `onSeekToTime` préservé, testé).
- `node_modules` absent localement → jest/tsc délégués au CI (cf. 67w/68w/69w).

## Critères d'acceptation
- [x] Segments timeline activables clavier (Enter/Space) + `role="button"` + `aria-label`.
- [x] Anneau `focus-visible` visible (inset).
- [x] Test 6 cas (Enter/Space/clic/no-op/nom accessible/vide).
- [ ] CI verte sur la PR, merge `main`, branche supprimée.

## ✅ PLAN EXÉCUTÉ (69wb — 2026-06-30)
Code + test + docs faits. Reste : merge `main` après CI verte. Suite (70w+) : audit a11y clavier restant (admin agent Badges, details-sidebar) ; `invite-user-modal` écarté (bouton interne déjà accessible) — cf. analyse 69wb § Hors-scope.
