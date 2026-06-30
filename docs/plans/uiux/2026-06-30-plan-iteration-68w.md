# Plan de correction — Itération 68w (Web)

> Base de départ : `main` HEAD (`eee8f29`, post-merge 67w/#1078 ; resync effectué). Branche : `claude/practical-fermat-ug7okk`.
> Scope : `apps/web` exclusivement. Thème : a11y clavier des contrôles plein écran d'appel vidéo (`<div onClick>` souris-only).

## Objectifs (cluster cohérent)
1. **Bouton plein écran overlay** `DraggableParticipantOverlay` → activable/focusable au clavier + nom accessible.
2. **Vidéo distante principale** `VideoCallInterface` → toggle plein écran activable au clavier + nom accessible.

Les deux partagent la clé i18n existante `calls.stream.fullscreen` (en/fr/es/pt déjà traduites) → **aucune nouvelle clé**.

## Étapes
- [x] Resync branche assignée sur `main` HEAD ; confirmer 67w mergée (#1078).
- [x] Audit `<div onClick>` de `components/video-calls/` → 2 contrôles plein écran souris-only confirmés (file:line).
- [x] Écarter les faux positifs (`AudioEffectsPanel`/`Carousel` `onClose` = `<button>` natifs).
- [x] **RED/GREEN** : test `DraggableParticipantOverlay.test.tsx` (clavier) + cas clavier `VideoCallInterface.test.tsx`.
- [x] **GREEN** : 2 corrections composants (`role`/`tabIndex`/`aria-label`/`onKeyDown` Enter/Space/`focus-visible`).
- [x] `jest` répertoire `video-calls` → **6 suites / 23 tests passed**.
- [x] Docs analyse + plan + tracking.
- [ ] Commit + push + PR + CI `Quality (bun)` + merge `main`.
- [ ] Supprimer la branche après merge ; mettre à jour le pointeur autoritaire.

## Gating CI (rappel tracking)
- **Gater** sur la suite jest spécifique aux fichiers modifiés (`video-calls`) + `Quality (bun)`.
- `Test web` / `Test shared` : historiquement non fiables sur certaines ères (rouges pré-existants hors-web) ; vérifier qu'ils ne régressent pas *par ce diff* (ils ne le font pas — scope a11y/video-calls, aucun fichier auth/shared touché).

## Différé (candidats a11y clavier, itérations futures)
- Audit transverse hors `video-calls`/`conversations` : `role="button"` custom ou `<div onClick>` sans `onKeyDown`/`focus-visible`.
- `preferences.reducedMotion` applicatif (toggle quasi no-op) — distinct du `prefers-reduced-motion` global déjà câblé (#862).
- Classe résiduelle `t()||fallback` (~quelques fichiers : `app/settings`, `contacts`, `PhoneResetFlow`, `StoryViewer`, `dashboard/LastMessagePreview`).
