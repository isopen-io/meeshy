import Foundation

/// La clé d'idempotence d'un texte COMPOSÉ (#6915).
///
/// Un échec qui rend le texte au composeur ne défait pas la composition : le
/// nouvel appui renvoie le même message, que le serveur a peut-être déjà reçu.
/// Il porte donc la même `clientMessageId`, et la déduplication
/// `(conversationId, clientMessageId)` le reconnaît. Un texte modifié est une
/// composition nouvelle, avec sa propre clé.
public struct ComposedMessageKey: Equatable, Sendable {
    public let text: String
    public let clientMessageId: String

    public init(text: String, clientMessageId: String) {
        self.text = text
        self.clientMessageId = clientMessageId
    }

    public static func resolve(
        for text: String,
        retained: ComposedMessageKey?,
        mint: () -> String = ClientMessageId.generate
    ) -> ComposedMessageKey {
        if let retained, retained.text == text { return retained }
        return ComposedMessageKey(text: text, clientMessageId: mint())
    }
}
