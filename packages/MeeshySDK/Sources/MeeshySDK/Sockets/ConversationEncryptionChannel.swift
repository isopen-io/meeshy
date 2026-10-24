import Combine
import Foundation

/// `conversation:encryption-changed` (#12522) : le régime de chiffrement d'une
/// conversation a basculé. Le fil ouvert, son composeur et le scellement en
/// changent sans relecture ; le registre du régime de l'app l'apprend.
///
/// Un canal à part de `MessageSocketManager` (déjà au-delà de son budget de
/// cohésion) : la route socket y publie, les abonnés n'en lisent que ceci.
/// unchecked: `changed` est un `PassthroughSubject` (sérialise ses propres envois) ; aucune autre propriété mutable.
public final class ConversationEncryptionChannel: @unchecked Sendable {
    public static let shared = ConversationEncryptionChannel()

    public let changed = PassthroughSubject<ConversationEncryptionChangedEvent, Never>()

    public init() {}
}
