import Foundation
import SwiftUI

/// **La loi d'ajustement** : la hauteur d'une vignette descend de `tileHeight`
/// à `minTileHeight` pour que la rangée tienne dans la largeur qu'on lui laisse,
/// la largeur suivant (hauteur × rapport) et l'écart restant le même. En dessous
/// du minimum, la rangée défile. Pure : recalculée au changement de largeur ou
/// de nombre, jamais par image.
public nonisolated struct MeeshyThumbnailRowFit: Equatable, Sendable {
    public let height: CGFloat
    public let width: CGFloat
    /// Vrai quand même réduite, la rangée ne tient pas.
    public let scrolls: Bool

    public init(height: CGFloat, width: CGFloat, scrolls: Bool) {
        self.height = height
        self.width = width
        self.scrolls = scrolls
    }

    public var size: CGSize { CGSize(width: width, height: height) }

    /// La distance d'une vignette à la suivante.
    public func pitch(spacing: CGFloat = MeeshyThumbnailRowRecipe.spacing) -> CGFloat {
        Self.pitch(tileWidth: width, spacing: spacing)
    }

    public static func pitch(tileWidth: CGFloat, spacing: CGFloat) -> CGFloat {
        tileWidth + spacing
    }

    /// La largeur des `slots` places (vignettes et « + »), sans écart de fin.
    public static func contentWidth(slots: Int, tileWidth: CGFloat, spacing: CGFloat) -> CGFloat {
        guard slots > 0 else { return 0 }
        return CGFloat(slots) * tileWidth + CGFloat(slots - 1) * spacing
    }

    /// La hauteur la plus grande, entière, qui fait tenir `slots` places dans
    /// `available` ; `nil` (largeur inconnue) ou aucune place, la pleine taille.
    public static func resolve(
        slots: Int,
        available: CGFloat?,
        tileHeight: CGFloat = MeeshyThumbnailRowRecipe.defaultTileHeight,
        minTileHeight: CGFloat = MeeshyThumbnailRowRecipe.minTileHeight,
        aspectRatio: CGFloat = MeeshyThumbnailRowRecipe.defaultAspectRatio,
        spacing: CGFloat = MeeshyThumbnailRowRecipe.spacing
    ) -> MeeshyThumbnailRowFit {
        guard let available, available.isFinite, slots > 0, aspectRatio > 0 else {
            return MeeshyThumbnailRowFit(height: tileHeight, width: tileHeight * aspectRatio, scrolls: false)
        }
        let floorHeight = min(minTileHeight, tileHeight)
        let raw = (available - CGFloat(slots - 1) * spacing) / CGFloat(slots) / aspectRatio
        guard raw >= floorHeight else {
            return MeeshyThumbnailRowFit(height: floorHeight, width: floorHeight * aspectRatio, scrolls: true)
        }
        let height = min(tileHeight, raw.rounded(.down))
        return MeeshyThumbnailRowFit(height: height, width: height * aspectRatio, scrolls: false)
    }
}
