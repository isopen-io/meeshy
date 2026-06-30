# Plan de correction — Itération 69w (Web)

> Base de départ : `main` HEAD (post-merge 67w/#1078 + 68w/#1082, resync effectué). Branche : `claude/practical-fermat-iwrmmn`.
> Scope : `apps/web` exclusivement. Thème : a11y clavier des previews de pièces jointes en zone de réponse (`role="button"` focusable mais sans `onKeyDown`).

## Objectifs (cluster cohérent — 1 fichier)
1. **Miniature image** `AttachmentPreviewReply` → ouverture lightbox au clavier (Enter/Espace).
2. **Icône PDF** → ouverture lightbox PDF au clavier.
3. **Icône texte/code** → ouverture lightbox texte au clavier.
4. **Anneau focus-visible** sur les 3 contrôles (WCAG 2.4.7), token `--primary` (parité 67w/68w).

Les `aria-label` existaient déjà (clés i18n présentes ×4 locales) → **aucune nouvelle clé**.

## Étapes
- [x] Resync branche assignée sur `main` HEAD ; confirmer 67w (#1078) + 68w (#1082) mergées.
- [x] Audit `role="button"` vs `onKeyDown` au niveau fichier → `AttachmentPreviewReply.tsx` (3 occ., 0 keydown) confirmé.
- [x] Écarter les faux positifs (vidéo = `<button>` natif ; audio/autres = `role="listitem"` non interactif).
- [x] **RED** : +6 cas clavier dans `AttachmentPreviewReply.test.tsx` (Enter/Espace image, Enter PDF, Espace texte, no-op touche neutre) → 4 échecs.
- [x] **GREEN** : helper `handleKeyActivate` + signatures `React.SyntheticEvent` + `onKeyDown` sur les 3 contrôles + focus-visible.
- [x] `jest` `AttachmentPreviewReply` → **34/34** ; dossier `attachments` → **7 suites / 236 passed**.
- [x] Docs analyse + plan + tracking.
- [ ] Commit + push + PR + CI `Quality (bun)` + merge `main`.
- [ ] Supprimer la branche après merge ; mettre à jour le pointeur autoritaire.

## Gating CI (rappel tracking)
- **Gater** sur la suite jest spécifique (`AttachmentPreviewReply`) + `Quality (bun)`.
- `Test web` : les tests d'auth périmés (ère #872) sont **soldés** — la suite `forgot-password` est de nouveau verte en local sur `main`. Ce diff ne touche aucun fichier auth/shared.
- `Test shared` : rouge pré-existant hors-web (régression zod v4, propriétaire migration shared) — non bloquant, non touché.

## Différé (candidats a11y clavier, itérations futures 70w+)
- `v2/MediaAudioCard.tsx` (overlay transcription) + `v2/MediaVideoCard.tsx` (overlays play/pause) : `<div onClick>` **sans** `role`/`tabIndex`/`onKeyDown`.
- `ui/foldable-section.tsx` + `v2/CategoryHeader.tsx` : en-têtes accordéon `<div onClick>` (ajouter `role="button"`/`aria-expanded`/clavier).
- `affiliate/share-affiliate-modal.tsx` : onglets/copie en `<div>`/`<span>` cliquables.
- `preferences.reducedMotion` applicatif (toggle quasi no-op, distinct du `prefers-reduced-motion` global #862).
- Classe résiduelle `t()||fallback` (~quelques fichiers : `app/settings`, `contacts`, `PhoneResetFlow`, `StoryViewer`, `dashboard/LastMessagePreview`).
