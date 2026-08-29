# Itération 281 — La réaction par-pièce-jointe refuse l'écriture dans une conversation CLOSE (parité de la garde d'admission)

Issue : suivi de l'itération 280 · jumelle de `ReactionService.addReaction` ·
5e transport de réaction à passer par la garde d'écriture terminale.

## État actuel

`ReactionService.addReaction` (`services/gateway/src/services/ReactionService.ts:104-148`)
pose TROIS gardes d'admission avant de persister une réaction sur un message :

| garde | ligne | refus |
|---|---|---|
| message soft-supprimé (`message.deletedAt`) | `:110` | `'Cannot react to a deleted message'` |
| message système (`messageType === 'system'`) | `:114` | `'Cannot react to a system message'` |
| conversation TERMINALE (`isConversationClosed(message.conversation)`) | `:146` | `CLOSED_CONVERSATION_REACTION_ERROR` = `'Cannot react in a closed conversation'` |

Le doc-comment de la troisième (`:118-145`) énonce la règle pour « les QUATRE
transports de réaction » — socket `reaction:add`, les deux routes REST, le chemin
agent — qui convergent tous sur `addReaction`.

`AttachmentReactionService.addAttachmentReaction`
(`services/gateway/src/services/AttachmentReactionService.ts:28-91`) est le **5e
transport de réaction** conversation-scoped du dépôt. Il ne charge JAMAIS l'état
du message ni de la conversation : après `sanitizeEmoji`, il vérifie
l'idempotence, le plafond des 5, puis fait l'`upsert`. **Aucune des trois gardes.**

Son handler (`AttachmentReactionHandler._apply`) résout le participant
(`resolveParticipantFromMessage`), le `conversationId` (`resolveConversationId`,
`select: { conversationId: true }` seul) et fait la vérification IDOR
attachment↔message — mais ne lit ni `Conversation.closedAt/isActive` ni
`Message.deletedAt/messageType`. `resolveParticipantFromMessage`
(`socketio/utils/participant-resolver.ts`) ne résout que l'appartenance.

## Problèmes identifiés

**Contournement de la garde d'admission d'écriture, sur le seul transport de
réaction qui ne converge pas vers `addReaction`.** Réagir à une pièce jointe
dans une conversation CLOSE (ou `isActive:false`) :

1. persiste une ligne `AttachmentReaction` ;
2. diffuse `ATTACHMENT_REACTION_ADDED` dans `ROOMS.conversation(conversationId)`
   — une room que les clients ont RETIRÉE de leur cache sur `conversation:closed`
   (web `use-socket-cache-sync`, iOS `SocialSocketManager`) ;
3. l'enfile pour les participants hors ligne.

C'est EXACTEMENT le symptôme que le cycle 31 a corrigé pour l'ENVOI, et que
`ReactionService` porte pour les quatre transports message : une écriture qui
part vers un conteneur que le serveur a déclaré mort et que les destinataires
n'ont plus. La clôture étant IRRÉVERSIBLE (aucun écrivain du dépôt ne rallume
`Conversation.isActive`), l'écart est permanent.

Idem, à moindre gravité, pour une pièce jointe d'un message **soft-supprimé**
(réaction persistée + diffusée pour un message que les clients ont rendu
supprimé) et d'un message **système**.

## Causes racines

Classe « cette entité a-t-elle une JUMELLE ? on la prend en entier » du
`CLAUDE.md`. Le chemin par-pièce-jointe (`BUG2 A'`) a été porté depuis la jumelle
message SANS la garde d'admission terminale. Structurellement, la famille
attachment place la RÉSOLUTION (participant, conversationId, IDOR) dans le
HANDLER et garde le service comme couche d'accès aux lignes — la garde d'écriture,
qui a besoin de l'état de la conversation, n'a donc jamais eu de site où être
posée, et personne ne l'a portée.

## Impact métier / technique

Une réaction par-pièce-jointe écrite dans une conversation close : ligne
persistée, événement temps réel diffusé dans une room morte, entrée hors ligne
enfilée. Divergence d'admission d'écriture d'une famille de contenu réagissable.
Le harnais `conversationClosedWriteVerbs.test.ts` liste explicitement, pour le
verbe « réagir », le SEUL `ReactionService.addReaction` — l'absence de la famille
attachment y confirme le trou.

## Évaluation du risque

Faible. Le correctif ALIGNE exactement sur la jumelle testée, réutilise le helper
partagé `isConversationClosed` (source unique de la règle terminale) et la
constante `CLOSED_CONVERSATION_REACTION_ERROR` (source unique du message), et ne
touche que `AttachmentReactionService.ts`. La garde se relit CHEZ ELLE — le
service charge lui-même l'état du message plutôt que de le recevoir de son
appelant (« un paramètre dont l'absence désactive une garde est un demi-
correctif » ; lire l'état réel de la base plutôt que la discipline de l'appelant
est ce qui rend une garde robuste, cf. en-tête de `conversationWriteAdmission`).

**Le RETRAIT reste ouvert**, délibérément — parité stricte avec
`ReactionService.removeReaction`, non gardé : on peut retirer une réaction d'une
conversation close.

Coût : une lecture `message.findUnique` par PK sur le chemin ADD (indexée), le
prix assumé d'une garde auto-contenue — la jumelle fait une lecture équivalente.

## Améliorations proposées (implémentées)

Dans `AttachmentReactionService.addAttachmentReaction`, avant l'idempotence :
charger `message.findUnique({ select: { deletedAt, messageType, conversation: {
select: { isActive, closedAt } } } })` et poser les trois gardes de la jumelle
(`'Cannot react to a deleted message'`, `'Cannot react to a system message'`,
`CLOSED_CONVERSATION_REACTION_ERROR`), avec le même refus `'Message not found'`
sur message absent (défense en profondeur — le handler le refuse déjà en amont).

## Bénéfices attendus

Les CINQ transports de réaction refusent désormais l'écriture dans un conteneur
terminal, en un seul point de règle (`isConversationClosed`) ; plus de ligne
`AttachmentReaction` ni d'événement temps réel émis vers une conversation close ;
parité des messages d'erreur avec les quatre jumelles.

## Complexité

Faible : un bloc de garde dans une méthode, deux imports, mise à jour du défaut
`message.findUnique` des deux fichiers de tests existants (fournir un message
vivant), et une suite de témoins closed/deleted/system.

## Critères de validation

- Témoins exerçant la VRAIE garde (aucun mock de `isConversationClosed`) :
  RED prouvé (l'ajout est refusé, aucun `upsert`), GREEN après.
- Un témoin par garde : conversation close (`closedAt`), close héritée
  (`isActive:false`), message supprimé, message système.
- Un témoin « retrait NON gardé » : `removeAttachmentReaction` réussit dans une
  conversation close (parité `removeReaction`).
- Les deux fichiers de tests existants du service restent verts après mise à jour
  du défaut `message.findUnique`.
- Suite gateway complète verte + `tsc --noEmit` exit 0.
