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
