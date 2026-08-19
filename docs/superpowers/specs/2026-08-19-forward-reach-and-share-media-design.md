# Portée du transfert (scroll + contacts) et partage de médias vers Meeshy

Date : 2026-08-19
Statut : validé (brainstorming avec le user, ce jour)
Suite de : `2026-08-19-media-forward-reliability-and-more-menu-design.md` (transfert fiable, livré)

## Contexte

Trois demandes, deux volets indépendants plus une réparation :

1. **Le sélecteur de transfert ne voit que 50 conversations** et sa recherche filtre uniquement
   cette page déjà chargée (iOS `ForwardPickerSheet.swift:277-299` → `offsetPaginatedRequest(offset: 0, limit: 50)` ;
   web `forward-message-modal.tsx:86-90`, filtre local sur la prop `conversations`). Le scroll doit
   charger la suite, et la recherche doit atteindre **les contacts de l'utilisateur** — pas
   l'annuaire public de la plateforme — y compris des contacts sans conversation existante.
2. **L'extension de partage iOS n'accepte que du texte et un lien** (`MeeshyShareExtension/Info.plist` :
   `NSExtensionActivationSupportsText`, `…SupportsWebURLWithMaxCount: 1`). Meeshy n'apparaît donc pas
   dans la feuille de partage de Photos ou de Fichiers. Il faut y accepter images, vidéos, GIFs et
   documents (.zip .doc .docx .xls .xlsx .ppt .pptx .pdf .csv .md .txt), vers **plusieurs destinataires**.
3. **Découverte d'exploration : la liste d'amis est incomplète sur les deux plateformes.**
   `GET /friend-requests/received` filtre `status: 'pending'` en dur (`services/gateway/src/routes/friends.ts:230-233`),
   et l'agrégation client ne garde que les `accepted` (iOS `FriendListAggregator`, `ContactsShared.swift:160-197` ;
   web `use-friend-requests-v2.ts:95-115`). Conséquence : **seules les relations que l'utilisateur a
   lui-même initiées apparaissent** ; celles qu'il a acceptées sont invisibles. Le user a demandé de
   corriger dans ce chantier.

Périmètre validé : volet 1 sur **iOS ET web**, volet 2 **multi-destinataires**, envoi **immédiat avec
filet de sécurité**, contacts = **relations Meeshy + carnet d'adresses**.

## Volet A — Portée du sélecteur de transfert (iOS + web)

### A.1 Pagination au scroll — iOS

`ForwardPickerSheet` fait aujourd'hui son appel réseau **dans la vue**, ce qui interdit tout curseur
testable. Extraire un `ForwardPickerViewModel` (`@MainActor ObservableObject`, app-side) qui reprend
littéralement le motif éprouvé de `ConversationListViewModel.loadMore()`
(`ConversationListViewModel.swift:1725-1834`) : `ConversationServiceProviding.listPage(before:limit:currentUserId:)`
→ `ConversationPage { items, rawItems, nextCursor, hasMore }`, états `PaginationState`
(SDK `Cache/LoadState.swift:36-56`), **y compris la garde anti-boucle « zero-progress »**
(`:1769-1796`, née d'un incident de production).

- Chargement initial **cache-first** conservé (`CacheCoordinator.shared.conversations`, clé `"list"`).
- **Le curseur n'est PAS persisté.** `ConversationListViewModel` est déjà l'unique écrivain de
  `saveCursor(..., for: "list")` (`:336-339`, `:1816-1825`) ; un second écrivain corromprait la
  reprise de la liste principale. La pagination du sélecteur vit **en mémoire**, le temps de la feuille.
- UI : sentinelle en pied de `LazyVStack`, motif `ConversationListView+Rows.swift:557-567`
  (`Color.clear.frame(height: 1).onAppear`), gardée par `hasMore` et `paginationState == .idle`.
- **La sentinelle est inactive dès que la recherche est non vide** — sinon le filtre local vide la
  liste, la sentinelle apparaît immédiatement et enchaîne toutes les pages.

### A.2 Pagination au scroll — web

Tout existe : `useConversationsPaginationRQ` expose déjà `loadMore` / `hasMore` / `isLoadingMore`
(`hooks/queries/use-conversations-pagination-rq.ts:22-31`, `:57-61`), et
`useLoadMoreSentinel` (`components/conversations/hooks/useLoadMoreSentinel.ts:39-73`) est un
ref-setter par callback **conçu pour les cibles montées en différé** — exactement le cas d'une modale.

- La modale reçoit `loadMore`/`hasMore`/`isLoadingMore` en props depuis `ConversationLayout`
  (qui monte déjà le hook, `:118-126`).
- **Piège Radix** : `<ScrollArea>` (`forward-message-modal.tsx:180`) n'expose pas de ref sur son
  viewport. Poser la sentinelle **à l'intérieur du contenu** avec un `rootMargin` généreux, motif
  `admin/user-detail/UserConversationsSection.tsx:272-286`.
- **Ne JAMAIS invalider** `queryKeys.conversations.infinite()` (règle `apps/web/CLAUDE.md`,
  pagination par offset).
- Effet de bord assumé et documenté : le hook étant un cache partagé, charger une page depuis la
  modale allonge aussi la liste principale.

### A.3 Recherche unifiée — trois sources, une liste

La recherche produit une liste unique de **cibles**, fusionnée dans cet ordre :

1. **Conversations déjà chargées** — filtre local immédiat (comportement actuel).
2. **Conversations non chargées** — `GET /conversations/search?q=` (`routes/conversations/search.ts:64-90`),
   qui cherche par titre **et par nom de participant**. Elle existe et **aucun client ne l'appelle** ;
   sans elle, le scroll ne suffit pas à retrouver une conversation ancienne. Non paginée, plafonnée
   à 50 côté serveur : la spec l'assume, aucun changement serveur.
   - iOS : ajouter `ConversationService.search(query:)` au SDK.
   - Web : `crud.service.ts:173-194` (`searchConversations`) existe déjà — la brancher.
3. **Contacts** (A.4).

Déclenchement : à partir de 2 caractères, avec anti-rebond (300 ms iOS ; `use-debounce`, la
convention du repo, côté web). Les sources 2 et 3 ne sont interrogées que dans ce cas ; à recherche
vide, la liste reste celle des conversations paginées.

**Déduplication par personne.** Une cible « contact » dont l'identifiant d'utilisateur correspond au
`participantUserId` d'une conversation directe déjà présente est **absorbée** par cette conversation.
Une personne n'apparaît jamais deux fois.

### A.4 Sources de contacts

| Source | Endpoint | Recherche serveur | Notes |
|---|---|---|---|
| Relations Meeshy | `GET /users/friend-requests?offset&limit` (`routes/users/devices.ts:22`) | non | **Les DEUX sens, TOUS statuts** — filtrage `accepted` côté client. C'est l'endpoint qui répare le volet C. |
| Carnet d'adresses | `GET /users/me/contacts?offset&limit&filter=meeshy&q=` (`routes/users/contacts-directory.ts:138-206`) | **oui** (`ContactDirectoryService.ts:235-305`) | `filter=meeshy` ne renvoie que les entrées portant un `matchedUser` — les seules joignables. |

- iOS : `ContactDirectoryService.list(offset:limit:filter:query:)` existe au SDK
  (`Services/ContactDirectoryService.swift:44-64`) — le paramètre `query` n'est aujourd'hui **jamais**
  utilisé (`PhonebookViewModel` filtre localement) ; ce chantier le consomme enfin.
- Web : **aucun client** pour `/users/me/contacts` — créer le service et ses types.
- Le carnet est alimenté par la synchronisation iOS ; sur le web il peut être vide. C'est acceptable :
  la liste dégrade alors aux seules relations Meeshy. **Aucune synchronisation de carnet n'est ajoutée
  au web** (hors périmètre).

### A.5 Transférer à un contact sans conversation

`POST /conversations { type: 'direct', participantIds: [userId] }` est **déjà idempotent côté serveur** :
il renvoie la conversation existante avec un statut 200 au lieu d'en créer une seconde
(`routes/conversations/core.ts:1321-1402`), blocage bidirectionnel appliqué.

- iOS : `ConversationCreator.createDirectConversation(with:currentUserId:)` (`ConversationCreator.swift:31-41`).
- Web : `conversationsService.createConversation({ type:'direct', participantIds:[id] })`
  (`services/conversations/crud.service.ts:114-126`), qui renvoie une conversation normalisée.

**La création a lieu à l'envoi, jamais à la sélection** — sélectionner un contact puis fermer la
feuille ne doit créer aucune conversation vide. La machine d'états du sélecteur
(`ForwardPickerModel.swift` / `forward-picker-model.ts`) est indexée par une **clé stable** :
`conv:<conversationId>` ou `user:<userId>` ; la cible d'envoi réelle est le `conversationId` obtenu
après création. Le `clientMessageId` de dédup est calculé **après** cette résolution, sur la paire
`(messageId, conversationId)` — inchangé.

### A.6 Ce que la fusion n'est pas

Aucun accès à l'annuaire public (`GET /users/search`) : le user l'a explicitement exclu. Un contact
non présent dans les relations ni dans le carnet reste introuvable depuis le sélecteur — c'est voulu.

## Volet B — Partage de médias et documents vers Meeshy (extension iOS)

### B.1 Types déclarés

`MeeshyShareExtension/Info.plist` déclare, en plus de `NSExtensionActivationSupportsText` et
`NSExtensionActivationSupportsWebURLWithMaxCount` :

| Clé | Valeur | Couvre |
|---|---|---|
| `NSExtensionActivationSupportsImageWithMaxCount` | 199 | photos, captures, **GIF** (`public.image` couvre `com.compuserve.gif`) |
| `NSExtensionActivationSupportsMovieWithMaxCount` | 199 | vidéos |
| `NSExtensionActivationSupportsFileWithMaxCount` | 199 | .zip .doc .docx .xls .xlsx .ppt .pptx .pdf .csv .md .txt et tout autre fichier |

199 = le cap produit par message (`MAX_ATTACHMENTS_PER_MESSAGE`, `packages/shared/types/attachment.ts:416`) ;
aucun plafond plus bas n'est introduit — la maîtrise mémoire vient du traitement par tranches (B.2),
pas d'une limite de nombre.

**Le garde de source bouge dans le MÊME lot** : `ShareExtensionSourceGuardTests.test_infoPlist_advertisesOnlyTextAndURL`
(`apps/ios/MeeshyTests/Unit/Share/ShareExtensionSourceGuardTests.swift:122-142`) affirme aujourd'hui
l'ABSENCE des règles image/vidéo. Il est réécrit pour verrouiller le nouveau contrat — la règle du
dépôt reste : ne jamais s'annoncer pour un type qu'on ne sait pas traiter.

**Aucun changement serveur.** Le TUS gateway accepte tout type MIME (aucune allowlist appliquée : les
constantes `ACCEPTED_MIME_TYPES`/`isAcceptedMimeType` n'ont aucun appelant de production), 4 Go pour
image/vidéo/audio/document, 2 Go pour texte/code (`attachment.ts:389-396`), et `getAttachmentType`
retombe sur `document` pour un type inconnu (`:687`) — `.xls`/`.xlsx` passent par ce repli.
Le durcissement de cette allowlist morte est une dette identifiée, **hors périmètre**.

### B.2 Client d'upload autonome dans l'extension

`TusUploadManager` (SDK) est **inutilisable en extension** : `UIApplication.shared.beginBackgroundTask`
(`TusUploadManager.swift:186-200`, indisponible en app extension), `TusUploadCheckpointStore` → GRDB
dans le conteneur de l'app, seed `CacheCoordinator` (`:170-184`), et `MeeshyRequestCredential`.
`MeeshyShareExtension` n'a d'ailleurs **aucune dépendance SDK** dans `project.yml` — décision assumée
(spec 2026-07-29, D4 : GRDB + Socket.IO sous 120 Mo de plafond).

L'extension embarque donc un **client TUS minimal** (~150 lignes), autonome :
`POST /api/v1/uploads` avec `Upload-Length` + `Upload-Metadata` → `Location`, puis `PATCH` par
tranches de 10 Mo (`Tus-Resumable: 1.0.0`, `application/offset+octet-stream`), le dernier PATCH
renvoyant l'attachment créé. **Lecture par tranches via `FileHandle.read(upToCount:)`** — jamais le
fichier entier en mémoire, comme le fait déjà le SDK pour les vidéos de 200-500 Mo.
Pas de checkpoint, pas de reprise intra-extension : la reprise, c'est B.3.

Une table MIME minimale est **dupliquée** dans l'extension (le SDK n'y est pas lié) — précédent
assumé : `ShareSession` recopie déjà `NSEDataSync`. Une garde de source vérifie que les deux tables
couvrent les mêmes extensions.

### B.3 Write-ahead : envoi immédiat, filet durable

Le relais `share_pending_sends` existe (App Group `group.me.meeshy.apps`, fiche JSON
`<clientMessageId>.json`, `ShareSender.swift:150-197` → `SharePendingSendConsumer.swift:56-91`) mais
ne transporte **que du texte**. Il est étendu :

1. L'extension **copie** les fichiers dans l'App Group (`share_pending_media/<cid>/<index>.<ext>`,
   extension d'origine préservée) et écrit la fiche AVANT toute tentative réseau.
2. Elle téléverse, envoie, puis **supprime** fiche et copies.
3. Si elle est interrompue (fermeture, réseau, arrêt système), fiche et fichiers survivent.
   `SharePendingSendConsumer` — déjà appelé au démarrage et au retour au premier plan
   (`MeeshyApp.swift:272`, `BackgroundTransitionCoordinator.swift:128`) — **déplace** les fichiers vers
   `Documents/pending-media/<cid>/` puis appelle `OfflineQueue.enqueueMedia(sourceMediaURLs:kinds:…)`
   (`OfflineQueue.swift:1619-1629`). Le rejeu emprunte la branche média éprouvée d'`OutboxDispatcher`
   (`:785-863`) : TUS complet, reprise, envoi socket.
   - Le déplacement est nécessaire : `pending-media/` vit dans le `Documents` de **l'app**
     (`OfflineQueue.swift:2617`), inaccessible à l'extension.
4. Le `clientMessageId` est repris **à l'identique** de bout en bout : un envoi déjà abouti dont la
   réponse s'est perdue est dédoublonné par l'index unique du gateway. Jamais de doublon.

Les deux miroirs `SharePendingSend` (extension) / `PendingSend` (app) gagnent les champs média ;
`SharePendingSendContractTests` tombera — c'est voulu, il est mis à jour dans le lot.

### B.4 Plusieurs destinataires, un seul téléversement

Un attachment appartient à un message : réutiliser les mêmes `attachmentIds` pour un second message
les **déplacerait** au lieu de les copier. La diffusion multi-cibles réutilise donc le transfert :

1. téléverser les fichiers **une fois** ;
2. envoyer le message à la **première** cible avec ses `attachmentIds` ;
3. **transférer** ce message aux cibles suivantes (`forwardedFromId`) — le serveur y recopie les
   pièces jointes en réutilisant les mêmes octets (`MessageProcessor.copyForwardedAttachments`).

Cinq vidéos vers quatre personnes coûtent un seul envoi de données depuis l'appareil.

L'écran de l'extension passe de la sélection unique (`ShareViewController.swift:164`,
`@State selectedId: String?`) à la sémantique du sélecteur de transfert : toucher une ligne
sélectionne, un bouton envoie aux sélectionnées, une cible servie n'est plus sélectionnable.

**La machine d'états n'est pas dupliquée** : `ForwardPickerModel.swift` est ajouté aux `sources` de la
cible `MeeshyShareExtension` dans `project.yml` — motif déjà en place dans le dépôt (les helpers
`Share*` sont compilés dans `MeeshyTests` de la même façon). Cela impose un découplage préalable,
petit et bénéfique : `finishSend(_:outcome:)` prend aujourd'hui un `ForwardOutcome` défini dans
`MessageForwardService.swift` (app-side, qui tire `MeeshySDK`). Le paramètre devient une issue
primitive — `finishSend(_ id: String, succeeded: Bool, reason: String?)` — et l'appelant app-side
convertit son `ForwardOutcome`. Le fichier redevient ainsi ce qu'il prétend être : une logique pure
sans dépendance. Sa jumelle web (`forward-picker-model.ts`) suit la même signature.

## Volet C — Réparer la liste d'amis (iOS + web)

Les deux plateformes lisent `GET /friend-requests/received`, qui ne renvoie que les `pending` :
les relations **acceptées par l'utilisateur** n'apparaissent nulle part. Les deux basculent sur
`GET /users/friend-requests` (les deux sens, tous statuts, `offset`/`limit`), en conservant le
filtrage `accepted` côté client.

- iOS : nouvelle méthode SDK `FriendService.allFriendRequests(offset:limit:)` ; `ContactsListViewModel`
  et `NewConversationViewModel` s'y branchent ; `FriendListAggregator` est conservé tel quel (il sait
  déjà dédupliquer et ne garder que les `accepted`).
- Web : `use-friend-requests-v2.ts` remplace ses deux appels par celui-ci pour le calcul de `connected`,
  en gardant `received`/`sent` pour les écrans de demandes en attente.
- Aucun changement serveur : l'endpoint existe et est paginé.

## Non-objectifs

- Pas de synchronisation du carnet d'adresses depuis le web.
- Pas de durcissement de l'allowlist MIME serveur (dette identifiée, séparée).
- Pas de reprise TUS avec checkpoint dans l'extension (le filet B.3 la remplace).
- Pas d'accès à l'annuaire public depuis le sélecteur de transfert.
- Pas de pagination de `GET /conversations/search` (plafond serveur de 50 assumé).

## Tests et gates

TDD strict, par lot. Points de vérification spécifiques :

- **Pagination** : modèle de vue iOS testé comme `ConversationListViewModelTests` (10 tests `test_loadMore*`
  existants à imiter, `MockConversationService.listPageHandler`) ; web : le hook est déjà couvert,
  tester la modale (sentinelle inactive en recherche, `loadMore` appelé une seule fois).
- **Fusion et dédup** : logique **pure** et jumelle iOS ↔ web (une personne déjà en conversation
  n'apparaît qu'une fois ; ordre conversations → contacts), commentaires croisés obligatoires.
- **Contact sans conversation** : aucune conversation créée à la sélection ; création exactement une
  fois à l'envoi ; `clientMessageId` calculé après résolution.
- **Extension** : garde de source de l'`Info.plist` réécrite ; contrat des deux miroirs de fiche ;
  client TUS minimal testé sur un `URLProtocol` bouchonné (création, tranches, dernier PATCH) ;
  reprise du relais média par le consommateur.
- **Amis** : témoin qui échoue tant que l'endpoint des deux sens n'est pas utilisé.

Gates : `./apps/ios/meeshy.sh test` (au moins build complet + suites ciblées sur simulateur 18.2),
tests SDK, `npx jest` web sur les chemins touchés + `npm run type-check` comparé au baseline,
`bun run test:coverage` gateway **uniquement si** un fichier gateway change (a priori aucun).

## Ordre de livraison

1. **Volet C** (petit, débloque la source de contacts des deux volets).
2. **Volet A** — iOS puis web (pagination, puis recherche unifiée, puis contact sans conversation).
3. **Volet B** — extension : types déclarés + client TUS + write-ahead, puis multi-destinataires.

Les volets A et B sont indépendants et peuvent être menés en parallèle par deux exécutants sur des
fichiers disjoints ; seul le volet C les précède.

## Risques identifiés

- **`GET /conversations/search` n'est pas paginée** (50 max, `search.ts:168`) : une recherche très
  large tronque silencieusement. Acceptable ici (la recherche vise une cible précise), à surveiller.
- **Le carnet peut être vide sur le web** tant que l'utilisateur n'a pas synchronisé depuis iOS.
- **L'extension est tuable à tout instant** : c'est précisément ce que le write-ahead couvre, mais un
  partage volumineux peut n'aboutir qu'à la prochaine ouverture de l'app.
- **Effet de bord assumé côté web** : paginer depuis la modale allonge la liste principale (cache partagé).
