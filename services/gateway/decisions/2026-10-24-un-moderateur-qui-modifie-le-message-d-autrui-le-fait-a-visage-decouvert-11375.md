## Un modérateur de plateforme qui modifie le message d'un autre le fait à visage découvert, et tous le voient (2026-10-24, #11375)

**Statut** : Accepté — décision porteur du 2026-10-24, écrite sur #11375.

**Contexte** : `admitMessageEdit` admettait déjà qu'un MODERATOR / ADMIN / BIGBOSS de plateforme, membre actif, modifie le message d'un autre (`asModerator: true`), mais rien ne l'enregistrait : les membres lisaient « modifié » comme si l'auteur l'avait écrit. L'audit adversarial de #11372 (B1) a fait retirer « Modifier » de ce cas sur le web, puis sur iOS (#11401). Deux issues restaient possibles : retirer la porte de la passerelle, ou enregistrer et afficher l'auteur de la modification. Le porteur a tranché la seconde.

**Décision** :
1. `Message` porte deux champs optionnels, **sans booléen redondant** : `editedById` (`User.id` du tiers qui a fait la DERNIÈRE modification) et `editedByRole` (son rôle global à cet instant). Absents ou `null` ⇒ l'auteur. Aucune migration de données : les lignes antérieures n'ont pas la clé, ce qui vaut « l'auteur ».
2. `admitMessageEdit` rend `editorRole` sur la seule branche `asModerator` ; `editAttributionOf(admission, editorUserId)` (`services/messaging/messageEditAdmission.ts`) est l'UNIQUE énoncé de ce que l'écriture enregistre. Les quatre transports d'édition (socket `message:edit`, `PUT /conversations/:id/messages/:messageId`, `PUT /messages/:messageId`, `PATCH /messages/:messageId`) le répandent dans leur écriture : le tiers est enregistré, **l'auteur qui réécrit remet les deux colonnes à `null`**, un refus n'enregistre personne.
3. `message:edited` porte toujours les deux clés (`null` explicite, jamais absente) : `buildMessageEditedCore` les relit de la ligne relue après écriture (REST, résumés d'appel), ou les reçoit du transport socket qui compose depuis la ligne d'AVANT (`editedBy`). Les lectures (`GET /conversations/:id/messages`, `GET /messages/:id`, synchronisation) les servent ; `messageSchema` les déclare (sans quoi fast-json-stringify les retirerait).
4. **Rétrocompatible** : champs ajoutés seulement. Un ancien client les ignore et lit « modifié » ; un nouveau client face à une ancienne passerelle ne voit pas la clé et garde « modifié ».
5. La loi des actions (`messageActionsFor`) offrait déjà `edit` au modérateur de plateforme sur le message d'autrui, jamais en bout en bout ; deux vecteurs l'épinglent (`e2ee-moderator-plateforme-ne-modifie-pas-autrui`, `serveur-moderator-plateforme-modifie-autrui`). Les clients réoffrent « Modifier » à ce rôle et lisent « modifié par un modérateur » (`editedByThirdParty`, `packages/shared/utils/message-edit-attribution.ts` ; miroir iOS `MeeshyMessage.editedByModerator`).

**Alternatives rejetées** :
- *Retirer la porte de la passerelle* : un modérateur ne pourrait plus corriger une donnée personnelle ou un contenu illicite sans supprimer tout le message ; le porteur a choisi la transparence plutôt que l'amputation.
- *Un booléen `editedByModerator`* : redondant avec `editedById` (règle du dépôt), et muet sur QUI a modifié, que la modération doit pouvoir retrouver.
- *Garder la mention après une réécriture de l'auteur* : la mention dit qui a écrit la version LUE ; le texte de l'auteur redevient le sien.

**Conséquences** : un membre voit qu'un texte n'est plus celui de son auteur. Le MODERATOR global est privilégié comme partout (#11217). Le miroir Kotlin (`apps/android`) ne lit pas encore ces champs : dette consignée sur l'issue, à solder par une issue Android.
