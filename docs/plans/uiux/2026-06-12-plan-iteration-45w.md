# Plan — Iteration 45w (2026-06-12) — Web exclusivement

Réf : `docs/analyses/uiux/2026-06-12-iteration-45w.md`
Branche : `claude/elegant-noether-1pen57` (base main 09e08439, post-merge #594)

## 1. Infrastructure locale hors React
- [x] `getCurrentInterfaceLocale()` dans `stores/language-store.ts` (lecture
      `useLanguageStore.getState().currentInterfaceLanguage`) + export barrel `stores/index.ts`

## 2. Migration `'fr-FR'` → locale d'interface (37 fichiers)
- [x] Surface utilisateur (14 fichiers) : composants → `locale` de `useI18n` existant ou
      selector Zustand ; services/utils module-level → `getCurrentInterfaceLocale()`
- [x] Surface admin (23 fichiers) : helpers module-level → paramètre `locale` passé depuis
      le composant (réactivité au changement de langue), sinon getter
- [x] NE PAS toucher : maps speech/partage (share-affiliate-modal, AudioPostComposer,
      use-voice-recording), tests, scripts

## 3. user-settings.tsx
- [x] Clés `settings.profile.avatar.invalidFile` / `.uploadError` ajoutées ×4 locales
      (en/fr/es/pt) + branchement `t(key, fallback)` sur les 3 toasts

## 4. SwipeableRow a11y
- [x] `type="button"` sur les boutons d'action gauche/droite
- [x] `aria-hidden="true"` sur l'overlay tap-outside

## 5. Hygiène documentaire
- [x] Footers Status ajoutés aux analyses 10–23 + 44
- [x] `branch-tracking.md` consolidé (5 blocs Current State → 1, History dédupliquée,
      carry-overs par plateforme)

## 6. Vérification & merge
- [x] `tsc --noEmit` + suites Jest ciblées (language-store, composants touchés)
- [x] Commit + push `claude/elegant-noether-1pen57`, PR vers main, merge après CI
- [x] Mise à jour branch-tracking post-merge (Next : 46w depuis main)

## Carry-over pour 46w
- admin i18n : debug.tsx (~15 strings), AgentArchetypesTab, tooltips InfoIcon
  LlmTab/GlobalConfigTab
- réactions par pièce jointe (wiring gateway)
- audit qualité es/pt ; dark mode pages admin ; user-select bulles ; deep links parité
