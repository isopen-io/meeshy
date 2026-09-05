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
    /// **Le CENTRE de la recherche — `nil` ⇒ la position de l'appareil**
    /// (directive porteur 2026-09-05 : « il faut permettre de choisir sa
    /// position exacte et ça charge les autres éléments autour »).
    ///
    /// Le paramètre est arrivé APRÈS coup, et le `nil` porte exactement
    /// l'ancien comportement : sans centre choisi, on cherche là où l'appareil
    /// est. Ce qui change est qu'un centre CHOISI devienne exprimable — il ne
    /// l'était pas, et c'est ce qui rendait la demande impossible à servir sans
    /// toucher au contrat.
    public typealias Nearby = @MainActor (SharedPlace?) async -> [SharedPlace]

    private let nearbyProvider: Nearby

    public init(nearby: @escaping Nearby) {
        self.nearbyProvider = nearby
    }

    /// Les lieux proches, du plus proche au plus lointain. Vide = l'onglet se
    /// rend quand même, avec son état vide : l'auteur a autorisé la
    /// localisation, il doit voir qu'on cherche et qu'on n'a rien trouvé —
    /// ce qui n'est pas la même chose que « cette app ne sait pas faire ».
    ///
    /// - Parameter around: le lieu autour duquel chercher. `nil` ⇒ la position
    ///   de l'appareil, le cas nominal à l'ouverture.
    @MainActor
    public func nearby(around centre: SharedPlace? = nil) async -> [SharedPlace] {
        await nearbyProvider(centre)
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
    /// Le troisième lot (#4820) : ce qu'on mange, ce qu'on court.
    case food
    case sport
    /// Le quatrième lot (#4820) : partir, la journée, ce qu'on écoute.
    case travel
    case work
    case music
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
        .availability, .cheer, .answer, .nature, .food, .sport,
        .travel, .work, .music,
        .time, .weather, .place, .library,
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
        case .food: return .food
        case .sport: return .sport
        case .travel: return .travel
        case .work: return .work
        case .music: return .music
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
        case .food: return "fork.knife"
        case .sport: return "figure.run"
        case .travel: return "airplane"
        case .work: return "briefcase"
        case .music: return "music.note"
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
    /// - Parameter hasNearbyPlaces: un fournisseur de lieux alentour est-il
    ///   injecté ? **Il ne décide plus de la présence de l'onglet LIEU**
    ///   (directive porteur 2026-09-05 : « il manque les Localisation,
    ///   plusieurs styles pour montrer la localisation ! »).
    ///
    ///   Il la décidait, et le motif écrit était la loi 4 — « un outil qu'on ne
    ///   peut pas servir est absent, jamais grisé ». Le motif est juste et ne
    ///   s'appliquait pas : **les dix styles de lieu n'ont pas besoin du GPS.**
    ///   Seule la DONNÉE en a besoin. Autorisation refusée, simulateur sans
    ///   position, intérieur d'un bâtiment — et le catalogue entier
    ///   disparaissait, dessinateurs et traductions compris.
    ///
    ///   > « On ne peut pas servir » et « on n'a pas encore de quoi remplir »
    ///   > sont deux états différents, et un seul justifie une absence. Le
    ///   > second se dit, il ne se cache pas : `textTab` le fait depuis
    ///   > toujours — il montre ses styles avant qu'un mot soit tapé.
    ///
    ///   Le paramètre RESTE au contrat : il gouverne toujours ce que la section
    ///   PEUT faire (les puces de lieu, et l'activation de la grille). Le
    ///   retirer aurait fait croire que la palette ignore la position.
    public static func offered(hasLibrary: Bool, hasNearbyPlaces: Bool) -> [StickerPaletteTab] {
        _ = hasNearbyPlaces
        return canonicalOrder.filter { onglet in
            switch onglet {
            case .library: return hasLibrary
            case .place:   return true
            case .emoji, .text, .love, .joy, .surprise, .mood, .greeting, .reaction,
                 .party, .availability, .nature, .cheer, .answer, .food, .sport,
                 .travel, .work, .music, .time, .weather:
                return true
            }
        }
    }
}
