# 07 — Extensions et App Group

> Périmètre : widgets (`apps/ios/MeeshyWidgets/`), Notification Service Extension (`apps/ios/MeeshyNotificationExtension/`), extension de partage (`apps/ios/MeeshyShareExtension/`), dossier `MeeshyContextMenu/`, App Intents/Siri, et toutes les surfaces du conteneur App Group `group.me.meeshy.apps` (UserDefaults partagés, dossiers de staging, SQLite partagé). Méthodologie et sévérités : voir README.md. Architecture de référence : 00-etat-des-lieux.md. HEAD audité : 901e92589.

## Rappel d'architecture

L'App Group porte trois familles de données (détail complet en 00-etat-des-lieux.md §6) : des clés UserDefaults publiées par l'app (`recent_conversations`, `conversation_snapshots`, `favorite_contacts`, `unread_count`, `meeshy_api_base_url`, `meeshy_active_user_id`, miroir des préférences de notifications) et lues par les widgets, la NSE et l'extension de partage ; des dossiers de staging fichiers (`nse_pending_messages/`, `nse_pending_posts/`, `share_pending_sends/`, `nse_bg_uploads/`) consommés par l'app au foreground avec l'invariant « suppression APRÈS commit » ; et la base GRDB partagée `meeshy_messages.sqlite` dans laquelle la NSE pré-persiste les messages des pushes. La NSE est exemplaire côté local-first (pré-persist cross-process, subtitle recomposé localement depuis `conversation_snapshots`, receipts en URLSession background) ; l'extension de partage tient « échec = relais durable, jamais une perte » de bout en bout. Les écarts de cette dimension se concentrent sur l'hygiène cross-compte du conteneur, les deep links émis mais jamais routés, et la fraîcheur des surfaces widget.

## Écarts retenus

### appgroup-01 — Aucun wipe App Group au logout : widget affiche le compte déconnecté + relais/prefetchs de A rejoués sous l'identité de B · **P0** · effort S

**Constat.** Le logout ne purge quasiment rien du conteneur App Group. `AuthManager.logout()` ne nettoie, via `NotificationCoordinator.reset()`, que le compteur `unread_count`. Les clés widget (`recent_conversations`, `conversation_snapshots`, `favorite_contacts`, `pending_mark_read`) et les trois dossiers de staging (`nse_pending_messages/`, `nse_pending_posts/`, `share_pending_sends/`) survivent au logout — et sont rejoués au prochain login, quel que soit le compte.

**Preuve.** `AuthManager.logout()` (packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift:428-522) appelle `NotificationCoordinator.reset()` qui ne fait que `appGroupDefaults?.set(0, forKey: unreadCountKey)` (NotificationCoordinator.swift:144). Grep exhaustif confirmé par le vérificateur : les seuls `removeObject`/`removeItem` du dépôt portent sur SessionSnapshotStore.swift:49 et MediaSnapshotStore.swift:74 — jamais sur les clés widget ni les dossiers de staging. Au boot, `SharePendingSendConsumer.consumeAll()` (MeeshyApp.swift:261) enfile les `PendingSend` sans aucun contrôle d'identité (SharePendingSendConsumer.swift:56-91 — le struct ne porte même pas de `userId`), et `NSEPendingMessageConsumer` mappe les blobs de A avec `toMessage(currentUserId: B)` (NSEPendingMessageConsumer.swift:36 et :53). Nuance vérifiée : `activeUserId = nil` efface déjà `meeshy_active_user_id` de l'App Group (AuthManager.swift:184 et :503), donc la NSE ne continue PAS à fetcher sous A après logout — le P0 tient sur le rejeu sous B et la fuite d'affichage.

**Impact.** Le widget d'accueil affiche indéfiniment noms de conversations et previews de messages du compte déconnecté (fuite de contenu sur un écran consultable sans déverrouiller l'app). Après connexion d'un compte B : les partages différés de A sont postés avec le jeton de B, au nom de B ; les blobs prefetchés par la NSE pour A sont fusionnés dans la base GRDB et le cache feed de B ; les mark-read en attente de A sont rejoués avec le jeton de B.

**Correctif pas-à-pas.**
1. SDK — ajouter une exigence `func wipeAll()` au protocole existant `NotificationWidgetSink` (packages/MeeshySDK/Sources/MeeshySDK/Notifications/NotificationCoordinator.swift:13-25). C'est le canal SDK→app déjà en place (implémenté par `WidgetDataManager`) : aucun nouveau hook à créer.
2. App — implémenter `wipeAll()` dans `WidgetDataManager` (apps/ios/Meeshy/Features/Main/Services/WidgetDataManager.swift) : `removeObject` sur `recent_conversations`, `conversation_snapshots`, `favorite_contacts`, `widget_last_updated`, `pending_mark_read` (réutiliser la même chaîne que `WidgetActionFlusher.pendingMarkReadKey` — exposer la constante plutôt que de la dupliquer), puis `WidgetCenter.shared.reloadAllTimelines()`.
3. App — dans le même `wipeAll()`, `FileManager.removeItem` sur les trois dossiers de staging : réutiliser le helper existant `SharePendingSendConsumer.directoryURL()` (SharePendingSendConsumer.swift:43) et exposer des helpers `directoryURL()` équivalents dans `NSEPendingMessageConsumer`/`NSEPendingPostConsumer` (les constantes `nse_pending_messages`/`nse_pending_posts` y sont déjà présentes).
4. SDK — dans `NotificationCoordinator.reset()` (NotificationCoordinator.swift:134-149), appeler `widgetSink?.wipeAll()` en remplacement du couple `appGroupDefaults?.set(0, unread_count)` + `publishUnreadCount(0)` (conserver le reload des timelines). `reset()` n'est appelé en prod QUE sur les chemins de logout (AuthManager.swift:476, MeeshyApp.swift:695) et AVANT `isAuthenticated = false` (AuthManager.swift:521) — l'ordre requis est déjà respecté.
5. Ne PAS toucher : `meeshy_api_base_url` (donnée d'environnement, pas de compte), `meeshy_active_user_id` (déjà effacé par le setter), le keychain (déjà purgé par le logout), la base GRDB App Group (écart grdb-01 distinct, fichier 01).
6. Livrer AVEC appgroup-05 : sans l'état vide explicite côté widgets, le wipe fera apparaître les conversations fabriquées « John Doe » sur tout appareil déconnecté.

**Tests (TDD — RED d'abord).**
- `MeeshyTests/Unit/Services/WidgetDataManagerTests.swift` : `test_wipeAll_removesWidgetKeysAndStagingDirs` — semer les 5 clés dans une suite `UserDefaults` injectée + des fichiers JSON factices dans des répertoires temporaires, appeler `wipeAll()`, asserter clés à nil et répertoires vides (nécessite d'injecter `suiteName`/`directoryURLs` — pattern factory `makeSUT`).
- Tests du package MeeshySDK, `NotificationCoordinatorTests` : `test_reset_invokesWidgetSinkWipeAll` — mock `NotificationWidgetSink` avec `wipeAllCallCount`, asserter `== 1` après `reset()` (le coordinator accepte déjà `badgeWriter`/`appGroupDefaults` injectés).
- `test_consumeAll_afterWipe_enqueuesNothing` sur `SharePendingSendConsumer` avec `FakeOfflineMessageQueue` (Mocks existant, conforme à `OfflineMessageQueueing` ; init injectable — créer un `MockOfflineMessageQueueing` seulement si des compteurs d'appels dédiés sont nécessaires).

**Risque de régression.** Faible : le wipe passe par un chemin déjà ordonné avant `isAuthenticated = false` ; les exclusions du point 5 protègent l'environnement et la session. Garde-fou : le test (a) verrouille la liste exacte des clés purgées.

**Dépendances.** appgroup-05 (à livrer ensemble) ; outbox-11 (fichier 02 — son volet `pending_mark_read` est subsumé par ce wipe). · **Backend requis :** non

### appgroup-02 — Deep links widget/Siri/App Intents non routés — Quick Reply perd silencieusement le texte ; send/call/translate des intents aussi morts · **P1** · effort M

**Constat.** Les widgets et les App Intents émettent des URLs `meeshy://` que le routeur de deep links ne connaît pas : le tap ouvre l'app et rien ne se passe. Le cas le plus grave est le widget Quick Reply, qui promet d'envoyer « 👍 / OK / Thanks! » — le texte n'est jamais envoyé, sans aucun feedback.

**Preuve.** `DeepLinkParser.parseCustomScheme` (apps/ios/Meeshy/Features/Main/Navigation/DeepLinkRouter.swift:150-203) et `handleCustomScheme` (:478-570) listent me/links/share/auth/u/join/l/chat/c/conversation/post/p/feeds/story — aucun case `quickreply`, `conversations`, `contact`, `send`, `call`, `translate`. Les widgets émettent `meeshy://quickreply` (MeeshyWidgets.swift:665), `conversations/recent` (:333), `conversations/unread` (:547, :564, :584, :596), `contact/{id}` (:754) ; les App Intents émettent `conversations/recent` (MeeshyAppIntents.swift:230) mais AUSSI `send` (:106), `call` (:152) et `translate` (:213) — trou plus large que le relevé initial. `MeeshyApp.onOpenURL:176` jette le résultat (`let _ =`). Vérifié : l'id publié dans `favorite_contacts` EST un conversationId (WidgetDataManager.swift:218-224, `conv.id` de conversations directes épinglées) — le mapping contact→conversation proposé est valide.

**Impact.** Action utilisateur perdue en silence (le texte du Quick Reply n'est jamais envoyé) ; taps des petits widgets, widgets lock-screen, favoris et raccourci Siri sans aucune navigation vers l'écran promis.

**Correctif pas-à-pas.**
1. `DeepLinkRouter.swift` — ajouter à l'enum `DeepLink` (:291) les cas `.conversationList(unreadOnly: Bool)` et `.quickReply(conversationId: String, text: String)` ; miroir dans `DeepLinkDestination` (:8) pour le parser.
2. `handleCustomScheme` (:487) — ajouter `case "conversations"` (`pathComponents.first == "unread"` → `.conversationList(unreadOnly: true)`, sinon `.conversationList(unreadOnly: false)`), `case "contact"` → guard `nonEmptyIdentifier` → `.conversation(id:)`, `case "quickreply"` → `conversationId = pathComponents[0]`, `text` = query item `text` (percent-décodé) → `.quickReply`.
3. Miroir des 3 cases dans `DeepLinkParser.parseCustomScheme` (:150) pour que `isMeeshyDeepLink` et le routage de `MeeshyApp` s'accordent.
4. Exécution du quickreply — extraire de `NotificationActionHandler.handleReply` (NotificationActionHandler.swift:284-358) une méthode interne réutilisable `sendDurableReply(conversationId:text:)` (record optimiste + ligne outbox + REST, `BackgroundTaskLease` inclus), l'appeler depuis le handler du case `.quickReply` puis naviguer vers la conversation. Ne PAS créer un second chemin d'envoi.
5. `send`/`call`/`translate` des App Intents : hors périmètre widget — au minimum ouvrir la conversation cible pour `send` et tracer un écart séparé pour `call`/`translate`, OU retirer ces intents ; ne pas les laisser morts sans décision.
6. Si le flux quickreply est jugé trop gros pour le lot : retirer `QuickReplyWidget` du `WidgetBundle` (MeeshyWidgets.swift:139) — ne jamais livrer des boutons morts.

**Tests (TDD — RED d'abord).** Dans `MeeshyTests/Unit/Navigation/DeepLinkTests.swift` (suite existante) : `test_parseCustomScheme_quickReplyWithText_returnsQuickReplyDestination`, `test_parseCustomScheme_conversationsRecent_returnsConversationList`, `test_parseCustomScheme_contactId_returnsConversation`, `test_handleCustomScheme_quickReply_setsPendingDeepLink` (router `@MainActor`). Flux : nouveau test dans `MeeshyTests/Unit/Services` (pattern des tests `NotificationActionHandler` existants) `test_sendDurableReply_offline_enqueuesOutboxItemAndOptimisticRecord` avec mocks queue/persistence injectés.

**Risque de régression.** Faible : cases additifs dans le parser et le routeur ; le chemin d'envoi réutilise le flux durable existant de `handleReply` (aucun nouveau chemin réseau).

**Dépendances.** aucune · **Backend requis :** non

### appgroup-03 — Push reçu ≠ widget rafraîchi : la NSE écrit `unread_count` mais ne recharge jamais les timelines (write mort) ni les previews · **P2** · effort M

**Constat.** À la réception d'un push, la NSE écrit le compteur partagé mais n'appelle jamais WidgetKit et ne met pas à jour les previews : le widget reste figé à la dernière session app, jusqu'à ~1 h (relecture de timeline) ou au prochain foreground. Resévérisé P1→P2 par le vérificateur : affichage périmé auto-corrigé à l'ouverture de l'app, aucune perte de donnée ni d'action — c'est de la robustesse d'une surface secondaire, pas de la correctness de sync.

**Preuve.** `updateSharedUnreadCount` écrit `unread_count` (apps/ios/MeeshyNotificationExtension/NotificationService.swift:310-317, appelé :61) mais aucun `import WidgetKit` ni `WidgetCenter` dans toute l'extension (grep : zéro occurrence), et aucune écriture de `recent_conversations`. Côté widget, les 4 entrées de timeline portent le même snapshot, policy `.atEnd` (MeeshyWidgets.swift:168-188). Le commentaire :308-309 (« so widgets can refresh from the extension context ») décrit un contrat que le code ne tient pas : le write NSE est mort jusqu'au prochain reload déclenché par l'app.

**Impact.** App fermée, les messages arrivent (bannières correctes) mais le widget affiche un compteur et des previews figés à la dernière session app — l'inverse de « totalement synchronisé », même si l'écart se résorbe seul à l'ouverture.

**Correctif pas-à-pas.**
1. NSE — `import WidgetKit` dans NotificationService.swift ; après `updateSharedUnreadCount` (:61), appeler `WidgetCenter.shared.reloadAllTimelines()` UNIQUEMENT si une valeur a réellement changé (faire retourner un `Bool` à `updateSharedUnreadCount`) — les reloads déclenchés hors app sont budgétés par WidgetKit, coalescer sous rafale de pushes.
2. Mise à jour de `recent_conversations` : décoder le tableau JSON via un miroir Decodable/Encodable minimal côté NSE (id, contactName, contactAvatar, lastMessage, timestamp, isUnread, isPinned, accentColor, stratégie de dates `.iso8601` comme `MarkConversationReadIntent`), mettre à jour l'entrée du conversationId du push (`lastMessage` = body AFFICHABLE seulement — pour un push E2EE non déchiffré, garder le placeholder, jamais le contenu chiffré ni un contenu contrôlé par l'attaquant ; `timestamp` = now ; `isUnread` = true), réordonner en tête de sa strate (respect du tri épinglées d'appgroup-04), ré-encoder.
3. Adosser le miroir à un test de contrat encode(app)↔decode(NSE) — pattern `SharePendingSendContractTests` (les sources NSE sont déjà compilées dans MeeshyTests, cf. `NSEDecryptorTests`).
4. Ne PAS toucher `conversation_snapshots` depuis la NSE dans ce lot (c'est le volet appgroup-07). Ordonner APRÈS appgroup-04 pour ne pas cimenter l'ordre inversé.

**Tests (TDD — RED d'abord).** MeeshyTests : (a) nouvelle suite `NSERecentConversationsContractTests` : `test_widgetConversation_encodedByApp_decodesInNSEMirror` et le roundtrip inverse (pattern `SharePendingSendContractTests`). (b) Test pur de la fonction de mise à jour (extraite en fonction statique côté NSE) : `test_applyPush_existingConversation_updatesPreviewAndMovesToHead`, `test_applyPush_encryptedPayload_keepsPlaceholderBody`, `test_applyPush_unknownConversation_leavesListIntact` (décision explicite). (c) `test_updateSharedUnreadCount_sameValue_returnsFalse` pour la garde anti-reload.

**Risque de régression.** Contrat JSON dupliqué une fois de plus entre app et NSE — neutralisé par le test de contrat (a). Ne jamais écrire le body d'un push E2EE non déchiffré dans la preview.

**Dépendances.** appgroup-04 (à appliquer avant, pour ne pas cimenter le tri inversé) · **Backend requis :** non

### appgroup-04 — Tri inversé : les épinglées atterrissent en FIN de liste widget/share et sautent au cap 50 · **P2** · effort S

**Constat.** Le tri de publication des conversations vers l'App Group inverse l'intention : les conversations épinglées finissent en queue de liste, et sont éjectées du cap 50 dès qu'il y a assez de non-épinglées.

**Preuve.** WidgetDataManager.swift:112-120 : sort ascendant sur le tuple `(isPinned ? 0 : 1, lastMessageAt)` puis `.reversed()` sur TOUT puis `.prefix(50)` — résultat : non-épinglées récentes d'abord, épinglées reléguées en queue, éjectées s'il y a ≥ 50 non-épinglées. Vérifié qu'aucun consommateur ne re-trie : le widget rend l'ordre du tableau (MeeshyWidgets.swift:357 `.prefix(2)`, :435 `.prefix(5)`) et `ShareConversationStore.targets` (ShareConversationStore.swift:91-105) mappe `recents` dans l'ordre sans sort. `WidgetDataManagerTests` ne couvre que le roundtrip Codable (5 tests, aucun test d'ordre).

**Impact.** Le widget (prefix 2/5 au rendu) n'affiche quasiment jamais les conversations épinglées ; la liste « Send to » de l'extension de partage relègue les conversations importantes en bas, voire les omet au-delà de 50 non-épinglées.

**Correctif pas-à-pas.**
1. Extraire un helper pur testable dans `WidgetDataManager` : `static func widgetOrder(_ conversations: [MeeshyConversation]) -> [MeeshyConversation]` implémentant `sorted { a, b in if a.userState.isPinned != b.userState.isPinned { return a.userState.isPinned } ; return a.lastMessageAt > b.lastMessageAt }` (supprimer `.reversed()`).
2. `publishConversations` (:112) utilise ce helper puis `.prefix(50)`.
3. Ne PAS toucher : `publishFavoriteContacts` (filtre pinned+direct, ordre secondaire) ni le cap 50 (contrat de l'extension de partage documenté :115-119).

**Tests (TDD — RED d'abord).** `MeeshyTests/Unit/Services/WidgetDataManagerTests.swift` : `test_widgetOrder_pinnedConversations_precedeUnpinned`, `test_widgetOrder_withinEachGroup_mostRecentFirst`, `test_widgetOrder_fiftyPlusUnpinned_keepsPinnedInPrefix50` (60 non-épinglées + 3 épinglées → les 3 dans les 50 premières). Fixtures via factory `makeConversation(isPinned:lastMessageAt:)` avec dates RELATIVES à now (leçon : les fixtures à dates absolues pourrissent).

**Risque de régression.** Nul si le test d'ordre est posé avec le fix : le helper pur verrouille l'ordre attendu.

**Dépendances.** aucune · **Backend requis :** non

### appgroup-05 — Fallback fabriqué John Doe/Jane Smith dans les widgets — masque toute lecture morte et remplira l'écran après le wipe logout · **P2** · effort S

**Constat.** Les providers des widgets retournent des jeux de données fabriqués (« John Doe », « Jane Smith ») quand la clé App Group est absente OU quand le décodage échoue : toute panne de lecture est invisible, et une fois le wipe de logout (appgroup-01) posé, tout appareil déconnecté affichera ces conversations fictives.

**Preuve.** `ConversationProvider.loadConversations` retourne `sampleConversations` sur clé absente ET sur échec de decode (MeeshyWidgets.swift:191-203) ; `FavoriteContactsProvider.loadFavorites` idem (:709-720) ; samples « John Doe »/« Jane Smith » avec ids `"1"`/`"2"` (:219-240) produisant des deep links `meeshy://conversation/1` crédibles. Les miroirs `Conversation` (widget :244-253) / `WidgetConversation` (app) sont dupliqués sans test de contrat (`WidgetDataManagerTests` ne teste que le côté app). Pattern identique au bug `sampleContacts` de l'extension de partage (gardé depuis par `ShareExtensionSourceGuardTests`).

**Impact.** Installation fraîche, déconnexion, ou toute dérive du contrat JSON app↔widget affiche des conversations fictives crédibles sur l'écran d'accueil — une lecture morte devient indétectable (c'est exactement le pattern qui a caché la panne de la share extension pendant trois itérations d'audit).

**Correctif pas-à-pas.**
1. `loadConversations`/`loadFavorites` retournent `[]` sur clé absente ou décodage raté.
2. Vues : état vide explicite (« Ouvrez Meeshy ») dans `RecentConversationsWidgetView`/`QuickReplyWidgetView`/`FavoriteContactsWidgetView` quand la liste est vide — `QuickReplyWidget` masque déjà son corps sur liste vide (:629 `if let`), ajouter le message.
3. Réserver les samples à `placeholder(in:)` (déjà le cas, :151-157 et :694-696) et à `getSnapshot` UNIQUEMENT quand `context.isPreview` (aujourd'hui `getSnapshot` appelle `loadConversations` : avec le fix, il rendra l'état vide hors galerie — comportement correct).
4. Test de contrat : compiler MeeshyWidgets.swift n'est pas possible dans MeeshyTests (types Widget) — créer `WidgetConversationContractTests` qui décode, avec un miroir Decodable local strict du struct widget (:244-253), un payload encodé par `WidgetDataManager` (pattern `SharePendingSendContractTests`) ; plus un source-guard test (pattern `ShareExtensionSourceGuardTests`, ancré sur le comportement : interdit `return ConversationEntry.sampleConversations` dans le corps de `loadConversations`/`loadFavorites`, commentaires filtrés).

**Tests (TDD — RED d'abord).** MeeshyTests : (a) `WidgetConversationContractTests` : `test_appEncodedConversations_decodeWithWidgetMirror` (+ vérification champ par champ). (b) `MeeshyWidgetsSourceGuardTests` : `test_loadConversations_hasNoFabricatedFallback` / `test_loadFavorites_hasNoFabricatedFallback` (lecture du source, commentaires strippés). Vérification manuelle de la galerie de widgets (`isPreview`) sur simulateur 18.2 avant commit.

**Risque de régression.** Galerie de widgets : conserver les samples pour `placeholder(in:)` et `isPreview` la préserve. Le source-guard empêche la réintroduction du fallback.

**Dépendances.** appgroup-01 (indissociables : le wipe de logout rend l'état vide obligatoire) · **Backend requis :** non

### appgroup-06 — WidgetActionFlusher : le set final écrase les taps concurrents cross-process + retry infini des échecs définitifs · **P2** · effort S

**Constat.** Le flusher des mark-read tapés depuis le widget termine par une écriture en bloc de la file : tout id ajouté par le widget PENDANT la fenêtre des appels REST est écrasé. Et aucun tri par nature d'erreur : un 404 (conversation supprimée) reste en file pour toujours, rejoué à chaque retour au premier plan.

**Preuve.** WidgetActionFlusher.swift:32-56 : `flush()` lit `queued` (:34), boucle sur des `await` REST (:40-52), puis `defaults.set(failed, forKey: pendingMarkReadKey)` (:55) — un id ajouté par `MarkConversationReadIntent` (process widget, MeeshyWidgets.swift:122-126) pendant la fenêtre REST est écrasé. Aggravation vérifiée : l'intent déduplique via `queued.contains` (:123), donc un re-tap pendant le flush ne ré-ajoutera même pas l'id ensuite. Aucun cap/TTL : un 404 (`MeeshyError.server`) reste dans `failed` pour toujours, rejoué à chaque `.active` (MeeshyApp.swift:584). `ConversationServiceProviding` avec `markRead` existe (ConversationService.swift:53-59) — l'injection pour les tests est faisable sans nouveau protocole.

**Impact.** Un mark-read tapé du widget pendant le réveil de l'app est perdu (la conversation redevient non-lue au prochain publish) ; requêtes réseau récurrentes sur des ids morts à chaque foreground.

**Correctif pas-à-pas.**
1. DI d'abord : `init(service: ConversationServiceProviding = ConversationService.shared, defaults: UserDefaults? = UserDefaults(suiteName:))` — garder `.shared` par défaut (convention ViewModels/services du dépôt).
2. Fin de flush : ne plus écrire `failed` en bloc — relire `let current = defaults.stringArray(forKey:) ?? []`, calculer `succeeded = Set(queued).subtracting(failed)` et écrire `current.filter { !succeeded.contains($0) }` : les appends concurrents survivent.
3. Échecs définitifs : dans le catch, matcher `MeeshyError.server(statusCode:)` ∈ {403, 404, 410} → drop immédiat (ne pas ajouter à `failed`), avec log ; les erreurs réseau/5xx restent en file. Pas de bookkeeping TTL nécessaire avec ce tri par nature d'erreur.
4. Ne PAS toucher `MarkConversationReadIntent` : sa déduplication est correcte une fois le set final non destructif.

**Tests (TDD — RED d'abord).** `MeeshyTests/Unit/Services/WidgetActionFlusherTests.swift` (nouvelle suite) : `test_flush_idAppendedDuringFlush_survivesInQueue` (mock service dont `markRead` suspend sur une continuation ; pendant la suspension, append d'un id dans la suite UserDefaults de test ; asserter sa présence après le flush), `test_flush_notFound404_dropsIdPermanently`, `test_flush_networkError_keepsIdForRetry`, `test_flush_success_removesIdAndNotifiesCoordinator`. `UserDefaults(suiteName: "test-flusher-" + UUID)` nettoyée en `defer` — pas de résidu dans le vrai App Group (leçon : résidus de tests visibles en UI).

**Risque de régression.** Nul : la logique du flush est inchangée pour le cas nominal ; seuls le set final (différentiel au lieu d'écrasement) et le tri des erreurs changent, chacun verrouillé par un test dédié.

**Dépendances.** aucune · **Backend requis :** non

### appgroup-07 — `unread_count` : le push écrit le compteur de la CLOCHE (lignes Notification non lues) là où l'app écrit les messages non lus hors muted — deux métriques différentes + décrément widget de 1 au lieu de N · **P2** · effort M

**Constat.** La clé partagée `unread_count` a deux écrivains qui comptent deux ENTITÉS différentes. Le vérificateur a corrigé le mécanisme par lecture du gateway : le champ `unreadCount` du push est le compteur de lignes `Notification` non lues (la cloche, notifications sociales incluses), pas un total de messages ; l'app, elle, écrit le total local de messages non lus hors conversations muted. Le widget affiche « unread messages » : l'alternance push/foreground fait osciller le compteur entre deux métriques (ex. 5 messages non lus vs 12 notifications cloche). S'y ajoute le décrément de 1 (au lieu de N) du mark-read widget.

**Preuve.** Gateway : `data.unreadCount` = `prisma.notification.count({ userId, readAt: null })` (services/gateway/src/services/notifications/NotificationService.ts:873-877, injecté :901) — même source que `notification:counts`. App : `badgeTotal = conversationUnreadTotal` (NotificationCoordinator.swift:56, :350-355) = messages non lus hors muted (`unmutedTotal` :334-336). Le widget affiche « unread messages » (MeeshyWidgets.swift:594) → la sémantique locale est la bonne pour cette surface, et le commentaire F1 du gateway (« même source → même sémantique ») décrit un contrat non tenu côté iOS. La NSE copie la valeur brute (NotificationService.swift:310-317) ; `MarkConversationReadIntent` décrémente de 1 (MeeshyWidgets.swift:118-119).

**Impact.** Le compteur widget oscille visiblement entre vision serveur (cloche) et vision locale (messages) à chaque alternance push/foreground ; le mark-read widget sous-décrémente le total quand la conversation portait plusieurs non-lus.

**Correctif pas-à-pas.** La vérité de la surface widget est LOCALE (« unread messages »).
1. Ajouter `unreadCount: Int` au miroir NSE `LocalConversationDetails` (apps/ios/MeeshyNotificationExtension/NSEDataSync.swift:29-48, `decodeIfPresent ?? 0` — le payload app le porte déjà : `ConversationSnapshotPayload.unreadCount`).
2. Nouvelle fonction pure côté NSE `recomputeUnreadTotal(snapshots:) -> Int` = somme des `unreadCount` hors `isMuted` — sémantique identique à `NotificationCoordinator.unmutedTotal`, verrouillée par un test comparatif.
3. Dans `didReceive`, pour un push de message : incrémenter le `unreadCount` du snapshot de la conversation (ré-encoder `conversation_snapshots`), puis écrire `recomputeUnreadTotal` dans `unread_count` AU LIEU de copier `userInfo["unreadCount"]` ; si le snapshot de la conversation est absent, fallback conservateur = valeur actuelle + 1.
4. `MarkConversationReadIntent` : lire le snapshot keyé (mini-décodeur `{unreadCount, isMuted}` côté widget), décrémenter du `unreadCount` de la conversation (0 si muted, cohérent avec `unmutedTotal`) au lieu de 1, et remettre le snapshot à zéro.
5. Ne PAS toucher `aps.badge` (gateway) dans ce lot — la divergence du badge d'icône est documentée, à traiter avec la réponse produit sur la sémantique du badge. Caveat assumé : vision Local-First auto-cohérente (dernière session app + bumps NSE), préférable à l'alternance actuelle de deux métriques.

**Tests (TDD — RED d'abord).** (a) MeeshyTests (sources NSE déjà compilées, cf. `NSEDecryptorTests`) : `test_recomputeUnreadTotal_mutedConversations_excluded`, `test_recomputeUnreadTotal_matchesCoordinatorUnmutedTotal_onSameFixture` (comparaison à `NotificationCoordinator.unmutedTotal` statique public), `test_applyPushIncrement_missingSnapshot_fallsBackToPlusOne`. (b) Test de contrat snapshot app↔NSE étendu au champ `unreadCount`. (c) Widget : test pur du calcul de décrément (extraire une fonction statique du `perform` de l'intent).

**Risque de régression.** Moyen — le badge est une surface sensible. Neutralisé par les tests purs de la fonction de recalcul comparée à `NotificationCoordinator.unmutedTotal`, et par le maintien du fallback conservateur (+1) quand le snapshot manque.

**Dépendances.** appgroup-03 (mécanique de ré-encodage NSE + reload), appgroup-09 (fiabilité des snapshots publiés) · **Backend requis :** non (le fichier gateway est cité comme preuve de sémantique ; `aps.badge` est explicitement hors lot)

### appgroup-08 — Présence FavoriteContacts morte : « En ligne » (français SDK) comparé au littéral "Online" — pastille jamais rendue · **P3** · effort S

**Constat.** La pastille de présence du widget FavoriteContacts ne s'affiche jamais pour des données réelles : l'app publie un libellé français d'affichage, le widget compare à un littéral anglais. Seuls les échantillons fabriqués matchent.

**Preuve.** WidgetDataManager.swift:227 publie `status: conv.lastSeenText ?? "Offline"` ; `lastSeenText` (packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift:190-197) renvoie « En ligne »/« Vu il y a Xmin » en dur ; le widget teste `contact.status == "Online"` (MeeshyWidgets.swift:759) — seuls les `sampleContacts` (:728-731) matchent. Doctrine présence ignorée (pas de mapping central, snapshot figé 1 h via `.after(3600)` :705).

**Impact.** Aucune pastille de présence ne s'affiche jamais sur le widget de contacts favoris pour des données réelles ; couleurs redéclarées localement hors mapping central.

**Correctif pas-à-pas.**
1. Ajouter un champ sémantique `presence: String` à `WidgetFavoriteContact` (app, WidgetDataManager.swift:19-25) ET au miroir `FavoriteContact` du widget (MeeshyWidgets.swift:255-261) — `decodeIfPresent` pour la compatibilité des payloads existants.
2. Dériver via le miroir doctrine EXISTANT `UserPresence.state(now:)` (PresenceModels.swift), construit depuis `conv.lastSeenAt` (`isOnline: false, lastActiveAt: lastSeenAt`) — ne PAS réimplémenter les seuils 60 s/5 min/30 min. Publier `state.rawValue` ("online"/"recent"/"away"/"offline").
3. Widget : point vert `#34D399` pour online/recent, orange `#FBBF24` pour away, AUCUN point pour offline (doctrine « offline = pas de pastille ») — remplacer le test :759 et la couleur locale.
4. Garder `status` comme libellé d'affichage éventuel mais ne plus décider dessus ; la localisation de `lastSeenText` est un chantier SDK séparé (ne pas l'entreprendre ici).
5. Mettre à jour `sampleContacts` avec le nouveau champ.

**Tests (TDD — RED d'abord).** `MeeshyTests/Unit/Services/WidgetDataManagerTests.swift` : `test_publishFavoriteContacts_recentLastSeen_publishesOnlinePresence`, `test_publishFavoriteContacts_staleLastSeen_publishesOfflinePresence`, `test_publishFavoriteContacts_nilLastSeen_publishesOfflinePresence` (via helper pur extrait `static func presenceValue(lastSeenAt:now:)` — dates relatives à un `now` injecté). Contrat : étendre le test de contrat `favorite_contacts` au champ `presence` (`decodeIfPresent`).

**Risque de régression.** Nul : le comportement actuel est déjà mort. Le `decodeIfPresent` protège les payloads déjà écrits dans l'App Group.

**Dépendances.** aucune · **Backend requis :** non

### appgroup-09 — Course d'ordre sur `conversation_snapshots` : le publish keyé async peut écrire une génération en retard · **P3** · effort S

**Constat.** Le publish des snapshots keyés part dans une `Task` asynchrone (résolution des noms de catégories) après l'écriture synchrone du tableau : deux publishes rapprochés peuvent commuter, et l'ancienne génération peut s'écrire en dernier. Auto-corrigé au publish suivant.

**Preuve.** WidgetDataManager.swift:145-148 : le tableau est écrit synchrone puis `Task { [conversations] in await Self.resolveUserCategoryNames() ; publishConversationSnapshots(...) }`. Deux publishes rapprochés existent réellement : `registerConversations` via ConversationListViewModel.swift:991 (debounced), puis `reconcileConversationUnreads` :1160/:1208 après fullSync — chacun appelant `widgetSink.publishConversations` (NotificationCoordinator.swift:190/:206). Les deux Tasks MainActor suspendues sur le hop d'acteur `UserCategoryStore` n'ont aucune garantie d'ordre de reprise.

**Impact.** NSE, extension de partage et toasts peuvent lire des préférences de conversation (customName, unreadCount, mute) d'une génération en retard pendant quelques secondes après un double refresh.

**Correctif pas-à-pas.**
1. Ajouter `private var snapshotGeneration = 0` à `WidgetDataManager` (`@MainActor`, aucune synchronisation supplémentaire requise).
2. Dans `publishConversations`, avant la `Task` : `snapshotGeneration += 1 ; let gen = snapshotGeneration`.
3. Dans la `Task`, après l'`await` de `resolveUserCategoryNames` : `guard gen == self.snapshotGeneration else { return }` puis `publishConversationSnapshots`.
4. Pour la testabilité, rendre le résolveur de catégories injectable (`var categoryNamesResolver: () async -> [String: String]` avec le défaut actuel) — nécessaire pour retarder artificiellement la génération 1 dans le test. Ne PAS introduire d'`AsyncStream`/file : le compteur suffit (le dernier écrivain logique gagne).

**Tests (TDD — RED d'abord).** `MeeshyTests/Unit/Services/WidgetDataManagerTests.swift` : `test_publishConversations_twoRapidPublishes_lastGenerationWins` — résolveur injecté qui suspend la première invocation sur une continuation, publier gen1 puis gen2 (résolveur immédiat), libérer gen1, asserter que `conversation_snapshots` (suite UserDefaults de test injectée) contient les données de gen2. Nécessite l'injection `defaults` déjà requise par appgroup-01/04 — mutualiser le `makeSUT`.

**Risque de régression.** Nul : le guard ne fait qu'abandonner une écriture déjà obsolète ; le chemin nominal (publish unique) est inchangé.

**Dépendances.** appgroup-01 (mutualisation du `makeSUT` avec injection de la suite UserDefaults) · **Backend requis :** non

### appgroup-10 — Code mort : NSEDataSync.consumePending* (delete-on-read), dossier MeeshyContextMenu hors build, Live Activities jamais démarrées · **P3** · effort S

**Constat.** Trois blocs de code mort ou de promesses non câblées : deux fonctions de consommation NSE à la sémantique dangereuse (suppression du fichier PENDANT la lecture, avant tout persist) sans aucun appelant ; un dossier entier hors build dont les types référencés n'existent nulle part ; des Live Activities déclarées dans le bundle widget mais jamais démarrées, avec des liens d'action non routés.

**Preuve.** `consumePendingMessages`/`consumePendingPosts` (apps/ios/MeeshyNotificationExtension/NSEDataSync.swift:218-235 et :263-278) suppriment le fichier pendant la lecture (`nseRemoveFile` :232/:275, avant tout persist) et n'ont AUCUN appelant — grep exhaustif : la seule occurrence hors définition est le LABEL de budget `"nse.consumePendingPosts"` dans BackgroundTransitionCoordinator.swift:105, qui appelle en réalité `NSEPendingPostConsumer.shared.consumeAll()` (l'app a ses propres consommateurs respectant « suppression après commit »). `MeeshyContextMenu` : 0 occurrence dans project.yml (source de vérité XcodeGen), types `MeeshyContextMenuItem` inexistants hors Examples. `LiveActivityBridge` = stub loggeur documenté (LiveActivityBridge.swift:8-30) ; liens `meeshy://call/mute|end` (LiveActivities.swift:309/:319) non routés (aucun case "call" dans DeepLinkRouter) ; `MeeshyLiveActivity` déclarée dans le bundle (MeeshyWidgets.swift:141-145).

**Impact.** Dette de compréhension ; risque qu'un futur recâblage du chemin delete-on-read viole l'invariant « suppression après commit » et perde des messages ; Dynamic Island déclarée mais jamais livrée.

**Correctif pas-à-pas.**
1. Supprimer `consumePendingMessages` et `consumePendingPosts` de NSEDataSync.swift (:216-235, :260-278) — aucun appelant, et leur sémantique delete-on-read violerait l'invariant « suppression après commit » si quelqu'un les recâblait.
2. Supprimer le dossier `apps/ios/MeeshyContextMenu/` entier (hors project.yml, inerte au build — aucune régénération XcodeGen requise puisque non référencé).
3. Live Activities : décision produit requise — soit exécuter le plan documenté dans LiveActivityBridge.swift:16-23 (attributes → MeeshySDK, dépendance SDK de la cible MeeshyWidgets dans project.yml, chantier M séparé incluant le routage `meeshy://call/*` dans DeepLinkRouter), soit retirer `MeeshyLiveActivity()` du `WidgetBundle` (MeeshyWidgets.swift:141-145) et marquer `LiveActivityBridge` deprecated. Ne PAS supprimer LiveActivities.swift tant que la décision n'est pas prise.
4. Vérifier que la suppression dans NSEDataSync ne casse pas MeeshyTests (les sources NSE sont compilées dans le bundle de tests — retirer d'éventuels tests des fonctions supprimées).

**Tests (TDD — RED d'abord).** Suppressions pures : le gate est la compilation (`build-for-testing`) + les suites NSE existantes (`NSEDecryptorTests`, `NSEPreferencesGateTests`) vertes. Ajouter un source-guard léger (pattern `ShareExtensionSourceGuardTests`) : `test_nseDataSync_hasNoDeleteOnReadConsumer` — interdit le retour du pattern `nseRemoveFile` dans une fonction retournant les données lues (ancré sur le comportement, commentaires strippés). Si retrait de `MeeshyLiveActivity` du bundle : vérification manuelle de la galerie de widgets sur simulateur 18.2.

**Risque de régression.** Nul pour les suppressions (aucun appelant). Le câblage éventuel des Live Activities est un chantier M distinct, hors de ce lot.

**Dépendances.** appgroup-02 (le routage `meeshy://call/*` conditionne l'option « câbler » des Live Activities) · **Backend requis :** non

## Doublons rattachés

Aucun écart de cette dimension n'a été marqué DUPLICATE par la vérification adversariale. Un rattachement entrant est à noter :

| Doublon | Canonique | Apport au canonique |
|---|---|---|
| outbox-11, volet `pending_mark_read` (fichier 02) | appgroup-01 | Le nettoyage au logout de la file `pending_mark_read` réclamé côté outbox est subsumé par le `wipeAll()` d'appgroup-01, qui purge cette clé avec les quatre clés widget et les trois dossiers de staging. Ne pas le ré-implémenter côté outbox. |

## Écartés après vérification

Aucun écart réfuté dans cette dimension : les 10 écarts cartographiés ont tous survécu à la vérification adversariale (8 CONFIRMED, 2 ADJUSTED). Deux ajustements à connaître pour ne pas « redécouvrir » les versions initiales, inexactes — plus une précision intégrée à la fiche appgroup-01, hors décompte :

- **appgroup-03** — resévérisé P1→P2 : l'affichage périmé du widget est auto-corrigé au prochain passage de l'app au premier plan, sans perte de donnée ni d'action (robustesse d'une surface secondaire, pas correctness de sync).
- **appgroup-07** — le mécanisme initial (« badge serveur vs total hors muted ») était incomplet : la lecture du gateway (NotificationService.ts:873-877) montre que le push transporte le compteur de lignes `Notification` non lues (la cloche, notifications sociales incluses), pas un total de messages. Les deux écrivains comptent deux entités différentes, pas seulement des périmètres muted différents.
- **appgroup-01** (précision intégrée à la fiche, hors décompte) — la version initiale laissait entendre que la NSE pouvait continuer à fetcher sous le compte A après logout : réfuté sur ce point précis — `activeUserId = nil` efface déjà `meeshy_active_user_id` de l'App Group (AuthManager.swift:184 et :503). Le P0 tient sur le rejeu sous B et la fuite d'affichage, pas sur un fetch continué.

## Questions ouvertes

1. `meeshy_active_user_id` est-il écrit pour une session anonyme ? Si oui, la NSE tente des fetches Bearer voués au 401 à chaque push (bruit + budget). Le modèle anonyme (X-Session-Token) n'est couvert par aucune extension — à traiter avec le reliquat « resumeFromBackground gate authToken » des sessions anonymes (fichier 08).
2. Rafales de pushes : plusieurs process NSE concurrents ouvrent chacun un `DatabasePool` sur le SQLite partagé (`busyMode` 5 s) pendant que l'app peut aussi écrire — des pertes de pré-persist sous rafale ont-elles été observées ? (Le catch de `prePersistMessage` avale l'erreur.)
3. `nse_pending_messages/` et `nse_pending_posts/` n'ont aucun prune (contrairement à `nse_bg_uploads/`, purgé après 1 h) : croissance non bornée du conteneur si l'app n'est pas ouverte plusieurs jours sous fort trafic push ?
4. `widget_last_updated` est écrit (WidgetDataManager.swift:138) mais jamais lu — prévu pour une future indication de fraîcheur côté widget, ou à supprimer ? (Noter : appgroup-01 l'inclut dans le wipe de logout dans les deux cas.)

> La question initiale sur la sémantique du `unreadCount` du push (muted exclus ou non) est RÉPONDUE par la vérification adversariale et intégrée à la fiche appgroup-07 : c'est un compteur de lignes `Notification` (`prisma.notification.count({ userId, readAt: null })`, NotificationService.ts:873-877) ; les conversations muted sont exclues du fan-out des notifications de message (`filterMutedRecipients`, mutedRecipients.ts:12-26, sauf mentions qui percent le mute), mais le compteur inclut les notifications sociales que le total local ignore.
