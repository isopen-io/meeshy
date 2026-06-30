# Plan de correction — Itération 69w (Web)

> Base de départ : `main` HEAD (`769f55a`, post-merge 67w/#1078 + 68w/#1082 ; resync effectué). Branche : `claude/practical-fermat-c2m1kd`.
> Scope : `apps/web` exclusivement. Thème : résidus **i18n + a11y** des **overlays d'appel vidéo** (continuité 68w).

## Objectifs (cluster cohérent)
1. **CallInfoOverlay** — localiser + pluraliser le compteur de participants (`participant(s)` codé en dur EN → `calls.info.participant(s)` ×4, interpolation `{count}`).
2. **AudioEffectsPanel** — nommer les 2 boutons info icône-seule (`aria-label={t('moreInfo')}`, `audioEffects.moreInfo` ×4) + corriger `type="button"` manquant.

## Étapes
- [x] Resync branche assignée sur `main` HEAD ; confirmer 67w (#1078) + 68w (#1082) mergées.
- [x] Audit web (sous-agent) → candidats i18n/a11y/dark-mode ; tri des faux positifs (`text-white` sur flux vidéo = intentionnel).
- [x] Vérifier dé-duplication via `branch-tracking.md` (constats absents des lignes `✅`, présents en « Différé » 68w).
- [x] Vérifier l'existence des clés plurielles `{count}` + l'interpolation de `t` (`use-i18n.ts`).
- [x] **RED** : MAJ `CallInfoOverlay.test.tsx` (singulier/pluriel) + NOUVEAU `AudioEffectsPanel.test.tsx` (nom accessible boutons info) → 3 échecs.
- [x] **GREEN** : ajout clés locales ×4 (`calls.info.*`, `audioEffects.moreInfo`) + 2 composants → tests verts.
- [x] Non-régression : `jest` répertoire `video-calls` = **7 suites / 26 tests passed**.
- [x] Docs analyse + plan + tracking + pointeur autoritaire.
- [ ] Commit + push + PR + CI `Quality (bun)` + merge `main`.
- [ ] Supprimer la branche après merge ; mettre à jour le pointeur autoritaire.

## Gating CI (rappel tracking)
- **Gater** sur la suite jest spécifique aux fichiers modifiés (`video-calls`) + `Quality (bun)`.
- `Test web` / `Test shared` : historiquement non fiables sur certaines ères (rouges pré-existants hors-web) ; ce diff (i18n + a11y video-calls, aucun fichier auth/shared touché) ne les régresse pas.

## Différé (candidats, itérations futures)
- a11y clavier transverse HORS `video-calls`/`conversations` : `<div onClick>`/`role="button"` sans `onKeyDown`/`focus-visible`.
- Classe résiduelle `t()||fallback` : `PhoneResetFlow.tsx` (56 occ), `StoryViewer`, `app/settings`, `contacts`, `dashboard/LastMessagePreview`.
- `preferences.reducedMotion` applicatif (toggle quasi no-op) — distinct du `prefers-reduced-motion` global déjà câblé (#862).
