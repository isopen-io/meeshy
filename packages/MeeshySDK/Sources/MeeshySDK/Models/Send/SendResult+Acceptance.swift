import Foundation

extension Result where Success == SentMessageReceipt, Failure == SendFailure {
    public var isAccepted: Bool {
        guard case .success = self else { return false }
        return true
    }
}

extension OutgoingAttachments {
    public static let none = OutgoingAttachments(ids: nil, previews: nil)
}
