## MODERATOR de plateforme est privilégié partout, d'une seule table (2026-10-24, #11217)

**Contexte.**

La passerelle se contredisait sur le rôle de plateforme MODERATOR : ordinaire pour
`conversation-authority.ts` (rang effectif, historique, liens de partage), mais
privilégié pour l'édition (`PRIVILEGED_GLOBAL_ROLES`), la suppression, l'écriture et
l'épinglage (`PLATFORM_STAFF_ROLES`). Six listes littérales de MODERATOR/ADMIN/BIGBOSS
vivaient dans le dépôt, plus deux miroirs Swift, et chacune pouvait diverger seule.

**Décision porteur (2026-10-24).**

MODERATOR de plateforme est PRIVILÉGIÉ partout (édition, suppression, autorité de
conversation), comme ADMIN et BIGBOSS, par une table unique lue par toutes les
admissions. AUDIT et ANALYST restent ordinaires.

**Mise en œuvre.**

- `packages/shared/utils/platform-privilege.ts` : `PRIVILEGED_PLATFORM_ROLES` et
  `isPrivilegedPlatformRole`, comparaison EXACTE (`User.role` est un enum Prisma en
  majuscules ; une chaîne en minuscules ne vient que d'une charge forgée).
- Lecteurs : `conversation-authority` (`actsWithCreatorRights` : un privilégié MEMBRE
  vaut le créateur, jamais au-dessus), `messageEditAdmission`, `messageDeleteAdmission`,
  `conversationWriteAdmission` (écriture, mode lent, épinglage), `historyFloor`,
  `mayMintShareLink` (Global), `ensureGlobalConversationMembership` (effectif exact),
  `PostService.deletePost`, `requireModerator`, `canEditMessage`, `DELETE
  /attachments/:id`, `mayRemoveSound`, `permissions.canModerateContent` du contrat
  participant (`serializeConversationParticipant`), et la loi d'actions
  des clients (`platformModerates`, rang effectif et invitation Global de
  `conversationActionsFor`).
- Miroir Swift : `PlatformRole.privileged` / `isPrivileged`, lu par
  `ConversationViewerAuthority.effectiveRole`, `ConversationActionPolicy` (invitation
  Global), `ContentRemovalPolicy` et `NearbyDiscoverAccess` — tous par la lecture
  EXACTE `PlatformRole(raw:)`, comme la passerelle et le web. Les vecteurs de
  `fixtures/action-policy/` sont régénérés et rejoués par le SDK.
- Garde : `__tests__/platform-privilege.test.ts` refuse toute autre liste littérale
  des trois rôles (et d'eux seuls) dans `packages/shared`, la passerelle et le web —
  et, depuis la revue du lot, toute liste ou chaîne de `===` qui nomme ADMIN et
  BIGBOSS en OUBLIANT MODERATOR, hors d'une liste de sites d'administration motivés
  (console, exploitation, sauvegardes, amorçage), chacun avec sa raison, et que la
  garde vérifie encore vivants.
- L'autorité de plateforme suppose une APPARTENANCE : `actsWithCreatorRights` refuse le
  surclassement sans ligne de participation (détail :
  `services/gateway/decisions/2026-10-24-moderator-de-plateforme-agit-avec-les-droits-du-createur-11217.md`).

**Ce que la table ne gouverne pas.**

D'autres décisions gardent leur loi : la console d'administration (`adminOpen`,
`isGlobalAdmin`), la visibilité de la présence (directive 2026-08-25, ADMIN/BIGBOSS),
le lancement d'un appel dans une conversation publique (`canStartCall`, directive
2026-10-11), la liste des spectateurs d'un post (`viewerListAccess`, #9727, lecture
journalisée d'ADMIN/BIGBOSS) et l'effectif exact côté client (`canViewExactMemberCount`, qui lit un
seuil de niveau à casse pliée et rend le même ensemble).
