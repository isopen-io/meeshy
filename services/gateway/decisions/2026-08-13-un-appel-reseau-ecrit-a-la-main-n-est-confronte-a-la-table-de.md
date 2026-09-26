## 2026-08-13 : Un appel réseau écrit à la main n'est confronté à la table de routage de personne

**Statut** : Accepté

**Contexte** : `NSEDataSync.syncMessage` — le préchargement de message de l'extension de
notification iOS — faisait `GET /api/v1/conversations/:conversationId/messages/:messageId`. La
gateway n'enregistre à ce chemin que `PUT` (édition) et `DELETE` : **aucun `GET` n'y a jamais
existé**. Chaque préchargement répondait donc 404, depuis toujours, et l'appelant
(`completion(false)`, ignoré par `prefetchMessageData`) en faisait un silence.

Deux garanties reposaient dessus, et aucune ne tenait.

1. **Le démarrage à froid sur tap de notification n'a jamais eu son message en local.** Le
   répertoire de staging App Group restait vide, `NSEPendingMessageConsumer.consumeAll()` ne
   consommait jamais rien, et l'ouverture attendait le réseau — l'exact opposé du principe
   Cache-First / Instant App.
2. **Un push E2EE ne déposait rien du tout.** `NotificationService.prePersistMessage` saute
   délibérément les messages chiffrés — décision correcte, le `content` du push n'est qu'un
   marqueur et l'écrire ferait rendre du contenu contrôlé par l'attaquant — *parce que*
   « NSEDataSync already fetches the canonical record from the gateway […] that's the trustworthy
   source ». C'est une PRÉMISSE au sens du cycle 97, et elle était fausse le jour où elle a été
   écrite. Le saut délibéré + la récupération morte = zéro donnée stagée.

Ce qu'aucun garde-fou n'a vu : le couple méthode/chemin est une chaîne interpolée dans une cible
qui n'importe pas le SDK. Le compilateur la valide, les tests du client ne l'atteignent pas
(`NSEDataSync` n'appartient à aucune cible de test), et ceux du serveur ne la connaissent pas.

**Décision** :
- **`NSEDataSync.syncMessage` vise `GET /messages/:messageId`** — la lecture mono-message canonique
  du dépôt : appartenance à la conversation vérifiée côté serveur, même enveloppe
  `{ success, data }`, `APIMessage` décodable tel quel par `NSEPendingMessageConsumer`.
  `conversationId` reste un paramètre de la fonction : il KEYE le blob déposé, il n'entre pas dans
  la requête.
- **La branche E2EE de `prePersistMessage` porte désormais son avertissement** : le saut n'est sûr
  que tant que la récupération fonctionne, et qui déplace l'endpoint hérite de cette branche.

**Alternatives rejetées** :
- **Enregistrer `GET /conversations/:id/messages/:messageId` côté gateway** pour que le client
  tombe juste : cela ferait naître une SECONDE lecture mono-message à maintenir, dans un dépôt dont
  ces cycles retirent précisément les doublons de routes. La lecture canonique existe déjà et
  vérifie la même chose.
- **Rendre l'endpoint testable en ajoutant `NSEDataSync` à la cible de test** (le motif existe :
  `NSEDecryptor` et les helpers de `MeeshyShareExtension` ont la double appartenance) : le fichier
  utilise `URLSession.shared` sans injection, donc le rendre vraiment testable demande un lot de
  refactorisation à part. Nommé en suite, pas bâclé ici.

**Conséquences** :
- **Le préchargement de notification fonctionne pour la première fois** : un tap sur push ouvre la
  conversation avec le message déjà en GRDB, et un push E2EE dépose enfin quelque chose.
- **Ce que la décision n'assure PAS** : `NSEDataSync` n'appartient toujours à aucune cible de test —
  seul le build CI couvre le changement. Et les autres appels réseau écrits à la main du dépôt
  (`MeeshyShareExtension`, `MeeshyWidgets`, Android hors `MessageApi`) n'ont pas été confrontés à
  la table de routage.

**Tests** : le correctif iOS lui-même n'est gardé que par le build CI (cf. ci-dessus). Le contrat
SERVEUR dont il dépend désormais l'est : `message-detail-read-receipts.test.ts` (4 témoins, harness
Fastify réel + double Prisma nourrissant le **VRAI** `MessageReadStatusService`) fige que
`GET /messages/:messageId` sert des compteurs d'accusés calculés et respecte l'opt-out
`showReadReceipts` — la couverture existante de cette route (`messages.test.ts`) double le service
et ne peut donc pas voir l'opt-out.

**Note de convergence** : le défaut « la route sert les colonnes dénormalisées mortes » a été
instruit en parallèle et livré par **#2931** (délégation des deux routes à
`getConversationReadStatuses`, `filterReadReceiptVisible`, plafond de 50). Ce lot-ci ne le refait
pas — il en DÉPEND, et c'est ce qui rend le repointage de la NSE sûr : sans #2931, le blob poussé
dans l'App Group aurait écrasé le cache GRDB avec des compteurs à zéro, faisant RÉGRESSER des
coches déjà acquises à chaque push. Les quatre témoins ci-dessus, écrits avant que #2931 ne
paraisse, étaient RED sur l'ancien code et passent sur le sien sans retouche : confirmation
indépendante, pas re-livraison.
