# Plan — Itération 60w (web)

## Base
- `main` HEAD `684d33f` (post-#792/#796/#779/#786/#787/#784/#791…).
- Branche : `claude/practical-fermat-6hb69o` (réutilisée après #798 et #803 fermées
  sans merge — doublons #792/#796).

## Contexte — deux doublons gérés avant ce pivot
1. Escape+dialog semantics = #792 → #798 fermée.
2. focus-trap (+restore) = #796 → #803 fermée.
→ Pivot vers une surface **vérifiée FR-figée et non revendiquée** : `config-modal.tsx`.

## Objectif
i18n du modal de paramètres global `ConfigModal` (9 chaînes FR : titre + 6 onglets
+ 2 labels a11y du select mobile).

## Étapes
1. [x] Bloc `settings.configModal` (9 clés) ×4 locales (additif sous racine `settings`).
2. [x] `config-modal.tsx` : `useI18n('settings')` + 9 `t('configModal.*', '<EN>')`
   (fallbacks EN, leçon 50w).
3. [x] Test `config-modal.test.tsx` : mock `useI18n` + assertions EN → 22/22 verts.
4. [x] `tsc` 0 erreur ; JSON ×4 valides ; parité vérifiée ; grep FR = 0.
5. [x] Docs analyse/plan 60w + `branch-tracking.md`.
6. [ ] Commit + push + PR ; merge dans `main` après CI.

## Décisions
- Bloc `configModal` dédié (pas de réutilisation `settings.tabs.*` aux libellés
  courts) → i18n fidèle, zéro changement de texte visible.
- Fallbacks EN en 2e arg (anti-flash) sur les surfaces visibles.
- Aucun autre frontend ; surface orthogonale aux zones saturées (modales/feed/auth).

## Suite (61w+)
`PhoneResetFlow.tsx:490` `Indicatif pays`, `AttachmentPreviewReply` title/aria FR,
`Badge` off-palette (arbitrage), consolidation `v2/Dialog`→`useFocusTrap`,
console.error FR, `next-themes` orphelin.
