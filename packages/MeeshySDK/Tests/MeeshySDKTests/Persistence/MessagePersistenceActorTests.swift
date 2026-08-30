import XCTest
import GRDB
@testable import MeeshySDK

final class MessagePersistenceActorTests: XCTestCase {

    private var actor: MessagePersistenceActor!
    private var dbQueue: DatabaseQueue!

    override func setUp() async throws {
        dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)
        actor = MessagePersistenceActor(dbWriter: dbQueue)
    }

    // MARK: - Insert

    func test_insertOptimistic_persistsImmediately() async throws {
        let record = MessageRecordFactory.make(localId: "temp_001", conversationId: "conv_1")
        try await actor.insertOptimistic(record)

        let fetched = try actor.messages(for: "conv_1", limit: 10)
        XCTAssertEqual(fetched.count, 1)
        XCTAssertEqual(fetched[0].localId, "temp_001")
        XCTAssertEqual(fetched[0].state, .sending)
    }

    // MARK: - Apply Event

    func test_applyEvent_serverAck_updatesStateAndPersists() async throws {
        let record = MessageRecordFactory.make(localId: "temp_002")
        try await actor.insertOptimistic(record)

        let newState = try await actor.applyEvent(localId: "temp_002",
            event: .serverAck(serverId: "srv_abc", at: Date()))

        XCTAssertEqual(newState, .sent)

        let fetched = try actor.messages(for: "conv_default", limit: 10)
        XCTAssertEqual(fetched[0].state, .sent)
        XCTAssertEqual(fetched[0].serverId, "srv_abc")
        XCTAssertEqual(fetched[0].changeVersion, 1)
    }

    /// Regression — "message reçu en double" (transient duplicate bubble).
    ///
    /// A server echo that races ahead of the REST ACK and misses the cid match
    /// inserts a SECOND "mirror" row keyed on the server id. When the ACK later
    /// backfills the optimistic row's serverId via `applyEvent(.serverAck)`,
    /// BOTH rows then carry the same serverId — the user sees a duplicate bubble
    /// until a later publish collapses it (which is why it "disappears after a
    /// few minutes / interaction"). The reconcile must purge the mirror so the
    /// optimistic row (which holds the cid tracking + local relations) is the
    /// only survivor for that serverId.
    func test_applyEvent_serverAck_purgesRacingMirrorRow() async throws {
        // Optimistic row authored locally (PK = cid, serverId nil until ack).
        let optimistic = MessageRecordFactory.make(localId: "cid_dup", conversationId: "conv_dup")
        try await actor.insertOptimistic(optimistic)
        // Racing echo that missed the cid match → mirror row keyed on the server id.
        var mirror = MessageRecordFactory.make(localId: "srv_dup", conversationId: "conv_dup", state: .sent)
        mirror.serverId = "srv_dup"
        try await actor.insertOptimistic(mirror)

        // The REST ACK finally lands and backfills the optimistic row's serverId.
        _ = try await actor.applyEvent(localId: "cid_dup",
            event: .serverAck(serverId: "srv_dup", at: Date()))

        let rows = try actor.messages(for: "conv_dup", limit: 10)
        let withServerId = rows.filter { $0.serverId == "srv_dup" }
        XCTAssertEqual(withServerId.count, 1, "exactly one row must carry the server id (mirror purged)")
        XCTAssertEqual(withServerId.first?.localId, "cid_dup", "the optimistic/cid row survives, not the mirror")
    }

    /// Companion to the serverAck case for the OTHER reconcile path:
    /// `upsertFromAPIMessages`. A no-cid echo inserts a mirror row; a later
    /// cid-bearing echo reconciles the optimistic row by `clientMessageId` and
    /// must purge the mirror so a single row survives per serverId — carrying
    /// the server content on the optimistic (cid) row.
    func test_upsertFromAPIMessages_cidReconcile_purgesRacingMirrorRow() async throws {
        let optimistic = MessageRecordFactory.make(localId: "cid_up", conversationId: "conv_up")
        try await actor.insertOptimistic(optimistic)
        var mirror = MessageRecordFactory.make(localId: "srv_up", conversationId: "conv_up", state: .sent)
        mirror.serverId = "srv_up"
        try await actor.insertOptimistic(mirror)

        // The cid-bearing echo reconciles the optimistic row by clientMessageId.
        let echo = makeAPIMessage(id: "srv_up", conversationId: "conv_up", content: "Hello", clientMessageId: "cid_up")
        try await actor.upsertFromAPIMessages([echo])

        let rows = try actor.messages(for: "conv_up", limit: 10)
        let withServerId = rows.filter { $0.serverId == "srv_up" }
        XCTAssertEqual(withServerId.count, 1, "exactly one row must carry the server id (mirror purged)")
        XCTAssertEqual(withServerId.first?.localId, "cid_up", "the optimistic/cid row survives, not the mirror")
        XCTAssertEqual(withServerId.first?.content, "Hello", "the surviving row holds the reconciled server content")
    }

    /// Regression — "status-management-inconsistency" (2026-06).
    ///
    /// The Notification Service Extension pre-persists an offline-push message
    /// with a PLACEHOLDER `createdAt` = the push-receipt time (when the device
    /// came back online), because the push payload doesn't carry the real send
    /// time. The canonical REST fetch then reconciles the row and MUST correct
    /// `createdAt` to the authoritative server value — otherwise the bubble +
    /// detail sheet display the data-reactivation time as the "sent" time,
    /// contradicting the message's notification ("4h ago") and read receipts.
    // MARK: - Régression 2026-08-24 : l'avis d'arrivée rendu comme une parole

    /// **Un message déjà en cache comme « user » doit pouvoir redevenir
    /// « system ».**
    ///
    /// Signalé par l'utilisateur : les avis d'arrivée s'affichaient avec
    /// l'avatar et le nom de l'arrivant, et le texte de REPLI du gateway
    /// (« … a rejoint la conversation — visiteur sans compte ») tenait lieu de
    /// bulle. Le serveur, lui, envoie bien `messageSource: "system"` et son
    /// `metadata.kind = "member-joined"` — vérifié sur l'API de production.
    ///
    /// Deux défauts se combinaient, chacun anodin seul :
    ///  1. `reconcileBatchSync` réinsère en base les messages vus dans le cache
    ///     mémoire via `IncomingMessageData`, une forme APPAUVRIE qui ne porte
    ///     pas la source — le record naissait donc `"user"` ;
    ///  2. `upsertMutatedFieldsEqual` comparait 25 champs mais NI
    ///     `messageSource` NI `messageType` : la charge canonique arrivait
    ///     ensuite avec la bonne valeur et l'upsert jugeait la ligne
    ///     inchangée. Le mensonge devenait donc DÉFINITIF.
    ///
    /// C'est le second défaut que ce test verrouille : sans lui, aucune
    /// correction venue du serveur ne peut plus jamais atteindre la ligne.
    func test_upsertFromAPIMessages_correctsAStaleMessageSource() async throws {
        var cachedAsUser = MessageRecordFactory.make(
            localId: "srv_join",
            conversationId: "conv_join",
            senderId: "participant_1",
            content: "ano_daily_l378 a rejoint la conversation — visiteur sans compte",
            state: .delivered
        )
        cachedAsUser.serverId = "srv_join"
        cachedAsUser.messageSource = "user"      // ce que le chemin appauvri écrivait
        cachedAsUser.messageType = "text"
        try await actor.insertOptimistic(cachedAsUser)

        let canonical = makeAPIMessage(
            id: "srv_join",
            conversationId: "conv_join",
            senderId: "participant_1",
            content: "ano_daily_l378 a rejoint la conversation — visiteur sans compte",
            metadata: [
                "kind": "member-joined",
                "participantId": "participant_1",
                "displayName": "ano_daily_l378",
                "isAnonymous": true,
                "viaShareLink": true,
            ],
            messageSource: "system"
        )
        try await actor.upsertFromAPIMessages([canonical])

        let row = try XCTUnwrap(
            try actor.messages(for: "conv_join", limit: 10).first { $0.serverId == "srv_join" }
        )
        XCTAssertEqual(
            row.messageSource, "system",
            "sans messageSource dans la comparaison d'upsert, la ligne reste « user » pour toujours "
            + "et l'avis s'affiche comme une parole ordinaire"
        )
        XCTAssertNotNil(
            row.joinNoticeJson,
            "et son metadata doit atterrir — c'est lui qui déclenche la bulle dédiée"
        )
    }

    func test_upsertFromAPIMessages_correctsPlaceholderCreatedAtFromCanonicalPayload() async throws {
        let trueSendTime = Date(timeIntervalSince1970: 1_700_000_000)         // real send
        let pushReceiptTime = trueSendTime.addingTimeInterval(4 * 3600)        // +4h (data re-enabled)

        // Simulate the NSE pre-persist: server-keyed row stamped with the
        // push-receipt placeholder, including the derived time-string cache the
        // bubble renders.
        var nsePlaceholder = MessageRecordFactory.make(
            localId: "srv_offline",
            conversationId: "conv_offline",
            senderId: "sender_1",
            content: "Le Sprint 10 a ete defini",
            state: .delivered,
            createdAt: pushReceiptTime
        )
        nsePlaceholder.serverId = "srv_offline"
        nsePlaceholder.cachedTimeString = MessageRecord.computeTimeString(for: pushReceiptTime)
        try await actor.insertOptimistic(nsePlaceholder)

        // The canonical payload (REST/socket, DB-authoritative) carries the real
        // send time.
        let canonical = makeAPIMessage(
            id: "srv_offline",
            conversationId: "conv_offline",
            senderId: "sender_1",
            content: "Le Sprint 10 a ete defini",
            createdAt: trueSendTime
        )
        try await actor.upsertFromAPIMessages([canonical])

        let row = try XCTUnwrap(
            try actor.messages(for: "conv_offline", limit: 10)
                .first { $0.serverId == "srv_offline" }
        )
        XCTAssertEqual(
            row.createdAt.timeIntervalSince1970,
            trueSendTime.timeIntervalSince1970,
            accuracy: 1.0,
            "createdAt must be corrected to the authoritative server send time, not the push-receipt placeholder"
        )
        XCTAssertEqual(
            row.cachedTimeString,
            MessageRecord.computeTimeString(for: trueSendTime),
            "the cached time-string the bubble renders must be recomputed from the corrected createdAt"
        )
    }

    func test_applyEvent_invalidTransition_returnsNil() async throws {
        let record = MessageRecordFactory.make(localId: "temp_003", state: .read)
        try await actor.insertOptimistic(record)

        let result = try await actor.applyEvent(localId: "temp_003", event: .startSending)
        XCTAssertNil(result)

        let fetched = try actor.messages(for: "conv_default", limit: 10)
        XCTAssertEqual(fetched[0].state, .read)
    }

    func test_applyEvent_nonexistentId_returnsNil() async throws {
        let result = try await actor.applyEvent(localId: "nope", event: .startSending)
        XCTAssertNil(result)
    }

    // MARK: - Refresh notification

    /// Regression: `applyEvent` must post `messageStoreShouldRefresh` with the
    /// fetched record's `conversationId` so that conversation-scoped
    /// `MessageStore` observers (which filter by conversationId) actually
    /// re-read after state transitions like `serverAck` / `sendFailed`.
    /// Posting with no conversationId silently breaks every store observer
    /// since they reject notifications without a matching conversationId.
    func test_applyEvent_serverAck_postsRefreshNotificationWithConversationId() async throws {
        let record = MessageRecordFactory.make(localId: "notif_ack", conversationId: "conv_notif_ack")
        try await actor.insertOptimistic(record)
        // Drain the insertOptimistic notification before installing the observer
        // so we only catch the one fired by applyEvent.
        await Task.yield()

        let received = expectation(description: "messageStoreShouldRefresh fires for conv_notif_ack")
        received.assertForOverFulfill = false
        let observer = NotificationCenter.default.addObserver(
            forName: .messageStoreShouldRefresh,
            object: nil,
            queue: .main
        ) { notif in
            guard let cid = notif.userInfo?["conversationId"] as? String,
                  cid == "conv_notif_ack" else { return }
            received.fulfill()
        }
        defer { NotificationCenter.default.removeObserver(observer) }

        _ = try await actor.applyEvent(
            localId: "notif_ack",
            event: .serverAck(serverId: "srv_notif", at: Date())
        )

        await fulfillment(of: [received], timeout: 1.0)
    }

    func test_applyEvent_sendFailed_postsRefreshNotificationWithConversationId() async throws {
        let record = MessageRecordFactory.make(localId: "notif_fail", conversationId: "conv_notif_fail")
        try await actor.insertOptimistic(record)
        await Task.yield()

        let received = expectation(description: "messageStoreShouldRefresh fires for conv_notif_fail")
        received.assertForOverFulfill = false
        let observer = NotificationCenter.default.addObserver(
            forName: .messageStoreShouldRefresh,
            object: nil,
            queue: .main
        ) { notif in
            guard let cid = notif.userInfo?["conversationId"] as? String,
                  cid == "conv_notif_fail" else { return }
            received.fulfill()
        }
        defer { NotificationCenter.default.removeObserver(observer) }

        struct E: Error, Sendable {}
        _ = try await actor.applyEvent(localId: "notif_fail", event: .sendFailed(E()))

        await fulfillment(of: [received], timeout: 1.0)
    }

    // MARK: - Pending IDs

    func test_serverAck_createsPendingIdRecord() async throws {
        let record = MessageRecordFactory.make(localId: "temp_004")
        try await actor.insertOptimistic(record)
        _ = try await actor.applyEvent(localId: "temp_004",
            event: .serverAck(serverId: "srv_pid", at: Date()))

        let serverId = try actor.resolveServerId(for: "temp_004")
        XCTAssertEqual(serverId, "srv_pid")

        let localId = try actor.resolveLocalId(forServerId: "srv_pid")
        XCTAssertEqual(localId, "temp_004")
    }

    // MARK: - Translations

    func test_saveTranslation_persists() async throws {
        let translation = TranslationRecord(
            id: "tr_1", messageLocalId: "msg_1", messageServerId: nil,
            targetLanguage: "en", translatedContent: "Hello",
            translationModel: "nllb-200", confidenceScore: 0.95,
            sourceLanguage: "fr", receivedAt: Date()
        )
        try await actor.saveTranslation(translation)

        let fetched = try actor.translations(for: "msg_1")
        XCTAssertEqual(fetched.count, 1)
        XCTAssertEqual(fetched[0].translatedContent, "Hello")
    }

    /// grdb-06 — deux schémas d'id de traduction coexistent (fallback socket
    /// horodaté vs id serveur stable) : la même (message, langue) peut arriver
    /// sous deux PK différentes. Le save par PK violait l'index UNIQUE
    /// idx_trans_msg_lang au lieu de remplacer la row existante.
    func test_saveTranslation_sameMessageAndLanguageDifferentIds_replacesWithoutThrow() async throws {
        let fallback = TranslationRecord(
            id: "m1_en_1700000000", messageLocalId: "m1", messageServerId: nil,
            targetLanguage: "en", translatedContent: "Hello",
            translationModel: "nllb-200", confidenceScore: 0.9,
            sourceLanguage: "fr", receivedAt: Date()
        )
        try await actor.saveTranslation(fallback)

        let canonical = TranslationRecord(
            id: "m1-en", messageLocalId: "m1", messageServerId: "m1",
            targetLanguage: "en", translatedContent: "Hello v2",
            translationModel: "nllb-200", confidenceScore: 0.95,
            sourceLanguage: "fr", receivedAt: Date()
        )
        try await actor.saveTranslation(canonical)

        let fetched = try actor.translations(for: "m1")
        XCTAssertEqual(fetched.count, 1, "une seule row par (message, langue)")
        XCTAssertEqual(fetched[0].translatedContent, "Hello v2")
        XCTAssertEqual(fetched[0].id, "m1-en", "l'id est remplacé par celui du dernier écrivain")
    }

    /// Éditer un message périme TOUTES ses traductions : elles décrivent un
    /// texte qui n'existe plus. Vider le seul dictionnaire en mémoire serait
    /// cosmétique — l'hydratation GRDB réinjecterait le texte d'avant, et le
    /// symptôme survivrait au redémarrage.
    func test_deleteTranslations_removesEveryLanguageOfTheMessage() async throws {
        for (index, lang) in ["en", "es"].enumerated() {
            try await actor.saveTranslation(TranslationRecord(
                id: "edited-\(lang)", messageLocalId: "edited", messageServerId: nil,
                targetLanguage: lang, translatedContent: "v\(index)",
                translationModel: "nllb-200", confidenceScore: nil,
                sourceLanguage: "fr", receivedAt: Date()
            ))
        }

        try await actor.deleteTranslations(messageLocalId: "edited")

        XCTAssertTrue(try actor.translations(for: "edited").isEmpty)
    }

    /// Un message « own » garde sa ligne optimiste `cid_*` en local alors que
    /// `message:edited` porte l'id SERVEUR. Résoudre sur la seule colonne locale
    /// ne toucherait AUCUNE ligne — l'édition de son propre message depuis un
    /// autre appareil laisserait la traduction périmée en base.
    func test_deleteTranslations_byServerId_alsoRemovesRowsKeyedOnTheLocalId() async throws {
        try await actor.saveTranslation(TranslationRecord(
            id: "cid-en", messageLocalId: "cid_own", messageServerId: "srv_own",
            targetLanguage: "en", translatedContent: "Hello",
            translationModel: "nllb-200", confidenceScore: nil,
            sourceLanguage: "fr", receivedAt: Date()
        ))

        try await actor.deleteTranslations(messageLocalId: "srv_own")

        XCTAssertTrue(try actor.translations(for: "cid_own").isEmpty)
    }

    /// Contre-épreuve de la purge : elle est CIBLÉE. Une éviction qui emporte
    /// les traductions des messages voisins ferait retomber tout le fil sur
    /// l'original.
    func test_deleteTranslations_leavesOtherMessagesUntouched() async throws {
        try await actor.saveTranslation(TranslationRecord(
            id: "keep-en", messageLocalId: "keep", messageServerId: nil,
            targetLanguage: "en", translatedContent: "Kept",
            translationModel: "nllb-200", confidenceScore: nil,
            sourceLanguage: "fr", receivedAt: Date()
        ))
        try await actor.saveTranslation(TranslationRecord(
            id: "drop-en", messageLocalId: "drop", messageServerId: nil,
            targetLanguage: "en", translatedContent: "Dropped",
            translationModel: "nllb-200", confidenceScore: nil,
            sourceLanguage: "fr", receivedAt: Date()
        ))

        try await actor.deleteTranslations(messageLocalId: "drop")

        XCTAssertEqual(try actor.translations(for: "keep").count, 1)
        XCTAssertTrue(try actor.translations(for: "drop").isEmpty)
    }

    /// La collision ne doit plus faire lever le db.write entier : avant le fix,
    /// le throw sur la ligne translations faisait rollback TOUT le batch — un
    /// message sans rapport avec la collision était droppé collatéralement.
    func test_upsertFromAPIMessages_translationIdCollision_persistsWholeBatch() async throws {
        let seeded = TranslationRecord(
            id: "m1_en_1700000000", messageLocalId: "m1", messageServerId: nil,
            targetLanguage: "en", translatedContent: "Hello",
            translationModel: "nllb-200", confidenceScore: 0.9,
            sourceLanguage: "fr", receivedAt: Date()
        )
        try await actor.saveTranslation(seeded)

        let msgA = makeAPIMessage(
            id: "m1", conversationId: "conv_tr",
            translations: [[
                "id": "m1-en", "messageId": "m1", "targetLanguage": "en",
                "translatedContent": "Hello EN", "translationModel": "nllb-200"
            ]]
        )
        let msgB = makeAPIMessage(id: "m2", conversationId: "conv_tr", content: "Second")
        try await actor.upsertFromAPIMessages([msgA, msgB])

        let rows = try actor.messages(for: "conv_tr", limit: 10)
        XCTAssertNotNil(rows.first { $0.localId == "m2" },
                        "un message sans rapport avec la collision ne doit pas être droppé")
        let fetched = try actor.translations(for: "m1")
        XCTAssertEqual(fetched.count, 1)
        XCTAssertEqual(fetched[0].translatedContent, "Hello EN")
    }

    /// Verrou de non-régression : des ids stables re-livrés restent idempotents
    /// après le passage à l'upsert ON CONFLICT.
    func test_upsertFromAPIMessages_stableTranslationIds_idempotent() async throws {
        let msg = makeAPIMessage(
            id: "m3", conversationId: "conv_tr2",
            translations: [[
                "id": "m3-en", "messageId": "m3", "targetLanguage": "en",
                "translatedContent": "Stable", "translationModel": "nllb-200"
            ]]
        )
        try await actor.upsertFromAPIMessages([msg])
        try await actor.upsertFromAPIMessages([msg])

        let fetched = try actor.translations(for: "m3")
        XCTAssertEqual(fetched.count, 1)
        XCTAssertEqual(fetched[0].translatedContent, "Stable")
    }

    // MARK: - Edit / Delete

    func test_markEdited_updatesContentAndFlag() async throws {
        let record = MessageRecordFactory.make(localId: "edit_1", content: "Original")
        try await actor.insertOptimistic(record)

        try await actor.markEdited(localId: "edit_1", newContent: "Edited", editedAt: Date())

        let fetched = try actor.messages(for: "conv_default", limit: 10)
        XCTAssertEqual(fetched[0].content, "Edited")
        XCTAssertTrue(fetched[0].isEdited)
    }

    func test_markEdited_ignoresOutOfOrderStaleEdit() async throws {
        let record = MessageRecordFactory.make(localId: "edit_stale", content: "Original")
        try await actor.insertOptimistic(record)

        let newer = Date()
        let older = newer.addingTimeInterval(-60)

        // Newer edit applies first, then a stale/delayed duplicate delivery
        // of an older edit arrives — it must not clobber the newer content.
        try await actor.markEdited(localId: "edit_stale", newContent: "Newer edit", editedAt: newer)
        try await actor.markEdited(localId: "edit_stale", newContent: "Stale edit", editedAt: older)

        let fetched = try actor.messages(for: "conv_default", limit: 10)
        XCTAssertEqual(fetched[0].content, "Newer edit")
    }

    /// Regression: `editMessage`'s failure-rollback path calls `markEdited`
    /// TWICE with the exact same in-memory `editedAt` (optimistic write, then
    /// rollback to the original content on network failure). GRDB round-trips
    /// `Date` through a millisecond-precision column, so the second call's
    /// stored-vs-incoming comparison must tolerate that round-trip noise —
    /// a strict `<` misfired here and silently dropped the rollback.
    func test_markEdited_sameEditedAtReappliedTwice_stillApplies() async throws {
        let record = MessageRecordFactory.make(localId: "edit_rollback", content: "Original")
        try await actor.insertOptimistic(record)

        let editedAt = Date()
        try await actor.markEdited(localId: "edit_rollback", newContent: "Edited", editedAt: editedAt)
        try await actor.markEdited(localId: "edit_rollback", newContent: "Original", editedAt: editedAt)

        let fetched = try actor.messages(for: "conv_default", limit: 10)
        XCTAssertEqual(fetched[0].content, "Original")
    }

    func test_markDeleted_clearsContentAndSetsTimestamp() async throws {
        let record = MessageRecordFactory.make(localId: "del_1", content: "Delete me")
        try await actor.insertOptimistic(record)

        try await actor.markDeleted(localId: "del_1", deletedAt: Date())

        let fetched = try actor.messages(for: "conv_default", limit: 10)
        XCTAssertNil(fetched[0].content)
        XCTAssertNotNil(fetched[0].deletedAt)
    }

    // MARK: - Purge (masquage PERSONNEL)

    /// Le pendant dur de `markDeleted` : la ligne PART, elle ne devient pas une
    /// pierre tombale. C'est toute la différence entre « supprimé pour tous »
    /// (le fil garde la trace) et « retiré de MA vue » (le message reste vivant
    /// pour les autres, et le serveur ne le renverra plus jamais à ce lecteur —
    /// une tombstone y resterait donc affichée à vie).
    func test_purgeMessages_removesRowEntirely_notATombstone() async throws {
        try await actor.insertOptimistic(
            MessageRecordFactory.make(localId: "hide_1", conversationId: "conv_hide", content: "Hide me")
        )
        try await actor.insertOptimistic(
            MessageRecordFactory.make(localId: "keep_1", conversationId: "conv_hide", content: "Keep me")
        )

        try await actor.purgeMessages(ids: ["hide_1"])

        let rows = try actor.messages(for: "conv_hide", limit: 10)
        XCTAssertEqual(rows.map(\.localId), ["keep_1"],
            "la ligne masquée doit disparaître, pas rester avec un deletedAt")
    }

    func test_purgeMessages_resolvesByServerId_forOwnOptimisticRow() async throws {
        var record = MessageRecordFactory.make(localId: "cid_hide_1", conversationId: "conv_hide_srv")
        record.serverId = "srv_hide_1"
        try await actor.insertOptimistic(record)

        // L'événement nomme l'id SERVEUR ; la ligne locale porte encore son id
        // optimiste. Sans la double résolution, le masquage de son propre
        // message ne trouverait rien.
        try await actor.purgeMessages(ids: ["srv_hide_1"])

        XCTAssertTrue(try actor.messages(for: "conv_hide_srv", limit: 10).isEmpty)
    }

    /// Les traductions sont clées sur le localId RÉEL de la ligne. Purger
    /// depuis les identifiants REÇUS les laisserait derrière — invisibles,
    /// jamais collectées, et re-servies si l'id local était réattribué.
    func test_purgeMessages_alsoDropsChildRows() async throws {
        try await actor.insertOptimistic(
            MessageRecordFactory.make(localId: "hide_tr", conversationId: "conv_hide_tr")
        )
        try await actor.saveTranslation(
            TranslationRecord(
                id: "tr_hide_1", messageLocalId: "hide_tr", messageServerId: nil,
                targetLanguage: "en", translatedContent: "Hello",
                translationModel: "nllb-200", confidenceScore: 0.9,
                sourceLanguage: "fr", receivedAt: Date()
            )
        )

        try await actor.purgeMessages(ids: ["hide_tr"])

        XCTAssertTrue(try actor.translations(for: "hide_tr").isEmpty)
    }

    /// Idempotence : la room est celle de l'UTILISATEUR, donc l'appareil qui a
    /// émis la requête reçoit l'événement lui aussi, et un lot peut nommer des
    /// messages qu'aucune ligne locale ne porte (hors de la page chargée).
    func test_purgeMessages_unknownIds_isANoOp() async throws {
        try await actor.insertOptimistic(
            MessageRecordFactory.make(localId: "kept", conversationId: "conv_noop")
        )

        try await actor.purgeMessages(ids: ["never_seen"])
        try await actor.purgeMessages(ids: [])

        XCTAssertEqual(try actor.messages(for: "conv_noop", limit: 10).count, 1)
    }

    func test_purgeMessages_postsRefreshForEachAffectedConversation() async throws {
        try await actor.insertOptimistic(
            MessageRecordFactory.make(localId: "h_a", conversationId: "conv_a")
        )
        try await actor.insertOptimistic(
            MessageRecordFactory.make(localId: "h_b", conversationId: "conv_b")
        )

        await drainMainQueueNotifications()

        // Les observateurs de `MessageStore` filtrent par conversationId : un
        // lot qui traverse deux fils doit rafraîchir les DEUX, sinon la bulle
        // masquée reste rendue dans celui qu'on a oublié.
        let (expA, obsA) = observeRefresh(
            conversationId: "conv_a",
            description: "messageStoreShouldRefresh fires for conv_a"
        )
        let (expB, obsB) = observeRefresh(
            conversationId: "conv_b",
            description: "messageStoreShouldRefresh fires for conv_b"
        )
        defer {
            NotificationCenter.default.removeObserver(obsA)
            NotificationCenter.default.removeObserver(obsB)
        }

        try await actor.purgeMessages(ids: ["h_a", "h_b"])
        await fulfillment(of: [expA, expB], timeout: 1.0)
    }

    // MARK: - Reactions

    func test_updateReactions_persistsJsonAndCount() async throws {
        let record = MessageRecordFactory.make(localId: "react_1")
        try await actor.insertOptimistic(record)

        let reactionsJson = try JSONEncoder().encode(["reaction1": 3, "reaction2": 1])
        try await actor.updateReactions(localId: "react_1", reactionsJson: reactionsJson,
                                         reactionCount: 4, currentUserReactionsJson: nil)

        let fetched = try actor.messages(for: "conv_default", limit: 10)
        XCTAssertEqual(fetched[0].reactionCount, 4)
        XCTAssertNotNil(fetched[0].reactionsJson)
    }

    // MARK: - Concurrent Safety

    func test_100ConcurrentInserts_noCorruption() async throws {
        let capturedActor = actor!
        try await withThrowingTaskGroup(of: Void.self) { group in
            for i in 0..<100 {
                let record = MessageRecordFactory.make(
                    localId: "concurrent_\(i)", conversationId: "conv_stress")
                group.addTask {
                    try await capturedActor.insertOptimistic(record)
                }
            }
            try await group.waitForAll()
        }

        let all = try actor.messages(for: "conv_stress", limit: 200)
        XCTAssertEqual(all.count, 100)
    }

    // MARK: - Refresh notification regression suite
    //
    // Every mutation method on `MessagePersistenceActor` must post a
    // `messageStoreShouldRefresh` notification scoped to the affected
    // conversationId. `MessageStore` observers filter notifications by
    // conversationId — a notification without a matching id is silently
    // dropped, leaving optimistic mutations invisible in the UI even
    // though the GRDB row was updated. See applyEvent fix 6c6270d1.

    /// Helper: install a notification observer that fulfills the given
    /// expectation when a notification with the expected conversationId is
    /// received. Returns the observer token (caller must remove it).
    private func observeRefresh(
        conversationId: String,
        description: String
    ) -> (XCTestExpectation, NSObjectProtocol) {
        let exp = expectation(description: description)
        exp.assertForOverFulfill = false
        let observer = NotificationCenter.default.addObserver(
            forName: .messageStoreShouldRefresh,
            object: nil,
            queue: .main
        ) { notif in
            guard let cid = notif.userInfo?["conversationId"] as? String,
                  cid == conversationId else { return }
            exp.fulfill()
        }
        return (exp, observer)
    }

    /// Drain any pending main-queue notification dispatches scheduled by an
    /// earlier `postMessageStoreRefresh(...)` (which uses `DispatchQueue.main
    /// .async`). Without this, a freshly installed observer may pick up the
    /// seed's notification, causing tests to pass for the wrong reason.
    private func drainMainQueueNotifications() async {
        // Yielding on the actor doesn't drain main queue pending work.
        // Bouncing through `DispatchQueue.main.async` twice flushes any
        // notifications that were enqueued by previous setup calls.
        for _ in 0..<3 {
            await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
                DispatchQueue.main.async { cont.resume() }
            }
        }
    }

    func test_markEdited_postsRefreshWithConversationId() async throws {
        let record = MessageRecordFactory.make(localId: "edit_notif", conversationId: "conv_edit")
        try await actor.insertOptimistic(record)
        await drainMainQueueNotifications()

        let (exp, observer) = observeRefresh(
            conversationId: "conv_edit",
            description: "messageStoreShouldRefresh fires for markEdited"
        )
        defer { NotificationCenter.default.removeObserver(observer) }

        try await actor.markEdited(localId: "edit_notif", newContent: "Edited", editedAt: Date())
        await fulfillment(of: [exp], timeout: 1.0)
    }

    func test_markDeleted_postsRefreshWithConversationId() async throws {
        let record = MessageRecordFactory.make(localId: "del_notif", conversationId: "conv_del")
        try await actor.insertOptimistic(record)
        await drainMainQueueNotifications()

        let (exp, observer) = observeRefresh(
            conversationId: "conv_del",
            description: "messageStoreShouldRefresh fires for markDeleted"
        )
        defer { NotificationCenter.default.removeObserver(observer) }

        try await actor.markDeleted(localId: "del_notif", deletedAt: Date())
        await fulfillment(of: [exp], timeout: 1.0)
    }

    func test_markUndeleted_postsRefreshWithConversationId() async throws {
        let record = MessageRecordFactory.make(localId: "undel_notif", conversationId: "conv_undel")
        try await actor.insertOptimistic(record)
        try await actor.markDeleted(localId: "undel_notif", deletedAt: Date())
        await drainMainQueueNotifications()

        let (exp, observer) = observeRefresh(
            conversationId: "conv_undel",
            description: "messageStoreShouldRefresh fires for markUndeleted"
        )
        defer { NotificationCenter.default.removeObserver(observer) }

        try await actor.markUndeleted(localId: "undel_notif")
        await fulfillment(of: [exp], timeout: 1.0)
    }

    func test_updatePinned_postsRefreshWithConversationId() async throws {
        let record = MessageRecordFactory.make(localId: "pin_notif", conversationId: "conv_pin")
        try await actor.insertOptimistic(record)
        await drainMainQueueNotifications()

        let (exp, observer) = observeRefresh(
            conversationId: "conv_pin",
            description: "messageStoreShouldRefresh fires for updatePinned"
        )
        defer { NotificationCenter.default.removeObserver(observer) }

        try await actor.updatePinned(localId: "pin_notif", pinnedAt: Date(), pinnedBy: "user_x")
        await fulfillment(of: [exp], timeout: 1.0)
    }

    func test_updateBlurred_postsRefreshWithConversationId() async throws {
        let record = MessageRecordFactory.make(localId: "blur_notif", conversationId: "conv_blur")
        try await actor.insertOptimistic(record)
        await drainMainQueueNotifications()

        let (exp, observer) = observeRefresh(
            conversationId: "conv_blur",
            description: "messageStoreShouldRefresh fires for updateBlurred"
        )
        defer { NotificationCenter.default.removeObserver(observer) }

        try await actor.updateBlurred(localId: "blur_notif", isBlurred: true)
        await fulfillment(of: [exp], timeout: 1.0)
    }

    func test_markConsumed_postsRefreshWithConversationId() async throws {
        let record = MessageRecordFactory.make(localId: "consumed_notif", conversationId: "conv_consumed")
        try await actor.insertOptimistic(record)
        await drainMainQueueNotifications()

        let (exp, observer) = observeRefresh(
            conversationId: "conv_consumed",
            description: "messageStoreShouldRefresh fires for markConsumed"
        )
        defer { NotificationCenter.default.removeObserver(observer) }

        try await actor.markConsumed(localId: "consumed_notif")
        await fulfillment(of: [exp], timeout: 1.0)
    }

    func test_appendReaction_postsRefreshWithConversationId() async throws {
        let record = MessageRecordFactory.make(localId: "react_append", conversationId: "conv_react_app")
        try await actor.insertOptimistic(record)
        await drainMainQueueNotifications()

        let (exp, observer) = observeRefresh(
            conversationId: "conv_react_app",
            description: "messageStoreShouldRefresh fires for appendReaction"
        )
        defer { NotificationCenter.default.removeObserver(observer) }

        try await actor.appendReaction(
            localId: "react_append",
            reactionId: "r_1",
            messageId: "m_1",
            participantId: "p_1",
            emoji: "👍"
        )
        await fulfillment(of: [exp], timeout: 1.0)
    }

    func test_removeReaction_postsRefreshWithConversationId() async throws {
        let record = MessageRecordFactory.make(localId: "react_rm", conversationId: "conv_react_rm")
        try await actor.insertOptimistic(record)
        try await actor.appendReaction(
            localId: "react_rm",
            reactionId: "r_1",
            messageId: "m_1",
            participantId: "p_1",
            emoji: "👍"
        )
        await drainMainQueueNotifications()

        let (exp, observer) = observeRefresh(
            conversationId: "conv_react_rm",
            description: "messageStoreShouldRefresh fires for removeReaction"
        )
        defer { NotificationCenter.default.removeObserver(observer) }

        try await actor.removeReaction(localId: "react_rm", emoji: "👍", participantId: "p_1")
        await fulfillment(of: [exp], timeout: 1.0)
    }

    func test_updateReactions_postsRefreshWithConversationId() async throws {
        let record = MessageRecordFactory.make(localId: "react_set", conversationId: "conv_react_set")
        try await actor.insertOptimistic(record)
        await drainMainQueueNotifications()

        let (exp, observer) = observeRefresh(
            conversationId: "conv_react_set",
            description: "messageStoreShouldRefresh fires for updateReactions"
        )
        defer { NotificationCenter.default.removeObserver(observer) }

        let reactionsJson = try JSONEncoder().encode(["foo": 1])
        try await actor.updateReactions(
            localId: "react_set",
            reactionsJson: reactionsJson,
            reactionCount: 1,
            currentUserReactionsJson: nil
        )
        await fulfillment(of: [exp], timeout: 1.0)
    }

    func test_touchUpdatedAt_postsRefreshWithConversationId() async throws {
        let record = MessageRecordFactory.make(localId: "touch_notif", conversationId: "conv_touch")
        try await actor.insertOptimistic(record)
        await drainMainQueueNotifications()

        let (exp, observer) = observeRefresh(
            conversationId: "conv_touch",
            description: "messageStoreShouldRefresh fires for touchUpdatedAt"
        )
        defer { NotificationCenter.default.removeObserver(observer) }

        try await actor.touchUpdatedAt(localId: "touch_notif")
        await fulfillment(of: [exp], timeout: 1.0)
    }

    func test_updateViewOnceCount_postsRefreshWithConversationId() async throws {
        let record = MessageRecordFactory.make(localId: "vo_notif", conversationId: "conv_vo")
        try await actor.insertOptimistic(record)
        await drainMainQueueNotifications()

        let (exp, observer) = observeRefresh(
            conversationId: "conv_vo",
            description: "messageStoreShouldRefresh fires for updateViewOnceCount"
        )
        defer { NotificationCenter.default.removeObserver(observer) }

        try await actor.updateViewOnceCount(localId: "vo_notif", count: 1)
        await fulfillment(of: [exp], timeout: 1.0)
    }

    func test_updateServerAckedFields_postsRefreshWithConversationId() async throws {
        let record = MessageRecordFactory.make(localId: "ack_fields", conversationId: "conv_ack_fields")
        try await actor.insertOptimistic(record)
        await drainMainQueueNotifications()

        let (exp, observer) = observeRefresh(
            conversationId: "conv_ack_fields",
            description: "messageStoreShouldRefresh fires for updateServerAckedFields"
        )
        defer { NotificationCenter.default.removeObserver(observer) }

        try await actor.updateServerAckedFields(
            localId: "ack_fields",
            content: "Server content",
            attachmentsJson: nil,
            reactionsJson: nil,
            pinnedAt: nil,
            pinnedBy: nil,
            isEdited: false,
            editedAt: nil,
            deletedAt: nil,
            deliveredCount: 1,
            readCount: 0,
            deliveredToAllAt: nil,
            readByAllAt: nil,
            updatedAt: Date()
        )
        await fulfillment(of: [exp], timeout: 1.0)
    }

    func test_updateAttachmentsJson_postsRefreshWithConversationId() async throws {
        let record = MessageRecordFactory.make(localId: "att_notif", conversationId: "conv_att")
        try await actor.insertOptimistic(record)
        await drainMainQueueNotifications()

        let (exp, observer) = observeRefresh(
            conversationId: "conv_att",
            description: "messageStoreShouldRefresh fires for updateAttachmentsJson"
        )
        defer { NotificationCenter.default.removeObserver(observer) }

        let attachmentsJson = try JSONEncoder().encode(["any"])
        try await actor.updateAttachmentsJson(localId: "att_notif", attachmentsJson: attachmentsJson)
        await fulfillment(of: [exp], timeout: 1.0)
    }

    func test_updateLayout_doesNotPostRefresh() async throws {
        // grdb-04 — le refresh d'updateLayout était un no-op prouvé
        // (MessageRecord == ne compare que localId+changeVersion, non bumpé
        // ici) qui coûtait fetch+compare à CHAQUE écriture de layout.
        let record = MessageRecordFactory.make(localId: "layout_notif", conversationId: "conv_layout")
        try await actor.insertOptimistic(record)
        await drainMainQueueNotifications()

        let (exp, observer) = observeRefresh(
            conversationId: "conv_layout",
            description: "messageStoreShouldRefresh must NOT fire for updateLayout"
        )
        exp.isInverted = true
        defer { NotificationCenter.default.removeObserver(observer) }

        try await actor.updateLayout(
            localId: "layout_notif",
            width: 240, height: 60,
            lastLineWidth: 120, lineCount: 2,
            timestampInline: false,
            epoch: 1, maxWidth: 320
        )
        await fulfillment(of: [exp], timeout: 1.0)
    }

    func test_updateDeliveryCounters_postsRefreshWithConversationId() async throws {
        let record = MessageRecordFactory.make(localId: "deliv_notif", conversationId: "conv_deliv")
        try await actor.insertOptimistic(record)
        await drainMainQueueNotifications()

        let (exp, observer) = observeRefresh(
            conversationId: "conv_deliv",
            description: "messageStoreShouldRefresh fires for updateDeliveryCounters"
        )
        defer { NotificationCenter.default.removeObserver(observer) }

        try await actor.updateDeliveryCounters(
            localId: "deliv_notif",
            deliveredCount: 1, readCount: 0,
            deliveredToAllAt: Date(), readByAllAt: nil
        )
        await fulfillment(of: [exp], timeout: 1.0)
    }

    /// La variante batchée mutate N records en UNE transaction et poste UNE
    /// notification par conversation affectée — pas une par record.
    func test_updateDeliveryCounters_batch_mutatesAllAndPostsSingleRefresh() async throws {
        let r1 = MessageRecordFactory.make(localId: "deliv_b1", conversationId: "conv_deliv_batch")
        let r2 = MessageRecordFactory.make(localId: "deliv_b2", conversationId: "conv_deliv_batch")
        try await actor.insertOptimistic(r1)
        try await actor.insertOptimistic(r2)
        await drainMainQueueNotifications()

        let exp = expectation(description: "one refresh for the whole batch")
        exp.expectedFulfillmentCount = 1
        exp.assertForOverFulfill = true
        let observer = NotificationCenter.default.addObserver(
            forName: .messageStoreShouldRefresh, object: nil, queue: .main
        ) { notif in
            guard let cid = notif.userInfo?["conversationId"] as? String,
                  cid == "conv_deliv_batch" else { return }
            exp.fulfill()
        }
        defer { NotificationCenter.default.removeObserver(observer) }

        try await actor.updateDeliveryCounters([
            .init(localId: "deliv_b1", deliveredCount: 2, readCount: 1,
                  deliveredToAllAt: nil, readByAllAt: nil),
            .init(localId: "deliv_b2", deliveredCount: 3, readCount: 0,
                  deliveredToAllAt: Date(), readByAllAt: nil),
        ])
        await fulfillment(of: [exp], timeout: 1.0)

        let fetched = try actor.messages(for: "conv_deliv_batch", limit: 10)
        let first = fetched.first { $0.localId == "deliv_b1" }
        let second = fetched.first { $0.localId == "deliv_b2" }
        XCTAssertEqual(first?.deliveredCount, 2)
        XCTAssertEqual(first?.readCount, 1)
        XCTAssertEqual(second?.deliveredCount, 3)
        XCTAssertNotNil(second?.deliveredToAllAt)
    }

    /// `deleteAll(conversationId:)` runs when the gateway revokes access to a
    /// conversation (HTTP 403 path). Without a refresh notification, every
    /// `MessageStore` observer scoped to that conversation keeps showing the
    /// now-deleted rows from its in-memory cache until the user navigates
    /// away. The conversationId is already a parameter, so the fix is
    /// trivial — but the regression must be locked in.
    func test_deleteAll_postsRefreshWithConversationId() async throws {
        let record = MessageRecordFactory.make(localId: "del_all_notif", conversationId: "conv_del_all")
        try await actor.insertOptimistic(record)
        await drainMainQueueNotifications()

        let (exp, observer) = observeRefresh(
            conversationId: "conv_del_all",
            description: "messageStoreShouldRefresh fires for deleteAll"
        )
        defer { NotificationCenter.default.removeObserver(observer) }

        try await actor.deleteAll(conversationId: "conv_del_all")
        await fulfillment(of: [exp], timeout: 1.0)
    }

    /// `deleteExpiredEphemeral(before:)` is a sweep that may target multiple
    /// conversations at once. It must collect the affected conversationIds
    /// BEFORE the delete and post one notification per id so every active
    /// `MessageStore` observer rebinds. Posting nothing leaves expired rows
    /// rendering until the conversation reloads from another path.
    func test_deleteExpiredEphemeral_postsRefreshForEachAffectedConversation() async throws {
        let now = Date()
        let oneHourAgo = now.addingTimeInterval(-3600)
        let oneHourAhead = now.addingTimeInterval(3600)

        // Two expired rows in two different conversations + one not-yet-expired
        // row in a third conversation. Only the first two should trigger a
        // refresh notification.
        var expired1 = MessageRecordFactory.make(localId: "eph_exp_1", conversationId: "conv_eph_a")
        expired1.expiresAt = oneHourAgo
        var expired2 = MessageRecordFactory.make(localId: "eph_exp_2", conversationId: "conv_eph_b")
        expired2.expiresAt = oneHourAgo
        var alive = MessageRecordFactory.make(localId: "eph_alive", conversationId: "conv_eph_c")
        alive.expiresAt = oneHourAhead

        try await actor.insertOptimistic(expired1)
        try await actor.insertOptimistic(expired2)
        try await actor.insertOptimistic(alive)
        await drainMainQueueNotifications()

        let (expA, obsA) = observeRefresh(
            conversationId: "conv_eph_a",
            description: "messageStoreShouldRefresh fires for conv_eph_a"
        )
        let (expB, obsB) = observeRefresh(
            conversationId: "conv_eph_b",
            description: "messageStoreShouldRefresh fires for conv_eph_b"
        )
        defer {
            NotificationCenter.default.removeObserver(obsA)
            NotificationCenter.default.removeObserver(obsB)
        }
        // Negative observer: conv_eph_c must NOT be notified.
        var aliveNotified = false
        let aliveObs = NotificationCenter.default.addObserver(
            forName: .messageStoreShouldRefresh,
            object: nil,
            queue: .main
        ) { notif in
            if let cid = notif.userInfo?["conversationId"] as? String, cid == "conv_eph_c" {
                aliveNotified = true
            }
        }
        defer { NotificationCenter.default.removeObserver(aliveObs) }

        try await actor.deleteExpiredEphemeral(before: now)
        await fulfillment(of: [expA, expB], timeout: 1.0)
        await drainMainQueueNotifications()
        XCTAssertFalse(aliveNotified, "Non-expired conversation must not be refreshed")

        // Sanity: the alive row must still be in the DB, the expired ones must be gone.
        let aliveRows = try actor.messages(for: "conv_eph_c", limit: 10)
        let expARows = try actor.messages(for: "conv_eph_a", limit: 10)
        let expBRows = try actor.messages(for: "conv_eph_b", limit: 10)
        XCTAssertEqual(aliveRows.count, 1)
        XCTAssertTrue(expARows.isEmpty)
        XCTAssertTrue(expBRows.isEmpty)
    }

    // MARK: - Sprint 2 — APIMessage ingestion (RC2.2 / RC2.3)

    private func makeAPIMessage(
        id: String,
        conversationId: String,
        senderId: String = "sender_1",
        content: String? = "Hello",
        clientMessageId: String? = nil,
        isEncrypted: Bool = false,
        attachments: [[String: Any]] = [],
        translations: [[String: Any]] = [],
        reactionSummary: [String: Int]? = nil,
        currentUserReactions: [String]? = nil,
        metadata: [String: Any]? = nil,
        messageSource: String? = nil,
        createdAt: Date = Date()
    ) -> APIMessage {
        var json: [String: Any] = [
            "id": id,
            "conversationId": conversationId,
            "senderId": senderId,
            "createdAt": ISO8601DateFormatter().string(from: createdAt),
            "updatedAt": ISO8601DateFormatter().string(from: createdAt),
        ]
        if let content { json["content"] = content }
        if let clientMessageId { json["clientMessageId"] = clientMessageId }
        if isEncrypted { json["isEncrypted"] = true }
        if !attachments.isEmpty { json["attachments"] = attachments }
        if !translations.isEmpty { json["translations"] = translations }
        if let reactionSummary { json["reactionSummary"] = reactionSummary }
        if let currentUserReactions { json["currentUserReactions"] = currentUserReactions }
        if let metadata { json["metadata"] = metadata }
        if let messageSource { json["messageSource"] = messageSource }
        let data = try! JSONSerialization.data(withJSONObject: json)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try! decoder.decode(APIMessage.self, from: data)
    }

    // MARK: - Avis d'arrivée (join notice) — le fil ROUVERT garde son sens

    /// `MessageRecord` portait `callSummaryJson` mais aucun `joinNoticeJson` :
    /// l'avis d'arrivée perdait son metadata au passage par le store du fil, et
    /// toute conversation ROUVERTE retombait sur le repli français générique
    /// (icône téléphone) — alors que la vue dédiée traduisible existait.
    func test_upsertFromAPIMessages_persistsJoinNotice_forReopenedThread() async throws {
        let api = makeAPIMessage(
            id: "srv_join",
            conversationId: "conv_join",
            content: "ano_bob a rejoint la conversation — visiteur sans compte",
            metadata: [
                "kind": "member-joined",
                "participantId": "p1",
                "displayName": "ano_bob",
                "isAnonymous": true,
                "viaShareLink": true,
                "username": "ano_bob",
                "givenName": "Bob Martin",
                "linkRules": ["canSendMessages": true, "canSendFiles": false, "canSendImages": true],
            ],
            messageSource: "system"
        )
        try await actor.upsertFromAPIMessages([api])

        let fetched = try actor.messages(for: "conv_join", limit: 10)
        XCTAssertEqual(fetched.count, 1)
        let message = fetched[0].toMessage(currentUserId: "someone-else")
        XCTAssertEqual(message.messageSource, .system)
        XCTAssertEqual(message.joinNotice?.displayName, "ano_bob")
        XCTAssertEqual(message.joinNotice?.givenName, "Bob Martin")
        XCTAssertEqual(message.joinNotice?.username, "ano_bob")
        XCTAssertEqual(message.joinNotice?.linkRules?.canSendFiles, false)
    }

    /// Contre-épreuve : un message ordinaire ne gagne aucun avis fantôme.
    func test_upsertFromAPIMessages_ordinaryMessage_hasNoJoinNotice() async throws {
        let api = makeAPIMessage(id: "srv_plain", conversationId: "conv_join2", content: "Salut")
        try await actor.upsertFromAPIMessages([api])

        let fetched = try actor.messages(for: "conv_join2", limit: 10)
        XCTAssertNil(fetched[0].toMessage(currentUserId: "someone-else").joinNotice)
    }

    // MARK: - Call notice (live → terminal, message d'appel vivant)

    private func callSummaryJSON(kind: String, callId: String = "call_1", outcome: String = "completed", duration: Int = 0) -> Data {
        let dict: [String: Any] = [
            "kind": kind,
            "callId": callId,
            "initiatorId": "user_init",
            "callType": "audio",
            "outcome": outcome,
            "durationSeconds": duration,
            "bytesEstimated": false,
        ]
        return try! JSONSerialization.data(withJSONObject: dict)
    }

    private func callMetadataDict(kind: String, callId: String = "call_1", outcome: String = "completed", duration: Int = 0) -> [String: Any] {
        [
            "kind": kind,
            "callId": callId,
            "initiatorId": "user_init",
            "callType": "audio",
            "outcome": outcome,
            "durationSeconds": duration,
            "bytesEstimated": false,
        ]
    }

    /// La transition serveur live → terminal (message:edited porteur d'une
    /// métadonnée d'appel) met à jour content + callSummaryJson + updatedAt +
    /// changeVersion SANS toucher isEdited/editedAt — une transition d'état
    /// n'est pas une édition utilisateur, la bulle ne doit jamais porter
    /// « modifié ».
    func test_applyCallNoticeUpdate_updatesContentAndSummary_withoutEditFlags() async throws {
        var record = MessageRecordFactory.make(localId: "srv_call_1", conversationId: "conv_call")
        record.serverId = "srv_call_1"
        record.callSummaryJson = callSummaryJSON(kind: "call-live")
        try await actor.insertOptimistic(record)

        let terminal = callSummaryJSON(kind: "call", outcome: "completed", duration: 272)
        try await actor.applyCallNoticeUpdate(
            localId: "srv_call_1",
            content: "Appel audio · 04:32",
            callSummaryJson: terminal,
            serverUpdatedAt: Date()
        )

        let fetched = try actor.messages(for: "conv_call", limit: 10)
        XCTAssertEqual(fetched.count, 1)
        XCTAssertEqual(fetched[0].content, "Appel audio · 04:32")
        XCTAssertEqual(fetched[0].callSummaryJson, terminal)
        XCTAssertFalse(fetched[0].isEdited, "state transition must not brand the bubble as edited")
        XCTAssertNil(fetched[0].editedAt)
        XCTAssertGreaterThan(fetched[0].changeVersion, record.changeVersion)
    }

    /// Le message d'appel arrive par socket avec l'id SERVEUR ; la résolution
    /// doit matcher `serverId` comme `markEdited` (localId OR serverId).
    func test_applyCallNoticeUpdate_resolvesByServerId() async throws {
        var record = MessageRecordFactory.make(localId: "cid_call_2", conversationId: "conv_call2")
        record.serverId = "srv_call_2"
        record.callSummaryJson = callSummaryJSON(kind: "call-live")
        try await actor.insertOptimistic(record)

        try await actor.applyCallNoticeUpdate(
            localId: "srv_call_2",
            content: "Appel audio manqué",
            callSummaryJson: callSummaryJSON(kind: "call", outcome: "missed"),
            serverUpdatedAt: Date()
        )

        let fetched = try actor.messages(for: "conv_call2", limit: 10)
        XCTAssertEqual(fetched[0].content, "Appel audio manqué")
    }

    /// Garde anti-régression : un snapshot REST sérialisé PENDANT l'appel
    /// (metadata live) appliqué APRÈS l'édition terminale ne doit régresser ni
    /// la métadonnée ni le content — sinon la bulle relit « en cours » à jamais.
    func test_upsertFromAPIMessages_staleLiveSnapshot_neverRegressesTerminalSummary() async throws {
        var record = MessageRecordFactory.make(
            localId: "srv_call_3",
            conversationId: "conv_call3",
            content: "Appel audio · 04:32",
            state: .sent
        )
        record.serverId = "srv_call_3"
        record.callSummaryJson = callSummaryJSON(kind: "call", outcome: "completed", duration: 272)
        try await actor.insertOptimistic(record)

        let staleSnapshot = makeAPIMessage(
            id: "srv_call_3",
            conversationId: "conv_call3",
            content: "Appel audio en cours",
            metadata: callMetadataDict(kind: "call-live")
        )
        try await actor.upsertFromAPIMessages([staleSnapshot])

        let fetched = try actor.messages(for: "conv_call3", limit: 10)
        XCTAssertEqual(fetched.count, 1)
        XCTAssertEqual(fetched[0].content, "Appel audio · 04:32", "stale live content must not clobber the terminal label")
        let stored = try XCTUnwrap(fetched[0].callSummaryJson)
        let decoded = try JSONDecoder().decode(CallSummaryMetadata.self, from: stored)
        XCTAssertFalse(decoded.isLive, "terminal summary must never regress to live")
        XCTAssertEqual(decoded.durationSeconds, 272)
    }

    /// Le sens NORMAL passe toujours : un refresh REST portant le TERMINAL
    /// remplace la métadonnée live stockée (conversation fermée pendant
    /// l'appel, hydratation REST après coup).
    func test_upsertFromAPIMessages_liveToTerminal_alwaysApplies() async throws {
        var record = MessageRecordFactory.make(
            localId: "srv_call_4",
            conversationId: "conv_call4",
            content: "Appel audio en cours",
            state: .sent
        )
        record.serverId = "srv_call_4"
        record.callSummaryJson = callSummaryJSON(kind: "call-live")
        try await actor.insertOptimistic(record)

        let terminalRefresh = makeAPIMessage(
            id: "srv_call_4",
            conversationId: "conv_call4",
            content: "Appel audio · 04:32",
            metadata: callMetadataDict(kind: "call", outcome: "completed", duration: 272)
        )
        try await actor.upsertFromAPIMessages([terminalRefresh])

        let fetched = try actor.messages(for: "conv_call4", limit: 10)
        XCTAssertEqual(fetched[0].content, "Appel audio · 04:32")
        let stored = try XCTUnwrap(fetched[0].callSummaryJson)
        let decoded = try JSONDecoder().decode(CallSummaryMetadata.self, from: stored)
        XCTAssertFalse(decoded.isLive)
        XCTAssertEqual(decoded.outcome, .completed)
        XCTAssertEqual(decoded.durationSeconds, 272)
    }

    /// RC2.2 — a media message ingested via `upsertFromAPIMessages` must keep
    /// its attachments (the legacy 6-field path dropped them → empty bubble).
    func test_upsertFromAPIMessages_withImageAttachment_persistsAttachmentsAndThumbHash() async throws {
        let apiMsg = makeAPIMessage(
            id: "srv_img_1",
            conversationId: "conv_img",
            content: nil,
            attachments: [[
                "id": "att_1",
                "mimeType": "image/jpeg",
                "fileUrl": "https://cdn.example/a.jpg",
                "thumbnailUrl": "https://cdn.example/a_thumb.jpg",
                "thumbHash": "1QcSHQRnh493V4dIh4eXh1h4kJUI",
                "width": 1200,
                "height": 800
            ]]
        )

        try await actor.upsertFromAPIMessages([apiMsg])

        let rows = try actor.messages(for: "conv_img", limit: 10)
        XCTAssertEqual(rows.count, 1)
        let json = try XCTUnwrap(rows[0].attachmentsJson,
            "a media message ingested via the APIMessage path must persist attachmentsJson")
        let attachments = try JSONDecoder().decode([MeeshyMessageAttachment].self, from: json)
        XCTAssertEqual(attachments.count, 1)
        XCTAssertEqual(attachments[0].id, "att_1")
        XCTAssertEqual(attachments[0].fileUrl, "https://cdn.example/a.jpg")
        XCTAssertEqual(attachments[0].thumbHash, "1QcSHQRnh493V4dIh4eXh1h4kJUI",
            "ThumbHash must survive ingestion so the bubble shows an instant blur placeholder")
    }

    /// RC2.2 — an encrypted DM keeps its ciphertext + flag; cleartext never
    /// touches disk (the display pipeline decrypts in memory).
    func test_upsertFromAPIMessages_encryptedMessage_persistsCiphertextAndFlag() async throws {
        let apiMsg = makeAPIMessage(
            id: "srv_enc_1",
            conversationId: "conv_enc",
            content: "Y2lwaGVydGV4dA==",
            isEncrypted: true
        )

        try await actor.upsertFromAPIMessages([apiMsg])

        let rows = try actor.messages(for: "conv_enc", limit: 10)
        XCTAssertEqual(rows.count, 1)
        XCTAssertTrue(rows[0].isEncrypted,
            "an encrypted DM must keep isEncrypted so the display pipeline decrypts it")
        XCTAssertEqual(rows[0].content, "Y2lwaGVydGV4dA==",
            "ciphertext must be stored verbatim — never decrypted to disk")
    }

    /// RC2.3 — an echo reconciles the optimistic row by `clientMessageId`
    /// (the optimistic row's localId IS the cid) without duplicating it.
    func test_upsertFromAPIMessages_reconcilesOptimisticByClientMessageId() async throws {
        let cid = "cid_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        let optimistic = MessageRecordFactory.make(
            localId: cid, conversationId: "conv_recon", state: .sending
        )
        try await actor.insertOptimistic(optimistic)

        let echo = makeAPIMessage(
            id: "srv_recon_1",
            conversationId: "conv_recon",
            content: "Hello",
            clientMessageId: cid
        )
        try await actor.upsertFromAPIMessages([echo])

        let rows = try actor.messages(for: "conv_recon", limit: 10)
        XCTAssertEqual(rows.count, 1, "reconciling by clientMessageId must NOT create a duplicate row")
        XCTAssertEqual(rows[0].localId, cid, "the optimistic row's localId is preserved")
        XCTAssertEqual(rows[0].serverId, "srv_recon_1", "the server id is backfilled onto the optimistic row")
        XCTAssertEqual(rows[0].state, .sent,
            "a reconciled row with no delivery signal must stay .sent — not jump to .delivered (✓✓)")

        let resolved = try actor.resolveServerId(for: cid)
        XCTAssertEqual(resolved, "srv_recon_1",
            "PendingIdRecord must be coherent so backend ops resolve the server id")
    }

    /// BUG1 — the "message duplicates after delivery" race. The optimistic row
    /// is server-acked first (which sets `serverId` AND a PendingIdRecord), then
    /// a background REST refresh (`GET /messages`) returns the SERVER-shaped
    /// record keyed by the server id and WITHOUT the `clientMessageId` (a plain
    /// snapshot does not echo the cid). The upsert must reconcile it onto the
    /// existing optimistic row via the PendingIdRecord → serverId resolution,
    /// never insert a second row. A duplicate here is exactly the user-visible
    /// "two copies of my just-sent message" symptom the BUG1 diagnostics guard.
    func test_upsertFromAPIMessages_afterServerAck_restRefreshWithoutCid_reconcilesNoDuplicate() async throws {
        let cid = "cid_11111111111111111111111111111111"
        let serverId = "srv_post_ack_1"
        let conv = "conv_bug1_race"

        let optimistic = MessageRecordFactory.make(
            localId: cid, conversationId: conv, content: "mon message", state: .sending
        )
        try await actor.insertOptimistic(optimistic)

        // Server ACK: backfills serverId onto the cid_ row + creates PendingIdRecord.
        let acked = try await actor.applyEvent(
            localId: cid, event: .serverAck(serverId: serverId, at: Date()))
        XCTAssertEqual(acked, .sent)

        // Background REST refresh: the server record, keyed by serverId, with NO
        // clientMessageId — the upsert must resolve it via the PendingIdRecord.
        let restRecord = makeAPIMessage(
            id: serverId, conversationId: conv, content: "mon message", clientMessageId: nil)
        try await actor.upsertFromAPIMessages([restRecord])

        let rows = try actor.messages(for: conv, limit: 10)
        XCTAssertEqual(rows.count, 1,
            "a post-ACK REST refresh must reconcile onto the optimistic row, never duplicate it")
        XCTAssertEqual(rows[0].localId, cid,
            "the row keeps its optimistic localId (cid_*); the server id lives in the serverId column")
        XCTAssertEqual(rows[0].serverId, serverId)
        XCTAssertEqual(rows[0].state, .sent,
            "a REST payload carrying no delivery signal must not regress the acked .sent state")
    }

    /// BUG1 robustness — even when the PendingIdRecord is absent (a row whose
    /// serverId was backfilled from cache hydration rather than a live ack), a
    /// REST/socket payload keyed by the server id must still reconcile via the
    /// `serverId`-column OR-match in the upsert resolver and not duplicate.
    func test_upsertFromAPIMessages_serverIdColumnMatch_reconcilesWithoutPendingIdRecord() async throws {
        let cid = "cid_22222222222222222222222222222222"
        let serverId = "srv_no_pending_1"
        let conv = "conv_bug1_legacy"

        var optimistic = MessageRecordFactory.make(
            localId: cid, conversationId: conv, content: "Hello", state: .sent
        )
        optimistic.serverId = serverId    // serverId known, but NO PendingIdRecord written
        try await actor.insertOptimistic(optimistic)

        let restRecord = makeAPIMessage(
            id: serverId, conversationId: conv, content: "Hello", clientMessageId: nil)
        try await actor.upsertFromAPIMessages([restRecord])

        let rows = try actor.messages(for: conv, limit: 10)
        XCTAssertEqual(rows.count, 1,
            "serverId-column match must reconcile even when no PendingIdRecord exists")
        XCTAssertEqual(rows[0].localId, cid,
            "the optimistic localId is preserved; no duplicate server-keyed row appears")
    }

    /// The buffered entry point routes through the serial write stream.
    func test_bufferIncomingAPIMessages_writesThroughSerialStream() async throws {
        await actor.start()
        let apiMsg = makeAPIMessage(id: "srv_buf_1", conversationId: "conv_buf", content: "Buffered")

        await actor.bufferIncomingAPIMessages([apiMsg])

        var rows: [MessageRecord] = []
        for _ in 0..<60 {
            rows = try actor.messages(for: "conv_buf", limit: 10)
            if !rows.isEmpty { break }
            try await Task.sleep(nanoseconds: 25_000_000)
        }
        XCTAssertEqual(rows.count, 1, "bufferIncomingAPIMessages must commit through the write stream")
        XCTAssertEqual(rows.first?.content, "Buffered")
    }

    // MARK: - Socket mutators resolve own messages by serverId

    // Socket `message:edited` / `message:deleted` / `reaction:*` events carry
    // the SERVER id. An own message's GRDB row keeps its optimistic
    // `localId` (`cid_*`) with the server id only in the `serverId` column —
    // these mutators must resolve `localId == ? OR serverId == ?` or the
    // event silently no-ops on the user's own messages.

    func test_markEdited_resolvesByServerId_forOwnOptimisticRow() async throws {
        let cid = "cid_dddddddddddddddddddddddddddddddd"
        let serverId = "srv_edit_target_1"
        var record = MessageRecordFactory.make(localId: cid, conversationId: "conv_edit")
        record.serverId = serverId
        try await actor.insertOptimistic(record)

        // The message:edited socket event is keyed by the server id.
        try await actor.markEdited(localId: serverId, newContent: "edited body", editedAt: Date())

        let rows = try actor.messages(for: "conv_edit", limit: 10)
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows[0].content, "edited body",
            "a serverId-keyed edit must reach the own optimistic row (localId = cid)")
        XCTAssertTrue(rows[0].isEdited)
    }

    func test_markDeleted_resolvesByServerId_forOwnOptimisticRow() async throws {
        let cid = "cid_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
        let serverId = "srv_delete_target_1"
        var record = MessageRecordFactory.make(localId: cid, conversationId: "conv_del")
        record.serverId = serverId
        try await actor.insertOptimistic(record)

        try await actor.markDeleted(localId: serverId, deletedAt: Date())

        let rows = try actor.messages(for: "conv_del", limit: 10)
        XCTAssertEqual(rows.count, 1)
        XCTAssertNotNil(rows[0].deletedAt,
            "a serverId-keyed delete must reach the own optimistic row")
    }

    func test_appendReaction_resolvesByServerId_forOwnOptimisticRow() async throws {
        let cid = "cid_ffffffffffffffffffffffffffffffff"
        let serverId = "srv_react_target_1"
        var record = MessageRecordFactory.make(localId: cid, conversationId: "conv_react")
        record.serverId = serverId
        try await actor.insertOptimistic(record)

        try await actor.appendReaction(
            localId: serverId, reactionId: "r1",
            messageId: serverId, participantId: "peer_1", emoji: "❤️"
        )

        let rows = try actor.messages(for: "conv_react", limit: 10)
        XCTAssertEqual(rows.count, 1)
        let json = try XCTUnwrap(rows[0].reactionsJson,
            "a serverId-keyed reaction must reach the own optimistic row")
        let reactions = try JSONDecoder().decode([MeeshyReaction].self, from: json)
        XCTAssertEqual(reactions.first?.emoji, "❤️")
    }

    /// An own E2EE message: the optimistic row holds the plaintext we typed.
    /// The server echo carries only ciphertext we cannot decrypt (no E2EE
    /// session with ourselves) — the upsert must keep the local plaintext.
    func test_upsertFromAPIMessages_keepsOwnPlaintextWhenServerSaysEncrypted() async throws {
        let cid = "cid_77777777777777777777777777777777"
        var optimistic = MessageRecordFactory.make(localId: cid, conversationId: "conv_e2ee")
        optimistic.content = "salut en clair"
        optimistic.isEncrypted = false
        try await actor.insertOptimistic(optimistic)

        let echo = makeAPIMessage(
            id: "srv_e2ee_own_1", conversationId: "conv_e2ee",
            content: "Y2lwaGVydGV4dA==", clientMessageId: cid, isEncrypted: true
        )
        try await actor.upsertFromAPIMessages([echo])

        let rows = try actor.messages(for: "conv_e2ee", limit: 10)
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows[0].content, "salut en clair",
            "an own E2EE message's local plaintext must NOT be clobbered by the server ciphertext")
        XCTAssertFalse(rows[0].isEncrypted,
            "isEncrypted must stay false so the display shows the plaintext directly")
    }

    /// Regression: a genuinely received encrypted message (its row already
    /// `isEncrypted == true`) is still updated normally on re-upsert — the
    /// keep-plaintext guard only triggers when the local row holds readable
    /// content (`isEncrypted == false`).
    func test_upsertFromAPIMessages_receivedEncrypted_stillUpdatesOnReupsert() async throws {
        let serverId = "srv_recv_enc_1"
        let first = makeAPIMessage(
            id: serverId, conversationId: "conv_recv_enc",
            content: "Y2lwaGVyMQ==", isEncrypted: true
        )
        try await actor.upsertFromAPIMessages([first])

        let second = makeAPIMessage(
            id: serverId, conversationId: "conv_recv_enc",
            content: "Y2lwaGVyMg==", isEncrypted: true
        )
        try await actor.upsertFromAPIMessages([second])

        let rows = try actor.messages(for: "conv_recv_enc", limit: 10)
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows[0].content, "Y2lwaGVyMg==",
            "a received encrypted row must still take server updates")
        XCTAssertTrue(rows[0].isEncrypted)
    }

    // MARK: - No-op upsert (anti re-render cascade)

    /// The same payload routinely reaches the upsert several times (socket
    /// handler + global SyncEngine persistor + REST refresh). A pass that
    /// changes NOTHING must write nothing and post NO refresh — every no-op
    /// pass used to bump `changeVersion`/`updatedAt`, which defeated
    /// MessageStore's `newRecords != messages` skip and triggered a full
    /// applySnapshot reconfiguring every visible cell (main-thread jank
    /// felt while typing).
    func test_upsertFromAPIMessages_identicalEcho_doesNotDirtyRowNorPostRefresh() async throws {
        let conv = "conv_noop_echo"
        let msg = makeAPIMessage(id: "m_noop_echo", conversationId: conv)
        try await actor.upsertFromAPIMessages([msg])
        let afterFirst = try actor.messages(for: conv, limit: 10)[0]

        // Drain the first upsert's (legitimate) refresh, which is dispatched
        // async onto the main queue, before arming the inverted observer.
        await drainMainQueueNotifications()

        let noRefresh = expectation(description: "no refresh for a no-op upsert")
        noRefresh.isInverted = true
        let observer = NotificationCenter.default.addObserver(
            forName: .messageStoreShouldRefresh, object: nil, queue: .main
        ) { notif in
            guard let cid = notif.userInfo?["conversationId"] as? String,
                  cid == conv else { return }
            noRefresh.fulfill()
        }
        defer { NotificationCenter.default.removeObserver(observer) }

        try await actor.upsertFromAPIMessages([msg])

        await fulfillment(of: [noRefresh], timeout: 0.3)
        let afterSecond = try actor.messages(for: conv, limit: 10)[0]
        XCTAssertEqual(afterSecond.changeVersion, afterFirst.changeVersion,
            "an identical echo must not dirty the row (changeVersion bump)")
        XCTAssertEqual(afterSecond.updatedAt, afterFirst.updatedAt,
            "an identical echo must not re-stamp updatedAt")
    }

    /// Counterpart: a payload that DOES change the row still writes and
    /// posts the scoped refresh.
    func test_upsertFromAPIMessages_changedContent_bumpsVersionAndPostsRefresh() async throws {
        let conv = "conv_real_change"
        try await actor.upsertFromAPIMessages(
            [makeAPIMessage(id: "m_change", conversationId: conv, content: "v1")]
        )
        let afterFirst = try actor.messages(for: conv, limit: 10)[0]
        await drainMainQueueNotifications()

        let refreshed = expectation(description: "refresh fires for a real change")
        refreshed.assertForOverFulfill = false
        let observer = NotificationCenter.default.addObserver(
            forName: .messageStoreShouldRefresh, object: nil, queue: .main
        ) { notif in
            guard let cid = notif.userInfo?["conversationId"] as? String,
                  cid == conv else { return }
            refreshed.fulfill()
        }
        defer { NotificationCenter.default.removeObserver(observer) }

        try await actor.upsertFromAPIMessages(
            [makeAPIMessage(id: "m_change", conversationId: conv, content: "v2")]
        )

        await fulfillment(of: [refreshed], timeout: 1.0)
        let afterSecond = try actor.messages(for: conv, limit: 10)[0]
        XCTAssertEqual(afterSecond.content, "v2")
        XCTAssertGreaterThan(afterSecond.changeVersion, afterFirst.changeVersion)
    }

    // MARK: - Story-reply citation (A.2)

    /// A.2 — un message qui répond à une story (payload serveur enrichi
    /// `storyReplyTo`) est ingéré avec un `ReplyReference` riche dans `replyToJson`.
    func test_upsertFromAPIMessages_storyReplyTo_buildsRichReplyReference() async throws {
        let json = """
        {
          "id": "srv_sr_1", "conversationId": "conv_sr", "senderId": "sender_1",
          "content": "réponse", "createdAt": "2026-05-19T10:00:00Z",
          "updatedAt": "2026-05-19T10:00:00Z", "storyReplyToId": "story_42",
          "storyReplyTo": {
            "id": "story_42", "reactionCount": 12, "commentCount": 3,
            "createdAt": "2026-05-18T08:00:00.000Z",
            "thumbnailUrl": "https://cdn.example/s42.jpg", "previewText": "Ma story"
          }
        }
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let apiMsg = try decoder.decode(APIMessage.self, from: Data(json.utf8))

        try await actor.upsertFromAPIMessages([apiMsg])

        let rows = try actor.messages(for: "conv_sr", limit: 10)
        let replyJson = try XCTUnwrap(rows[0].replyToJson,
            "un message répondant à une story doit porter un ReplyReference riche")
        let ref = try JSONDecoder().decode(ReplyReference.self, from: replyJson)
        XCTAssertTrue(ref.isStoryReply)
        XCTAssertEqual(ref.storyReactionCount, 12)
        XCTAssertEqual(ref.storyCommentCount, 3)
        XCTAssertEqual(ref.storyThumbnailUrl, "https://cdn.example/s42.jpg")
    }

    /// A.2 — un refresh serveur sans `replyTo` ni `storyReplyTo` ne doit PAS
    /// écraser un `ReplyReference` riche déjà persisté (filet de sécurité —
    /// couvre la phase optimiste avant le 1er refresh enrichi).
    func test_upsertFromAPIMessages_preservesRichReplyWhenServerCarriesNothing() async throws {
        let storyReply = ReplyReference(
            messageId: "story_42", authorName: "Andre", previewText: "Ma story",
            isMe: false, isStoryReply: true,
            storyPublishedAt: Date(timeIntervalSince1970: 1_700_000_000),
            storyReactionCount: 7, storyCommentCount: 1,
            storyThumbnailUrl: "https://cdn.example/s42.jpg"
        )
        var record = MessageRecordFactory.make(localId: "srv_sr_2", conversationId: "conv_sr2")
        record.replyToJson = try JSONEncoder().encode(storyReply)
        try await actor.insertOptimistic(record)

        let apiMsg = makeAPIMessage(id: "srv_sr_2", conversationId: "conv_sr2", content: "réponse")
        try await actor.upsertFromAPIMessages([apiMsg])

        let rows = try actor.messages(for: "conv_sr2", limit: 10)
        let replyJson = try XCTUnwrap(rows[0].replyToJson,
            "le ReplyReference riche local doit survivre à un refresh serveur vide")
        let ref = try JSONDecoder().decode(ReplyReference.self, from: replyJson)
        XCTAssertTrue(ref.isStoryReply)
        XCTAssertEqual(ref.storyReactionCount, 7)
    }

    /// Le JUMEAU CACHE de `MessageModels.uiReplyTo` doit graver le MEME avatar
    /// d'auteur cite. C'est lui qui alimente TOUT rechargement : sans le champ
    /// ici, la citation perdait son avatar des le premier retour de cache, et
    /// l'ecart ne se voyait qu'apres un scroll.
    func test_upsertFromAPIMessages_cachedReplyReference_carriesTheQuotedAuthorAvatar() async throws {
        let json = """
        {
          "id": "srv_av_1", "conversationId": "conv_av", "senderId": "sender_1",
          "content": "ma reponse", "createdAt": "2026-08-24T10:00:00Z",
          "replyTo": {
            "id": "m9", "content": "Salut", "senderId": "u1",
            "sender": { "id": "u1", "displayName": "Bob",
                        "avatar": "https://cdn.example/bob.jpg" }
          }
        }
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let apiMsg = try decoder.decode(APIMessage.self, from: Data(json.utf8))

        try await actor.upsertFromAPIMessages([apiMsg])

        let rows = try actor.messages(for: "conv_av", limit: 10)
        let replyJson = try XCTUnwrap(rows[0].replyToJson)
        let ref = try JSONDecoder().decode(ReplyReference.self, from: replyJson)
        XCTAssertEqual(ref.authorAvatarUrl, "https://cdn.example/bob.jpg",
            "Le chemin CACHE doit porter le meme avatar que le chemin reseau.")
    }

    // MARK: - applyAttachmentEnrichment (write-through of async attachment metadata)

    /// Regression for "audio bubble loses its transcription after a
    /// background refresh": `applyAttachmentUpdate` used to inject
    /// enrichment ONLY into in-memory ViewModel dictionaries, never
    /// writing through to GRDB. A later `hydrateMetadataFromGRDB()`
    /// would then re-read the un-enriched attachment and wipe the
    /// transcription.
    ///
    /// Contract: `applyAttachmentEnrichment(messageId:attachmentId:transcription:translations:)`
    /// patches ONLY the targeted attachment's `transcription` and
    /// `audioTranslations` fields in `attachmentsJson` (other attachments
    /// and every other field of the targeted attachment preserved verbatim).
    func test_applyAttachmentEnrichment_patchesOnlyTargetAttachmentBlobs() async throws {
        var record = MessageRecordFactory.make(localId: "msg_audio", conversationId: "conv_audio")
        // Two attachments — only "att_1" should be patched.
        let initialAttachments: [MeeshyMessageAttachment] = [
            MeeshyMessageAttachment(
                id: "att_1",
                fileName: "a1.m4a",
                originalName: "a1.m4a",
                mimeType: "audio/mp4",
                fileSize: 12_345,
                fileUrl: "https://cdn/a1.m4a",
                uploadedBy: "user-x"
            ),
            MeeshyMessageAttachment(
                id: "att_2",
                fileName: "i2.jpg",
                originalName: "i2.jpg",
                mimeType: "image/jpeg",
                fileSize: 99_999,
                fileUrl: "https://cdn/i2.jpg",
                uploadedBy: "user-x"
            )
        ]
        record.attachmentsJson = try JSONEncoder().encode(initialAttachments)
        try await actor.insertOptimistic(record)

        let transcription = APIAttachmentTranscription(
            text: "Bonjour le monde",
            transcribedText: "Bonjour le monde",
            language: "fr",
            confidence: 0.92,
            durationMs: 4_200,
            segments: nil,
            speakerCount: 1
        )
        let translations: [String: APIAttachmentTranslation] = [
            "en": APIAttachmentTranslation(
                type: "audio",
                transcription: "Hello world",
                url: "https://cdn/a1_en.m4a",
                durationMs: 4_500,
                format: "mp3",
                cloned: false,
                quality: 0.9,
                voiceModelId: nil,
                ttsModel: "xtts",
                segments: nil
            )
        ]

        try await actor.applyAttachmentEnrichment(
            messageId: "msg_audio",
            attachmentId: "att_1",
            transcription: transcription,
            translations: translations
        )

        let rows = try actor.messages(for: "conv_audio", limit: 10)
        XCTAssertEqual(rows.count, 1)
        let updatedJson = try XCTUnwrap(rows[0].attachmentsJson)
        let updated = try JSONDecoder().decode([MeeshyMessageAttachment].self, from: updatedJson)
        XCTAssertEqual(updated.count, 2, "attachment list size preserved")

        // att_1 patched: transcription + audioTranslations populated, other fields verbatim.
        let att1 = try XCTUnwrap(updated.first { $0.id == "att_1" })
        XCTAssertEqual(att1.fileSize, 12_345, "other att_1 fields untouched")
        XCTAssertEqual(att1.fileUrl, "https://cdn/a1.m4a")
        let embedded = try XCTUnwrap(att1.transcription,
                                     "transcription must be populated after enrichment")
        XCTAssertEqual(embedded.language, "fr")
        XCTAssertEqual(embedded.text, "Bonjour le monde")
        let audioTr = try XCTUnwrap(att1.audioTranslations,
                                    "audioTranslations must be populated after enrichment")
        let en = try XCTUnwrap(audioTr["en"])
        XCTAssertEqual(en.url, "https://cdn/a1_en.m4a")

        // att_2 untouched — never had a transcription, must still not.
        let att2 = try XCTUnwrap(updated.first { $0.id == "att_2" })
        XCTAssertEqual(att2.fileSize, 99_999)
        XCTAssertNil(att2.transcription,
                     "att_2 transcription must remain nil — enrichment targets att_1 only")
        XCTAssertNil(att2.audioTranslations)
    }

    // MARK: - T7 — reaction ownership (current user's userId, not author participantId)

    /// Pure helper: only the FIRST row of an emoji the current user reacted
    /// with is tagged with `currentUserId`; every other synthetic row (further
    /// counts of the same emoji, and emojis the user didn't react with) carries
    /// no ownership.
    func test_reconstructFromSummary_tagsOnlyCurrentUserFirstRow() {
        let reactions = MeeshyReaction.reconstructFromSummary(
            messageId: "m1",
            reactionSummary: ["👍": 3, "❤️": 1],
            currentUserReactions: ["👍"],
            currentUserId: "me"
        )

        XCTAssertEqual(reactions.count, 4)
        let owned = reactions.filter { $0.participantId == "me" }
        XCTAssertEqual(owned.count, 1, "only the first 👍 row is owned by the current user")
        XCTAssertEqual(owned.first?.emoji, "👍")
        XCTAssertTrue(
            reactions.filter { $0.emoji == "❤️" }.allSatisfy { $0.participantId == nil },
            "an emoji the user didn't react with carries no ownership"
        )
        XCTAssertEqual(
            reactions.filter { $0.emoji == "👍" && $0.participantId == nil }.count, 2,
            "the 2nd and 3rd 👍 rows are other reactors — no ownership"
        )
    }

    /// Regression for the local-first bug: during REST ingestion the current
    /// user's own reaction must be tagged with their userId, NOT the message
    /// author's participantId (`api.senderId`). Otherwise the
    /// `participantId == currentUserId` ownership check fails after a cache
    /// reload and the "I reacted" highlight disappears.
    func test_upsertFromAPIMessages_tagsCurrentUserReactionWithUserId_notAuthorParticipantId() async throws {
        let scopedActor = MessagePersistenceActor(dbWriter: dbQueue, currentUserId: "me_user_id")
        let apiMsg = makeAPIMessage(
            id: "srv_react_t7",
            conversationId: "conv_t7",
            senderId: "author_participant_id",
            reactionSummary: ["👍": 2],
            currentUserReactions: ["👍"]
        )

        try await scopedActor.upsertFromAPIMessages([apiMsg])

        let rows = try scopedActor.messages(for: "conv_t7", limit: 10)
        let json = try XCTUnwrap(rows.first?.reactionsJson,
            "ingested reactions must be persisted to reactionsJson")
        let reactions = try JSONDecoder().decode([MeeshyReaction].self, from: json)
        let owned = reactions.filter { $0.participantId != nil }
        XCTAssertEqual(owned.count, 1, "exactly the current user's first 👍 row carries ownership")
        XCTAssertEqual(owned.first?.participantId, "me_user_id",
            "current user's reaction must be tagged with their userId")
        XCTAssertNotEqual(owned.first?.participantId, "author_participant_id",
            "must NOT reuse the message author's participantId for the current user's reaction")
    }

    // MARK: - T13 — don't clobber a locally-mutated reaction with a stale REST snapshot

    /// While a reaction toggle is still pending in the outbox, a REST refresh
    /// that doesn't yet carry the (un-synced) reaction must NOT overwrite the
    /// optimistic local reactionsJson — otherwise the reaction visibly reverts.
    func test_upsertFromAPIMessages_preservesLocalReactions_whenReactionPendingInOutbox() async throws {
        let conv = "c_t13"
        let msgId = "m_t13"
        try await actor.upsertFromAPIMessages([makeAPIMessage(id: msgId, conversationId: conv)])
        try await actor.appendReaction(localId: msgId, reactionId: "r1", messageId: msgId, participantId: "me", emoji: "👍")

        // A reaction add for this message is still pending in the outbox.
        let payload = try JSONEncoder().encode(ReactionOutboxPayload(
            messageId: msgId, emoji: "👍", action: .add, conversationId: conv, clientMessageId: "cid_r1"))
        let now = Date()
        try await dbQueue.write { db in
            try OutboxRecord(
                id: "ofqr_t13", kind: .sendReaction, conversationId: conv,
                clientMessageId: "cid_r1", payload: payload, status: .pending,
                attempts: 0, lastError: nil, createdAt: now, updatedAt: now, nextAttemptAt: now
            ).insert(db)
        }

        // REST refresh arrives WITHOUT the not-yet-synced reaction.
        try await actor.upsertFromAPIMessages([makeAPIMessage(id: msgId, conversationId: conv)])

        let rows = try actor.messages(for: conv, limit: 10)
        let json = try XCTUnwrap(rows.first?.reactionsJson, "local reaction must be preserved while pending")
        let reactions = try JSONDecoder().decode([MeeshyReaction].self, from: json)
        XCTAssertEqual(reactions.map(\.emoji), ["👍"],
            "an optimistic reaction pending in the outbox must survive a stale REST snapshot")
    }

    /// With NO pending reaction mutation, the server snapshot is authoritative —
    /// a refresh that drops a reaction must clobber the local copy (normal SWR).
    func test_upsertFromAPIMessages_takesServerReactions_whenNothingPending() async throws {
        let conv = "c_t13b"
        let msgId = "m_t13b"
        try await actor.upsertFromAPIMessages([makeAPIMessage(id: msgId, conversationId: conv)])
        try await actor.appendReaction(localId: msgId, reactionId: "r1", messageId: msgId, participantId: "me", emoji: "👍")

        try await actor.upsertFromAPIMessages([makeAPIMessage(id: msgId, conversationId: conv)])

        let rows = try actor.messages(for: conv, limit: 10)
        let reactions = (rows.first?.reactionsJson).flatMap { try? JSONDecoder().decode([MeeshyReaction].self, from: $0) } ?? []
        XCTAssertTrue(reactions.isEmpty,
            "with no pending mutation the server (empty) reaction state must win")
    }

    // MARK: - S2 — preserve optimistic edit/delete while pending in outbox

    func test_upsertFromAPIMessages_preservesOptimisticEdit_whenEditPendingInOutbox() async throws {
        let conv = "c_s2e"
        let msgId = "m_s2e"
        // Server message exists locally with its original content.
        try await actor.upsertFromAPIMessages([makeAPIMessage(id: msgId, conversationId: conv, content: "original")])
        // User edits it offline → optimistic local content + a pending editMessage outbox row.
        try await actor.markEdited(localId: msgId, newContent: "edited offline", editedAt: Date())
        let payload = try JSONEncoder().encode(OfflineEditPayload(
            messageId: msgId, clientMessageId: "cid_e1", content: "edited offline", conversationId: conv))
        let now = Date()
        try await dbQueue.write { db in
            try OutboxRecord(
                id: "ofqr_s2e", kind: .editMessage, conversationId: conv,
                clientMessageId: "cid_e1", payload: payload, status: .pending,
                attempts: 0, lastError: nil, createdAt: now, updatedAt: now, nextAttemptAt: now
            ).insert(db)
        }
        // Stale REST refresh arrives with the PRE-edit content.
        try await actor.upsertFromAPIMessages([makeAPIMessage(id: msgId, conversationId: conv, content: "original")])

        let rows = try actor.messages(for: conv, limit: 10)
        XCTAssertEqual(rows.first?.content, "edited offline",
            "an optimistic edit pending in the outbox must survive a stale REST snapshot")
        XCTAssertEqual(rows.first?.isEdited, true,
            "isEdited must stay true while the edit is pending")
    }

    func test_upsertFromAPIMessages_preservesOptimisticDelete_whenDeletePendingInOutbox() async throws {
        let conv = "c_s2d"
        let msgId = "m_s2d"
        try await actor.upsertFromAPIMessages([makeAPIMessage(id: msgId, conversationId: conv)])
        try await actor.markDeleted(localId: msgId, deletedAt: Date())
        let payload = try JSONEncoder().encode(OfflineDeletePayload(
            messageId: msgId, clientMessageId: "cid_d1", conversationId: conv))
        let now = Date()
        try await dbQueue.write { db in
            try OutboxRecord(
                id: "ofqr_s2d", kind: .deleteMessage, conversationId: conv,
                clientMessageId: "cid_d1", payload: payload, status: .pending,
                attempts: 0, lastError: nil, createdAt: now, updatedAt: now, nextAttemptAt: now
            ).insert(db)
        }
        // Stale REST refresh arrives with the message NOT deleted (deletedAt nil).
        try await actor.upsertFromAPIMessages([makeAPIMessage(id: msgId, conversationId: conv)])

        let rows = try actor.messages(for: conv, limit: 10)
        XCTAssertNotNil(rows.first?.deletedAt,
            "an optimistic delete pending in the outbox must survive a stale REST snapshot")
    }

    /// Scoping guard: with NO pending edit mutation the server snapshot is
    /// authoritative — a refresh must clobber a stale local content (normal SWR).
    func test_upsertFromAPIMessages_takesServerContent_whenNoEditPending() async throws {
        let conv = "c_s2n"
        let msgId = "m_s2n"
        try await actor.upsertFromAPIMessages([makeAPIMessage(id: msgId, conversationId: conv, content: "original")])
        try await actor.markEdited(localId: msgId, newContent: "local edit", editedAt: Date())
        // No outbox row → not pending → server is authoritative.
        try await actor.upsertFromAPIMessages([makeAPIMessage(id: msgId, conversationId: conv, content: "server version")])

        let rows = try actor.messages(for: conv, limit: 10)
        XCTAssertEqual(rows.first?.content, "server version",
            "with no pending edit the server snapshot must win")
    }

    // MARK: - T14 — GC of stale exhausted outbox rows

    /// `.exhausted` rows older than the retention window are reclaimed so the
    /// outbox can't grow without bound; recent exhausted (still retriable) and
    /// non-terminal rows survive.
    func test_purgeExhaustedOlderThan_deletesOldExhausted_keepsRecentAndNonTerminal() async throws {
        let now = Date()
        let old = now.addingTimeInterval(-10 * 86_400)   // 10 days ago
        let recent = now.addingTimeInterval(-1 * 86_400) // 1 day ago
        try await dbQueue.write { db in
            try OutboxRecord(id: "ex_old", kind: .blockUser, conversationId: "c", clientMessageId: "c1",
                             payload: Data(), status: .exhausted, attempts: 5, lastError: "x",
                             createdAt: old, updatedAt: old, nextAttemptAt: old).insert(db)
            try OutboxRecord(id: "ex_recent", kind: .blockUser, conversationId: "c", clientMessageId: "c2",
                             payload: Data(), status: .exhausted, attempts: 5, lastError: "x",
                             createdAt: recent, updatedAt: recent, nextAttemptAt: recent).insert(db)
            try OutboxRecord(id: "pend_old", kind: .blockUser, conversationId: "c", clientMessageId: "c3",
                             payload: Data(), status: .pending, attempts: 0, lastError: nil,
                             createdAt: old, updatedAt: old, nextAttemptAt: old).insert(db)
        }

        let deleted = try await actor.purgeExhaustedOlderThan(days: 7)

        XCTAssertEqual(deleted, 1, "only the old exhausted row is reclaimed")
        let remaining = try await dbQueue.read { db in try OutboxRecord.fetchAll(db).map(\.id).sorted() }
        XCTAssertEqual(remaining, ["ex_recent", "pend_old"],
            "recent exhausted (still retriable) + old non-terminal rows must survive")
    }

    /// #4044 — **la purge ne connaît AUCUN kind, et c'est ce qu'il faut prouver.**
    ///
    /// Le témoin voisin n'exerce que `.blockUser` : il resterait vert si
    /// quelqu'un ajoutait un jour une liste blanche de kinds à
    /// `purgeExhaustedOlderThan`, et les lignes laissées dehors
    /// s'accumuleraient sans que rien ne rougisse. C'est exactement le
    /// scénario relevé sur appareil réel — 19 lignes `markStoryViewed`
    /// épuisées sur un 500 permanent, qui alimentaient le bruit de la
    /// pastille de synchro.
    ///
    /// Le kind du terrain est donc nommé ICI, aux côtés de deux autres, pour
    /// que la propriété testée soit « la purge est AVEUGLE au kind » et non
    /// « la purge traite ce kind-là ».
    func test_purgeExhaustedOlderThan_isKindAgnostic_reclaimsMarkStoryViewedToo() async throws {
        let old = Date().addingTimeInterval(-10 * 86_400)
        let kinds: [OutboxKind] = [.markStoryViewed, .markAsRead, .blockUser]
        try await dbQueue.write { db in
            for (i, kind) in kinds.enumerated() {
                try OutboxRecord(id: "ex_\(kind.rawValue)", kind: kind, conversationId: "c",
                                 clientMessageId: "c\(i)", payload: Data(), status: .exhausted,
                                 attempts: 5, lastError: "server(statusCode: 500)",
                                 createdAt: old, updatedAt: old, nextAttemptAt: old).insert(db)
            }
        }

        let deleted = try await actor.purgeExhaustedOlderThan(days: 7)

        XCTAssertEqual(deleted, kinds.count,
            "la purge doit reclaimer toute ligne terminale périmée, quel que soit son kind")
        let remaining = try await dbQueue.read { db in try OutboxRecord.fetchAll(db).count }
        XCTAssertEqual(remaining, 0, "aucune ligne épuisée périmée ne doit survivre à la purge")
    }

    // MARK: - appendReaction authoritative cap (own-reaction echo double-count)

    private func reactions(in conv: String) throws -> [MeeshyReaction] {
        let rows = try actor.messages(for: conv, limit: 10)
        return (rows.first?.reactionsJson)
            .flatMap { try? JSONDecoder().decode([MeeshyReaction].self, from: $0) } ?? []
    }

    /// The exact bug: a fresh tap writes the optimistic row keyed by the
    /// `currentUserId` sentinel, then the server echoes the SAME reaction keyed
    /// by the resolved `Participant.id`. Without the cap the two distinct keys
    /// both persist → the pill renders "2". With `maxCount: 1` the echo is
    /// dropped, leaving exactly one row — still keyed by `currentUserId`, so the
    /// "I reacted" highlight stays correct.
    func test_appendReaction_cap_dropsOwnEcho_noDoubleCount() async throws {
        let conv = "c_capdup"
        let msgId = "m_capdup"
        try await actor.upsertFromAPIMessages([makeAPIMessage(id: msgId, conversationId: conv)])

        try await actor.appendReaction(localId: msgId, reactionId: "r_opt",
            messageId: msgId, participantId: "me", emoji: "👍")
        try await actor.appendReaction(localId: msgId, reactionId: "r_echo",
            messageId: msgId, participantId: "participant_42", emoji: "👍",
            maxCount: 1)

        let rows = try reactions(in: conv)
        XCTAssertEqual(rows.count, 1, "the own-reaction echo must not double-count")
        XCTAssertEqual(rows.first?.participantId, "me",
            "the surviving row keeps the currentUserId sentinel so ownership stays correct")
    }

    // MARK: - appendReaction/removeReaction ownerUserId (identité stable User.id)

    /// Le trou du cap heuristique : un AUTRE utilisateur pose le même emoji côté
    /// serveur avant que mon écho n'arrive → `aggregation.count` monte à 2, mais
    /// localement seule ma ligne optimiste existe (1 < 2) → le cap laissait
    /// passer l'écho de MA propre réaction, qui s'empilait en doublon. Le
    /// `ownerUserId` (User.id porté par l'écho) matche la ligne optimiste keyée
    /// par la sentinelle `currentUserId`, indépendamment du cap.
    func test_appendReaction_ownerUserId_dropsOwnEcho_whenCapRaisedByConcurrentReactor() async throws {
        let conv = "c_owner1"
        let msgId = "m_owner1"
        try await actor.upsertFromAPIMessages([makeAPIMessage(id: msgId, conversationId: conv)])

        try await actor.appendReaction(localId: msgId, reactionId: "r_opt",
            messageId: msgId, participantId: "user_me", emoji: "👍")
        // Écho de MA réaction, cap déjà monté à 2 par un réacteur concurrent.
        try await actor.appendReaction(localId: msgId, reactionId: "r_echo",
            messageId: msgId, participantId: "participant_42", emoji: "👍",
            maxCount: 2, ownerUserId: "user_me")

        let rows = try reactions(in: conv)
        XCTAssertEqual(rows.count, 1, "l'écho de ma propre réaction ne doit jamais doubler, même sous cap élevé")
        XCTAssertEqual(rows.first?.participantId, "user_me")

        // L'écho du réacteur concurrent, lui, doit atterrir.
        try await actor.appendReaction(localId: msgId, reactionId: "r_other",
            messageId: msgId, participantId: "participant_99", emoji: "👍",
            maxCount: 2, ownerUserId: "user_other")
        XCTAssertEqual(try reactions(in: conv).count, 2)
    }

    /// Sans aggregation (maxCount nil), le `ownerUserId` suffit à dédupliquer
    /// l'écho propre — l'ancien code n'avait alors AUCUN rempart.
    func test_appendReaction_ownerUserId_dropsOwnEcho_withoutAggregation() async throws {
        let conv = "c_owner2"
        let msgId = "m_owner2"
        try await actor.upsertFromAPIMessages([makeAPIMessage(id: msgId, conversationId: conv)])

        try await actor.appendReaction(localId: msgId, reactionId: "r_opt",
            messageId: msgId, participantId: "user_me", emoji: "🎉")
        try await actor.appendReaction(localId: msgId, reactionId: "r_echo",
            messageId: msgId, participantId: "participant_42", emoji: "🎉",
            maxCount: nil, ownerUserId: "user_me")

        XCTAssertEqual(try reactions(in: conv).count, 1)
    }

    /// L'écho de suppression (keyé Participant.id) doit aussi effacer la ligne
    /// optimiste keyée User.id — sinon un doublon historique devenait collant.
    func test_removeReaction_ownerUserId_removesOptimisticRow() async throws {
        let conv = "c_owner3"
        let msgId = "m_owner3"
        try await actor.upsertFromAPIMessages([makeAPIMessage(id: msgId, conversationId: conv)])

        try await actor.appendReaction(localId: msgId, reactionId: "r_opt",
            messageId: msgId, participantId: "user_me", emoji: "👍")
        try await actor.removeReaction(localId: msgId, emoji: "👍",
            participantId: "participant_42", ownerUserId: "user_me")

        XCTAssertEqual(try reactions(in: conv).count, 0,
            "la suppression échoée efface la ligne optimiste malgré la clé divergente")
    }

    /// The cap rises with each genuine new reactor: another user's reaction
    /// (count now 2 server-side) must still land.
    func test_appendReaction_cap_belowAuthoritative_appendsOtherUser() async throws {
        let conv = "c_capother"
        let msgId = "m_capother"
        try await actor.upsertFromAPIMessages([makeAPIMessage(id: msgId, conversationId: conv)])

        try await actor.appendReaction(localId: msgId, reactionId: "r_me",
            messageId: msgId, participantId: "me", emoji: "👍")
        try await actor.appendReaction(localId: msgId, reactionId: "r_other",
            messageId: msgId, participantId: "participant_99", emoji: "👍",
            maxCount: 2)

        let rows = try reactions(in: conv)
        XCTAssertEqual(rows.count, 2, "a second distinct reactor is below the cap and must append")
        XCTAssertEqual(Set(rows.map(\.participantId)), ["me", "participant_99"])
    }

    /// Regression guard: the default (`maxCount: nil`) keeps the legacy unbounded
    /// behaviour for the optimistic / rollback write paths.
    func test_appendReaction_noCap_appendsUnbounded() async throws {
        let conv = "c_capnil"
        let msgId = "m_capnil"
        try await actor.upsertFromAPIMessages([makeAPIMessage(id: msgId, conversationId: conv)])

        try await actor.appendReaction(localId: msgId, reactionId: "r_a",
            messageId: msgId, participantId: "pa", emoji: "👍")
        try await actor.appendReaction(localId: msgId, reactionId: "r_b",
            messageId: msgId, participantId: "pb", emoji: "👍")

        XCTAssertEqual(try reactions(in: conv).count, 2,
            "without a cap two distinct participants both persist (legacy behaviour)")
    }

    /// The cap is scoped per emoji: a cap on 👍 must not block a 🎉 echo.
    func test_appendReaction_cap_isPerEmoji() async throws {
        let conv = "c_capemoji"
        let msgId = "m_capemoji"
        try await actor.upsertFromAPIMessages([makeAPIMessage(id: msgId, conversationId: conv)])

        try await actor.appendReaction(localId: msgId, reactionId: "r_thumb",
            messageId: msgId, participantId: "me", emoji: "👍")
        try await actor.appendReaction(localId: msgId, reactionId: "r_party",
            messageId: msgId, participantId: "participant_7", emoji: "🎉",
            maxCount: 1)

        let rows = try reactions(in: conv)
        XCTAssertEqual(Set(rows.map(\.emoji)), ["👍", "🎉"],
            "a 👍 cap of 1 must not suppress a distinct 🎉 reaction")
    }

    // MARK: - Failed-from-outbox reconciliation (grdb-04 changeVersion bump)

    func test_reconcileFailedFromOutbox_flipsState_bumpsChangeVersion() async throws {
        let record = MessageRecordFactory.make(
            localId: "stuck_bump_1", conversationId: "conv_stuck_bump", state: .sending, changeVersion: 3
        )
        try await actor.insertOptimistic(record)
        try await dbQueue.write { db in
            try OutboxRecord(
                kind: .sendMessage,
                conversationId: "conv_stuck_bump",
                messageLocalId: "stuck_bump_1",
                clientMessageId: "stuck_bump_1",
                payload: Data(),
                status: .exhausted
            ).insert(db)
        }

        await actor.reconcileFailedFromOutbox(conversationId: "conv_stuck_bump")

        let fetched = try actor.messages(for: "conv_stuck_bump", limit: 10)
        XCTAssertEqual(fetched[0].state, .failed)
        XCTAssertEqual(fetched[0].changeVersion, 4,
            "un flip d'état sans bump changeVersion est invisible au diff O(1) du MessageStore")
    }

    // MARK: - Orphaned sending reconciliation

    /// An optimistic row stuck in `.sending` with no serverId, no live outbox
    /// record, and older than the grace window has no code path left that can
    /// ever transition it — the user saw the clock icon forever on every
    /// conversation re-open. It must flip to `.failed` (manual retry affordance).
    func test_reconcileOrphanedSendingRows_orphanOlderThanGrace_flipsToFailed() async throws {
        let old = Date().addingTimeInterval(-300)
        let record = MessageRecordFactory.make(
            localId: "orphan_1", conversationId: "conv_orphan", state: .sending, createdAt: old
        )
        try await actor.insertOptimistic(record)

        await actor.reconcileOrphanedSendingRows(conversationId: "conv_orphan", olderThan: 120)

        let fetched = try actor.messages(for: "conv_orphan", limit: 10)
        XCTAssertEqual(fetched[0].state, .failed)
    }

    func test_reconcileOrphanedSendingRows_recentRow_isLeftAlone() async throws {
        let record = MessageRecordFactory.make(
            localId: "inflight_1", conversationId: "conv_recent", state: .sending, createdAt: Date()
        )
        try await actor.insertOptimistic(record)

        await actor.reconcileOrphanedSendingRows(conversationId: "conv_recent", olderThan: 120)

        let fetched = try actor.messages(for: "conv_recent", limit: 10)
        XCTAssertEqual(fetched[0].state, .sending,
            "a row within the grace window may still be legitimately in flight")
    }

    func test_reconcileOrphanedSendingRows_rowWithLiveOutbox_isLeftAlone() async throws {
        let old = Date().addingTimeInterval(-300)
        let record = MessageRecordFactory.make(
            localId: "queued_1", conversationId: "conv_outbox", state: .queued, createdAt: old
        )
        try await actor.insertOptimistic(record)
        try await dbQueue.write { db in
            try OutboxRecord(
                kind: .sendMessage,
                conversationId: "conv_outbox",
                messageLocalId: "queued_1",
                clientMessageId: "queued_1",
                payload: Data(),
                status: .pending
            ).insert(db)
        }

        await actor.reconcileOrphanedSendingRows(conversationId: "conv_outbox", olderThan: 120)

        let fetched = try actor.messages(for: "conv_outbox", limit: 10)
        XCTAssertEqual(fetched[0].state, .queued,
            "a live outbox record still owns the retry loop — don't fail its message")
    }

    func test_reconcileOrphanedSendingRows_orphan_bumpsChangeVersion() async throws {
        let old = Date().addingTimeInterval(-300)
        let record = MessageRecordFactory.make(
            localId: "orphan_bump_1", conversationId: "conv_orphan_bump", state: .sending,
            createdAt: old, changeVersion: 5
        )
        try await actor.insertOptimistic(record)

        await actor.reconcileOrphanedSendingRows(conversationId: "conv_orphan_bump", olderThan: 120)

        let fetched = try actor.messages(for: "conv_orphan_bump", limit: 10)
        XCTAssertEqual(fetched[0].state, .failed)
        XCTAssertEqual(fetched[0].changeVersion, 6,
            "le flip orphelin doit être visible du diff O(1)")
    }

    func test_reconcileOrphanedSendingRows_rowWithExhaustedOutbox_flipsToFailed() async throws {
        let old = Date().addingTimeInterval(-300)
        let record = MessageRecordFactory.make(
            localId: "exhausted_1", conversationId: "conv_exhausted", state: .sending, createdAt: old
        )
        try await actor.insertOptimistic(record)
        try await dbQueue.write { db in
            try OutboxRecord(
                kind: .sendMessage,
                conversationId: "conv_exhausted",
                messageLocalId: "exhausted_1",
                clientMessageId: "exhausted_1",
                payload: Data(),
                status: .exhausted
            ).insert(db)
        }

        await actor.reconcileOrphanedSendingRows(conversationId: "conv_exhausted", olderThan: 120)

        let fetched = try actor.messages(for: "conv_exhausted", limit: 10)
        XCTAssertEqual(fetched[0].state, .failed,
            "an exhausted outbox no longer retries — the row is orphaned")
    }
}

/// startup-03 — compteur des lignes outbox éligibles à l'envoi.
extension MessagePersistenceActorTests {

    func test_pendingOutboxCount_countsPendingAndInflightOnly() async throws {
        try await dbQueue.write { db in
            let now = Date()
            for (id, status) in [("o-p", "pending"), ("o-i", "inflight"), ("o-e", "exhausted"), ("o-f", "failed")] {
                try db.execute(
                    sql: "INSERT INTO outbox (id, kind, conversationId, payload, status, createdAt, updatedAt, nextAttemptAt) VALUES (?, 'sendMessage', 'c1', ?, ?, ?, ?, ?)",
                    arguments: [id, Data(), status, now, now, now]
                )
            }
        }

        let count = try await actor.pendingOutboxCount()

        XCTAssertEqual(count, 2, "seuls .pending et .inflight comptent comme travail encore éligible à l'envoi")
    }
}
