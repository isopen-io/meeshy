# Plan de correction — Itération 69wb (Web)

> **⚠️ Renuméroté `69wb`** : `69w` pris par un agent parallèle (`create-link-modal`, déjà sur `main`). Cible orthogonale conservée.
> **Scope** : `apps/web` exclusivement. Base `main` HEAD `b0c15b6` (rebasé sur `main` post-collision). Branche `claude/practical-fermat-47i08j`.
> **Thème** : a11y clavier (WCAG 2.1.1 / 2.4.7) des previews d'attachments en zone de réponse.

## Problème
`components/attachments/AttachmentPreviewReply.tsx` : 3 previews (`image`, `PDF`, `texte`) en `role="button"` + `tabIndex={0}`
sans `onKeyDown` → focusables mais inactivables au clavier ; aucun anneau de focus visible.

## Correctifs
1. **Découplage action/événement** : extraire `openImageLightbox` / `openPdfLightbox` / `openTextLightbox` (actions pures
   `useCallback`), réutilisées par souris **et** clavier.
2. **Helper `activateOnKey(action)`** : `Enter`/`Espace` → `preventDefault` + `stopPropagation` + `action()` (idiome 68w).
3. **`onKeyDown={activateOnKey(...)}`** sur les 3 éléments interactifs.
4. **`focus-visible:ring-2 ring-purple-500 ring-offset-1` + `outline-none`** sur les 3 éléments (focus visible, charte violette).
5. **Tests** : +4 cas d'activation réelle (Enter/Espace/no-op) dans le bloc `Accessibility`.

## Vérifications (faites)
- [x] `AttachmentPreviewReply.test.tsx` : 33 passed (29 → 33).
- [x] Répertoire `attachments/` : 7 suites / 235 passed / 3 skipped.
- [x] Aucune nouvelle clé i18n (aria-labels préexistants ×4 locales).
- [x] Audit transverse : 0 `role="button"` sans `onKeyDown` (même fichier) restant sur `components/`+`app/`.

## Statut : ✅ CORRIGÉ & TESTÉ — prêt merge `main`.
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
