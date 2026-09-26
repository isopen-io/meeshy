import XCTest
import Combine
import GRDB
@testable import MeeshySDK

/// W4 — toute donnée temps réel reçue par socket doit être persistée DÈS
/// réception. Ces suites couvrent les deux trous : la liste de conversations
/// (métadonnées + suppression, jusque-là purement en RAM) et les mutations de
/// message qui ne portent pas d'`APIMessage` (édition, suppression, réactions,
/// vue unique) qui n'atteignaient jamais la table canonique.
final class ConversationSyncEngineRealtimePersistenceTests: XCTestCase {

    // MARK: - Harness

    private func makeEngine() throws -> (engine: ConversationSyncEngine, socket: MockMessageSocket, cache: CacheCoordinator) {
        let db = try DatabaseQueue()
        try AppDatabase.runMigrations(on: db)
        let socket = MockMessageSocket()
        let cache = CacheCoordinator(messageSocket: socket, socialSocket: MockSocialSocket(), db: db)
        let engine = ConversationSyncEngine(
            cache: cache,
            conversationService: MockConversationService(),
            messageService: MockMessageService(),
            messageSocket: socket,
            socialSocket: MockSocialSocket(),
            api: MockAPIClient(),
            syncDelta: MockSyncDeltaMuet()
        )
        return (engine, socket, cache)
    }

    private func waitUntil(timeout: TimeInterval = 2, _ condition: () async -> Bool) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if await condition() { return true }
            try? await Task.sleep(nanoseconds: 15_000_000)
        }
        return await condition()
    }

    // MARK: - applyingConversationUpdate (pure)

    func test_applyingConversationUpdate_unknownConversation_returnsNil() {
        let list = [TestFactories.makeConversation(id: "c1", title: "Alpha")]
        let event = ConversationUpdatedStoreEvent(conversationId: "ghost", title: "Beta")
        XCTAssertNil(ConversationSyncEngine.applyingConversationUpdate(event, to: list))
    }

    func test_applyingConversationUpdate_noOpPayload_returnsNil() {
        let list = [TestFactories.makeConversation(id: "c1", title: "Alpha")]
        let event = ConversationUpdatedStoreEvent(conversationId: "c1")
        XCTAssertNil(
            ConversationSyncEngine.applyingConversationUpdate(event, to: list),
            "un payload sans champ ne doit pas déclencher d'écriture cache"
        )
    }

    func test_applyingConversationUpdate_renameKeepsOrderAndUserState() {
        // `.group` et non le `.direct` par défaut du fixture : le titre d'un DM
        // n'est pas celui de la base, et `merging` ignore désormais un `title`
        // qui le viserait (cf. `ConversationStoreTests`
        // `test_merging_directConversation_neverTakesTheRawTitle`). Le sujet ici
        // est l'ORDRE et le `userState`, pas la garde — d'où une conversation
        // qui accepte d'être renommée.
        var pinned = TestFactories.makeConversation(id: "c1", type: .group, title: "Alpha",
                                                    lastMessageAt: Date(timeIntervalSince1970: 100))
        pinned.userState.isPinned = true
        let other = TestFactories.makeConversation(id: "c2", title: "Zulu",
                                                   lastMessageAt: Date(timeIntervalSince1970: 200))

        let merged = ConversationSyncEngine.applyingConversationUpdate(
            ConversationUpdatedStoreEvent(conversationId: "c1", title: "Renommée"), to: [pinned, other]
        )

        XCTAssertEqual(merged?.map(\.id), ["c1", "c2"], "un rename ne doit pas réordonner la liste")
        XCTAssertEqual(merged?.first?.title, "Renommée")
        XCTAssertEqual(merged?.first?.userState.isPinned, true, "le userState local doit survivre au merge")
    }

    /// La garde « le titre d'un DM n'est pas celui de la base » vaut AUSSI sur
    /// ce chemin — et c'est lui qui portait la conséquence durable. L'écran
    /// (`ConversationListViewModel`) refuse ce titre depuis le 2026-07-04, mais
    /// `applyingConversationUpdate` écrit le CACHE DISQUE et rediffuse la liste
    /// via `conversationsDidChange` : le nom greffé revenait à l'écran par
    /// derrière, et survivait au redémarrage. Ce témoin épingle la délégation à
    /// `ConversationStore.merging` plutôt que de la supposer.
    func test_applyingConversationUpdate_directConversation_doesNotPersistTheRawTitle() {
        let dm = TestFactories.makeConversation(id: "dm-1", type: .direct, title: "Sandra Raveloson")

        XCTAssertNil(
            ConversationSyncEngine.applyingConversationUpdate(
                ConversationUpdatedStoreEvent(conversationId: "dm-1", title: "Sany"),
                to: [dm]
            ),
            "aucune écriture cache : le seul champ du payload ne s'applique pas à un DM"
        )
    }

    func test_applyingConversationUpdate_newerLastMessageAt_resortsList() {
        let older = TestFactories.makeConversation(id: "c1", lastMessageAt: Date(timeIntervalSince1970: 100))
        let newer = TestFactories.makeConversation(id: "c2", lastMessageAt: Date(timeIntervalSince1970: 200))

        let merged = ConversationSyncEngine.applyingConversationUpdate(
            ConversationUpdatedStoreEvent(
                conversationId: "c1", lastMessageAt: Date(timeIntervalSince1970: 300)
            ),
            to: [newer, older]
        )

        XCTAssertEqual(merged?.map(\.id), ["c1", "c2"])
    }

    func test_applyingConversationUpdate_staleLastMessageAt_keepsPreviewGroupIntact() {
        var current = TestFactories.makeConversation(id: "c1", lastMessageAt: Date(timeIntervalSince1970: 500))
        current.lastMessagePreview = "récent"
        current.lastMessageId = "m-recent"

        let merged = ConversationSyncEngine.applyingConversationUpdate(
            ConversationUpdatedStoreEvent(
                conversationId: "c1",
                lastMessageAt: Date(timeIntervalSince1970: 100),
                lastMessage: .replaced("m-old"),
                lastMessagePreview: "périmé"
            ),
            to: [current]
        )

        XCTAssertNil(merged, "un lastMessageAt périmé ne doit rien écrire — ni horodatage, ni aperçu")
    }

    /// Ce qui rend le défaut DURABLE : `applyingConversationUpdate` délègue sa
    /// règle par ligne à `ConversationStore.merging` précisément pour que la
    /// liste PERSISTÉE et le store RAM ne puissent jamais diverger. L'épingle
    /// perdue au passage du pont était donc écrite — sans épingle — dans le
    /// cache disque, où elle survivait au redémarrage : au prochain départ à
    /// froid, la ligne d'un message position-seule est servie vide (aperçu vide
    /// par construction, épingle effacée) jusqu'à ce qu'un
    /// `GET /conversations` la répare.
    func test_applyingConversationUpdate_positionMessage_persistsItsPin() {
        var current = TestFactories.makeConversation(id: "c1", lastMessageAt: Date(timeIntervalSince1970: 100))
        current.lastMessageId = "m-texte"
        current.lastMessagePreview = "salut"

        let merged = ConversationSyncEngine.applyingConversationUpdate(
            ConversationUpdatedStoreEvent(
                conversationId: "c1",
                lastMessageAt: Date(timeIntervalSince1970: 300),
                lastMessage: .replaced("m-position"),
                lastMessagePreview: "",
                location: SharedPlace(latitude: 48.858, longitude: 2.294, name: "Tour Eiffel")
            ),
            to: [current]
        )

        XCTAssertEqual(merged?.first?.lastMessageLocation?.name, "Tour Eiffel",
                       "la liste persistée doit porter l'épingle, sinon le départ à froid sert une ligne vide")
    }

    // MARK: - conversation:updated relayed to disk

    func test_conversationUpdatedRelay_persistsRenameIntoTheCachedList() async throws {
        let (engine, socket, cache) = try makeEngine()
        try await cache.conversations.save(
            [TestFactories.makeConversation(id: "c-rename", type: .group, title: "Avant")], for: "list"
        )
        await engine.startSocketRelay()

        socket.conversationUpdated.send(ConversationUpdatedEvent(
            conversationId: "c-rename", title: "Après", updatedAt: "2026-01-01T00:00:00.000Z"
        ))

        let renamed = await waitUntil {
            await cache.conversations.load(for: "list").snapshot()?
                .first(where: { $0.id == "c-rename" })?.title == "Après"
        }
        XCTAssertTrue(renamed, "conversation:updated doit atteindre le cache disque, pas seulement le store RAM")
    }

    // MARK: - conversation:deleted relayed to disk

    func test_conversationDeletedRelay_removesRowAndItsMessagesFromCache() async throws {
        let (engine, socket, cache) = try makeEngine()
        try await cache.conversations.save(
            [
                TestFactories.makeConversation(id: "c-gone"),
                TestFactories.makeConversation(id: "c-stays")
            ],
            for: "list"
        )
        try await cache.messages.save([TestFactories.makeMessage(conversationId: "c-gone")], for: "c-gone")
        await engine.startSocketRelay()

        socket.conversationDeleted.send(
            ConversationDeletedSocketEvent(userId: "u1", conversationId: "c-gone")
        )

        let removed = await waitUntil {
            await cache.conversations.load(for: "list").snapshot()?.map(\.id) == ["c-stays"]
        }
        XCTAssertTrue(removed, "une conversation supprimée doit disparaître de la liste PERSISTÉE")
        let messages = await cache.messages.load(for: "c-gone").snapshot()
        XCTAssertNil(messages, "les messages de la conversation supprimée doivent partir avec elle")
    }

    // MARK: - Classement d'un message:edited

    func test_mutation_plainEdit_isClassifiedAsEdited() {
        let mutation = ConversationSyncEngine.mutation(
            for: TestFactories.makeAPIMessage(id: "m1", content: "corrigé"), content: "corrigé"
        )
        guard case let .edited(messageId, content, _) = mutation else {
            return XCTFail("un message sans résumé d'appel est une édition")
        }
        XCTAssertEqual(messageId, "m1")
        XCTAssertEqual(content, "corrigé")
    }

    /// Un `message:edited` porteur d'un résumé d'appel décrit la fin de
    /// l'appel. Le traiter comme une édition poserait « modifié » sur l'avis
    /// d'appel — c'est exactement la distinction que fait déjà le handler de
    /// la conversation ouverte, et le relais doit la reproduire.
    func test_mutation_callNotice_isNotClassifiedAsAnEdit() throws {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let apiMessage = try decoder.decode(APIMessage.self, from: Data("""
        {
            "id": "m-call", "conversationId": "c1", "senderId": "s1",
            "content": "Appel", "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-01T00:05:00Z",
            "metadata": {
                "kind": "call",
                "callId": "call-1", "initiatorId": "s1", "callType": "audio",
                "outcome": "completed", "durationSeconds": 272,
                "bytesEstimated": false
            }
        }
        """.utf8))
        XCTAssertNotNil(apiMessage.callSummary)

        let mutation = ConversationSyncEngine.mutation(for: apiMessage, content: "Appel · 04:32")

        guard case let .callNoticeUpdated(messageId, content, json, _) = mutation else {
            return XCTFail("un résumé d'appel ne doit JAMAIS devenir une édition")
        }
        XCTAssertEqual(messageId, "m-call")
        XCTAssertEqual(content, "Appel · 04:32")
        XCTAssertNotNil(json)
    }

    // MARK: - realtimeMessagePersistor (table canonique)

    func test_messageEditedRelay_forwardsEditToTheCanonicalStore() async throws {
        let (engine, socket, _) = try makeEngine()
        let collector = RealtimeMutationCollector()
        engine.realtimeMessagePersistor = { await collector.append($0) }
        await engine.startSocketRelay()

        socket.messageEdited.send(TestFactories.makeAPIMessage(
            id: "m-edit", conversationId: "c-closed", content: "corrigé"
        ))

        let received = await waitUntil { await collector.mutations.contains {
            if case let .edited(messageId, content, _) = $0 { return messageId == "m-edit" && content == "corrigé" }
            return false
        } }
        XCTAssertTrue(received)
    }

    func test_messageDeletedRelay_forwardsDeletionToTheCanonicalStore() async throws {
        let (engine, socket, _) = try makeEngine()
        let collector = RealtimeMutationCollector()
        engine.realtimeMessagePersistor = { await collector.append($0) }
        await engine.startSocketRelay()

        socket.messageDeleted.send(MessageDeletedEvent(messageId: "m-del", conversationId: "c-closed"))

        let received = await waitUntil { await collector.mutations.contains {
            if case let .deleted(messageId, _) = $0 { return messageId == "m-del" }
            return false
        } }
        XCTAssertTrue(received)
    }

    func test_reactionRelay_forwardsAddAndRemoveToTheCanonicalStore() async throws {
        let (engine, socket, _) = try makeEngine()
        let collector = RealtimeMutationCollector()
        engine.realtimeMessagePersistor = { await collector.append($0) }
        await engine.startSocketRelay()

        socket.reactionAdded.send(ReactionUpdateEvent(
            messageId: "m-rx", conversationId: "c-closed", participantId: "p1", userId: nil,
            emoji: "🔥", action: "added", aggregation: nil, timestamp: nil
        ))
        socket.reactionRemoved.send(ReactionUpdateEvent(
            messageId: "m-rx", conversationId: "c-closed", participantId: "p1", userId: nil,
            emoji: "🔥", action: "removed", aggregation: nil, timestamp: nil
        ))

        let added = await waitUntil { await collector.mutations.contains {
            if case let .reactionAdded(messageId, _, emoji, participantId, _, _) = $0 {
                return messageId == "m-rx" && emoji == "🔥" && participantId == "p1"
            }
            return false
        } }
        let removed = await waitUntil { await collector.mutations.contains {
            if case let .reactionRemoved(messageId, emoji, participantId, _, _, _) = $0 {
                return messageId == "m-rx" && emoji == "🔥" && participantId == "p1"
            }
            return false
        } }
        XCTAssertTrue(added)
        XCTAssertTrue(removed)
    }

    /// #7927 — le relais d'une conversation FERMÉE transporte l'auteur
    /// (`userId`) et l'agrégat servi : sans eux, ma réaction posée d'un autre
    /// appareil n'était pas « mienne » ici, et le retrait d'un tiers sur des
    /// lignes rechargées sans auteur ne changeait rien.
    func test_reactionRelay_carriesAuthorAndAggregate() async throws {
        let (engine, socket, _) = try makeEngine()
        let collector = RealtimeMutationCollector()
        engine.realtimeMessagePersistor = { await collector.append($0) }
        await engine.startSocketRelay()

        socket.reactionAdded.send(ReactionUpdateEvent(
            messageId: "m-own", conversationId: "c-closed", participantId: "p-me", userId: "u-me",
            emoji: "🔥", action: "added",
            aggregation: ReactionAggregationEvent(emoji: "🔥", count: 2, participantIds: nil, hasCurrentUser: nil),
            timestamp: nil
        ))
        socket.reactionRemoved.send(ReactionUpdateEvent(
            messageId: "m-own", conversationId: "c-closed", participantId: "p-bob", userId: "u-bob",
            emoji: "🔥", action: "removed",
            aggregation: ReactionAggregationEvent(emoji: "🔥", count: 1, participantIds: ["p-eve"], hasCurrentUser: nil),
            timestamp: nil
        ))

        let added = await waitUntil { await collector.mutations.contains {
            if case let .reactionAdded(_, _, _, _, maxCount, ownerUserId) = $0 {
                return ownerUserId == "u-me" && maxCount == 2
            }
            return false
        } }
        let removed = await waitUntil { await collector.mutations.contains {
            if case let .reactionRemoved(_, _, _, ownerUserId, count, ids) = $0 {
                return ownerUserId == "u-bob" && count == 1 && ids == ["p-eve"]
            }
            return false
        } }
        XCTAssertTrue(added)
        XCTAssertTrue(removed)
    }

    /// #7939 — `message:starred` (room `user:<id>`) reçu conversation FERMÉE :
    /// le relais porte l'étoile posée (avec l'instant SERVEUR) et l'étoile
    /// retirée jusqu'à l'hôte, qui tient `StarredMessagesStore`.
    func test_starRelay_carriesStarAndUnstar() async throws {
        let (engine, socket, _) = try makeEngine()
        let collector = RealtimeMutationCollector()
        engine.realtimeMessagePersistor = { await collector.append($0) }
        await engine.startSocketRelay()
        let starredAt = Date(timeIntervalSince1970: 1_790_000_000)

        socket.messageStarred.send(MessageStarredEvent(
            messageId: "m-star", conversationId: "c-closed", starred: true, starredAt: starredAt
        ))
        socket.messageStarred.send(MessageStarredEvent(
            messageId: "m-gone", conversationId: "c-closed", starred: false, starredAt: nil
        ))

        let starred = await waitUntil { await collector.mutations.contains {
            $0 == .starred(messageId: "m-star", conversationId: "c-closed", starredAt: starredAt)
        } }
        let unstarred = await waitUntil { await collector.mutations.contains {
            $0 == .unstarred(messageId: "m-gone")
        } }
        XCTAssertTrue(starred)
        XCTAssertTrue(unstarred)
    }

    /// Une étoile posée sans date (charge dégradée) ne se perd pas : l'instant
    /// de réception la date, jamais `nil`.
    func test_starMutation_withoutServerDate_isDatedAtReception() {
        let now = Date(timeIntervalSince1970: 42)
        let mutation = ConversationSyncEngine.starMutation(
            for: MessageStarredEvent(messageId: "m", conversationId: "c", starred: true, starredAt: nil),
            now: now
        )
        XCTAssertEqual(mutation, .starred(messageId: "m", conversationId: "c", starredAt: now))
    }

    /// #7927 — `message:edited` ne porte que le texte : remplacer le message
    /// en cache mémoire par la charge perdait ses réactions.
    func test_messageEditedRelay_keepsReactionsOfTheCachedMessage() async throws {
        let (engine, socket, cache) = try makeEngine()
        var cached = TestFactories.makeMessage(id: "m-keep", conversationId: "c-keep", content: "avant")
        cached.reactions = [MeeshyReaction(messageId: "m-keep", participantId: "p1", emoji: "🔥")]
        try await cache.messages.save([cached], for: "c-keep")
        await engine.startSocketRelay()

        socket.messageEdited.send(TestFactories.makeAPIMessage(
            id: "m-keep", conversationId: "c-keep", content: "après"
        ))

        let kept = await waitUntil {
            let message = await cache.messages.load(for: "c-keep").snapshot()?.first { $0.id == "m-keep" }
            return message?.content == "après" && message?.reactions.map(\.emoji) == ["🔥"]
        }
        XCTAssertTrue(kept)
    }

    // MARK: - La ligne de liste après une édition
    //
    // Les onze champs `lastMessage*` décrivent UN message (cf.
    // `LastMessageFacet`). Le chemin ci-dessous en réécrivait une PARTIE alors
    // que la carte du Prisme ne décrivait plus le texte affiché.

    /// Une édition garde le MÊME message — les drapeaux et l'auteur restent
    /// donc justes. Ce qui ne l'est plus, c'est la traduction : elle décrit le
    /// texte D'AVANT, et le serveur remet d'ailleurs `Message.translations` à
    /// `null` dans la même écriture que le nouveau contenu. Ne réécrire que
    /// `lastMessagePreview` laissait le résolveur servir l'ancienne phrase.
    func test_messageEditedRelay_dropsTheTranslationCardOfThePreEditText() async throws {
        let (engine, socket, cache) = try makeEngine()

        var row = TestFactories.makeConversation(id: "c1")
        row.lastMessageId = "m1"
        row.lastMessagePreview = "Hello"
        row.lastMessageTranslations = ["fr": "Bonjour"]
        row.lastMessageOriginalLanguage = "en"
        try await cache.conversations.save([row], for: "list")
        await engine.startSocketRelay()

        socket.messageEdited.send(TestFactories.makeAPIMessage(
            id: "m1", conversationId: "c1", content: "Hello again"
        ))

        let refreshed = await waitUntil {
            await cache.conversations.load(for: "list").snapshot()?.first?.lastMessagePreview == "Hello again"
        }
        XCTAssertTrue(refreshed)

        let afterEdit = await cache.conversations.load(for: "list").snapshot()
        let updated = try XCTUnwrap(afterEdit?.first)
        XCTAssertNil(updated.lastMessageTranslations, "la carte traduisait le texte d'avant")
        XCTAssertEqual(
            updated.resolvedLastMessagePreview(preferredLanguages: ["fr"]), "Hello again",
            "un lecteur francophone lisait « Bonjour » sur un message devenu « Hello again »"
        )
    }

    /// Contre-épreuve : une édition qui ne vise PAS le dernier message ne doit
    /// toucher à rien — surtout pas à la carte du Prisme, qui décrit toujours
    /// correctement le dernier message, lui inchangé.
    func test_messageEditedRelay_olderMessage_leavesTheRowUntouched() async throws {
        let (engine, socket, cache) = try makeEngine()

        var row = TestFactories.makeConversation(id: "c1")
        row.lastMessageId = "m-last"
        row.lastMessagePreview = "Hello"
        row.lastMessageTranslations = ["fr": "Bonjour"]
        row.lastMessageOriginalLanguage = "en"
        try await cache.conversations.save([row], for: "list")
        await engine.startSocketRelay()

        socket.messageEdited.send(TestFactories.makeAPIMessage(
            id: "m-older", conversationId: "c1", content: "corrigé"
        ))

        // Laisser le relais s'exécuter : c'est l'ABSENCE de changement qu'on mesure.
        let mutated = await waitUntil(timeout: 0.5) {
            await cache.conversations.load(for: "list").snapshot()?.first?.lastMessagePreview != "Hello"
        }
        XCTAssertFalse(mutated, "éditer un message ancien ne réécrit pas la ligne")

        let afterOlderEdit = await cache.conversations.load(for: "list").snapshot()
        let untouched = try XCTUnwrap(afterOlderEdit?.first)
        XCTAssertEqual(untouched.lastMessageTranslations, ["fr": "Bonjour"])
    }

    func test_messageConsumedRelay_forwardsViewOnceCountToTheCanonicalStore() async throws {
        let (engine, socket, _) = try makeEngine()
        let collector = RealtimeMutationCollector()
        engine.realtimeMessagePersistor = { await collector.append($0) }
        await engine.startSocketRelay()

        socket.messageConsumed.send(MessageConsumedEvent(
            messageId: "m-burn", conversationId: "c-closed", userId: "u1",
            viewOnceCount: 2, maxViewOnceCount: 2, isFullyConsumed: true
        ))

        let received = await waitUntil { await collector.mutations.contains {
            if case let .consumed(messageId, count) = $0 { return messageId == "m-burn" && count == 2 }
            return false
        } }
        XCTAssertTrue(received, "message:consumed n'était souscrit nulle part hors conversation ouverte")
    }

    // MARK: - Vue unique par personne (#7579, contrat #7578)

    private func consumed(by userId: String) -> MessageConsumedEvent {
        MessageConsumedEvent(
            messageId: "m-vu", conversationId: "c1", userId: userId,
            viewOnceCount: 1, maxViewOnceCount: 3, isFullyConsumed: false
        )
    }

    func test_viewOnceOpenedMutation_consumedByTheReader_marksItOpened() {
        XCTAssertEqual(
            ConversationSyncEngine.viewOnceOpenedMutation(for: consumed(by: "me"), readerId: "me"),
            .viewOnceOpened(messageId: "m-vu"),
            "ouverte depuis un autre appareil du même lecteur : « déjà ouvert » ici aussi"
        )
    }

    func test_viewOnceOpenedMutation_consumedBySomeoneElse_changesNothing() {
        XCTAssertNil(ConversationSyncEngine.viewOnceOpenedMutation(for: consumed(by: "other"), readerId: "me"),
                     "ce qu'un autre ouvre ne retire rien chez moi")
    }

    func test_viewOnceOpenedMutation_unknownReader_changesNothing() {
        XCTAssertNil(ConversationSyncEngine.viewOnceOpenedMutation(for: consumed(by: ""), readerId: ""))
    }

    func test_viewOncePurgedRelay_purgesTheContentAndKeepsTheBubble() async throws {
        let (engine, socket, _) = try makeEngine()
        let collector = RealtimeMutationCollector()
        engine.realtimeMessagePersistor = { await collector.append($0) }
        await engine.startSocketRelay()

        socket.viewOncePurged.send(ViewOncePurgedEvent(messageId: "m-vu", conversationId: "c1"))

        let received = await waitUntil { await collector.mutations.contains(.viewOnceOpened(messageId: "m-vu")) }
        XCTAssertTrue(received, "message:view-once-purged doit vider le contenu local sans retirer la bulle")
        let deleted = await collector.mutations.contains {
            if case .deleted = $0 { return true }
            return false
        }
        XCTAssertFalse(deleted, "une purge de vue unique n'est pas un retrait")
    }

    func test_viewOncePurgedEvent_decodesTheServerPayload() throws {
        let json = #"{"messageId":"m-vu","conversationId":"c1"}"#.data(using: .utf8)!
        let event = try JSONDecoder().decode(ViewOncePurgedEvent.self, from: json)
        XCTAssertEqual(event.messageId, "m-vu")
        XCTAssertEqual(event.conversationId, "c1")
    }

    // MARK: - #7960 — l'éphémère échu, conversation FERMÉE

    /// `message:expired` reçu conversation fermée : le relais porte
    /// l'expiration jusqu'à l'hôte (GRDB, favoris), vide le contenu en cache
    /// et recalcule l'aperçu de liste quand le message échu en était le texte.
    func test_expiredRelay_carriesExpiryAndRecomputesPreview() async throws {
        let (engine, socket, cache) = try makeEngine()
        let collector = RealtimeMutationCollector()
        engine.realtimeMessagePersistor = { await collector.append($0) }
        let survivor = TestFactories.makeMessage(id: "m-keep", conversationId: "c-exp", content: "reste",
                                                 createdAt: Date(timeIntervalSince1970: 100))
        let doomed = TestFactories.makeMessage(id: "m-exp", conversationId: "c-exp", content: "secret",
                                               createdAt: Date(timeIntervalSince1970: 200))
        try await cache.messages.save([survivor, doomed], for: "c-exp")
        try await cache.conversations.save([MeeshyConversation(
            id: "c-exp", identifier: "c-exp", type: .direct,
            lastMessagePreview: "secret", lastMessageId: "m-exp"
        )], for: "list")
        await engine.startSocketRelay()

        socket.messageExpired.send(MessageExpiredEvent(messageId: "m-exp", conversationId: "c-exp"))

        let carried = await waitUntil { await collector.mutations.contains {
            if case let .expired(messageId, _) = $0 { return messageId == "m-exp" }
            return false
        } }
        XCTAssertTrue(carried, "message:expired doit atteindre la table canonique conversation fermée")
        let emptied = await waitUntil {
            await cache.messages.load(for: "c-exp").snapshot()?.first { $0.id == "m-exp" }?.content == ""
        }
        XCTAssertTrue(emptied, "le contenu échu ne doit plus se lire dans le cache")
        let recomputed = await waitUntil {
            let row = await cache.conversations.load(for: "list").snapshot()?.first { $0.id == "c-exp" }
            return row?.lastMessageId == "m-keep" && row?.lastMessagePreview == "reste"
        }
        XCTAssertTrue(recomputed, "l'aperçu ne doit plus décrire le message échu")
        let deleted = await collector.mutations.contains {
            if case .deleted = $0 { return true }
            return false
        }
        XCTAssertFalse(deleted, "une expiration n'est pas une suppression : l'hôte ne l'applique pas pareil")
    }

    // MARK: - #7969 — la story citée retirée

    func test_citedPostWithdrawnRelay_carriesWithdrawalAndPatchesCache() async throws {
        let (engine, socket, cache) = try makeEngine()
        let collector = RealtimeMutationCollector()
        engine.realtimeMessagePersistor = { await collector.append($0) }
        var reply = TestFactories.makeMessage(id: "m-story", conversationId: "c-dm", content: "trop bien")
        reply.storyReplyToId = "post-1"
        reply.replyTo = ReplyReference(messageId: "post-1", authorName: "", previewText: "Plage",
                                       isStoryReply: true, storyThumbnailUrl: "https://cdn/t.jpg")
        try await cache.messages.save([reply], for: "c-dm")
        await engine.startSocketRelay()
        let deletedAt = Date(timeIntervalSince1970: 1_790_000_000)

        socket.messageCitedPostWithdrawn.send(MessageCitedPostWithdrawnEvent(
            conversationId: "c-dm", postId: "post-1", deletedAt: deletedAt
        ))

        let carried = await waitUntil { await collector.mutations.contains(
            .citedPostWithdrawn(postId: "post-1", conversationId: "c-dm", deletedAt: deletedAt)
        ) }
        XCTAssertTrue(carried)
        let patched = await waitUntil {
            await cache.messages.load(for: "c-dm").snapshot()?.first { $0.id == "m-story" }?
                .replyTo?.isUnavailableStory == true
        }
        XCTAssertTrue(patched, "la carte doit passer « Story indisponible » sans relecture")
    }

    func test_withdrawingCitedPost_touchesOnlyCitationsOfThatPost() {
        var cites = TestFactories.makeMessage(id: "a", conversationId: "c")
        cites.replyTo = ReplyReference(messageId: "post-1", authorName: "", previewText: "x", isStoryReply: true)
        var other = TestFactories.makeMessage(id: "b", conversationId: "c")
        other.replyTo = ReplyReference(messageId: "post-2", authorName: "", previewText: "y", isStoryReply: true)
        var messageQuote = TestFactories.makeMessage(id: "c", conversationId: "c")
        messageQuote.replyTo = ReplyReference(messageId: "post-1", authorName: "Bob", previewText: "z")

        let next = ConversationSyncEngine.withdrawingCitedPost("post-1", in: [cites, other, messageQuote])

        XCTAssertEqual(next?.map { $0.replyTo?.isUnavailableStory }, [true, false, false])
        XCTAssertEqual(next?[2].replyTo?.previewText, "z", "une citation de MESSAGE n'est pas une story")
        XCTAssertNil(ConversationSyncEngine.withdrawingCitedPost("post-9", in: [cites, other]),
                     "aucun changement ⇒ aucune écriture cache")
    }

    func test_citedPostWithdrawnEvent_decodesTheServerPayload() throws {
        let json = #"{"conversationId":"c1","postId":"p1","deletedAt":"2026-09-25T10:00:00.000Z"}"#
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            guard let date = WireDate.date(from: raw) else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: raw)
            }
            return date
        }
        let event = try decoder.decode(MessageCitedPostWithdrawnEvent.self, from: Data(json.utf8))
        XCTAssertEqual(event.conversationId, "c1")
        XCTAssertEqual(event.postId, "p1")
        XCTAssertEqual(event.deletedAt, WireDate.date(from: "2026-09-25T10:00:00.000Z"))
    }
}

/// Collecteur thread-safe du hook `realtimeMessagePersistor` (`@Sendable`
/// closure appelée depuis des `Task` concurrentes).
actor RealtimeMutationCollector {
    private(set) var mutations: [RealtimeMessageMutation] = []
    func append(_ mutation: RealtimeMessageMutation) { mutations.append(mutation) }
}
