import Foundation
import SwiftUI

// MARK: - Le vocabulaire des lois

/// Ce que la rangée pose, dans l'ordre : les vignettes (par rang), puis « + ».
public nonisolated enum MeeshyThumbnailRowItem: Equatable, Sendable {
    case thumbnail(Int)
    case add
}

/// Ce qu'un geste décide : aller à une vignette, la dupliquer, l'armer, ou
/// désarmer. Rien (`nil`) est une réponse : un toucher ignoré ne joue rien.
public nonisolated enum MeeshyThumbnailRowEffect<ID: Hashable & Sendable>: Equatable, Sendable {
    case select(ID)
    case duplicate(ID)
    case arm(ID)
    case disarm
}

/// Les actions que la rangée nomme au lecteur d'écran, dans cet ordre.
public nonisolated enum MeeshyThumbnailRowActionKind: String, Sendable, Equatable, CaseIterable {
    case duplicate
    case moveEarlier
    case moveLater
    case remove
}

public nonisolated enum MeeshyThumbnailRowHapticEvent: String, Sendable, Equatable, CaseIterable {
    case select
    case duplicate
    case arm
    case step
}

public nonisolated enum MeeshyThumbnailRowHapticStyle: String, Sendable, Equatable, CaseIterable {
    case light
    case medium
    case rigid
}

// MARK: - Les lois de la rangée

/// **Les lois de la rangée**, pures et sans écran : ce que chaque geste décide,
/// quelle place un glisser vise, de combien les voisines s'écartent, quand la
/// rangée avance seule. Testées sans écran, lues par les trois plateformes.
public nonisolated enum MeeshyThumbnailRowRule {

    /// Les vignettes dans leur ordre, puis « + » en dernier quand il est permis.
    public static func items(count: Int, hasAdd: Bool) -> [MeeshyThumbnailRowItem] {
        (0..<max(count, 0)).map(MeeshyThumbnailRowItem.thumbnail) + (hasAdd ? [.add] : [])
    }

    /// Ce qu'un toucher décide. Désactivée, rien. Armée, tout toucher désarme
    /// sans naviguer. Un second toucher rapide duplique (quand l'hôte le sert).
    /// Sinon une AUTRE vignette que la courante : on y va ; la courante ne
    /// répond pas.
    public static func tap<ID: Hashable & Sendable>(
        _ tapped: ID,
        current: ID?,
        armed: ID?,
        isDouble: Bool,
        isEnabled: Bool,
        canSelect: Bool,
        canDuplicate: Bool
    ) -> MeeshyThumbnailRowEffect<ID>? {
        guard isEnabled else { return nil }
        if armed != nil { return .disarm }
        if isDouble, canDuplicate { return .duplicate(tapped) }
        guard canSelect, tapped != current else { return nil }
        return .select(tapped)
    }

    /// Ce qu'un appui long décide : armer la vignette pressée, si la rangée a
    /// quelque chose à lui faire et qu'elle ne l'est pas déjà.
    public static func longPress<ID: Hashable & Sendable>(
        _ pressed: ID,
        armed: ID?,
        isEnabled: Bool,
        canArm: Bool
    ) -> MeeshyThumbnailRowEffect<ID>? {
        guard isEnabled, canArm, armed != pressed else { return nil }
        return .arm(pressed)
    }

    /// Armer a un sens quand on peut déplacer (au moins deux vignettes) ou
    /// supprimer : sinon l'appui long n'ouvre rien, et la rangée ne l'écoute pas.
    public static func canArm(count: Int, canMove: Bool, canRemove: Bool) -> Bool {
        count > 0 && ((canMove && count > 1) || canRemove)
    }

    /// Les actions nommées d'une vignette, selon les rappels présents. Déplacer
    /// plus tôt manque au début de la rangée, plus tard à sa fin.
    public static func actions(
        index: Int,
        count: Int,
        canDuplicate: Bool,
        canMove: Bool,
        canRemove: Bool
    ) -> [MeeshyThumbnailRowActionKind] {
        var kinds: [MeeshyThumbnailRowActionKind] = []
        if canDuplicate { kinds.append(.duplicate) }
        if canMove, index > 0 { kinds.append(.moveEarlier) }
        if canMove, index < count - 1 { kinds.append(.moveLater) }
        if canRemove { kinds.append(.remove) }
        return kinds
    }

    // MARK: - Le glisser

    /// La place que la vignette glissée vise : `round(translation / pas)`,
    /// bornée à la rangée. En RTL, la rangée commence à droite : un glissé vers
    /// la droite va vers le début.
    public static func targetIndex(
        from source: Int,
        translation: CGFloat,
        pitch: CGFloat,
        count: Int,
        isRightToLeft: Bool = false
    ) -> Int? {
        guard count > 0, (0..<count).contains(source), pitch > 0, translation.isFinite else { return nil }
        let travelled = isRightToLeft ? -translation : translation
        let raw = (travelled / pitch).rounded()
        let steps = Int(max(-1_000_000, min(1_000_000, raw)))
        return min(max(source + steps, 0), count - 1)
    }

    /// Le rang FINAL que reçoit `onMove`, base 0 ; `nil` quand la vignette
    /// revient à sa place.
    public static func destination(source: Int, target: Int) -> Int? {
        source == target ? nil : target
    }

    /// De combien une voisine s'écarte pendant que `source` vise `target` : un
    /// pas vers la place laissée, la place visée comprise. En RTL, le sens
    /// physique est inversé.
    public static func shift(
        of index: Int,
        source: Int,
        target: Int,
        pitch: CGFloat,
        isRightToLeft: Bool
    ) -> CGFloat {
        guard index != source, source != target else { return 0 }
        let direction: CGFloat = isRightToLeft ? -1 : 1
        if source < target, index > source, index <= target { return -pitch * direction }
        if source > target, index >= target, index < source { return pitch * direction }
        return 0
    }

    /// Le sens dans lequel une rangée défilante avance seule : -1 près du bord
    /// gauche, +1 près du bord droit, 0 ailleurs (physique, dans la zone visible).
    public static func edgeScroll(location: CGFloat, viewport: CGFloat, zone: CGFloat) -> Int {
        guard viewport > 0, zone > 0, location.isFinite else { return 0 }
        if location < zone { return -1 }
        if location > viewport - zone { return 1 }
        return 0
    }

    // MARK: - L'haptique

    /// Le cran joué : `light` à l'aller et à la duplication, `medium` à
    /// l'armement, `rigid` à chaque place franchie. `none` laisse l'hôte jouer le sien.
    public static func hapticStyle(
        for event: MeeshyThumbnailRowHapticEvent,
        haptic: MeeshyThumbnailHaptic
    ) -> MeeshyThumbnailRowHapticStyle? {
        guard haptic == .standard else { return nil }
        switch event {
        case .select, .duplicate: return .light
        case .arm: return .medium
        case .step: return .rigid
        }
    }
}

// MARK: - Le second toucher

/// Retient le dernier toucher pour dire si le suivant le double : même vignette,
/// en moins de `tapWindow`. Un double toucher consommé repart de zéro, pour
/// qu'un troisième toucher ne duplique pas une seconde fois.
public nonisolated struct MeeshyThumbnailRowTapTracker<ID: Hashable & Sendable>: Equatable, Sendable {
    private struct Entry: Equatable, Sendable {
        let id: ID
        let time: TimeInterval
    }

    private var last: Entry?

    public init() {}

    public mutating func isDouble(_ id: ID, at time: TimeInterval) -> Bool {
        if let last, last.id == id, time >= last.time, time - last.time < MeeshyThumbnailRowRecipe.tapWindow {
            self.last = nil
            return true
        }
        last = Entry(id: id, time: time)
        return false
    }

    public mutating func reset() {
        last = nil
    }
}

// MARK: - Ce que le lecteur d'écran entend

/// Les actions nommées d'une vignette : celles de la rangée (selon ses
/// rappels), puis celles de l'hôte. Les noms viennent de `words` et de
/// `removeLabel` : la rangée n'en fabrique aucun.
public nonisolated enum MeeshyThumbnailRowAccessibility {
    public static func name(
        of kind: MeeshyThumbnailRowActionKind,
        words: MeeshyThumbnailRowWords,
        removeLabel: String?
    ) -> String {
        switch kind {
        case .duplicate: return words.duplicate
        case .moveEarlier: return words.moveEarlier
        case .moveLater: return words.moveLater
        case .remove: return removeLabel ?? ""
        }
    }
}
