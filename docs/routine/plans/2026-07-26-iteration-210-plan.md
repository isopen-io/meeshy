# Plan d'implémentation — Iteration 210

## Objectifs
Faire converger la résolution du **nom d'affichage** et des **initiales d'avatar**
de `ActiveUsersSection` (sidebar de détails de conversation) sur les SSOT
`getUserDisplayName` / `getUserInitials`, supprimant deux défauts de correctness :
`displayName` (priorité 1) ignoré, et garde `firstName && lastName` exigeant les
deux champs.

## Modules affectés
- `apps/web/components/conversations/details-sidebar/ActiveUsersSection.tsx` (source)
- `apps/web/__tests__/components/conversations/ActiveUsersSection.test.tsx` (tests)
- `docs/routine/analyses/2026-07-26-iteration-210-analyse.md`
- `docs/routine/plans/2026-07-26-iteration-210-plan.md`

## Phases d'implémentation
1. **RED** — 3 tests de régression ajoutés à la suite dédiée existante
   (displayName-seul → displayName rendu ; firstName-seul → prénom rendu ;
   initiales = 2 lettres du nom résolu). ✅ 3 failed / 5 passed prouvés.
2. **GREEN** — import des SSOT `getUserDisplayName`/`getUserInitials` depuis
   `@/lib/avatar-utils` ; ligne 42 → `getUserInitials(user)` ; lignes 47-49 →
   nom résolu (calculé une fois par item map) ; `alt` de l'`AvatarImage` → nom
   résolu. ✅ 8/8 passed.
3. **REFACTOR** — map converti en corps `{ const displayName = ...; return (...) }`
   pour réutiliser le nom résolu (alt + texte) sans double calcul.

## Dépendances
Aucune. Les SSOT `getUserDisplayName`/`getUserInitials` (`@/lib/avatar-utils`)
et leurs sous-SSOT (`utils/user-display-name`, `utils/initials`) existent et sont
testés (91/91).

## Risques estimés
**Faible.** Web-only, composant présentationnel isolé, aucune PR ouverte sur ce
fichier. Comportement inchangé pour les comptes firstName+lastName complets.

## Stratégie de rollback
`git revert` du commit — un seul fichier source + un fichier de test, sans
dépendance transverse.

## Critères de validation
- [x] RED prouvé (3 failed avant fix).
- [x] `ActiveUsersSection.test.tsx` 8/8 vert.
- [x] SSOT `avatar-utils` + `user-display-name` + `initials` : 91/91.
- [x] `__tests__/components/conversations` : 29 suites / 583 tests, 0 échec.
- [x] `tsc --noEmit` : 0 erreur sur le fichier modifié.

## Statut de complétion
**Terminé.** Prêt pour commit/push/PR.

## Suivi de progression
- Analyse : rédigée.
- Implémentation : terminée (RED→GREEN→REFACTOR).
- Validation : terminée.

## Améliorations futures
- `conversation-item/conversation-utils.tsx:getConversationNameOnly` — ordre
  username-first (cast `unknown` requis).
- `ConversationItem.tsx:getSenderName` (~196-200) — même bug username-first.
- `utils/v2/transform-conversation.ts:120` — court-circuite
  `resolveUserPreferredLanguage`.
- `utils/user-display-name.ts:getUserDisplayName` → `getUserDisplayNameOrNull(user) ?? fallback`.
