## 2026-10-04 : une citation gravée ne suit un pair renommé que si elle porte son id — PROPOSÉE, à arbitrer
**Statut**: Retenu (2026-10-04, coordinateur — #9371). Graver à la réception `authorUserId` / `senderUserId` (optionnels, sans migration, sans modification passerelle) ; les citations anciennes sans id guérissent à la prochaine relecture REST. Implémenté par #9371.

**Contexte**: #9307 a fait de `UserUpdatedEvent.repainted(_:)` (SDK, `Models/UserProfileRepaint.swift`) la loi unique qui repeint un pair à `user:updated`, et #9359 l'a portée à l'aperçu « Bob : … » d'un groupe, à la fiche participant et à l'en-tête d'un direct ouvert. Reste la quatrième surface : le nom et la photo de l'auteur CITÉ dans une réponse, ou de l'expéditeur d'origine d'un transfert, dans d'anciens messages.

Mesuré sur `dev` le 2026-10-04 :
- `ReplyReference` (`Models/ReplyReference.swift`) grave `authorName`, `authorColor`, `authorAvatarUrl` et `isMe` — **aucun identifiant d'auteur**. Seule une réponse à une STORY porte `storyAuthorId`. Gravée dans le blob `replyToJson` de la table `messages`.
- `ForwardReference` grave `senderName` et `senderAvatar` — **aucun identifiant d'expéditeur**.
- La passerelle, elle, SERT cet identifiant : `APIMessageReplyTo.sender` (`APIMessageSender`, `resolvedUserId`) et `APIForwardedFrom.sender`. `toReplyReference` le lit pour décider `isMe`, puis le jette.
- La loi apparie par identifiant d'UTILISATEUR, jamais par pseudo (qui change justement) : sans id, une citation gravée ne peut pas être appariée, et **l'inventer n'est pas une option** — apparier sur l'ancien nom repeindrait aussi un homonyme.
- Ce qui guérit déjà : `replyTo.sender` est une relation relue à chaque `GET /conversations/:id/messages`, et l'upsert réécrit `replyToJson` quand il diffère (`MessagePersistenceActor+UpsertEquality`). Une citation de la fenêtre que le fil relit reprend le nom courant au prochain rafraîchissement REST. Restent figées les citations HORS fenêtre relue et celles d'un fil rouvert hors ligne.

**Décision proposée**: graver désormais l'id cité, côté réception (pas côté envoi : c'est la passerelle qui sert le message cité, l'émetteur n'a rien à ajouter).
1. `ReplyReference.authorUserId: String?` et `ForwardReference.senderUserId: String?` — OPTIONNELS et décodés `decodeIfPresent`, même discipline que `authorAvatarUrl` : un blob gravé avant eux se relit sans eux. Posés par `APIMessageReplyTo.toReplyReference` (`sender?.resolvedUserId`) et par le constructeur du transfert ; jamais pour une citation protégée dont l'auteur n'est pas servi.
2. La loi gagne `repainted(_ reference: ReplyReference)` / `repainted(_ reference: ForwardReference)` — nom COMPOSÉ (un auteur de message), avatar tri-état, `nil` quand rien ne change ; `isMe` ne bouge jamais.
3. `MessagePersistenceActor.repaintSender` repeint aussi ces blobs. Pour ne pas décoder toute la table à chaque `user:updated`, la sélection se restreint d'abord aux lignes dont le blob CONTIENT l'id (`instr(replyToJson, ?)`), puis décode et applique la loi ligne à ligne — seules les lignes qui changent montent leur `changeVersion`.
4. Aucune migration de données : les anciennes citations restent au nom gravé jusqu'à leur prochaine relecture REST, qui les regrave AVEC l'id.

**Alternatives rejetées**:
- Apparier sur `authorName` : le nom est exactement ce qui change, et deux pairs peuvent le partager — on repeindrait l'homonyme.
- Recalculer la citation à l'affichage depuis le message cité en base : le message cité est souvent hors fenêtre (c'est pour lui que la citation est gravée), et la bulle se dessinerait différemment selon ce que le cache contient.
- Accepter le nom figé sans rien faire : défendable (une citation est un instantané, comme une capture), mais c'est incohérent avec la bulle de l'auteur juste au-dessus, qui, elle, se repeint depuis #9307 — deux noms pour une personne dans le même écran.

**Conséquences**:
- Touche le FORMAT PERSISTANT (blob `replyToJson`, rétro-compatible par champs optionnels) ; aucune modification de la passerelle n'est nécessaire, elle sert déjà l'identifiant.
- Le miroir web (`repaintProfile`, `apps/web/src/lib/api/my-portrait.ts`) devrait porter la même règle pour ses citations ; le miroir Kotlin est gelé (directive 2026-09-16) et ne la reçoit pas.
- Si le porteur préfère le nom figé, cette fiche passe en « Rejeté » et la surface (4) de #9359 est close comme comportement assumé.
