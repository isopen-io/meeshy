import CoreGraphics

/// Géométrie horizontale des couloirs — l'arithmétique PURE que
/// `RiverLaneCanvas`/`RiverStreamHost` consomment, jamais l'inverse. Aucune
/// donnée de la LOI n'y entre : ce type ne connaît que des largeurs, il ne
/// sait rien du contenu d'un couloir (`RiverLaneResolver` fait déjà tout ce
/// travail — `laneCount`, `layout`, qui occupe quoi).
///
/// Miroir arithmétique de la maquette normative
/// (`docs/design/2026-08-17-riviere-navigation.html`,
/// `railX = laneIndex * LANE_W + LANE_W / 2`) : le rail (la ligne verticale
/// de la branche) passe au CENTRE de son couloir, et la bulle est centrée
/// dessus — la ligne l'aborde par le haut, son contour la porte, et elle
/// repart par le bas.
///
/// `laneWidth` est un PARAMÈTRE, jamais une constante réécrite ici :
/// §7ter accorde explicitement à la peau le droit de baisser
/// `RiverMetrics.Lane.widthReference` sur un couloir étroit (téléphone) —
/// « aucune peau ne doit tronquer le texte pour gagner une colonne ». Le
/// défaut de `RiverStreamHost` reste `RiverMetrics.Lane.widthReference`.
nonisolated public struct RiverColumnLayout: Sendable, Equatable {
    public let laneWidth: CGFloat
    public let gutter: CGFloat
    public let laneCount: Int

    public init(laneWidth: CGFloat, gutter: CGFloat, laneCount: Int) {
        self.laneWidth = laneWidth
        self.gutter = gutter
        self.laneCount = laneCount
    }

    /// Largeur totale du contenu défilable — `laneCount` couloirs de
    /// `laneWidth`, contigus (aucun espacement inter-couloir : la gouttière
    /// vit DANS chaque couloir, de chaque côté de la bulle).
    public var totalWidth: CGFloat {
        CGFloat(max(0, laneCount)) * laneWidth
    }

    /// Bord gauche du couloir `laneIndex`.
    public func laneLeadingX(_ laneIndex: Int) -> CGFloat {
        CGFloat(laneIndex) * laneWidth
    }

    /// Rail — l'axe X où court la ligne de la branche, au CENTRE du couloir.
    public func railX(_ laneIndex: Int) -> CGFloat {
        laneLeadingX(laneIndex) + laneWidth / 2
    }

    /// Largeur utile de la bulle dans son couloir — `laneWidth` moins la
    /// gouttière des deux côtés, où passent les traits et les connecteurs.
    public var bubbleContentWidth: CGFloat {
        max(0, laneWidth - gutter * 2)
    }

    /// Offset horizontal qui amène le rail du couloir `laneIndex` au centre
    /// d'un pane de largeur `paneWidth` — borné entre la rive (0) et le bord
    /// (`totalWidth − paneWidth`) ; zéro si tout tient dans le pane.
    ///
    /// Pourquoi un OFFSET et pas une ancre : le pane défile sur deux axes,
    /// mais `ScrollViewProxy.scrollTo` n'en bouge qu'un (mesuré au simulateur
    /// le 2026-08-22 : quelle que soit l'ancre, X restait la moitié du
    /// débordement — le contenu centré d'origine). L'axe des voix se pose
    /// donc explicitement, par cette cote, et la peau l'écrit au défilement.
    public func horizontalOffset(centeringLane laneIndex: Int, paneWidth: CGFloat) -> CGFloat {
        let overflow = totalWidth - paneWidth
        guard overflow > 0 else { return 0 }
        return min(overflow, max(0, railX(laneIndex) - paneWidth / 2))
    }
}
