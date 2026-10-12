import Foundation

/// Une slide du lecteur de stories, repérée par son groupe (l'auteur) et son
/// rang dans ce groupe.
public nonisolated struct StorySlidePosition: Hashable, Sendable {
    public let group: Int
    public let slide: Int

    public init(group: Int, slide: Int) {
        self.group = group
        self.slide = slide
    }
}

/// Ce que la loi doit savoir d'un groupe : combien de slides il porte, et sur
/// laquelle une avance d'auteur ATTERRIT (`StoryViewerView.entryIndex(of:)` :
/// première non vue non expirée, sinon première non expirée, sinon 0).
public nonisolated struct StoryGroupShape: Equatable, Sendable {
    public let slideCount: Int
    public let entryIndex: Int

    public init(slideCount: Int, entryIndex: Int) {
        self.slideCount = slideCount
        self.entryIndex = entryIndex
    }
}

public nonisolated enum StoryNavigationDirection: Equatable, Sendable {
    case forward
    case backward
}

/// Une slide à préparer, dans l'ordre où elle doit l'être. `distance` est son
/// rang dans l'anneau N±k (1 pour N±1, 2 pour N±2) ; `nil` hors de l'anneau
/// (reste du groupe, groupes suivants, groupe précédent).
public nonisolated struct StoryNeighborPreparation: Equatable, Sendable {
    public let position: StorySlidePosition
    public let distance: Int?

    public init(position: StorySlidePosition, distance: Int?) {
        self.position = position
        self.distance = distance
    }
}

/// **Quelles slides préparer, et dans quel ordre, dès que la slide N est à
/// l'écran** (#10348).
///
/// Le passage d'une story à sa voisine n'est instantané que si la voisine est
/// prête AVANT le geste. La loi rend la liste ORDONNÉE des slides à préparer :
///
/// 1. l'anneau N±1 puis N±2 — la voisine dans la direction du dernier passage
///    d'abord —, en traversant les frontières de groupe exactement comme le
///    lecteur les traverse : avancer depuis la dernière slide d'un groupe
///    atterrit sur l'ENTRÉE du groupe suivant, reculer depuis la première
///    atterrit sur la DERNIÈRE slide du groupe précédent ;
/// 2. le reste du groupe courant, du plus proche au plus lointain ;
/// 3. l'entrée des groupes suivants (le balayage d'auteur y atterrit depuis
///    n'importe quelle slide) ;
/// 4. la slide d'atterrissage du groupe précédent (balayage d'auteur arrière).
///
/// Bornée par `Budget` : la mémoire ne suit pas la taille des groupes.
public nonisolated enum StoryNeighborWindow {

    public nonisolated struct Budget: Equatable, Sendable {
        public let radius: Int
        public let restOfGroup: Int
        public let followingGroups: Int
        public let perFollowingGroup: Int

        public init(radius: Int, restOfGroup: Int, followingGroups: Int, perFollowingGroup: Int) {
            self.radius = radius
            self.restOfGroup = restOfGroup
            self.followingGroups = followingGroups
            self.perFollowingGroup = perFollowingGroup
        }

        /// N±2 toujours ; le reste du groupe porte la fenêtre jusqu'à N±8 au
        /// plus, sous le plafond N±10 de la directive #9702.
        public static let standard = Budget(radius: 2, restOfGroup: 6, followingGroups: 2, perFollowingGroup: 2)

        /// Le plus grand nombre de slides que la loi peut rendre.
        public var maximumCount: Int {
            radius * 2 + restOfGroup + followingGroups * perFollowingGroup + 1
        }
    }

    public static func preparations(
        from current: StorySlidePosition,
        groups: [StoryGroupShape],
        direction: StoryNavigationDirection,
        budget: Budget = .standard
    ) -> [StoryNeighborPreparation] {
        []
    }

    public static func direction(
        from previous: StorySlidePosition?,
        to current: StorySlidePosition,
        otherwise fallback: StoryNavigationDirection
    ) -> StoryNavigationDirection {
        fallback
    }
}
