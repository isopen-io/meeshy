# Decisions - services/gateway (Fastify API Gateway)

## 2026-08-16 (2) : une préférence, un cache — la mémoire vit avec le résolveur, pas dans l'instance

**Statut** : Accepté

**Contexte** : le cycle précédent (ADR ci-dessous) a raccordé l'écran Confidentialité au rangement
que les portes de diffusion lisent. Restait ceci : ces portes MÉMOÏSENT, cinq minutes, et rien ne
purgeait. Couper ses accusés de lecture prenait donc effet jusqu'à cinq minutes plus tard — une
fenêtre pendant laquelle le serveur diffuse exactement ce que l'utilisateur vient de demander de
taire, pendant que l'écran lui confirme que le réglage est pris.

Le correctif évident — appeler `PrivacyPreferencesService.invalidateCache` depuis la route
d'écriture — ne pouvait PAS marcher, et c'est le vrai constat du cycle : il n'existait pas UN cache
à purger. Le processus en portait SIX, tous sur la même donnée :

| Mémoire | Portes servies |
|---|---|
| `Map` de l'instance du gestionnaire Socket.IO | indicateur de frappe, accusés de livraison, drain de reconnexion |
| `Map` de l'instance du singleton `PresenceVisibilityService` | statut en ligne, « vu à » |
| `Map` de l'instance du plugin `routes/messages.ts` | `broadcastReadStatus` |
| `Map` de l'instance du plugin `routes/conversations/messages.ts` | `broadcastReadStatus` |
| `Map` de l'instance du plugin `routes/message-read-status.ts` | `broadcastReadStatus` |
| `BoundedTtlCache` statique de `MessageReadStatusService` | 5 lecteurs d'accusés nominatifs |

`invalidateCache` existait — sans **aucun** appelant — et l'y brancher n'aurait purgé qu'une copie
sur six. Une purge qui laisse cinq lecteurs chauds ne corrige rien : elle donne seulement l'air
d'avoir corrigé, et le fait de façon non déterministe selon la porte que le client emprunte.

Cinq de ces mémoires venaient d'un seul choix : la `Map` était un champ d'INSTANCE, alors que le
service est construit une fois par plugin. Chacune traînait en prime son propre `setInterval` de
nettoyage, capturant `this` — cinq minuteurs pour la même donnée, et cinq instances que le GC ne
pouvait pas ramasser.

**Décision** : la mémoïsation descend au niveau MODULE, à côté du résolveur dont elle mémoïse le
résultat — `services/preferences/privacy-cache.ts`, voisin de `privacy-storage.ts`. Les deux
familles de lecteurs y passent : `PrivacyPreferencesService` perd sa `Map` et son minuteur,
`MessageReadStatusService._loadReadReceiptOptOuts` perd son cache statique.
`invalidatePrivacyPreferences(userId)` devient le point d'entrée UNIQUE, appelé par
`PUT`/`PATCH`/`DELETE /me/preferences/privacy` et par `DELETE /me/preferences`.

La règle générale : **la mémoire d'une donnée vit à la portée de la donnée, pas à celle de son
lecteur.** Un cache d'instance sur un service construit par plugin ou par requête n'est pas un
cache, c'est N caches — et un point d'invalidation qui n'en atteint qu'un est pire qu'aucun, parce
qu'il se lit comme une garantie.

Le cache étant au module, la purge ne demande AUCUN câblage : la route d'écriture importe une
fonction, elle n'a pas à remonter jusqu'à `fastify.socketIOHandler` pour trouver l'instance du
gestionnaire — chemin qui, de toute façon, n'aurait donné accès qu'à une des six.

**Ce qui a été délibérément écarté** :

- *Purger toutes les catégories.* `invalidateServerCache` ne fait rien hors `privacy` : seule cette
  catégorie a une mémoire côté serveur. Purger sur une écriture audio se lirait comme si les autres
  catégories en avaient une, et ferait payer un refroidissement pour rien.
- *Un cache partagé Redis.* Il réglerait aussi le cas multi-processus (voir Conséquences), au prix
  d'un aller-retour réseau sur des portes appelées à CHAQUE accusé de lecture. La donnée est
  minuscule, le TTL court, et l'écriture purge déjà le processus qui sert l'utilisateur.

**Conséquences** :

- Un réglage de confidentialité prend effet IMMÉDIATEMENT sur le processus qui l'a reçu, pour les
  six portes à la fois.
- Une seule lecture réchauffe tous les lecteurs : la porte des accusés de lecture réutilise
  désormais la lecture faite par le gestionnaire de présence, là où chacun payait la sienne.
- Cinq `setInterval` et cinq `Map` non bornées disparaissent au profit d'un `BoundedTtlCache`
  (5000 entrées, TTL 5 min) qui expire à la lecture et se borne à l'insertion.
- **Borne assumée** : la purge est LOCALE au processus. En déploiement multi-gateway, les autres
  processus rattrapent par l'expiration du TTL — au plus cinq minutes, contre « jamais » avant le
  cycle précédent et « cinq minutes partout » avant celui-ci. L'écriture est enregistrée sans délai
  dans tous les cas.
- Les tests des cinq suites qui vidaient `MessageReadStatusService.readReceiptOptOutCache`
  appellent maintenant `clearPrivacyPreferencesCache()` : la statique a disparu plutôt que d'être
  maquillée en façade, parce qu'un nom qui annonce « le cache des accusés » pour désigner le cache
  de TOUTE la confidentialité rouvrirait la confusion que ce cycle ferme.

## 2026-08-16 : la LECTURE des préférences de confidentialité rejoint l'écriture, pas l'inverse

**Statut** : Accepté

**Contexte** : le dépôt porte deux rangements pour la même préférence — le document JSON
`UserPreferences.privacy` (clés camelCase) et les lignes clé/valeur `UserPreference`
(kebab-case, `show-read-receipts`). L'application n'écrit QUE le premier :
`PUT`/`PATCH /me/preferences/privacy` (`preference-router-factory.ts`), appelée par le web
(`stores/user-preferences-store.ts`) comme par iOS (`OutboxDispatcher`). Toutes les portes de
diffusion lisaient QUE le second : `PrivacyPreferencesService.fetchFromDatabase` /
`fetchManyFromDatabase`, et `MessageReadStatusService._loadReadReceiptOptOuts`. Le seul écrivain
du rangement lu, `PreferencesService.updatePrivacyPreferences`, n'a aucun appelant.

Conséquence : `showReadReceipts`, `showOnlineStatus`, `showLastSeen` et `showTypingIndicator`
étaient INERTES côté serveur. L'utilisateur coupait ses accusés de lecture, son statut en ligne
ou son indicateur de frappe, et le serveur continuait de tout diffuser.

Trois choses rendaient la panne invisible. Le `GET` de la même route relit le document : l'écran
affiche fidèlement le réglage, qui persiste entre lancements et appareils — l'aller-retour est
complet et cohérent, il ne touche simplement jamais la couche qui décide. Le défaut de chaque
préférence étant `true`, une lecture qui ne trouve rien produit exactement le comportement d'un
utilisateur n'ayant rien réglé : ni erreur, ni log, ni anomalie. Et les doubles de test ne
déclaraient que `userPreference` — un témoin qui ne connaît qu'un rangement confirme la lecture
sans jamais vérifier son adressage.

**Décision** : un résolveur unique, `services/preferences/privacy-storage.ts`
(`loadStoredPrivacyPreferences`), lit le document pour tous les utilisateurs demandés, puis
n'interroge les lignes héritées que pour ceux sans document exploitable. Les deux lecteurs y
passent. Le document prime toujours : le repli ne peut donc jamais contredire un réglage courant.

Le repli est conservé parce que l'endpoint `/user-preferences/privacy`, qui écrivait les lignes
clé/valeur, a existé du 12 au 18 janvier 2026 et a été retiré sans reprise de données. Ignorer ces
lignes rouvrirait en silence, pour les utilisateurs ayant réglé pendant cette fenêtre, la fuite
même que ce correctif ferme. Un document vide (`{}`) est traité comme une ABSENCE de document,
sans quoi il ferait taire le repli.

**Ce qui a été délibérément écarté** : faire écrire les deux rangements par la route. C'est le
plus petit diff, et il installe durablement deux sources de vérité pour une même donnée, à charge
pour chaque futur lecteur de deviner laquelle fait foi — exactement la situation qui a produit ce
défaut. `CLAUDE.md` § Single Source of Truth tranche dans l'autre sens.

**Conséquences** : `PreferencesService.updatePrivacyPreferences` est désormais nommé en commentaire
comme non branché et à ne pas rebrancher tel quel — il reste le seul écrivain survivant du
rangement hérité, donc le moyen tout prêt de recréer la divergence. Deux dettes restent ouvertes et
documentées (`tasks/realtime-sync-audit-2026-08-15-cycle46.md`) : la suppression de ce fichier
orphelin, et l'invalidation des caches à l'écriture — sans elle un réglage met jusqu'à cinq minutes
à prendre effet, là où il n'en prenait aucun avant ce cycle.

## 2026-08-13 (3) : La garde `deletedAt` va sur l'ÉCRITURE de l'épingle, pas seulement sur ses lectures

**Statut** : Accepté

**Contexte** : `PUT` et `DELETE /conversations/:id/messages/:messageId/pin` localisaient leur cible
par `{ id, conversationId }` seuls. Toutes les LECTURES de messages du service portent pourtant
déjà `deletedAt: null` — la liste (`GET /conversations/:id/messages`), la recherche, et la liste des
messages épinglés cent lignes sous les routes fautives (`{ pinnedAt: { not: null }, deletedAt: null }`).
Un message supprimé pour tout le monde n'est donc plus un objet épinglable : les deux ÉCRITURES de
l'épingle étaient les seules à ne pas le dire.

L'appel répondait `200`, écrivait `pinnedAt`/`pinnedBy` sur un tombstone, et diffusait
`message:pinned` dans la room de conversation **et** dans la file de rattrapage hors-ligne
(`enqueueOfflineMessageMutation`). Les clients appliquent cet événement à leur état local — web
`use-socket-cache-sync.handleMessagePinned`, iOS `ConversationSocketHandler` → `updatePinned` — et
rien ne les détrompe ensuite : la liste des épinglés filtre ce message, donc aucun rechargement ne
corrige l'état, et l'identité de dédup de la file étant `(messageId, 'pinned')`, l'entrée fantôme se
rejoue à chaque reconnexion jusqu'au TTL de 48 h.

L'unanimité des lectures est ce qui rendait le trou invisible : la donnée fausse est écrite, elle
est diffusée, et aucune lecture ne la rend jamais — donc rien ne la contredit non plus. Le seul
endroit où le défaut existe est **le fil temps réel**.

**Décision** : `deletedAt: null` dans le `where` des deux routes, dans les deux sens du geste.
N'en garder qu'un rouvrirait le trou par l'autre ; la mutation-proof le vérifie séparément (retirer
la garde du `PUT` fait rougir exactement ses 2 témoins, celle du `DELETE` exactement les 2 autres,
sans recouvrement).

**Ce qui a été délibérément écarté** : nettoyer `pinnedAt`/`pinnedBy` au moment de la SUPPRESSION,
de sorte qu'une épingle ne survive jamais à son message. Cela aurait demandé la même ligne dans les
**quatre** chemins qui écrivent `deletedAt` sur un message (`MessageHandler`,
`conversations/messages-advanced.ts`, `messages.ts`, `ExpiredMessagesCleanupService`) — la
duplication en N exemplaires dont un finit par manquer, motif que ce service a documenté trois fois.
La ligne survivante n'est visible nulle part (toutes les lectures filtrent `deletedAt: null`) et le
tombstone lui-même part au balayage : pas de défaut observable, donc pas de geste.

**Conséquence annexe, tranchée dans le même diff** : les deux diffusions composaient leur nom de
room et leur nom d'événement à la main (`` `conversation:${id}` ``, `'message:pinned'`) — les seules
du service à le faire. Le balayage d'audience du dépôt grepe `to(ROOMS.conversation(` (voir la note
de `participants.ts` § `PARTICIPANT_ROLE_UPDATED`, qui le nomme explicitement) : ces deux lignes lui
étaient donc invisibles, ce qui explique qu'un audit d'audience ait pu passer sans les voir. Elles
passent par `ROOMS.conversation()` / `SERVER_EVENTS`, à valeur identique — les tests existants
assertent les chaînes littérales et restent verts sans modification, ce qui est la preuve
d'équivalence. Écrire par la constante rend un site VISIBLE au prochain audit ; le recomposer à la
main l'en exclut, silencieusement et pour toujours.

**Non résolu, relevé ici** : l'épingle sert deux des trois audiences que `broadcastMessageMutation`
documente pour une mutation de message (room + file hors-ligne), jamais la troisième (`user:<id>`,
pour qui est sur la liste de conversations). Instruit et laissé en l'état : aucun client ne rend
aujourd'hui d'état d'épingle sur une ligne de liste, donc pas de défaut observable — même
raisonnement que celui déjà tenu pour `PARTICIPANT_ROLE_UPDATED`. À rouvrir dès qu'une ligne de
liste affiche une épingle.

## 2026-08-13 (2) : L'ACK d'envoi cesse d'annoncer une livraison qu'il n'a pas mesurée

**Statut** : Accepté

**Contexte** : `MessagingService.createSuccessResponse` — le constructeur de l'ACK d'envoi de
message — composait un bloc `metadata` de six sections à chaque message envoyé. Trois d'entre
elles n'étaient pas des mesures :

- `deliveryStatus` valait `{recipientCount: 1, deliveredCount: 1, readCount: 1}` **en dur**. Un
  envoi dans un groupe de douze annonçait « livré à 1, lu par 1 » à l'instant même de la
  persistance, avant que le moindre destinataire ait reçu quoi que ce soit.
- `performance` rapportait `dbQueryTime`, `translationQueueTime` et `validationTime` comme des
  **fractions arbitraires** du temps total (× 0,6 / 0,2 / 0,1). Aucun de ces trois segments n'a
  jamais été chronométré ; leur somme valait mécaniquement 90 % du total.
- `context` portait `isFirstMessage: false` et `triggerNotifications: true` en constantes, et
  faisait DEUX balayages du contenu (`extractMentions` + `containsLinks`) — sur le chemin de
  l'ACK, celui que l'architecture garde délibérément libre de tout effet de bord (« Every
  post-save side effect […] is therefore moved OFF the ACK path »).

**Rien de tout cela n'atteignait un client.** Les TROIS appelants de `handleMessage`
(`MessageHandler.handleMessageSend`, `handleMessageSendWithAttachments`,
`MeeshySocketIOManager.handleAgentResponse`) n'utilisent que `success`, `data` et `error` — et
`MessageHandler._sendResponse` remplace même la réponse entière par `buildMessageAckData(data)`
avant de rappeler le client. Le bloc était calculé puis jeté, à chaque message.

**Décision** : `MessageResponse` ne porte plus de `metadata`. `createSuccessResponse` devient
synchrone et ne fait plus que normaliser `senderId` (Participant.id → User.id) ; `createErrorResponse`
rend `{success, error, data: null}`. Le compte des accusés faisant autorité reste là où il se
calcule — `MessageReadStatusService.getConversationReadStatuses` — et sort par
`GET /conversations/:id/messages` et `GET /messages/:messageId`. **Si l'ACK doit un jour porter un
statut de livraison, il viendra de là, jamais d'une constante.**

**Alternatives rejetées** :
- *Câbler les vrais compteurs sur l'ACK* : coûterait une lecture DB supplémentaire sur le chemin
  le plus chaud du produit, pour une valeur qu'aucun client ne demande — et que tous obtiennent
  déjà par la route de messages et les events `read-status:updated`.
- *Garder `metadata` en ne corrigeant que `deliveryStatus`* : laisserait cinq sections sans lecteur,
  donc cinq occasions de re-diverger (cycle 100 : un champ sans écrivain ne reste pas neutre).

**Conséquences** : charge utile client **inchangée** (le transport ne transmettait déjà rien de ce
bloc) ; deux balayages de contenu et un objet à six branches en moins par message envoyé ; les
types `MessageResponseMetadata`, `DeliveryStatus` (local), `RecipientDeliveryDetail`,
`PerformanceMetrics`, `MessageContext`, `DebugInfo`, `MessageBroadcastPayload` et
`MessageBroadcastEvent` disparaissent de `packages/shared/types/messaging.ts`, faute de tout
producteur comme de tout consommateur.

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


## 2026-08-10 : Le Prisme s'applique à l'APERÇU de la liste, et c'est au serveur de le rendre possible

**Statut** : Accepté

**Contexte** : le principe produit dit « le prisme s'applique à TOUT le contenu — messages texte, transcriptions audio, métadonnées, **previews** ». La ligne de liste de conversations était la seule surface où il ne s'appliquait pas, et pas faute de client : le SDK iOS porte `MeeshyConversation.resolvedLastMessagePreview(preferredLanguages:)` avec sa batterie de douze témoins (ordre de préférence, refus explicite de retomber sur une traduction quelconque), et la facette `LastMessageFacet.translations` qui rend l'écriture des onze champs `lastMessage*` atomique.

Ces deux surfaces ne recevaient **jamais** de données par le chemin REST. Le `select` du dernier message dans `GET /conversations` ne chargeait ni `Message.translations` ni `Message.originalLanguage` ; `APIConversation` n'avait aucun champ où les décoder. La documentation du champ SDK l'écrivait noir sur blanc — « when the gateway starts shipping these in `/conversations` it will be wired through the API → domain converter; until then the field stays `nil` » — et renvoyait à un contournement applicatif (`ConversationListViewModel.attachLastMessageTranslations`) qui **n'existe nulle part dans le dépôt**.

Le chemin socket, lui, est câblé (`ConversationSyncEngine.previewTranslations(from:)` dérive la carte du `message:new` reçu) mais ne comble rien : les traductions arrivent **après** le message, par `message:translation`, si bien que l'`APIMessage` du `message:new` les porte rarement. Au démarrage à froid comme au rafraîchissement de liste, chaque ligne restait donc dans la langue de l'expéditeur.

**Décision** :
- **Les deux champs vivent au niveau CONVERSATION**, pas dans `lastMessage` : `lastMessageOriginalLanguage` et `lastMessageTranslations`. C'est la clé que `MeeshyConversation` décode depuis toujours pour son cache disque, et la carte compacte `{ langue: aperçu }` n'a pas la forme de `Message.translations` (un tableau de `MessageTranslation`) — deux formes sous un même nom auraient dérivé.
- **La carte est restreinte aux langues du LECTEUR**, résolues une fois par page via `resolveUserLanguagesOrdered` (seule autorité du dépôt sur l'ordre du Prisme), depuis l'utilisateur déjà chargé et mis en cache par le middleware d'auth — **aucune requête supplémentaire** sur ce hot path. Servir les N langues de la conversation multiplierait le poids de la liste pour un champ dont le client n'affiche qu'UNE valeur.
- **Quatre exclusions, chacune fermant un cas distinct** (`routes/conversations/utils/last-message-preview.ts`) : hors prisme du lecteur ; langue d'origine (elle EST déjà `lastMessage.content`) ; traduction **chiffrée** (`isEncrypted` — son `text` est un cryptogramme, l'afficher mettrait du base64 dans la liste) ; `text` non exploitable (la colonne est un JSON libre côté Mongo).
- **`null`, jamais `{}`, quand il ne reste rien** : le résolveur client doit pouvoir retomber sur l'original, ce qui EST la règle #3 du Prisme.
- **Le plafond d'aperçu s'applique aux traductions comme au contenu.** `truncateMessagePreview` et son cap déménagent dans le même module que le nouveau constructeur : la troncature de l'aperçu a désormais un propriétaire unique, et une traduction de 5 000 caractères ne peut plus contourner un plafond posé pour le seul `content`.
- **Le schéma de réponse déclare les deux champs.** `fast-json-stringify` retire en silence tout ce qu'il ne connaît pas — le même piège a déjà coûté `customName`, `reaction` et `_count`. `lastMessageTranslations` a des clés dynamiques, donc `additionalProperties: { type: 'string' }` : sans lui, un schéma objet sans `properties` sérialise `{}`, panne plus discrète encore que le strip.

**Alternatives rejetées** :
- **Renvoyer `translations` brut dans `lastMessage` via le spread** : le blob JSON complet (une entrée par langue de la conversation, chacune avec modèle, score, champs de chiffrement) à chaque ligne de liste, pour un champ dont le client lit une chaîne. Le spread est au contraire **déstructuré** pour que ces deux colonnes ne fuient pas.
- **Une résolution serveur qui renverrait DÉJÀ l'aperçu dans la langue du lecteur** (un seul champ `lastMessagePreview` traduit) : elle détruirait l'information « ceci est une traduction », que le client signale par un indicateur discret, et elle ferait diverger `lastMessagePreview` de `lastMessage.content` sans que rien ne le dise.
- **Corriger côté client seul** (rejouer les traductions depuis le cache de messages) : c'est le contournement que la doc SDK annonçait et que personne n'a écrit. Il ne peut rien au démarrage à froid, où le cache est vide — c'est-à-dire dans le cas qui est cassé.
- **Étendre le même traitement à `emitConversationPreviewUpdate` dans ce lot** : ce fanout adresse N participants dont les prismes diffèrent ; le faire correctement demande un payload par destinataire, question de conception distincte. Nommé en suite, pas bâclé ici.

**Conséquences** :
- **La liste de conversations parle enfin la langue du lecteur dès le premier chargement**, sur iOS comme sur toute surface qui consommera les deux champs.
- **Le poids de la liste augmente de la seule carte utile** : au plus une entrée par langue du prisme du lecteur (4 au maximum), chacune plafonnée à 300 points de code.
- **Ce que la décision n'assure PAS** : le fanout temps réel `conversation:updated` (édition/suppression) n'emporte toujours pas le prisme, donc une ligne rafraîchie par ce chemin retombe sur l'original jusqu'à la synchro suivante ; `routes/conversations/search.ts` construit son propre `lastMessage` à la main et reste hors prisme ; le web rend encore `lastMessage.content` brut (`formatLastMessage`) et devra consommer les deux nouveaux champs.

**Tests** : 18 neufs — 12 sur la source (`__tests__/unit/routes/conversations/last-message-prisme.test.ts` : appariement de langue, casse, exclusion de l'original, exclusion du chiffré, plafond, paire de surrogates, `null` vs `{}`, JSON de forme inattendue), 6 sur la route (`conversation-core.test.ts`, dont la forme du `select`), 2 sur le schéma partagé (`api-schemas.test.ts`), 6 côté SDK (`ConversationListPrismeWiringTests.swift`). Le double de `@meeshy/shared/utils/conversation-helpers` garde l'implémentation RÉELLE de `resolveUserLanguagesOrdered` : la doubler aurait rendu les témoins de prisme tautologiques. Sondes de fidélité en sept temps — `select` amputé : 1 rouge (le seul témoin qui puisse le voir, les autres injectent la donnée) ; exclusion de l'original retirée : 1 ; garde `isEncrypted` retirée : 1 ; `{}` au lieu de `null` : 3 ; troncature retirée : 2 ; prisme du lecteur ignoré : **5** ; les deux champs retirés de la ligne (le défaut d'origine) : **5**.


## 2026-08-10 : Une suppression de commentaire annonce les ids qu'elle emporte, pas sa seule cible

**Statut** : Accepté
**Contexte** : `PostCommentService.deleteComment` soft-delete le sous-arbre entier (cible + descendants, arbitrairement profond) et décompte `commentCount` d'autant — le retrait des notifications porte déjà sur cette même liste. Mais la valeur de retour ne disait que `{ success: true }` : la liste mourait dans la méthode. Son seul appelant, la route `DELETE /posts/:postId/comments/:commentId`, n'avait donc rien d'autre à mettre dans `broadcastCommentDeleted` que le `commentId` reçu en paramètre. Les réponses du commentaire supprimé restaient affichées chez tout client qui les avait dépliées — **et aucun refetch ne les enlevait** : `getComments` filtre `parentId: null`, le parent supprimé n'est plus rendu, donc `getReplies` n'est plus jamais appelé pour elles. Seul un rechargement complet nettoyait le fil. Le compteur, lui, était juste (`commentCount` voyage en ABSOLU) : l'écran affichait donc un total en désaccord visible avec ses propres lignes.

**Décision** :
- `deleteComment` rend `deletedCommentIds` — **exactement** la liste passée au soft-delete, calculée une seule fois et réutilisée par le décompte, le retrait des notifications et l'annonce. Pas de seconde dérivation : après le soft-delete, reconstruire le sous-arbre demanderait de relire des lignes que `NOT_DELETED` masque désormais.
- `CommentDeletedEventData.deletedCommentIds` est **optionnel** (`readonly string[] | undefined`). Additif par construction : iOS et Android gardent le comportement d'avant sans changer une ligne, et pourront l'adopter à leur rythme.
- Un lecteur du champ **doit** se replier sur `[commentId]` quand il est absent. C'est le cas du rejeu idempotent (`onDuplicate` de `withMutationLog`), qui ne rend qu'un `{ id }`.

**Alternatives rejetées** :
- **Reconstruire le sous-arbre dans la route** : impossible après coup sans requête dédiée ignorant `deletedAt`, et ce serait une seconde dérivation de la même règle — la classe de bug que `posts/ephemeralPosts.ts` a déjà coûté un cycle à refermer.
- **Émettre un `comment:deleted` par id retiré** : N broadcasts là où un suffit, chacun portant un `commentCount` identique et absolu, donc N−1 patchs redondants sur chaque client.
- **Se replier sur une liste vide plutôt que `[commentId]`** : ferait survivre la cible elle-même à l'écran sur le chemin de rejeu — une régression franche par rapport à l'existant.
- **Rendre le champ obligatoire** : forcerait iOS et Android à bouger dans le même cycle pour un gain nul chez eux tant qu'ils ne le lisent pas.

**Conséquences** :
- Le payload grossit du nombre de descendants — borné par la profondeur réelle d'un fil, et seulement sur l'événement de suppression.
- Le web purge tous ses caches de commentaires du post en une passe (liste principale ET sous-caches de réponses, que le préfixe de clé `posts.comments(postId)` couvre déjà).
- **iOS et Android ne montraient pas ce défaut** — vérifié en lisant leur code, pas supposé. Chacun compense localement : iOS `PostDetailViewModel` fait `repliesMap[id] = nil` + `expandedThreads.remove(id)` sur chaque `comment:deleted`, Android `PostCommentsViewModel.onCommentDeleted` appelle `CommentRepliesState.removedThread(commentId)`. Deux re-dérivations indépendantes, dans deux langages, d'une liste que le serveur connaissait et taisait. Le web était le seul client sans cette compensation — d'où un défaut visible là seulement. `deletedCommentIds` rend ces traversées locales inutiles : elles pourront céder la place à un retrait autoritatif, ce qui est le vrai gain de fond de cette décision.

**Tests** : +3 `PostCommentService.test.ts` (la liste rendue = la liste soft-deletée, cible seule sur une feuille, sous-arbre profond), +2 `routes/posts/comments.test.ts` (le broadcast porte la liste ; repli sur la cible au rejeu), +2 web `use-post-socket-cache-sync.test.tsx` (le sous-arbre annoncé quitte les caches de réponses ; repli sans liste). Trois sondes de fidélité, chacune isolant exactement ses témoins.

## 2026-07-31 : Le curseur read/delivered ordonne par `createdAt`, plus par chaine ObjectId

**Statut** : Accept
**Contexte** : La garde de fraicheur atomique de `MessageReadStatusService._advanceCursor` (et son jumeau `isStaleCursorMessageId` du chemin mark-unread, `routes/conversations/messages.ts`) comparait deux ObjectId MongoDB par ordre **lexicographique de chaine hex** comme proxy de chronologie. Un ObjectId n'encode la date de creation qu'a la **seconde** (4 premiers octets) ; les 5 octets suivants sont un aleatoire **par process**. Deux messages crees dans la meme seconde sur des process gateway **differents** (scale horizontal) trient donc par chaine dans un ordre **sans rapport** avec la vraie recence. Consequence : la double coche de l'auteur pouvait se figer sur un message anterieur, voire **reculer** le curseur vers un message plus ancien (resurrection de non-lus) — transitoire, self-healing au prochain recu d'une seconde ulterieure, mais reel.

**Decision** :
- Deux champs `ConversationReadCursor.lastReadMessageCreatedAt` / `lastDeliveredMessageCreatedAt` (`DateTime?`) memorisent le `createdAt` du message pointe. La garde ordonne desormais par ce `createdAt` (precision milliseconde, stable inter-process) via `buildCursorFreshnessGuard` (fonction pure, exportee et testee en isolation). L'ordre ObjectId n'est conserve qu'en **repli** pour les curseurs legacy (`createdAt` null tant qu'une avance ne l'a pas renseigne) et pour un message introuvable (supprime entre l'envoi et le recu).
- Le pair `(id, createdAt)` doit rester coherent chez **tous** les ecrivains du curseur : le chemin mark-unread (`upsert`) ecrit maintenant `lastReadMessageCreatedAt` en meme temps que `lastReadMessageId`. Un `createdAt` laisse perime aurait fausse la garde et rejete des avances de lecture legitimes.

**Alternatives rejetees** :
- **Comparer sur `lastReadAt`/`lastDeliveredAt` (temps de traitement serveur)** : ce n'est pas le temps du message ; deux recus traites a des instants proches ne refletent pas l'ordre des messages.
- **Lire l'etat courant puis decider en memoire** : reintroduit le TOCTOU que la garde atomique dans le WHERE de l'`updateMany` ferme deja (deux appels concurrents liraient le meme curseur non avance).
- **Ajouter un departage ObjectId a `createdAt` egal (meme milliseconde)** : rejete pour la simplicite ; une egalite stricte au milliseconde inter-process est bien plus rare que la collision a la seconde d'aujourd'hui, et se resout au recu suivant (stall transitoire, jamais un recul).

**Consequences** :
- Additif MongoDB : les curseurs existants ont `createdAt` null et empruntent le repli ObjectId jusqu'a leur premiere avance, qui renseigne le champ. Aucune migration/backfill.
- Une lecture `message.findUnique({ select: { createdAt } })` supplementaire par avance de curseur (chemin d'ecriture d'arriere-plan, requete par `_id` — la moins couteuse). Acceptable.

**Tests** : +5 `MessageReadStatusService.test.ts` (helper pur + inversion meme-seconde inter-process : ni recul ni stall), +2 `messages-routes.test.ts` (staleness mark-unread ordonnee par createdAt + ecriture coherente du pair). Suite gateway complete verte (565 suites).

## 2025-01: Framework - Fastify 5.7
**Statut**: Accept
**Contexte**: Gateway haute performance pour 100k+ messages/seconde
**Decision**: Fastify 5.7 avec validation JSON Schema (Ajv), systme de plugins, async/await natif
**Alternatives rejet**: Express (2-3x plus lent, callbacks, mauvais TS support), Nest.js (trop opinionn, overhead DI style Angular)
**Cons**: cosystme plus petit qu'Express, courbe d'apprentissage

## 2025-01: WebSocket - Socket.IO 4.8 avec multi-device
**Statut**: Accept
**Contexte**: Messagerie temps rel bidirectionnelle avec reconnexion et fallback
**Decision**: Socket.IO 4.8, rooms normalises (`conversation:{id}`), maps multi-device (`userSockets: Map<userId, Set<socketId>>`)
**Alternatives rejet**: WebSocket natif (pas de reconnexion/rooms), Firebase RTDB (vendor lock-in)
**Cons**: Convention `entity:action-word` doit tre enforce (hyphens PAS underscores), `emit()` n'attend pas les Promises

## 2025-01: IPC - ZeroMQ PUSH/SUB
**Statut**: Accept
**Contexte**: Communication ultra-rapide Gateway <-> Translator pour traductions temps rel
**Decision**: ZMQ PUSH (port 5555) vers Translator PULL, Translator PUB (port 5558) vers Gateway SUB. Multipart: Frame 1 = JSON, Frames 2+ = binaire
**Alternatives rejet**: gRPC (latence protobuf, overhead pour binaire), RabbitMQ/Kafka (broker inutile pour point-to-point), REST polling (trop lent)
**Cons**: Pas de persistence messages, gestion manuelle du cycle de vie des sockets
**Attention**: `binaryFrames[0]` = premier binaire (PAS index [1]). Singleton ZMQ obligatoire

## 2025-01: Auth - Unified Auth (JWT + Session Tokens)
**Statut**: Accept
**Contexte**: Support simultan des utilisateurs enregistrs (JWT) et anonymes (session token)
**Decision**: Middleware unifi `UnifiedAuthContext` avec `type: 'jwt' | 'session' | 'anonymous'`, trusted sessions pour "remember me"
**Alternatives rejet**: OAuth2/OIDC (overkill), Passport.js (Express-oriented), session-only (incompatible mobile stateless)
**Cons**: Plus complexe qu'un seul type d'auth, rtro-compatibilit `request.user`/`request.auth`

## 2025-01: Database - Prisma 6.19 + MongoDB 8
**Statut**: Accept
**Contexte**: Schma flexible pour messaging, types auto-gnrs, support transactions
**Decision**: Prisma ORM avec MongoDB (replica set), schma unique dans `packages/shared/prisma/schema.prisma`
**Alternatives rejet**: Mongoose (types manuels, populate() stringly-typed), PostgreSQL (schma rigide pour documents)
**Cons**: Support MongoDB Prisma moins mature que PostgreSQL, pas de full-text search natif

## 2025-01: Cache - Redis avec fallback mmoire
**Statut**: Accept
**Contexte**: Le service ne doit jamais crasher cause de Redis
**Decision**: RedisWrapper singleton, fallback automatique vers `Map<string, CacheEntry>` aprs 3 checs, `permanentlyDisabled` flag
**Alternatives rejet**: Redis seul (crash si Redis down), mmoire seul (perdu au restart), Memcached (client async moins mature)
**Cons**: Mode mmoire non partag entre instances, taux de cache hit rduit si Redis tombe

## 2025-01: Erreurs - Hirarchie custom d'erreurs
**Statut**: Accept
**Contexte**: Rponses d'erreur structures et types pour le frontend
**Decision**: `BaseAppError` avec hirarchie (Auth/Permission/NotFound/Conflict/Validation/RateLimit/Internal), mapping Prisma (P2002/P2025), flag `isOperational`
**Alternatives rejet**: Erreurs gnriques (pas de type safety), codes HTTP bruts (pas d'info actionnable)
**Cons**: Plus de boilerplate, discipline ncessaire pour utiliser les bonnes classes

## 2025-01: Rate Limiting - Multi-niveaux
**Statut**: Accept
**Contexte**: Protection contre spam, scraping, DDoS
**Decision**: Global 300 req/min par IP, messages 20/min par user, mentions max 50/msg et 5/min par destinataire, Signal Protocol limits spcifiques
**Alternatives rejet**: Rate limit unique (pas assez granulaire), externe (Cloudflare only, pas de contrle fin)
**Cons**: Limites mmoire ne fonctionnent pas en multi-instance (besoin Redis pour distribu)

## 2025-01: Encryption - Signal Protocol + AES-256-GCM serveur
**Statut**: Accept
**Contexte**: Trois modes de chiffrement selon le besoin (E2EE, serveur, hybride)
**Decision**: Signal Protocol (`@signalapp/libsignal-client`), ServerKeyVault avec envelope encryption, LRU cache 500 cls/30min TTL
**Alternatives rejet**: Custom crypto (ne jamais rouler le sien), AES seul (pas de forward secrecy)
**Cons**: E2EE dsactive la traduction, Signal Protocol ncessite impl ct client

## 2025-01: Logging - Pino + PII Redaction
**Statut**: Accept
**Contexte**: Logs structures pour aggregation, conformit RGPD
**Decision**: Pino (5x plus rapide que Winston), redaction automatique PII (email, userId, IP hashes), child loggers par module
**Alternatives rejet**: Winston seul (plus lent, legacy), console.log (pas structur)
**Cons**: Double systme logging (Pino + Winston legacy), redaction complique le debugging

## 2025-01: Audio - Pipeline WebSocket-only
**Statut**: Accept
**Contexte**: Rsultats de traduction progressifs en temps rel
**Decision**: Audio uniquement via WS `message:send-with-attachments`, pipeline 3 tapes (Whisper -> NLLB -> Chatterbox), vnements progressifs
**Alternatives rejet**: REST (pas de streaming, ncessite polling), pipeline unique (pas de rsultats intermdiaires)
**Cons**: Traduction audio indisponible pour clients REST-only, connexion WS persistante requise

## 2025-01: Push - Firebase + APNs dual
**Statut**: Accept
**Contexte**: Push cross-platform (iOS/Android/Web) + VoIP iOS
**Decision**: FCM pour cross-platform, APNs pour iOS VoIP (PushKit), filtrage par prfrences utilisateur, DND
**Alternatives rejet**: OneSignal/Pusher (cot par notification, vie prive), FCM seul (pas de VoIP iOS)
**Cons**: Setup complexe (deux providers), maintenance certificats APNs + credentials FCM

## Phase 4 — `clientMessageId` idempotency dedup (2026-05-09)

**Contexte** : Les retries reseau (offline queue iOS, double-tap web, multi-device sync) produisaient des messages dupliques cote serveur. Phase 4 introduit un identifiant client-genere `cid_<uuid v4 lowercase>` qui sert de cle d'idempotence.

**Decision** :
- Le client (iOS, web, anonymous chat) genere un `clientMessageId` AVANT envoi, format `cid_<uuid v4 lowercase>` (helper centralise `packages/shared/utils/client-message-id.ts` + miroir Swift `packages/MeeshySDK/Sources/MeeshySDK/Utils/ClientMessageId.swift`).
- Le serveur (`MessagingService.handleMessage` -> `MessageProcessor.saveMessage`) applique le pattern **catch-on-conflict atomique** : `prisma.message.create` direct, capture P2002 sur duplicate-key, fallback `findFirst` pour retourner l'existant.
- L'unicite est garantie par un **index unique partiel MongoDB** sur `(conversationId, clientMessageId)` avec `partialFilterExpression: { $exists: true, $type: "string", $ne: "" }` — manage manuellement (cf migration `2026-05-09-message-client-id.mongodb.js`), PAS via `@@unique` Prisma (qui produirait un index non-partial cassant les rows historiques sans le champ).
- Le `findUnique` Prisma est remplace par `findFirst({ where: { conversationId, clientMessageId } })` pour cette meme raison.

**Alternative rejetee** : `findUnique` pre-INSERT n'est PAS atomique (deux requetes concurrentes passent toutes deux le `findUnique` retourne null avant qu'une n'INSERT). Le pattern `INSERT direct + catch P2002` collapse ce checkpoint en une seule round-trip.

**Consequences** :
- **Performance** : ~5% de latence d'ecriture additionnelle MongoDB 8 sur le path nominal. Sur la cible 100k msgs/s du projet, ce n'est pas le goulot ; le plafond reste la connection pool Prisma.
- **Sharding-ready** : l'index est compatible avec le pattern de sharding `{ conversationId: "hashed" }` (cle de shard alignee, pas de scatter-gather sur le dedup). Hors scope de Phase 4 mais documente pour le futur.
- **Re-translate sur dedup hit** : si la premiere insertion a reussi mais le PUSH ZMQ vers translator a echoue (translator down), le dedup hit re-pousse via `void messageTranslationService.translate(message).catch(...)` (fire-and-track avec capture d'erreur). Si traductions deja presentes, skip.
- **Privacy-preserving broadcast** : le serveur strip `clientMessageId` du payload `message:new` envoye aux autres participants ; seul le sender recoit le champ pour la reconciliation iOS / web.
- **Contrat cross-platform pinne par tests** : `services/gateway/src/__tests__/unit/utils/client-message-id.test.ts` (13 tests) verrouille la regex `cid_<uuid v4 lowercase>`, l'unicite (1000 invocations), le rejet des prefixes legacy (`temp_`/`offline_`/`retry_`), des UUIDs uppercase (defaut Swift), des variants/version digits invalides, et l'ancrage `^...$` de la regex.

## Phase 5 — Reactions sur posts migrees vers table dediee (2026-05-15)

**Contexte** : Les reactions sur posts/stories etaient stockees en `Post.reactions: Json[]` embedded (array de `{userId, emoji, createdAt}`). Trois problemes structurels : (1) race condition sur l'array — concurrent `findFirst + update` ecrasent l'un l'autre car le RMW n'est pas atomique ; (2) leak de privacy — la liste exhaustive des reactors est envoyee a tout viewer du post ; (3) trois sources de verite divergeables (`likeCount`, `reactionCount`, `reactionSummary`, `reactions[]`).

Le pattern Message/Comment etabli en Phase 1+2 (table dediee + `currentUserReactions` batch + Socket.IO + ACL room) etait strictement superieur. Phase 5 aligne Post sur ce pattern.

**Decision** :
- Nouvelle table `PostReaction { postId, userId, emoji, createdAt, updatedAt }` avec `@@unique([postId, userId, emoji])` + indexes (`[userId, commentId]` cover la query batch hot path).
- Nouveau `PostReactionService` mirror exact de `CommentReactionService` post-remediation : `try/catch P2002`, `prisma.$transaction` enveloppant `updatePostReactionSummary`, `MAX_REACTIONS_PER_USER = 1`, `getEmojiAggregation` retourne `{ emoji, count }` only (pas de `userIds`/`hasCurrentUser` — Phase 3 privacy trim coherent SDK + gateway).
- Nouveau `PostReactionHandler` Socket.IO (`post:reaction-add/added/-remove/-removed/-request-sync/-sync`) avec auth, Zod, `SocketRateLimiter` 30/60s, `canUserViewPost()` ACL (extrait dans `services/posts/postVisibility.ts`, partage avec `CommentReactionHandler`), `enhancedLogger`. La room `post:{postId}` est partagee avec les comments — les handlers `post:join`/`post:leave` ont migre depuis `CommentReactionHandler` vers `PostReactionHandler` (posts sont les owners naturels).
- `PostService.likePost`/`unlikePost` (REST) deviennent des compat shims : delegent a `PostReactionService.addReaction`/`removeReaction` puis resynchronisent `Post.reactions: Json[]` + `Post.likeCount` depuis la table canonique. Les anciens clients qui lisent ces champs voient toujours un etat coherent.
- `currentUserReactions: string[]` ajoute aux reponses `GET /posts/:id`, `/feed`, `/feed/stories`, `/posts/user/:id`, `/posts/community/:id`, `/posts/bookmarks` via batch query `prisma.postReaction.findMany({ userId, postId IN [...] })`. `Cache-Control: private, no-cache` ajoute sur ces routes.
- SDK Swift : `APIPost.currentUserReactions: [String]?`, `SocketPostReactionUpdateEvent`/`SyncEvent`/`Aggregation` (slim), `addPostReaction(postId:emoji:)`/`removePostReaction`/`requestPostReactionSync` sur `SocialSocketProviding`, publishers `postReactionAdded/Removed/Sync`. `PostReactionError` enum (mirror de `CommentReactionError`).
- iOS app : `FeedView` + `RootViewComponents.ThemedFeedOverlay` + `PostDetailView` hoissent `postLikedIds`/`postLikeDelta`/`postHeartInFlightIds`, seedent depuis `currentUserReactions` via `computePostLikedIds(from:)`, emettent via Socket.IO (`addPostReaction`/`removePostReaction`, plus de REST), s'abonnent aux events realtime. `PostDetailView` join/leave la room `post:{postId}` ; le feed list NE join PAS (trop de rooms ephemeres).
- Script one-shot `scripts/migrate-post-reactions.ts` backfille `Post.reactions: Json[]` -> `PostReaction` rows. Cursor-paginated, idempotent via `@@unique` + P2002 swallow (Mongo Prisma 6 ne supporte pas `createMany skipDuplicates`), resumable via `--from-cursor`, `--dry-run` option. Helper `embeddedReactionsToRows` extrait + 19 tests unitaires.

**Alternatives rejetees** :
- **Garder embedded array avec Mongo natif `$push` + filter `$ne`** : aurait fixe la race d'array sans table, mais (a) necessite `prisma.$runCommandRaw` qui casse le typage Prisma et la coherence avec le reste du codebase, (b) ne resout PAS le leak de privacy (les viewers continuent de recevoir tous les userIds), (c) ne resout pas la dispersion des compteurs.
- **Hybride : table source-de-verite + snapshot embedded des derniers N** : dual-write, complexite supplementaire pour un benefice marginal sur des commentaires qui ont typiquement <30 reactions.
- **Reverser Comment vers embedded pour matcher Post** : aurait simplifie l'API (1 query), mais aurait reintroduit les 3 problemes resolus en Phase 1+2 + ses 12 commits + ses revues senior. Le pattern Comment est strictement superieur ; on a aligne Post dessus, pas l'inverse.

**Compatibilite** :
- `Post.reactions: Json[]` est PRESERVE pour les clients pre-Phase-5. Sa deprecation est differee a Phase 6 (apres deploiement + migration data + verification que les clients passent par `currentUserReactions`).
- Notification `'post_like'` (type existant) est reutilisee — pas de nouveau type pour eviter de toucher l'UI iOS de rendu de notifications.
- Anciens clients web continuent d'appeler REST `POST/DELETE /posts/:id/like` ; ces endpoints continuent de fonctionner via le compat shim.

**Risques connus residuels** :
- Drift potentiel entre `Post.reactions: Json[]` (legacy) et `PostReaction` table pendant la fenetre de migration : le shim `PostService.likePost` rebuild systematiquement le Json depuis la table, donc apres CHAQUE ecriture via /like ou Socket.IO les deux convergent. Mais les ecritures pre-Phase-5 restent en place — d'ou le besoin du script de backfill `scripts/migrate-post-reactions.ts`.
- `MeeshyNotificationType` doit etre etendu pour supporter `post_like` si pas deja present (verifie iOS pre-existant — type connu, rendu via `heart.fill`).

**Tests** : +67 PostReactionService + +26 PostReactionHandler + +22 PostService/PostFeedService batch enrichment + +5 SDK Swift decoding + +10 iOS computePostLikedIds + heartInFlight + +19 migration helper = **+149 tests**. Total Phase 1+2+3 atomiques sur la branche : 400+.

## 2026-05-16 : Double coche pilotee par push pour les destinataires hors-ligne

**Contexte** : Le flux de statut message (sent -> delivered -> read) ne couvrait que les destinataires EN LIGNE. `MessageHandler._autoDeliverToOnlineRecipients` marque un message livre pour chaque destinataire ayant une socket active et emet `read-status:updated` -> l'auteur voit la double coche immediatement. Mais un destinataire HORS-LIGNE qui recoit seulement un push notification ne declenche aucune transition : l'extension iOS `MeeshyNotificationExtension` pre-enregistre le message localement mais ne rappelle jamais le gateway. Resultat : l'auteur reste sur simple coche jusqu'a ce que le destinataire ouvre l'app.

**Decision** :
- Nouvel endpoint `POST /api/v1/conversations/:conversationId/messages/:messageId/delivery-receipt` (`routes/message-read-status.ts`). Il resout la conversation, verifie l'appartenance, valide que le message existe et appartient bien a cette conversation (rejet d'un messageId spoofe/cross-conversation), puis delegue a `MessageReadStatusService.markMessagesAsReceived(participantId, conversationId, messageId)` et diffuse `read-status:updated` via le helper existant `broadcastReadStatusUpdate`.
- Comportement calque sur le sibling `mark-as-received` : le curseur de livraison est avance dans tous les cas (coherence `unreadCount`), mais le broadcast `read-status:updated` est supprime quand le destinataire a desactive `showReadReceipts`. No-op si l'appelant est l'auteur du message.
- Cote iOS, l'extension `NotificationService` appelle `NSEDataSync.postDeliveryReceipt` a reception d'un push de type message (`new_message`, `message_reply`, `reply`, `message_forwarded`, `new_conversation*`, `added_to_conversation`).
- `NSEDataSync.enqueueBackgroundPost` route l'appel via une **`URLSession` background** (`URLSessionConfiguration.background`, `sharedContainerIdentifier` = App Group). Le daemon systeme `nsurlsessiond` termine le transfert meme apres le teardown de l'extension (declenche par `contentHandler`), sans jamais retarder la banniere. Token Bearer lu depuis le Keychain partage, base URL resolue depuis l'allowlist (jamais depuis le payload push — coherent avec l'audit SSRF 2026-05-11).

**Alternatives rejetees** :
- **Reutiliser `POST /conversations/:id/mark-as-received`** : fonctionnellement equivalent (curseur time-based), mais pas de messageId explicite ni d'observabilite dediee au flux push-delivery. Un endpoint dedie clarifie la semantique.
- **`URLSession.shared` dans le `DispatchGroup` de l'extension** : plus simple mais (a) une requete reseau lente retarderait l'affichage de la banniere, (b) les tasks foreground meurent avec le process si `contentHandler` est appele avant la fin. La session background decouple totalement le receipt du rendu de la banniere et survit au teardown.
- **Capter les delivery-receipts APNs/FCM** : aucun lien fiable cote serveur entre un receipt APNs et un message ; APNs ne garantit pas la livraison.

**Consequences** :
- Le `read-status:updated` emis par l'endpoint est identique a celui du chemin online — l'auteur (iOS/web) le consomme deja, aucune modification client cote auteur.
- Livraison non garantie : si APNs ne delivre pas le push, ou si l'extension n'a pas de token valide, aucun receipt n'est emis ; la double coche apparaitra a l'ouverture de l'app. Acceptable et documente.
- Sur-comptage en groupe : `markMessagesAsReceived` avance un curseur time-based (`lastDeliveredAt = now`), donc tout message `createdAt <= now` est compte livre. Comportement pre-existant, identique au chemin online auto-deliver — accepte.
- `showReadReceipts` respecte cote serveur : la confidentialite du destinataire est preservee meme si le receipt est poste.

**Tests** : 9 tests route gateway (`__tests__/routes/delivery-receipt.test.ts`) — curseur avance + broadcast, 404 conversation/message, 403 non-membre, message cross-conversation, message supprime, `showReadReceipts` off (curseur sans broadcast), no-op self-sender, 400 messageId invalide. Cote iOS, l'extension NSE n'a pas de cible de tests dans le repo (comme `NSEDataSync.syncMessage` / `NSEDecryptor` pre-existants) ; verification via `./apps/ios/meeshy.sh build` (macOS requis).


## 2026-08-08 : Les mentions d'un post editee sont RECONCILIEES, pas rejouees

**Contexte** : `PUT /posts/:postId` reextrayait les `@handle` du contenu edite, resolvait les
usernames, puis **recreait** les lignes `PostMention` et renotifiait — son commentaire l'admettait
(`re-fires all; idempotent via P2002 swallow`). L'idempotence citee ne couvre que la persistance :
`createPostMentions` avale les P2002, mais `createPostMentionNotificationsBatch` n'a aucune memoire
de qui a deja ete prevenu. Deux consequences.

D'une part, **chaque edition repingeait tous les mentionnes**. Le bloc ne comparait pas le contenu
a son etat precedent : dix corrections de frappe valaient dix `user_mentioned` a quelqu'un nomme
une seule fois, et modifier la seule VISIBILITE d'un post repingeait tout le monde. Le garde-fou de
debit (`MAX_MENTIONS_PER_MINUTE` par paire emetteur/destinataire) ne couvre qu'une fenetre d'une
minute et ne rattrape donc rien.

D'autre part, **les partants n'etaient jamais retires**. La route creait, jamais ne supprimait :
editer « bravo @alice » en « bravo @bob » ajoutait Bob et laissait Alice mentionnee a vie. Ces
lignes alimentent l'affinite de recommandation des reels (`PostFeedService.getMentionsByPost`,
`getReelSeed`) — un post recommande pour une mention qu'il ne porte plus.

Meme couple de defauts que celui corrige cote messages par `replaceMessageMentions` (2026, cycle
22) ; le domaine social n'en avait pas herite.

**Decision** : nouvelle unite `services/posts/postMentions.ts`, miroir structurel de
`services/messaging/messageMentions.ts`, avec deux points d'entree publics que les routes
appellent a la place du bloc inline :
- `resolvePostMentions` (creation) : court-circuit sans cout quand le contenu ne porte aucun `@`,
  **aucune lecture de `PostMention`** (un post neuf n'a pas d'ensemble precedent), tous les
  mentionnes sont des entrants par construction.
- `reconcilePostMentions` (edition) : **pas** de court-circuit — un contenu qui ne nomme plus
  personne doit effacer ses lignes ; supprime les seuls partants, cree les seuls entrants, et ne
  notifie que `newlyMentionedUserIds`.

Les deux sont best-effort et ne levent jamais (`onError` laisse l'appelant journaliser dans le
contexte de sa requete). En panne — service absent, ensemble precedent illisible, resolution en
echec — la reconciliation **s'abstient de tout ecrire** et rend `reconciled: false` : preserver une
mention perimee vaut mieux que detruire une mention vivante. La notification est **detachee**
(appelee dans la continuation, jamais attendue) : elle traverse push, socket et e-mail, et rien de
cela n'a a retarder la reponse d'une publication.

**Alternatives rejetees** :
- **Factoriser avec `messageMentions`** : les deux domaines ne partagent ni la table (`PostMention`
  vs `Mention`), ni la validation (un post n'a ni participants ni regle « conversation directe »),
  ni le champ denormalise (`Message.validatedMentions` n'a pas d'equivalent sur `Post`). Seule la
  FORME est commune ; une abstraction sur si peu de substance aurait coute plus qu'elle ne rend.
- **Dedupliquer cote `NotificationService`** (ne pas creer un `user_mentioned` deja emis pour la
  paire post/destinataire) : deplace la connaissance de « qui etait deja mentionne » hors de
  l'endroit qui la detient, et ne repare pas D2 — les lignes des partants resteraient.
- **Purger puis recreer toutes les lignes** : plus simple, mais detruit l'ensemble precedent, donc
  rend « qui est entrant » insoluble — c'est precisement ce qui forcait a renotifier tout le monde.

**Consequences** :
- Le chemin d'edition attend desormais la reconciliation (jusqu'a trois aller-retours : lecture du
  precedent, `deleteMany` si partants, creation des entrants) avant de repondre. Les editions de
  post sont rares devant les creations, et l'ordre est requis par la correction.
- La creation attend la persistance des lignes, la ou elle etait en fire-and-forget. Un seul
  aller-retour de plus, et `createPostMentions` ne rejette pas (`Promise.allSettled` interne).
- Les `PostMention` perimees **deja ecrites** subsistent : le correctif ne vaut que pour les
  editions a venir. Reparable par script avec acces base, sur le patron de
  `repair-mention-user-ids.ts`.
- Les commentaires n'ont pas de route d'edition : rien a reconcilier cote `CommentMention`
  aujourd'hui. Le jour ou elle apparait, elle doit naitre avec `reconcilePostMentions` pour jumeau.

**Tests** : 16 tests d'unite (`__tests__/unit/services/posts/postMentions.test.ts`, ecrits en RED
avant l'implementation) + 2 tests de regression au niveau route (`posts-core-notifications.test.ts`)
qui verrouillent exactement les deux defauts : aucun renvoi de notification a un mentionne deja
nomme, et `deleteMany` sur les seuls partants. Suite gateway complete verte (603 suites,
15 655 tests).

## Le fil d'un post herite de l'audience de son post — deux verdicts nommes (cycle 29)

**Contexte** : `postVisibility.ts` portait depuis la decision 2026-07-08 une asymetrie ECRITE
mais inapplicable a un objet unitaire : le filtre de LISTE (`buildPostVisibilityOrFilter`, feed +
post unique) admet amis ∪ contacts DM, tandis que `canUserViewPost` — decrit dans le meme fichier
comme « ce qui garde REAGIR / COMMENTER » — reste amis stricts. Aucune route de commentaire
n'appliquait ni l'une ni l'autre : les six routes de `routes/posts/comments.ts`, le like/unlike
REST du post et les quatre handlers de reaction socket ne consultaient jamais `Post.visibility`. Le post etait pourtant
protege, `post:join` gardait deja la room, et `CommentReactionHandler` portait un
`_canUserViewPost` prive **que rien n'appelait**.

**Decision** : quatre primitives dans `postVisibility.ts`, pas un module de plus.

| primitive | question | audience |
|---|---|---|
| `loadPostAcl` | quelle est la tranche ACL de ce post ? | — (`null` si absent OU supprime) |
| `loadCommentPostAcl` | ... du post PORTANT ce commentaire ? | — (id d'URL jamais cru) |
| `canUserConsumePost` | peut-il LIRE le fil ? | amis ∪ contacts DM (celle du feed) |
| `canUserInteractWithPost` | peut-il ECRIRE / REAGIR ? | amis stricts |

Les deux verdicts ne different que par `canUserViewPost(..., { includeDirectContacts })`. C'est le
point : l'asymetrie devient EXECUTABLE au lieu de rester un commentaire, et un point d'entree
choisit son verdict en le nommant plutot qu'en reglant un booleen.

**Alternatives rejetees** :
- **Un seul verdict (amis stricts) pour tout le fil** : plus simple, mais un contact DM non-ami a
  qui le feed montre deja une story `FRIENDS` recevrait un 404 sur ses commentaires. Ce n'est pas
  une garde, c'est une regression pour un lecteur legitime.
- **Reutiliser `PostService.getPostById`** pour garder la lecture : ramene tout le `postInclude`
  (medias, auteur, compteurs, reactions) la ou trois champs suffisent, sur un chemin de lecture
  chaud.
- **Materialiser la liste de contacts DM** (`getDirectConversationContactIds`) pour trancher un
  seul acces : cout proportionnel au carnet d'adresses. `doUsersShareDirectConversation` est le
  pendant **pairwise**, deux requetes bornees — exactement le rapport que `doUsersShareCommunity`
  entretient avec `getCommunityCoMemberIds`.
- **Faire confiance au `:postId` du chemin** (ou du payload socket) sur les routes adressant leur
  cible par `commentId` : un appelant annoncerait le post public de son choix tout en visant le fil
  d'un post prive. Le post est resolu DEPUIS le commentaire.
- **Ne garder que le chemin socket** : `likePost` / `PostReactionService.addReaction` ne verifient
  eux non plus que l'existence du post. Garder l'un sans l'autre ferait dependre l'ACL du
  TRANSPORT — un client refuse sur `post:reaction-add` reussirait en repassant par
  `POST /posts/:postId/like`.
- **Repondre `403`** : distinguer « interdit » d'« inexistant » fait de la route un oracle
  d'existence de posts prives. `404` partout, et `null` indistinct entre absent, supprime et
  invisible — doctrine deja tenue par `recordMediaDownloads`.

**Consequences** :
- Une requete bornee de plus par appel sur le fil. Cas dominant (post `PUBLIC`) : aucune lecture de
  graphe ensuite. `FRIENDS`/`EXCEPT` : une requete d'amitie, et le contact DM n'est consulte qu'en
  dernier recours. `EXCEPT` court-circuite sur sa liste noire avant toute lecture de graphe.
- **Un utilisateur qui perd l'acces a un post ne peut plus retirer une reaction qu'il y avait
  laissee.** Contrepartie assumee : elle lui est de toute facon invisible, et une ACL qui depend du
  sens du geste est un footgun. Seul l'auteur peut encore faire disparaitre le post.
- Les harnais de test doivent DECLARER leur audience (15 fichiers). C'est voulu : un double qui
  n'expose pas la tranche ACL echoue au lieu de rendre un verdict par defaut.
- `doUsersShareCommunity` prend desormais `CommunityVisibilityPrisma` au lieu de `PrismaClient`
  entier — la garde n'a plus a se faire passer un client complet par assertion.

**Tests** : 51 tests neufs, RED observe a chaque etape (24 rouges avant implementation) —
`__tests__/unit/services/posts/postThreadAccess.test.ts` (22), `.../routes/posts/comments-audience.test.ts`
(17), `.../routes/posts/interactions-audience.test.ts` (8), plus 9 cas d'audience dans les deux
suites de handlers socket. Suite gateway complete verte (608 suites, 15 740 tests), `tsc --noEmit`
propre.

## 2026-08-09 : Défauts `audioTranslationEnabled`/`ttsEnabled` alignés sur le texte (false → true)

**Contexte** : `AudioPreferenceSchema`/`AUDIO_PREFERENCE_DEFAULTS` (`packages/shared/types/preferences/audio.ts`) avaient `transcriptionEnabled`/`textTranslationEnabled` par défaut `true`, mais `audioTranslationEnabled`/`ttsEnabled` par défaut `false` — une asymétrie sans équivalent côté texte. `ConsentValidationService.getConsentStatus` porte son **propre** repli codé en dur, indépendant du schema partagé (`boolPref(audioPrefs.audioTranslationEnabled, false)` / `boolPref(audioPrefs.ttsEnabled, false)`) — changer seulement le schema n'aurait donc eu aucun effet observable. Or `processAudioAttachment` (`MessageTranslationService.ts`) vide silencieusement `targetLanguages` quand `!canGenerateTranslatedAudio`, et `canGenerateTranslatedAudio = translatedAudioGenerationEnabled && canTranslateAudio` avec `canTranslateAudio = audioTranslationEnabled && canTranscribeAudio && canTranslateText`. Tant qu'aucun des deux booléens n'avait été explicitement écrit par le client (`PATCH /me/preferences/audio`), aucune langue traduite n'était jamais générée pour personne, sans que l'expéditeur ni le destinataire ne le sache — une régression silencieuse par rapport au principe Prisme (l'audio doit être traduit automatiquement, comme le texte).

**Décision** : flip des deux défauts à `true`, aux DEUX endroits (le schema seul ne suffit pas puisque `ConsentValidationService` ne le dérive pas) :
- `packages/shared/types/preferences/audio.ts` : `AudioPreferenceSchema` (`audioTranslationEnabled`/`ttsEnabled` → `z.boolean().default(true)`) et `AUDIO_PREFERENCE_DEFAULTS` (idem).
- `services/gateway/src/services/ConsentValidationService.ts` : `boolPref(audioPrefs.audioTranslationEnabled, false)` → `boolPref(audioPrefs.audioTranslationEnabled, true)`, idem pour `ttsEnabled`.

**Aucune migration nécessaire.** `boolPref` ne retombe sur le défaut QUE quand le champ JSON est absent (`typeof value === 'boolean'` faux) — jamais persisté, calculé à chaque lecture. Un utilisateur qui a explicitement désactivé (`false` écrit via `PATCH /me/preferences/audio`) garde son choix intact ; seul celui qui n'a jamais touché au réglage bascule sur le nouveau défaut, immédiatement après déploiement, sans backfill.

**Le consentement voix de base reste inchangé.** `canTranscribeAudio = audioTranscriptionEnabled && hasVoiceDataConsent` — `hasVoiceDataConsent` (dérivé de `voiceDataConsentAt`, un consentement RGPD explicite) reste un gate distinct, non touché par ce flip. `audioTranslationEnabled`/`ttsEnabled` ne retirent qu'une couche d'opt-in redondante AU-DESSUS d'un consentement déjà accordé par ailleurs ; un utilisateur n'ayant jamais donné son consentement voix reste bloqué exactement comme avant.

**Alternatives rejetées** :
- **Ne changer que le schema partagé, pas `ConsentValidationService`** : aurait laissé le comportement identique en pratique — le service a son propre repli dupliqué, jamais dérivé du schema. Corrigerait un fichier sans effet observable.
- **Ajouter un backfill/migration explicite** : inutile et risqué — écrirait `true` dans des documents où l'utilisateur avait peut-être une raison de laisser le champ absent plutôt que de le poser à `false` explicitement. La lecture en négatif (absent ⇒ nouveau défaut) suffit et ne touche jamais un choix explicite.

**Tests** : `ConsentValidationService.test.ts` — le cas « préférence audio absente » est réécrit pour attendre `canTranslateAudio`/`canGenerateTranslatedAudio` à `true` (au lieu de `false`) quand le consentement voix de base est accordé ; un cas dédié verrouille qu'un `audioTranslationEnabled: false` explicite reste respecté malgré le flip du défaut ; un second cas dédié (`ttsEnabled: false` explicite, `audioTranslationEnabled` omis) prouve que `canTranslateAudio` se débloque bien et que seul `ttsEnabled` bloque `canGenerateTranslatedAudio` — pour ne pas laisser cette assertion n'être qu'un effet de bord du cascade `canTranslateAudio=false` (commits `ce98fad50`, `42734c66f`).

**Implication charge/capacité** : ce flip rend la génération audio traduite opt-out plutôt qu'opt-in pour la grande majorité des utilisateurs — auparavant la plupart n'avaient jamais rien écrit sur ces deux champs et généraient donc zéro synthèse TTS. Chaque message audio d'un expéditeur consentant va désormais déclencher une synthèse Chatterbox (pipeline CPU/GPU-bound) pour chaque langue cible dérivée de la conversation, par défaut. C'est l'effet produit recherché, mais il a un impact réel sur l'infrastructure : surveiller la profondeur de file et la saturation du pool de workers du translator après déploiement en production, et être prêt à scaler ce pool si la charge TTS augmente significativement.

Détail complet et rationale : `docs/superpowers/specs/2026-08-09-audio-translation-prisme-reliability-design.md` (Problème 3).

## 2026-08-10 : Un DM direct créé sans message reste silencieux jusqu'au premier envoi

**Contexte** : `POST /conversations` créait un DM direct et diffusait immédiatement `CONVERSATION_NEW` + une notification d'invitation à TOUS les participants, y compris quand la conversation ne contenait encore aucun message — un utilisateur ouvrant un profil et cliquant « Message » sans jamais taper un mot notifiait déjà le destinataire d'une conversation vide qu'il ne pouvait ni ouvrir ni ignorer proprement. Le Prisme (accueil sans friction) veut au contraire qu'un contact ne matérialise une conversation pour son interlocuteur qu'au moment où il y a réellement quelque chose à lire.

**Décision** : nouveau champ `Conversation.firstMessageSentAt: DateTime?` (`packages/shared/prisma/schema.prisma`) sert de source de vérité unique pour la visibilité d'un DM vide, propagé à cinq points :
1. **Schema** — `firstMessageSentAt` `null` = DM direct sans aucun message envoyé. Jamais backfillé : tout document créé avant cette migration a le champ **ABSENT**, pas `null` (voir doc dédiée dans `packages/shared/CLAUDE.md`).
2. **`POST /conversations`** (`routes/conversations/core.ts`) — pour un `direct` fraîchement créé : (a) pose `firstMessageSentAt: null` explicitement dans le `create` (l'omettre laisserait le champ absent, indistinguable d'un document legacy) ; (b) l'auto-join de room reste universel (tous les participants rejoignent `conversation:{id}` pour ne rater aucun `message:new` futur) mais l'émission `CONVERSATION_NEW` est réduite au seul créateur (`emitParticipantIds = type === 'direct' ? [userId] : allParticipantIds`) ; (c) la notification d'invitation (`createConversationInviteNotification`) est sautée entièrement pour `type === 'direct'` — inchangé pour `group`/autres types. Sur le chemin de dédup DM existant, si le destinataire silencieux ré-initie lui-même (`POST /conversations` vers la même personne), un `updateMany` gardé (`where: { firstMessageSentAt: null }`) flippe le champ et notifie le créateur — traité comme une intention mutuelle aussi explicite qu'un message.
3. **`GET /conversations`** — un `whereClause.OR` à 4 branches, ajouté APRÈS le bloc `withUserId` existant (qui reconstruit `.AND`/`.participants`) pour ne jamais être écrasé par lui : non-`direct` toujours visible ; `OR: [{ NOT: { firstMessageSentAt: null } }, { firstMessageSentAt: { isSet: false } }]` (posé-non-null OU absent-legacy) toujours visible — un `NOT: { firstMessageSentAt: null }` nu ne suffit PAS, il exclut aussi les documents absents sur le connecteur MongoDB (corrigé en revue pré-merge le 2026-08-10, voir `packages/shared/CLAUDE.md`) ; le créateur voit toujours son propre DM vide ; et si AUCUN participant n'a `role: 'creator'` (DM créés via `friends.ts`/`devices.ts`, qui ne posent jamais de créateur), on dégrade vers « visible pour tous » — le comportement actuel/legacy.
4. **Premier message** — le bump inconditionnel `lastMessageAt` reçoit un `updateMany` gardé additionnel et SÉPARÉ (`where: { id, firstMessageSentAt: null }`), race-safe par le pattern CAS null-guard, à DEUX endroits indépendants : `services/messaging/messagePostSaveEffects.ts` (`runMessagePostSaveEffects`, le chemin nominal — PAS `MessagingService.updateConversation`, méthode qui n'existe plus, refactorée entre-temps) et `services/message-translation/MessageTranslationService.ts` (`_saveMessageToDatabase`, seul accessible via `POST /translate-blocking`, qui crée le message HORS `MessagingService.handleMessage`). Ce second flip est isolé dans son propre `try/catch` : le message et le bump `lastMessageAt` ont déjà committé à ce stade, une panne du flip ne doit jamais transformer un envoi réussi en 500.
5. **`delete-for-me`** (`routes/conversations/delete-for-me.ts`) — quand le créateur supprime un DM `direct` encore vide, la conversation est FERMÉE (`isActive: false`) au lieu de transférer la propriété à un successeur — même s'il existe un participant actif. Les DM non-vides et les conversations non-`direct` gardent le comportement de transfert exact d'avant. « Vide » est déterminé par un `count` Prisma sur `{ type: 'direct', firstMessageSentAt: null }` (present-et-null uniquement) plutôt qu'un `select` + négation JS (`!firstMessageSentAt`) — cette dernière forme est ambiguë : le client Prisma renvoie `null` aussi bien pour present-et-null que pour ABSENT, elle aurait donc traité à tort tout DM legacy comme vide (corrigé en revue pré-merge le 2026-08-10).

**Alternatives rejetées** :
- **Champ `createdBy` dédié plutôt que réutiliser `Participant.role === 'creator'`** : le rôle `creator` existe déjà comme source de vérité (utilisé par `delete-for-me` pour la logique de transfert de propriété) ; un second champ dénormalisé aurait exigé une double écriture à synchroniser sans bénéfice — le risque de drift dépasse l'économie d'une jointure.
- **Cacher le DM au créateur aussi, pas seulement au destinataire** : casserait l'expérience du créateur qui est en train de composer — il doit voir et retrouver sa propre conversation (multi-device, refresh) pendant qu'il tape, faute de quoi le client devrait fabriquer un brouillon local que le serveur ignore.
- **Détecter « premier message » via une requête `COUNT` plutôt qu'un champ stocké** : un `COUNT` par conversation sur `GET /conversations` (liste paginée) aurait ajouté N requêtes ou une agrégation coûteuse à un chemin de lecture chaud, et resterait sujet à un TOCTOU entre la lecture du compte et l'envoi concurrent d'un message — un champ stocké posé par un `updateMany` gardé sur `firstMessageSentAt: null` donne un CAS atomique gratuit.
- **Brouillon 100% côté client, aucune conversation serveur avant le premier envoi** : casserait la synchronisation multi-appareil (un second device du créateur ne verrait jamais le brouillon), la file offline (rien à persister côté cache-first), et dupliquerait côté client toute la logique de création (dédup DM existant, permissions par défaut, résolution de participants) que le serveur possède déjà.

**Conséquences** :
- Un DM déjà vide en base AVANT cette migration (aucun message historique) redevient invisible pour le participant non-créateur après déploiement, sauf s'il n'a pas de `creator` identifiable (branche `none: { role: 'creator' }` du filtre) — cas marginal, dont l'ampleur réelle doit être quantifiée par une requête de vérification pré-merge en base (opérationnelle, hors scope de cette tâche de documentation).
- `firstMessageSentAt: null` en positif dans un `where` (les `updateMany` gardés) ne matche QUE les documents où le champ a été explicitement posé à `null` — jamais les documents legacy où il est absent (cohérent avec le piège Prisma/Mongo documenté dans `packages/shared/CLAUDE.md`). C'est voulu : seules les conversations créées après cette migration (donc avec `firstMessageSentAt: null` explicite dès la création) doivent être flippées ; les DM legacy sont déjà visibles via la branche `isSet: false` du filtre OR côté lecture et n'ont pas besoin de flip.
- Deux points d'écriture indépendants portent le même flip (`messagePostSaveEffects.ts` et `MessageTranslationService._saveMessageToDatabase`) : un futur troisième chemin de création de message HORS `MessagingService.handleMessage` devra porter sa propre copie gardée, comme documenté dans le commentaire jumeau des deux fichiers.

**Tests** : `conversation-core.test.ts` (visibilité OR 4-branches, flip sur ré-initiation par le destinataire, no-op quand l'appelant est déjà créateur), `conversations/delete-for-me.test.ts` (fermeture vs transfert selon `firstMessageSentAt`), `messagePostSaveEffects.test.ts` (flip gardé séparé du bump inconditionnel, résilience si le flip échoue), `MessageTranslationService.test.ts` (même flip gardé sur le chemin `_saveMessageToDatabase`, résilience si le flip rejette). Détail complet et alternatives : `docs/superpowers/specs/2026-08-04-notification-dismiss-and-silent-dm-visibility-design.md` (Problème 2).

## 2026-08-10 : Une notification hérite de l'échéance de son message, et les lectures d'inbox la respectent

**Statut** : Accepté

**Contexte** : `createMessageNotification` porte une garde d'admission qui refuse de créer une notification pour un message déjà expiré. Rien ne couvrait le cas symétrique — la notification créée AVANT l'expiration. Le message éphémère disparaît quelques minutes plus tard ; la ligne `Notification` reste. Elle ne montre rien (`protectedPreview` a déjà remplacé le contenu par un libellé générique à la création — il n'y a donc aucune fuite de contenu, contrairement au cas du rappel), ne mène nulle part (`action: view_message` ouvre un message absent), et porte un badge non lu que plus aucune lecture ne peut décrémenter. `Notification.expiresAt` existait pour exactement ça, jusque dans les types partagés (`isNotificationExpired`, `isNotificationUnread`), mais aucun producteur ne l'écrivait et aucune des sept lectures serveur ne l'honorait.

**Décision** :
- **Producteur** : la notification hérite de `Message.expiresAt` — message régulier, réponse, mention. Le chemin `new_message` la prend de sa relecture VIVANTE (celle de la garde d'admission : aucune lecture ajoutée) ; réponse et mentions la reçoivent de l'éventail via `messageExpiresAt`, celui-ci la tenant déjà dans `FanOutMessage`. Les deux sources ne peuvent pas diverger : `Message.expiresAt` est écrit à l'insertion et jamais modifié ensuite.
- **Lectures** : un prédicat unique, `visibleNotificationsWhere` (`services/notifications/visibleNotificationsWhere.ts`), appelé par les sept lectures qui répondent à la même question — liste REST et son total, compte non-lus REST, les deux compteurs de `emitCountsUpdate`, le badge embarqué dans le push, et les deux lectures du digest e-mail.
- **Index** : `Notification[userId, isRead]` → `[userId, isRead, expiresAt]`, plus migration `scripts/migrations/mongodb/010_notification_expiry_index.js` pour les bases existantes.

**Alternatives rejetées** :
- **Un balayage périodique** : la péremption n'est pas un événement — personne ne passe à l'instant T. Un balayage laisserait toujours une fenêtre entre l'expiration et son passage, là où le filtre est exact à la milliseconde et ne coûte aucune écriture.
- **Supprimer la ligne**, comme `retractMessageNotifications` le fait au rappel : ce geste-là est imposé par la copie de l'extrait que la ligne détient. Ici elle ne détient rien, et masquer ne demande aucun déclencheur.
- **Que chaque créateur relise l'échéance du message qu'il désigne** (aucun paramètre nouveau, chemin d'édition fermé au passage) : coûterait une lecture PAR MENTION là où l'éventail tient déjà la valeur — le coût refusé aux cycles 44 et 47.
- **Un index de plus** plutôt qu'un remplacement : inutile, `[userId, isRead]` est un préfixe de la nouvelle clé.

**Conséquences** :
- **Aucune réparation de données.** Les lignes déjà en base portent `expiresAt: null` et empruntent la branche `null` du filtre : visibles exactement comme avant.
- **L'index n'est pas un confort.** Sans `expiresAt` dans la clé, le `$or` devient un filtre résiduel — un fetch de document par candidat — sur `emitCountsUpdate`, qui tourne une fois par destinataire de CHAQUE message. Déployer la migration avant le code : le filtre reste correct sans l'index, seulement plus cher.
- **Ce que la décision n'assure PAS** : la ligne expirée reste en base (un index TTL Mongo serait le balayage naturel, hors portée de `@@index` Prisma) ; un badge déjà affiché ne se corrige qu'au prochain recalcul — cohérence à terme, pas immédiate ; les clients ne s'auto-périment pas (`isNotificationExpired` n'est appelé nulle part).

**Tests** : 11 neufs, sonde en trois temps (filtre neutralisé → 5 rouges ; estampille producteur → 2 ; plomberie de l'éventail → 2). Le double Prisma ÉVALUE les `where` contre des lignes au lieu de les recopier (`__tests__/helpers/notification-where.ts`) et jette sur toute clé qu'il ne sait pas interpréter. Suite gateway complète verte (636 suites, 16176 tests).

## 2026-08-10 : Une story PÉRIMÉE garde ses notifications ; une story DÉTRUITE les perd

**Statut** : Accepté

**Contexte** : `ExpiredStoriesCleanupService` est le SEUL chemin de hard-delete de post du gateway. Sa seconde passe supprime définitivement, 7 jours après leur expiration, les lignes `Post` des stories périmées, leurs reposts et tous leurs commentaires. Les notifications que ces posts avaient produites n'étaient pas retirées : elles survivaient indéfiniment à leur cible, avec une copie dénormalisée d'un contenu détruit (`content`, `metadata.commentPreview`, `metadata.firstAttachmentUrl` — la vignette d'un média supprimé), un `action: view_post` n'ouvrant plus qu'un 404, et un badge non lu que plus personne ne peut décrémenter. Toutes les stories expirent, donc toutes finissaient par en laisser. Le backlog du cycle 52 désignait ce trou sous le nom « les stories expirées ne retirent pas leurs notifications » — la moitié « expirées » de cet énoncé est fausse, et c'est elle qui décide de l'implémentation.

**Décision** :
- **Le retrait est ancré sur la DESTRUCTION, pas sur l'expiration.** Appel direct à `retractPostNotifications` dans la passe de hard-delete, sur `allPostIds` (stories ∪ leurs reposts) — les notifications des commentaires détruits partent avec, toute la famille du fil portant aussi `context.postId`.
- **Il précède les suppressions et REJETTE**, exactement comme la libération des usages de sons juste à côté et pour la même raison : `context.postId` n'a ni relation ni cascade, donc détruire les posts après un retrait en échec laisserait des lignes que plus aucun chemin n'atteindrait — la passe suivante ne voit plus les posts. Le `catch` de la passe rattrape ; la passe horaire suivante rejoue tout.
- **`retractPostNotifications` prend une liste**, comme son jumeau `retractCommentNotifications` : un `$in` au lieu d'une lecture par post. Son plafond de drainage rejette au lieu d'avertir.
- **L'annonceur est un défaut de paramètre** sur `cleanup()`, résolu à chaque appel : le service est construit au démarrage, avant l'enregistrement du service partagé — une injection par constructeur capturerait `undefined` pour toujours.

**Alternatives rejetées** :
- **Estampiller `Notification.expiresAt` depuis `Post.expiresAt`**, par symétrie avec la décision jumelle sur le message éphémère ci-dessus. C'est la piste que l'audit a suivie en premier, et elle est FAUSSE : `context.postExpiresAt` n'est pas une échéance oubliée en route, c'est une fonctionnalité livrée sur les deux clients — le web affiche « · expirée » (`notification-helpers.ts`), iOS expose `expiryLabel` et `isLinkedContentExpired`. Le produit MONTRE délibérément la notification d'une story périmée, marquée. Masquer ces lignes côté serveur aurait supprimé cet affichage et rendu mort le code des deux clients. La différence avec le message éphémère est réelle et se lit dans la donnée : la notification de message ne porte qu'un libellé générique (`protectedPreview`) et sa cible est détruite à l'expiration ; celle de story porte un vrai extrait, un acteur et une vignette, et sa cible répond encore — `getPostById` ne filtre pas l'expiration.
- **Passer par `applyPostRemovalEffects`** (la liste d'effets partagée par les deux routes de retrait) : elle écrirait une ligne `AdminAuditLog` pour un balayage qui n'a pas d'acteur, et re-libérerait des usages de sons que la passe libère déjà par `releasePosts`. La liste nomme les effets d'un retrait DÉCIDÉ par quelqu'un ; ceci est une fin de vie.
- **Retirer au SOFT-delete** (6 h après l'expiration) : ce serait masquer une story que le produit montre encore, et à un moment où la cible répond toujours.
- **Un retrait post par post** dans la boucle du balayage : autant de lectures que de posts détruits, là où un `$in` les couvre en un drainage.

**Conséquences** :
- **Aucune réparation de données.** Le correctif ne vaut que pour les destructions à venir ; les lignes déjà orphelines demandent un script, sur le patron de `repair-mention-user-ids.ts`.
- **Une heure d'expirations peut désormais bloquer sa propre passe.** Si le drainage atteint son plafond (40 000 lignes), la passe renonce et rien n'est détruit cette heure-là. C'est le comportement voulu — la reprise converge, les lots déjà lus ayant bien été supprimés — mais cela retarde d'autant la récupération de disque.
- **Ce que la décision n'assure PAS** : les posts de type `STATUS` expirent aussi et ne sont balayés par rien — leurs lignes vivent pour toujours, donc leurs notifications mènent toujours quelque part ; les `TrackingLink` visant une story détruite ne sont pas désactivés par cette passe (ils le sont sur le chemin de retrait décidé, via `applyPostRemovalEffects`) ; le push APNs/FCM déjà délivré n'est pas rappelé.

**Tests** : 9 neufs (6 sur le câblage du balayage, 3 sur la liste et le plafond du retrait). Sondes de fidélité en cinq temps — appel retiré → 5 rouges ; retrait borné aux stories, reposts oubliés → 1 ; retrait placé après les suppressions → 2 ; plafond qui avertit au lieu de rejeter → 1 ; liste vide qui interroge quand même Mongo → 1.

## 2026-08-10 : Le balayage du contenu éphémère apparie les posts VIVANTS (`isSet: false`), et il connaît les DEUX types éphémères

**Statut** : Accepté

**Contexte** : `ExpiredStoriesCleanupService` tourne toutes les heures depuis sa mise en service et n'avait, en deux passes, jamais détruit une story périmée. Le cycle précédent y avait branché le retrait des notifications (ADR ci-dessus) et le lot G7 la purge des médias — sur un chemin qui ne s'exécutait pas. Trois défauts d'une même famille, dans la même fonction, dont le premier masquait les deux autres.

1. **La passe de soft-delete n'appariait aucun post.** Son filtre était `deletedAt: null`. Sur le connecteur MongoDB de Prisma, un filtre nul ne matche QUE les documents où le champ est présent-et-null ; or `post.create` n'écrit jamais cette colonne, donc sur un post vivant elle est ABSENTE. C'est exactement le piège qui avait vidé le feed, les reels et les stories en production (`data: []` sur une collection pleine) et qui a fait naître `NOT_DELETED` (`{ isSet: false }`) dans son propre module — cette passe en portait le dernier exemplaire du modèle `Post`, du côté ÉCRITURE cette fois. `softDeleted` valait 0 à chaque heure ; la passe de hard-delete, qui exige un `deletedAt` non nul, ne voyait donc que les stories supprimées à la main.
2. **Le balayage ne connaissait qu'un des deux types éphémères** (`type: 'STORY'`). Un `STATUS` expire en 1 h, disparaît bien des lectures à l'échéance, et sa ligne vivait pour toujours. La cause est une liste dupliquée entre celui qui POSE l'échéance (`PostService`) et celui qui l'HONORE.
3. **La fournée du hard-delete n'était bornée par rien** — sans conséquence tant que 1. la gardait vide.

**Décision** :
- **La vivacité se lit par `NOT_DELETED`, jamais par `deletedAt: null`.** Le filtre positif `{ not: null }` de la passe de hard-delete est correct et RESTE : la passe précédente vient d'écrire une vraie date, et l'état cherché est bien présent-et-non-null. C'est le filtre positif qui était faux, pas le négatif.
- **Les types éphémères et leurs durées vivent dans une table unique**, `services/posts/ephemeralPosts.ts`. `PostService.createPost` et le balayage en dérivent tous les deux ; la liste des types est elle-même dérivée des clés de la table des durées. Un type éphémère ajouté là reçoit son échéance ET son balayage.
- **La fournée du hard-delete est bornée** (500 posts, réglable par constructeur), prise du plus anciennement périmé au plus récent. Le seuil est exprimé en posts alors que ce qu'il protège se compte en notifications : le retrait rejette au-delà de 40 000 lignes, et 500 × 40 en laisse la moitié de marge. Une fournée pleine est journalisée.
- **Le nom de la classe reste `ExpiredStoriesCleanupService`** alors qu'elle balaie aussi les statuts : des plans et analyses archivés le citent, et les réécrire fausserait des archives. La doc de classe porte la correction ; la liste des types balayés est celle de `ephemeralPosts.ts`, pas celle du nom.

**Alternatives rejetées** :
- **Balayer sur `expiresAt` seul, sans filtre de type.** Équivalent aujourd'hui (seuls les types éphémères reçoivent une échéance) et sans liste à tenir à jour, mais il avalerait silencieusement tout futur post permanent auquel on donnerait une échéance pour une autre raison. La liste explicite est greppable et refuse ce genre d'élargissement tacite.
- **Renommer la classe en `ExpiredEphemeralPostsCleanupService`.** Le gain de justesse ne compense pas l'invalidation de six documents d'archive qui la citent nommément.
- **Rattraper le passif par un script de migration.** La borne fait converger le rattrapage d'elle-même, passe après passe, sans accès MongoDB ni fenêtre de maintenance.
- **Une fournée non bornée avec un plafond de retrait relevé.** Déplace le mur sans le supprimer, et fait grossir le pic de lectures concurrentes que le plafond existe justement pour borner.

**Conséquences** :
- **Le balayage devient effectif pour la première fois.** À la mise en production, il rattrape tout le passif — stories périmées jamais détruites et statuts jamais balayés — par fournées de 500 posts par heure, soit 12 000 par jour. Les effets branchés en aval (purge des médias G7, libération des usages de sons, retrait des notifications) s'exécutent enfin, sur un volume de rattrapage nettement supérieur au régime permanent.
- **La récupération de disque est différée, jamais perdue.** Une fournée pleine signale qu'il reste du passif ; c'est le signal que le cycle précédent notait comme manquant.
- **Ce que la décision n'assure PAS** : aucune réparation rétroactive des lignes déjà orphelines (médias au `postId` nul, usages de sons, notifications de posts détruits à la main avant ce correctif) ; les `TrackingLink` d'une story détruite ne sont toujours pas désactivés par cette passe ; la fenêtre d'archive auteur de `getStatuses` n'existe pas comme celle des stories, et le soft-delete rend désormais un statut périmé invisible à son auteur dès l'heure suivante — ce qui était déjà le cas de fait puisque `getStatuses` filtre l'expiration.

**Tests** : 13 neufs (`ExpiredStoriesCleanupService.ephemeral.test.ts`), dont 3 sur la table des durées elle-même. Sondes de fidélité en cinq temps — `NOT_DELETED` → `null` : 2 rouges ; type scalaire au soft-delete : 2 ; type scalaire au hard-delete : 3 ; borne retirée : 3 ; `STATUS` retiré de la table : 3. Le double Prisma HONORE le filtre de type au lieu de rendre la même ligne quelle que soit la question — sans cela le témoin de bout en bout restait vert sur un balayage borné aux stories.

## 2026-08-10 : Un lien de partage meurt avec le post que le balayage DÉTRUIT — une règle, deux chemins

**Statut** : Accepté

**Contexte** : les deux ADR ci-dessus se terminent, l'une et l'autre, par la même réserve — « les `TrackingLink` visant une story détruite ne sont pas désactivés par cette passe ». Le cycle précédent ayant rendu le balayage effectif pour la première fois, cette réserve a cessé d'être théorique : toute story finit par expirer, donc tout lien de partage de story finissait par pointer sur une ligne `Post` détruite.

Le retrait interactif, lui, coupe ses liens depuis trois cycles : c'est le troisième effet de `applyPostRemovalEffects`, et son commentaire dit exactement pourquoi — « le soft-delete ne bascule que `deletedAt`, le `onDelete: Cascade` de Prisma ne se déclenche jamais, les `/l/<token>` qui visent ce post resteraient donc opérationnels ». Le balayage est l'AUTRE chemin qui rend un post inatteignable, et le SEUL du gateway qui détruise réellement la ligne. Il n'appliquait pas la règle.

Rien ne pouvait le rattraper ensuite. `TrackingLink.targetId` n'a ni relation ni cascade vers `Post` — le champ porte indifféremment un `postId`, un `conversationId` ou un `userId`, et le schéma l'écrit. La ligne `Post` détruite, plus aucun chemin du gateway ne sait relier le lien à sa cible disparue : le lien survivait `isActive: true`, pour toujours. `/l/:token` comptait son clic, incrémentait `totalClicks`, écrivait un `TrackingLinkClick`, puis redirigeait vers une page morte ; `resolveTarget` rendait `isActive: true` avec un `targetId` que plus rien ne résout, et la page web comme le `DeepLinkRouter` iOS ouvraient un post inexistant. Le même contenu retiré à la main répondait, lui, 410 `LINK_INACTIVE`. Un objet, deux fins de vie selon le chemin de retrait — et la plus fréquente des deux était la mauvaise.

**Décision** :
- **La règle vit dans son propre module**, `services/posts/deactivatePostTrackingLinks.ts`, et les deux chemins l'appliquent sans la réécrire. C'est le geste que l'en-tête de `applyPostRemovalEffects` réclame explicitement pour les effets à deux écrivains : la liste existe pour qu'aucun effet n'ait de « second écrivain à tenir à jour de mémoire ».
- **Désactivation, jamais suppression.** Les `TrackingLinkClick` sont une histoire d'audience qui survit à sa cible, et le tableau de bord du partageur les lit encore. C'est déjà le geste du retrait interactif ; l'extraction ne le change pas.
- **Ancré sur la DESTRUCTION, pas sur l'expiration**, pour la raison que l'ADR du retrait des notifications a établie : tant qu'une story n'est que périmée, `getPostById` répond encore et le lien mène quelque part. C'est `deletedAt` qui ferme cette porte et le hard-delete qui la condamne.
- **`allPostIds` et jamais `ids`.** Un repost est détruit par la cascade de son original sans avoir jamais été soft-deleté pour son propre compte — son `expiresAt` est postérieur de plusieurs heures à celui de l'original, donc la passe de soft-delete ne l'a pas encore vu quand la cascade l'emporte. Et c'est justement le repost qu'on partage.
- **Avant toute destruction, et il REJETTE** — même contrat que ses deux voisins de bloc (`retractPostNotifications`, `releasePosts`) et pour la même raison : sans relation ni cascade, détruire les posts après une désactivation en échec laisserait des liens que plus aucun chemin n'atteindrait, la passe suivante ne voyant plus les posts. Le retrait interactif garde au contraire son régime best-effort : quand il s'exécute, `deletedAt` est déjà committé, et rien ne doit transformer une suppression réussie en 500. Le helper rejette ; c'est l'appelant qui choisit son régime.
- **Le filtre porte sur `targetId` seul, sans `targetType`**, comme le faisait le retrait interactif : un lien créé avec un type mal renseigné mais le bon `targetId` doit mourir avec sa cible, et les ObjectId ne se confondent pas d'une collection à l'autre.

**Alternatives rejetées** :
- **Désactiver dans la passe de SOFT-delete**, à l'instant où le post devient inatteignable (`getPostById` est gardé par `NOT_DELETED`). C'est l'instant théoriquement juste, et c'est celui du retrait interactif — qui n'a pas le choix, un post non éphémère n'étant jamais hard-deleté. Écarté ici parce que la passe de soft-delete est un `updateMany` qui ne matérialise aucun id : lui en faire produire demanderait de la convertir en `findMany` + `updateMany`, donc de la BORNER (un `$in` de tout le passif n'est pas une requête à émettre), donc de réécrire les témoins que le cycle précédent a construits autour de la forme actuelle. Le gain réel est une fenêtre de liens actifs sur des posts masqués, longue d'une passe en régime permanent (les deux bornes valant sept jours depuis `expiresAt`, un post devient éligible aux deux le même instant). À reprendre le jour où la passe de soft-delete devra être bornée pour une autre raison.
- **Supprimer les lignes `TrackingLink`** au lieu de les désactiver : emporterait les `TrackingLinkClick` qui les référencent (aucune cascade déclarée) et effacerait des statistiques d'audience que la disparition de la cible ne périme pas.
- **Passer par `applyPostRemovalEffects`** : rejeté par l'ADR précédente pour les mêmes raisons, inchangées — elle écrirait un `AdminAuditLog` pour un balayage sans acteur et re-libérerait des usages de sons que la passe libère déjà.
- **Déclarer une relation Prisma `TrackingLink.targetId → Post`** pour obtenir une cascade : le champ est polymorphe par conception (post, conversation, user), et le typer sur `Post` casserait les trois autres usages.

**Conséquences** :
- **Un lien de partage de story cesse de fonctionner au moment où la story est détruite**, et répond alors 410 `LINK_INACTIVE` comme n'importe quel lien retiré. C'est un changement observable pour qui a partagé une story : le lien mourait déjà — il redirigeait vers une page morte — mais il mourait en silence, sans le dire au visiteur.
- **La désactivation gouverne la passe.** Si elle échoue, rien n'est détruit cette heure-là et la passe suivante rejoue tout. Une indisponibilité Mongo retarde donc la récupération de disque, comme le font déjà le retrait des notifications et la libération des usages.
- **Aucune réparation rétroactive.** Les liens des posts détruits AVANT ce correctif restent `isActive: true` en base, sans cible et sans chemin pour les retrouver — leur `targetId` désigne des ObjectId qui n'existent plus. Un script de réparation devrait les détecter par absence de cible, sur le patron de `repair-mention-user-ids.ts`. Action humaine : cette routine n'a aucun accès MongoDB.
- **Ce que la décision n'assure PAS** : la fenêtre entre le soft-delete et le hard-delete laisse les liens actifs sur un post déjà masqué (une passe en régime permanent, davantage pendant un rattrapage de passif) ; le `originalUrl` d'un lien EXTERNAL n'est pas concerné ; le push APNs/FCM déjà délivré n'est toujours pas rappelé.

**Tests** : 8 neufs — 4 sur le module de règle (`deactivatePostTrackingLinks.test.ts` : l'ensemble couvert, la non-suppression, la liste vide, le rejet) et 4 sur son câblage dans le balayage (`ExpiredStoriesCleanupService.trackingLinks.test.ts` : stories ∪ reposts, l'ordre avant toute destruction, la passe qui ne détruit rien si la désactivation échoue, l'absence de requête quand rien n'a expiré). Sondes de fidélité en cinq temps — appel retiré du balayage : 3 rouges ; `ids` au lieu de `allPostIds` : 1 ; erreur avalée par un `try/catch` : 1 ; désactivation placée après les suppressions : 2 ; garde de liste vide retirée du module : 1. Le témoin « rien à détruire ⇒ aucune requête » est double-gardé et ne discrimine aucune des deux gardes prise isolément : il pinne le contrat de bout en bout, et son en-tête le dit.

## 2026-08-10 : Le budget d'un message à vue unique se dépense par SPECTATEUR

**Statut** : Accepté

**Contexte** : `POST /conversations/:id/messages/:messageId/consume` incrémentait `Message.viewOnceCount` par un `prisma.message.update({ data: { viewOnceCount: { increment: 1 } } })` inconditionnel. Le compteur mesurait donc des OUVERTURES, alors que tous ses lecteurs le lisent comme un nombre de SPECTATEURS : `isFullyConsumed = viewOnceCount >= maxViewOnceCount`, l'annonce `message:consumed` diffusée à la room, et la disparition du média chez les clients qui en dérivent.

Deux conséquences, et la seconde est celle que l'utilisateur voit. La route est une mutation nue, sans clé d'idempotence : un rejeu — file hors-ligne, double tap, retry réseau — dépense une unité de plus. Et dans un groupe où l'émetteur a posé `maxViewOnceCount: 2`, un seul destinataire qui rouvre la photo deux fois porte `isFullyConsumed` à vrai, la route l'ANNONCE à toute la conversation, et le second destinataire perd un média qu'il n'a jamais ouvert.

La donnée qui rend le compte exact était écrite par ce même gestionnaire, deux instructions plus bas : `MessageStatusEntry.viewedOnceAt`, par participant. Écrite, jamais relue — la forme exacte de la leçon 89, mais dans l'autre sens : un champ dont le producteur existe et dont le consommateur manque.

**Décision** :
- **La règle vit dans son propre module**, `services/messaging/recordViewOnceConsumption.ts`, et rend `{ viewOnceCount, firstConsumption }`. `firstConsumption` ne sert pas qu'au compte : c'est lui qui décide de l'annonce.
- **La revendication est GARDÉE côté base, jamais décidée après une lecture.** « Lire si `viewedOnceAt` est nul, puis écrire » se trompe dès que le même spectateur ouvre deux fois en parallèle : les deux lectures répondent « pas encore vu », les deux écrivent, et le défaut d'origine se déplace d'un cran. C'est l'`updateMany` FILTRÉ qui tranche — la base n'apparie qu'une fois, et seul l'appel qui a effectivement modifié la ligne dépense.
- **Quand rien n'est apparié, c'est l'ÉCRITURE qui distingue les deux causes, pas une seconde lecture.** L'entrée absente (le message n'a jamais été marqué livré ni lu pour ce participant) → la création réussit, c'est une première consommation. L'entrée déjà estampillée → la création se heurte à `@@unique([messageId, participantId])` (P2002), rien à dépenser. Une seconde lecture rouvrirait la fenêtre que la garde vient de fermer.
- **Toute autre panne d'écriture REMONTE.** La lire comme « déjà vu » ferait passer une base indisponible pour une consommation antérieure, et le spectateur perdrait son ouverture sans que rien ne le signale.
- **Le prédicat apparie les DEUX états « pas encore vu »** — `OR: [{ viewedOnceAt: null }, { viewedOnceAt: { isSet: false } }]`. Une entrée créée par `MessageReadStatusService` n'écrit que `deliveredAt`/`readAt` : la colonne est ABSENTE du document, et `{ viewedOnceAt: null }` seul ne l'apparie pas sur le connecteur MongoDB de Prisma. Même piège que le `deletedAt: null` qui avait rendu inerte le balayage éphémère pendant trois cycles, et que celui qui avait vidé le feed en production avant lui.
- **Le spectateur est résolu dans l'ordre de `canAccessConversation`** — `authContext.participantId` d'abord, `userId` en repli — et son absence REFUSE (403). Un anonyme porte un jeton de session dans `authContext.userId` : la recherche par `userId` seule ne trouvait jamais sa ligne, si bien qu'il dépensait le budget sans laisser la moindre trace de l'avoir fait, et pouvait donc le dépenser indéfiniment. Le refus est inatteignable tant que le contrôle d'accès tient — il exige lui-même une ligne de participant active — et existe pour que le budget ne soit jamais dépensé par un spectateur qu'on ne sait pas nommer.
- **L'annonce ne part que sur un changement d'état réel.**

**Alternatives rejetées** :
- **Plafonner l'incrément à `maxViewOnceCount`** au lieu de compter les spectateurs : traite le symptôme (un compteur qui déborde) et laisse la cause (une ouverture répétée dépense le budget d'autrui) intacte jusqu'au plafond.
- **Une clé d'idempotence portée par le client.** Couvrirait le rejeu réseau, pas le destinataire qui rouvre légitimement le média une heure plus tard — et demanderait un champ nouveau là où `viewedOnceAt` existe et dit déjà exactement cela.
- **`upsert` à la place de `updateMany` + `create`.** Sur ce modèle, un upsert écrase `viewedOnceAt` sur la branche update et perd donc la discrimination : la garde ne peut pas vivre dans son `where` unique.
- **Redéfinir `maxViewOnceCount` comme « une ouverture par destinataire »** (le comparer au nombre de participants plutôt qu'à un compteur) : c'est une décision de produit sur ce que l'émetteur choisit, distincte du défaut d'exactitude corrigé ici.

**Conséquences** :
- **Un média à vue unique reste disponible pour les destinataires qui ne l'ont pas ouvert**, quel que soit le nombre de fois où les autres l'ouvrent. C'est un changement observable : `viewOnceCount` progresse désormais plus lentement pour un même trafic, et `isFullyConsumed` bascule plus tard.
- **Un anonyme ne consomme plus qu'une fois** — et son entrée de statut existe enfin, donc les lectures par participant le voient.
- **Le rejeu est silencieux** : même corps de réponse, aucune annonce. Un client qui comptait sur l'événement pour confirmer sa propre requête doit lire la réponse HTTP, ce que font iOS et web.
- **Ce que la décision n'assure PAS** : le serveur ne REDACTE toujours pas le contenu d'un message à vue unique épuisé — l'application de la règle reste entièrement côté client, et le compteur reste consultatif ; `onMessageConsumed` n'a toujours aucun consommateur applicatif côté web (la couche socket l'expose, aucun cache ne s'y abonne) ; rien ne rattrape les `viewOnceCount` déjà gonflés en base par l'ancien chemin.

**Tests** : 13 neufs — 8 sur le module de règle (`recordViewOnceConsumption.test.ts`) et 5 sur son câblage dans la route (`conversation-message-consume.test.ts`, harnais Fastify + double Prisma qui HONORE le filtre de revendication). Sondes de fidélité en cinq temps — incrément inconditionnel : 2 rouges ; prédicat réduit à `{ viewedOnceAt: null }` : 1 ; toute panne lue comme « déjà vu » : 1 ; création retirée quand l'entrée manque : 2 ; corps de route d'origine restauré : 4 sur 5, le survivant étant le verrou du chemin nominal — vert avant ET après, c'est son rôle. Deux témoins pré-existants de `messages-routes.test.ts` mis à jour, pas affaiblis : ils épinglaient `viewParticipant = null` comme un chemin de SUCCÈS ; leur intention (« l'arithmétique de repli des colonnes nullables », « aucune entrée de statut n'est écrite ») est conservée et le second est étendu — le budget ne se dépense pas davantage.
## 2026-08-10 : Le soft-delete des messages est une convention d'ÉCRITURE — elle prend un nom

**Statut** : Accepté

**Contexte** : deux modèles de ce dépôt portent une colonne de soft-delete `deletedAt DateTime?`, et ils ont résolu le même piège MongoDB par deux moitiés opposées.

`Post` a choisi le côté LECTURE. Un post vivant n'a pas de colonne `deletedAt` du tout, et toutes ses requêtes apparient l'ABSENCE (`NOT_DELETED` = `{ isSet: false }`, `services/posts/softDelete.ts`). Le filtre naïf `deletedAt: null` n'apparie que le présent-et-null : appliqué à ce modèle il ne rend AUCUN post vivant, ce qui a vidé feed / reels / stories en production — le post-mortem est en tête de `services/posts/postIncludes.ts`, et le cycle 54 a retrouvé le dernier exemplaire du piège dans le balayage du contenu éphémère, où il rendait la passe entièrement inerte.

`Message` a choisi le côté ÉCRITURE. Ses lectures — ~119 sites : aperçu de conversation, compte de non-lus, delta `/sync`, admission d'édition et de suppression, statistiques — filtrent toutes `deletedAt: null`, et c'est CHAQUE créateur qui rend ce filtre vrai en écrivant la colonne à `null`. Le choix est cohérent et fonctionne ; il a seulement un défaut de forme : il n'était porté par aucun nom. Sept `message.create` répartis dans six fichiers répétaient le littéral, chacun pour son compte, sans qu'aucun ne dise pourquoi.

**Deux d'entre eux l'avaient perdu** : `CallService.createCallSummaryMessage` et `CallService.createLiveCallMessage`. Les lignes qu'ils écrivaient n'étaient donc appariées par aucune des lectures ci-dessus — un « Appel audio en cours » ne devenait jamais l'aperçu de sa conversation, un « Appel manqué » ne faisait monter aucun badge, et les deux étaient absents du delta `/sync` et introuvables à l'édition comme à la réaction. Aucune suite ne pouvait le voir : la sonde de fidélité de ce cycle a montré que vider l'invariant ne faisait tomber AUCUN témoin pré-existant, sur aucun des sept chemins.

**Décision** :
- **La convention prend un nom** : `LIVE_MESSAGE_MARK` (`services/messaging/liveMessage.ts`), étalé par les sept créateurs. Son en-tête écrit l'asymétrie entre les deux modèles, qui est la seule chose qu'un huitième créateur a besoin de savoir.
- **Un témoin sur la SOURCE, pas sept sur les créateurs.** Les sept étalant la même constante, un témoin unique sur `LIVE_MESSAGE_MARK` (présent-et-null, et rien d'autre) les tient tous ; deux témoins sur `CallService` prouvent séparément que l'étalement a bien lieu là où il manquait.
- **Aucun changement de schéma.** `deletedAt` reste `DateTime?`. Ce qui est écrit est l'état VIVANT explicite, pas une valeur par défaut que Prisma poserait — il ne le fait pas.

**Alternatives rejetées** :
- **Ajouter le littéral aux deux sites fautifs et s'arrêter là.** Corrige les symptômes et laisse intacte la cause : sept copies d'une règle sans propriétaire, dont la prochaine divergence sera aussi silencieuse que celle-ci.
- **Basculer les lectures du modèle `Message` sur `NOT_DELETED`** pour aligner les deux modèles côté lecture. Ce serait le geste symétrique, et il est faux ici : les messages EXISTANTS portent tous un `deletedAt` présent-et-null écrit par leurs créateurs, donc `{ isSet: false }` ne les apparierait PAS. Un tel alignement demanderait une migration de données avant la première ligne de code, et rendrait tous les messages invisibles entre les deux. C'est l'erreur inverse du post-mortem de `postIncludes.ts`, avec les mêmes conséquences.
- **Un `@default` Prisma sur la colonne.** Prisma n'écrit pas de valeur par défaut `null` pour un champ optionnel, et l'ajouter ne réparerait aucune ligne déjà écrite.
- **Le prédicat défensif `OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]`** sur les 119 lectures — l'idiome que ce dépôt emploie déjà pour `leftAt`, `expiresAt` et `parentId`. Il rendrait les deux modèles indifférents à la convention d'écriture, ce qui est la solution de fond. Écarté pour ce cycle : 119 sites, aucun témoin existant sur l'invariant, et une passe qui ne serait plus un correctif mais une réécriture des lectures de messages. La constante nommée en est le préalable — elle rend l'invariant greppable, donc cette passe planifiable.

**Conséquences** :
- **Les messages d'appel deviennent des messages ordinaires** pour l'aperçu, le badge de non-lus, `/sync` et la réaction. C'est un changement observable : une conversation dont le dernier événement est un appel remonte désormais dans la liste avec le bon libellé, et un appel manqué badge.
- **Aucune réparation rétroactive.** Les messages d'appel déjà écrits sans la colonne restent invisibles de ces lectures. Ils sont réparables par un `updateMany` sur `messageSource: 'system'` + `clientMessageId` préfixé `call-summary:` dont la colonne est absente — sur le patron de `repair-mention-user-ids.ts`. Action humaine : cette routine n'a aucun accès MongoDB.
- **Ce que la décision n'assure PAS** : les 119 lectures restent dépendantes de la discipline des créateurs ; rien n'empêche mécaniquement un huitième `message.create` d'omettre le marqueur — seul le prédicat défensif ci-dessus le ferait, et il reste à instruire.

**Tests** : 4 neufs — 2 sur la source (`liveMessage.test.ts` : présent-et-null, et rien d'autre) et 2 sur les deux créateurs qui l'avaient perdu (`CallService.summary.test.ts`, `CallService.liveMessage.test.ts`). Sondes de fidélité en trois temps — marqueur retiré du résumé d'appel : 1 rouge, le témoin jumeau reste vert ; retiré du message vivant : 1 rouge, symétrique ; constante vidée (`{}`) : 2 rouges et RIEN d'autre sur 45 suites voisines, ce qui a établi que l'invariant n'était couvert nulle part et motivé le témoin de source. Gate complet : 643 suites / 16 273 tests verts, `tsc --noEmit` 0 erreur.

## 2026-08-10 : « Pas encore » se lit sur DEUX états, et le prédicat prend un nom — `unsetOrNull`

**Statut** : Accepté

**Contexte** : le cycle précédent a nommé la convention d'ÉCRITURE du soft-delete des messages (`LIVE_MESSAGE_MARK`) et a laissé ouverte, comme « solution de fond », la moitié LECTURE : un prédicat qui apparie les deux états « pas encore » d'une colonne optionnelle, l'ABSENCE et le `null` explicite. Il l'a instruite sur le seul cas `deletedAt`, où elle coûte 119 sites. Un balayage des `where` du gateway a montré que le piège vivait ailleurs, sur des colonnes dont AUCUN créateur n'écrit la valeur — donc là où le filtre naïf n'apparie strictement rien, et où le correctif coûte une ligne.

Quatre lectures étaient dans ce cas, et la première est une porte d'accès :

- **`canAccessConversation` refusait tous les participants anonymes.** Aucun des neuf créateurs de `Participant` n'écrit `bannedAt` ; `{ bannedAt: null }` n'appariait donc que les rares lignes qu'un débannissement avait remises à zéro (`resolveUnbanWrite` est le seul producteur d'un `null` explicite sur cette colonne). Comme seul un contexte d'auth anonyme porte un `participantId` (`middleware/auth.ts`), cette branche était la porte de TOUT arrivant par lien de partage : 403 sur la lecture des messages, l'envoi, les fils, les statistiques et la liste des participants.
- **`PasswordResetService.revokeExistingTokens` et son jumeau magic-link n'atteignaient aucun jeton.** `create` ne renseigne pas `usedAt` : la colonne est absente de tout jeton encore vierge, soit exactement ceux que la révocation existe pour annuler. Demander un nouveau lien laissait le précédent valide jusqu'à son expiration, et `revokedReason: 'NEW_REQUEST'` n'a jamais été écrit une seule fois.
- **`MessageProcessor.updateTrackingLinksWithMessageId` n'écrivait aucune attribution.** La réécriture crée le lien avec un `messageId` encore indisponible, donc omis (son propre commentaire dit « sera null » — il est absent) ; le filtre du rattachement post-envoi ne retrouvait pas le lien qu'elle venait de créer.
- **Le compteur `activeTokens` du balayage des jetons rendait toujours 0.**

**Décision** :
- **Le prédicat de lecture prend un nom générique** : `unsetOrNull(champ)` (`utils/prisma-unset.ts`), qui rend `OR: [{ champ: null }, { champ: { isSet: false } }]` en restant typé sur le nom du champ. Un nom par champ (comme `NOT_DELETED` pour les posts) ne convenait pas : les quatre sites portent quatre colonnes différentes dans quatre modules, et c'est l'INVARIANT qui est commun, pas la colonne.
- **Il complète la discipline d'écriture, il ne la remplace pas.** Écrire la colonne (`LIVE_MESSAGE_MARK`, le `leftAt: null` explicite de `CallService.initiateCall`) rend exactes les lignes À VENIR ; ce prédicat rend exactes celles DÉJÀ en base. Aucune des deux moitiés ne rend l'autre inutile, et c'est pourquoi ce cycle n'a pas ajouté d'écriture aux neuf créateurs de `Participant` : les lignes anonymes déjà en base seraient restées dehors.
- **La garde de bannissement est CONSERVÉE, pas retirée.** Elle paraît redondante avec `isActive: true` — un bannissement écrit `isActive: false`. Elle ne l'est pas : `routes/me/delete-account.ts` rallume `isActive` à la restauration d'un compte sans regarder `bannedAt`.
- **Les témoins de ces clauses les jugent en les APPLIQUANT à des documents.** `__tests__/helpers/mongo-where.ts` évalue un `where` contre des objets nus, où une clé absente de l'objet est une colonne absente du document. Un double qui rend ce qu'on lui dit de rendre ne peut pas distinguer une clause qui apparie de sa jumelle qui n'apparie rien — c'est ainsi que ce piège a traversé des suites vertes, et deux des témoins réécrits ici ÉPINGLAIENT la clause fautive.

**Alternatives rejetées** :
- **Faire écrire la colonne par les neuf créateurs de `Participant`** (le geste du cycle précédent, transposé). Il laisse dehors toutes les lignes existantes — c'est-à-dire tous les participants anonymes actuels, précisément ceux dont l'accès est cassé.
- **Retirer la garde `bannedAt` de `canAccessConversation`** puisque `isActive: true` la recouvre presque : la restauration de compte ouvre le trou décrit plus haut, et affaiblir un contrôle d'accès pour contourner un bug de prédicat est le mauvais échange.
- **Un `unsetOrNull` appliqué d'office aux ~12 copies inline déjà correctes** (`leftAt`, `expiresAt`, `parentId`, `mutedAt`, `invalidatedAt`) : elles fonctionnent, et certaines vivent dans un `where` portant DÉJÀ un `OR` — un spread y écraserait silencieusement l'existant. Migration incrémentale, jamais mécanique.
- **Rendre effectif `MaintenanceService.cleanupOrphanedAttachments`** (même défaut, même ligne à corriger) : cette passe SUPPRIME fichier et ligne de façon irréversible et n'a jamais rien supprimé. La réparer, c'est armer un effacement de masse sur des données dont ce conteneur ne sait rien. Reporté explicitement, avec un essai à blanc contre la base de production comme préalable.

**Conséquences** :
- **Un participant anonyme accède enfin à sa conversation par les routes REST**, sans réparation de base préalable — le prédicat apparie les lignes déjà écrites.
- **Une nouvelle demande de lien magique ou de réinitialisation révoque bien la précédente.** C'est un changement observable et voulu : un lien reçu plus tôt cesse de fonctionner dès qu'un nouveau est demandé.
- **`TrackingLink.messageId` est désormais renseigné sur le chemin d'envoi.** La désactivation des liens d'un message supprimé ne dépendait pas de cette colonne (`deactivateOrphanedTrackingLinks` dérive la propriété du contenu) — le gain est l'attribution, pas la sécurité.
- **Ce que la décision n'assure PAS** : les liens de tracking et les jetons déjà en base gardent leur colonne absente pour le passé (les nouvelles lectures les apparient, mais aucune attribution rétroactive n'est écrite) ; le balayage des pièces jointes orphelines reste inerte, délibérément ; les ~119 lectures de `Message.deletedAt` restent adossées à la discipline d'écriture du cycle précédent.

**Tests** : 15 neufs — 6 sur la source (`utils/__tests__/prisma-unset.test.ts`), 5 sur l'accès conversation jugé sur documents, 3 sur la révocation des jetons, 1 sur le compteur du balayage, 1 sur le rattachement des liens ; 3 témoins pré-existants qui épinglaient la clause fautive réécrits en comportement. Sondes de fidélité en sept temps — chacun des quatre sites remis à `{ champ: null }` : 1 rouge chacun (2 pour le magic-link, qui avait deux copies du témoin) ; invariant vidé en `{}` : 8 rouges, dont le refus d'un banni resté actif — un prédicat trop permissif est attrapé comme tel, pas seulement comme une forme fausse ; branche `null` retirée : 3 rouges, dont l'admission du débanni, seul cas que cette branche protège. Gate complet : 646 suites / 16 300 tests verts, `tsc --noEmit` 0 erreur.

## 2026-08-11 : L'aperçu de la ligne de liste est un GROUPE, et il voyage PAR DESTINATAIRE

**Statut** : Accepté

**Contexte** : `GET /conversations` hydrate la ligne de liste avec trois champs solidaires —
`lastMessagePreview` (l'original tronqué), `lastMessageTranslations` (la carte du Prisme du lecteur)
et `lastMessageOriginalLanguage`. Les résolveurs jumeaux des deux clients
(`MeeshyConversation.resolvedLastMessagePreview`, `formatLastMessage`) **PRÉFÈRENT la traduction**
à l'aperçu brut : c'est le Prisme, et c'est le cas nominal du produit.

Les deux émetteurs de `conversation:updated` — `emitConversationPreviewUpdate` (édition/suppression)
et `MeeshySocketIOManager._broadcastNewMessage` (envoi) — n'envoyaient que `lastMessagePreview`.
Une édition périme pourtant `Message.translations` **dans la même écriture** que le nouveau contenu
(`routes/messages.ts`, atomique et délibéré). Les clients n'écrasaient donc que l'aperçu et
gardaient la carte de l'ANCIEN texte — **c'est elle qui restait affichée**, indéfiniment, jusqu'à un
rechargement complet de la liste.

**Décision** :
- **Les trois champs voyagent ensemble.** `conversation:updated` porte désormais la paire de Prisme
  à parité avec `GET /conversations`. Le contrat est déclaré sur `ConversationUpdatedEventData`
  (`packages/shared`) plutôt que laissé à l'`index signature`.
- **`null` est une VALEUR, jamais une omission.** Après une édition la carte reconstruite est vide,
  et c'est ce vide REÇU qui périme proprement celle du client. Le client ne peut pas le déduire :
  une édition garde le MÊME `lastMessageId`, donc « vider quand l'id change » laisse passer
  exactement ce cas. Côté iOS, `Optional` ne suffit pas à porter le signal — d'où le tri-état
  `LastMessagePreviewTranslations` (`.unchanged` = clé absente / `.replaced` = clé présente),
  décodé par la PRÉSENCE de la clé.
- **Le payload est construit PAR DESTINATAIRE.** La carte est filtrée aux langues du lecteur ; deux
  participants de prismes différents n'ont pas la même. La question était portée « non tranchée »
  par le backlog depuis le cycle 60 : **elle l'est par le code existant** — la boucle par
  participant était déjà là, elle envoyait simplement le même objet à tout le monde.
- **Les deux émetteurs sont traités ENSEMBLE**, via l'unité partagée
  `socketio/utils/lastMessagePreviewPrism.ts`. Traiter le seul chemin d'édition aurait rendu
  l'aperçu dépendant du transport : traduit après une édition, brut après un envoi.
- **La règle de dédup `userId ?? id` reste dans UN seul endroit.** `participantUserRoomTargets`
  rend `{ room, participant }` et `participantUserRooms` en devient une projection — c'est, selon
  le doc-comment du fichier, « la seule ligne que chaque copie de ce code a ratée ».

**Alternatives rejetées** :
- **Vider la carte côté client dès qu'un nouvel aperçu arrive** : casse le cycle 65. Le chemin
  d'envoi émet `conversation:updated` DERRIÈRE un `message:new` qui vient d'installer la carte ; un
  vide inconditionnel échange un défaut contre un autre.
- **Vider seulement si `lastMessageId` diffère** : une édition garde le même message, donc le même
  id. C'est précisément le seul cas que ce raffinement laisse passer.
- **Un payload unique partagé par la room**, quitte à envoyer les N traductions : multiplierait le
  poids de chaque événement par le nombre de langues de la conversation pour un champ dont le
  client n'affiche qu'UNE valeur — l'exclusion #1 que `buildLastMessagePreviewTranslations`
  documente déjà.
- **Réimplémenter l'ordre du Prisme dans les émetteurs** : `resolveUserLanguagesOrdered` est la
  seule autorité du dépôt sur cet ordre.

**Conséquences** :
- **Une requête de plus par participant sur le fanout d'aperçu** — un `include` du `user` sur une
  requête `participant.findMany` qui existait déjà. Aucune requête supplémentaire : le `select`
  s'élargit, la requête ne se dédouble pas.
- **Changement observable** : après une édition, la ligne de liste affiche enfin le NOUVEAU texte,
  et le fait dans la langue du lecteur dès que la retraduction arrive.
- **Ce que la décision n'assure PAS** : supprimer le DERNIER message ne met toujours pas la ligne à
  jour côté iOS — le nouveau dernier message est plus ANCIEN, donc le garde monotone le rejette, à
  raison selon sa règle. C'est un contrat distinct (« le dernier message recule »), qu'un seul
  timestamp ne peut pas exprimer. Par ailleurs le chemin d'envoi porte toujours
  `lastMessagePreview` NON tronqué, là où `GET /conversations` applique `truncateMessagePreview`.

**Tests** : 12 neufs côté gateway/web — 5 sur `emitConversationPreviewUpdate` (prisme du lecteur,
payload par destinataire, carte nulle après édition, colonnes sélectionnées, participant sans
compte), 2 sur le jumeau d'envoi dont une garde anti-régression du cycle 65 (le
`conversation:updated` d'envoi ne contredit jamais le `message:new` qui le précède, étant construit
depuis le MÊME message), 5 sur `normalizeConversationPatch` (web).
RED observé avant implémentation : 5 rouges côté gateway, 3 côté web. Gate complet : **650 suites /
16 378 tests verts** (base : 650 / 16 371 — l'écart est exactement les 7 témoins gateway, aucun
perdu), `tsc --noEmit` 0 erreur ; web 30 suites / 750 tests verts. Côté SDK iOS, 8 témoins écrits
(5 sur `applyConversationUpdated`, 3 sur le décodage tri-état) — non gatables dans ce conteneur
(aucune chaîne Swift), gate = `sdk-tests.yml` en CI. Total 20 témoins.

## 2026-08-11 : Une traduction qui atterrit RESSERT l'aperçu — bornée par `PreviewUpdateScope`

**Contexte** : `lastMessageTranslations` est posé sur la ligne de liste par les trois chemins REST
et par les émetteurs temps réel de `conversation:updated`. Le câblage était juste, l'INSTANT ne
l'était pas : l'aperçu est servi à l'ENVOI, quand `Message.translations` vaut encore `null` — la
traduction NLLB arrive une à deux secondes plus tard par ZMQ. Rien ne repassait ensuite. Un lecteur
francophone gardait « Hello » dans sa liste indéfiniment, et le comportement dépendait du parcours :
ouvrir la conversation traduisait la ligne, ne pas l'ouvrir la laissait dans la langue de
l'expéditeur.

**Décision** : `_handleTextTranslationReady` devient le QUATRIÈME émetteur de `conversation:updated`,
en réutilisant `emitConversationPreviewUpdate` — aucune copie du fan-out, du prisme par destinataire
ni de la recomputation du dernier message. Mais une traduction n'est pas une mutation de contenu, et
`PreviewUpdateScope` porte cette différence :

- **`onlyIfLatestIs`** — le fan-out est abandonné si le message traduit n'est plus le dernier de la
  conversation. Son propre chemin d'envoi a déjà servi l'aperçu ; ré-émettre l'ancien ferait
  **reculer** la ligne de liste.
- **`onlyIfPreviewCarriesLanguage`** — n'émet qu'aux destinataires dont la carte RÉSOLUE porte la
  langue qui vient d'atterrir. Le test porte sur la carte SORTIE, donc il hérite gratuitement des
  quatre exclusions de `buildLastMessagePreviewTranslations`.

**Alternatives rejetées** :
- **Faire patcher la ligne par les clients depuis `message:translation`** : l'événement arrive bien
  (tout socket rejoint TOUTES ses rooms de conversation à l'authentification), mais il porte
  `MessageTranslation` — un tableau — là où la ligne consomme une carte compacte `{ langue: aperçu }`
  déjà tronquée et filtrée au prisme. Reconstruire la seconde depuis le premier ferait vivre la
  règle de troncature et les quatre exclusions dans trois clients au lieu du serveur.
- **Un débounce par conversation** pour fusionner la rafale multi-langues en un seul fan-out :
  aurait introduit le PREMIER timer du manager, qui n'a aucun point de fermeture (pas de `shutdown`),
  donc un timer capable de survivre à la suite de tests. `onlyIfPreviewCarriesLanguage` obtient le
  même effet sans état — chaque langue ne touche que ses lecteurs.
- **Émettre inconditionnellement à tous les participants** : une conversation à N langues paierait N
  fan-outs complets par message, sur le chemin le plus chaud du service, dont N−1 strictement
  identiques à l'octet près pour chaque lecteur.

**Conséquences** :
- **Deux requêtes Prisma par traduction du dernier message** (participants + dernier message), en
  parallèle. Quand `onlyIfLatestIs` échoue elles sont toutes deux perdues. Sérialiser les
  économiserait sur ce chemin mais ralentirait l'appelant DOMINANT (l'édition, où les deux sont
  toujours nécessaires) : arbitrage assumé en faveur du chemin dominant.
- **`updatedBy` porte l'auteur du message traduit.** Une traduction n'a pas d'acteur humain et le
  champ est obligatoire ; c'est déjà le repli du chemin d'envoi (`senderUserId ?? message.senderId`),
  et les deux clients ignorent le champ.
- **Changement observable** : la ligne de liste se traduit toute seule, quelques secondes après
  l'arrivée du message, sans que le lecteur ait à ouvrir la conversation.
- **Ce que la décision n'assure PAS** : Android ne décode ni `lastMessageTranslations` ni
  `lastMessageOriginalLanguage` — sa ligne de liste reste dans la langue d'origine, avant comme
  après ce correctif. Le chemin AUDIO n'est pas touché non plus (l'aperçu d'un vocal est un libellé
  de type, pas un texte).

**Tests** : 10 neufs — 6 sur `emitConversationPreviewUpdate` (portée), 4 sur le manager (câblage).
RED prouvé par mutation : gardes retirées ⇒ 3 témoins de portée rouges ; appel neutralisé ⇒ le
témoin de câblage rouge. Deux témoins de portée sont non-discriminants seuls et le disent — ils
verrouillent ce qui ne doit PAS changer.

---

## 2026-08-11 : Un enrichissement asynchrone doit TROIS audiences, pas la seule room de conversation

**Contexte** : `message:attachment-updated` — le delta émis quand Whisper finit une transcription,
puis quand NLLB+Chatterbox rendent chaque langue d'audio traduit — était diffusé dans la seule room
`conversation:<id>`. Deux audiences le perdaient. (1) Le lecteur resté sur la liste : iOS n'émet
`conversation:join` qu'à l'OUVERTURE du fil, donc au lancement de l'app un lecteur sur la liste n'est
dans AUCUNE room de conversation. (2) Le lecteur hors ligne : le `message:new` mis en file à l'ENVOI
porte la pièce jointe sans transcription ni audio traduit — ils n'existent pas encore — donc la copie
rejouée à la reconnexion reste définitivement la non enrichie.

**Décision** : l'émission chaîne la room de conversation ET les rooms personnelles de tous les
participants (`emitToConversationParticipants` : une seule copie par socket), et l'enrichissement
obtient sa PROPRE entrée de file sous `eventType: 'attachment-updated'`, rejouée en
`message:attachment-updated` au drain. La clé de dédup est l'id de la PIÈCE JOINTE, pas celui du
message : l'identité par défaut `(messageId, eventType)` ferait superséder l'enrichissement de la
première pièce jointe par celui de la seconde sur un message à deux audios, alors que par pièce
jointe la règle « le dernier payload gagne » est exactement la bonne (le payload porte l'état
COMPLET).

**Alternatives rejetées** :
- **Laisser les clients rattraper au refetch d'ouverture** : c'est le comportement d'avant, et il
  rend le Prisme fonction de la ROUTE du lecteur (avoir le fil ouvert quand Whisper a fini) plutôt
  que de ses préférences de langue. Même défaut que l'aperçu de liste qui ne se retraduisait jamais.
- **Filtrer le payload par langue du destinataire**, comme `message:new`
  (`filterMessagePayloadForLanguages`) : les clients REMPLACENT la carte de traductions de la pièce
  jointe (iOS `handleAttachmentUpdated`, web `use-socket-cache-sync`), donc un sous-ensemble par
  lecteur EFFACERAIT les langues qu'un fetch REST antérieur avait mises en cache. Le filtrage
  suppose d'abord un contrat de FUSION côté client.
- **Émettre aux rooms personnelles seulement** (sans la room de conversation) : suffisant en théorie
  — tout socket authentifié joint sa room personnelle — mais retirer une audience déjà servie n'était
  pas nécessaire au correctif.

**Conséquences** :
- Une requête participants par delta d'enrichissement (réutilisée par la mise en file, jamais deux
  fois). Une panne de cette requête dégrade vers la room de conversation seule, jamais vers le
  silence.
- Plus de sockets reçoivent chaque delta, non filtré par langue : une conversation à N langues paie
  N diffusions complètes de la pièce jointe. Assumé jusqu'au contrat de fusion client.
- Au plus UNE entrée de file par pièce jointe et par destinataire hors ligne, quel que soit le nombre
  d'étapes d'enrichissement (supersede en place).

## 2026-08-11 : Une page filtrée par curseur se trie PAR ce curseur — sinon sa troncature est une perte

**Contexte** : `GET /conversations?updatedSince=` plafonne à 100 lignes et triait par `lastMessageAt`
décroissant — l'ordre hérité de l'écran de liste, sans rapport avec le filtre. Les lignes coupées
n'étaient donc pas « les moins récemment mises à jour », alors que les deux clients avancent leur
watermark au max des `updatedAt` REÇUS : elles étaient enjambées jusqu'à la réconciliation complète
(1×/24 h sur iOS), la liste affichant entre-temps des compteurs et des aperçus périmés sans signal.

**Décision** : une page DELTA est triée par `updatedAt` croissant, `id` en départage. Les lignes
coupées sont alors exactement celles d'`updatedAt` supérieur à la dernière rendue : le watermark
pointe dessus et l'appel suivant les rend. La troncature devient une pagination, sans aucun
changement client. Une page ordinaire garde `lastMessageAt` décroissant, et le curseur `before`
(qui borne sur `lastMessageAt`) garde la main sur l'ordre.

**Alternatives rejetées** :
- **Câbler la détection côté client** (page pleine ⇒ relecture complète, ce que le web fait déjà) :
  traite le symptôme, doit être réécrit sur chaque plateforme, et fait payer une relecture complète
  là où l'ordre serveur rend la page suivante suffisante.
- **Relever le plafond à 500** (ce que le client iOS demande déjà sans l'obtenir) : déplace le seuil
  sans supprimer le cas, et alourdit une route déjà lourde.

**Conséquences** :
- Un client delta reçoit ses conversations de la moins récemment modifiée à la plus récente. Les deux
  consommateurs fusionnent par id, aucun ne dépend de l'ordre.
- Résidu assumé : plus de 100 conversations portant la MÊME milliseconde d'`updatedAt` débordent
  d'une page que la borne stricte `gt` ne peut pas reprendre. La détection de page pleine reste donc
  utile côté client — le web la garde, iOS ne l'a pas encore.

---

## Le transfert d'un contenu éphémère ou à vue unique — refuser d'un côté, propager de l'autre

**Contexte** : transférer un message crée une ligne `Message` INDÉPENDANTE. `forwardedFromId` ne
pointe que vers l'origine, il ne transporte aucun état : la copie naissait sans `expiresAt`, sans
`isViewOnce` et sans le bit `EPHEMERAL`. Le balayage du cycle 92 détruisait donc l'original à
l'heure dite pendant que la copie, faite deux secondes après réception, restait lisible pour
toujours dans une autre conversation. Aucun garde ne s'y opposait à aucun des trois transports
d'envoi (REST, socket texte, socket pièces jointes), et `MessageActionResolver` (iOS) propose
`.forward` INCONDITIONNELLEMENT — contrairement aux deux défauts précédents de la même veine,
celui-ci ne demandait pas un client modifié : un appui long suffisait.

**Décision** : un garde unique, `admitMessageForward` (`services/messaging/forwardAdmission.ts`),
appelé depuis `MessagingService.handleMessage` — le seul point où les trois transports convergent
avant l'écriture. Il répond différemment aux deux promesses, et la différence est forcée, pas
choisie :

- **Éphémère → propager.** La copie hérite de la DURÉE de l'original (`expiresAt − createdAt`),
  recomptée depuis l'envoi du transfert. Le compte repart de zéro parce que les nouveaux
  destinataires n'ont rien vu : leur servir les 3 secondes résiduelles d'un minuteur de 24 h ne
  voudrait rien dire. La propriété est TRANSITIVE sans code dédié — la copie est à son tour une
  source éphémère bien formée.
- **Vue unique → refuser.** Propager ne fermerait rien : `viewOnceCount` repart à zéro sur la ligne
  neuve, donc se transférer à soi-même une photo à vue unique rendrait un budget de vues neuf,
  autant de fois que voulu. Seul le refus tient la promesse. C'est aussi ce que font WhatsApp et
  Signal, qui interdisent l'un comme l'autre le transfert d'un contenu à vue unique.

**Alternatives rejetées** :
- **Lire `Message.ephemeralDuration`**, qui dit exactement ce qu'il faudrait : le champ est ÉCRIT
  PAR PERSONNE (aucun transport ne le transmet, `saveMessage` ne le range pas) et vaut `null` sur
  toute la collection. S'y fier aurait rendu le garde inopérant en silence.
- **Un garde par route** : quatrième copie d'une règle de permission, exactement la maladie que
  `messageEditAdmission` soigne.
- **Refuser aussi le transfert de l'éphémère** : plus simple, mais ferme une fonctionnalité que ni
  WhatsApp ni Signal ne ferment, alors que la propagation suffit à tenir la promesse.

**Conséquences** :
- Une source introuvable ou une lecture qui échoue n'interrompt PAS l'envoi : le transfert dégénère
  en message ordinaire (comportement d'avant, ne fuit rien de plus). Transformer un envoi en erreur
  parce que la base a hoqueté coûterait plus que ce que ce garde protège.
- Le refus remonte en `success: false` par `createErrorResponse`, sur les trois transports. Les
  clients affichent l'erreur ; **aucun ne masque encore `.forward` sur un message à vue unique** —
  l'UX reste une action offerte puis refusée. Suivi iOS ouvert (`MessageActionResolver` : ajouter
  `isViewOnce` à `MessageMenuContext` et filtrer `.forward`/`.share`).
- Dette ANTÉRIEURE rendue plus visible, non traitée ici : `copyForwardedAttachments` copie
  `filePath` VERBATIM, donc la copie et l'original partagent le fichier sur disque. La destruction
  de l'original (`deleteAttachment` → `fs.unlink`) emporte donc le média de la copie avant sa propre
  échéance. Le défaut préexiste (la copie perdait déjà son fichier quand elle était permanente) et
  ne fuit rien — il dégrade. Le fermer demanderait de dupliquer l'octet ou de compter les
  références.

## 2026-08-13 : Un accusé de lecture se compte à UN endroit — le rattrapage REST cesse d'en tenir sa propre copie

**Contexte.** Le résumé « reçu par / lu par » d'un message avait CINQ producteurs. Quatre vivaient
dans `MessageReadStatusService` (`getMessageReadStatus`, `getConversationReadStatuses`,
`getMessageStatusDetails`, `getLatestMessageSummary`), tous porteurs du même commentaire explicite :
l'opt-out `showReadReceipts` est retiré EN AMONT, donc absent du numérateur COMME du dénominateur.
Le cinquième était une copie inline dans `GET /conversations/:id/messages` — le chemin de
rattrapage, lu à chaque démarrage à froid et à chaque remontée de fil. Cette copie reproduisait
fidèlement l'union curseur/reçu figé, la borne `createdAt`, l'exclusion de l'expéditeur… et rien
d'autre. Elle n'avait jamais consulté la préférence.

**La conséquence, pas théorique.** Le gate d'opt-out est POSÉ à l'émission (`message-read-status.ts`
suspend le broadcast quand le destinataire a désactivé ses accusés) et TENU par le canal socket. Le
rattrapage REST le contournait : l'expéditeur ne voyait rien passer en direct, puis relançait
l'application et lisait sa coche bleue. Le dénominateur divergeait du même coup — `recipientCount`
comptait un destinataire que le socket en retirait, si bien que « lu par tous » basculait ou non
selon le chemin par lequel la vérité était arrivée.

**Décision.** La route délègue à `getConversationReadStatuses`. Le comptage n'a plus qu'un domicile.
`computeRecipientCount` — le dénominateur, jusqu'ici exporté par le module de route et appelé par
lui seul — descend dans `utils/read-exactness.ts`, aux côtés de `resolveReadAt`, et devient l'unique
formule employée par le service.

**Alternatives rejetées** :
- **Ajouter le filtre d'opt-out à la copie inline.** Corrige la fuite du jour et laisse en place la
  cause : deux implémentations d'une même règle, dont une seule est relue quand la règle bouge. La
  divergence corrigée ici s'était installée exactement ainsi.
- **ÉCRIRE les colonnes dénormalisées `Message.deliveredCount`/`readCount`.** Elles n'ont aucun
  écrivain et valent zéro sur toute la collection. Les alimenter coûterait une écriture par
  destinataire et par accusé sur le chemin chaud, pour une valeur que les entrées
  `MessageStatusEntry` portent déjà exactement — avec, en prime, une seconde vérité à réconcilier.
- **Passer la page de messages déjà chargée au service** pour lui épargner son `message.findMany`.
  Écarté : la signature du service resterait à deux formes, pour une requête indexée sur
  `_id ∈ page`. Les quatre lectures indépendantes du service passent en revanche en `Promise.all`
  (elles étaient séquentielles) — la délégation coûte donc DEUX allers-retours là où la copie inline
  en coûtait un, et non cinq.

**Conséquences** :
- Le repli `?? message.deliveredCount` disparaît du mapping de réponse. Un champ sans écrivain ne
  doit pas se présenter comme une valeur de secours : il ne pourrait que faire régresser un
  compteur juste vers zéro.
- Un participant qui coupe ses accusés disparaît du dénominateur : pour un tête-à-tête, l'expéditeur
  voit `recipientCount: 0` et ses clients retombent sur leur compte de membres local. C'est le
  comportement DÉJÀ servi par le socket ; ce changement le rend cohérent, il ne l'introduit pas.
- Restent servis en dur, hors périmètre : `GET /conversations/:id/status` et `GET /messages/:id`
  renvoient toujours le résumé DEPUIS les colonnes mortes, donc `{0, 0, null, null}` — la première
  contredisant, dans la même charge utile, les `entries` per-participant qu'elle expose par ailleurs
  sans filtre d'opt-out. Aucun client connu ne les appelle.

## 2026-08-13 : Un accusé NOMINATIF se tait comme un compteur — et une page de statuts a une borne

**Contexte.** Le cycle précédent avait unifié le comptage des accusés sur
`MessageReadStatusService` et laissé, explicitement, deux surfaces de la même famille : elles
servaient leur résumé DEPUIS les colonnes `deliveredCount`/`readCount`/`deliveredToAllAt`/
`readByAllAt` de la ligne `Message` — des champs sans écrivain, donc `{0, 0, null, null}` sur toute
la collection. `GET /conversations/:id/status` se contredisait ainsi **dans la même charge utile** :
un résumé à zéro à côté d'`entries` qui portaient, elles, les vraies dates de lecture.

**Le défaut n'était pas seulement une valeur fausse.** Ces `entries` exposent des accusés
**NOMINATIFS** — `participantId`, `displayName`, `avatar`, `username`, `readAt` — sans aucun filtre
`showReadReceipts`, alors que les cinq autres lecteurs le posent. Un participant qui avait coupé
ses accusés y voyait sa lecture datée et son nom servis à quiconque pouvait lire la conversation.
Une fuite plus directe que celle fermée au cycle précédent : là un compteur, ici une identité et
un horodatage. Et la requête n'avait **aucune borne** — chaque message non supprimé de la
conversation, avec ses entrées de statut et le participant joint sur chacune : sur un fil de
plusieurs dizaines de milliers de messages, un déni de service qu'un simple participant
déclenchait.

**Décision.** Les deux routes délèguent leur résumé à `getConversationReadStatuses`, comme la liste
de messages. `GET /conversations/:id/status` filtre en outre ses `entries` par une nouvelle méthode
publique du service, `filterReadReceiptVisible(participants)`, et borne sa page à
`CONVERSATION_STATUS_PAGE_SIZE = 50` messages les plus récents. `GET /messages/:messageId` écrase
aussi ses champs de PREMIER NIVEAU (`deliveredCount`/`readCount`), que les trois clients décodent
pour leurs coches — les laisser au contenu de la ligne aurait servi zéro ici pendant que la liste
sert le compte réel.

**Pourquoi une méthode publique plutôt que de rendre l'ensemble des exclus.** `filterReadReceiptVisible`
répond à la question telle que l'appelant se la pose — « lesquels ai-je le droit de montrer ? » —
et non « qui s'est retiré ? », dont la seule TAILLE trahirait déjà le nombre de retraits. Le cœur
(`_loadReadReceiptOptOuts`) reste privé.

**Alternatives rejetées** :
- **RETIRER `GET /conversations/:id/status`.** Aucun client des quatre plateformes ne l'appelle
  (vérifié par grep sur `apps/` et `packages/MeeshySDK`), sa fonction est déjà rendue, correctement
  et paginée, par `GET /messages/:messageId/status-details` — l'argument du cycle 100 (« un champ
  mort sort entier ») s'appliquerait. Écarté quand même : supprimer un endpoint d'une API PUBLIÉE
  est une décision produit irréversible, du même genre que celles que cette routine confie à un
  humain. La réparation ferme les trois défauts sans la prendre. **La question reste ouverte et
  mérite d'être posée.**
- **Relire `UserPreference` depuis la route** pour filtrer les `entries` : c'est exactement la
  réimplémentation qui a fait diverger la règle une première fois (§ 2026-08-13, première entrée).
- **Paginer par paramètre de requête** plutôt qu'un plafond fixe : ajoute un contrat à un endpoint
  sans consommateur. Le plafond suffit à fermer le déni de service ; le détail exhaustif d'un
  message précis vit derrière la route paginée qui existe déjà.

**Conséquences** :
- `summary` gagne `recipientCount` (dénominateur faisant autorité) et perd `deliveredToAllAt` /
  `readByAllAt`, qui ne pouvaient être que `null`. Aucun client ne les lisait.
- Le plafond de 50 est un CHANGEMENT DE CONTRAT pour un endpoint qui rendait tout : `total` compte
  désormais les messages RENDUS, pas ceux de la conversation. Sans consommateur connu, l'impact est
  nul aujourd'hui ; il est consigné ici pour qui en ajouterait un.
- Un test qui figeait `deliveredCount: 3` sur ce handler a été repointé : il verrouillait une
  valeur que la production ne produit jamais, donc le comportement du double et non celui de la
  route.

## 2026-08-13 — Les DATES du seuil « tous servis » se calculent ; `receivedByAllAt` sort

**Contexte.** Les deux entrées précédentes ont ramené les COMPTEURS d'accusés à leur unique source
de vérité (`MessageReadStatusService.getConversationReadStatuses`, union curseur/reçu figé, opt-out
`showReadReceipts` retiré du numérateur comme du dénominateur). Elles ont laissé une couche
au-dessus intacte : les DATES de seuil `deliveredToAllAt` / `readByAllAt` sortaient encore de la
ligne `Message`.

**Le défaut.** `MessageReadStatusService.updateMessageComputedStatus` est un **no-op documenté**
depuis le passage aux curseurs — « Computed fields are no longer stored on Message to improve write
performance ». Aucun autre site n'écrit ces colonnes : sur toute la collection, elles valent `null`.
Or `GET /conversations/:id/messages` et `GET /messages/:messageId` les relayaient telles quelles, et
les **trois clients** lisent `readByAllAt != null` comme la PREUVE que tous les destinataires ont lu
(`DeliveryStatusResolver` iOS et Android, `MessageRecord+ToMessage`, `MessagePersistenceActor`).
La branche `!= null` de leurs résolveurs était donc morte depuis le passage aux curseurs, et le
serveur promettait dans son schéma OpenAPI un horodatage « lu par TOUS » qu'il ne pouvait jamais
produire.

**Décision.** `getConversationReadStatuses` rend désormais aussi `deliveredToAllAt` / `readByAllAt`,
dérivés de la MÊME union que les compteurs : l'instant du **dernier** destinataire servi, `null`
tant qu'il en manque un (`count >= totalMembers`). Les deux routes les servent de là et ne
`select`ent plus aucune des cinq colonnes dénormalisées de statut.

**`receivedByAllAt` est RETIRÉ entièrement** — Prisma, `MessageEntity` (`message-types.ts`),
`ConversationMessage` (`conversation.ts`), `messageSchema` (`api-schemas.ts`) et les deux `select`.
Contrairement à ses deux voisines, il n'a **ni écrivain ni lecteur** : aucun des trois clients ne le
décode (vérifié par grep sur `apps/web`, `apps/ios`, `apps/android`, `packages/MeeshySDK`). C'est le
cas du cycle 100 à l'état pur, et il sort avec ses déclarations.

**Alternatives rejetées** :
- **Retirer les trois d'un même geste**, comme la note de suivi le proposait. Refusé après relecture
  du code plutôt que de la note : `deliveredToAllAt` / `readByAllAt` ont de VRAIS lecteurs sur iOS,
  Android et le SDK. Les retirer du contrat aurait cassé trois décodeurs pour supprimer un défaut
  qui se répare. Un champ mort à l'ÉCRITURE et un champ mort tout court ne se traitent pas pareil.
- **Réanimer les colonnes** en réactivant `updateMessageComputedStatus`. C'est la décision d'archi
  que le passage aux curseurs a explicitement prise à l'envers (une écriture par accusé et par
  message) ; la dériver à la lecture coûte zéro requête de plus, tout étant déjà chargé.
- **Ajouter une garde `totalMembers > 0`** au seuil : `totalMembers` ne vaut zéro que si l'ensemble
  des destinataires évalués est vide, auquel cas les deux maxima sont `null` de toute façon. La
  garde serait du code qu'aucun test ne peut rougir.

**Conséquences** :
- Un client voit enfin `readByAllAt` se remplir. La valeur est celle du serveur (opt-out retirés),
  plus exacte que le `readCount >= recipientCount` local sur lequel les résolveurs retombaient.
- `receivedByAllAt` disparaît des charges utiles. Retrait d'un champ d'API publique, mais qui ne
  pouvait valoir que `null` et que personne ne décodait — les données Mongo existantes ne sont pas
  touchées, Prisma cesse simplement de mapper la colonne.
- `deliveredCount` / `readCount` restent déclarés en base sans écrivain : ils ont, EUX, des lecteurs
  clients et sont déjà servis calculés. Leur retrait de Prisma est un lot distinct.

## 2026-08-13 — Un delta qui ne sait annoncer que des arrivées n'est pas un delta

**Contexte** : `GET /conversations?updatedSince=` est le canal de rattrapage des deux clients
(`ConversationSyncEngine.deltaSyncCore` sur iOS, `useConversationsDeltaSync` sur le web). Il
réutilise le `whereClause` de la liste : conversation `isActive: true`, participant actif sans
`deletedForMe`. Cette clause est exactement ce qu'il faut pour SERVIR une ligne — et exactement ce
qui rend une DISPARITION impossible à exprimer. Une conversation fermée, quittée, dont
l'utilisateur a été banni, ou supprimée-pour-moi depuis un autre appareil ne revient dans aucune
réponse ; les deux clients fusionnant en upsert, rien ne la retire de leur cache avant la
réconciliation complète — 24 h de part et d'autre.

**Décision** : trois lectures ids-only, parallèles, cappées, servies dans
`meta.deletedConversationIds` + `meta.deletedConversationIdsTruncated`
(`routes/conversations/utils/delta-tombstones.ts`). Forme reprise telle quelle de
`meta.deletedStoryIds` sur le tray stories — même geste client, même question.

Trois propriétés non négociables, chacune payée par un défaut réel :
- **Le leave et le ban n'écrivent QUE la ligne `Participant`.** `Conversation.updatedAt` ne bouge
  pas : un stream qui interroge la conversation ne les verrait jamais. C'est pourquoi deux des trois
  lectures portent sur `Participant` et non sur `Conversation`.
- **Le stream « fermées » ne filtre pas sur un participant ACTIF.** Un banni porte
  `isActive: false`, et c'est précisément lui qui doit voir la ligne partir.
- **La troncature se prouve par une sonde `cap + 1`.** Une égalité sur le cap ne prouve rien : une
  fenêtre de très exactement `cap` tombstones est complète, et l'annoncer tronquée déclencherait une
  relecture entière pour rien.

**Alternatives rejetées** :
- **Attendre la collection `conversations` de `/sync`** (gwcontract-10). Le canal existe mais n'a
  aucun client, et son select de messages est encore squelettique : bloquer une purge livrable
  aujourd'hui sur un chantier de contrat, c'est garder les fantômes six mois de plus.
- **Faire échouer la liste quand le calcul des tombstones échoue.** Posture inverse d'un contrôle
  d'autorisation, et délibérée : afficher les conversations est le produit, en retirer une est une
  courtoisie. Le repli est `truncated: true` sur liste vide — le client escalade vers la
  réconciliation complète, qui est exactement son recours.
- **Les deux index composites `Participant` prescrits par la fiche** (`[userId, deletedForMe]`,
  `[userId, leftAt]`). L'index `[userId]` existant borne déjà chaque stream aux quelques centaines
  de lignes de participant de l'utilisateur ; deux index de plus taxeraient chaque écriture de
  participant pour un gain nul. Le seul index ajouté est `Conversation @@index([closedAt])` — le
  seul des trois streams qui ne parte pas d'un `userId` indexé, donc le seul qui balayait la
  collection entière.

**Conséquences** :
- `meta` est déclaré dans `conversationListResponseSchema`. Non déclaré, `fast-json-stringify`
  l'aurait retiré du fil en silence, et aucun témoin de route ne l'aurait vu (ils lisent l'objet
  AVANT sérialisation) — même piège que le `cursorPagination` documenté dans ce schéma.
- Le bloc entre dans le corps hashé par `sendWithETag` : un 304 ne peut pas masquer une sortie de
  vue qui vient d'apparaître.
- Aucune requête supplémentaire hors mode delta : l'écran de liste ne paie rien.
- Le client iOS reste à câbler (`ConversationSyncEngine.deltaSyncCore`) — le champ est additif, un
  client qui l'ignore se comporte exactement comme avant.

## 2026-08-13 — Le select de `/sync` EST son contrat de rendabilité

**Contexte** : la collection `messages` de `GET /sync` ne rendait que six champs (`id`,
`conversationId`, `senderId`, `content`, `createdAt`, `updatedAt`). Aucun client ne consomme encore
cette route — c'est précisément ce qui rendait l'écart facile à ignorer, et c'est aussi ce qui le
rendait bloquant : un client qui appliquerait `added`/`modified` sur cette base écrirait dans sa
base locale des lignes qu'il ne peut PAS afficher. Sans `translations` ni `originalLanguage`, la
résolution du Prisme Linguistique n'a rien à résoudre et le message s'affiche dans la langue de
l'expéditeur ; sans `attachments`, la bulle perd sa pièce jointe ; sans `clientMessageId`, la
réconciliation optimiste ne peut pas apparier sa ligne et duplique la bulle.

**Décision** : `syncMessageSelect`, écrit sous `Prisma.validator<Prisma.MessageSelect>()` (un nom de
champ périmé casse le BUILD, pas la requête), et `SYNC_MESSAGE_RENDERABLE_KEYS` — la liste explicite
des clés qu'un client doit recevoir, qu'un témoin de forme oppose au select réel. Amaigrir la
projection pour économiser de la bande passante doit d'abord faire rougir un test.

**Alternatives rejetées** :
- **Laisser le select maigre et faire re-fetch les ids par le client.** N allers-retours pour une
  fenêtre de rattrapage, et une violation directe du cache-first.
- **Recopier les sous-selects `attachments` / `sender`.** C'est exactement la dérive que
  `attachmentIncludes.ts` documente en tête de fichier (cinq copies locales avaient perdu les deux
  champs Prisme). `attachmentMediaSelect` et `messageSenderUserSelect` sont réutilisés tels quels.
- **Importer `messageSenderUserSelect` depuis `conversations/messages.ts`.** L'import aurait traîné
  un module de routes entier — et ses dépendances — jusque dans les doubles jest des suites
  voisines, le danger que `utils/active-member-count.ts` nomme déjà. Le fragment est extrait dans
  `conversations/utils/message-sender-select.ts` et reste ré-exporté par `messages.ts`.

**Conséquences** :
- `SyncMessage` se DÉDUIT (`Prisma.MessageGetPayload<{ select: typeof syncMessageSelect }>`) au lieu
  d'être une déclaration parallèle qui pouvait dériver du select en silence.
- Le stream `deleted` reste maigre (`id`, `conversationId`, `deletedAt`) : un tombstone n'a rien à
  rendre. Un témoin le verrouille.
- Charge utile plus lourde, bornée par le cap 1000 et `limit` ; l'ETag reste correct (hash du
  contenu sérialisé), le keyset `(updatedAt, id)` et le cap sont inchangés — trois témoins de
  non-régression le disent.

---

## La diffusion d'une préférence vit à la portée de la préférence, et la résolution Socket.IO n'a qu'un site

**Date** : 2026-08-16 (cycle 48)

**Contexte** : `user:preferences-updated` (scope catégorie) était émis depuis une
fermeture locale du facteur de routes, qui résolvait le serveur Socket.IO par
`fastify.socketIOHandler?.getManager?.()?.getIO?.()`. C'était le QUATRIÈME site de
résolution du dépôt, alors que `utils/socket-broadcast.ts` est le point unique
déclaré — et il n'en connaissait que deux formes. Les deux marchaient, mais pas
pour la même raison : `getIO()` est l'accesseur PUBLIC du manager, `manager.io`
un champ PRIVÉ que seul l'effacement des modificateurs TypeScript à l'exécution
rendait lisible.

**Décision** :
1. `resolveSocketIO` consulte l'accesseur PUBLIC `getManager().getIO()` en
   premier ; `manager.io` puis `handler.io` restent des replis pour les doubles.
2. Le facteur cesse de réimplémenter : ses quatre verbes passent par
   `broadcastToUser`.
3. La règle « qui apprend quoi » descend dans
   `services/preferences/preferences-broadcast.ts`, à côté du résolveur
   (`privacy-storage`) et de la mémoïsation (`privacy-cache`) de la même donnée.
   Les routes importent une fonction, pas une instance.
4. Les DEUX `DELETE` diffusent, comme `PUT` et `PATCH`. La remise à zéro globale
   émet UNE FOIS PAR CATÉGORIE.
5. Les DEUX `DELETE` passent de `update` à `updateMany`.

**Alternatives rejetées** :
- **Laisser le facteur avec sa propre résolution.** Elle était la seule à viser
  l'accesseur public, donc « la bonne » — mais en quatre exemplaires la question
  « laquelle est juste ? » n'a pas de réponse stable. Le point unique apprend la
  forme publique plutôt que d'être contourné par qui la connaît.
- **Un seul événement « toutes catégories » pour la remise à zéro globale.** Le
  client ne discrimine que sur `conversationId`, `communityId` et `category` : un
  événement sans `category` tomberait dans aucune branche et serait perdu en
  silence. Sept émissions sur une action rare valent mieux qu'une émission qui ne
  fait rien.
- **`upsert` au lieu de `updateMany` pour la remise à zéro.** Aligné sur
  `PUT`/`PATCH`, mais il CRÉE une ligne pour dire qu'il n'y a rien à stocker —
  une ligne par compte qui touche « réinitialiser » sans avoir jamais rien réglé.
- **Attraper `P2025` et rendre 200.** Reconnaître une erreur à son code pour la
  déclarer normale, là où `updateMany` exprime directement « remets à zéro ce qui
  existe » et rend `{ count: 0 }` quand rien n'existe.

**Conséquences** :
- `services/preferences/PreferencesService.ts` supprimé : orphelin, et dernier
  écrivain du rangement clé/valeur hérité `UserPreference` — donc le moyen tout
  prêt de recréer la divergence fermée au cycle 46. Le baril du module exporte
  désormais des fonctions.
- La diffusion reste best-effort : `broadcastToUser` journalise et rend `false`
  quand la couche Socket.IO manque, une écriture REST ne devant jamais échouer
  pour un canal latéral.
- Sur MongoDB, `data: { champJson: null }` est la forme VALIDE et
  `Prisma.DbNull` celle qui lève — l'inverse du folklore, vérifié contre un
  client 6.19.3 généré sur ce schéma. Le `null` brut en place est conservé.

## Un `PATCH` n'applique que ce que son corps NOMME (2026-08-16, cycle 49)

**Contexte** : `ZodObject.partial()` enveloppe chaque champ dans `optional()`
sans lui retirer son `default()`. Parser un corps partiel contre un schéma
défaillé rend le schéma ENTIER, garni de ses défauts — 13 à 33 clés selon la
catégorie de préférences. Toute fusion `{ ...existant, ...validé }` était donc
inerte : le second terme couvrait le premier, et un `PATCH` d'un interrupteur
remettait tous les autres réglages de la catégorie à leur défaut.

**Décision** : `utils/partial-update.ts` → `submittedKeysOnly(validé, corps)`.
La validation de Zod est conservée intégralement ; sa SORTIE est réduite aux
clés de premier niveau que le corps de la requête porte.

**Pourquoi le corps et non le schéma** : après coup, rien dans la sortie de Zod
ne distingue un défaut injecté d'une valeur envoyée qui lui ressemble —
`{ a: true }` a la même forme dans les deux cas. Le corps est la seule source
qui dise ce que l'appelant a NOMMÉ.

**Alternatives rejetées** :
- **Déballer les `ZodDefault` du schéma avant `partial()`.** Demande de
  parcourir des `_def` internes, casse à chaque nouvelle enveloppe (`nullable`,
  `catch`, `pipe`), et ne dit toujours rien des clés imbriquées.
- **Retirer les `default()` des sept schémas.** Ils servent au `PUT`, dont le
  contrat EST « remplace complètement, comble ce qui manque ». Les retirer
  déplacerait le défaut d'un verbe à l'autre.
- **Ne rien changer et documenter « envoyez toujours l'objet complet ».** C'est
  la sémantique de `PUT` ; `PATCH` existerait alors sans raison, et les deux
  clients qui l'appellent déjà partiellement resteraient en faute.

**Conséquences** : la fusion partielle redevient partielle sur les sept
catégories de préférences et sur `PATCH /admin/agent/topics/:id`. La borne est
explicite : la réduction ne descend PAS dans les objets imbriqués — aucun schéma
appelant n'en porte aujourd'hui, et la fusion profonde sera une décision à
prendre une seule fois, dans ce module.

## Le rangement d'une catégorie est INJECTÉ, pas déduit de son nom (2026-08-16, cycle 49)

**Contexte** : `privacy` est la seule catégorie dont l'état ne tient pas dans son
document JSON — les lignes clé/valeur de janvier 2026 que les six portes de
diffusion obéissent toujours (cycle 46). Les routes ne lisaient que le document :
l'écran affichait « tout visible » pendant que le serveur taisait, et le `PATCH`
reconstruisait sa base sur ce défaut.

**Décision** : `createPreferenceRouter` accepte un `CategoryStorage<T>` optionnel
— `readStored` (ce que le serveur tient pour stocké) et `afterWrite` (ce qu'il
faut retirer une fois le document autoritatif). Le rangement de `privacy` est
composé au site d'enregistrement, dans `routes/me/preferences/index.ts`.

**Alternatives rejetées** :
- **`if (category === 'privacy')` dans la factory**, comme le fait déjà
  `invalidateServerCache`. Chaque catégorie à histoire ajouterait une branche à
  un module qui n'a aucune raison de connaître ces histoires.
- **Surcharger le `GET`/`PATCH` de `privacy` hors factory.** Deux implémentations
  des mêmes quatre verbes, dont une seule recevrait les correctifs suivants.
- **Mémoïser `resolveStoredPrivacyPreferences` dans le cache des portes.**
  Ce cache tolère 5 min de retard parce qu'une écriture le purge ; un écran de
  réglages qui affiche une valeur qu'un AUTRE processus vient de changer est
  exactement le défaut qu'on referme, sous un autre nom.
- **Garder les lignes de janvier après écriture.** Sans `afterWrite`, la remise à
  zéro repose le document à `null`, la lecture redescend sur janvier, et
  « réinitialiser » ne réinitialise rien tout en n'étant plus visible nulle part.

## Un rôle n'est une autorité que dans un conteneur qui a une HIÉRARCHIE (2026-08-17, cycle 56)

**Contexte** : `PUT /conversations/:id` posait deux gardes, toutes deux sur
l'identité de l'appelant — appartenance de rôle `creator`|`admin`|`moderator`, et
refus des champs de permissions à un `moderator` — et **aucune sur le type du
conteneur** ; la route n'ouvrait pas la ligne `Conversation` avant de l'écrire.
Or `POST /conversations` crée un `direct` avec deux rôles distincts, `creator`
pour qui a ouvert le fil et `member` pour l'autre. L'asymétrie nomme un **ordre
d'arrivée**, pas une hiérarchie — un tête-à-tête n'a pas d'administrateur — mais
la garde d'appartenance la lisait comme une autorité.

Tant que `isAnnouncementChannel` n'était appliqué par personne, cela n'écrivait
qu'un champ mort. Le câblage du cycle 31 — juste, et au bon endroit
(`MessagingService.handleMessage`, point de convergence des trois transports) —
l'a rendu effectif : l'initiateur d'un DM pouvait dès lors faire **taire son
pair** (`member` rang 1 sous un plancher `admin` rang 3) sur REST, socket texte
et socket pièces jointes à la fois, et sans recours — ce même PUT répond 403 à un
`member`. Le site qui écrit le champ n'avait pas changé ; seule son effectivité
l'avait fait.

**Décision** : deux gardes, à deux portées, dont aucune ne subsume l'autre.

- **La règle** — `conversationWriteAdmission.WRITE_HIERARCHY_FREE_TYPES` nomme les
  types de conteneur SANS hiérarchie d'écriture : `global` et `direct`.
  `requiredWriteRank` y rend `0` et n'interroge personne. C'est le geste qui
  guérit les conteneurs déjà marqués en base, dont aucune route ne rendra jamais
  compte. La dispense porte sur le RANG, jamais sur l'existence : l'état terminal
  est tranché avant, donc un tête-à-tête clos reste refusé.
- **L'autorité** — la route refuse `defaultWriteRole`, `isAnnouncementChannel` et
  `slowModeSeconds` sur un `direct`. Le type arrive par la relation du `findFirst`
  d'appartenance déjà émis, donc sans requête supplémentaire. Un type inconnu
  reste permissif, idiome documenté du module : la garde qui protège le pair est
  la règle, qui lit le type sur la ligne autoritaire de conversation.

**Alternatives rejetées** :
- **La règle seule.** La route persisterait le réglage et diffuserait un
  `conversation:updated` portant un drapeau que plus rien n'applique — un
  événement qui MENT aux clients sur l'état du conteneur, dont ils tirent leur UI.
- **La route seule.** Les tête-à-tête déjà marqués resteraient muets pour leur
  pair, sans qu'aucune requête ne puisse les rouvrir.
- **Refuser les HUIT champs du corps sur un `direct`.** `title`, `description`,
  `avatar`, `banner` et `autoTranslateEnabled` ne décrivent aucune hiérarchie.
  Les écritures cosmétiques sur un DM sont mortes (web résout le nom et l'avatar
  du pair) mais les interdire relève d'une décision sur ce que
  `Conversation.title` SIGNIFIE pour un `direct`, à côté du `customName` de
  préférences — pas d'un correctif d'autorisation.
- **Un garde générique « ce type accepte-t-il un réglage de police ? » ouvert aux
  préférences de communauté et aux droits de lien.** C'est la bonne forme, et
  elle demande d'inventorier ces deux familles d'abord ; piste n°7 du cycle 57.

**Tests** : 9 neufs — 4 sur la règle (2 dispenses, 2 bornes : un DM clos reste
refusé, un groupe garde sa hiérarchie), 5 sur la route (3 champs refusés en
`it.each`, 2 bornes : les champs cosmétiques passent encore sur un DM, un groupe
devient encore canal d'annonces). 4 mutations, deux dans chaque sens — retirer
`direct` de l'ensemble : 2 rouges ; y ajouter `group` : 10 rouges ; neutraliser
la garde de route : 3 rouges ; l'étendre à tous les champs : 1 rouge. Les
sur-dosages sont ce qui prouve que les témoins tiennent des bornes et pas
seulement une direction. Gate complet : 740 suites / 17 937 tests verts,
`tsc --noEmit` 0 erreur, `conversationWriteAdmission.ts` à 100 %.

---

## Une conversation close n'admet plus PERSONNE, et la question est REQUISE à la porte (2026-08-18, cycle 70)

**Contexte** : le schéma documente `Conversation.closedAt` par « closed for all —
**no one can write**, messages stay readable ». Le cycle 31 a fait respecter la
moitié « écrire » (`conversationWriteAdmission`). La question voisine — *peut-on
encore y ENTRER ?* — n'était posée par aucune des quatre portes, et sa réponse par
défaut était **oui**, indéfiniment.

Deux propriétés du schéma faisaient tenir le défaut :

1. **Une clôture n'éteint aucun lien de partage.** Les quatre écrivains de clôture
   n'écrivent que sur `Conversation` ; `ConversationShareLink.isActive` leur
   survit. Un lien qui circule reste joignable après la mort du fil, et la porte
   anonyme vérifie NEUF propriétés du LIEN et zéro de la conversation.
2. **Fermer n'écrit sur AUCUNE ligne `Participant`.** Les deux portes d'ajout
   autorisent sur le RANG de l'appelant — donc sur `Participant` — et le rang
   survit intact. Aucune relecture de leur logique d'autorisation ne pouvait le
   montrer : cette logique est correcte, elle regarde un autre modèle.

Ce qu'obtenait l'arrivant : un 200, une ligne active dans un fil mort, une
conversation absente de `GET /conversations` et purgée des caches clients sur
`conversation:closed`, un premier message refusé sans explication, et un
`conversation:participant-joined` diffusé à un fil terminé. Pour un anonyme c'est
terminal — ce participant EST son identité.

**Décision** : `resolveConversationEntry` gagne le dénouement `closed`, évalué
AVANT toute lecture de `Participant`, sur `isConversationClosed` — prédicat qui
existait déjà, exporté, lisant les deux colonnes, et dont l'en-tête désignait
nommément les routes de lien de partage. Il n'était appelé que sur le chemin
d'ÉCRITURE.

Le paramètre `conversation` est **REQUIS**, jamais optionnel :
- **passé** plutôt que lu, parce que deux portes sur trois tiennent déjà la ligne
  (`shareLink.conversation`, le `findUnique` de l'invitation) ; seule la porte
  d'ajout paie une lecture, et elle n'en avait aucune ;
- **requis**, parce qu'optionnel il aurait laissé la question sans réponse à la
  porte qui l'oublie, en silence. Requis, il fait échouer la COMPILATION de toute
  porte future qui n'y répond pas (`TS2345`, vérifié). `null` reste recevable :
  c'est la réponse d'un appelant qui n'a pas trouvé la conversation, et qui a
  déjà son propre 404 à rendre.

La porte anonyme n'appelle pas l'unité — elle est keyée sur `(conversationId,
userId)` et un anonyme n'a pas de `User.id`. Elle appelle `isConversationClosed`
directement, sur la ligne qu'elle charge déjà. Seul site que le typage ne
contraint pas ; il a ses propres témoins.

**Alternatives rejetées** :
- **Éteindre les liens de partage à la clôture.** Ne couvre ni l'ajout par un
  admin ni l'invitation, ne dit rien des conversations DÉJÀ closes, et fait
  dépendre la fermeture de la porte de la discipline de quatre écrivains — celle
  qui a divergé trente-sept cycles. `conversationWriteAdmission` énonce
  l'argument : lire l'état réel de la base plutôt que la discipline de ses
  écrivains est ce qui rend une garde indépendante de leurs oublis.
- **Lire la conversation DANS l'unité.** Ferait payer une lecture aux deux portes
  qui tiennent déjà la ligne, pour reposer une question dont elles ont la réponse.
- **Un paramètre optionnel.** Rend le correctif dépendant de la vigilance du
  prochain auteur de porte, c'est-à-dire de la même chose qui a produit le défaut.
- **Ne lire que `closedAt`.** Les lignes fermées par l'ancien `leave.ts` (avant
  cycle 67) existent en base sans `closedAt`, et rien ne les rétro-remplit.
- **Marquer les participants inactifs à la clôture.** Ferait mentir `leftAt` et
  effacerait la distinction entre partir et voir son fil fermé. Le sujet « un
  membre actif d'une conversation close » reste ouvert, à instruire lecteur par
  lecteur.

**Tests** : 20 neufs sur quatre fichiers. Les gardes qui comptent nomment la
CONSÉQUENCE — `participant.create`/`update` NON appelés — et non le dénouement,
qu'un refactor peut satisfaire en perdant la propriété. ROUGE prouvé en deux
temps : stash des quatre fichiers de production → 9 rouges de route ; puis, le
stash ne produisant sur l'unité qu'un rouge de COMPILATION (le type partant avec
le comportement), mutation au scalpel de la seule ligne de court-circuit → 5
rouges de comportement. Les deux contre-épreuves restent vertes des deux côtés.
Deux doubles de test gagnent une méthode absente et réellement manquante
(`participant.update` côté sharing, `conversation.findUnique` côté participants).
Gate : `tsc --noEmit` 0 erreur, 208/208 sur les quatre suites touchées.

## 2026-08-18 : Statuts d'attachement écrits par PARTICIPANT.id + lectures de l'AUTEUR comptées

**Statut**: Accepté (directive utilisateur : « remonter les lectures de l'audio même si c'est l'auteur qui le lit »)

**Contexte**: `POST /attachments/:id/status` passait `authContext.userId` (User.id pour un inscrit) à `markAudioAsListened`/`markVideoAsWatched`/`markImageAsViewed`/`markAttachmentAsDownloaded`, alors que `AttachmentStatusEntry.participantId` attend un Participant.id (comme `Message.senderId`). Les lignes écrites étaient orphelines : filtrées en lecture (`if (!participant) return null`), invisibles au cross-device — l'onglet « Écouté » restait vide pour TOUT LE MONDE. Par ailleurs `getMessageReadStatus` excluait l'auteur (`participantId: { not: senderId }`) et les compteurs dénormalisés l'excluaient aussi.

**Décision**:
1. La route résout le participant (`select: { id, userId }`) et écrit sous `participant.id` — même patron que la route mark-read (« participantId, pas userId »).
2. `getMessageReadStatus.attachmentConsumption` inclut l'AUTEUR (le filtre senderId saute).
3. `updateAttachmentComputedStatus` tient DEUX jeux de comptes : AFFICHÉS (`viewedCount`/`downloadedCount`/`consumedCount`) auteur-INCLUS ; COMPLÉTUDE (`…ByAllAt`) auteur-EXCLUE des deux côtés — sinon l'écoute de l'auteur allumerait « écouté par tous » avant le premier destinataire.
4. Parité web : `use-audio-playback`/`use-video-playback` ne gatent plus `isOwnMessage` dans `trackConsumption` (iOS n'a jamais eu de gate auteur).

**Alternatives rejetées**:
- *Compter l'auteur aussi dans `…ByAllAt`* : fausse la sémantique destinataires ; un vocal « écouté par tous » ne doit rien devoir à son auteur.
- *Ne corriger que le gate auteur sans l'ID* : aucune écoute — auteur ou non — n'était restituée ; le bug d'identifiant neutralisait tout le pipeline.

**Conséquences**: les lignes orphelines historiques (clées par User.id) restent en base mais sont neutralisées PARTOUT — en lecture (`if (!participant) return null`) ET dans les compteurs dénormalisés (`participant: { conversationId }` sur les 12 requêtes de `updateAttachmentComputedStatus` ; sans ce filtre elles comptaient double et allumaient des « écouté par tous » fantômes) ; les anonymes restent bloqués par la garde `participants.where.userId` (préexistant, hors périmètre).

---

## Le sous-arbre `dma-interoperability` est COMPILÉ (2026-08-22, cycle 94)

**Contexte**: `src/dma-interoperability/` — 3 231 lignes de production Signal Protocol (4 873 avec ses 3 suites) (X3DH, Double Ratchet, `SignalKeyManager`, `SignalProtocolEngine`, adaptateurs) — était `exclude` de `tsconfig.json`, donc hors de `bun run build` ET de `type-check`, et `testPathIgnorePatterns` l'écartait du banc. Ces deux lignes étaient les SEULES références au répertoire hors de lui-même : aucun module ne l'importe. Symptôme du silence : quatre de ses fichiers importaient `'../../../shared/prisma/client'`, chemin qui ne résout ni dans le dépôt ni dans l'image Docker.

**Décision**:
1. Le sous-arbre entre dans l'`include` de `tsconfig.json` : il compile et se type-check avec le reste de la passerelle. `tsc --noEmit` à 0 est désormais une garde sur lui.
2. Les 4 défauts d'exécution que le compilateur a révélés sont corrigés dans le même lot (X3DH construit sans dépendances, deux méthodes privées appelées dont un générateur brut sans id, paquet X3DH à la forme des colonnes `DMAEnrollment` au lieu de `PreKeyBundle`).
3. La largeur du nonce AES-GCM des deux producteurs du FIL vient de `SignalProtocolLimits.AES_GCM_IV_SIZE` (12 octets), jamais d'un littéral local.
4. Les 3 suites du sous-arbre restent ignorées par jest, et le sous-arbre reste hors de `collectCoverageFrom` — les deux ensemble, pour une raison unique : elles rendent 56 échecs sur 114 et 3 231 lignes quasi non couvertes feraient rougir la CI sous le seuil global. Les deux lignes tombent le jour où ces suites passent.

**Alternatives rejetées**:
- *Supprimer le sous-arbre* : 3 231 lignes de production que rien n'appelle, mais l'interopérabilité DMA est une obligation réglementaire européenne — une décision de feuille de route, pas un arbitrage d'hygiène de code.
- *Rallumer le banc en même temps que le compilateur* : les 56 échecs s'instruisent un par un ; les traiter sous la pression d'un lot déjà ouvert pousse à desserrer des assertions pour obtenir du vert.
- *Migrer aussi l'IV de `SignalKeyManager.encryptKey`* : son cadre est auto-porté à offsets FIXES (`iv(16)|authTag(16)|…`, lecteur codé en dur) et rien ne distingue les deux cadres dans les octets — changer l'écrivain sans versionner le lecteur rendrait illisible tout matériel de clé déjà persisté. Nonce privé, hors fil : bénéfice cosmétique contre risque sur des clés privées.

**Conséquences**: `dist/` de la passerelle porte désormais le sous-arbre compilé (fichiers inertes, aucun importateur). Toute évolution des types partagés qui casserait ce code le fait maintenant rougir en CI au lieu de dériver en silence. Suivi le plus important laissé ouvert : X3DH ne vérifie JAMAIS `signedPreKey.signature` — le lien qui rattache la pré-clé signée à la clé d'identité — donc l'accord de clés n'est pas authentifié ; la signature est désormais posée à sa place dans le paquet, prête à l'être.

---

## L'amnistie de type-check est SCINDÉE, pas levée (2026-08-23, cycle 105 bis)

**Contexte**: `.github/workflows/ci.yml` portait UNE étape `Type-check` sur tout le monorepo, avec `continue-on-error: true`. Ce drapeau n'était pas un avis sur le typage : c'était la seule façon pour l'étape d'être verte, `apps/web` portant 1241 erreurs de types quand `@meeshy/shared`, `@meeshy/gateway` et `@meeshy/agent` sont à ZÉRO. Une amnistie, quatre packages — les 1241 du quatrième achetaient le silence sur le zéro des trois premiers.

Le prix n'était pas théorique. Les cycles 99–104 ont bâti pour la passerelle un contrat d'émission Socket.IO (une charge par événement, la porte `socketio/serverEmit.ts`, un cliquet sur la forme de la porte). Une violation de ce contrat produit `TS2345` ou `TS2322` — **les deux codes que le `ts-jest` de la passerelle a dans son `diagnostics.ignoreCodes`**. Ni le job de test ni le job qualité ne pouvaient donc rougir sur une charge fausse. Mesuré et non supposé : retirer un champ requis d'une émission de `preferences-broadcast.ts` rend `error TS2345: Argument of type '{ userId: string; }' is not assignable to parameter of type 'UserPreferencesUpdatedEventData'` — que `ts-jest` avale et que `continue-on-error` pardonne. C'est la forme exacte du défaut du cycle 101 (`message:edited` servi sans `senderId`/`messageType`/`createdAt`, rejeté en silence par tout décodeur iOS pendant des mois).

Second trou, corollaire que le cycle 104 avait laissé écrit : l'`include` de `tsconfig.json` de la passerelle était une ÉNUMÉRATION de dix-huit répertoires tenue à la main, donc en retard. Six fichiers de production n'étaient lus par AUCUN compilateur — ni `tsc` (hors `include`), ni `ts-jest` (qui ne compile que ce qu'une suite importe, et sous cinq codes ignorés).

**Décision**:
1. L'étape unique devient DEUX étapes, aucune en `continue-on-error` : `Type-check (contract packages — blocking)` sur les trois packages à zéro (`turbo --filter`), et `Type-check (apps/web — debt ratchet)` sur `scripts/check-type-debt.sh`.
2. `apps/web` garde une dette, mais un cliquet : le script échoue si le compte MONTE, et échoue aussi s'il DESCEND sans que la baseline soit réécrite. Il porte un `--self-test`, comme les deux gardes voisines de `ci.yml`.
3. L'`include` de la passerelle devient `src/**/*` — les tests restent hors champ par `exclude`. Zéro fichier de production échappe désormais au compilateur (475 comptés, 0 manquant).
4. Les DEUX fichiers cassés que (3) révèle sont corrigés dans le même lot : `adapters/node-signal-stores.ts` (deux imports fantômes vers des types que `@meeshy/shared` n'exporte plus, et `saveIdentity` rendant `boolean` là où `IdentityKeyStore` déclare `IdentityChange`) et `migrations/migrate-from-legacy.ts` (deux modèles Prisma inexistants).

**Alternatives rejetées**:
- *Lever l'amnistie tout court* : demande de corriger 1241 erreurs, dont 863 hors `__tests__`, avant qu'une seule ligne du contrat d'émission soit gardée. La dette de web ne doit pas être le prix d'entrée du gardiennage de la passerelle.
- *Retirer 2322/2345 de `ignoreCodes` de `ts-jest`* : ces codes sont amnistiés pour les fichiers de TEST, dont les doubles sont légitimement partiels. Depuis que `tsc` bloque sur la production, la garantie est posée là où elle a du sens, et l'amnistie reste où elle en a.
- *Supprimer `node-signal-stores.ts`* : zéro consommateur, mais une décision de cycle antérieure (leçon 234) a tranché qu'il appartient à un chantier ÉTAGÉ et non à de l'oubli. Le faire compiler, pas le supprimer.
- *Réécrire les deux étapes de migration cassées* : `ConversationMember` → `Participant` exige `type`, `displayName`, `permissions` ; `MessageTranslation` est EMBARQUÉ dans `Message.translations`. Deux transforms à part entière, sur un script de données non rejouable ici. Ils sont déclarés non migrables et COMPTÉS en erreurs, identiquement en `--dry-run` et en course réelle — ce qui corrige le vrai défaut : `migrateCollection` n'écrit que sous `if (!DRY_RUN)`, si bien que le galop d'essai que `migrate-to-staging.sh` lance en premier annonçait ces deux collections intégralement migrées.

**Conséquences**: une charge fausse sous un nom d'événement du contrat fait désormais échouer la CI, sur le job qualité. Le `dist/` de la passerelle porte quatre fichiers de plus (adapters, migrations, validation) — inertes. Suivi laissé ouvert : `tsconfig.json` de la passerelle est `strict: false` avec **tous** les drapeaux stricts éteints ; le contrat d'émission est gardé, mais sous un compilateur qui ne vérifie ni `null` ni les paramètres implicites. C'est la prochaine marche, et elle se monte package par package, pas d'un coup.

---

## Visibilité de la présence : soi / ami accepté / ADMIN+ — le partage d'une conversation ou d'une communauté ne donne rien (2026-08-25)

**Statut** : Accepté

**Contexte** : directive produit, gravée verbatim : « Lorsqu'on n'est pas ami (aucune connexion) : je veux supprimer ma présence en ligne — c'est seulement quand on m'écrit / je réponds que la personne saura que je suis en ligne, et personne ne doit savoir ma dernière connexion sur l'application si on n'est pas ami. Les utilisateurs avec le rôle Admin et supérieur peuvent constamment avoir l'état de présence de l'utilisateur. »

La règle en vigueur depuis le design du 2026-06-30 accordait deux portes qu'aucune des deux ne satisfait cette directive : (1) le bypass de privilège suivait `isGlobalModerator` — MODERATOR voyait tout, alors que la directive ne cite que « Admin et supérieur » ; (2) `sharesConversation` (co-participation à une conversation, et par les résolveurs `resolveForTargets`/`PostFeedService`/`community-member-presence`, co-appartenance à une communauté) accordait la visibilité complète au même titre qu'une amitié acceptée — alors qu'une conversation ou une communauté partagée n'est pas une relation : deux inconnus qui échangent dans un salon public, ou qui sont simplement membres de la même communauté, ne se doivent aucune présence en dehors de l'échange lui-même.

De plus, `GET /users/presence` laissait sortir BRUTS les ids de participants anonymes : `resolveForTargets` n'était appelé que sur `users.map(u => u.id)` (les comptes enregistrés), donc un id de participant anonyme n'avait jamais d'entrée dans la carte de visibilité résolue — la branche `if (!vis)` du mappeur de réponse le traitait alors comme un cas « hors du régime » et renvoyait `isOnline`/`lastActiveAt` sans aucun filtre. Un anonyme n'a par construction aucun ami : sa présence doit être la plus restreinte de toutes, pas la seule à échapper au gate.

**Décision** :
1. **Privilégié = `isSelf || isGlobalAdmin(viewerRole)`** (ADMIN/BIGBOSS). MODERATOR — et tout rôle en dessous — n'est plus privilégié : `resolvePresenceVisibility` (`packages/shared/utils/presence-visibility.ts`) et `PresenceVisibilityService` (`services/gateway/src/services/PresenceVisibilityService.ts`, méthodes `resolveForTarget`/`resolveForTargets`) migrent de `isGlobalModerator` à `isGlobalAdmin`.
2. **Autorisé = privilégié || amitié acceptée (`areConnected`)**. `sharesConversation` est retiré du type `PresenceVisibilityInput` — pas seulement mis à `false` par défaut : un appelant qui tenterait encore de le passer échoue à la COMPILATION, pas silencieusement à l'exécution. `ResolvePresenceOptions` (`allowConversationContext`) disparaît du service pour la même raison ; ses deux méthodes publiques perdent leur troisième paramètre `opts`.
3. `GET /users/presence` (`services/gateway/src/routes/users/presence.ts`) construit désormais un `Set` des ids de participants anonymes (`participantIds`) et, dans la branche `if (!vis)` (id absent de la carte de visibilité — donc jamais un compte enregistré), masque `isOnline`/`lastActiveAt` pour tout id de ce `Set`, SAUF si le viewer est `isGlobalAdmin`. Les ids qui ne sont ni un utilisateur enregistré ni un participant anonyme connu (garbage/inconnu) gardent le comportement précédent — inoffensif, `presenceMap`/`lastActiveMap` n'ayant de toute façon aucune entrée pour eux.
4. `resolvePrefsOnly` (le régime qui accordait la présence sur la seule co-appartenance à un contexte — conversation ou communauté) est marquée `@deprecated`, **non supprimée** : ses ~15 appelants (`messages.ts`, `communities/*.ts`, `conversations/*.ts`, `PostFeedService.getStoryAuthorPresence`, …) sont convertis par des lots parallèles (W3), pas par ce lot. La supprimer maintenant aurait cassé leur compilation sans que la conversion de régime — qui touche à la logique produit de chaque route, pas à une signature — soit faite.

**Alternatives rejetées** :
- *Garder `sharesConversation` optionnel à `false` par défaut plutôt que le retirer du type* : un appelant oublié continuerait à compiler en passant `true` sans jamais être relu — exactement le mode de fuite qu'on corrige. Le retrait du champ transforme un oubli futur en erreur `tsc`, pas en fuite silencieuse.
- *Étendre le privilège ADMIN au MODERATOR sur la seule route `/users/presence` (garder `isGlobalModerator` ailleurs)* : la directive ne distingue aucune surface — « les utilisateurs avec le rôle Admin et supérieur » est une règle de PRÉSENCE, pas de route. Un MODERATOR privilégié sur une surface et non sur une autre serait une incohérence nouvelle, pas une simplification.
- *Convertir aussi les appelants de `resolvePrefsOnly` dans ce lot* : chaque conversion change un COMPORTEMENT produit observable (une liste de membres de communauté qui montrait la présence de tous ses membres n'en montrera plus que pour les amis/admins) — decision à prendre route par route, avec ses propres tests de régression, pas en passant comme effet de bord d'un renommage de loi partagée.

**Conséquences** : un utilisateur non-ami ne voit plus JAMAIS `isOnline`/`lastActiveAt` d'un autre, qu'ils partagent ou non une conversation/communauté — le seul signal qui subsiste pour un non-ami est l'ACTIVITÉ elle-même (frappe `typing:start`, message envoyé), qui voyage par ses propres événements Socket.IO et non par ce résolveur. Les participants anonymes ne fuient plus leur présence sur `GET /users/presence`. Suivi ouvert (W3) : convertir les ~15 appelants de `resolvePrefsOnly` vers le régime strict, puis supprimer la méthode et son type `PresenceVisibility` inutilisé dans ce rôle.
