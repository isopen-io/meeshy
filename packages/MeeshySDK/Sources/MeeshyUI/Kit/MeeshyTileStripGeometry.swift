import SwiftUI

/// **La géométrie d'une bande**, en distances depuis le début de la bande
/// (à gauche en LTR, à droite en RTL). Pure : l'hôte qui peint UNE surface sous
/// les vignettes visibles (`underlay`) la lit, et le noyau s'en sert pour dire
/// quelle plage se voit.
public nonisolated struct MeeshyTileStripGeometry: Equatable, Sendable {
    public let tileSize: CGSize
    public let spacing: CGFloat
    public let inset: CGFloat
    public let count: Int
    /// Le défilement depuis le début, et la largeur visible : ce que la bande
    /// montre en ce moment. Nuls tant qu'on ne mesure pas.
    public let offset: CGFloat
    public let viewport: CGFloat

    public init(
        tileSize: CGSize,
        spacing: CGFloat,
        inset: CGFloat,
        count: Int,
        offset: CGFloat = 0,
        viewport: CGFloat = 0
    ) {
        self.tileSize = tileSize
        self.spacing = spacing
        self.inset = inset
        self.count = count
        self.offset = offset
        self.viewport = viewport
    }

    /// La distance d'une vignette à la suivante.
    public var pitch: CGFloat { tileSize.width + spacing }

    /// La largeur du contenu : la marge des deux côtés, aucun écart de fin.
    public var contentWidth: CGFloat {
        guard count > 0 else { return 0 }
        return inset * 2 + CGFloat(count) * pitch - spacing
    }

    /// Le cadre d'une vignette dans le contenu.
    public func frame(of index: Int) -> CGRect {
        CGRect(origin: CGPoint(x: inset + CGFloat(index) * pitch, y: 0), size: tileSize)
    }

    /// Le cadre d'une vignette dans la zone visible : le même, décalé du défilement.
    public func viewportFrame(of index: Int) -> CGRect {
        frame(of: index).offsetBy(dx: -offset, dy: 0)
    }

    /// Les vignettes dont un pixel se voit, pour un défilement `offset` sur
    /// `viewport` points. Une vignette qui touche juste le bord ne se voit pas.
    public func visibleRange(offset: CGFloat, viewport: CGFloat) -> ClosedRange<Int>? {
        guard count > 0, viewport > 0, pitch > 0 else { return nil }
        let first = max(0, Int(((offset - inset - tileSize.width) / pitch).rounded(.down)) + 1)
        let last = min(count - 1, Int(((offset + viewport - inset) / pitch).rounded(.up)) - 1)
        return first <= last ? first...last : nil
    }

    /// Ce que la bande montre en ce moment.
    public var visibleRange: ClosedRange<Int>? {
        visibleRange(offset: offset, viewport: viewport)
    }

    /// La même géométrie, lue à un autre défilement.
    public func scrolled(to offset: CGFloat, viewport: CGFloat) -> MeeshyTileStripGeometry {
        MeeshyTileStripGeometry(
            tileSize: tileSize, spacing: spacing, inset: inset, count: count, offset: offset, viewport: viewport
        )
    }

    /// Le défilement lu depuis le cadre PHYSIQUE du contenu, dans l'espace du
    /// viewport. En RTL, le contenu commence à droite.
    public static func offset(contentFrame: CGRect, viewport: CGFloat, isRightToLeft: Bool) -> CGFloat {
        isRightToLeft ? contentFrame.maxX - viewport : -contentFrame.minX
    }

    /// La cellule d'une grille : des colonnes égales, aux proportions de la vignette.
    public static func gridCell(width: CGFloat, columns: Int, spacing: CGFloat, tileSize: CGSize) -> CGSize {
        guard columns > 0, tileSize.width > 0 else { return .zero }
        let cellWidth = (width - CGFloat(columns - 1) * spacing) / CGFloat(columns)
        return CGSize(width: cellWidth, height: cellWidth * tileSize.height / tileSize.width)
    }

    /// La cible tactile d'une vignette : au moins 44 pt dans chaque sens, sans
    /// rien changer à ce que l'aperçu dessine.
    public static func target(of size: CGSize) -> CGSize {
        CGSize(
            width: max(size.width, MeeshyControlSize.tapTarget),
            height: max(size.height, MeeshyControlSize.tapTarget)
        )
    }
}
