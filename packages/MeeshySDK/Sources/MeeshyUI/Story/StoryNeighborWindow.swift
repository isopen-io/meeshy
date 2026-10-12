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
        guard groups.indices.contains(current.group),
              (0..<groups[current.group].slideCount).contains(current.slide) else { return [] }

        let ring = ringPreparations(from: current, groups: groups, direction: direction, radius: budget.radius)
        let reserved = Set(ring.map(\.position)).union([current])
        let rest = groupSlidesByDistance(from: current, groups: groups, direction: direction)
            .filter { !reserved.contains($0) }
            .prefix(max(budget.restOfGroup, 0))
        let tail = Array(rest)
            + followingGroupEntries(after: current.group, groups: groups, budget: budget)
            + [landing(in: previousGroup(before: current.group, groups: groups), groups: groups)].compactMap { $0 }

        let extended = tail
            .filter { !reserved.contains($0) }
            .reduce(into: [StorySlidePosition]()) { kept, position in
                if !kept.contains(position) { kept.append(position) }
            }
            .map { StoryNeighborPreparation(position: $0, distance: nil) }
        return ring + extended
    }

    /// Lit le sens du dernier passage dans le déplacement lui-même : un groupe
    /// plus loin, ou une slide plus loin dans le même groupe, c'est avancer.
    /// Sans déplacement, le sens précédent tient.
    public static func direction(
        from previous: StorySlidePosition?,
        to current: StorySlidePosition,
        otherwise fallback: StoryNavigationDirection
    ) -> StoryNavigationDirection {
        guard let previous, previous != current else { return fallback }
        if current.group != previous.group {
            return current.group > previous.group ? .forward : .backward
        }
        return current.slide > previous.slide ? .forward : .backward
    }

    /// Où atterrit un balayage d'AUTEUR depuis le groupe `group`, quelle que
    /// soit la slide affichée : l'entrée du groupe suivant, puis la dernière
    /// slide du groupe précédent (le balayage arrière y atterrit, jamais sur
    /// la première).
    public static func authorSwipeLandings(
        from group: Int,
        groups: [StoryGroupShape]
    ) -> [StorySlidePosition] {
        guard groups.indices.contains(group) else { return [] }
        let next = nextGroup(after: group, groups: groups).map {
            StorySlidePosition(group: $0, slide: entry(of: groups[$0]))
        }
        let previous = landing(in: previousGroup(before: group, groups: groups), groups: groups)
        return [next, previous].compactMap { $0 }
    }

    /// Le pas du lecteur (`goToNext` / `goToPrevious`) : dans le groupe, la
    /// slide voisine ; à la frontière, l'ENTRÉE du groupe suivant en avançant,
    /// la DERNIÈRE slide du groupe précédent en reculant. Un groupe vide est
    /// enjambé.
    static func step(
        from position: StorySlidePosition,
        _ direction: StoryNavigationDirection,
        groups: [StoryGroupShape]
    ) -> StorySlidePosition? {
        switch direction {
        case .forward:
            if position.slide + 1 < groups[position.group].slideCount {
                return StorySlidePosition(group: position.group, slide: position.slide + 1)
            }
            return nextGroup(after: position.group, groups: groups).map {
                StorySlidePosition(group: $0, slide: entry(of: groups[$0]))
            }
        case .backward:
            if position.slide > 0 {
                return StorySlidePosition(group: position.group, slide: position.slide - 1)
            }
            return landing(in: previousGroup(before: position.group, groups: groups), groups: groups)
        }
    }

    private static func ringPreparations(
        from current: StorySlidePosition,
        groups: [StoryGroupShape],
        direction: StoryNavigationDirection,
        radius: Int
    ) -> [StoryNeighborPreparation] {
        let leading = chain(from: current, direction, groups: groups, length: radius)
        let trailing = chain(from: current, direction.opposite, groups: groups, length: radius)
        return (0..<max(radius, 0)).flatMap { offset in
            [leading, trailing].compactMap { side in
                side.indices.contains(offset)
                    ? StoryNeighborPreparation(position: side[offset], distance: offset + 1)
                    : nil
            }
        }
    }

    private static func chain(
        from origin: StorySlidePosition,
        _ direction: StoryNavigationDirection,
        groups: [StoryGroupShape],
        length: Int
    ) -> [StorySlidePosition] {
        Array(
            sequence(first: origin) { step(from: $0, direction, groups: groups) }
                .dropFirst()
                .prefix(max(length, 0))
        )
    }

    /// Les autres slides du groupe courant, de la plus proche à la plus
    /// lointaine, celle du sens du geste d'abord à distance égale.
    private static func groupSlidesByDistance(
        from current: StorySlidePosition,
        groups: [StoryGroupShape],
        direction: StoryNavigationDirection
    ) -> [StorySlidePosition] {
        let count = groups[current.group].slideCount
        let sign = direction == .forward ? 1 : -1
        return (1..<max(count, 1))
            .flatMap { distance in [current.slide + sign * distance, current.slide - sign * distance] }
            .filter { (0..<count).contains($0) }
            .map { StorySlidePosition(group: current.group, slide: $0) }
    }

    private static func followingGroupEntries(
        after group: Int,
        groups: [StoryGroupShape],
        budget: Budget
    ) -> [StorySlidePosition] {
        let following = sequence(first: group) { nextGroup(after: $0, groups: groups) }
            .dropFirst()
            .prefix(max(budget.followingGroups, 0))
        return following.flatMap { index -> [StorySlidePosition] in
            let shape = groups[index]
            let start = entry(of: shape)
            let end = min(shape.slideCount, start + max(budget.perFollowingGroup, 0))
            return (start..<max(start, end)).map { StorySlidePosition(group: index, slide: $0) }
        }
    }

    private static func nextGroup(after group: Int, groups: [StoryGroupShape]) -> Int? {
        groups.indices.first { $0 > group && groups[$0].slideCount > 0 }
    }

    private static func previousGroup(before group: Int, groups: [StoryGroupShape]) -> Int? {
        groups.indices.last { $0 < group && groups[$0].slideCount > 0 }
    }

    private static func landing(in group: Int?, groups: [StoryGroupShape]) -> StorySlidePosition? {
        group.map { StorySlidePosition(group: $0, slide: groups[$0].slideCount - 1) }
    }

    private static func entry(of shape: StoryGroupShape) -> Int {
        min(max(shape.entryIndex, 0), shape.slideCount - 1)
    }
}

private extension StoryNavigationDirection {
    nonisolated var opposite: StoryNavigationDirection {
        self == .forward ? .backward : .forward
    }
}
