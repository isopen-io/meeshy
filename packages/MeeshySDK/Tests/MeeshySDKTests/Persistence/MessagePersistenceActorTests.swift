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

    // MARK: - Edit / Delete

    func test_markEdited_updatesContentAndFlag() async throws {
        let record = MessageRecordFactory.make(localId: "edit_1", content: "Original")
        try await actor.insertOptimistic(record)

        try await actor.markEdited(localId: "edit_1", newContent: "Edited", editedAt: Date())

        let fetched = try actor.messages(for: "conv_default", limit: 10)
        XCTAssertEqual(fetched[0].content, "Edited")
        XCTAssertTrue(fetched[0].isEdited)
    }

    func test_markDeleted_clearsContentAndSetsTimestamp() async throws {
        let record = MessageRecordFactory.make(localId: "del_1", content: "Delete me")
        try await actor.insertOptimistic(record)

        try await actor.markDeleted(localId: "del_1", deletedAt: Date())

        let fetched = try actor.messages(for: "conv_default", limit: 10)
        XCTAssertNil(fetched[0].content)
        XCTAssertNotNil(fetched[0].deletedAt)
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

    func test_updateLayout_postsRefreshWithConversationId() async throws {
        let record = MessageRecordFactory.make(localId: "layout_notif", conversationId: "conv_layout")
        try await actor.insertOptimistic(record)
        await drainMainQueueNotifications()

        let (exp, observer) = observeRefresh(
            conversationId: "conv_layout",
            description: "messageStoreShouldRefresh fires for updateLayout"
        )
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
        let data = try! JSONSerialization.data(withJSONObject: json)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try! decoder.decode(APIMessage.self, from: data)
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
}
