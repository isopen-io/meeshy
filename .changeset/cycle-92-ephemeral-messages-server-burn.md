---
"@meeshy/gateway": patch
---

Les messages autodestructibles ne s'autodétruisaient que sur l'écran

`Message.expiresAt` est écrit par les deux transports d'envoi (WS et REST), et les trois
clients replient la bulle quand l'échéance passe — iOS (`ThemedMessageBubble`,
`BubbleStandardLayout`), Android (« collapse ephemeral bubble when its self-destruct timer
expires »). Le serveur, lui, ne balayait **rien**.

Aucune des ~119 lectures du modèle `Message` ne filtre `expiresAt` : elles sont toutes
gardées par le seul `deletedAt`. Et aucun service ne posait ce `deletedAt` sur une échéance
passée — `MaintenanceService` ne balaye que les messages **vides**,
`ExpiredStoriesCleanupService` ne connaît que les `Post`.

Conséquence : le texte en clair d'un message « autodestructible » restait servi par
`GET /conversations/:id/messages` **indéfiniment** après son échéance. Une réinstallation,
un nouvel appareil, le client web (qui n'a aucun traitement d'éphémère) ou un simple appel
d'API avec un jeton valide le rendaient intégralement. Ce que l'expéditeur croyait effacé
au bout de trente secondes était intact un an plus tard, en clair, en base.

**`ExpiredMessagesCleanupService`** ferme les deux fuites — celle de lecture et celle au
repos. À la minute (la plus courte durée offerte par les clients est de 30 s), il écrase
`content` et `encryptedContent`, vide les traductions, supprime les pièces jointes
(fichiers et lignes), puis pose `deletedAt` — ce qui suffit à retirer le message des ~119
lectures sans en toucher une seule. Cinquième écrivain de `deletedAt` sur un message, il
appelle `applyMessageRemovalEffects`, l'unité que les quatre autres partagent déjà.

L'effacement du CONTENU est propre à ce chemin, et délibérément : une suppression demandée
par une personne veut dire « retire-le de la vue » et laisse la ligne récupérable ; une
échéance dit « détruis-le ».

Deux garde-fous, parce que ce balayage peut faire pire que le défaut qu'il ferme :

- `unsetOrNull('deletedAt')` plutôt que `deletedAt: null` — une ligne dont le créateur n'a
  pas écrit `LIVE_MESSAGE_MARK` a la colonne ABSENTE et ne serait jamais balayée.
- un filtre `_isLapsed` dans le processus en plus du prédicat Mongo. `$lt` avec une date
  est bracketé par type et n'apparie pas les nuls — mais le rayon de souffle d'une erreur
  ici est la destruction de tous les messages de la base, et un invariant à ce prix se
  revérifie plutôt que de se documenter.

Index partiel `expiresAt_ephemeral_partial` fourni en migration MongoDB
(`packages/shared/prisma/migrations/2026-08-12-message-expires-at-partial-index.mongodb.js`) :
`expiresAt` étant écrit explicitement à `null` par tous les créateurs, un index ordinaire
porterait une entrée par message pour servir une fraction infime d'entre eux.
