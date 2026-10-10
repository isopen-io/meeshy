import Foundation

nonisolated enum StoryAudioActivationPolicy {

    static func shouldPrepare(mute: Bool, muteIsLocked: Bool) -> Bool {
        !(mute && muteIsLocked)
    }

    static func shouldActivate(hasClips: Bool, hasSoundingVideo: Bool, mute: Bool) -> Bool {
        !mute && (hasClips || hasSoundingVideo)
    }

    static func shouldHoldEngine(hasClips: Bool, isMuted: Bool) -> Bool {
        hasClips && isMuted
    }
}
