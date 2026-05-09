import Foundation
@testable import MeeshyUI
@testable import MeeshySDK

enum StoryFixtures {
    static func emptySlide(staticBaseDuration: Double = 12.0) -> StorySlide {
        StorySlide(id: UUID().uuidString,
                   effects: StoryEffects(),
                   duration: staticBaseDuration,
                   order: 0)
    }

    static func textOnlySlide(text: String = "Hello",
                              fontSize: Double = 64.0,
                              x: Double = 0.5,
                              y: Double = 0.5) -> StorySlide {
        let textObj = StoryTextObject(
            id: UUID().uuidString,
            text: text,
            x: x, y: y,
            fontSize: fontSize
        )
        var effects = StoryEffects()
        effects.textObjects = [textObj]
        return StorySlide(id: UUID().uuidString,
                          effects: effects,
                          duration: 12.0,
                          order: 0)
    }

    static func mediaOnlySlide(aspectRatio: Double = 1.0,
                               x: Double = 0.5,
                               y: Double = 0.5,
                               scale: Double = 1.0,
                               rotation: Double = 0.0) -> StorySlide {
        let mediaObj = StoryMediaObject(
            id: UUID().uuidString,
            postMediaId: UUID().uuidString,
            mediaType: "image",
            placement: "media",
            aspectRatio: aspectRatio,
            x: x, y: y,
            scale: scale,
            rotation: rotation
        )
        var effects = StoryEffects()
        effects.mediaObjects = [mediaObj]
        return StorySlide(id: UUID().uuidString,
                          effects: effects,
                          duration: 12.0,
                          order: 0)
    }

    static func complexSlide() -> StorySlide {
        // Vidéo de fond 5s en boucle + 2 textes + 1 sticker à différents startTime
        let videoId = UUID().uuidString
        let video = StoryMediaObject(
            id: videoId,
            postMediaId: UUID().uuidString,
            mediaType: "video",
            placement: "media",
            aspectRatio: 9.0 / 16.0,
            isBackground: true,
            loop: true,
            startTime: 0.0,
            duration: 5.0
        )

        let text1 = StoryTextObject(
            id: UUID().uuidString,
            text: "Hello",
            x: 0.5, y: 0.3,
            fontSize: 64.0,
            startTime: 0.0,
            duration: 3.0
        )
        let text2 = StoryTextObject(
            id: UUID().uuidString,
            text: "World",
            x: 0.5, y: 0.6,
            fontSize: 48.0,
            startTime: 2.0,
            duration: 4.0
        )

        let sticker = StorySticker(
            id: UUID().uuidString,
            emoji: "🔥",
            x: 0.8, y: 0.2,
            scale: 1.5,
            rotation: 15.0,
            zIndex: 1
        )

        var effects = StoryEffects()
        effects.mediaObjects = [video]
        effects.textObjects = [text1, text2]
        effects.stickerObjects = [sticker]

        return StorySlide(id: UUID().uuidString,
                          effects: effects,
                          duration: 12.0,
                          order: 0)
    }

    static func loopVideoSlide(videoDurationSec: Double,
                               staticBase: Double = 12.0) -> StorySlide {
        let video = StoryMediaObject(
            id: UUID().uuidString,
            postMediaId: UUID().uuidString,
            mediaType: "video",
            placement: "media",
            aspectRatio: 9.0 / 16.0,
            isBackground: true,
            loop: true,
            startTime: 0.0,
            duration: videoDurationSec
        )

        var effects = StoryEffects()
        effects.mediaObjects = [video]

        return StorySlide(id: UUID().uuidString,
                          effects: effects,
                          duration: staticBase,
                          order: 0)
    }
}
