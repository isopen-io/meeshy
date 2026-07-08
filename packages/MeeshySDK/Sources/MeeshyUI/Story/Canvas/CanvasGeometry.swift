import Foundation
import CoreGraphics

public nonisolated struct CanvasGeometry: Equatable, Sendable {
    public static let designWidth: CGFloat = 1080
    public static let designHeight: CGFloat = 1920
    public static let designSize = CGSize(width: designWidth, height: designHeight)

    /// Ratio (largeur / hauteur) des deux formes de canvas supportées. Le canvas
    /// story est **vertical 9:16 par défaut** ; l'import d'une image de fond
    /// paysage bascule le canvas en **horizontal 16:9** (directive user
    /// « l'import de l'image de fond impose le cadre et forme du Canvas »).
    public static let portraitRatio: CGFloat = designWidth / designHeight    // 0.5625 (9:16)
    public static let landscapeRatio: CGFloat = designHeight / designWidth   // 1.7778 (16:9)

    public let renderSize: CGSize
    public let scaleFactor: CGFloat

    public init(renderSize: CGSize) {
        self.renderSize = renderSize
        // Projection design→écran UNIFORME basée sur la largeur (`scaleFactor = width/1080`).
        // Le design garde toujours 1080 de large ; c'est la HAUTEUR design qui suit
        // le ratio du canvas (`designHeight` ci-dessous), pas l'inverse. Ainsi tout
        // contenu projeté sur la largeur (X, tailles) reste identique portrait/paysage,
        // et seule la coordonnée Y normalisée se mappe sur la bonne hauteur.
        self.scaleFactor = renderSize.width / Self.designWidth
    }

    /// Taille de l'espace **design** pour ce canvas. La largeur est fixe (1080) ;
    /// la hauteur suit le ratio des bounds de rendu réels (`renderSize`). Pour un
    /// canvas 9:16 → 1080×1920 (identique aux constantes statiques historiques) ;
    /// pour un canvas 16:9 → 1080×607.5. Les bounds étant déjà cadrés au bon ratio
    /// par `aspectFitSize(in:ratio:)`, la projection Y (`y_norm × designHeight ×
    /// scaleFactor`) atterrit exactement sur le bord bas du canvas dans les deux cas.
    /// Fallback sur le portrait `designSize` statique si `renderSize` est dégénéré.
    public var designSize: CGSize {
        guard renderSize.width > 0, renderSize.height > 0 else { return Self.designSize }
        return CGSize(width: Self.designWidth,
                      height: Self.designWidth * (renderSize.height / renderSize.width))
    }

    /// Hauteur de l'espace design de CE canvas (cf. `designSize`). Utilisée par les
    /// layers pour convertir la coordonnée Y normalisée (`y ∈ [0,1]`) en Y design.
    public var designHeight: CGFloat { designSize.height }

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

    /// Pendant vertical de `designLength(forNormalized:)` : convertit une coordonnée
    /// Y normalisée en Y design en tenant compte du ratio du canvas courant. Pour un
    /// canvas portrait c'est `n × 1920` (identique à l'ancien `n × CanvasGeometry.designHeight`),
    /// pour un canvas paysage `n × 607.5`.
    public func designHeightLength(forNormalized n: CGFloat) -> CGFloat {
        n * designHeight
    }

    public func designPoint(forNormalized n: CGPoint) -> CGPoint {
        CGPoint(x: n.x * Self.designWidth, y: n.y * designHeight)
    }

    /// Taille du canvas story contrainte à un ratio (`ratio` = largeur / hauteur),
    /// centrée (« fit ») dans une zone disponible. Le ratio par défaut est le
    /// portrait 9:16 (`portraitRatio`) — TOUS les call sites historiques restent
    /// donc inchangés. L'import d'une image de fond paysage passe `landscapeRatio`
    /// pour reformer le canvas en 16:9.
    ///
    /// **Source de vérité unique** partagée par le composer (`.edit`) et le
    /// reader / preview / export (`.play`). La projection design→écran de
    /// `StoryRenderer` est basée sur la **largeur** (`scaleFactor = width/1080`)
    /// et la **hauteur design suit le ratio** (`designHeight`), donc contraindre
    /// les deux surfaces à `aspectFitSize` (même ratio) rend les bounds identiques
    /// (même largeur ET même hauteur) : tous les pipelines round-trip et le
    /// composer est WYSIWYG vis-à-vis du reader, quelle que soit la forme du canvas.
    public static func aspectFitSize(in available: CGSize, ratio: CGFloat = CanvasGeometry.portraitRatio) -> CGSize {
        guard available.width > 0, available.height > 0, ratio > 0 else { return available }
        let widthBound = min(available.width, available.height * ratio)
        return CGSize(width: widthBound, height: widthBound / ratio)
    }
}
