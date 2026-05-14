import Foundation

// MARK: - Story Slide Export Trigger
//
// Spec : docs/superpowers/specs/2026-05-12-story-publish-exporter-wiring-design.md §3.2
//
// Computed property exposing whether a given slide contains at least one
// time-evolving element that requires a baked-in video export to render
// correctly outside the live canvas (sharing, downloads, push notifications,
// web feed). Static slides (text + stickers + image media only) can be served
// as a poster image and skip the exporter pipeline entirely.

extension StorySlide {
    /// Returns true when the slide has at least one time-evolving element
    /// that requires a baked-in video export to render correctly outside the
    /// live canvas (sharing, downloads, push notifications, web feed).
    public var needsVideoExport: Bool {
        // Background video media → looped
        if effects.mediaObjects?.contains(where: { $0.kind == .video }) == true { return true }
        // Background audio or voice
        if effects.backgroundAudioId != nil { return true }
        if effects.voiceAttachmentId != nil { return true }
        // Animated keyframes on text or media
        if effects.textObjects.contains(where: { ($0.keyframes?.count ?? 0) > 0 }) { return true }
        if effects.mediaObjects?.contains(where: { ($0.keyframes?.count ?? 0) > 0 }) == true { return true }
        // Clip transitions
        if (effects.clipTransitions?.count ?? 0) > 0 { return true }
        // Opening reveal/fade
        if effects.opening != nil { return true }
        return false
    }
}
