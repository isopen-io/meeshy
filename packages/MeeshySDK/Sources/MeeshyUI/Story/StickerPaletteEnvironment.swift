import SwiftUI
import MeeshySDK

// MARK: - Les lieux ALENTOUR, injectés par l'app

/// Ce que la palette de stickers doit savoir des lieux proches (#4579).
///
/// **Injecté par l'app**, même doctrine que `StoryStickerLibraryProvider` : la
/// localisation demande une permission, un `CLLocationManager` et une politique
/// de rafraîchissement — trois décisions produit qui n'ont rien à faire dans un
/// SDK d'atomes.
///
/// Le défaut `nil` EST la règle produit : sans injection, l'onglet « Lieu »
/// n'est pas rendu du tout. Loi 4 — un outil non servi est ABSENT, jamais
/// grisé. Un onglet grisé promettrait une capacité que le site de montage ne
/// possède pas.
public nonisolated struct StickerNearbyPlacesProvider {
    public typealias Nearby = @MainActor () async -> [SharedPlace]

    private let nearbyProvider: Nearby

    public init(nearby: @escaping Nearby) {
        self.nearbyProvider = nearby
    }

    /// Les lieux proches, du plus proche au plus lointain. Vide = l'onglet se
    /// rend quand même, avec son état vide : l'auteur a autorisé la
    /// localisation, il doit voir qu'on cherche et qu'on n'a rien trouvé —
    /// ce qui n'est pas la même chose que « cette app ne sait pas faire ».
    @MainActor
    public func nearby() async -> [SharedPlace] {
        await nearbyProvider()
    }
}

public struct StickerNearbyPlacesKey: EnvironmentKey {
    public static let defaultValue: StickerNearbyPlacesProvider? = nil
}

// MARK: - L'horloge

/// **L'horloge de la palette — injectable, donc le gel est TESTABLE.**
///
/// Elle a un défaut (`Date.init`) et n'est donc jamais absente : contrairement
/// aux lieux, une horloge existe toujours, et l'onglet « Heure » n'a aucune
/// raison d'être conditionnel.
///
/// Ce qu'elle sert est lu **une fois, à l'ouverture de la palette**, et figé
/// dans les emplacements du gabarit au moment de la pose (décision D1 du
/// 2026-09-01). Rien en aval ne la relit : c'est ce qui fait que tout lecteur
/// voit l'heure que l'auteur a posée.
public struct StickerPaletteClockKey: EnvironmentKey {
    public static let defaultValue: @Sendable () -> Date = { Date() }
}

extension EnvironmentValues {
    public var stickerNearbyPlaces: StickerNearbyPlacesProvider? {
        get { self[StickerNearbyPlacesKey.self] }
        set { self[StickerNearbyPlacesKey.self] = newValue }
    }

    public var stickerPaletteClock: @Sendable () -> Date {
        get { self[StickerPaletteClockKey.self] }
        set { self[StickerPaletteClockKey.self] = newValue }
    }
}

// MARK: - Les onglets de la palette

/// **Ce que la porte sticker ouvre** (#4579) : non pas un clavier d'emoji, mais
/// une palette de CONSTRUCTIONS.
///
/// > « Dans l'icône (smile/sticker) il faudra juste proposer directement des
/// > constructions permettant de mettre des chips de lieu (en prenant les lieux
/// > autour), des chips de son, etc. — qu'on peut positionner, grandir sur la
/// > scène. Ça évite d'avoir plusieurs icônes redondants. »
/// > — directive porteur, 2026-08-31
///
/// L'ordre est écrit en toutes lettres, comme `ComposerRailDoor.canonicalRail` :
/// l'ordre de déclaration peut bouger sans que personne le décide, la position
/// que les doigts apprennent, non.
public enum StickerPaletteTab: String, CaseIterable, Identifiable, Sendable {
    case emoji
    /// Les MOTS de l'auteur dans un cadre (#4822).
    case text
    case love
    case joy
    case surprise
    case mood
    case greeting
    case reaction
    case party
    case availability
    /// Le second lot de thèmes (#4820) : nature, encouragement, réponses.
    case nature
    case cheer
    case answer
    case time
    case weather
    case place
    case library

    public var id: String { rawValue }

    /// L'ordre de la palette. Les décorations viennent AVANT le lieu parce
    /// qu'elles ne dépendent de rien ; « Mes stickers » ferme la marche parce
    /// que c'est le seul onglet dont le contenu appartient à l'utilisateur.
    public static let canonicalOrder: [StickerPaletteTab] = [
        .emoji, .text, .love, .joy, .surprise, .mood, .greeting, .reaction, .party,
        .availability, .cheer, .answer, .nature, .time, .weather, .place, .library,
    ]

    /// La famille de gabarits que l'onglet montre — `nil` pour les deux onglets
    /// qui ne montrent pas de gabarits.
    public var templateFamily: StickerTemplateFamily? {
        switch self {
        case .text:         return .text
        case .love:         return .love
        case .joy:          return .joy
        case .surprise:     return .surprise
        case .mood:         return .mood
        case .greeting:     return .greeting
        case .reaction:     return .reaction
        case .party:        return .party
        case .availability: return .availability
        case .nature: return .nature
        case .cheer: return .cheer
        case .answer: return .answer
        case .time:         return .time
        case .weather:      return .weather
        case .place:   return .location
        case .emoji, .library: return nil
        }
    }

    /// Le glyphe de l'onglet. Jeu SF LIGNE, comme le rail : chaque glyphe DIT
    /// ce que l'onglet pose.
    public var symbolName: String {
        switch self {
        case .emoji:   return "face.smiling"
        case .text:    return "text.bubble"
        case .love:    return "heart"
        case .joy:          return "sparkles"
        case .surprise:     return "exclamationmark.bubble"
        case .mood:         return "face.dashed"
        case .greeting:     return "hand.wave"
        case .reaction:     return "hand.thumbsup"
        case .party:        return "party.popper"
        case .availability: return "person.crop.circle.badge.checkmark"
        case .nature: return "leaf"
        case .cheer: return "hands.clap"
        case .answer: return "questionmark.bubble"
        case .time:    return "clock"
        case .weather: return "cloud.sun"
        case .place:   return "mappin.and.ellipse"
        case .library: return "square.stack"
        }
    }

    /// **Les onglets que la palette MONTRE — la loi 4 en une fonction.**
    ///
    /// - Parameter hasLibrary: « Mes stickers » n'existe que si l'app a injecté
    ///   son magasin (`storyStickerLibraryProvided`).
    /// - Parameter hasNearbyPlaces: l'onglet « Lieu » n'existe que si l'app sait
    ///   chercher les lieux alentour. Sans fournisseur, ouvrir un onglet vide
    ///   promettrait une capacité que le site de montage n'a pas.
    ///
    /// Emoji, amour, heure et météo ne dépendent de rien : ils sont toujours là.
    public static func offered(hasLibrary: Bool, hasNearbyPlaces: Bool) -> [StickerPaletteTab] {
        canonicalOrder.filter { onglet in
            switch onglet {
            case .library: return hasLibrary
            case .place:   return hasNearbyPlaces
            case .emoji, .text, .love, .joy, .surprise, .mood, .greeting, .reaction,
                 .party, .availability, .nature, .cheer, .answer, .time, .weather:
                return true
            }
        }
    }
}
