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
            }
        )
        return (SendFailureRecovery(toast: toast), coordinator, toast, log, hooks)
    }

    private func makeOutgoing() -> OutgoingMessage {
        OutgoingMessage(conversationId: ConversationID("conv-1"), content: "Bonjour", relation: .none, attachments: .none)
    }

    private func makeContext() -> SendAttemptContext {
        SendAttemptContext(clientMessageId: MessageID("temp_1"), startedAt: Date(), intent: .none, language: "fr", reusesExistingRow: false)
    }

    private func makePayload() -> SealedOutgoingPayload {
        let request = makeOutgoing().wireRequest(
            content: "Bonjour",
            isEncrypted: false,
            encryptionMode: nil,
            context: makeContext(),
            wireEffectFlags: nil
        )
        return SealedOutgoingPayload(request: request, content: "Bonjour", isEncrypted: false)
    }

    private func recover(
        _ error: any Error,
        fallbackEligible: Bool = true,
        using fixture: (sut: SendFailureRecovery, coordinator: MockConversationSendCoordinator, toast: MockFeedbackToast, log: HookLog, hooks: SendRecoveryHooks)
    ) async -> Result<SentMessageReceipt, SendFailure> {
        await fixture.sut.recover(
            from: error, outgoing: makeOutgoing(), payload: makePayload(), context: makeContext(),
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
}
