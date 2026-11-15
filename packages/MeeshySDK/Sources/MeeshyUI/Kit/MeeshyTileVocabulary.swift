import SwiftUI

// MARK: - Le vocabulaire de la bande

/// Comment les vignettes se posent : sur une rangée qui défile (on touche pour
/// choisir), sur un carrousel qui s'aimante au centre (la vignette centrée est
/// la courante), ou repliées en grille de colonnes égales.
public nonisolated enum MeeshyTileStripLayout: Equatable, Sendable {
    case strip
    case carousel(dimsNeighbours: Bool = false)
    case grid(columns: Int = 4)

    public var isCarousel: Bool {
        if case .carousel = self { return true }
        return false
    }

    public var isGrid: Bool {
        if case .grid = self { return true }
        return false
    }
}

/// Où se lisent les noms : sous chaque vignette, sous la bande (celui de la
/// courante seul), ou nulle part (une vignette de police se lit d'elle-même).
public nonisolated enum MeeshyTileNames: String, Sendable, Equatable, CaseIterable {
    case each
    case current
    case none
}

/// Comment la courante se distingue : un cercle blanc autour de l'aperçu, ou
/// un fond plein derrière lui.
public nonisolated enum MeeshyTileSelectionStyle: String, Sendable, Equatable, CaseIterable {
    case ring
    case fill
}

/// Sur quoi la bande se pose : un média ou une plaque sombre (encre claire), ou
/// le thème de l'application (encre du thème).
public nonisolated enum MeeshyTileSurface: String, Sendable, Equatable, CaseIterable {
    case onMedia
    case theme
}

/// Le retour haptique d'un changement effectif. `none` quand l'hôte joue le sien.
public nonisolated enum MeeshyTileHaptic: String, Sendable, Equatable, CaseIterable {
    case light
    case none
}

// MARK: - La vignette (valeur)

/// Une vignette : une VALEUR, donc comparable. Aucune chaîne n'est fabriquée
/// ici : l'hôte passe le titre, le nom et l'aide, déjà traduits.
///
/// `previewVersion` dit qu'un aperçu est neuf : la cellule compare ses valeurs,
/// pas la fermeture de l'hôte, donc l'hôte dont l'image filtrée vient d'arriver
/// incrémente la version, et seule cette vignette se redessine.
public nonisolated struct MeeshyTile<ID: Hashable & Sendable>: Equatable, Sendable, Identifiable {
    public let id: ID
    public let title: String
    public let accessibilityLabel: String?
    public let hint: String?
    public let placeholderSystemImage: String?
    public let isEnabled: Bool
    public let previewVersion: Int

    public init(
        id: ID,
        title: String,
        accessibilityLabel: String? = nil,
        hint: String? = nil,
        placeholderSystemImage: String? = nil,
        isEnabled: Bool = true,
        previewVersion: Int = 0
    ) {
        self.id = id
        self.title = title
        self.accessibilityLabel = accessibilityLabel
        self.hint = hint
        self.placeholderSystemImage = placeholderSystemImage
        self.isEnabled = isEnabled
        self.previewVersion = previewVersion
    }

    /// Le nom lu : `accessibilityLabel ?? title`. Vide si la vignette n'a ni
    /// l'un ni l'autre, ce que la bande refuse.
    public var name: String {
        if let accessibilityLabel, !accessibilityLabel.isEmpty { return accessibilityLabel }
        return title
    }

    public var hasAccessibleName: Bool { !name.isEmpty }
}

/// Ce que la bande dit à l'aperçu : l'hôte peint la courante autrement (l'encre
/// foncée d'une vignette pleine) et grise ce qui est verrouillé.
public nonisolated struct MeeshyTileState: Equatable, Sendable {
    public let isSelected: Bool
    public let isEnabled: Bool

    public init(isSelected: Bool, isEnabled: Bool) {
        self.isSelected = isSelected
        self.isEnabled = isEnabled
    }
}

// MARK: - Les gestes de l'hôte sur la courante

/// Où en est un maintien sur la courante. `moved` porte le déplacement depuis
/// la pose du doigt.
public nonisolated enum MeeshyTileHoldPhase: Equatable, Sendable {
    case began
    case moved(CGSize)
    case ended
}

/// Ce que l'hôte fait de la courante : deux tapes, un maintien. Chaque geste
/// porte le nom de l'action que le lecteur d'écran offre à sa place.
public struct MeeshyTileCurrentGestures {
    public let onDoubleTap: (() -> Void)?
    public let doubleTapName: String
    public let onHold: ((MeeshyTileHoldPhase) -> Void)?
    public let holdName: String

    public init(
        onDoubleTap: (() -> Void)? = nil,
        doubleTapName: String = "",
        onHold: ((MeeshyTileHoldPhase) -> Void)? = nil,
        holdName: String = ""
    ) {
        self.onDoubleTap = onDoubleTap
        self.doubleTapName = doubleTapName
        self.onHold = onHold
        self.holdName = holdName
    }
}

// MARK: - Les mesures

/// Les mesures de la planche, en jetons du système de design. La taille de la
/// vignette est celle de l'hôte (`tileSize`) : celle-ci n'est que le défaut.
public nonisolated enum MeeshyTileMetrics {
    public static let defaultSize = CGSize(width: 56, height: 72)
    public static let defaultColumns = 4
    public static let radius = MeeshyRadius.smPlus
    public static let fillRadius = MeeshyRadius.md
    public static let spacing = MeeshySpacing.sm
    public static let rowSpacing = MeeshySpacing.smPlus
    /// Sous l'aperçu, avant le nom.
    public static let nameGap = MeeshySpacing.xs
    public static let nameFontSize = MeeshyFont.footnoteSize
    public static let nameMaxLines = 2
    /// La piste d'un carrousel ne descend jamais sous cette hauteur : un pouce
    /// posé un peu au-dessus ou au-dessous d'une vignette défile quand même.
    public static let carouselMinimumHeight = MeeshyControlSize.tapTarget * 2
    /// Le cercle : 2 de vide, puis 2 de trait.
    public static let ringGap = MeeshyBorder.strong
    public static let ringLine = MeeshyBorder.strong
    /// Ce que la bande réserve autour des vignettes pour que le cercle ne soit
    /// jamais rogné par le défilement.
    public static var reserve: CGFloat { ringGap + ringLine }
}
