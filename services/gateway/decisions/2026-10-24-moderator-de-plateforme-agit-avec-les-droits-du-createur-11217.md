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
- **« Une fois dans » est tenu par la LOI, pas par chaque route.** La revue adversariale
  du lot a trouvé trois routes de membre qui remettaient l'acteur sans avoir vérifié
  l'appartenance — `PUT|PATCH` et `DELETE /conversations/:id`, `PATCH
  …/participants/:id/rights` : sans ligne `Participant`, l'acteur devenait
  `{ conversationRole: undefined, platformRole }`, et le seul rôle de plateforme lui
  donnait le rang du créateur. Un MODERATOR (et, avant le lot, un ADMIN ou un BIGBOSS)
  fermait ainsi n'importe quel tête-à-tête, renommait n'importe quel groupe ou en
  changeait la police d'écriture, sans motif ni `AdminAuditLog`, en contournant
  `requireAdminRank()` de la route souveraine. `actsWithCreatorRights` exige
  désormais une ligne de participation : `Participant.role` étant une colonne
  requise, un `conversationRole` absent signifie « aucune ligne », et alors aucun
  rôle de plateforme ne vaut un rang. Configurer une conversation dont on n'est pas
  membre passe par `routes/admin/conversation-settings-sovereign.ts` (rang ADMIN,
  motif écrit, audit) — jamais par la route de membre.
- Suivent du même coup tous les gestes qui passent par `actorHasMinimumRole` /
  `actorRoleLevel` (bannir, retirer, changer un rang, inviter, poser les droits d'un
  invité, administrer un lien, chiffrer), le plancher d'historique (`historyFloor`) et
  la fabrication d'un lien dans Global (`mayMintShareLink`).
- `PRIVILEGED_GLOBAL_ROLES` (édition, suppression), `PLATFORM_STAFF_ROLES` (écriture,
  mode lent, épinglage), `EXACT_COUNT_PLATFORM_ROLES`, la liste de `requireModerator`
  et celle de `PostService.deletePost` sont retirées au profit de la même table.
- Deux admissions de modération de contenu gardaient ADMIN/BIGBOSS seuls, la forme
  exacte du défaut d'origine : la suppression d'une pièce jointe d'autrui (`DELETE
  /attachments/:id`) et le retrait d'un son de la bibliothèque (`mayRemoveSound`,
  #9848). Elles lisent la table : un modérateur qui retire un message ou un post
  retire aussi le média qui l'accompagne.

Hors de la table, par leurs propres décisions : la présence et la console
d'administration (`isGlobalAdmin`), l'appel dans une conversation publique
(`canStartCall`). Détail : `packages/shared/decisions/2026-10-24-moderator-de-plateforme-privilegie-partout-une-seule-table-11217.md`.
