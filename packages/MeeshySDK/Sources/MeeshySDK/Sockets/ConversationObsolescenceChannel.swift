import Combine
import Foundation

/// `conversation:obsoleted` (#14645) : un administrateur a rendu la
/// conversation obsolète, son contenu est effacé pour tous.
///
/// Un canal à part de `MessageSocketManager` (déjà au-delà de son budget de
/// cohésion), comme `ConversationEncryptionChannel` : la route socket y
/// publie, `MessageSocketProviding.conversationObsoleted` le sert.
public final class ConversationObsolescenceChannel: Sendable {
    public static let shared = ConversationObsolescenceChannel()

    private let subject = Locked(uncheckedState: PassthroughSubject<ConversationObsoletedEvent, Never>())

    public var obsoleted: PassthroughSubject<ConversationObsoletedEvent, Never> {
        subject.mutateUnchecked { $0 }
    }

    public init() {}
}
