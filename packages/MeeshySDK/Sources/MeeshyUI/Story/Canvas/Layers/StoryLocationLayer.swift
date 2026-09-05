import Foundation
import QuartzCore
import UIKit
import MeeshySDK

/// `CALayer` subclass that renders a `StoryLocationObject` as a rasterized
/// pill badge (pin glyph + place label), the same "pre-rasterized image
/// assigned to `contents`" pattern `StoryStickerLayer` uses for emoji — a
/// single opaque asset is far cheaper to composite/cache than a live
/// sublayer tree, and it survives `layer.render(in:)` (canvas snapshot,
/// backdrop capture, AVFoundation export) exactly like every other item.
///
/// Design-space metrics are measured once then projected through
/// `CanvasGeometry.render(_:)`, the same measure→project pipeline
/// `StoryTextLayer.configure` uses for `x`/`y`/`anchor`/`rotation` — this is
/// what keeps the badge at the SAME canvas position on iPhone, iPad, and in
/// the exported video (see `StoryRenderer` doc: single source of truth for
/// the first-plane composite).
public final class StoryLocationLayer: CALayer {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    public private(set) nonisolated(unsafe) var locationObject: StoryLocationObject?

    /// Palette de marque MeeshyColors — jamais de couleur système en dur
    /// (`packages/MeeshySDK/CLAUDE.md`, Visual Identity).
    ///
    /// **Les valeurs vivent désormais avec le DESSIN** (`StickerTemplatePalette`,
    /// #4717) : ces trois-là les redisent sous les noms que les témoins de
    /// `StoryLocationBadgeRenderTests` nomment depuis toujours. Un alias d'une
    /// ligne n'est pas une jumelle — c'est une définition unique vue de deux
    /// endroits.
    static let pinTintColor: UIColor = StickerTemplatePalette.pin
    static let labelTextColor: UIColor = StickerTemplatePalette.label
    static let pillBackgroundColor: UIColor = StickerTemplatePalette.surface

    public override nonisolated init() { super.init() }
    public override nonisolated init(layer: Any) { super.init(layer: layer) }

    @available(*, unavailable)
    public required nonisolated init?(coder: NSCoder) {
        fatalError("StoryLocationLayer does not support NSCoder")
    }

    @MainActor
    public func configure(with location: StoryLocationObject,
                          geometry: CanvasGeometry,
                          mode: RenderMode,
                          renderScale: CGFloat = UIScreen.main.scale) {
        self.locationObject = location

        let scale = contentsScale
        let (image, renderedSize) = Self.templateImage(for: location,
                                                       geometry: geometry,
                                                       screenScale: scale)
        contents = CanvasImageOrientation.displayCGImage(image)
        contentsScale = scale
        bounds = CGRect(origin: .zero, size: renderedSize)

        let designCenterX = geometry.designLength(forNormalized: CGFloat(location.x))
        let designCenterY = geometry.designHeightLength(forNormalized: CGFloat(location.y))
        position = geometry.render(CGPoint(x: designCenterX, y: designCenterY))
        anchorPoint = location.anchor
        transform = CATransform3DMakeRotation(CGFloat(location.rotation) * .pi / 180, 0, 0, 1)
        zPosition = CGFloat(location.zIndex)
        name = location.id

        // A location badge has no timing/keyframe channel (RenderableItem
        // timing fields are all nil, see `StoryRenderer` conformance) — it
        // never changes mid-slide, so it's a safe `.play` rasterization
        // candidate, same as static text/stickers.
        shouldRasterize = mode == .play && location.isStatic
        if shouldRasterize { rasterizationScale = scale }
    }

    /// `place.name`, else `place.address`, else the localized "Ici" —
    /// NEVER blank: an unnamed pin dropped by hand still needs a label.
    /// Stays `@MainActor` (MeeshyUI's default isolation) because
    /// `Bundle.module` is itself MainActor-isolated in this target — unlike
    /// `StoryTextLayer.parseHexColorNonisolated`, which touches no bundle.
    @MainActor
    public static func resolvedLabel(for place: SharedPlace) -> String {
        if let name = place.name, !name.isEmpty { return name }
        if let address = place.address, !address.isEmpty { return address }
        return String(localized: "story.location.here", defaultValue: "Ici", bundle: .module)
    }

    /// Cadre du badge dans l'espace CANVAS (boîte englobante, rotation
    /// ignorée) — pensé pour le hit-test du reader : la couche de tap de
    /// l'app doit tomber EXACTEMENT là où `configure` dessine, d'où le
    /// partage strict des mêmes constantes, de la même mesure
    /// (`templateSize`) et des mêmes projections `CanvasGeometry`.
    @MainActor
    public static func badgeFrame(for location: StoryLocationObject,
                                  canvasSize: CGSize) -> CGRect {
        let geometry = CanvasGeometry(renderSize: canvasSize)
        let size = templateSize(for: location, geometry: geometry)
        let designCenterX = geometry.designLength(forNormalized: CGFloat(location.x))
        let designCenterY = geometry.designHeightLength(forNormalized: CGFloat(location.y))
        let center = geometry.render(CGPoint(x: designCenterX, y: designCenterY))
        return CGRect(x: center.x - size.width * location.anchor.x,
                      y: center.y - size.height * location.anchor.y,
                      width: size.width,
                      height: size.height)
    }

    // MARK: - La délégation au moteur de gabarits (#4717)

    /// **Le gabarit qui décore CE lieu.**
    ///
    /// Fail-closed sur deux cas distincts : un `styleId` inconnu (publié par une
    /// version plus récente) ET un `styleId` qui nomme un gabarit d'une AUTRE
    /// famille — « time.digital » sur une pastille de lieu ne doit pas dessiner
    /// une horloge à la place d'un lieu. Les deux retombent sur la pastille.
    static func resolvedTemplateID(_ styleId: String?) -> String {
        guard let styleId,
              let gabarit = StickerTemplateCatalog.template(id: styleId),
              gabarit.family == .location
        else { return StickerTemplateCatalog.defaultLocationTemplateID }
        return gabarit.id
    }

    /// Les emplacements du gabarit, remplis depuis le lieu.
    ///
    /// `StickerSlotFiller.placeSlots` dépouille le `SharedPlace` ; le repli
    /// « Ici » est appliqué ICI parce qu'il est LOCALISÉ, et que `MeeshySDK`
    /// n'a aucune ressource de localisation — seul `MeeshyUI` en déclare.
    @MainActor
    static func templateSlots(for place: SharedPlace) -> [String: String] {
        var emplacements = StickerSlotFiller.placeSlots(for: place)
        if (emplacements[StickerSlotFiller.placeNameSlot] ?? "").isEmpty {
            emplacements[StickerSlotFiller.placeNameSlot] = resolvedLabel(for: place)
        }
        return emplacements
    }

    /// La taille du gabarit — **une seule mesure pour le rendu ET le
    /// hit-test**, exactement comme `measuredBadgeSize` la partageait avant.
    @MainActor
    static func templateSize(for location: StoryLocationObject,
                             geometry: CanvasGeometry) -> CGSize {
        let mesures = StickerTemplateMetrics.location(geometry: geometry,
                                                      scale: CGFloat(location.scale))
        let emplacements = templateSlots(for: location.place)
        let id = resolvedTemplateID(location.styleId)
        return StickerTemplateRenderer.measuredSize(templateID: id,
                                                    slots: emplacements,
                                                    metrics: mesures)
            ?? StickerTemplateRenderer.measuredSize(
                templateID: StickerTemplateCatalog.defaultLocationTemplateID,
                slots: emplacements, metrics: mesures) ?? .zero
    }

    /// Le second repli — celui du moteur — est distinct du premier : un gabarit
    /// peut être CATALOGUÉ sans être encore DESSINÉ (les deux arrivent par des
    /// lots différents, #4716 puis #4718). Sans lui, une pastille déclarée
    /// « carte postale » ne rendrait rien du tout entre les deux.
    @MainActor
    static func templateImage(for location: StoryLocationObject,
                              geometry: CanvasGeometry,
                              screenScale: CGFloat) -> (UIImage?, CGSize) {
        let mesures = StickerTemplateMetrics.location(geometry: geometry,
                                                      scale: CGFloat(location.scale))
        let emplacements = templateSlots(for: location.place)
        let id = resolvedTemplateID(location.styleId)
        return StickerTemplateRenderer.image(templateID: id, slots: emplacements,
                                             metrics: mesures, screenScale: screenScale)
            ?? StickerTemplateRenderer.image(
                templateID: StickerTemplateCatalog.defaultLocationTemplateID,
                slots: emplacements, metrics: mesures,
                screenScale: screenScale) ?? (nil, .zero)
    }
}
