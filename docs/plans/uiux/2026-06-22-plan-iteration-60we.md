# Plan — Itération 60we (web)

> Renumérotée 60w→60wb→60wc→60wd→60we : tempête de collisions (4 agents web).
> Ma cible principale (AttachmentPreviewReply i18n) livrée en parallèle #804 →
> abandonnée au profit de `main`. Surface unique = `PhoneResetFlow` sr-only.

**Objectif** : i18n du `sr-only` `Indicatif pays` figé de
`components/auth/PhoneResetFlow.tsx` (a11y — lecteurs d'écran, toutes langues).

## Étapes
1. [x] Branche réinitialisée sur `main` HEAD (`799ea44`) — élimine la cruft des
   merges successifs ; ré-application du seul delta unique.
2. [x] `PhoneResetFlow.tsx:491` sr-only → `t('phoneReset.selectCountry', 'Select country')`
   (réutilise la clé orpheline existante ; `auth.json` non modifié).
3. [x] Vérifier sur `main` : chaîne FR figée présente + clé dispo ×4.
4. [ ] Force-push branche (réécrite) + mettre à jour PR #810 + merge `main` après CI.
5. [ ] `branch-tracking.md` mis à jour ; branche supprimée après merge.

## Risque
Minimal : 1 ligne, réutilisation d'une clé existante, runtime inchangé.

## Déféré (61w+)
- Anti-pattern `t()||fallback` PhoneResetFlow + ~270 occ restantes (#800).
- Épuration `config-modal.tsx` (`LazyConfigModal` 0 consommateur — vérifié).
