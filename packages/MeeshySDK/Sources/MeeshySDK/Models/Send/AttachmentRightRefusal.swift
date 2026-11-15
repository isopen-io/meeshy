import Foundation

/// Le refus qu'un envoi reçoit quand le participant n'a pas le droit de
/// joindre CE type de pièce (#16053) : la passerelle sert un 403
/// `code: ATTACHMENT_RIGHT_NOT_PERMITTED` (`attachmentKindAdmission.ts`), sur
/// le POST REST comme sur l'acquittement de `message:send-with-attachments`.
///
/// Le refus est DÉFINITIF pour cet envoi : ni repli socket, ni outbox — le
/// même corps rencontrerait le même droit.
public enum AttachmentRightRefusal {
    public static let code = "ATTACHMENT_RIGHT_NOT_PERMITTED"

    /// Vrai seulement pour un refus SERVI par la passerelle (enveloppe
    /// `success: false` et ce code) : une page de proxy ne compte pas.
    public static func matches(_ error: any Error) -> Bool {
        switch error {
        case MeeshyError.forbidden(_, let body):
            return APIRejection.gatewayRefusal(statusCode: 403, body: body)?.code == code
        case MeeshyError.rejected(let rejection):
            return rejection.code == code
        default:
            return false
        }
    }
}
