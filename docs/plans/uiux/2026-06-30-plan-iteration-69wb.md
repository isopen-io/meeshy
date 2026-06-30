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
