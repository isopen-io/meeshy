import XCTest
import Combine
@testable import Meeshy
import MeeshySDK

@MainActor
private final class Journal {
    var entries: [String] = []
    func add(_ entry: String) { entries.append(entry) }
}

private struct UploadBoom: LocalizedError {
    var errorDescription: String? { "boom" }
}

@MainActor
private final class MockAttachmentSendHost: AttachmentSendHosting {
    let conversationId = "conv_1"
    var messageTranscriptions: [String: MessageTranscription] = [:]
    var messageTranscriptionsByAttachment: [String: MessageTranscription] = [:]
    var sent: [OutgoingMessage] = []
    var rekeyedWhenSending: [Bool] = []
    var acceptsSend: (OutgoingMessage) -> Bool = { _ in true }
    var endToEndPieceRefusal: EndToEndSendRefusal?
    let journal: Journal

    init(journal: Journal) { self.journal = journal }

    func send(_ outgoing: OutgoingMessage) async -> Result<SentMessageReceipt, SendFailure> {
        sent.append(outgoing)
        rekeyedWhenSending.append(messageTranscriptionsByAttachment["srv_voice"] != nil)
        journal.add("send:\(outgoing.reusedClientMessageId?.rawValue ?? "-")")
        guard acceptsSend(outgoing) else { return .failure(.ineligible) }
        return .success(SentMessageReceipt(clientMessageId: outgoing.reusedClientMessageId ?? MessageID("cid_none"), delivery: .queuedOffline))
    }

    func recordSendFailure(tempId: String, error: any Error) async {
        journal.add("recordFailure:\(tempId)")
    }

    func markOptimisticMediaFailed(tempId: String, reason: String) async {
        journal.add("markFailed:\(tempId):\(reason)")
    }
}

@MainActor
private final class MockMediaGroupUploader: MediaGroupUploading {
    var failures: [String: any Error] = [:]
    let journal: Journal

    init(journal: Journal) { self.journal = journal }

    func upload(
        _ send: OutgoingMediaGroup,
        items: [MediaGroupUploadItem],
        currentUserId: String,
        didPromote: @MainActor (String, String) -> Void
    ) async throws -> UploadedMediaGroup {
        journal.add("upload:\(send.tempId)")
        if let failure = failures[send.tempId] { throw failure }
        for item in items { didPromote(item.attachmentId, "srv_\(item.attachmentId)") }
        return UploadedMediaGroup(
            ids: items.map { "srv_\($0.attachmentId)" },
            attachments: items.map { MeeshyMessageAttachment(id: "srv_\($0.attachmentId)", uploadedBy: currentUserId) }
        )
    }
}

@MainActor
private final class MockAttachmentGroupQueue: AttachmentGroupQueueing {
    var offlineResult = true
    var requeueResult = true
    var onEnqueueOffline: () -> Void = {}
    let journal: Journal

    init(journal: Journal) { self.journal = journal }

    func enqueueOffline(_ send: OutgoingMediaGroup, mediaFiles: [String: URL]) async -> Bool {
        journal.add("enqueueOffline:\(send.tempId)")
        onEnqueueOffline()
        return offlineResult
    }

    func requeueAfterOnlineFailure(_ send: OutgoingMediaGroup, mediaFiles: [String: URL]) async -> Bool {
        journal.add("requeue:\(send.tempId)")
        return requeueResult
    }
}

@MainActor
private final class FakeVoiceTranscriber: VoiceNoteLocalTranscribing {
    var known: [String: MessageTranscription] = [:]
    var discarded: [String] = []

    func beginTranscription(attachmentId: String, audioURL: URL, durationMs: Int, languageCode: String) {}
    func transcription(for attachmentId: String) -> MessageTranscription? { known[attachmentId] }
    func awaitTranscription(for attachmentId: String) async -> MessageTranscription? { known[attachmentId] }
    func discard(attachmentId: String) { discarded.append(attachmentId) }
}

@MainActor
private final class SpyFeedback: AttachmentSendFeedbackGiving {
    let journal: Journal
    init(journal: Journal) { self.journal = journal }
    func sendSucceeded() { journal.add("succeeded") }
    func sendFailed() { journal.add("failed") }
    func showError(_ message: String) { journal.add("toast:\(message)") }
}

@MainActor
final class AttachmentSendRunnerTests: XCTestCase {

    private typealias Planned = MultiAttachmentSendPlanner.PlannedMessage

    private struct Fixture {
        let runner: AttachmentSendRunner
        let host: MockAttachmentSendHost
        let uploader: MockMediaGroupUploader
        let queue: MockAttachmentGroupQueue
        let network: FakeNetworkMonitor
        let transcriber: FakeVoiceTranscriber
        let journal: Journal
    }

    private let place = SharedPlace(latitude: 48.85, longitude: 2.35, name: "Paris")
    private let failureToast = "Échec de l'envoi de la pièce jointe"

    private func makeSUT(online: Bool = true, hasSession: Bool = true) -> Fixture {
        let journal = Journal()
        let host = MockAttachmentSendHost(journal: journal)
        let uploader = MockMediaGroupUploader(journal: journal)
        let queue = MockAttachmentGroupQueue(journal: journal)
        let network = FakeNetworkMonitor(isOnline: online)
        let transcriber = FakeVoiceTranscriber()
        let session = AttachmentUploadSession(
            uploader: uploader,
            progress: Empty<UploadQueueProgress, Never>(completeImmediately: false).eraseToAnyPublisher()
        )
        let runner = AttachmentSendRunner(
            host: host,
            callbacks: AttachmentSendCallbacks(
                restorePlace: { _, sent in journal.add("restorePlace:\(sent)") },
                setProgress: { _ in },
                abortUpload: { journal.add("abort") }
            ),
            network: network,
            uploadSession: { _ in hasSession ? session : nil },
            outbox: { _, _ in queue },
            transcriber: transcriber,
            feedback: SpyFeedback(journal: journal)
        )
        return Fixture(runner: runner, host: host, uploader: uploader, queue: queue, network: network, transcriber: transcriber, journal: journal)
    }

    private func attachment(_ id: String, mimeType: String = "image/jpeg") -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(id: id, mimeType: mimeType)
    }

    private func send(
        _ tempId: String, kind: MultiAttachmentSendPlanner.Kind = .visual, attachmentIds: [String],
        carriesReply: Bool = false, text: String? = nil
    ) -> OutgoingMediaGroup {
        let mimeType = kind == .audio ? "audio/mp4" : "image/jpeg"
        let attachments = attachmentIds.map { attachment($0, mimeType: mimeType) }
        return OutgoingMediaGroup(
            group: Planned(kind: kind, attachments: attachments, text: text, carriesReply: carriesReply),
            tempId: tempId, locals: attachments
        )
    }

    private func makeBatch(
        sends: [OutgoingMediaGroup],
        textGroup: Planned? = nil,
        textTempId: String? = nil,
        place: SharedPlace? = nil,
        relation: MessageRelation = .none,
        protection: MessageProtectionIntent = .none
    ) -> AttachmentSendBatch {
        let mediaFiles = Dictionary(
            uniqueKeysWithValues: sends.flatMap(\.group.attachments).map { ($0.id, URL(fileURLWithPath: "/tmp/\($0.id).bin")) }
        )
        return AttachmentSendBatch(
            plan: sends.map(\.group) + (textGroup.map { [$0] } ?? []),
            mediaGroupSends: sends, mediaFiles: mediaFiles, thumbnails: [:],
            textGroup: textGroup, textTempId: textTempId, place: place, relation: relation,
            replyToId: relation.replyToId, protection: protection, language: "fr",
            currentUserId: "me", guestAllowedKinds: [.image]
        )
    }

    func test_run_uploadsGroupsInPlanOrder_andSendsEachWithItsTempId() async {
        let fx = makeSUT()
        let batch = makeBatch(sends: [send("t1", attachmentIds: ["a1", "a2"]), send("t2", attachmentIds: ["b1"])])

        await fx.runner.run(batch)

        XCTAssertEqual(fx.host.sent.map { $0.reusedClientMessageId?.rawValue }, ["t1", "t2"])
        XCTAssertEqual(fx.host.sent.map { $0.attachments.ids }, [["srv_a1", "srv_a2"], ["srv_b1"]])
        XCTAssertEqual(Array(fx.journal.entries.prefix(4)), ["upload:t1", "send:t1", "upload:t2", "send:t2"])
    }

    func test_run_relationTravelsOnlyOnTheGroupThatCarriesTheReply() async {
        let fx = makeSUT()
        let relation = MessageRelation.reply(to: MessageID("m1"), citing: nil)
        let batch = makeBatch(
            sends: [send("t1", attachmentIds: ["a"], carriesReply: true), send("t2", attachmentIds: ["b"])],
            relation: relation
        )

        await fx.runner.run(batch)

        XCTAssertEqual(fx.host.sent.map(\.relation), [relation, .none])
    }

    func test_run_protectionTravelsOnEveryMessage() async {
        let fx = makeSUT()
        let protection = MessageProtectionIntent(isViewOnce: true)
        let text = Planned(kind: .text, attachments: [], text: "Salut", carriesReply: false)
        let batch = makeBatch(
            sends: [send("t1", attachmentIds: ["a"]), send("t2", attachmentIds: ["b"])],
            textGroup: text, textTempId: "cid_text", protection: protection
        )

        await fx.runner.run(batch)

        XCTAssertEqual(fx.host.sent.count, 3)
        XCTAssertTrue(fx.host.sent.allSatisfy { $0.protection == protection })
        XCTAssertTrue(fx.host.sent.allSatisfy { $0.originalLanguage == "fr" })
    }

    func test_run_sendsTextLast_reusingTextTempId_withPlace_thenRestoresPlace() async {
        let fx = makeSUT()
        let text = Planned(kind: .text, attachments: [], text: "Salut", carriesReply: false)
        let batch = makeBatch(sends: [send("t1", attachmentIds: ["a"])], textGroup: text, textTempId: "cid_text", place: place)

        await fx.runner.run(batch)

        XCTAssertEqual(fx.journal.entries.suffix(3), ["send:cid_text", "restorePlace:true", "succeeded"])
        XCTAssertEqual(fx.host.sent.last?.content, "Salut")
        XCTAssertEqual(fx.host.sent.last?.location, place)
        XCTAssertEqual(fx.host.sent.last?.attachments, OutgoingAttachments.none)
    }

    func test_run_textGroupCarryingTheReply_sendsItWithTheRelation() async {
        let fx = makeSUT()
        let relation = MessageRelation.reply(to: MessageID("m1"), citing: nil)
        let text = Planned(kind: .text, attachments: [], text: "Salut", carriesReply: true)
        let batch = makeBatch(sends: [], textGroup: text, textTempId: "cid_text", relation: relation)

        await fx.runner.run(batch)

        XCTAssertEqual(fx.host.sent.map(\.relation), [relation])
    }

    func test_run_placeOnly_sendsEmptyContentWithNoneRelation() async {
        let fx = makeSUT()
        let batch = makeBatch(sends: [send("t1", attachmentIds: ["a"])], textTempId: "cid_place", place: place)

        await fx.runner.run(batch)

        XCTAssertEqual(fx.host.sent.last?.content, "")
        XCTAssertEqual(fx.host.sent.last?.relation, MessageRelation.none)
        XCTAssertEqual(fx.host.sent.last?.reusedClientMessageId?.rawValue, "cid_place")
        XCTAssertEqual(fx.host.sent.last?.location, place)
    }

    func test_run_offline_enqueuesEachGroup_withoutUploading() async {
        let fx = makeSUT(online: false)
        let batch = makeBatch(sends: [send("t1", attachmentIds: ["a"]), send("t2", attachmentIds: ["b"])])

        await fx.runner.run(batch)

        XCTAssertEqual(fx.journal.entries.prefix(2), ["enqueueOffline:t1", "enqueueOffline:t2"])
        XCTAssertFalse(fx.journal.entries.contains { $0.hasPrefix("upload:") })
        XCTAssertTrue(fx.host.sent.isEmpty)
    }

    func test_run_rereadsTheNetworkForEachGroup() async {
        let fx = makeSUT(online: false)
        fx.queue.onEnqueueOffline = { fx.network.isOnline = true }
        let batch = makeBatch(sends: [send("t1", attachmentIds: ["a"]), send("t2", attachmentIds: ["b"])])

        await fx.runner.run(batch)

        XCTAssertEqual(Array(fx.journal.entries.prefix(3)), ["enqueueOffline:t1", "upload:t2", "send:t2"])
    }

    func test_run_onlineUploadFailure_recordsFailureBeforeRequeue() async {
        let fx = makeSUT()
        fx.uploader.failures["t1"] = UploadBoom()
        let batch = makeBatch(sends: [send("t1", attachmentIds: ["a"])])

        await fx.runner.run(batch)

        XCTAssertEqual(fx.journal.entries, ["upload:t1", "recordFailure:t1", "requeue:t1", "succeeded"])
    }

    func test_run_requeueImpossible_marksFailedWithUploadFailureReason() async {
        let fx = makeSUT()
        fx.uploader.failures["t1"] = UploadBoom()
        fx.queue.requeueResult = false
        let batch = makeBatch(sends: [send("t1", attachmentIds: ["a"])])

        await fx.runner.run(batch)

        XCTAssertEqual(fx.journal.entries, ["upload:t1", "recordFailure:t1", "requeue:t1", "markFailed:t1:boom", "failed", "toast:\(failureToast)"])
    }

    func test_run_guestRefusal_marksFailedWithGuestCopy_andNeverRequeues() async {
        let fx = makeSUT()
        let refusal = GuestAttachmentRefusal(reason: .tooLarge)
        fx.uploader.failures["t1"] = refusal
        let batch = makeBatch(sends: [send("t1", attachmentIds: ["a"])])

        await fx.runner.run(batch)

        let reason = GuestAttachmentCopy.serverRefusal(refusal, kinds: [.image])
        XCTAssertEqual(fx.journal.entries.prefix(3), ["upload:t1", "recordFailure:t1", "markFailed:t1:\(reason)"])
        XCTAssertFalse(fx.journal.entries.contains { $0.hasPrefix("requeue:") })
    }

    func test_run_withoutCredential_abortsUpload_restoresPlace_showsError_sendsNothing() async {
        let fx = makeSUT(hasSession: false)
        let batch = makeBatch(sends: [send("t1", attachmentIds: ["a"])], place: place)

        await fx.runner.run(batch)

        XCTAssertEqual(fx.journal.entries, ["abort", "toast:\(failureToast)", "restorePlace:false"])
        XCTAssertTrue(fx.host.sent.isEmpty)
    }

    func test_run_audioGroup_awaitsLocalTranscriptions_placesThemOnTempId_thenRekeysOnServerIdBeforeSend() async {
        let fx = makeSUT()
        let transcription = MessageTranscription(attachmentId: "voice", text: "Bonjour", language: "fr")
        fx.transcriber.known["voice"] = transcription
        let batch = makeBatch(sends: [send("t_audio", kind: .audio, attachmentIds: ["voice"])])

        await fx.runner.run(batch)

        XCTAssertEqual(fx.host.messageTranscriptions["t_audio"], transcription)
        XCTAssertEqual(fx.host.messageTranscriptionsByAttachment["voice"], transcription)
        XCTAssertEqual(fx.host.messageTranscriptionsByAttachment["srv_voice"], transcription.rekeyed(attachmentId: "srv_voice"))
        XCTAssertEqual(fx.transcriber.discarded, ["voice"])
        XCTAssertEqual(fx.host.rekeyedWhenSending, [true])
    }

    func test_run_audioGroupWithoutLocalTranscription_placesNothing() async {
        let fx = makeSUT()
        let batch = makeBatch(sends: [send("t_audio", kind: .audio, attachmentIds: ["voice"])])

        await fx.runner.run(batch)

        XCTAssertTrue(fx.host.messageTranscriptions.isEmpty)
        XCTAssertTrue(fx.host.messageTranscriptionsByAttachment.isEmpty)
        XCTAssertTrue(fx.transcriber.discarded.isEmpty)
    }

    func test_run_allFailed_errorFeedback() async {
        let fx = makeSUT()
        fx.host.acceptsSend = { _ in false }
        let batch = makeBatch(sends: [send("t1", attachmentIds: ["a"])])

        await fx.runner.run(batch)

        XCTAssertEqual(fx.journal.entries.suffix(2), ["failed", "toast:\(failureToast)"])
    }

    func test_run_anySuccess_successFeedback() async {
        let fx = makeSUT()
        fx.host.acceptsSend = { $0.reusedClientMessageId?.rawValue == "t2" }
        let batch = makeBatch(sends: [send("t1", attachmentIds: ["a"]), send("t2", attachmentIds: ["b"])])

        await fx.runner.run(batch)

        XCTAssertEqual(fx.journal.entries.last, "succeeded")
        XCTAssertFalse(fx.journal.entries.contains { $0.hasPrefix("toast:") })
    }
    // MARK: - Conversation chiffrée de bout en bout (#11379)

    func test_run_e2ee_neTeleverseNiNeMetEnFileAucunePiece() async {
        let fx = makeSUT()
        fx.host.endToEndPieceRefusal = .contentUnsealable
        let batch = makeBatch(sends: [send("t1", attachmentIds: ["a"]), send("t2", attachmentIds: ["b"])])

        await fx.runner.run(batch)

        XCTAssertFalse(fx.journal.entries.contains { $0.hasPrefix("upload:") }, "le fichier partirait en clair")
        XCTAssertFalse(fx.journal.entries.contains { $0.hasPrefix("enqueueOffline:") || $0.hasPrefix("requeue:") })
        XCTAssertTrue(fx.host.sent.isEmpty)
        let reason = EndToEndSendRefusal.contentUnsealable.userMessage
        XCTAssertEqual(fx.journal.entries.filter { $0.hasPrefix("markFailed:") }, ["markFailed:t1:\(reason)", "markFailed:t2:\(reason)"])
        XCTAssertEqual(fx.journal.entries.filter { $0.hasPrefix("toast:") }, ["toast:\(reason)"])
    }

    func test_run_e2eeHorsLigne_rienNEntreDansLOutbox() async {
        let fx = makeSUT(online: false)
        fx.host.endToEndPieceRefusal = .contentUnsealable
        let batch = makeBatch(sends: [send("t1", attachmentIds: ["a"])])

        await fx.runner.run(batch)

        XCTAssertFalse(fx.journal.entries.contains { $0.hasPrefix("enqueueOffline:") })
    }

    func test_run_e2ee_leTexteDuLotPassePourtantParLEnvoiScelle() async {
        let fx = makeSUT()
        fx.host.endToEndPieceRefusal = .contentUnsealable
        let textGroup = Planned(kind: .text, attachments: [], text: "Salut", carriesReply: false)
        let batch = makeBatch(sends: [send("t1", attachmentIds: ["a"])], textGroup: textGroup, textTempId: "t_text")

        await fx.runner.run(batch)

        XCTAssertEqual(fx.host.sent.map { $0.reusedClientMessageId?.rawValue }, ["t_text"])
        XCTAssertEqual(fx.host.sent.first?.attachments.ids, nil)
    }
}
