import Foundation

/// **La colonne `joinNoticeJson` porte la métadonnée d'AVIS d'un message
/// système** — une arrivée (`member-joined`) OU une capture
/// (`content-capture`, #9617). Les deux sont des `metadata` exclusives (un
/// message n'a qu'un `kind`), et chaque type GARDE sur son `kind` au décodage :
/// la colonne ne peut pas rendre l'un pour l'autre.
///
/// Pourquoi pas une colonne de plus : sans elle, l'avis de capture relu du
/// cache retombait sur le repli français en UTC ; avec elle, il fallait une
/// migration GRDB et des lignes neuves dans `MessagePersistenceActor`, déjà
/// hors budget de taille. Le nom de la colonne date de l'arrivée ; son rôle
/// est « l'avis du message système ».
enum SystemNoticeColumn {

    private struct Kind: Decodable {
        let kind: String?
    }

    /// Ce qui s'écrit dans la colonne pour cette charge.
    static func encode(join: JoinNoticeMetadata?, capture: CaptureNoticeMetadata?, encoder: JSONEncoder, id: String) -> Data? {
        if let join { return encoder.encodeOrLog(join, field: "joinNoticeJson", id: id) }
        if let capture { return encoder.encodeOrLog(capture, field: "joinNoticeJson", id: id) }
        return nil
    }

    /// L'avis relu, selon son `kind` — un `kind` inconnu ne rend rien, sans bruit.
    static func decode(_ data: Data?, decoder: JSONDecoder, id: String) -> (join: JoinNoticeMetadata?, capture: CaptureNoticeMetadata?) {
        guard let data, let kind = (try? decoder.decode(Kind.self, from: data))?.kind else { return (nil, nil) }
        switch kind {
        case "member-joined":
            return (decoder.decodeOrLog(JoinNoticeMetadata.self, from: data, field: "joinNoticeJson", id: id), nil)
        case CaptureNoticeMetadata.kind:
            return (nil, decoder.decodeOrLog(CaptureNoticeMetadata.self, from: data, field: "joinNoticeJson", id: id))
        default:
            return (nil, nil)
        }
    }
}

extension APIMessage {
    /// La valeur de `joinNoticeJson` pour cette charge — voir `SystemNoticeColumn`.
    func systemNoticeJson(encoder: JSONEncoder) -> Data? {
        SystemNoticeColumn.encode(join: joinNotice, capture: captureNotice, encoder: encoder, id: id)
    }
}
