import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class SendFailureRecoveryTests: XCTestCase {

    private final class HookLog {
        var entries: [String] = []
    }

    private struct Transient: Error {}

    private func makeSUT() -> (sut: SendFailureRecovery, coordinator: MockConversationSendCoordinator, toast: MockFeedbackToast, log: HookLog, hooks: SendRecoveryHooks) {
        let toast = MockFeedbackToast()
        let log = HookLog()
        let coordinator = MockConversationSendCoordinator()
        let hooks = SendRecoveryHooks(
            withdraw: { id, restriction in log.entries.append("withdraw:\(id):\(restriction.wireValue)") },
            holdSlowMode: { id, slowMode, _ in log.entries.append("hold:\(id):\(slowMode.retryAfterSeconds)") },
            registerServerId: { tempId, serverId in
                log.entries.append("register:\(tempId)->\(serverId) after:\(coordinator.callLog.joined(separator: ","))")
            },
            adoptEndToEnd: { log.entries.append("adoptEndToEnd") }
        )
        return (SendFailureRecovery(toast: toast), coordinator, toast, log, hooks)
    }

    private func makeOutgoing() -> OutgoingMessage {
        OutgoingMessage(conversationId: ConversationID("conv-1"), content: "Bonjour", relation: .none, attachments: .none)
    }

    private func makeContext() -> SendAttemptContext {
        SendAttemptContext(clientMessageId: MessageID("temp_1"), startedAt: Date(), intent: .none, language: "fr", reusesExistingRow: false)
    }

    private func makePayload(sealed: Bool = false) -> SealedOutgoingPayload {
        let content = sealed ? "c2VjcmV0" : "Bonjour"
        let request = makeOutgoing().wireRequest(
            content: content,
            isEncrypted: sealed,
            encryptionMode: sealed ? "E2EE" : nil,
            context: makeContext(),
            wireEffectFlags: nil
        )
        return SealedOutgoingPayload(request: request, content: content, isEncrypted: sealed)
    }

    private func recover(
        _ error: any Error,
        fallbackEligible: Bool = true,
        sealed: Bool = false,
        using fixture: (sut: SendFailureRecovery, coordinator: MockConversationSendCoordinator, toast: MockFeedbackToast, log: HookLog, hooks: SendRecoveryHooks)
    ) async -> Result<SentMessageReceipt, SendFailure> {
        await fixture.sut.recover(
            from: error, outgoing: makeOutgoing(), payload: makePayload(sealed: sealed), context: makeContext(),
            fallbackEligible: fallbackEligible, coordinator: fixture.coordinator, hooks: fixture.hooks
        )
    }

    func test_recover_writeRestrictionThatClosesComposer_withdrawsAndReturnsWriteRestricted_withoutFallbackOrOutbox() async {
        let fixture = makeSUT()
        let refusal = MeeshyError.forbidden(reason: "Global", body: Data(#"{"code":"GLOBAL_ADULTS_ONLY"}"#.utf8))

        let result = await recover(refusal, using: fixture)

        XCTAssertEqual(result, .failure(.writeRestricted(.minorGlobal)))
        XCTAssertEqual(fixture.log.entries, ["withdraw:temp_1:\(ConversationWriteRestriction.minorGlobal.wireValue)"])
        XCTAssertTrue(fixture.coordinator.callLog.isEmpty)
    }

    func test_recover_slowMode_holdsAndReturnsSlowMode() async {
        let fixture = makeSUT()
        let slowMode = NewcomerSlowMode(retryAfterSeconds: 21)

        let result = await recover(MeeshyError.rejected(slowMode.rejection(message: "Bienvenue !")), using: fixture)

        XCTAssertEqual(result, .failure(.slowMode(slowMode)))
        XCTAssertEqual(fixture.log.entries, ["hold:temp_1:21"])
        XCTAssertTrue(fixture.coordinator.callLog.isEmpty)
    }

    func test_recover_userBlocked_recordsFailureShowsToastReturnsRecipientBlocked() async {
        let fixture = makeSUT()
        let blocked = MeeshyError.forbidden(reason: "USER_BLOCKED", body: Data(#"{"code":"USER_BLOCKED"}"#.utf8))

        let result = await recover(blocked, using: fixture)

        XCTAssertEqual(result, .failure(.recipientBlocked))
        XCTAssertEqual(fixture.coordinator.callLog, ["recordFailure"])
        XCTAssertEqual(fixture.toast.errorMessages.count, 1)
    }

    func test_recover_fallbackEligibleAndAcked_registersServerIdBEFOREAcknowledge_returnsReceipt() async {
        let fixture = makeSUT()
        let receipt = SentMessageReceipt(
            clientMessageId: MessageID("temp_1"),
            delivery: .acknowledged(serverId: MessageID("srv_1"), at: Date(timeIntervalSince1970: 100), via: .socketFallback)
        )
        fixture.coordinator.fallbackResult = receipt

        let result = await recover(Transient(), using: fixture)

        XCTAssertEqual(result, .success(receipt))
        XCTAssertEqual(fixture.log.entries, ["register:temp_1->srv_1 after:emitSocketFallback"])
        XCTAssertEqual(fixture.coordinator.callLog, ["emitSocketFallback", "acknowledge"])
    }

    func test_recover_fallbackNotEligible_recordsFailureThenEnqueuesForRetry() async {
        let fixture = makeSUT()

        let result = await recover(Transient(), fallbackEligible: false, using: fixture)

        XCTAssertEqual(result, .failure(fixture.coordinator.enqueueForRetryResult))
        XCTAssertEqual(fixture.coordinator.callLog, ["recordFailure", "enqueueForRetry"])
    }

    // MARK: - #11379 — le refus serveur d'une conversation chiffrée

    private var plaintextRefusal: MeeshyError {
        .rejected(APIRejection(statusCode: 400, code: EndToEndSendGate.serverPlaintextRefusalCode, message: "Conversation chiffrée"))
    }

    /// Le « second verrou » ne doit pas devenir un rejeu : le clair refusé ne
    /// repart ni par le socket ni par l'outbox, et le fil apprend le régime.
    func test_recover_serverRefusesPlaintext_neitherFallbackNorOutbox_adoptsEndToEnd() async {
        let fixture = makeSUT()

        let result = await recover(plaintextRefusal, using: fixture)

        XCTAssertEqual(result, .failure(.endToEndUnsealed(.plaintextRefusedByServer)))
        XCTAssertEqual(fixture.coordinator.callLog, ["markFailed"], "ni emitSocketFallback, ni enqueueForRetry")
        XCTAssertEqual(fixture.log.entries, ["adoptEndToEnd"])
        XCTAssertEqual(fixture.toast.errorMessages, [EndToEndSendRefusal.plaintextRefusedByServer.userMessage])
    }

    /// Un envoi scellé refusé en 4xx (enveloppe pas encore acceptée) n'est pas
    /// une coupure réseau : le motif le dit, et rien ne repart.
    func test_recover_sealedSendRefusedByServer_saysEnvelopeRefused_withoutFallback() async {
        let fixture = makeSUT()

        let result = await recover(MeeshyError.server(statusCode: 400, message: "Validation error"), sealed: true, using: fixture)

        XCTAssertEqual(result, .failure(.endToEndUnsealed(.envelopeRefusedByServer)))
        XCTAssertEqual(fixture.coordinator.callLog, ["markFailed"])
        XCTAssertEqual(fixture.toast.errorMessages, [EndToEndSendRefusal.envelopeRefusedByServer.userMessage])
    }

    func test_recover_sealedSendTimedOut_staysOutboxUnsealable_neverReQueuedInClear() async {
        let fixture = makeSUT()

        let result = await recover(URLError(.timedOut), sealed: true, using: fixture)

        XCTAssertEqual(result, .failure(.endToEndUnsealed(.outboxUnsealable)))
        XCTAssertEqual(fixture.coordinator.callLog, ["emitSocketFallback", "markFailed"])
    }
}
