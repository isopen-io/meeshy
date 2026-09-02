import Foundation
import UIKit
import MeeshySDK

// MARK: - Sticker Template Palette

/// La palette des décorations — **tokens `MeeshyColors`, jamais une couleur
/// système en dur** (`packages/MeeshySDK/CLAUDE.md`, Visual Identity).
///
/// Les valeurs vivent ICI, avec le dessin qui les emploie. `StoryLocationLayer`
/// les REDIT sous ses anciens noms : ses témoins les nomment ainsi depuis
/// `StoryLocationBadgeRenderTests`, et un alias d'une ligne n'est pas une
/// jumelle — c'est une seule définition vue de deux endroits.
public enum StickerTemplatePalette {
    /// Réutilise le parseur hex de `StoryTextLayer` : les tokens `MeeshyColors`
    /// sont déclarés en `Color` (SwiftUI), pas en `UIColor`.
    public static let pin: UIColor =
        StoryTextLayer.parseHexColorNonisolated(MeeshyColors.errorHex) ?? .systemRed
    public static let label: UIColor =
        StoryTextLayer.parseHexColorNonisolated(MeeshyColors.indigo900Hex) ?? .black
    public static let surface: UIColor =
        (StoryTextLayer.parseHexColorNonisolated(MeeshyColors.indigo50Hex) ?? .white)
            .withAlphaComponent(0.94)

    /// L'encre des décorations posées sur un fond sombre (heure numérique).
    public static let ink: UIColor =
        (StoryTextLayer.parseHexColorNonisolated(MeeshyColors.indigo900Hex) ?? .black)
            .withAlphaComponent(0.92)
    /// Le liseré discret des cadres — indigo clair, jamais un gris système.
    public static let hairline: UIColor =
        StoryTextLayer.parseHexColorNonisolated(MeeshyColors.indigo300Hex) ?? .lightGray
    /// L'accent de marque, pour les aiguilles et les rubans.
    public static let accent: UIColor =
        StoryTextLayer.parseHexColorNonisolated(MeeshyColors.brandPrimaryHex) ?? .systemIndigo
    /// Les deux bornes du dégradé des cœurs.
    public static let loveWarm: UIColor =
        StoryTextLayer.parseHexColorNonisolated(MeeshyColors.errorHex) ?? .systemPink
    public static let loveCool: UIColor =
        StoryTextLayer.parseHexColorNonisolated(MeeshyColors.purple500Hex) ?? .systemPurple
    /// Les ampoules d'une enseigne. `warningHex` est l'ambre de la marque —
    /// jamais un `.systemYellow`, qui changerait de ton d'une version d'iOS à
    /// l'autre et ferait dériver la décoration.
    public static let warmBulb: UIColor =
        StoryTextLayer.parseHexColorNonisolated(MeeshyColors.warningHex) ?? .systemOrange
}

// MARK: - Sticker Template Metrics

/// Les mesures d'un gabarit, **déjà projetées en espace de rendu**.
///
/// Le gabarit ne connaît ni la taille du canvas ni le facteur d'échelle : son
/// appelant a déjà fait passer les constantes de design par
/// `CanvasGeometry.render(_:)`. C'est ce qui garde un gabarit identique sur
/// iPhone, iPad et dans la vidéo exportée — la même discipline
/// « mesure → projection » que `StoryTextLayer.configure`.
public struct StickerTemplateMetrics: Equatable, Sendable {
    public let fontSize: CGFloat
    public let horizontalPadding: CGFloat
    public let verticalPadding: CGFloat
    public let gap: CGFloat

    public init(fontSize: CGFloat, horizontalPadding: CGFloat,
                verticalPadding: CGFloat, gap: CGFloat) {
        self.fontSize = fontSize
        self.horizontalPadding = horizontalPadding
        self.verticalPadding = verticalPadding
        self.gap = gap
    }

    // Les constantes de la pastille de lieu, telles qu'elles étaient codées en
    // dur dans `StoryLocationLayer` avant le #4717. Elles ne bougent pas : le
    // témoin de non-régression compare le badge rendu à celui d'avant.
    static let locationBaseFontSize: CGFloat = 42
    static let locationHorizontalPad: CGFloat = 22
    static let locationVerticalPad: CGFloat = 14
    static let locationGap: CGFloat = 10

    /// Les mesures d'un sticker gabarit — heure, amour.
    ///
    /// Le côté de référence vient de `CanvasGeometry.stickerFontSize`, **source
    /// unique des trois pipelines** (canvas, composite de miniature, export) :
    /// s'en écarter ferait sortir la décoration à une taille dans la story et à
    /// une autre dans la vignette du tray, le défaut que cette fonction existe
    /// justement pour avoir fermé.
    ///
    /// Les marges sont proportionnelles au corps, dans les MÊMES rapports que
    /// la pastille de lieu (22/42, 14/42, 10/42) : une seule famille de
    /// proportions pour toutes les décorations, sinon chaque gabarit inventerait
    /// son air de famille.
    public static func sticker(geometry: CanvasGeometry,
                               baseSize: Double,
                               scale: Double) -> StickerTemplateMetrics {
        let côté = CanvasGeometry.stickerFontSize(baseSize: baseSize, scale: scale,
                                                  canvasWidth: geometry.renderSize.width)
        return StickerTemplateMetrics(
            fontSize: côté,
            horizontalPadding: côté * (locationHorizontalPad / locationBaseFontSize),
            verticalPadding: côté * (locationVerticalPad / locationBaseFontSize),
            gap: côté * (locationGap / locationBaseFontSize)
        )
    }

    /// Les mesures d'une VIGNETTE de palette, pour un côté de cellule donné.
    ///
    /// La vignette n'est pas une illustration : elle passe par le MÊME moteur
    /// que la scène (exigence #4110). Seules les mesures changent — le corps
    /// vaut moins d'un tiers de la cellule pour qu'un cartouche à deux lignes y
    /// tienne, et les marges gardent les rapports de la pastille.
    public static func preview(side: CGFloat) -> StickerTemplateMetrics {
        let corps = side * 0.30
        return StickerTemplateMetrics(
            fontSize: corps,
            horizontalPadding: corps * (locationHorizontalPad / locationBaseFontSize),
            verticalPadding: corps * (locationVerticalPad / locationBaseFontSize),
            gap: corps * (locationGap / locationBaseFontSize)
        )
    }

    /// Les mesures d'une décoration de LIEU pour une géométrie et une échelle.
    public static func location(geometry: CanvasGeometry, scale: CGFloat) -> StickerTemplateMetrics {
        StickerTemplateMetrics(
            fontSize: geometry.render(locationBaseFontSize * scale),
            horizontalPadding: geometry.render(locationHorizontalPad * scale),
            verticalPadding: geometry.render(locationVerticalPad * scale),
            gap: geometry.render(locationGap * scale)
        )
    }
}

// MARK: - Sticker Template Renderer

/// **Le dessin des gabarits — un seul chemin, pas deux** (#4717).
///
/// ## Pourquoi MESURER et DESSINER sont deux fonctions
///
/// Le reader pose ses cibles de tap avec `StoryLocationLayer.badgeFrame`, qui
/// doit tomber EXACTEMENT là où le rendu dessine. Les deux partagent donc la
/// mesure ; les laisser la calculer chacun de leur côté ferait dériver la zone
/// tapable du pixel affiché sans qu'aucun témoin ne rougisse.
///
/// ## Pourquoi un id inconnu rend `nil`
///
/// Un contenu publié par une version plus récente peut nommer un gabarit que ce
/// binaire ne connaît pas. Rendre `nil` laisse l'APPELANT choisir son repli —
/// la pastille pour un lieu, l'emoji du fil pour un sticker. Fabriquer un
/// gabarit ici imposerait le même repli aux deux, et l'un des deux serait faux.
public enum StickerTemplateRenderer {

    /// La taille qu'occupera le gabarit, sans le rasteriser.
    @MainActor
    public static func measuredSize(templateID: String,
                                    slots: [String: String],
                                    metrics: StickerTemplateMetrics) -> CGSize? {
        switch templateID {
        case StickerTemplateCatalog.ID.locationPill:
            return pillSize(slots: slots, metrics: metrics)
        case StickerTemplateCatalog.ID.locationPostcard:
            return postcardSize(slots: slots, metrics: metrics)
        case StickerTemplateCatalog.ID.locationTicket:
            return ticketSize(slots: slots, metrics: metrics)
        case StickerTemplateCatalog.ID.locationStamp:
            return stampSize(slots: slots, metrics: metrics)
        case StickerTemplateCatalog.ID.locationCompass:
            return compassSize(slots: slots, metrics: metrics)
        case StickerTemplateCatalog.ID.locationMarquee:
            return marqueeSize(slots: slots, metrics: metrics)
        case StickerTemplateCatalog.ID.timeDigital:
            return digitalSize(slots: slots, metrics: metrics)
        case StickerTemplateCatalog.ID.timeAnalog:
            return analogSize(metrics: metrics)
        case StickerTemplateCatalog.ID.timeRibbon:
            return ribbonSize(slots: slots, metrics: metrics)
        case StickerTemplateCatalog.ID.loveHeartFrame:
            return heartFrameSize(metrics: metrics)
        case StickerTemplateCatalog.ID.loveDoubleHeart:
            return doubleHeartSize(metrics: metrics)
        case StickerTemplateCatalog.ID.loveSince:
            return sinceSize(slots: slots, metrics: metrics)
        default:
            return nil
        }
    }

    /// Le gabarit rasterisé, prêt pour `CALayer.contents`.
    ///
    /// Passer par une image assignée à `contents` — plutôt qu'un arbre de
    /// sous-couches vivantes — n'est pas qu'une affaire de coût : c'est ce qui
    /// fait survivre la décoration à `layer.render(in:)`, donc à la capture de
    /// canvas, au backdrop et à l'export AVFoundation, sans une ligne de plus.
    @MainActor
    public static func image(templateID: String,
                             slots: [String: String],
                             metrics: StickerTemplateMetrics,
                             screenScale: CGFloat) -> (UIImage?, CGSize)? {
        switch templateID {
        case StickerTemplateCatalog.ID.locationPill:
            return pillImage(slots: slots, metrics: metrics, screenScale: screenScale)
        case StickerTemplateCatalog.ID.locationPostcard:
            return postcardImage(slots: slots, metrics: metrics, screenScale: screenScale)
        case StickerTemplateCatalog.ID.locationTicket:
            return ticketImage(slots: slots, metrics: metrics, screenScale: screenScale)
        case StickerTemplateCatalog.ID.locationStamp:
            return stampImage(slots: slots, metrics: metrics, screenScale: screenScale)
        case StickerTemplateCatalog.ID.locationCompass:
            return compassImage(slots: slots, metrics: metrics, screenScale: screenScale)
        case StickerTemplateCatalog.ID.locationMarquee:
            return marqueeImage(slots: slots, metrics: metrics, screenScale: screenScale)
        case StickerTemplateCatalog.ID.timeDigital:
            return digitalImage(slots: slots, metrics: metrics, screenScale: screenScale)
        case StickerTemplateCatalog.ID.timeAnalog:
            return analogImage(slots: slots, metrics: metrics, screenScale: screenScale)
        case StickerTemplateCatalog.ID.timeRibbon:
            return ribbonImage(slots: slots, metrics: metrics, screenScale: screenScale)
        case StickerTemplateCatalog.ID.loveHeartFrame:
            return heartFrameImage(metrics: metrics, screenScale: screenScale)
        case StickerTemplateCatalog.ID.loveDoubleHeart:
            return doubleHeartImage(metrics: metrics, screenScale: screenScale)
        case StickerTemplateCatalog.ID.loveSince:
            return sinceImage(slots: slots, metrics: metrics, screenScale: screenScale)
        default:
            return nil
        }
    }
}
