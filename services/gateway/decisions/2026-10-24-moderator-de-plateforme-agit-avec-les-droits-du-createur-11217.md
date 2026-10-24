## Un MODERATOR de plateforme membre agit avec les droits du créateur, comme ADMIN et BIGBOSS (2026-10-24, #11217)

**Décision porteur du 2026-10-24** : MODERATOR de plateforme est privilégié partout.
Elle étend la décision du 2026-08-27 (#3892, #3941) — « un administrateur de la
plateforme, une fois DANS une conversation, agit avec les droits du créateur » — au
rôle MODERATOR, et la réconcilie avec l'édition et la suppression, qui le
privilégiaient déjà.

- `actsWithCreatorRights` (`utils/conversation-authority.ts`) lit
  `isPrivilegedPlatformRole` (`@meeshy/shared/utils/platform-privilege`), comparé
  EXACTEMENT. « Une fois dans » et « au niveau du créateur, jamais au-dessus » restent
  vrais : un modérateur de plateforme étranger à la conversation y reste étranger, et
  ne bannit pas le créateur.
- Suivent du même coup tous les gestes qui passent par `actorHasMinimumRole` /
  `actorRoleLevel` (bannir, retirer, changer un rang, inviter, poser les droits d'un
  invité, administrer un lien, chiffrer), le plancher d'historique (`historyFloor`) et
  la fabrication d'un lien dans Global (`mayMintShareLink`).
- `PRIVILEGED_GLOBAL_ROLES` (édition, suppression), `PLATFORM_STAFF_ROLES` (écriture,
  mode lent, épinglage), `EXACT_COUNT_PLATFORM_ROLES`, la liste de `requireModerator`
  et celle de `PostService.deletePost` sont retirées au profit de la même table.

Hors de la table, par leurs propres décisions : la présence et la console
d'administration (`isGlobalAdmin`), l'appel dans une conversation publique
(`canStartCall`). Détail : `packages/shared/decisions/2026-10-24-moderator-de-plateforme-privilegie-partout-une-seule-table-11217.md`.
