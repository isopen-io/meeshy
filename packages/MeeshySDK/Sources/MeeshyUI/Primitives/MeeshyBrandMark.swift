import CoreGraphics

/// **LA GÉOMÉTRIE DU LOGO MEESHY** — les trois traits de `MeeshyDashesShape`
/// (`AnimatedLogoView`), en valeurs pures : un rendu CoreGraphics hors du fil
/// principal (cadres de capture d'appel, filigranes d'export) les trace sans
/// recopier la table. Espace de référence : 1024 × 1024, traits à bouts ronds,
/// longueurs décroissantes alignées à gauche.
public nonisolated enum MeeshyBrandMark {
    public nonisolated struct Dash: Equatable, Sendable {
        public let start: CGPoint
        public let end: CGPoint
        public let opacity: Double

        public init(start: CGPoint, end: CGPoint, opacity: Double) {
            self.start = start
            self.end = end
            self.opacity = opacity
        }
    }

    public static let referenceSide: CGFloat = 1024

    /// Épaisseur d'un trait rapportée au côté du carré (112 / 1024, celle de l'icône).
    public static let lineWidthRatio: CGFloat = 112 / 1024

    /// Les trois traits dans l'espace 1024, opacités de repos du logo (0,7 · 1 · 0,75 sur le web).
    public static let referenceDashes: [Dash] = [
        Dash(start: CGPoint(x: 262, y: 384), end: CGPoint(x: 762, y: 384), opacity: 0.7),
        Dash(start: CGPoint(x: 262, y: 512), end: CGPoint(x: 662, y: 512), opacity: 1),
        Dash(start: CGPoint(x: 262, y: 640), end: CGPoint(x: 562, y: 640), opacity: 0.75),
    ]

    /// Les traits posés dans le plus grand carré centré de `rect` (y vers le bas).
    public static func dashes(in rect: CGRect) -> [Dash] {
        let scale = min(rect.width, rect.height) / referenceSide
        let offset = CGPoint(
            x: rect.minX + (rect.width - referenceSide * scale) / 2,
            y: rect.minY + (rect.height - referenceSide * scale) / 2
        )
        func place(_ point: CGPoint) -> CGPoint {
            CGPoint(x: offset.x + point.x * scale, y: offset.y + point.y * scale)
        }
        return referenceDashes.map { Dash(start: place($0.start), end: place($0.end), opacity: $0.opacity) }
    }

    /// L'épaisseur des traits pour un carré de côté `min(rect.width, rect.height)`.
    public static func lineWidth(in rect: CGRect) -> CGFloat {
        min(rect.width, rect.height) * lineWidthRatio
    }

    /// Le cadre effectivement encré (bouts ronds compris), pour aligner le logo sur un texte.
    public static func inkBounds(in rect: CGRect) -> CGRect {
        let placed = dashes(in: rect)
        let half = lineWidth(in: rect) / 2
        let xs = placed.flatMap { [$0.start.x, $0.end.x] }
        let ys = placed.flatMap { [$0.start.y, $0.end.y] }
        guard let minX = xs.min(), let maxX = xs.max(), let minY = ys.min(), let maxY = ys.max() else { return .null }
        return CGRect(x: minX - half, y: minY - half, width: maxX - minX + half * 2, height: maxY - minY + half * 2)
    }
}
