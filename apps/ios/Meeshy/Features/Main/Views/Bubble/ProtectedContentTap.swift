import Foundation
import MeeshySDK

/// **Ce que fait un toucher sur un contenu protégé** (#8009) — la décision
/// UNIQUE que Script, Focal et Bulles consomment.
///
/// Demande porteur du 2026-09-26 : « le comportement au toucher d'un message
/// flou ou à vue unique […] affiche clairement le contenu. Un contenu média
/// caché s'ouvre directement en plein écran. »
///
/// Avant ce lot, la réponse dépendait du site : le voile d'un message FLOUTÉ
/// dévoilait la bulle cinq secondes — il fallait un SECOND toucher pour ouvrir
/// sa photo —, et une cellule de grille protégée ne répondait qu'à un APPUI
/// LONG, en dévoilant la vignette sur place. La règle vit désormais ici :
///
/// | contenu | toucher |
/// |---|---|
/// | texte flouté | clair sur place ; le flou revient après la durée de visibilité (5 s par défaut, `BubbleBlurRevealLifecycle`) |
/// | média flouté (image, vidéo, cellule) | plein écran DIRECT sur CE média, net ; la bulle reste voilée |
/// | vue unique scellée, texte | lu sur place ; « déjà ouvert » au retoucher, à la sortie de l'écran ou de la conversation (#7579) |
/// | vue unique scellée, média | plein écran DIRECT ; « déjà ouvert » à la fermeture (#7499) |
/// | vue unique déjà ouverte | rien ne se rouvre |
///
/// Le mien et le reçu suivent la même règle : l'auteur ouvre sa vue unique une
/// fois, comme les autres (#7618).
nonisolated enum ProtectedContentTap {
    /// Rien de protégé : le geste ordinaire du contenu s'applique.
    case none
    /// Texte flouté : montré en clair sur place, le temps de la visibilité.
    case revealText
    /// Média caché : le plein écran s'ouvre directement sur cette pièce.
    case openFullscreen(MessageAttachment)
    /// Vue unique scellée : l'hôte l'ouvre (`ConversationViewModel.openViewOnce`)
    /// — en plein écran pour un média, sur place pour un texte. Le contenu
    /// n'est pas dans le modèle scellé, c'est l'hôte qui le retrouve.
    case openViewOnce(fullscreen: Bool)
    /// Texte à vue unique déjà révélé : le retoucher le referme, consommé.
    case closeViewOnce
    /// Vue unique déjà consommée par ce lecteur : rien ne se rouvre.
    case alreadyOpened

    /// Ce que fait un toucher sur une CELLULE de grille dont la pièce porte
    /// elle-même sa protection.
    static func resolve(cell attachment: MessageAttachment) -> ProtectedContentTap {
        guard attachment.isBlurred || attachment.isViewOnce, opensFullscreen(attachment) else { return .none }
        return .openFullscreen(attachment)
    }

    /// Seules une image (sticker compris) et une vidéo ont un plein écran.
    static func opensFullscreen(_ attachment: MessageAttachment) -> Bool {
        attachment.type == .image || attachment.type == .video
    }

    /// L'indice d'une pièce cachée : son toucher ouvre le plein écran.
    static var openFullscreenHint: String {
        String(localized: "protection.tap.a11y.open_fullscreen",
               defaultValue: "Touchez pour ouvrir le média en plein écran", bundle: .main)
    }

    /// Le libellé VoiceOver : ce que fait le toucher, dit avant qu'on le fasse.
    var accessibilityHint: String? {
        switch self {
        case .none, .alreadyOpened:
            return nil
        case .revealText:
            return String(localized: "protection.tap.a11y.reveal_text",
                          defaultValue: "Touchez pour afficher le texte en clair", bundle: .main)
        case .openFullscreen, .openViewOnce(fullscreen: true):
            return Self.openFullscreenHint
        case .openViewOnce(fullscreen: false):
            return String(localized: "protection.tap.a11y.open_view_once_text",
                          defaultValue: "Touchez pour afficher le message, lisible une seule fois", bundle: .main)
        case .closeViewOnce:
            return String(localized: "protection.tap.a11y.close_view_once",
                          defaultValue: "Touchez pour refermer le message, qui passera à déjà ouvert", bundle: .main)
        }
    }
}

extension ProtectedContentTap: Equatable {
    static func == (lhs: ProtectedContentTap, rhs: ProtectedContentTap) -> Bool {
        switch (lhs, rhs) {
        case (.none, .none), (.revealText, .revealText),
             (.closeViewOnce, .closeViewOnce), (.alreadyOpened, .alreadyOpened):
            return true
        case (.openFullscreen(let a), .openFullscreen(let b)):
            return a.id == b.id
        case (.openViewOnce(let a), .openViewOnce(let b)):
            return a == b
        default:
            return false
        }
    }
}

extension BubbleContent {

    /// Les pièces visuelles du message, dans l'ordre de la grille.
    var visualMedia: [MessageAttachment] {
        switch attachments {
        case .visualGrid(let items): return items
        case .mixed(let visual, _, _): return visual
        case .none, .audio, .nonMedia: return []
        }
    }

    /// Ce que fait un toucher sur ce message — sur son voile, ou sur la
    /// cellule `media` de sa grille quand c'est elle qu'on touche.
    func protectedTap(on media: MessageAttachment? = nil) -> ProtectedContentTap {
        switch kind {
        case .viewOnceOpened:
            return .alreadyOpened
        case .viewOnceSealed:
            return .openViewOnce(fullscreen: viewOnceOpensFullscreen)
        default:
            break
        }
        if isViewOnceRevealed { return .closeViewOnce }
        if isViewOnce { return .openViewOnce(fullscreen: false) }
        if let media, ProtectedContentTap.opensFullscreen(media), isBlurred || media.isBlurred || media.isViewOnce {
            return .openFullscreen(media)
        }
        guard isBlurred else { return .none }
        if let first = visualMedia.first(where: ProtectedContentTap.opensFullscreen) {
            return .openFullscreen(first)
        }
        return .revealText
    }
}
