# Blocage + Archive — Plan (2026-06-13)

Décisions user : blocages entrants = backend rejette / front gère sortant ;
enforcement DM uniquement (groupes non affectés). Erreur backend = `USER_BLOCKED` (403).

## Backend (gateway + shared)
- [ ] `ErrorCode.USER_BLOCKED` (enum + ErrorMessages FR/EN + ErrorStatusMap=403) dans `packages/shared/types/errors.ts`
- [ ] Helper bidirectionnel `isBlockedBetween(prisma, a, b)` (A.blockedUserIds has B OR B.blockedUserIds has A)
- [ ] Création conversation `core.ts` : si `type==='direct'`, rejeter si bloqué (2 sens). Groupes : pas d'enforcement.
- [ ] Envoi message — 3 chemins, DM only, bidirectionnel :
  - [ ] REST `POST /conversations/:id/messages` (`messages.ts`)
  - [ ] Socket `message:send` (`MessageHandler.ts`) : rendre bidirectionnel
  - [ ] Socket `message:send-with-attachments` (`MessageHandler.ts`) : ajouter le check
- [ ] TDD gateway + build tsc

## iOS (app + SDK) — DONE (build OK 34s, 11/11 NewConversationViewModelTests verts)
- [x] Fix archive swipe : `ConversationListView.swift` `!isActive` → `userState.isArchived`
- [x] Retirer guard `if !(isArchivedConv && isBlockedConv)` (menu) → unarchive toujours dispo
- [x] BlockService sync au login : helper `warmSessionScopedCaches()` dans `applySession` (!rotation) + `restoreSession`
- [x] Zone composer bloqué (sortant) : `blockedComposerZone` + branche composer + `blockedDirectParticipantId` + `@ObservedObject blockService`
- [x] Picker `NewConversationView.userRow` : grisé + `.disabled` + icône main + label « Bloqué », observe `$blockedUserIds`
- [x] Toast `USER_BLOCKED` à la création (NewConversationViewModel) + à l'envoi (early-return ConversationViewModel)
- [x] Helper réutilisable `Error.isUserBlockedError` (décode `code` du body 403)
- [x] Clés xcstrings : context.unarchive/unblock + 6 swipe.* + 6 nouvelles (composer/picker/send)
- [x] 2 tests TDD (helper + création bloquée)

## Review
(à remplir)
