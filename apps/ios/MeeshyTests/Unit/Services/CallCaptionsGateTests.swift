import XCTest
import MeeshySDK
@testable import Meeshy

/// #13720 — aucune parole d'un appel chiffré de bout en bout n'atteint la
/// passerelle : la porte des sous-titres, sa lecture du régime, et ce que le
/// service de transcription en fait.
@MainActor
final class MockCallCaptionsGateResolver: CallCaptionsGateResolving {
    nonisolated deinit {}

    var gateResult: CallCaptionsGate
    var remembersEndToEndResult = false
    private(set) var gateCallCount = 0
    private(set) var lastConversationId: String?

    init(gate: CallCaptionsGate) {
        self.gateResult = gate
    }

    func gate(conversationId: String?) async -> CallCaptionsGate {
        gateCallCount += 1
        lastConversationId = conversationId
        return gateResult
    }

    func remembersEndToEnd(conversationId: String) -> Bool {
        remembersEndToEndResult
    }
}

@MainActor
private final class ReadCounter {
    nonisolated deinit {}
    var count = 0
}

@MainActor
final class CallCaptionsGateTests: XCTestCase {

    // MARK: - Factories

    private func makeService(gate: CallCaptionsGate) -> (sut: CallTranscriptionService, socket: MockMessageSocket, resolver: MockCallCaptionsGateResolver) {
        let socket = MockMessageSocket()
        let resolver = MockCallCaptionsGateResolver(gate: gate)
        let sut = CallTranscriptionService(socket: socket, gateResolver: resolver)
        return (sut, socket, resolver)
    }

    private func makeResolver(
        served: CallCaptionsServedRegime,
        memory: EndToEndRegimeMemory = EndToEndRegimeMemory(defaults: nil)
    ) -> (sut: CallCaptionsGateResolver, memory: EndToEndRegimeMemory, reads: () -> Int) {
        let counter = ReadCounter()
        let sut = CallCaptionsGateResolver(memory: memory, readServedRegime: { _ in
            counter.count += 1
            return served
        })
        return (sut, memory, { counter.count })
    }

    private func settle(_ sut: CallTranscriptionService, conversationId: String? = "conv-1") async {
        let settled = expectation(description: "gate settled")
        _ = sut.admitsCaptions(conversationId: conversationId, onSettled: { settled.fulfill() })
        await fulfillment(of: [settled], timeout: 2)
    }

    // MARK: - Law

    func test_of_endToEndMode_anyCase_closesCaptions() {
        XCTAssertEqual(CallCaptionsGate.of(served: .served(mode: "e2ee"), rememberedEndToEnd: false), .endToEnd)
        XCTAssertEqual(CallCaptionsGate.of(served: .served(mode: "E2EE"), rememberedEndToEnd: false), .endToEnd)
    }

    func test_of_serverReadableModes_openCaptions() {
        for mode in [nil, "", "server", "hybrid", "Server"] {
            XCTAssertEqual(CallCaptionsGate.of(served: .served(mode: mode), rememberedEndToEnd: false), .open, "mode \(String(describing: mode))")
        }
    }

    func test_of_unknownModeOrUnreadableRegime_staysClosed() {
        XCTAssertEqual(CallCaptionsGate.of(served: .served(mode: "quantum"), rememberedEndToEnd: false), .unresolved)
        XCTAssertEqual(CallCaptionsGate.of(served: .unreadable, rememberedEndToEnd: false), .unresolved)
        XCTAssertFalse(CallCaptionsGate.unresolved.allowsCaptions)
    }

    func test_of_rememberedEndToEnd_winsOverServedClear() {
        XCTAssertEqual(CallCaptionsGate.of(served: .served(mode: nil), rememberedEndToEnd: true), .endToEnd)
    }

    // MARK: - Resolver

    func test_gate_conversationRememberedEndToEnd_closesWithoutReadingServer() async {
        let memory = EndToEndRegimeMemory(defaults: nil)
        _ = memory.resolve(conversationId: "conv-1", served: EndToEndRegime(isEndToEnd: true, enabledAt: nil))
        let (sut, _, reads) = makeResolver(served: .served(mode: nil), memory: memory)

        let gate = await sut.gate(conversationId: "conv-1")

        XCTAssertEqual(gate, .endToEnd)
        XCTAssertEqual(reads(), 0)
    }

    func test_gate_servedEndToEnd_closesAndIsRemembered() async {
        let (sut, memory, _) = makeResolver(served: .served(mode: "e2ee"))

        let gate = await sut.gate(conversationId: "conv-1")

        XCTAssertEqual(gate, .endToEnd)
        XCTAssertTrue(memory.resolve(conversationId: "conv-1", served: .serverReadable).isEndToEnd)
    }

    func test_gate_servedClear_opens() async {
        let (sut, _, _) = makeResolver(served: .served(mode: nil))
        let gate = await sut.gate(conversationId: "conv-1")
        XCTAssertEqual(gate, .open)
    }

    func test_gate_unreadableRegimeOrMissingConversation_staysClosed() async {
        let (sut, _, reads) = makeResolver(served: .unreadable)
        let unreadable = await sut.gate(conversationId: "conv-1")
        let missing = await sut.gate(conversationId: nil)
        XCTAssertEqual(unreadable, .unresolved)
        XCTAssertEqual(missing, .unresolved)
        XCTAssertEqual(reads(), 1, "an unknown conversation is never read")
    }

    // MARK: - Service

    func test_admitsCaptions_beforeRegimeIsRead_refusesThenSettles() async {
        let (sut, _, resolver) = makeService(gate: .open)
        let settled = expectation(description: "gate settled")

        XCTAssertFalse(sut.admitsCaptions(conversationId: "conv-1", onSettled: { settled.fulfill() }))
        XCTAssertFalse(sut.admitsCaptions(conversationId: "conv-1", onSettled: {}), "still closed while the regime is read")
        await fulfillment(of: [settled], timeout: 2)

        XCTAssertTrue(sut.admitsCaptions(conversationId: "conv-1", onSettled: {}))
        XCTAssertEqual(resolver.gateCallCount, 1, "one read per call and conversation")
        XCTAssertEqual(resolver.lastConversationId, "conv-1")
    }

    func test_admitsCaptions_endToEndConversation_staysClosedAfterSettling() async {
        let (sut, _, resolver) = makeService(gate: .endToEnd)

        await settle(sut)

        XCTAssertFalse(sut.admitsCaptions(conversationId: "conv-1", onSettled: {}))
        XCTAssertEqual(sut.captionsGate, .endToEnd)
        XCTAssertTrue(sut.isCaptionsGateSettled)
        XCTAssertEqual(resolver.gateCallCount, 1)
    }

    func test_admitsCaptions_afterCallEnd_readsTheNextCallAgain() async {
        let (sut, _, resolver) = makeService(gate: .open)
        await settle(sut)

        sut.resetForCallEnd(callId: nil, conversationId: "conv-1", callStartedAt: nil, localUserId: "me", localSpeakerName: "Moi", remoteSpeakerName: "Bob")
        await settle(sut, conversationId: "conv-2")

        XCTAssertEqual(resolver.gateCallCount, 2)
        XCTAssertEqual(resolver.lastConversationId, "conv-2")
    }

    func test_admitsCaptions_conversationLearnedEndToEndDuringTheCall_closesTheOpenGate() async {
        let (sut, _, resolver) = makeService(gate: .open)
        await settle(sut)
        XCTAssertTrue(sut.admitsCaptions(conversationId: "conv-1", onSettled: {}))

        resolver.remembersEndToEndResult = true

        XCTAssertFalse(sut.admitsCaptions(conversationId: "conv-1", onSettled: {}))
        XCTAssertEqual(sut.captionsGate, .endToEnd)
    }

    func test_applyRecognitionResult_conversationLearnedEndToEndMidCapture_sendsNothing() async {
        let (sut, socket, resolver) = makeService(gate: .open)
        await settle(sut)
        sut.setTranscribingForTesting(true)
        sut.setCallIdForTesting("call-1")
        resolver.remembersEndToEndResult = true

        sut.applyRecognitionResult(
            text: "Le code est 4512", speakerId: "me", startMs: 0, endMs: 900,
            isFinal: true, confidence: 0.9, language: "fr", capturedAt: Date(), callId: "call-1"
        )

        XCTAssertEqual(socket.emitCallTranscriptionSegmentCallCount, 0)
        XCTAssertFalse(sut.isTranscribing)
    }

    func test_startTranscribing_whenGateIsClosed_startsNothing() {
        let (sut, socket, _) = makeService(gate: .endToEnd)
        sut.setCaptionsGateForTesting(.endToEnd)

        sut.startTranscribing(callId: "call-1", localLanguage: "fr", localUserId: "me")

        XCTAssertFalse(sut.isTranscribing)
        XCTAssertNil(sut.lastError, "the gate refuses before the permission is even looked at")
        XCTAssertEqual(socket.emitCallTranscriptionSegmentCallCount, 0)
    }

    func test_applyRecognitionResult_finalSentenceInEndToEndCall_sendsNothingAndStopsCapture() {
        let (sut, socket, _) = makeService(gate: .endToEnd)
        sut.setCaptionsGateForTesting(.endToEnd)
        sut.setTranscribingForTesting(true)
        sut.setCallIdForTesting("call-1")
        var peerEntries: [DataChannelTranscriptEntry] = []
        sut.sendPeerEntry = { peerEntries.append($0) }

        sut.applyRecognitionResult(
            text: "Le code du coffre est 4512", speakerId: "me", startMs: 0, endMs: 1200,
            isFinal: true, confidence: 0.9, language: "fr", capturedAt: Date(), callId: "call-1"
        )

        XCTAssertEqual(socket.emitCallTranscriptionSegmentCallCount, 0)
        XCTAssertTrue(peerEntries.isEmpty)
        XCTAssertTrue(sut.segments.isEmpty)
        XCTAssertFalse(sut.isTranscribing)
    }

    // MARK: - Refusal

    func test_settle_refusedAfterUserOpenedThePanel_closesItAndSaysWhy() async {
        let (sut, _, _) = makeService(gate: .endToEnd)
        await settle(sut)
        sut.isShowingOverlay = true
        var published = 0
        var told: [String] = []

        CallCaptionsRefusal.settle(service: sut, publishListeningIntent: { published += 1 }, tellUser: { told.append($0) })

        XCTAssertFalse(sut.isShowingOverlay)
        XCTAssertEqual(published, 1)
        XCTAssertEqual(told, [CallCaptionsGate.endToEnd.refusalMessage])
    }

    func test_settle_refusedWhileOnlyAPeerListens_saysNothing() async {
        let (sut, _, _) = makeService(gate: .endToEnd)
        await settle(sut)
        var told: [String] = []

        CallCaptionsRefusal.settle(service: sut, publishListeningIntent: {}, tellUser: { told.append($0) })

        XCTAssertTrue(told.isEmpty)
    }

    func test_settle_whileRegimeIsStillRead_keepsThePanelAndAnnouncesNothing() {
        let (sut, _, _) = makeService(gate: .endToEnd)
        _ = sut.admitsCaptions(conversationId: "conv-1", onSettled: {})
        sut.isShowingOverlay = true
        var published = 0
        var told: [String] = []

        CallCaptionsRefusal.settle(service: sut, publishListeningIntent: { published += 1 }, tellUser: { told.append($0) })

        XCTAssertTrue(sut.isShowingOverlay)
        XCTAssertEqual(published, 0)
        XCTAssertTrue(told.isEmpty)
    }
}
