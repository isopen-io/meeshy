# Plan — Itération 69w (Web)

## Objectif
Combler le gap d'accessibilité clavier (WCAG 2.1.1 / 2.4.7) des 3 previews interactives de `AttachmentPreviewReply.tsx` (image, PDF, texte) : `<div role="button">` focusables au Tab mais non activables au clavier et sans focus visible.

## Étapes
1. [x] Audit transverse `<div onClick>` non-`<button>` (hors PR en vol #1084 / #1077) → cluster `AttachmentPreviewReply`.
2. [x] Vérifier anti-doublon (`ImageAttachment`/`FileAttachment` déjà faits, `MediaImageCard` = `<button>`, `MediaVideoCard:245` = backdrop).
3. [x] Ajouter helper DRY `activateOnEnterOrSpace` (Enter/Espace → `preventDefault` + action).
4. [x] Élargir signatures handlers `MouseEvent → MouseEvent | KeyboardEvent` (évite `as unknown`).
5. [x] Brancher `onKeyDown` + classes `focus-visible:ring-*` sur les 3 previews.
6. [x] Étendre les tests (+6 cas Enter/Espace/no-op pour image/PDF/texte).
7. [x] Vérifier : suite verte (34/34), répertoire attachments vert (236), 0 nouvelle erreur tsc.
8. [ ] Commit + push branche `claude/practical-fermat-jwl0pc`.
9. [ ] CI verte → merge dans `main` → MAJ tracking → suppression branche.

## Contraintes
- 0 clé i18n neuve (aria-labels existants ×4 locales).
- Aucune régression visuelle (ajout de classes `focus-visible` uniquement actives au focus clavier).
- Orthogonal aux PR en vol (create-link-modal #1084, auth #1077).

## Résultat
- 3 previews désormais activables Enter/Espace + anneau focus visible.
- `AttachmentPreviewReply.test.tsx` : 28 → 34 tests.
- Pas de nouvelle dette TS (les casts `as unknown` lightbox restent pré-existants, hors-scope).
