import Foundation

// MARK: - Story Canvas Notifications

/// Notification names shared across the story canvas, composer, viewer, and audio player.
/// Previously defined in StoryCanvasReaderView.swift (legacy); moved here after that file
/// was deleted in the Phase A4 reader migration.
public extension Notification.Name {
    /// Posted by the viewer approximately 2 s before the end of a slide to trigger audio fade-out.
    static let storyAudioFadeOut = Notification.Name("storyAudioFadeOut")
    /// Posted by the composer to mute all canvas audio (e.g., while the audio picker is open).
    static let storyComposerMuteCanvas = Notification.Name("storyComposerMuteCanvas")
    /// Posted by the composer to restore canvas audio after muting.
    static let storyComposerUnmuteCanvas = Notification.Name("storyComposerUnmuteCanvas")
    /// Posted by the composer's left rail (« Arrière-plan » / « Premier plan »
    /// chips) when the user picks which layer receives gestures. `object` is
    /// the `CanvasManipulationLayer.rawValue` (String). Directive user
    /// 2026-07-14 : la bordure gauche ne parle plus de « Canvas ».
    static let storyComposerSelectManipulationLayer = Notification.Name("storyComposerSelectManipulationLayer")
    /// Posted by the viewer when the user toggles the story to a paused state
    /// (long-press toggle). The canvas pauses ALL media playback —
    /// background video, foreground videos and audio engine — so the story
    /// freezes as a single unit alongside the progress-bar timer.
    static let storyPlayerPause = Notification.Name("storyPlayerPause")
    /// Posted by the viewer when the user toggles the story back to playing
    /// (tap on a paused story). Mirrors `storyPlayerPause` — the canvas
    /// resumes background video, foreground videos and audio engine together.
    static let storyPlayerResume = Notification.Name("storyPlayerResume")
    /// Posted by the timeline when playback starts inside the composer.
    static let timelineDidStartPlaying = Notification.Name("timelineDidStartPlaying")
    /// Posted by the timeline when playback stops inside the composer.
    static let timelineDidStopPlaying = Notification.Name("timelineDidStopPlaying")
}
