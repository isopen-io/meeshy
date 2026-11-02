import UIKit

/// **Ce que « Partager » remet à la feuille de partage** (#9038).
///
/// Une carte IMAGE part comme `UIImage` : Messages, WhatsApp, Photos la
/// reçoivent comme une photo. Remise comme URL `file://`, une partie des
/// destinations (copier, notes, certaines messageries) la recevait comme une
/// CHAÎNE — le chemin du fichier temporaire, pas l'image. Une animation (GIF,
/// vidéo) part comme fichier : c'est ce qui la garde animée.
enum MessageCardSharePayload: Identifiable {
    case image(UIImage, id: UUID = UUID())
    case file(URL)

    /// `nil` quand les octets ne se décodent pas — rien à partager.
    static func image(png: Data) -> MessageCardSharePayload? {
        UIImage(data: png).map { .image($0) }
    }

    var id: String {
        switch self {
        case .image(_, let id): return id.uuidString
        case .file(let url): return url.path
        }
    }

    var activityItems: [Any] {
        switch self {
        case .image(let image, _): return [image]
        case .file(let url): return [url]
        }
    }
}
