import Foundation
import MeeshySDK

// MARK: - Quel fond peindre ? (#10631, spec §§ 5.4, 8.2, 13)
//
// L'orchestration « quel fond, quand » est APP-SIDE (SDK Purity) : le SDK porte
// le contrat et le peintre agnostique, cette résolution décide. Pure et sans
// SwiftUI : un fond ne se résout jamais en erreur — ce qui ne se lit pas retombe
// sur Signature, sans spinner.

enum ConversationBackgroundResolution: Equatable {
    case signature
    case design(AppearanceDesign)
    case solid(hex: String)
    case photo(attachmentId: String, veil: Double, blur: Int)

    static func resolve(_ appearance: ConversationAppearance?, isDark: Bool, catalog: AppearanceCatalog = .shared) -> ConversationBackgroundResolution {
        guard let appearance else { return .signature }
        switch appearance.background {
        case .signature:
            return .signature
        case .design(let pack, let design):
            guard let found = catalog.wallpaper(pack: pack, design: design) else { return .signature }
            return .design(found)
        case .solid(let color):
            guard let surface = catalog.gamut.surface(color, scheme: isDark ? .dark : .light) else { return .signature }
            return .solid(hex: surface)
        case .photo(let attachmentId, let veil, let blur):
            return .photo(attachmentId: attachmentId, veil: veil, blur: blur)
        }
    }

    /// Quand la couche Lottie d'un fond joue : le réglage « Animer » de la conversation, sauf en mode économie d'énergie.
    /// « Réduire les animations » est tranché plus bas, par la couche elle-même (première image fixe).
    static func animatesLottieLayer(_ appearance: ConversationAppearance?, lowPowerMode: Bool) -> Bool {
        (appearance?.animate ?? true) && !lowPowerMode
    }

    /// « Réduire la transparence » force un voile d'au moins 0,6 : le texte des bulles reste lisible sur la photo.
    static let reducedTransparencyVeilFloor = 0.6

    static func effectiveVeil(_ veil: Double, reduceTransparency: Bool) -> Double {
        reduceTransparency ? max(veil, reducedTransparencyVeilFloor) : veil
    }

    /// L'accent qui colore les rôles `accent` du modèle : le personnel (gamme) s'il est choisi, sinon l'accent calculé de la conversation.
    static func effectiveAccentHex(_ appearance: ConversationAppearance?, computedHex: String, isDark: Bool, catalog: AppearanceCatalog = .shared) -> String {
        personalAccentHex(appearance, isDark: isDark, catalog: catalog) ?? computedHex
    }

    /// L'accent personnel choisi, dans la teinte du schéma ; `nil` pour « Automatique » ou une clé hors gamme.
    static func personalAccentHex(_ appearance: ConversationAppearance?, isDark: Bool, catalog: AppearanceCatalog = .shared) -> String? {
        guard let key = appearance?.accent else { return nil }
        return catalog.gamut.accent(key, scheme: isDark ? .dark : .light)
    }
}

// MARK: - D'où vient la photo d'un fond

struct ConversationBackgroundPhoto: Equatable, Codable {
    let thumbnailUrl: String?
    let fullUrl: String
    let thumbHash: String?

    /// La pièce connue (messages chargés, mémoire de cet appareil) d'abord ; à défaut, la route de
    /// téléchargement de la pièce, qui vérifie l'appartenance à CHAQUE lecture (un ancien membre ne
    /// la voit plus : le chargement échoue et le fond retombe sur Signature).
    static func resolve(attachmentId: String, known: MeeshyMessageAttachment?, remembered: ConversationBackgroundPhoto?, serverOrigin: String) -> ConversationBackgroundPhoto {
        if let known {
            return ConversationBackgroundPhoto(thumbnailUrl: known.thumbnailUrl, fullUrl: known.fileUrl, thumbHash: known.thumbHash)
        }
        if let remembered { return remembered }
        return ConversationBackgroundPhoto(
            thumbnailUrl: nil,
            fullUrl: serverOrigin + AttachmentsEndpoint.byAttachmentId(attachmentId: attachmentId).path,
            thumbHash: nil
        )
    }
}

/// La mémoire PAR APPAREIL des photos choisies ici : une photo choisie sur cet appareil se repeint même si
/// son message n'est pas dans la fenêtre chargée du fil. Bornée (la plus ancienne sort).
struct ConversationBackgroundPhotoMemory {
    private let defaults: UserDefaults
    private let key = "meeshy.conversation-background-photos.v1"
    private let capacity = 24

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func photo(for attachmentId: String) -> ConversationBackgroundPhoto? {
        entries().first { $0.id == attachmentId }?.photo
    }

    func remember(_ photo: ConversationBackgroundPhoto, for attachmentId: String) {
        var kept = entries().filter { $0.id != attachmentId }
        kept.append(Entry(id: attachmentId, photo: photo))
        if let data = try? JSONEncoder().encode(Array(kept.suffix(capacity))) {
            defaults.set(data, forKey: key)
        }
    }

    private struct Entry: Codable {
        let id: String
        let photo: ConversationBackgroundPhoto
    }

    private func entries() -> [Entry] {
        guard let data = defaults.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([Entry].self, from: data)) ?? []
    }
}
