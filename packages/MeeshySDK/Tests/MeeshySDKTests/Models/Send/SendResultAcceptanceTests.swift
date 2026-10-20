import Foundation
import Testing
@testable import MeeshySDK

struct SendResultAcceptanceTests {

    private func receipt(_ delivery: SentMessageReceipt.Delivery) -> SentMessageReceipt {
        SentMessageReceipt(clientMessageId: MessageID("cid_1"), delivery: delivery)
    }

    @Test func isAccepted_acknowledged_isTrue() {
        let result: Result<SentMessageReceipt, SendFailure> = .success(
            receipt(.acknowledged(serverId: MessageID("srv_1"), at: Date(timeIntervalSince1970: 0), via: .rest))
        )
        #expect(result.isAccepted)
    }

    @Test func isAccepted_queuedOffline_isTrue() {
        let result: Result<SentMessageReceipt, SendFailure> = .success(receipt(.queuedOffline))
        #expect(result.isAccepted)
    }

    @Test func isAccepted_everyFailure_isFalse() {
        let failures: [SendFailure] = [
            .ineligible,
            .offlineEnqueueFailed(reason: "r"),
            .writeRestricted(.minorGlobal),
            .slowMode(NewcomerSlowMode(retryAfterSeconds: 30)),
            .recipientBlocked,
            .queuedForRetry(reason: "r"),
            .retryEnqueueFailed(reason: "r")
        ]
        #expect(failures.count == 7)
        for failure in failures {
            let result: Result<SentMessageReceipt, SendFailure> = .failure(failure)
            #expect(!result.isAccepted)
        }
    }

    @Test func outgoingAttachmentsNone_hasNoIdsAndNoPreviews() {
        #expect(OutgoingAttachments.none == OutgoingAttachments(ids: nil, previews: nil))
        #expect(OutgoingAttachments.none.ids == nil)
        #expect(OutgoingAttachments.none.previews == nil)
    }
}
