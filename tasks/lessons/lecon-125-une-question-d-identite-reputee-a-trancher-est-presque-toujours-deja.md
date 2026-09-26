## Leçon 125 — une question d'identité réputée « à trancher » est presque toujours déjà tranchée par le handler JUMEAU (2026-08-12, routine messaging, cycle 88)

Le cycle 87 a instruit le join anonyme, prouvé le défaut, écarté le faux gel qui semblait le
protéger — puis s'est arrêté sur une question qu'il a jugée non tranchable seul : quelle identité
mettre dans le `userId` d'un `conversation:joined` pour un participant sans compte ? Le `SocketUser`
anonyme porte `id` ET `participantId` ; « envoyer la mauvaise fait d'un accusé une désinformation
d'identité » ; trancher « demande de lire ce que les clients font ». L'item est reparti au cycle
suivant, non livré.

La réponse tenait en deux `grep` et n'exigeait aucune toolchain :

1. **Le handler jumeau l'envoyait déjà.** `handleConversationLeave` émet `conversation:left` avec la
   clé de `socketToUser` — `participant.id` pour un anonyme. La paire join/leave partage un payload
   et une sémantique : si l'un expédie cette identité en production depuis toujours, l'autre n'a
   aucune décision à prendre, il a une divergence à supprimer. **Chercher le geste symétrique AVANT
   de déclarer une question ouverte** : leave/join, add/remove, subscribe/unsubscribe.
2. **Les clients ne lisaient pas le champ.** `rg "conversation:joined"` rend cinq sites ; les trois
   consommateurs (web `use-socket-cache-sync`, iOS `ConversationSyncEngine` et `ParticipantsView`)
   n'utilisent que `conversationId`. Le seul contrat est que le champ soit PRÉSENT — le struct Swift
   le déclare non optionnel, donc l'omettre casserait le décodage. Une question d'identité se pose à
   qui la lit ; quand personne ne la lit, il n'y a pas de désinformation possible, seulement une
   convention à respecter.
3. **Et une troisième source disait la même chose** : `ROOMS.user(userId ?? id)`, la room personnelle
   que ce socket a DÉJÀ rejointe, plus l'en-tête de `getUnreadCount` qui documente accepter un
   `Participant.id`. Trois sites concordants, zéro ambiguïté résiduelle.

La leçon de méthode, et elle est plus large que ce cas : **« il faudrait lire les clients » est une
tâche de dix minutes, pas un motif de report.** Le cycle 87 a écrit trois paragraphes pour expliquer
pourquoi il ne tranchait pas — plus de travail que la vérification elle-même. Quand un dossier
s'arrête sur « demanderait de lire X », faire la lecture de X est le pas suivant, pas un blocage à
léguer. Le blocage LÉGITIME (leçon 43) est celui qui exige une machine ou un accès qu'on n'a pas :
compiler du Swift, déclencher un workflow sur une porte fermée. Lire un fichier dans le dépôt qu'on
a déjà cloné n'en fait pas partie.

---
