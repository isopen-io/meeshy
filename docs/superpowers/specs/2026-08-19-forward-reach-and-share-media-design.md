# Portée du transfert (scroll + contacts) et partage de médias vers Meeshy

Date : 2026-08-19
Statut : validé (brainstorming avec le user), **révisé après double revue** (factuelle + conception) le même jour
Suite de : `2026-08-19-media-forward-reliability-and-more-menu-design.md` (transfert fiable, livré)

## Contexte

1. **Le sélecteur de transfert ne voit que 50 conversations** et sa recherche ne filtre que cette page
   (iOS `ForwardPickerSheet.swift:277-299` → `offsetPaginatedRequest(offset: 0, limit: 50)` ;
   web `forward-message-modal.tsx:86-90`). Le scroll doit charger la suite, et la recherche doit
   atteindre **les contacts de l'utilisateur** — jamais l'annuaire public — y compris sans conversation
   existante.
2. **L'extension de partage iOS n'accepte que texte + URL** (`MeeshyShareExtension/Info.plist`).
   Meeshy n'apparaît donc pas dans la feuille de partage de Photos ni de Fichiers. Il faut y accepter
   images, vidéos, GIFs et documents, vers **plusieurs destinataires**.
3. **Découverte : la liste d'amis est incomplète sur les deux plateformes.**
   `GET /friend-requests/received` filtre `status: 'pending'` en dur (`routes/friends.ts:233`) et
   `/sent` ne filtre pas (`:331`) ; l'agrégation ne garde que les `accepted`
   (iOS `ContactsShared.swift:160-197`, web `hooks/v2/use-friend-requests-v2.ts:95-115`).
   Seules les relations que l'utilisateur a **initiées** apparaissent.

Décisions du user : volet 1 sur **iOS ET web** ; extension **multi-destinataires** ; envoi
**immédiat avec filet de sécurité** ; contacts = **relations Meeshy + carnet d'adresses** ; réparation
de la liste d'amis **incluse**.

### Ce que la revue a changé par rapport au premier jet

| Point | Premier jet | Après revue |
|---|---|---|
| Fan-out multi-cibles | transfert (`forwardedFromId`) | **mode « copier ces pièces jointes »** — le transfert affichait « Transféré depuis <conversation> » aux autres destinataires (fuite) |
| Changements serveur | « aucun » | **trois** : participants dans la recherche, pagination des demandes d'amis, copie d'attachments |
| Envoi immédiat | chemin nominal | **optimisation du dernier lot** — une extension meurt trop vite pour téléverser du volume |
| Fiche de reprise | 4 champs | **état par cible + attachments déjà téléversés**, réécrite à chaque transition |
| Plafonds extension | 199 fichiers | **20 fichiers, 10 cibles** — imposé par le rate limiting réel |

## Volet S — Corrections serveur préalables

Trois corrections, chacune bloquante pour un volet client. Aucune n'est cosmétique.

### S.1 `GET /conversations/search` doit émettre ses participants

Le handler **construit** les participants (`routes/conversations/search.ts:142-157`) mais ne les émet
pas (mapping manuel `:286-316`), et force `title: null` pour un direct (`:231-233`). Conséquence pour
le volet A : les conversations directes que **seule** la recherche trouve arrivent sans nom
(iOS `participantUserId` → `nil` ; web `participants: []`) — ligne illisible **et** déduplication par
personne impossible, donc doublons.

Correction : émettre `participants` (au minimum `userId`, `displayName`, et le sous-objet `user`)
**et le déclarer** dans `conversationMinimalSchema` (`packages/shared/types/api-schemas.ts:1345-1400`),
qui ne le prévoit pas aujourd'hui — sans quoi fast-json-stringify le supprimerait, exactement comme
il supprimait `hasMore` en S.2.

**Filtrage d'appartenance côté client** : la route retourne aussi les conversations `public`/`global`
dont l'utilisateur n'est **pas** membre (`search.ts:131-137`). Le sélecteur de transfert n'en veut
pas — on ne propose pas d'envoyer un média privé dans un salon public homonyme. Le client ne retient
que les conversations dont il est membre (drapeau déjà porté par le modèle) ; la route n'est pas
modifiée sur ce point (elle sert aussi la recherche globale, qui veut ces résultats).

**Révision du 2026-08-19 (décision du user)** : l'émission des `participants` est **restreinte aux
conversations dont l'appelant est MEMBRE** — les publier pour un salon `public`/`global` qu'il n'a pas
rejoint (jusqu'à cinq identités : identifiant, pseudo, nom affiché) est une exposition refusée ; les
autres reçoivent un tableau vide. Le drapeau d'appartenance **`isMember`**, calculé serveur pour la
page entière en une seule requête `participant.findMany` (colonne branchée sur `isAnonymous` :
`Participant.id` pour un invité de lien, `User.id` pour un compte) et déclaré dans
`conversationMinimalSchema`, devient le **signal officiel du filtre client** sur les deux plateformes.
Il supprime au passage un faux négatif silencieux : `participants` étant tronqué à cinq, un membre
d'un salon public de cinquante personnes n'y figurait pas et **son propre salon disparaissait de sa
recherche** — cas indécidable côté client, deux salons publics (rejoint ou non) rendant exactement le
même corps. `isMember` absent = gateway antérieur : les clients retombent sur l'heuristique
historique, jamais sur « pas membre ».

### S.2 `GET /users/friend-requests` doit dire s'il reste des pages

L'endpoint rend bien les **deux sens et tous les statuts** (`routes/users/devices.ts:22`, `:81-86`),
chemin final `/api/v1/users/friend-requests`. Mais son schéma de réponse déclare
`{ total, offset, limit, returned }` (`devices.ts:55-63`) alors que `buildPaginationMeta` produit
`{ total, offset, limit, hasMore }` (`utils/pagination.ts:43-48`) : **`hasMore` est strippé** par
fast-json-stringify et `returned` n'est jamais émis. Le client ne peut ni détecter ni paginer.

Aggravation : le budget `limit ≤ 100` est **partagé** entre les deux sens et tous les statuts, alors
qu'aujourd'hui iOS consomme 100 + 100 sur deux endpoints. Sans pagination, le volet C **tronquerait**
la liste qu'il prétend compléter.

Corrections : déclarer `hasMore` au schéma, et accepter `?status=accepted` (filtre serveur) pour que
le budget serve les seules lignes utiles. Le client pagine jusqu'à épuisement.

Non traité ici (dette antérieure, à citer, pas à corriger) : `userMinimalSchema`
(`api-schemas.ts:103-125`) ne déclare ni `firstName`, ni `lastName`, ni `lastActiveAt` — le tri
« en ligne d'abord » de `FriendListAggregator` restera partiellement inerte ; `isOnline`, lui,
arrivera enfin.

### S.3 Un mode « copier ces pièces jointes » à l'envoi

Réutiliser les mêmes `attachmentIds` sur un second message les **déplace** :
`associateAttachmentsToMessage` est un `updateMany({ data: { messageId } })`
(`services/attachments/AttachmentService.ts:161-173`). Et diffuser par transfert fait afficher
« Transféré depuis <conversation source> » aux destinataires suivants
(`MessageHandler.ts:1187-1195` + `ForwardBadgePolicy.swift:15-21`) : partager vers « Famille » puis
« Collègues » révélerait « Famille » aux collègues. **Inacceptable.**

**Exigence du user, formulée explicitement le 2026-08-19 :** « il ne faut pas que les autres aient
l'indicateur transfert — on crée des messages pour les autres avec les mêmes identifiants d'URL
d'attachement ». Diffuser à plusieurs destinataires **n'est pas** transférer : chacun reçoit un
message de plein droit, sans aucune marque de provenance, et les pièces jointes pointent les mêmes
fichiers (aucun octet ré-envoyé).

Correction : un champ d'envoi `copyAttachmentsFromMessageId`, traité par le corps déjà existant de
`MessageProcessor.copyForwardedAttachments` (`:673-749`) mais **sans** écrire `forwardedFromId` sur le
message, **ni** `forwardedFromAttachmentId`, **ni** `isForwarded: true` sur les copies — donc aucun
badge, aucune trace côté destinataire. Deux gardes obligatoires :

- **propriété** : l'appelant doit être l'auteur du message source (le défaut de
  `associateAttachmentsToMessage`, qui ne vérifie ni propriétaire ni `messageId` nul, est une dette
  antérieure — ne pas la reproduire ici) ;
- **échec explicite** : `copyForwardedAttachments` avale aujourd'hui ses erreurs
  (`MessageProcessor.ts:767-769`), ce qui produirait une bulle vide. Sur ce chemin, un échec de copie
  doit remonter au client.

## Volet C — Réparer la liste d'amis (iOS + web)

Les deux plateformes basculent sur `GET /api/v1/users/friend-requests?status=accepted&offset&limit`
(S.2), paginé jusqu'à épuisement, en conservant le filtrage client existant.

- iOS : nouvelle méthode SDK `FriendService.allFriendRequests(status:offset:limit:)` ;
  `ContactsListViewModel` (`:160-181`) et `NewConversationViewModel` (`:153-196`) s'y branchent ;
  `FriendListAggregator` (`ContactsShared.swift:160-197`) est conservé tel quel.
- Web : `hooks/v2/use-friend-requests-v2.ts` calcule `connected` depuis ce nouvel appel, en gardant
  `received`/`sent` pour les écrans de demandes en attente (qui veulent bien les `pending`).

**Témoin de comportement, pas de source** : une relation `accepted` où l'utilisateur est le
**receveur** doit apparaître dans la liste. Une assertion sur l'URL ne prouverait rien.

## Volet A — Portée du sélecteur de transfert (iOS + web)

### A.1 Pagination — iOS

`ForwardPickerSheet` fait son réseau **dans la vue**, ce qui interdit tout curseur testable. Extraire
un `ForwardPickerViewModel` (`@MainActor ObservableObject`, app-side) reprenant le motif de
`ConversationListViewModel.loadMore()` (`:1725-1834`) : `listPage(before:limit:currentUserId:)` →
`ConversationPage`, états `PaginationState` (SDK `Cache/LoadState.swift:36-41`), **y compris la garde
anti-boucle zero-progress** (`:1769-1796`, née d'un incident réel).

- `currentUserId` doit porter l'**identifiant réel** : `listPage` accepte `""`
  (`ConversationService.swift:107-113`), ce qui annule silencieusement `participantUserId`
  (`ConversationModels.swift:260`) — pivot de la déduplication A.3.
- Chargement initial cache-first conservé (clé `"list"`), mais **le curseur n'est pas persisté** :
  `ConversationListViewModel` est l'unique écrivain de `saveCursor(…, for: "list")` (`:337`, `:1788`,
  `:1820`) ; un second corromprait la reprise de la liste principale. Pagination **en mémoire**.
- UI : sentinelle en pied de `LazyVStack`, motif `ConversationListView+Rows.swift:557-567`, gardée par
  `hasMore` et `paginationState == .idle`, **inactive dès que la recherche est non vide**.

### A.2 Pagination — web

`useConversationsPaginationRQ` expose `loadMore`/`hasMore`/`isLoadingMore` (`:21-31`, `:57-61`), et
`useLoadMoreSentinel` (`components/conversations/hooks/useLoadMoreSentinel.ts:39-73`) est un
ref-setter par callback, conçu pour les cibles montées en différé.

Deux obstacles à traiter explicitement :

- **`rootMargin` n'est pas paramétrable** (constantes de module `:36-37`, options `:31-35`). La modale
  utilise un `<ScrollArea>` Radix (`forward-message-modal.tsx:180`) dont le viewport n'expose aucune
  ref. Choisir **une** voie : remplacer `ScrollArea` par un `div overflow-y-auto` avec ref (motif
  `admin/user-detail/UserConversationsSection.tsx:282`, qui passe bien un `root` explicite), ou étendre
  `useLoadMoreSentinel` d'options `root`/`rootMargin`. La première est plus locale ; retenue.
- **Le cache partagé réinitialise la pagination** : `setConversations` collapse toutes les pages en une
  et tronque `pageParams` (`use-conversations-pagination-rq.ts:88-99`), et tout écrivain socket le
  déclenche — la modale retomberait à la page 1 en plein scroll. La modale **prend un instantané au
  montage** et l'étend elle-même via `loadMore` ; elle ne relit pas le cache tant qu'elle est ouverte.

Effet de bord assumé : charger une page depuis la modale allonge aussi la liste principale.

### A.3 Recherche unifiée — trois sources, une liste

À partir de 2 caractères, avec anti-rebond (300 ms iOS ; `use-debounce` côté web) :

1. **Conversations déjà chargées** — filtre local immédiat.
2. **Conversations non chargées** — `GET /conversations/search?q=` (`search.ts:64`), qui cherche par
   titre **et** par nom de participant (`:100-121`), plafonnée à 50 en dur (`:168`), non paginée.
   Elle est **déjà consommée** par cinq appelants (web `SearchPageContent.tsx:142`,
   `crud.service.ts:176`, `ConversationPicker.tsx:57`, `useConversationSelection.ts:76` ; iOS
   `GlobalSearchViewModel.swift:340`/`:540`, en `APIClient` direct sans passer par le SDK).
   **Ne pas créer une troisième voie iOS** : soit ajouter `ConversationService.search(query:)` au SDK
   **et** y rebrancher `GlobalSearchViewModel`, soit appeler comme lui. La première est retenue.
   La route est fermée aux invités de lien (`search.ts:91`) et `searchConversations` avale toute
   erreur en `[]` (`crud.service.ts:190-193`) : distinguer **échec** et **aucun résultat** dans l'UI.
3. **Contacts** (A.4).

**Chronologie, pas seulement ordre.** Le préfixe (source 1) est stable ; les sources 2 et 3
**ajoutent** en fin de liste quand elles répondent ; toute réponse dont la requête n'est plus la
requête courante est **rejetée**. La liste ne doit jamais se réordonner sous le doigt.

**Déduplication par personne.** Une cible contact dont l'identifiant utilisateur correspond au
`participantUserId` d'une conversation directe déjà listée est absorbée par elle. Dépend de S.1 pour
les résultats de recherche.

### A.4 Sources de contacts

| Source | Endpoint | Recherche serveur |
|---|---|---|
| Relations Meeshy | `GET /api/v1/users/friend-requests?status=accepted` (S.2) | non — filtrage local |
| Carnet d'adresses | `GET /users/me/contacts?offset&limit&filter=meeshy&q=` (`routes/users/contacts-directory.ts:138`) | oui, mais **partielle** |

`filter=meeshy` ne renvoie que les entrées avec `matchedUser` (`ContactDirectoryService.ts:248`) —
les seules joignables. **La recherche serveur est plus faible qu'il n'y paraît** : seul `displayName`
est un `contains` insensible à la casse ; `emails`, `usernames` et `phoneNumbers` utilisent `has`,
c'est-à-dire une **égalité exacte d'élément** (`ContactDirectoryService.ts:250-259`). Chercher un
contact par le début de son pseudo ne donnera rien. C'est une limite acceptée, pas un bug à corriger
ici ; elle est nommée pour que personne ne s'en étonne.

- iOS : `ContactDirectoryService.list(offset:limit:filter:query:)` existe au SDK (`:44-64`) ;
  `query` n'est **jamais** utilisé aujourd'hui (`PhonebookViewModel.swift:149`,
  `DiscoverViewModel.swift:262` passent `nil`). Ce chantier le consomme enfin.
- Web : **aucun client** pour `/users/me/contacts` — service et types à créer.
- Le carnet est alimenté par la synchronisation iOS ; sur le web il peut être vide, la liste dégrade
  alors aux seules relations Meeshy. Aucune synchronisation web n'est ajoutée.

### A.5 Transférer à un contact sans conversation

`POST /conversations { type:'direct', participantIds:[userId] }` est **idempotent** : 200 avec la
conversation existante, 201 à la création (`routes/conversations/core.ts:1321-1402`), blocage
bidirectionnel appliqué (`:1316`).

- iOS : `ConversationCreator.createDirectConversation(with:currentUserId:)` (`:31-41`).
- Web : `conversationsService.createConversation(...)` (`services/conversations/crud.service.ts:114-126`).

**La création a lieu à l'envoi, jamais à la sélection.** La machine d'états est indexée par une clé
stable (`conv:<id>` / `user:<id>`) ; la cible réelle est le `conversationId` obtenu ; le
`clientMessageId` de dédup est calculé **après** cette résolution.

**Cas création OK / envoi KO** : la conversation directe naît avec `firstMessageSentAt: null` — donc
invisible au destinataire (`core.ts:439-454`) mais **visible à son créateur** (`:452`), et remontée en
tête de liste (`lastMessageAt @default(now())`, `schema.prisma:384`). Comportement retenu : on
l'accepte et on n'invente rien — l'utilisateur voit une conversation vide qu'il a effectivement
ouverte, et peut y réessayer. À écrire dans les tests pour que ce ne soit pas pris pour un défaut.

### A.6 Hors périmètre

Aucun accès à l'annuaire public (`GET /users/search`, `routes/users/preferences.ts:512`). Un contact
absent des relations et du carnet reste introuvable — c'est voulu.

## Volet B — Partage de médias et documents vers Meeshy (extension iOS)

### B.1 Types déclarés et plafonds

`MeeshyShareExtension/Info.plist` ajoute à `NSExtensionActivationSupportsText` et
`…SupportsWebURLWithMaxCount` :

| Clé | Valeur | Couvre |
|---|---|---|
| `NSExtensionActivationSupportsImageWithMaxCount` | 20 | photos, captures, **GIF** (`com.compuserve.gif` conforme à `public.image`) |
| `NSExtensionActivationSupportsMovieWithMaxCount` | 20 | vidéos |
| `NSExtensionActivationSupportsFileWithMaxCount` | 20 | .zip .doc .docx .xls .xlsx .ppt .pptx .pdf .csv .md .txt et tout autre fichier |

**Pourquoi 20 et non 199.** Le cap produit par message est bien 199
(`packages/shared/types/attachment.ts:416`), mais le rate limiting le rend inatteignable depuis un
partage : le seau global est de 300 requêtes/minute par IP et Fastify tourne **sans `trustProxy`**
derrière Traefik (`middleware/rate-limiter.ts:69-84`) — c'est donc un seau **plateforme**. Chaque
fichier coûte une création TUS plus autant de PATCH que de tranches de 10 Mo
(`attachment.ts:420`). 20 fichiers est le compromis retenu ; le composer in-app conserve 199.
De même, **10 cibles maximum** par partage : le seau message est de 20/minute/utilisateur
(`rate-limiter.ts:20-39`).

`NSExtensionActivationSupportsAttachmentsWithMin/MaxCount` ne sont **pas** déclarées (les règles par
type suffisent et sont plus précises).

**Le garde de source bouge dans le même lot.** `ShareExtensionSourceGuardTests.test_infoPlist_advertisesOnlyTextAndURL`
(`apps/ios/MeeshyTests/Unit/Share/ShareExtensionSourceGuardTests.swift:122-142`) vérifie l'absence de
quatre clés (`:131-136`) — mais **pas** `…SupportsFileWithMaxCount` : la troisième clé passerait sans
le faire rougir. Le garde est réécrit pour verrouiller le nouveau contrat, **et** couvrir les trois clés.

Côté serveur, **rien à ajouter pour les types** : le TUS n'applique aucune allowlist MIME
(`routes/uploads/tus-handler.ts:7-11`, contrôle de taille seul `:98-107`), les limites sont 4 Go
(image/vidéo/audio/document) et 2 Go (texte/code) (`attachment.ts:389-396`), et `getAttachmentType`
retombe sur `document` pour un type inconnu (`:687`) — c'est ce qui fait passer `.xls`/`.xlsx`.
(`ACCEPTED_MIME_TYPES` a un appelant, mais de **listing** seulement : `AttachmentService.ts:378-382`.)

### B.2 Ce que l'extension fait, et ne fait pas

Contraintes dures : plafond mémoire 120 Mo (spec 2026-07-29, **D2**), extension tuable à tout instant,
**pas de `beginBackgroundTask`** — d'où l'inutilisabilité de `TusUploadManager` du SDK
(`:186-200`, plus le checkpoint GRDB et le seed `CacheCoordinator` `:170-184`) et l'absence assumée de
dépendance SDK dans `project.yml` (D4).

L'extension **copie** les fichiers et **décrit** l'envoi ; elle ne garantit jamais l'upload. Points de
vigilance imposés par le mode d'obtention des fichiers :

- `loadFileRepresentation` supprime l'URL fournie **au retour de la closure** : la copie doit être
  faite **dans** la closure, de façon synchrone, par flux (`FileHandle`, tranches de 64 Kio), jamais
  par `Data(contentsOf:)`.
- Une URL issue de Fichiers/iCloud est **security-scoped** : appairer `startAccessingSecurityScopedResource`
  / `stopAccessing…`. Un média iCloud non téléchargé produit un **échec explicite** affiché, jamais un
  fichier vide.
- **Contrôle d'espace libre avant copie**, et refus explicite au-delà du plafond d'octets par partage.

### B.3 La fiche de reprise (write-ahead)

Le relais actuel (`share_pending_sends/<clientMessageId>.json` dans l'App Group
`group.me.meeshy.apps`, `ShareSender.swift:150-197` → `SharePendingSendConsumer.swift:56-91`) ne porte
que du texte, un seul destinataire, aucun état. Il est remplacé par une fiche versionnée :

```
{ v: 1,
  clientMessageId, createdAt, content,
  media:  [ { relPath, ext, mime, bytes } ],       // dans share_pending_media/<cid>/
  uploadedAttachmentIds: [String]?,                // écrit APRÈS un upload réussi
  targets: [ { conversationId, state: pending|sent|failed, serverMessageId? } ],
  originTargetIndex: Int?                          // la cible qui porte les octets
}
```

Deux invariants :

1. la fiche est **réécrite atomiquement à chaque transition** (fichiers copiés, upload terminé, cible
   servie) ;
2. elle n'est **supprimée que lorsque toutes les cibles sont `sent`** — jamais après la première.

Sans ces champs, une interruption après l'upload re-téléverserait plusieurs gigaoctets (les
attachments orphelins n'étant balayés qu'à H+24, `MaintenanceService.ts:386-400`), et une interruption
après la première cible **perdrait les suivantes sans trace** : le `clientMessageId` ne dédoublonne
que sur `(conversationId, clientMessageId)` (`schema.prisma:677-686`), il ne rattrape pas une cible
jamais servie.

**Purge** : le consommateur, à chaque passage, supprime les fiches et dossiers médias plus vieux qu'un
âge donné. Aujourd'hui `share_pending_sends` n'a ni cap, ni TTL, et n'est nettoyé qu'au logout
(`WidgetDataManager.swift:194-220`) — un partage jamais repris resterait sur disque indéfiniment.

### B.4 Reprise par l'app : ce qu'il faut construire

Le chemin de rejeu **n'existe pas** aujourd'hui pour ce cas :

- `OutboxDispatcher` branche média (`:785-863`) est **mono-conversation** et ne lit `forwardedFromId`
  que dans la branche texte (`:868-869`) ;
- `OfflineQueue.enqueueMedia` (SDK, `:1624-1634`) est mono-conversation, **n'accepte pas de
  `createdAt`** (le relais texte préserve pourtant celui du partage,
  `SharePendingSendConsumer.swift:110`), et copie vers
  `pending-media/<clientMessageId>/<index>.<ext>` (`:2623-2633`, `Documents` de l'app, `:2624`) : deux
  appels avec le même identifiant écriraient **les mêmes chemins**, et le dispatcher supprime les
  fichiers après le premier envoi réussi (`:851-855`) — les cibles suivantes ne trouveraient plus rien ;
- le protocole `OfflineMessageQueueing` (`:517-542`) **n'expose pas** `enqueueMedia` : le consommateur
  ne peut ni l'appeler ni le bouchonner en test.

Décisions :

- **une fiche décrit N cibles, mais l'enfilage est fait par cible**, avec un `clientMessageId` **dérivé
  par cible** (l'identifiant de la fiche reste la clé de reprise) ; le dossier média est partagé et
  n'est supprimé que par le dernier consommateur ;
- la **première** cible envoie les octets (upload TUS complet par le dispatcher), les suivantes
  utilisent `copyAttachmentsFromMessageId` (S.3) — **jamais** `forwardedFromId` ;
- `enqueueMedia` rejoint le protocole `OfflineMessageQueueing` et gagne un `createdAt` optionnel.

### B.5 Ce que l'extension ne peut pas offrir

Ses cibles proviennent de l'App Group : `recent_conversations` (préfixe 50,
`WidgetDataManager.swift:256`) et `conversation_snapshots` (cap 500), **sans réseau ni recherche
serveur**. Le volet A n'y change rien : partager vers une personne absente de ces listes est
impossible. La recherche de l'extension filtre localement ces snapshots ; la limite est écrite dans
l'écran plutôt que subie.

### B.6 Chiffrement de bout en bout — non-objectif explicite

Une conversation `encryptionMode: 'e2ee'` (`schema.prisma:411-430`) n'est de fait pas chiffrée
aujourd'hui : le serveur logge « client should encrypt » et stocke en clair
(`MessageProcessor.ts:194-203`), le pipeline de pièces jointes chiffrées n'a **aucun appelant de
production**, et `tus-handler.ts` ne chiffre rien. L'extension ne connaît d'ailleurs pas le mode de
ses cibles (les snapshots App Group ne le portent pas). Ce chantier **ne traite pas** l'E2EE et ne
prétend pas le respecter ; il n'introduit aucune régression puisqu'il n'existe pas de chemin chiffré.

## Non-objectifs

- Synchronisation du carnet d'adresses depuis le web.
- Durcissement de l'allowlist MIME serveur (dette : `isAcceptedMimeType` n'a qu'un import mort).
- Contrôle de propriété de `associateAttachmentsToMessage` (dette antérieure : `updateMany` sans
  vérification, `AttachmentService.ts:161-173`) — **mais** le nouveau mode S.3 doit, lui, l'appliquer.
- Reprise TUS avec checkpoint dans l'extension.
- Accès à l'annuaire public depuis le sélecteur de transfert.
- Pagination de `GET /conversations/search` (plafond 50 assumé).
- E2EE (B.6).

## Ordre de livraison

Chaque lot laisse le produit utilisable ; les lots serveur précèdent leurs consommateurs.

1. **Lot C+S.2** — pagination des demandes d'amis + bascule iOS/web. Petit, autonome.
2. **Lot S.1+S.3** — participants dans la recherche ; mode « copier ces pièces jointes ».
3. **Lot A-iOS** — modèle de vue, pagination, recherche unifiée, contact sans conversation.
4. **Lot A-web** — équivalent.
5. **Lot B-1** — types déclarés, copie App Group, fiche versionnée, reprise par l'app (upload + fan-out
   par copie). **Ce lot livre la fonction complète** : partager photos, vidéos, GIFs et documents à
   plusieurs personnes.
6. **Lot B-2** — upload opportuniste **dans** l'extension sous un seuil de taille, pour que les petits
   partages soient partis avant la fermeture de la feuille. Pure optimisation, **annulable sans perte
   de fonction**.

Les lots 3 et 4 partagent deux fichiers avec le lot 5 (`ForwardPickerModel.swift` réindexé par clé
stable en A.5 ; sa signature `finishSend` découplée en B-1) : **ils ne sont pas parallélisables sans
coordination**. Le premier jet affirmait le contraire ; c'est faux.

### Découplage préalable de `ForwardPickerModel` (lot 5)

`ForwardPickerModel.swift` n'importe que `Foundation`, mais `finishSend(_:outcome:)` prend un
`ForwardOutcome` défini dans `MessageForwardService.swift` (`:5-9`), qui `import MeeshySDK`. Pour que
le fichier soit compilable dans la cible de l'extension, l'issue devient primitive —
`finishSend(_ id: String, succeeded: Bool, reason: String?)` — comme **la jumelle web l'a déjà**
(`forward-picker-model.ts:44`, `finishSend(id, ok, reason?)`). Aucun travail web sur ce point.
Impact iOS : un seul appelant de production (`ForwardPickerSheet.swift:330`) et six sites de test
(`ForwardPickerModelTests.swift:24,45,56,63,71,79`).

Ajouter un fichier de l'**app** aux `sources` d'une **app-extension** est un **précédent nouveau** :
`project.yml` ne connaît que l'inverse (fichiers d'extension compilés dans `MeeshyTests`). Une garde
de source vérifie que le fichier n'importe que `Foundation`.

## Tests et gates

TDD strict par lot. Exigences spécifiques :

- **Volet C** : une relation `accepted` où l'utilisateur est **receveur** apparaît (comportement, pas URL).
- **S.1/S.2** : tests traversant la **sérialisation Fastify** (`fastify.inject`) — un schéma de réponse
  strippe en silence, c'est précisément le défaut corrigé.
- **S.3** : copie effective (deux messages portent chacun leurs attachments, mêmes octets) ; refus quand
  l'appelant n'est pas l'auteur de la source ; échec de copie remonté (pas de bulle vide).
- **A** : pagination testée comme `ConversationListViewModelTests` (10 tests `test_loadMore*`,
  `MockConversationService.listPageHandler`) ; fusion et dédup en logique **pure jumelle** iOS ↔ web
  (commentaires croisés) ; aucune conversation créée à la sélection ; réponse périmée rejetée.
- **B** : garde d'`Info.plist` réécrite (3 clés) ; contrat des deux miroirs de fiche, **états par cible
  compris** ; reprise après interruption simulée à chaque transition (après copie, après upload, après
  la première cible) ; purge par âge. Le client TUS de l'extension, s'il voit le jour (lot 6), doit être
  **listé dans les `sources` de `MeeshyTests`** — le dépôt a déjà vécu des suites vertes par omission.

Gates : `./apps/ios/meeshy.sh test` (au minimum build complet + suites ciblées sur simulateur 18.2),
tests SDK, `npx jest` web sur les chemins touchés + `npm run type-check` comparé au baseline,
`bun run test:coverage` gateway (les lots S le rendent obligatoire).

## Risques acceptés

- Recherche de conversations plafonnée à 50, non paginée : une recherche large tronque en silence.
- Recherche du carnet limitée au `displayName` en `contains` (le reste est une égalité exacte).
- Carnet vide sur le web tant qu'aucune synchronisation iOS n'a eu lieu.
- Une conversation directe vide et remontée en tête si la création aboutit et l'envoi échoue (A.5).
- Partage volumineux : livraison différée à la prochaine ouverture de l'app.
- Rate limiting plateforme (seau par IP sans `trustProxy`) : les plafonds de B.1 le contiennent sans
  le supprimer.
