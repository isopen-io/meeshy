import SwiftUI
import MeeshySDK

/// Le SOL de la scène : ce qui en change le hachage et le fond choisi au Cadre.
enum ComposerSceneFloorRules {

    /// Le fond choisi au Cadre, quand la scène AJUSTE un média : il s'applique
    /// au sol aussi (directive porteur 2026-09-27). Le flou garde le hachage.
    static func backdropColor(slide: StorySlide) -> Color? {
        let transform = slide.effects.backgroundTransform
        guard !StoryBackgroundFraming.rendersFilled(transform?.videoFitMode),
              slide.effects.mediaObjects?.contains(where: \.isBackground) == true
        else { return nil }
        return StoryBackdrop.resolve(transform?.backdrop).solidColor
    }

    /// Ce qui change le RÉSULTAT au point de changer son hachage : la slide, son
    /// fond, sa matière, son cadrage et les bitmaps chargés. Une position ou une échelle ne
    /// la touchent pas — le sol n'a pas à être recalculé à chaque image d'un
    /// geste, et un hachage de 32 pixels ne verrait pas la différence.
    static func key(slide: StorySlide, imagesVersion: UInt64) -> ComposerSceneFloorKey {
        ComposerSceneFloorKey(slideId: slide.id,
                              background: slide.effects.background,
                              media: slide.effects.mediaObjects?.map(\.id) ?? [],
                              texts: slide.effects.textObjects.map(\.id),
                              framing: [slide.effects.backgroundTransform?.videoFitMode,
                                        slide.effects.backgroundTransform?.backdrop],
                              imagesVersion: imagesVersion)
    }
}

/// La clé du SOL de la scène — ce qui en change le hachage (#8370).
struct ComposerSceneFloorKey: Hashable {
    let slideId: String
    let background: String?
    let media: [String]
    let texts: [String]
    /// Le cadrage et le fond du panneau Cadre (#8414) : ils changent le composite.
    let framing: [String?]
    let imagesVersion: UInt64
}
