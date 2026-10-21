import Foundation

/// Les blocs qu'un message porte en colonne TEXTE JSON (`locationJson`,
/// `stickerJson`, `trackedLinksJson`) : une seule façon de les écrire et de
/// les relire, chaque échec étant journalisé avec son champ et son message.
extension MessageRecord {
    static func encodeJSONText<T: Encodable>(_ value: T?, field: String, id: String) -> String? {
        value.flatMap { JSONEncoder().encodeOrLog($0, field: field, id: id) }
            .flatMap { String(data: $0, encoding: .utf8) }
    }

    /// Le contour d'avatar servi avec l'auteur (#10713) : `.some(nil)` quand l'auteur est servi
    /// SANS contour (retiré), `nil` quand l'écho ne porte pas d'auteur — la ligne garde alors le sien.
    static func servedSenderRingJson(_ sender: APIMessageSender?, id: String) -> String?? {
        sender.map { encodeJSONText($0.profileDecor?.avatarRing, field: "senderRingJson", id: id) }
    }

    static func decodeJSONText<T: Decodable>(_ type: T.Type, _ json: String?, field: String, id: String) -> T? {
        json.flatMap { $0.data(using: .utf8) }
            .flatMap { JSONDecoder().decodeOrLog(type, from: $0, field: field, id: id) }
    }
}
