# Plan — Itération 61w (web)

**Surface** : `apps/web/components/attachments/AttachmentPreviewReply.tsx`
**Type** : i18n + a11y (Prisme Linguistique côté lecteurs d'écran)
**Branche** : `claude/practical-fermat-rv7kng` (base `main` HEAD `2d9c0be`, post iter-60w)

## Objectif
Internationaliser les 7 chaînes FR figées (aria-label/title/alt) du composant de previews
d'attachments dans les zones de réponse — surface orthogonale recommandée par `branch-tracking.md`
(« Next iteration 61 »), disjointe de la contention feed/reels/modales/auth des agents parallèles.

## Étapes
1. [x] Resync branche sur `main` HEAD (`git reset --hard origin/main`).
2. [x] Vérifier anti-doublon : config-modal (candidat 59w/60w) déjà soldé/mergé (#806) → pivot AttachmentPreviewReply.
3. [x] Ajouter `useI18n('attachments')` au composant.
4. [x] Réutiliser `actions.openImageNamed` (bouton image) + `gallery.fullscreen` (title vidéo) — SSOT.
5. [x] Créer le bloc `attachments.preview.*` ×4 locales (6 clés : attachmentCount/Plural, imageAlt, openVideoFullscreen, openPdf, openTextFile).
6. [x] Remplacer les 7 chaînes FR par des appels `t()` (params, pluralisation côté code).
7. [x] Mettre à jour le test (mock `useI18n` déterministe FR + params) → 29/29 verts.
8. [x] Vérifier parité JSON ×4 (diff de clés = NONE).
9. [ ] Commit + push sur `claude/practical-fermat-rv7kng`.
10. [ ] PR + merge dans `main` une fois le CI vert. Supprimer la branche. MAJ `branch-tracking.md` (62 = next).

## Contraintes respectées
- `t(key, params)` exclusif (pas de fallback string avec params) ; surfaces a11y non visibles → parité ×4 = zéro flash.
- Diff minimal (1 composant + 1 test + 4 locales additives).
- Aucune surface visible modifiée ; aucun changement de comportement, uniquement la langue des labels a11y.

## Déféré 62w+
- Couleurs off-palette `purple-*` du bouton plein écran vidéo (décision design / token Meeshy).
- `PhoneResetFlow.tsx:490` sr-only `Indicatif pays`.
