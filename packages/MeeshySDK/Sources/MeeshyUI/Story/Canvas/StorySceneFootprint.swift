import UIKit
import MeeshySDK

/// Squelette du mesureur (#6636) — rend toujours la carte, pour voir ses
/// témoins rougir avant la mesure.
@MainActor
public enum StorySceneFootprint {

    public static func verdict(for slide: StorySlide,
                               canvasSize: CGSize,
                               languages: [String]) -> StoryImageOnlyPresentation.Verdict {
        .canvas
    }

    public static func footprint(of object: MeeshySceneObject,
                                 canvasSize: CGSize,
                                 languages: [String]) -> StoryImageOnlyPresentation.Footprint? {
        nil
    }
}
