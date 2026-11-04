import Foundation
import Testing
@testable import MeeshySDK

/// #16053 — le 403 qu'une pièce jointe refusée par les droits du participant
/// reçoit de la passerelle (`attachmentKindAdmission.ts`).
struct AttachmentRightRefusalTests {

    private func forbidden(code: String?, success: Bool = false) -> MeeshyError {
        let codeField = code.map { #","code":"\#($0)""# } ?? ""
        let body = #"{"success":\#(success),"error":"Vous n'êtes pas autorisé à envoyer ce type de pièce jointe"\#(codeField)}"#
        return .forbidden(reason: "Vous n'êtes pas autorisé à envoyer ce type de pièce jointe", body: Data(body.utf8))
    }

    @Test func test_matches_forbiddenServedWithAttachmentRightCode_isTrue() {
        #expect(AttachmentRightRefusal.matches(forbidden(code: AttachmentRightRefusal.code)))
    }

    @Test func test_matches_rejectionCarryingAttachmentRightCode_isTrue() {
        let rejection = APIRejection(statusCode: 403, code: AttachmentRightRefusal.code, message: "x")
        #expect(AttachmentRightRefusal.matches(MeeshyError.rejected(rejection)))
    }

    @Test func test_matches_forbiddenWithAnotherCode_isFalse() {
        #expect(!AttachmentRightRefusal.matches(forbidden(code: "WRITE_NOT_PERMITTED")))
        #expect(!AttachmentRightRefusal.matches(forbidden(code: "USER_BLOCKED")))
        #expect(!AttachmentRightRefusal.matches(forbidden(code: nil)))
    }

    @Test func test_matches_bodyNotServedByTheGateway_isFalse() {
        #expect(!AttachmentRightRefusal.matches(forbidden(code: AttachmentRightRefusal.code, success: true)))
        let proxyPage = MeeshyError.forbidden(reason: nil, body: Data("<html>403</html>".utf8))
        #expect(!AttachmentRightRefusal.matches(proxyPage))
        #expect(!AttachmentRightRefusal.matches(MeeshyError.forbidden(reason: nil, body: nil)))
    }

    @Test func test_matches_transportOrServerError_isFalse() {
        #expect(!AttachmentRightRefusal.matches(URLError(.timedOut)))
        #expect(!AttachmentRightRefusal.matches(MeeshyError.server(statusCode: 403, message: "x")))
    }

    @Test func test_isPermanentServerRejection_attachmentRightRefusal_isNeverReplayedByTheOutbox() {
        #expect(OutboxFlusher.isPermanentServerRejection(forbidden(code: AttachmentRightRefusal.code)))
    }

    @Test func test_code_isTheGatewayWireValue() {
        #expect(AttachmentRightRefusal.code == "ATTACHMENT_RIGHT_NOT_PERMITTED")
    }
}
