import Foundation
import MeeshySDK

/// **Ce que la fiche d'un sticker reçu dit de son origine** (#10703) : qui l'a envoyé, et de
/// quel pack il vient. Fonctions pures — la fiche ne fait que les afficher.
enum StickerSheetLinks {
    /// Le pack d'un sticker de pack (`pack.<slug>.<clé>`). Un emoji, un gabarit du catalogue ou
    /// une image libre n'ont pas de pack à ouvrir : `nil`, et la fiche n'offre rien.
    static func packSlug(templateId: String?) -> String? {
        StickerPackTemplateID.parse(templateId)?.slug
    }

    /// Le lien de « Voir le pack » : la vitrine des stickers, centrée sur CE pack.
    static func vitrine(templateId: String?) -> DeepLink? {
        packSlug(templateId: templateId).map { .packShop(domain: .sticker, pack: $0) }
    }

    /// « Envoyé par {nom} » ; un nom absent ou blanc ne dit rien.
    static func senderLine(_ name: String?) -> String? {
        guard let name = name?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty else { return nil }
        return String(format: String(localized: "message.sticker.from", defaultValue: "Envoyé par %@", bundle: .main), name)
    }
}
