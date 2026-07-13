import Foundation

/// Single source of truth for whether a story carries *audible* sound — and
/// therefore whether the Story Viewer should show its sound/mute button.
///
/// A story is audible when any of the following holds:
/// - it has a voice note (`voiceAttachmentId`) — a recording is inherently audio;
/// - it has a background-audio track whose volume is non-zero;
/// - it has an audio-player object whose volume is non-zero;
/// - it has a video whose volume is non-zero **and** which carries a real audio
///   track (see `videoAudioTracks`).
///
/// A silent video — one the author muted (`volume == 0`) or one shot without an
/// audio track — never counts: the sound button stays hidden for it.
public enum StoryAudioAvailability {

    /// - Parameters:
    ///   - effects: the story's effects payload. `nil` → not audible.
    ///   - videoAudioTracks: maps `StoryMediaObject.id` → `true` when that video
    ///     asset has been probed and found to carry a non-empty audio track. A
    ///     missing key means "unknown / not yet probed" and is treated as **not
    ///     audible**, so the button never flashes for a clip that turns out silent.
    public static func hasAudibleSound(effects: StoryEffects?,
                                       videoAudioTracks: [String: Bool]) -> Bool {
        guard let effects else { return false }

        if effects.voiceAttachmentId != nil { return true }

        if effects.backgroundAudioId != nil, (effects.backgroundAudioVolume ?? 1) > 0 {
            return true
        }

        if let audioObjects = effects.audioPlayerObjects,
           audioObjects.contains(where: { $0.volume > 0 }) {
            return true
        }

        if let mediaObjects = effects.mediaObjects {
            let hasAudibleVideo = mediaObjects.contains { object in
                object.kind == .video
                    && object.volume > 0
                    && (videoAudioTracks[object.id] ?? false)
            }
            if hasAudibleVideo { return true }
        }

        return false
    }

    /// Video media objects whose audio-track presence must be probed before the
    /// sound button can be decided. Videos the author already muted
    /// (`volume == 0`) are excluded — they are silent regardless of their track.
    public static func videosNeedingAudioProbe(effects: StoryEffects?) -> [StoryMediaObject] {
        (effects?.mediaObjects ?? []).filter { $0.kind == .video && $0.volume > 0 }
    }

    /// Single source of truth for whether a slide **carries** a background
    /// audio track — used by the header's music-note indicator, which signals
    /// PRESENCE (not playback state, not mute state: directive user
    /// 2026-07-13). Deliberately separate from `hasAudibleSound` (the
    /// sound-button predicate): the two answer different questions and must
    /// stay independently evolvable — `hasAudibleSound` also counts voice
    /// notes, audio-player objects and audible video, none of which are a
    /// "background audio" in the product sense this icon represents.
    /// - Parameters:
    ///   - effects: the story's effects payload — checked for the legacy
    ///     `backgroundAudioId` field (non-zero volume).
    ///   - backgroundAudio: the story-level `StoryBackgroundAudioEntry`, when
    ///     present, always counts (it carries no independent volume field).
    public static func hasBackgroundAudioTrack(effects: StoryEffects?,
                                                backgroundAudio: StoryBackgroundAudioEntry?) -> Bool {
        if backgroundAudio != nil { return true }
        guard let effects else { return false }
        return effects.backgroundAudioId != nil && (effects.backgroundAudioVolume ?? 1) > 0
    }
}
