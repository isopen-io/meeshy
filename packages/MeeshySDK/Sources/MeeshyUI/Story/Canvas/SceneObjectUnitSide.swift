import CoreGraphics
import MeeshySDK

/// **Le plus petit côté d'un objet posé à l'échelle 1, en pixels de la scène
/// de référence 1080 × 1920** (#14299) — le dénominateur du plancher de
/// `SceneObjectScalePolicy`.
///
/// Chaque famille le lit dans le calcul qui la DESSINE, jamais dans une
/// approximation : un plancher mesuré ailleurs que là où l'objet est peint
/// arrêterait la réduction à une taille que l'écran ne montre pas.
@MainActor
public enum SceneObjectUnitSide {

    private static let reference = CanvasGeometry(renderSize: CanvasGeometry.designSize)

    public static func designSide(of object: MeeshySceneObject) -> Double {
        switch object {
        case .sticker(let sticker):
            return stickerSide(sticker)
        case .media(let media):
            return smallestSide(StoryMediaLayer.baseMediaDesignSize(for: media))
        case .text(let texte):
            return texte.fontSize
        case .place(var lieu):
            lieu.scale = 1
            return smallestSide(StoryLocationLayer.templateSize(for: lieu, geometry: reference))
        case .audio(var son):
            son.scale = 1
            return smallestSide(StoryAudioChipPainter.placement(for: son, renderSize: reference.renderSize,
                                                                elapsed: 0).size)
        }
    }

    private static func stickerSide(_ sticker: StorySticker) -> Double {
        guard sticker.kind == .template,
              let boite = StickerTemplateRenderer.measuredSize(
                templateID: sticker.templateId, slots: sticker.slots,
                metrics: .sticker(geometry: reference, baseSize: sticker.baseSize, scale: 1)),
              boite.width > 0, boite.height > 0 else { return sticker.baseSize }
        return smallestSide(boite)
    }

    private static func smallestSide(_ size: CGSize) -> Double {
        Double(min(size.width, size.height))
    }
}
