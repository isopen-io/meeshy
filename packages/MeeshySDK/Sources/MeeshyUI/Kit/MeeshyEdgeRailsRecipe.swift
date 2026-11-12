import SwiftUI

/// Le côté de l'écran où se pose un rail : celui de début ou celui de fin de
/// lecture, retournés ensemble en écriture de droite à gauche.
public nonisolated enum MeeshyEdgeRailSide: String, Sendable, Equatable, CaseIterable {
    case leading
    case trailing
}

/// Les trois largeurs d'un rail libellé, en points.
public nonisolated enum MeeshyEdgeRailWidth: String, Sendable, Equatable, CaseIterable {
    case regular
    case narrow
    case tight

    public var points: CGFloat {
        switch self {
        case .regular: return 210
        case .narrow: return 150
        case .tight: return 112
        }
    }
}

/// Court et sans texte (il sort à la demande et se range par son bord), ou
/// libellé (il reste sorti quand la place existe). L'hôte élit : K12 exécute.
public nonisolated enum MeeshyEdgeRailsPresentation: Sendable, Equatable {
    case compact
    case labeled(MeeshyEdgeRailWidth)
}

public nonisolated enum MeeshyEdgeRailsVisibility: String, Sendable, Equatable, CaseIterable {
    case shown
    case dimmed
    case hidden
}

public nonisolated enum MeeshyEdgeRailRole: String, Sendable, Equatable, CaseIterable {
    case normal
    case destructive
}

/// Ce que l'hôte garde libre autour d'un rail (pilule, ma vignette, colonne du
/// journal), en points : le rail se centre dans ce qui reste.
public nonisolated struct MeeshyEdgeRailClearance: Sendable, Equatable {
    public var top: CGFloat
    public var bottom: CGFloat
    public var inline: CGFloat

    public init(top: CGFloat = 0, bottom: CGFloat = 0, inline: CGFloat = 0) {
        self.top = top
        self.bottom = bottom
        self.inline = inline
    }

    public static let zero = MeeshyEdgeRailClearance()
}

/// **La recette des rails d'actions** (K12) en VALEURS : toute mesure du rail
/// vit ici, nulle part ailleurs, et ses lois sont pures, lues sans écran.
public nonisolated enum MeeshyEdgeRailsRecipe {

    // MARK: Le rail court

    public static let discSide: CGFloat = MeeshyControlSize.tapTarget
    public static let compactSpacing: CGFloat = MeeshySpacing.xsPlus
    public static let compactPadding: CGFloat = 5
    public static let compactWidth: CGFloat = discSide + 2 * compactPadding
    public static let dividerHeight: CGFloat = 1
    public static let dividerInset: CGFloat = MeeshySpacing.sm
    public static let compactDividerOpacity = 0.28
    public static let labeledDividerOpacity = 0.14
    public static let carriedDotSide: CGFloat = 8
    public static let carriedDotInset: CGFloat = 6
    public static let edgeFade: CGFloat = MeeshySpacing.xxl

    // MARK: Le rail libellé

    public static let labeledRadius: CGFloat = 26
    public static let rowHeight: CGFloat = MeeshyControlSize.tapTarget
    public static let rowRadius: CGFloat = MeeshyRadius.xlPlus
    public static let rowSpacing: CGFloat = MeeshySpacing.xs
    public static let glyphSide: CGFloat = MeeshyControlSize.tapTarget
    public static let glyphSize: CGFloat = MeeshyIconSize.xl
    public static let trailingInset: CGFloat = MeeshySpacing.md
    public static let headerSize: CGFloat = MeeshyFont.smallSize
    public static let headerTrackingEm = 0.08
    public static let headerOpacity = 0.75
    public static let headerTop: CGFloat = MeeshySpacing.xs
    public static let headerLeading: CGFloat = MeeshySpacing.smPlus
    public static let headerBottom: CGFloat = MeeshySpacing.xsPlus
    public static let headerBlock: CGFloat = 26
    public static let footMargin: CGFloat = MeeshySpacing.xsPlus
    public static let footInset: CGFloat = MeeshySpacing.sm
    public static let footSpacing: CGFloat = MeeshySpacing.xsPlus

    /// Le couloir à partir duquel chaque largeur est élue.
    public static let laneForRegular: CGFloat = 250
    public static let laneForNarrow: CGFloat = 166

    // MARK: Opacités, durées, bords

    public static let defaultEdgeInset: CGFloat = MeeshySpacing.smPlus
    public static let dimmedOpacity = 0.42
    public static let disabledOpacity = MeeshyGlassButtonRecipe.disabledOpacity
    public static let itemDimmedOpacity = 0.6
    public static let slideSeconds = 0.3
    public static let dimSeconds = 0.18
    public static let reducedFadeSeconds = 0.15
    public static let rowTintSeconds = 0.2
    public static let longPressSeconds = MeeshyGlassButtonRecipe.longPressDuration
    public static let longPressMaxMovement = MeeshyGlassButtonRecipe.longPressMaxMovement

    // MARK: Ce qui dépend de la largeur

    public static func padding(_ width: MeeshyEdgeRailWidth) -> CGFloat {
        width == .narrow ? MeeshySpacing.sm : MeeshySpacing.smPlus
    }

    public static func glyphGap(_ width: MeeshyEdgeRailWidth) -> CGFloat {
        width == .narrow ? MeeshySpacing.xs : MeeshySpacing.smPlus
    }

    public static func wordSize(_ width: MeeshyEdgeRailWidth) -> CGFloat {
        switch width {
        case .regular: return MeeshyFont.bodySize
        case .narrow: return MeeshyFont.labelSize
        case .tight: return MeeshyFont.smallSize
        }
    }

    public static func wordLines(_ width: MeeshyEdgeRailWidth) -> Int {
        width == .tight ? 2 : 1
    }

    // MARK: Les lois

    /// La longueur d'un rail court : `n × 44 + (n − 1) × 6 + 10`, un filet comptant
    /// pour un élément de la pile. Aucun bouton, aucun rail.
    public static func length(count: Int, dividers: Int) -> CGFloat {
        guard count > 0 else { return 0 }
        let elements = count + dividers
        return CGFloat(count) * discSide + CGFloat(dividers) * dividerHeight
            + CGFloat(elements - 1) * compactSpacing + 2 * compactPadding
    }

    /// Le pied épinglé : marge, filet, retrait, puis ses boutons écartés de 6.
    public static func footLength(count: Int) -> CGFloat {
        guard count > 0 else { return 0 }
        return footMargin + dividerHeight + footInset
            + CGFloat(count) * discSide + CGFloat(count - 1) * footSpacing
    }

    /// La longueur d'un rail libellé : `46 + n × 44 + (n − 1) × 4 + pied`.
    public static func labeledLength(
        count: Int,
        footCount: Int,
        hasHeader: Bool,
        width: MeeshyEdgeRailWidth = .regular
    ) -> CGFloat {
        guard count > 0 else { return 0 }
        return 2 * padding(width) + (hasHeader ? headerBlock : 0)
            + CGFloat(count) * rowHeight + CGFloat(count - 1) * rowSpacing
            + footLength(count: footCount)
    }

    /// La largeur élue par le couloir libre : 210 dès 250, 150 dès 166, sinon 112.
    public static func labeledWidth(lane: CGFloat) -> MeeshyEdgeRailWidth {
        if lane >= laneForRegular { return .regular }
        return lane >= laneForNarrow ? .narrow : .tight
    }

    /// La translation d'un rail HORS de l'écran : vers son bord, le sien,
    /// retournée en lecture de droite à gauche.
    public static func slideOffset(
        side: MeeshyEdgeRailSide,
        isRightToLeft: Bool,
        edgeInset: CGFloat,
        safeInset: CGFloat
    ) -> CGFloat {
        let travel = compactWidth + edgeInset + safeInset
        let towardsLeft = (side == .leading) != isRightToLeft
        return towardsLeft ? -travel : travel
    }

    /// La translation du moment : nulle à sa place, et nulle sous « réduire les
    /// animations » (le fondu seul en tient lieu).
    public static func travel(
        side: MeeshyEdgeRailSide,
        isRightToLeft: Bool,
        edgeInset: CGFloat,
        safeInset: CGFloat,
        isAway: Bool,
        reduceMotion: Bool
    ) -> CGFloat {
        guard isAway, !reduceMotion else { return 0 }
        return slideOffset(side: side, isRightToLeft: isRightToLeft, edgeInset: edgeInset, safeInset: safeInset)
    }

    /// Combien de boutons tiennent dans la hauteur donnée.
    public static func capacity(height: CGFloat, labeled: Bool) -> Int {
        let rows = labeled
            ? (height - 2 * padding(.regular) - headerBlock + rowSpacing) / (rowHeight + rowSpacing)
            : (height - 2 * compactPadding + compactSpacing) / (discSide + compactSpacing)
        guard rows.isFinite else { return 0 }
        return max(0, Int(rows.rounded(.down)))
    }

    /// Un rail défile seulement s'il dépasse sa bande, d'un demi-point près.
    public static func scrolls(length: CGFloat, band: CGFloat) -> Bool {
        length > band + MeeshyScrollEdges.tolerance
    }

    public static func opacity(of visibility: MeeshyEdgeRailsVisibility) -> Double {
        switch visibility {
        case .shown: return 1
        case .dimmed: return dimmedOpacity
        case .hidden: return 0
        }
    }

    public static func isReadByScreenReader(_ visibility: MeeshyEdgeRailsVisibility) -> Bool {
        visibility == .shown
    }

    public static func servesTouch(_ visibility: MeeshyEdgeRailsVisibility) -> Bool {
        visibility == .shown
    }

    /// L'opacité d'un rail court selon qu'il est sorti ou rangé.
    public static func opacity(away: Bool) -> Double {
        away ? 0 : 1
    }

    /// La durée de la sortie et du rangement : 300 ms, un fondu de 150 sous
    /// « réduire les animations ».
    public static func slideDuration(reduceMotion: Bool) -> Double {
        reduceMotion ? reducedFadeSeconds : slideSeconds
    }

    /// La durée du fondu `shown` ↔ `dimmed` ↔ `hidden`.
    public static func dimDuration(reduceMotion: Bool) -> Double {
        reduceMotion ? reducedFadeSeconds : dimSeconds
    }
}
