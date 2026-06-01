import Foundation
import CoreGraphics

public nonisolated struct CanvasGeometry: Equatable, Sendable {
    public static let designWidth: CGFloat = 1080
    public static let designHeight: CGFloat = 1920
    public static let designSize = CGSize(width: designWidth, height: designHeight)

    public let renderSize: CGSize
    public let scaleFactor: CGFloat

    public init(renderSize: CGSize) {
        self.renderSize = renderSize
        // 9:16 contraint → scaleFactor uniforme (basé sur largeur)
        self.scaleFactor = renderSize.width / Self.designWidth
    }

    public func render(_ designPoint: CGPoint) -> CGPoint {
        CGPoint(x: designPoint.x * scaleFactor, y: designPoint.y * scaleFactor)
    }

    public func render(_ designLength: CGFloat) -> CGFloat {
        designLength * scaleFactor
    }

    public func render(_ designSize: CGSize) -> CGSize {
        CGSize(width: designSize.width * scaleFactor, height: designSize.height * scaleFactor)
    }

    public func designLength(forNormalized n: CGFloat) -> CGFloat {
        n * Self.designWidth
    }

    public func designPoint(forNormalized n: CGPoint) -> CGPoint {
        CGPoint(x: n.x * Self.designWidth, y: n.y * Self.designHeight)
    }

    /// Taille du canvas story contrainte au ratio design 9:16 (1080:1920),
    /// centrée (« fit ») dans une zone disponible.
    ///
    /// **Source de vérité unique** partagée par le composer (`.edit`) et le
    /// reader / preview / export (`.play`). La projection design→écran de
    /// `StoryRenderer` est basée sur la **largeur** (`scaleFactor = width/1080`)
    /// et suppose donc un canvas exactement 9:16. Si le composer rend dans un
    /// canvas plein écran (plus haut que 9:16) alors que le reader est en 9:16 :
    /// - le **texte / média** (projection largeur) round-trip quand même car la
    ///   largeur est identique ;
    /// - mais le **dessin** (projection bounds non-uniforme `1920/bounds.height`)
    ///   se compresse verticalement du ratio `hauteur9:16 / hauteurComposer`, et
    ///   se désaligne du texte qu'il entourait ;
    /// - le contenu placé dans la hauteur excédentaire du composer est rogné par
    ///   le reader 9:16.
    ///
    /// Contraindre les deux surfaces à `aspectFitSize` rend les bounds identiques
    /// (même largeur ET même hauteur), donc tous les pipelines round-trip et le
    /// composer est WYSIWYG vis-à-vis du reader.
    public static func aspectFitSize(in available: CGSize) -> CGSize {
        guard available.width > 0, available.height > 0 else { return available }
        let ratio = designWidth / designHeight   // 9:16 = 0.5625
        let widthBound = min(available.width, available.height * ratio)
        return CGSize(width: widthBound, height: widthBound / ratio)
    }
}
