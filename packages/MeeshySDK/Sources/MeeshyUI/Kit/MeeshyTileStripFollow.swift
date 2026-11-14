import Foundation

/// **Ce que le défilement choisit.** La vignette arrivée au centre est choisie,
/// sauf pendant un défilement que la bande fait D'ELLE-MÊME (à l'ouverture, ou
/// vers une vignette touchée) : les vignettes qu'elle traverse alors ne sont
/// pas des choix, et y répondre la ferait courir après elle-même. Un tel
/// défilement que le doigt interrompt se solde au repos.
public nonisolated struct MeeshyTileStripFollow: Equatable, Sendable {

    /// Ce que la bande fait en s'arrêtant.
    public enum Rest: Equatable, Sendable {
        case nothing
        /// Elle repose ailleurs que sur le choix : cette vignette est choisie.
        case choose(Int)
        /// Elle n'a pas bougé vers sa cible : elle la rejoint.
        case rejoin(Int)
    }

    /// La vignette que la bande rejoint d'elle-même ; `nil` ⇒ elle suit le doigt.
    public private(set) var target: Int?
    public private(set) var centered: Int?
    public private(set) var hasBegun = false
    /// Le centre a changé depuis que la cible est posée.
    private var movedSinceTarget = false

    public init() {}

    /// La bande s'ouvre en tête, puis rejoint la vignette choisie.
    public mutating func begin(chosen: Int?) {
        hasBegun = true
        target = chosen
        movedSinceTarget = false
    }

    /// `index` est arrivée au centre : la vignette à choisir, `nil` si rien ne change.
    public mutating func centered(on index: Int, chosen: Int?, selects: Bool) -> Int? {
        let before = centered
        centered = index
        guard let target else { return selects && index != chosen ? index : nil }
        if let before, before != index { movedSinceTarget = true }
        if target == index { self.target = nil }
        return nil
    }

    /// Le choix vient de changer : la vignette où défiler, `nil` si elle est déjà
    /// au centre. Un choix né du défilement ne fait rien défiler.
    public mutating func chose(_ index: Int) -> Int? {
        movedSinceTarget = false
        guard index != centered else {
            target = nil
            return nil
        }
        target = index
        return index
    }

    /// La bande s'est arrêtée. Une cible qu'elle n'a pas commencé à rejoindre
    /// se rejoint, jamais la première choisie parce que la bande s'est ouverte en
    /// tête ; un trajet que le doigt a coupé choisit la vignette où il s'arrête.
    public mutating func settled(chosen: Int?, selects: Bool) -> Rest {
        if let target, !movedSinceTarget { return .rejoin(target) }
        target = nil
        movedSinceTarget = false
        guard selects, let centered, centered != chosen else { return .nothing }
        return .choose(centered)
    }
}
