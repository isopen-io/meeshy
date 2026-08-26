# Rattrapage des messages manquants à l'ouverture d'une conversation

> Plan de câblage. Contrainte n°1 : **ne rien développer de nouveau.** Tout ce qui suit
> arme des mécanismes déjà écrits, déjà testés, déjà en production.
> Statut : LECTURE SEULE — aucun test, aucun build, aucune commande git n'a été lancé.
> Arbre lu : `/Users/smpceo/Documents/v2_meeshy-composer`, branche `main`.

## 0. Faits VÉRIFIÉS dans cette passe (lus, pas recopiés)

| fait | où | verdict |
|---|---|---|
| `GET /conversations/:id/messages` sans `after`/`before`/`around` trie **DESC** et `skip: offset` | `services/gateway/src/routes/conversations/messages.ts:845-852` | **page 1 = les plus RÉCENTS.** L'hypothèse « page 1 = passé » est FAUSSE. |
| paramètres réellement acceptés | `messages.ts:365-378` | `limit` (max 50, `:478`), `offset`, `before`, `after`, `around`, `include_reactions`, `include_translations`, `include_status` (inerte), `include_replies`, `languages` |
| mode `after` = watermark avant | `buildAfterWatermarkClause` `messages.ts:283-289`, activé `:474` | `createdAt > after` STRICT, tri **ASC**, `take: limit+1` (sonde), `hasMore` **mesuré** `:1387-1398`, `nextCursor` toujours `null` en mode `after` `:1411` |
| la note « volontairement PAS de catch-up au montage » | `apps/web/hooks/queries/use-conversation-messages-rq.ts:876-881` | **elle existe, et son raisonnement est bon — mais sa prémisse est fausse chez son hôte** (§1) |
| `refetchOnMount: 'always'` n'est évalué qu'à `onSubscribe` (`listeners.size === 1`) | `node_modules/.bun/@tanstack+query-core@5.101.4/…/queryObserver.js:48-57` + `shouldFetchOnMount:447` | un **changement de `queryKey` à composant monté** ne passe QUE par `shouldFetchOptionally:457`, gardé par `isStale` |
| `isStale` avec `staleTime: Infinity` | `query.js:127-137` (`isStaleByTime`) + `apps/web/lib/react-query/query-client.ts:19` | `false` dès que la requête porte des données non invalidées ⇒ **aucune lecture** |
| `ConversationLayout` ne se démonte pas entre deux conversations | route catch-all `apps/web/app/conversations/[[...id]]/page.tsx` + `apps/web/hooks/conversations/useConversationSelection.ts:63-77` (état local + `window.history.replaceState`) | changer de conversation = **changement de clé**, pas un montage |
| `setQueryData` ne réarme PAS le compte à rebours gc | `query.js:67` (`setData`) n'appelle pas `scheduleGc` ; seuls le constructeur `:36`, le retrait d'observateur `:167` et la fin de fetch `:334` le font | un fil sans observateur meurt à `gcTime` (30 min) et se relit à froid — pas avant |
| les listes de messages ne sont PAS persistées | `apps/web/lib/react-query/persist-options.ts:16` (`VOLATILE_ROOTS`) | un F5 repart bien du serveur ; le trou vit **dans la session** |
| `lastMessage` de la liste porte un **`id`** et un `createdAt` | `conversationLastMessagePreviewSelect`, `services/gateway/src/routes/conversations/core.ts:170-172` | **l'oracle est implémentable sans changement serveur** |
| iOS relit le serveur à CHAQUE ouverture | `ConversationViewModel.refreshMessagesFromAPI()` appelé sans condition depuis `loadMessages()` — `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:1658-1663` (.fresh) et `:1682-1690` (.stale/.expired/.empty) | `offset:0, limit:30`, DESC |
| iOS a un rattrapage `after` complet et paginé | `syncMissedMessages()` `ConversationViewModel.swift:3857-3932` | pages de 100, cap 1000, s'arrête sur page partielle — **comble un trou de n'importe quelle taille** |
| … armé sur DEUX fronts seulement | `ConversationSocketHandler.swift:1245` (coalescence 2 s), abonné `:1261` (`didReconnect`) et `:1282` (`willEnterForeground`) | **jamais au montage**, exactement comme le web |
| la fenêtre iOS affichée = 200 lignes GRDB les plus récentes | `apps/ios/Meeshy/Features/Main/Stores/MessageStore.swift:148` + `fetchMessageWindow:105-113` | **aucune vérification de contiguïté** : deux blocs disjoints s'affichent COLLÉS |
| `GET /api/v1/sync` existe, monté, avec `scope`, tombstones et `hasGap` | `services/gateway/src/routes/sync.ts:160` (`scope`), `:552` (`hasGap`), `:598` (`checkpoint`), `:604` (`nextCursor`), monté `services/gateway/src/route-registration.ts:211` | **zéro appelant client** — grep `v1/sync|checkpointSeq|hasGap|gapAction` sur `apps/web`, `apps/ios`, `packages/MeeshySDK`, `apps/android` : **0 résultat**. Le gateway le dit lui-même, `sync.ts:584-585`. |

## 1. Comment fait iOS (la chaîne, dans l'ordre, avec ses déclencheurs)

1. `ConversationView.bodyWithLifecycle` `.task` → `viewModel.start()` → `observeSync()` → `await viewModel.loadMessages()`.
2. `loadMessages()` (`ConversationViewModel.swift:1534`) réconcilie l'outbox, puis **draine l'App Group de la NSE** (`NSEPendingMessageConsumer.shared.consumeAll()`, `:1557`) — en écriture GRDB **awaited**, donc visible du snapshot qui suit.
3. **Cache d'abord** : `messageStore.loadInitialSnapshot()` peint les 200 lignes GRDB les plus récentes, traductions pré-hydratées, avant tout réseau.
4. **Réseau ensuite, INCONDITIONNELLEMENT** : `refreshMessagesFromAPI()` (`:1682`) lit `offset:0, limit:30` (DESC), upsert GRDB, ré-applique le snapshot. En tâche de fond si GRDB est chaud, **synchrone** si GRDB est vide.
5. Tout à la fin : `socketHandler?.armSocketSubscriptions()` (`:1660`) — rien n'écoute la socket avant ce point.
6. Pendant la vie de l'app, un puits **global** `message:new` (`ConversationSyncEngine.handleNewMessage` → `apiMessagePersistor`, `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift:1143/1165`) écrit dans GRDB **même pour les conversations fermées** — le web n'a de cache que pour la conversation ouverte.
7. À la connexion socket, le gateway **rejoue une file durable de 48 h** (`_drainPendingMessages`, `services/gateway/src/socketio/MeeshySocketIOManager.ts:606`, appelée `:1343`).
8. Le rattrapage `after` (`syncMissedMessages`, `:3857`) part **uniquement** sur `didReconnect` et `willEnterForeground`. **Jamais à l'ouverture.**

**Donc iOS ne fait pas mieux que le web sur la question posée : même architecture, même défaut.** Ce qui le sauve est en AMONT (rejeu 48 h, puits global, NSE), et sa lecture d'ouverture, elle, existe (30 messages). Le trou y est **bouché par redondance, jamais DÉTECTÉ.**

## 2. Où est le trou

> **Web** — l'utilisateur ouvre la conversation → le système **ne lit RIEN du serveur et sert le cache tel quel** → parce que `ConversationLayout` reste monté (`apps/web/app/conversations/[[...id]]/page.tsx` + `useConversationSelection.ts:63-77`), un changement de conversation n'est qu'un changement de `queryKey`, que `queryObserver.js:104-111` fait passer par `shouldFetchOptionally:457` → `isStale` → `isStaleByTime(Infinity)` = `false` (`query.js:137`), pendant que le seul rattrapage existant (`use-conversation-messages-rq.ts:758`) est armé sur reconnexion et focus uniquement (`:866` et `:883`) → **donc il ne voit pas les messages récents, alors que la liste, elle, est réparée par `useConversationsDeltaSync` sur ces deux mêmes fronts.**

> **iOS** — l'utilisateur ouvre la conversation → le système **relit les 30 derniers et les colle au bloc GRDB ancien** → parce que `ConversationViewModel.swift:1691` lit `offset:0, limit:30` et que `MessageStore.swift:105-113` rend les 200 lignes les plus récentes **sans vérifier leur contiguïté**, tandis que `syncMissedMessages()` (`:3857`), qui saurait paginer le trou, n'est armé qu'aux `:1261`/`:1282` de `ConversationSocketHandler.swift` → **donc, si plus de 30 messages sont arrivés hors ligne, le trou du milieu est invisible et définitif** (`loadOlderMessages` part du plus ANCIEN affiché et va en arrière, `:1888` ; `syncMissedMessages` part du plus RÉCENT et va en avant — aucun des deux ne regarde entre les deux).

La note web `:876-881` dit : *« ouvrir une conversation relit désormais la dernière page côté serveur »*. C'était vrai le jour où elle a été écrite pour `BubbleStreamPage` (montage = ouverture, `apps/web/components/common/bubble-stream-page.tsx:468-490`). C'est **faux pour `ConversationLayout`**, où montage = session. Le raisonnement de la note (« le refetch couvre strictement plus que le watermark ; les deux lectures se seraient concurrencées ») reste **juste** — il faut le préserver, pas le balayer : le câblage ci-dessous ne réintroduit le catch-up **que là où le refetch n'a pas lieu**.

## 3. Tâche 1 — LE TÉMOIN (avant tout câblage)

Le témoin reproduit l'asymétrie que l'utilisateur décrit : **la ligne de liste porte un `lastMessage` que le fil ne contient pas.**

`apps/web/hooks/queries/__tests__/use-conversation-messages-rq.test.ts` (fichier existant : dédup, remplacement optimiste, non-relecture au focus, autorité de `hasMore`) — y ajouter :

1. **`test_openConversation_withWarmCache_readsNothingFromServer`** — monter le hook sur la conversation A (données en cache, non invalidées), puis **changer `conversationId` sans démonter** vers B dont le cache existe. Attendu aujourd'hui : **zéro appel** à `conversationsService.getMessages`. C'est la régression, et elle passe tous les gates au vert aujourd'hui.
2. **`test_listHasLastMessage_threadDoesNot_isDetectable`** — poser dans `queryKeys.conversations.infinite()` une conversation dont `lastMessage.id = 'm-99'` / `lastMessageAt` postérieur, et dans `queryKeys.messages.infinite(convId)` des pages qui s'arrêtent à `m-42`. Le témoin **affirme l'oracle** : `lastMessage.id` absent des pages **et** `lastMessageAt > watermark` ⇒ trou.
3. **`test_afterWatermark_fillsTheGap_withoutReplacingPages`** — servir `getMessages(..., after)` avec `m-43…m-99` et vérifier qu'ils sont **préfixés à la page 0** sans remplacer les pages ni perdre un optimiste en vol.

Côté iOS, le témoin jumeau : `apps/ios/MeeshyTests/…` — GRDB portant `m-1…m-42`, le serveur portant `m-1…m-99`, ouverture de conversation ⇒ aujourd'hui la fenêtre rend `m-1…m-42` + `m-70…m-99` **collés**. Assertion : la suite affichée est **contiguë** (chaque `createdAt` suit celui du serveur), ou au minimum que `syncMissedMessages()` a été appelé à l'ouverture.

## 4. Le câblage minimal — pièce par pièce

### 4.1 Web

| pièce nécessaire | existe ? | où |
|---|---|---|
| un rattrapage avant, non destructeur, paginé, qui dédup et réconcilie les optimistes | **OUI** | `syncNewerMessages`, `use-conversation-messages-rq.ts:758-864` |
| la route serveur qui le sert | **OUI** | mode `after`, `messages.ts:283` / `:474` / `:845` ; côté client `apps/web/services/conversations/messages.service.ts:45-80` (clé d'annulation incluant le MODE — pagination et rattrapage ne s'annulent pas) |
| l'instant « conversation ouverte » | **OUI** | l'effet `effectiveSelectedId` de `ConversationLayout.tsx:399-410` connaît déjà cet instant (il y remet le badge à zéro) |
| la garde qui empêche la double lecture | **OUI, déjà dans le code** | `syncNewerMessages` sort si le cache est absent (`:761-762`) ; or c'est **exactement** le seul cas où `shouldFetchOptionally` déclenche une lecture. Les deux sont **mutuellement exclusifs par construction** — rien à écrire. |
| l'oracle liste↔fil | **manque, mais rien de neuf à construire** | les deux valeurs cohabitent déjà dans `ConversationLayout` : `selectedConversation` (`:154`, via `useConversationSelection`) et `messages` (`:284`). Il manque **la comparaison**, pas la donnée. |

**Le câblage tient en trois lignes.** Dans `use-conversation-messages-rq.ts`, à côté du Trigger 1 et du Trigger 2, un **Trigger 3 — ouverture** :

```
useEffect(() => { void syncNewerMessages(); }, [conversationId, syncNewerMessages]);
```

et la note `:876-881` est **amendée, pas supprimée** : elle reste vraie pour l'hôte dont le montage coïncide avec l'ouverture ; elle doit dire que le catch-up d'ouverture ne part **que lorsque le cache existe**, cas où le refetch de montage, lui, ne part pas.

**Variante à 4 lignes de plus, préférable, et c'est celle que l'utilisateur a décrite** : ne partir que si l'oracle accuse. Exposer `syncNewerMessages` dans le retour du hook (une ligne dans `ConversationMessagesRQReturn`, une dans l'objet retourné) et l'appeler depuis l'effet **déjà existant** de `ConversationLayout.tsx:399-410` :

```
const newestId = messages[0]?.id;                     // messages est trié DESC (:249-260)
const last = selectedConversation?.lastMessage;
if (last?.id && newestId && last.id !== newestId) void syncNewerMessages();
```

Zéro requête quand rien ne manque. Une requête `after` — qui rend `[]` en une lecture indexée quand le fil est à jour — sinon.

### 4.2 iOS

| pièce nécessaire | existe ? | où |
|---|---|---|
| un rattrapage avant paginé sans plafond destructeur | **OUI** | `syncMissedMessages()`, `ConversationViewModel.swift:3857` |
| le watermark, purgé des envois optimistes | **OUI** | `SyncWatermark.newest(among:)`, `packages/MeeshySDK/Sources/MeeshySDK/Models/SyncWatermark.swift:26` |
| l'auto-annulation quand il n'y a rien à quoi s'accrocher | **OUI** | `guard let newestLocal = … else { return }`, `:3866` |
| le point d'ouverture où l'appeler | **OUI** | `loadMessages()`, après le snapshot GRDB et à côté de `refreshMessagesFromAPI()` (`:1658` / `:1682`) |
| l'oracle liste↔fil | **manque la comparaison seulement** | `CacheCoordinator.shared.conversations` (`packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift:13`) porte `lastMessage` ; `…messages` est déclaré **à la ligne suivante** (`:14`). `ConversationViewModel` / `ConversationSocketHandler` ne lisent **jamais** `lastMessage` (0 occurrence). |

**Câblage minimal iOS : UNE ligne** — appeler `await syncMissedMessages()` dans `loadMessages()`, juste après l'application du snapshot GRDB et avant/à côté du `refreshMessagesFromAPI()` existant. Les deux sont complémentaires et non redondants : le refresh apporte les **éditions / réactions / traductions** des 30 derniers, le rattrapage apporte les **messages absents**, quel que soit leur nombre. Il n'y a **pas de double lecture inutile** : sur un fil à jour, `listAfter` rend une page vide en un aller-retour.

### 4.3 Ce qui manque VRAIMENT (et pourquoi rien d'existant ne peut le tenir)

1. **Un détecteur de trou côté client.** Aucun des trois clients ne compare ce que la LISTE annonce à ce que le FIL détient. Ce n'est pas une donnée manquante — les deux valeurs sont dans le même composant (web) et dans deux stores déclarés à deux lignes d'écart (iOS) — c'est **la comparaison** qui n'est écrite nulle part. Rien d'existant ne peut la tenir : `syncNewerMessages` / `syncMissedMessages` sont des ACTIONS, pas des prédicats ; `messageCacheKeysFor` résout des clés, pas une complétude.
2. **Un prédicat de contiguïté.** L'oracle attrape le trou de **TÊTE** (le dernier message manque). Il n'attrape **pas** le trou du **MILIEU**. Aucun mécanisme du dépôt ne dit « ma fenêtre locale est contiguë » — sauf **un**, gelé et débranché : `LocalBridgeCacheReading.getUnreadWindow → { windowCoversUnread }` (`packages/shared/providers/local/LocalBridgeProvider.ts:63-100`), injecté en production avec un no-op qui rend toujours `null` (`apps/web/hooks/lentille/use-lentille-bridges.ts:37`). C'est un **suivi**, pas ce lot.
3. **Un consommateur de `GET /api/v1/sync`.** La seule pièce du dépôt qui rend **added / modified / DELETED** avec un curseur keyset, un ETag, une troncature signalée sur deux critères et un `hasGap` exact (`services/gateway/src/routes/sync.ts:552`, `scope=<conversationId>` `:160`) n'a **aucun appelant sur aucune des trois plateformes** — vérifié par grep. C'est le mécanisme qui traiterait aussi les **suppressions survenues hors ligne**, que tous les merges clients (unions non destructives) ignorent aujourd'hui. **Hors périmètre de ce lot** : le brancher est un chantier, pas trois lignes. À nommer comme suivi n°1.
4. **Un marqueur de couverture persisté par conversation.** Ni web ni iOS ne stockent un `lastSyncedAt`/curseur de messages : le watermark est recalculé à chaud depuis le cache en mémoire (web `:778`) ou la fenêtre de 200 (iOS `:3866`). Le gateway **renvoie** pourtant un `checkpoint` persistable par `scope` (`sync.ts:598`) — personne ne le stocke. Suivi n°2.

## 5. Les pièges de ce câblage — lesquels sont RÉELS ici

| piège | réel ? | ce qui le retient |
|---|---|---|
| **Doubler les lectures au montage** (le catch-up + le refetch partent ensemble) — c'est l'argument exact de la note `:880` | **NON** | Les deux gardes sont disjointes **par construction** : le refetch ne part que si `state.data === undefined` (`queryObserver.js:444-448` / `:457`), et `syncNewerMessages` sort immédiatement si `getQueryData(queryKey)` est absent (`:761-762`). Aucune ligne à écrire pour cela — mais le témoin doit **le prouver**, sinon la note redevient vraie. |
| **Boucler** (relecture → nouvel état → relecture) | **NON, si l'effet est clé-é sur `conversationId`** | `syncNewerMessages` est un `useCallback` dont les dépendances (`conversationId`, `linkId`, `queryClient`, `queryKey` — lui-même un `useMemo`, `:183-188` — et `refetch`, lié par `bindMethods`) sont **stables par conversation**. Le `syncInFlightRef` (`:756`) coalesce déjà les entrées concurrentes. **Attention** : ne PAS mettre `messages` ni `data` dans les dépendances de l'effet — le rattrapage écrit dans le cache, donc `data` change, donc l'effet repartirait : c'est la boucle, et elle est à un caractère près. |
| **Tronquer sans le dire** | **NON côté serveur, OUI côté plafond client** | Le serveur mesure `hasMore` par une ligne SONDE (`take: limit+1`, `messages.ts:846-852`) — jamais une estimation. Mais le web plafonne à 5 × 50 puis retombe sur un `refetch()` complet (`:858`, qui ne remonte que 20 messages de page 1) et iOS s'arrête à 1000 **en silence** (`:3878-3897`). Trou de plus de 250 (web) ⇒ le repli ne le comble pas non plus. À nommer, pas à corriger dans ce lot. |
| **Insérer au mauvais bout d'une liste PAGINÉE et créer un trou permanent** | **NON, vérifié** | Le rattrapage préfixe à la **page 0** (`:822-826`) et l'affichage retrie DESC par `createdAt` avec départage par id (`:249-260`) ; le curseur de pagination arrière est dérivé du **dernier message de la DERNIÈRE page** (`getNextPageParam`, `:222-229`), que le préfixe ne touche pas. Le mode `after` rend d'ailleurs `nextCursor: null` **délibérément** (`messages.ts:1400-1411`) : rendre l'id ascendant sous un contrat « backward » était précisément le mensonge corrigé. |
| **Se déclencher sur le chemin anonyme / lien partagé** | **NON** | `if (!conversationId || linkId || syncInFlightRef.current) return` (`:759`). |
| **Empoisonner le watermark avec l'horloge du device** | **NON** | Les optimistes sont exclus des deux côtés : web `:771-778`, iOS `SyncWatermark.newest` (`SyncWatermark.swift:26`). |
| **Rater un jumeau à la même milliseconde** | **NON** | Recul d'1 ms (web, `WATERMARK_INCLUSIVE_MARGIN_MS:65`) et de 1 ms (iOS, `:3877`) contre le `createdAt >` STRICT du serveur ; la dédup par id jette la borne. |
| **Le trou est SOUS le watermark** | **OUI — limite assumée** | Un rattrapage « en avant » ne peut pas le combler ; la note `:879` le dit et elle a raison. L'oracle de l'utilisateur cible le trou de **TÊTE**, qui est exactement celui que le rattrapage sait fermer. Le trou du milieu relève du §4.3.2 / §4.3.3. |

## 6. Ordre d'exécution

1. **Témoin** (§3) — web d'abord, il est le moins cher et il ROUGIT aujourd'hui.
2. **Web** : Trigger 3 d'ouverture (3 lignes) **ou** variante oracle (7 lignes) ; amender la note `:876-881` sans la supprimer.
3. **Témoin iOS**, puis l'appel unique à `syncMissedMessages()` dans `loadMessages()`.
4. **Suivis, hors lot** : consommateur de `GET /api/v1/sync` (tombstones + `hasGap`), marqueur de couverture persisté, plafonds muets des deux rattrapages.

## 7. Non tranché

- Quel trou l'utilisateur voit : TÊTE (le web le produit dès qu'une conversation est rouverte dans la session) ou MILIEU (iOS, > 30 messages manqués). Lecture de code, **pas de mesure** : ni log de production ni reproduction.
- Le mode URL (`/conversations/:id` → `router.push('/conversations/:autre')`) remonte-t-il `ConversationLayout` ? Non tranché depuis la source. Le mode dynamique, lui, est **certain** — et il devient le seul mode dès qu'on entre par `/conversations`, le chemin nominal depuis la barre latérale.
- La fraîcheur de la LISTE (la moitié « saine » du symptôme) repose sur `withArrivedMessage` + le delta au focus/reconnexion. Cohérent avec ce que l'utilisateur rapporte, **non mesuré ici**.
