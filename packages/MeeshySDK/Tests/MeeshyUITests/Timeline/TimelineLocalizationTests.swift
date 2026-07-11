import XCTest
@testable import MeeshyUI

/// Verifies that every i18n key used by the Timeline UI resolves to a non-empty
/// localized string. If a key is missing in Localizable.xcstrings, the bundle
/// returns the key itself, which the assertion catches.
final class TimelineLocalizationTests: XCTestCase {

    private static let keys: [String] = [
        // Transport
        "story.timeline.transport.play",
        "story.timeline.transport.pause",
        "story.timeline.transport.mute",
        "story.timeline.transport.unmute",
        "story.timeline.transport.zoomIn",
        "story.timeline.transport.zoomOut",
        "story.timeline.transport.zoomReset",
        "story.timeline.transport.timeReadout",
        // Export
        "story.timeline.export.button",
        "story.timeline.export.exporting",
        "story.timeline.export.failedTitle",
        "story.timeline.export.previewTitle",
        // Mode
        "story.timeline.mode.quick",
        "story.timeline.mode.pro",
        "story.timeline.mode.switchToQuick",
        "story.timeline.mode.switchToPro",
        // Toolbar
        "story.timeline.toolbar.snap",
        "story.timeline.toolbar.undo",
        "story.timeline.toolbar.redo",
        "story.timeline.toolbar.deployTracks",
        "story.timeline.toolbar.collapseTracks",
        // Sections
        "story.timeline.section.contenu",
        "story.timeline.section.audio",
        "story.timeline.section.effets",
        // Tracks
        "story.timeline.track.video",
        "story.timeline.track.image",
        "story.timeline.track.audio",
        "story.timeline.track.text",
        "story.timeline.track.bgVideo",
        "story.timeline.track.bgAudio",
        "story.timeline.track.lock",
        "story.timeline.track.unlock",
        // Clip
        "story.timeline.clip.duplicate",
        "story.timeline.clip.delete",
        "story.timeline.clip.split",
        "story.timeline.clip.bringToFront",
        "story.timeline.clip.toggleBackground",
        "story.timeline.clip.tooltip.start",
        "story.timeline.clip.tooltip.duration",
        "story.timeline.clip.tooltip.fadeIn",
        "story.timeline.clip.tooltip.fadeOut",
        // Transition
        "story.timeline.transition.crossfade",
        "story.timeline.transition.dissolve",
        "story.timeline.transition.duration",
        "story.timeline.transition.delete",
        // Keyframe
        "story.timeline.keyframe.add",
        "story.timeline.keyframe.delete",
        "story.timeline.keyframe.position",
        "story.timeline.keyframe.scale",
        "story.timeline.keyframe.opacity",
        // Inspector
        "story.timeline.inspector.start",
        "story.timeline.inspector.duration",
        "story.timeline.inspector.volume",
        "story.timeline.inspector.loop",
        "story.timeline.inspector.background",
        // SnapGuide
        "story.timeline.snapGuide.playhead",
        "story.timeline.snapGuide.clipStart",
        "story.timeline.snapGuide.clipEnd",
        "story.timeline.snapGuide.keyframe",
        "story.timeline.snapGuide.gridMajor",
        // Errors
        "story.timeline.error.mediaUnavailable",
        "story.timeline.error.audioFailed",
        "story.timeline.error.diskFull",
        "story.timeline.error.assetLoadFailed",
        // Empty
        "story.timeline.empty.addContent",
        "story.timeline.empty.addMediaPrompt",
        // A11y
        "story.timeline.a11y.clip.video",
        "story.timeline.a11y.clip.audio",
        "story.timeline.a11y.clip.text",
        "story.timeline.a11y.transition",
        "story.timeline.a11y.keyframe",
        "story.timeline.a11y.playhead",
        "story.timeline.a11y.durationHandle",
        "story.timeline.a11y.snap.on",
        "story.timeline.a11y.snap.off",
        // Transition kind labels
        "story.timeline.transition.kind.crossfade",
        "story.timeline.transition.kind.dissolve",
        // Clip a11y time ranges
        "story.timeline.a11y.clip.timeRange",
        "story.timeline.a11y.clip.displayedRange",
        // Track section uppercase labels
        "story.timeline.track.section.video",
        "story.timeline.track.section.audio",
        "story.timeline.track.section.text",
    ]

    func test_allTimelineKeys_resolveToNonEmptyValue() {
        for key in Self.keys {
            let resolved = String(localized: String.LocalizationValue(key), bundle: .module)
            XCTAssertNotEqual(resolved, key,
                              "Missing localization for key '\(key)' — add it to Localizable.xcstrings")
            XCTAssertFalse(resolved.isEmpty, "Empty value for '\(key)'")
        }
    }
}
