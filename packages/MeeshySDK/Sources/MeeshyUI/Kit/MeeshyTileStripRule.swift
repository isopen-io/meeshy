import SwiftUI

/// **Les lois de la bande**, pures et sans écran : quelle vignette est au centre,
/// où mène un pas, ce qu'un toucher choisit, ce qui reste en solo.
public nonisolated enum MeeshyTileStripRule {

    /// La vignette sous le milieu de la bande, pour un défilement de `scrolled`
    /// points depuis la première ; les rebonds restent sur les bords.
    public static func centeredIndex(scrolled: CGFloat, pitch: CGFloat, count: Int) -> Int? {
        guard count > 0, pitch > 0 else { return nil }
        return min(count - 1, max(0, Int((scrolled / pitch).rounded())))
    }

    /// La vignette d'un pas plus loin, bornée aux extrémités. Sans courante, le
    /// pas part de la première ; sans vignette, rien.
    public static func stepping<ID: Equatable>(_ selection: ID?, in ids: [ID], by step: Int) -> ID? {
        guard !ids.isEmpty else { return nil }
        guard let selection, let index = ids.firstIndex(of: selection) else { return ids.first }
        return ids[min(max(index + step, 0), ids.count - 1)]
    }

    /// Un toucher ne répond que sur une AUTRE vignette, active : la courante ne
    /// rappelle rien et ne joue rien.
    public static func responds<ID: Equatable>(tapped: ID, selection: ID?, isEnabled: Bool) -> Bool {
        isEnabled && tapped != selection
    }

    /// Les vignettes montrées : toutes, ou seule la courante en solo (pendant
    /// qu'on filme). Sans courante, un solo n'a rien à montrer.
    public static func shown<ID: Hashable & Sendable>(
        _ tiles: [MeeshyTile<ID>],
        selection: ID?,
        isSolo: Bool
    ) -> [MeeshyTile<ID>] {
        guard isSolo else { return tiles }
        guard let selection else { return [] }
        return tiles.filter { $0.id == selection }
    }

    /// Le nom se lit sous CHAQUE vignette : `each`, hors carrousel. Un carrousel
    /// ne lit que le nom de la courante, sous la bande : jamais deux fois le même.
    public static func namesOnEachTile(_ names: MeeshyTileNames, layout: MeeshyTileStripLayout) -> Bool {
        names == .each && !layout.isCarousel
    }

    /// Le nom de la courante se lit seul, sous la bande : `current`, ou un
    /// carrousel dont les noms ne sont pas tus.
    public static func nameUnderStrip(_ names: MeeshyTileNames, layout: MeeshyTileStripLayout) -> Bool {
        names == .current || (layout.isCarousel && names != .none)
    }
}

// MARK: - L'activation

/// Ce qui se passe quand une vignette est touchée : désactivée, rien ; la
/// courante, rien (ni rappel ni haptique) ; sinon UN impact (sauf `none`), puis
/// le rappel. Une loi pure, testée sans écran.
@MainActor
enum MeeshyTileStripTrigger {
    @discardableResult
    static func perform<ID: Hashable & Sendable>(
        tapped: ID,
        selection: ID?,
        isEnabled: Bool,
        haptic: MeeshyTileHaptic,
        play: @MainActor (MeeshyTileHaptic) -> Void = MeeshyTileStripTrigger.playSystemHaptic,
        onSelect: (ID) -> Void
    ) -> Bool {
        guard MeeshyTileStripRule.responds(tapped: tapped, selection: selection, isEnabled: isEnabled) else { return false }
        if haptic != .none { play(haptic) }
        onSelect(tapped)
        return true
    }

    static func playSystemHaptic(_ haptic: MeeshyTileHaptic) {
        switch haptic {
        case .none: break
        case .light: HapticFeedback.light()
        }
    }
}

// MARK: - Ce que le lecteur d'écran entend

public nonisolated enum MeeshyTileRole: String, Sendable, Equatable, CaseIterable {
    /// Un bouton par vignette, sélectionné ou non.
    case choice
    /// UN élément qu'on ajuste d'un pas : le carrousel.
    case adjustable
}

public nonisolated enum MeeshyTileStripAccessibility {
    public static func role(for layout: MeeshyTileStripLayout) -> MeeshyTileRole {
        layout.isCarousel ? .adjustable : .choice
    }

    /// La valeur d'un carrousel : le nom de la courante, vide sans courante.
    public static func value<ID: Hashable & Sendable>(of tiles: [MeeshyTile<ID>], selection: ID?) -> String {
        guard let selection, let tile = tiles.first(where: { $0.id == selection }) else { return "" }
        return tile.name
    }
}

// MARK: - La plage visible

/// Ce qui décide qu'une plage visible vaut un rappel : seulement quand elle
/// change. Défiler d'un pixel ne dit rien.
public nonisolated struct MeeshyTileVisibleRangeTracker: Equatable, Sendable {
    private var last: ClosedRange<Int>??

    public init() {}

    public mutating func reports(_ range: ClosedRange<Int>?) -> Bool {
        guard last != .some(range) else { return false }
        last = .some(range)
        return true
    }
}
