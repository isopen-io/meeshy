import Foundation

/// **La preuve qu'un message chiffré a été déchiffré sur cet appareil.**
///
/// `decryptMessagesIfNeeded` remplace `Message.content` par le clair quand le
/// déchiffrement réussit, et le LAISSE au chiffré (base64) quand il échoue —
/// sans rien changer d'autre au message. La copie sur l'appareil (D7) ne peut
/// donc pas lire la réussite dans le message lui-même : elle la lit ici, posée
/// par l'unique site de déchiffrement. Un message absent n'est pas prouvé, et
/// ne se recopie pas (fail-closed).
///
/// Borné : la preuve la plus ancienne s'oublie la première — elle se repose au
/// prochain déchiffrement de la conversation.
@MainActor
final class DecryptedMessageLedger {
    nonisolated deinit {}

    static let shared = DecryptedMessageLedger()

    private let capacity: Int
    private var order: [String] = []
    private var proven: Set<String> = []

    init(capacity: Int = 2_000) {
        self.capacity = max(1, capacity)
    }

    func record(_ messageIds: [String]) {
        for id in messageIds where proven.insert(id).inserted {
            order.append(id)
        }
        let overflow = order.count - capacity
        guard overflow > 0 else { return }
        order.prefix(overflow).forEach { proven.remove($0) }
        order.removeFirst(overflow)
    }

    func contains(_ messageId: String) -> Bool { proven.contains(messageId) }

    func removeAll() {
        order.removeAll()
        proven.removeAll()
    }
}
