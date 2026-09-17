import UIKit
import MeeshySDK

/// **Le mesureur que la loi `StoryImageOnlyPresentation` reçoit du rendu**
/// (#6636).
///
/// La loi sait QUELS objets comptent et QUELLE question leur poser ; elle ne
/// sait pas quelle place un texte prend — c'est une police, un retour à la
/// ligne, un cadre de forme. Ce fichier le lui dit, et il le dit avec la
/// géométrie du RENDU, jamais avec une jumelle :
///
/// - un **texte** est mesuré par un `StoryTextLayer` configuré exactement comme
///   `StoryRenderer.renderItem` le configure (Prisme compris : la traduction
///   servie n'a pas la longueur de l'original) ;
/// - un **média de premier plan** passe par `StoryMediaLayer.renderedPose`, la
///   fonction que sa propre `configure` appelle ;
/// - un **sticker** et une **pastille de lieu** passent par les mesures que
///   leurs calques partagent déjà avec le dessin (`CanvasGeometry.stickerFontSize`,
///   `StickerTemplateRenderer.measuredSize`, `StoryLocationLayer.templateSize`) ;
/// - une **puce de son** n'a pas de cadre dans le repère du canvas : le lecteur
///   la place dans le sien. Elle rend `nil`, et la loi garde la carte.
///
/// Le témoin `StorySceneFootprintTests` compare chaque empreinte au `frame` du
/// calque que `StoryRenderer.render` pose réellement.
@MainActor
public enum StorySceneFootprint {

    /// Le verdict pour une slide RENDABLE — celle que `toRenderableSlide`
    /// hydrate, dont le fond porte son ratio mesuré.
    public static func verdict(for slide: StorySlide,
                               canvasSize: CGSize,
                               languages: [String]) -> StoryImageOnlyPresentation.Verdict {
        let effects = slide.effects
        let ratio = effects.resolvedBackgroundMedia?.measuredAspectRatio
        let mediaSize = ratio.flatMap { $0 > 0 ? CGSize(width: $0, height: 1) : nil }
        return StoryImageOnlyPresentation.resolve(
            effects: effects,
            mediaSize: mediaSize,
            canvasSize: canvasSize,
            drawing: drawingExtent(of: effects, canvasSize: canvasSize),
            footprint: { footprint(of: $0, canvasSize: canvasSize, languages: languages) })
    }

    public static func footprint(of object: MeeshySceneObject,
                                 canvasSize: CGSize,
                                 languages: [String]) -> StoryImageOnlyPresentation.Footprint? {
        guard canvasSize.width > 0, canvasSize.height > 0 else { return nil }
        let geometry = CanvasGeometry(renderSize: canvasSize)
        switch object {
        case .text(let text):
            var servi = text
            servi.text = text.resolvedText(preferredLanguages: languages)
            let calque = StoryTextLayer()
            calque.configure(with: servi, geometry: geometry, mode: .play)
            return .init(position: calque.position, size: calque.bounds.size,
                         anchor: calque.anchorPoint, rotationDegrees: text.rotation)
        case .media(let media):
            let pose = StoryMediaLayer.renderedPose(for: media, geometry: geometry)
            return .init(position: pose.center, size: pose.size,
                         anchor: media.anchor, rotationDegrees: media.rotation)
        case .sticker(let sticker):
            return .init(position: center(x: sticker.x, y: sticker.y, geometry: geometry),
                         size: stickerSize(sticker, geometry: geometry),
                         anchor: sticker.anchor, rotationDegrees: sticker.rotation)
        case .place(let place):
            return .init(position: center(x: place.x, y: place.y, geometry: geometry),
                         size: StoryLocationLayer.templateSize(for: place, geometry: geometry),
                         anchor: place.anchor, rotationDegrees: place.rotation)
        case .audio:
            return nil
        }
    }

    /// Le dessin, dans l'ordre que `StoryRenderer.bakedDrawingImage` applique :
    /// les traits d'abord, l'ancien `PKDrawing` opaque sinon.
    static func drawingExtent(of effects: StoryEffects,
                              canvasSize: CGSize) -> StoryImageOnlyPresentation.DrawingExtent {
        if let traits = effects.drawingStrokes, !traits.isEmpty {
            return StoryImageOnlyPresentation.strokeBounds(traits,
                                                           designSize: CanvasGeometry.designSize,
                                                           canvasSize: canvasSize)
        }
        return effects.drawingData == nil ? .none : .unmeasurable
    }

    private static func center(x: Double, y: Double, geometry: CanvasGeometry) -> CGPoint {
        geometry.render(CGPoint(x: geometry.designLength(forNormalized: CGFloat(x)),
                                y: geometry.designHeightLength(forNormalized: CGFloat(y))))
    }

    /// La boîte que `StoryStickerLayer.configure` pose : celle du gabarit quand
    /// il se dessine, le carré du glyphe sinon.
    private static func stickerSize(_ sticker: StorySticker, geometry: CanvasGeometry) -> CGSize {
        let côté = CanvasGeometry.stickerFontSize(baseSize: sticker.baseSize, scale: sticker.scale,
                                                  canvasWidth: geometry.renderSize.width)
        guard sticker.kind == .template,
              let gabarit = StickerTemplateRenderer.measuredSize(
                  templateID: sticker.templateId,
                  slots: sticker.slots,
                  metrics: .sticker(geometry: geometry, baseSize: sticker.baseSize,
                                    scale: sticker.scale)),
              gabarit.width > 0, gabarit.height > 0
        else { return CGSize(width: côté, height: côté) }
        return gabarit
    }
}
