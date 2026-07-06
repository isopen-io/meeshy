# Plan — Itération 72w (Web)

> Base : `main` HEAD `f60b120` (resync avant départ). Branche : `claude/practical-fermat-vqqx7t`.
> Thème : solder l'anti-pattern `t()||fallback` du **domaine conversations** + corriger le bug de clé brute du toast de restauration.

## Cible (orthogonale aux PR 69w/70w/71w en vol)
- [x] `components/conversations/ConversationLayout.tsx:783` — bug clé brute `messageRestored` → `bubbleStream.messageRestored` (default-arg)
- [x] `components/conversations/conversation-participants-drawer.tsx:581` — placeholder admin codé en dur + fallback mort → i18n complet
- [x] `components/conversations/conversation-participants-drawer.tsx:811` — bouton réglages → default-arg
- [x] `components/conversations/steps/ConversationDetailsStep.tsx:94/102/106` — statuts identifiant → default-arg

## i18n
- [x] `conversations.conversationDetails.searchOrAddParticipants` ajoutée ×4 (en/fr/es/pt)
- [x] Aucune autre clé manquante (toutes existaient) — fallbacks morts supprimés

## Tests
- [x] NOUVEAU `__tests__/locales/conversations-i18n-keys.test.ts` (29/29) — parité 4 locales + garde anti-régression bug #1
- [x] Non-régression : `ConversationLayout` + `failed-message-banner` + `ConversationHeader` (100/100)

## Livraison
- [ ] Commit + push `claude/practical-fermat-vqqx7t`
- [ ] PR + CI vert (`Quality (bun)`)
- [ ] Merge `main` + MAJ `branch-tracking.md` + suppression branche

## Note continuité
Reste différé (hors-collision, itérations futures) : singletons `t()||fallback` (`app/settings/page.tsx`, `app/(connected)/contacts/page.tsx`, `app/dashboard/LastMessagePreview.tsx`) ; `PhoneResetFlow.tsx` capté par #1088.
# Plan — Itération 72w (a11y clavier `details-sidebar`)

**Base** : `main` HEAD `23837bf` (post-#1084 / 69w) — branche `claude/practical-fermat-auiwtk`

## Objectif
Rendre opérables au clavier les affordances « cliquer pour éditer » du cluster
`components/conversations/details-sidebar/*` (WCAG 2.1.1 / 4.1.2), surface
orthogonale aux PR web en vol.

## Étapes
1. [x] Audit du cluster `details-sidebar/` (`onClick` sans `onKeyDown`/role/focus).
2. [x] `DetailsHeader` : avatar éditable → `<button>` natif nommé + focus ring.
3. [x] `CustomizationManager` : cartes nom perso + réaction → `role=button` clavier.
4. [x] `DescriptionSection` : bouton d'édition `focus-visible:opacity-100`.
5. [x] i18n : `changeImage` / `editCustomName` / `editReaction` ×4 locales.
6. [x] Tests : `details-sidebar-a11y.test.tsx` (8 cas) + voisins verts.
7. [x] Docs analyse + plan + annotation « complété ».
8. [ ] Commit + push + CI vert.
9. [ ] Merge dans `main`, MAJ `branch-tracking.md`, suppression de branche.

## Gates CI
- Suite jest `__tests__/components/conversations/details-sidebar-a11y` + voisins.
- `Quality (bun)`. ESLint local KO (mismatch env, non bloquant — gate CI épingle).
- ⚠️ `Test Python (translator)` peut flaker (diff sans `.py`) — non bloquant.

## Risques
- Faible. Ajout pur de chemins clavier + visibilité focus ; aucun changement de
  comportement souris. `<button>` enveloppant `<Avatar>`/`<span>` = HTML valide
  (descendants non interactifs).
