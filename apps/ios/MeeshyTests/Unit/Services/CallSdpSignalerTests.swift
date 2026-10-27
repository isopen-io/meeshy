import XCTest
@testable import Meeshy

/// `CallSdpSignaler` porte l'époque de la négociation parfaite (§3.5) et la
/// livraison au moins une fois de l'offre et de la réponse SDP (§6.3, H3).
@MainActor
final class CallSdpSignalerTests: XCTestCase {

    private final class FakeAckEmitter: CallSignalAckEmitting, @unchecked Sendable {
        var acks: [Bool]
        private(set) var sent: [(callId: String, type: String, generation: Int?)] = []
        init(acks: [Bool]) { self.acks = acks }
        func emitCallSignalWithAck(callId: String, type: String, payload: [String: Any]) async -> Bool {
            sent.append((callId, type, payload["negotiationId"] as? Int))
            return acks.isEmpty ? false : acks.removeFirst()
        }
    }

    private func makeSUT(acks: [Bool], currentCallId: String? = "call-1") -> (CallSdpSignaler, FakeAckEmitter) {
        let emitter = FakeAckEmitter(acks: acks)
        let signaler = CallSdpSignaler(emitter: emitter, retryInitialDelay: 0.001)
        signaler.isCurrentCall = { $0 == currentCallId }
        return (signaler, emitter)
    }

    func test_beginOutgoingNegotiation_opensANewGeneration() {
        let (sut, _) = makeSUT(acks: [])
        XCTAssertEqual(sut.beginOutgoingNegotiation(), 1)
        XCTAssertEqual(sut.beginOutgoingNegotiation(), 2)
        XCTAssertEqual(sut.negotiationId, 2)
    }

    func test_resetEpoch_startsTheNextCallFromZero() {
        let (sut, _) = makeSUT(acks: [])
        _ = sut.beginOutgoingNegotiation()
        sut.resetEpoch()
        XCTAssertEqual(sut.negotiationId, 0)
    }

    func test_acceptIncomingNegotiation_dropsAStaleGeneration_andAdvancesOnANewerOne() {
        let (sut, _) = makeSUT(acks: [])
        XCTAssertTrue(sut.acceptIncomingNegotiation(3))
        XCTAssertEqual(sut.negotiationId, 3)
        XCTAssertFalse(sut.acceptIncomingNegotiation(2))
        XCTAssertTrue(sut.acceptIncomingNegotiation(3))
        XCTAssertEqual(sut.negotiationId, 3)
    }

    func test_offer_retriesUntilAcked() async {
        let (sut, emitter) = makeSUT(acks: [false, true])
        let generation = sut.beginOutgoingNegotiation()
        await sut.emitOfferWithRetry(callId: "call-1", payload: ["negotiationId": generation], generation: generation)
        XCTAssertEqual(emitter.sent.map(\.type), ["offer", "offer"])
    }

    func test_offer_givesUpAfterTheBudget() async {
        let (sut, emitter) = makeSUT(acks: [false, false, false, false])
        let generation = sut.beginOutgoingNegotiation()
        await sut.emitOfferWithRetry(callId: "call-1", payload: [:], generation: generation)
        XCTAssertEqual(emitter.sent.count, QualityThresholds.signalOfferMaxAttempts)
    }

    func test_offer_stopsWhenANewerNegotiationSupersedesIt() async {
        let (sut, emitter) = makeSUT(acks: [false, false, false])
        let generation = sut.beginOutgoingNegotiation()
        _ = sut.beginOutgoingNegotiation()
        await sut.emitOfferWithRetry(callId: "call-1", payload: [:], generation: generation)
        XCTAssertTrue(emitter.sent.isEmpty)
    }

    func test_offer_stopsOnceTheCallIsNoLongerCurrent() async {
        let (sut, emitter) = makeSUT(acks: [false], currentCallId: "another-call")
        let generation = sut.beginOutgoingNegotiation()
        await sut.emitOfferWithRetry(callId: "call-1", payload: [:], generation: generation)
        XCTAssertTrue(emitter.sent.isEmpty)
    }

    func test_answer_ackedOnFirstAttempt_needsNoRetry() async {
        let (sut, emitter) = makeSUT(acks: [true])
        let acked = await sut.emitAnswer(callId: "call-1", payload: [:])
        XCTAssertTrue(acked)
        XCTAssertEqual(emitter.sent.count, 1)
    }

    func test_answer_unacked_retriesInTheBackgroundWithinItsBudget() async {
        let (sut, emitter) = makeSUT(acks: [false, false, false, false, true])
        let acked = await sut.emitAnswer(callId: "call-1", payload: [:])
        XCTAssertFalse(acked)
        await sut.answerRetryTask?.value
        XCTAssertEqual(emitter.sent.count, QualityThresholds.signalAnswerTotalAttempts)
    }

    func test_cancelRetries_stopsTheBackgroundAnswerRetry() async {
        let (sut, emitter) = makeSUT(acks: [false, false, false, false])
        _ = await sut.emitAnswer(callId: "call-1", payload: [:])
        sut.cancelRetries()
        XCTAssertNil(sut.answerRetryTask)
        XCTAssertEqual(emitter.sent.count, 1)
    }
}
