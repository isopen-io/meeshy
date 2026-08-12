---
"@meeshy/gateway": patch
"@meeshy/web": patch
"@meeshy/translator": patch
---

Cinq défauts temps réel : un invité qui rejoignait en silence, une traduction fabriquée, un socket coupé, une réaction fantôme et un audio envoyé en double

## 1. Gateway — l'invité de lien partagé rejoignait en silence

Le handler gatait **toutes** ses émissions post-join sur `connectedUser.userId`,
`undefined` pour un anonyme — alors que le contrôle d'appartenance juste au-dessus l'a
laissé passer et que le socket EST dans la room. Résultat : un invité rejoignait en
silence, badge de non-lus vide, et rien pour le remplir.

`getUnreadCount` accepte indifféremment un `Participant.id` ou un `User.id` — son en-tête
nomme même le chemin anonyme comme le cas courant. Le compteur sort donc du garde et
reçoit `participantId`. **Pas `connectedUser.id`** (le jeton de session) : il ne résout
aucune ligne Participant et aurait rendu `0` en silence, un badge « correct » et faux. Un
test verrouille l'identité exacte transmise, pas seulement le fait qu'un compteur parte.

**L'accusé `conversation:joined` part lui aussi**, sous la même identité. Le blocage annoncé
— « quelle identité mettre dans `userId` pour un participant sans compte ? » — s'est dissous à
la lecture des clients : les cinq consommateurs (web `use-socket-cache-sync`,
`use-stream-socket`, `orchestrator` ; iOS `ConversationSyncEngine`, `ParticipantsView`)
n'exploitent QUE `conversationId`. Aucun ne lit `userId`.

La seule contrainte dure est de **décodage** : `ConversationParticipationEvent.userId` est un
`String` **non optionnel** côté Swift — omettre le champ ferait échouer le décodage et l'accusé
serait silencieusement jeté sur iOS. Le champ doit donc être présent ; sa valeur n'est lue par
personne. D'où `participationId = userId ?? participantId`, une seule résolution d'identité
pour les deux émissions.

## 2. Gateway — une traduction présentée comme telle, mais jamais traduite

`getTranslation()` lisait `translations[targetLanguage]` **verbatim** quand tous les
écrivains stockent sous la forme canonique de `normalizeLanguageCode` (`'pt-BR'` →
`'pt'`). Une demande `pt-BR` interrogeait donc une clé absente pendant que la traduction
attendait une clé plus loin ; l'appelant sondait 20 fois sur 10 s, puis rendait un repli
**fabriqué** `[PT-BR] <texte original>` — le texte source affublé d'une étiquette de
langue. Violation directe du Prisme Linguistique, et dans sa pire forme : du contenu non
traduit présenté comme traduit.

Verbatim d'abord, forme normalisée en repli : un document legacy portant réellement une
clé régionale reste servi tel quel. Aucune traduction ne change de gagnant — seules
celles qu'on ne trouvait pas deviennent trouvables. La cible **rendue** reste celle
demandée (`'pt-BR'`), le client corrèle sa requête dessus.

## 3. Web — ouvrir un profil coupait la connexion temps réel

`useSocketIOMessaging` appelait `meeshySocketIOService.reconnect()` **sans condition** au
montage. Or `reconnect()` n'est pas un « connecte si besoin » : c'est `disconnect()` suivi
d'une reconnexion différée par backoff, 1 à 2,5 s au premier essai. Cinq composants
montent ce hook — ouvrir un profil coupait donc un socket parfaitement sain, messages
temps réel compris.

L'étape 1C, quinze lignes plus bas, fait exactement le même geste correctement gardé
(`!isConnected && !isConnecting`) ; c'est cette garde qui est appliquée au montage.

## 4. Web — une réaction refusée par le serveur restait affichée pour toujours

Les deux mutations de réaction gardaient leur rollback derrière
`if (context?.previousData)`. Or `onMutate` **fabrique** l'état optimiste quand le cache
est vide : `previousData` vaut alors `undefined`, et le garde refusait précisément de
défaire ce qui venait d'être inventé.

Le rollback devient inconditionnel — mais `setQueryData(key, undefined)` n'y suffit pas :
React Query traite `undefined` comme « ne rien changer ». Restaurer l'absence de donnée
exige `removeQueries`. `restoreReactionSnapshot` retire donc l'entrée quand il n'y avait
rien, et la réécrit sinon.

## 5. Translator — chaque audio traduit partait en double

Bloc `if audio_bytes:` dupliqué verbatim dans le sender multipart : 2× la charge ZMQ par
message vocal multilingue. La seconde copie écrasait en outre la métadonnée avec son
propre index, si bien qu'elle désignait le doublon et que la première copie restait un
frame orphelin. Rien ne cassait — le gateway résout les frames strictement par
`info.index`, bornes vérifiées — ce qui explique la survie du défaut. Origine sans
ambiguïté au `git log -L` : un hunk de conflit résolu en double.

## Vérification

- **RED prouvé pour chacun des quatre correctifs TypeScript** avant correction ; le
  rollback de réaction est resté rouge après un premier correctif « évident »
  (`setQueryData(key, undefined)`, no-op), ce que seul le test a révélé.
- **Suite gateway complète verte** : 654/654 suites, 16 504/16 504 tests.
  `tsc --noEmit` gateway : 0 diagnostic.
- **Suite web complète verte** : 563/563 suites, 12 089 tests passés, 21 ignorés,
  0 échec.
- **Réserve sur le translator** : sa suite pytest n'a pas pu être exécutée dans cet
  environnement (`numpy`/`torch` s'installent depuis l'index PyTorch, bloqué par le
  proxy). La sûreté du retrait est établie par lecture des deux côtés du contrat —
  producteur, et consommateur `extractAudioBinaryFrames` — **pas par exécution**.
