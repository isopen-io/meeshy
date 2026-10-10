import Foundation

nonisolated enum StoryAudioActivationPolicy {

    static func shouldPrepare(mute: Bool, muteIsLocked: Bool) -> Bool {
        true
    }

    static func shouldActivate(hasClips: Bool, hasSoundingVideo: Bool, mute: Bool) -> Bool {
        true
    }

    static func shouldHoldEngine(hasClips: Bool, isMuted: Bool) -> Bool {
        false
    }
}
