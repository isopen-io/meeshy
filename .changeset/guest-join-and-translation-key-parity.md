---
"@meeshy/gateway": patch
"@meeshy/web": patch
---

Trois silences du temps réel : le join d'un invité, la clé de langue à la lecture, et un socket sain coupé au montage

Trois défauts indépendants, un même effet : du temps réel qui n'arrive pas, sans erreur
nulle part.

## 1. Un invité de lien partagé ne recevait rien de son `conversation:join`

`ConversationHandler.handleConversationJoin` gatait l'accusé `conversation:joined`, le
push du compteur de non-lus **et** les stats de conversation sur `connectedUser.userId`
— `undefined` pour un participant sans compte. Le contrôle d'appartenance juste au-dessus
venait pourtant de le laisser passer, et `socket.join(room)` avait déjà eu lieu : le
socket était **dans** la room, mais aucun des trois événements que tout autre membre
reçoit ne lui était envoyé. Son badge de non-lus restait donc figé sur ce que la dernière
lecture REST avait posé, et l'ouverture d'un fil ne le rafraîchissait jamais.

L'identité portée par `userId` n'était pas une question ouverte, contrairement à ce que le
dossier supposait — trois sites du dépôt la tranchaient déjà, tous dans le même sens :

- le handler **jumeau** `handleConversationLeave` émet `conversation:left` avec la clé de
  `socketToUser`, qui vaut `participant.id` pour un anonyme
  (`AuthHandler._registerUser(participant.id, …)`) ;
- la room personnelle que ce socket a déjà rejointe est `ROOMS.user(userId ?? id)`, même
  convention, documentée dans `socketio/README.md` ;
- `getUnreadCount` documente dans son en-tête qu'il accepte indifféremment un
  `Participant.id` ou un `User.id`.

Et **aucun client ne lit ce champ** : le web n'invalide que sur `conversationId`
(`use-socket-cache-sync.ts`), iOS de même (`ConversationSyncEngine`, `ParticipantsView`)
— les deux traitent `conversation:joined` comme un ack de room, jamais comme une adhésion.

Le test qui encodait le défaut (« joins room … without emitting conversation:joined »)
attribuait la rétention au correctif de sécurité `ccaa9311f` ; celui-ci n'a ajouté que la
vérification d'appartenance, pas une rétention volontaire de l'accusé. Il est retourné.

## 2. `getTranslation()` lisait la clé de langue verbatim quand tous les écrivains la normalisent

Le seul écrivain de `Message.translations` canonicalise sa clé via le SSOT
`normalizeLanguageCode` (`_resolveTargetLanguages`) : une cible `'pt-BR'` est stockée sous
`translations.pt`. La lecture, elle, indexait la clé **verbatim**. Toute cible
région-taggée ou capitalisée — c'est-à-dire tout ce que les clients envoient, iOS
transmettant `Locale.current` (`'pt-BR'`, `'FR'`, `'de-DE'`) — manquait donc sa propre
traduction, pourtant en base une clé plus loin.

`POST /translate` relit `getTranslation` toutes les 500 ms pendant 10 s, puis fabrique un
repli : `[PT-BR] <texte original>`. Le lecteur recevait donc, après dix secondes
d'attente, **le texte source affublé d'une étiquette de langue** — une violation directe
du Prisme Linguistique, qui veut que le contenu traduit s'affiche comme du contenu natif.

La forme canonique sert désormais aussi de clé de cache mémoire : `'FR'` et `'fr'`
partagent une entrée au lieu d'en dupliquer deux, et la seconde lecture ne repart plus en
base. Un repli sur la clé verbatim reste en place pour les documents écrits **avant** la
normalisation des cibles — canonicaliser la lecture ne doit pas rendre leurs lignes
illisibles. La `targetLanguage` rendue est celle réellement servie, la canonique : c'est
elle que `POST /translate` renvoie dans `target_language`.

## 3. Monter `useSocketIOMessaging` coupait un socket sain (web)

L'étape 1A du hook appelait `meeshySocketIOService.reconnect()` **sans condition** au
montage. Or `reconnect()` n'est pas « connecte si besoin » : c'est `disconnect()` suivi
d'un `connect()` différé par backoff exponentiel (`ConnectionService.reconnect`, soit
1 000–2 000 ms au premier essai). Monter le hook sur une connexion établie coupait donc le
temps réel une à deux secondes — et cinq composants montent ce hook, si bien qu'ouvrir un
profil suspendait la réception de tout ce qui était à l'écran.

L'étape 1C, quelques lignes plus bas, fait le même geste correctement gardé
(`!isConnected && !isConnecting`). C'est cette garde qui manquait, et c'est elle qui a été
appliquée.

## Vérification

- **RED prouvé pour chacun** : les tests ont été écrits avant le correctif et vus rouges
  (3 rouges sur le join d'invité, 4 sur la clé de langue, 2 sur le montage web), puis
  verts sans autre changement.
- Le socle de mocks de `use-socketio-messaging.test.tsx` pose désormais une connexion
  froide dans `beforeEach` : `jest.clearAllMocks()` n'efface pas les `mockReturnValue`, si
  bien qu'un test déclarant une connexion saine la léguait à tous les suivants — l'ordre
  des tests décidait du verdict des effets de montage.
- Suite gateway complète verte, suites web du hook vertes, `tsc --noEmit` sans diagnostic
  sur les deux paquets.
