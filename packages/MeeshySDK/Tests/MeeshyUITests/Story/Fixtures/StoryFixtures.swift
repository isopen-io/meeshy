import Foundation
@testable import MeeshyUI
@testable import MeeshySDK

enum StoryFixtures {
    static func emptySlide(staticBaseDuration: Double = 12.0) -> StorySlide {
        fatalError("Implement after P1 model migration")
    }

    static func textOnlySlide(text: String = "Hello",
                              fontSize: Double = 64.0,
                              x: Double = 0.5,
                              y: Double = 0.5) -> StorySlide {
        fatalError("Implement after P1 model migration")
    }

    static func mediaOnlySlide(aspectRatio: Double = 1.0,
                               x: Double = 0.5,
                               y: Double = 0.5,
                               scale: Double = 1.0,
                               rotation: Double = 0.0) -> StorySlide {
        fatalError("Implement after P1 model migration")
    }

    static func complexSlide() -> StorySlide {
        // Vidéo de fond 5s en boucle + 2 textes + 1 sticker à différents startTime
        fatalError("Implement after P1 model migration")
    }

    static func loopVideoSlide(videoDurationSec: Double,
                               staticBase: Double = 12.0) -> StorySlide {
        fatalError("Implement after P1 model migration")
    }
}
