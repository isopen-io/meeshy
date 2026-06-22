# Plan — Itération 59wb (web)

## Base
- Rebasée sur `main` HEAD `4421e3a` (post-merge #792/#787/#784/#786 + perf compose).
- Branche de travail : `claude/practical-fermat-6hb69o` (réutilisée après fermeture
  sans merge de #798 — périmètre différent, pas de réouverture de #798).

## Contexte — deux collisions gérées
1. **Doublon de périmètre** : le candidat initial (Escape-dismiss + dialog semantics
   sur les 2 modales hand-rolled) était identique à **#792 (iter-58w)** déjà mergé
   → PR doublon **#798 fermée sans merge** (convention #770→#771, #783). Repivot
   sur le **focus-trap** (seul reliquat borné du cluster 56wb).
2. **Collision de numéro** : `59w` a été pris en parallèle par **#786** (i18n/a11y
   OTP, périmètre disjoint) → ce travail renuméroté **59wb**.

## Objectif
Confiner le focus clavier dans les 2 dialogues maison, en **réutilisant** le hook
`useFocusTrap` existant (`hooks/use-accessibility.ts`, jusqu'ici sans consommateur
ni test) — pas de réimplémentation.

## Étapes
1. [x] Test du hook activé : `hooks/__tests__/use-focus-trap.test.tsx` (focus
   initial, inactif, wrap Tab→premier, wrap Shift+Tab→dernier) → 4/4 verts.
2. [x] `ConversationDrawer` : `panelRef` + `useFocusTrap(panelRef, isOpen)` + `ref`
   sur le panneau dialogue.
3. [x] `AgentTopicEditModal` : `dialogRef` + `useFocusTrap(dialogRef, true)` + `ref`
   sur le panneau dialogue.
4. [x] `tsc --noEmit` : 0 erreur sur les fichiers touchés.
5. [x] Annoter analyse 59wb + `branch-tracking.md` (doublon #798 + collision 59w/#786
   + 56wb soldé).
6. [ ] Commit + push (rebasé) + PR ; merge dans `main` après CI.

## Décisions / contraintes
- Réutiliser le hook (Single Source of Truth), ne pas inliner.
- **Pas** de focus-restore (modifierait le hook partagé) → différé borné.
- **Pas** de refactor de `v2/Dialog` (composant très consommé) → différé.
- Aucune dépendance ; aucune chaîne i18n touchée (orthogonal aux i18n parallèles).
- Autres frontends (iOS/Android) hors périmètre.

## Suite (60w+)
focus-restore générique sur `useFocusTrap`, consolidation `v2/Dialog`→`useFocusTrap`,
`Badge` off-palette (arbitrage), `app/settings/loading.tsx` (server i18n),
console.error FR, `next-themes` orphelin.
