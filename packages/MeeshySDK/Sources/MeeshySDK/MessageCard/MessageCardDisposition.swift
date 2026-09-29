import Foundation

/// **LA DISPOSITION D'UNE CARTE « IMAGINE »** (#8692) — ce que l'exportateur
/// choisit, en plus du template, pour POSER ce qui existe : le format de
/// l'image, l'orientation de l'en-tête, la place des noms, l'inclinaison du
/// message, la disposition des médias et la représentation d'un son.
///
/// Chaque dimension a une valeur NEUTRE (`.standard`) qui rend exactement la
/// carte d'avant : un format enregistré avant #8692 se relit à l'identique.

/// Le FORMAT de l'image. `auto` garde la carte adaptative (1080 de large, de
/// 1080 à 1920 de haut selon le texte) ; les quatre autres FIXENT la toile.
public enum MessageCardAspect: String, CaseIterable, Sendable {
    case auto, story, portrait, square, landscape

    public var width: Double { self == .landscape ? 1920 : 1080 }

    /// `nil` : la hauteur suit le texte.
    public var fixedHeight: Double? {
        switch self {
        case .auto: return nil
        case .story: return 1920
        case .portrait: return 1350
        case .square, .landscape: return 1080
        }
    }

    /// Le rapport tel qu'on le lit sous la vignette — `nil` pour l'adaptatif.
    public var ratio: String? {
        switch self {
        case .auto: return nil
        case .story: return "9:16"
        case .portrait: return "4:5"
        case .square: return "1:1"
        case .landscape: return "16:9"
        }
    }
}

/// Comment l'en-tête (titre de la conversation, date) s'écrit : en ligne,
/// lettre à lettre en colonne, ou couché — il se lit alors en montant ou en
/// descendant, le long du bord de la carte.
public enum MessageCardHeaderOrientation: String, CaseIterable, Sendable {
    case horizontal, stacked, rotatedUp, rotatedDown

    /// L'en-tête quitte le haut de la carte pour une colonne sur le côté.
    public var isVertical: Bool { self != .horizontal }
}

/// Où se lit le nom de l'auteur : au-dessus de son texte, ou en signature à la fin.
public enum MessageCardAuthorPlacement: String, CaseIterable, Sendable {
    case above, after
}

/// L'inclinaison du message sur la carte — l'en-tête et le filigrane restent droits.
public enum MessageCardTilt: String, CaseIterable, Sendable {
    case none, left, right

    public var degrees: Double {
        switch self {
        case .none: return 0
        case .left: return -4
        case .right: return 4
        }
    }

    public var radians: Double { degrees * .pi / 180 }
}

/// Comment les médias d'un message se posent sur la carte.
public enum MessageCardMediaLayout: String, CaseIterable, Sendable {
    /// Le premier média, en grand, au-dessus du texte.
    case above
    /// Le premier média, en grand, sous le texte.
    case below
    /// Jusqu'à quatre médias en mosaïque, au-dessus du texte.
    case mosaic
    /// La première image (ou la première image de la vidéo) EN FOND, sous un voile.
    case backdrop
}

/// Comment un son se représente sur une image — au même titre que les liaisons.
public enum MessageCardAudioStyle: String, CaseIterable, Sendable {
    /// Une onde : des barres dont la hauteur suit le volume.
    case wave
    /// Une pastille : le bouton de lecture, une onde fine et la durée.
    case pill
    /// Un spectre : des barres en miroir autour d'une ligne.
    case spectrum
    /// Une fiche : le nom du fichier et sa durée, sous une icône de note.
    case ticket
}

/// Les choix de disposition, portés ensemble par le format et par l'entrée de la mise en page.
public struct MessageCardDisposition: Equatable, Sendable {
    public var aspect: MessageCardAspect
    public var headerOrientation: MessageCardHeaderOrientation
    public var authorPlacement: MessageCardAuthorPlacement
    public var tilt: MessageCardTilt
    public var mediaLayout: MessageCardMediaLayout
    public var audioStyle: MessageCardAudioStyle

    public init(
        aspect: MessageCardAspect = .auto,
        headerOrientation: MessageCardHeaderOrientation = .horizontal,
        authorPlacement: MessageCardAuthorPlacement = .above,
        tilt: MessageCardTilt = .none,
        mediaLayout: MessageCardMediaLayout = .above,
        audioStyle: MessageCardAudioStyle = .wave
    ) {
        self.aspect = aspect
        self.headerOrientation = headerOrientation
        self.authorPlacement = authorPlacement
        self.tilt = tilt
        self.mediaLayout = mediaLayout
        self.audioStyle = audioStyle
    }

    /// La carte d'avant #8692 : adaptative, en-tête en ligne, noms au-dessus, droite.
    public static let standard = MessageCardDisposition()
}
