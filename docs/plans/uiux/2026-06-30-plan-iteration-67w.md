# Plan de correction — Itération 67w (Web)

> Base de départ : `main` HEAD (resync avant démarrage). Branche : `claude/practical-fermat-wjf1f7`.
> Scope : `apps/web` exclusivement. Thème : a11y clavier + correction ARIA (liste conversations + tuile audio).

## Objectifs (cluster cohérent)
1. **Bug ARIA dupliqué** `AudioEffectTile` → conserver le label accessible descriptif.
2. **Clavier en-tête de section** `ConversationGroup` → activable/focusable au clavier + `aria-expanded`.
3. **Focus-visible** `ConversationItem` → anneau de focus pour la navigation clavier (WCAG 2.4.7).
4. **Clé de liste stable** `HeaderTagsBar` → `key={tag}`.

## Étapes
- [x] Audit clavier/ARIA (sous-agent Explore) → cluster liste de conversations + AudioEffectTile.
- [x] Vérifier chaque constat sur le code réel (file:line confirmés).
- [x] Confirmer CI verte sur `main` (les rouges de l'ère #872 sont soldés en aval).
- [x] **RED** : test `ConversationGroup.test.tsx` (clavier) + mise à jour `AudioEffectTile.test.tsx`.
- [x] **GREEN** : 4 corrections composants.
- [x] `jest` 2 suites ciblées → **42/42 passed**.
- [x] Vérifier absence de régression TS imputable au diff (les 6 erreurs `ConversationItem` sont pré-existantes — `shared/dist` non build local).
- [x] Docs analyse + plan + tracking.
- [ ] Commit + push + PR + CI `Quality (bun)` + merge `main`.
- [ ] Supprimer la branche après merge ; mettre à jour le pointeur autoritaire.

## Gating CI (rappel tracking)
- **Gater** sur la suite jest spécifique aux fichiers modifiés + `Quality (bun)`.
- `Test web` / `Test shared` : historiquement non fiables (rouges pré-existants hors-web) ; vérifier qu'ils ne sont pas régressés *par ce diff* (ils ne le sont pas — scope a11y/conversations/audio).

## Différé (candidats a11y clavier hors-cluster, itérations futures)
- `components/video-calls/DraggableParticipantOverlay.tsx` (~l.132) : `<div onClick>` plein écran sans clavier.
- `components/video-calls/AudioEffectsPanel.tsx` (~l.60) : div cliquable sans rôle/clavier.
- Autres `role="button"` custom sans anneau `focus-visible`.
- `preferences.reducedMotion` applicatif (toggle quasi no-op) — distinct du `prefers-reduced-motion` global déjà câblé.
