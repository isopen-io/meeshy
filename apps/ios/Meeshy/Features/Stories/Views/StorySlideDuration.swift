import Foundation
import MeeshySDK

/// The duration of the story slide on screen — the SINGLE source the viewer's
/// progress bar (wall clock) and the canvas auto-advance
/// (`StoryCanvasUIView.displayLinkTick.effectiveDuration`) both use (#13135).
///
/// User spec 2026-05-27: a static slide lasts 6 s (lowered from 12 s after
/// « stories last too long », Instagram/Snapchat parity); a slide with a
/// background video or audio lasts as long as its media (looped when shorter
/// than 6 s), rounded up to whole loop periods so a background clip is NEVER
/// cut mid-cycle; a configured `storyEffects.slideDuration` wins when > 0.
/// Before this, `slideDuration` returned early and longer media were cut: the
/// video vanished while its sound went on.
///
/// `preferredLanguages: []`: language resolution does not affect the duration
/// (`computedTotalDuration` no longer reads the resolved text).
enum StorySlideDuration {
    static let fallback: Double = 6.0

    static func of(_ story: StoryItem?) -> Double {
        guard let story else { return fallback }
        return story.toRenderableSlide(preferredLanguages: []).computedTotalDuration()
    }
}
