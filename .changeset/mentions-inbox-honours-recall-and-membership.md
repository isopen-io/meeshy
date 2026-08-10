---
'@meeshy/gateway': patch
---

L'inbox `/mentions/me` honore enfin le rappel d'un message et l'appartenance à la conversation.

`MentionService.getRecentMentionsForUser` ne filtrait que sur `mentionedUserId` : c'était le seul
chemin du gateway rendant `Message.content` sans vérifier `deletedAt`. Un message supprimé par son
auteur — retiré de la conversation pour tout le monde, `message:deleted` diffusé, `translations`
vidées — restait donc lisible en clair, avec son auteur et le titre de sa conversation, dans
l'inbox de chaque personne qu'il nommait, et pour toujours : aucun écrivain ne supprime la ligne
`Mention`, et le `onDelete: Cascade` du schéma ne se déclenche que sur une suppression physique que
le retrait doux ne fait jamais. Même absence de garde sur l'appartenance : une personne retirée d'un
groupe continuait d'y lire une entrée dont le titre de conversation est relu à chaque appel.

L'admission est désormais celle de `GET /mentions/messages/:messageId`, la route soeur du même
fichier : message non supprimé, appelant participant toujours actif.
