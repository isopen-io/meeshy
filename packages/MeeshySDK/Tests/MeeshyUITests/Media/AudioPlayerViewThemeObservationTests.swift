import Testing
@testable import MeeshyUI
@testable import MeeshySDK

/// `AudioPlayerView` is instantiated once per audio bubble in a message
/// list — a genuine SwiftUI leaf view rendered many times per screen.
/// Observing `ThemeManager.shared` via `@ObservedObject` there would
/// invalidate EVERY audio bubble on screen on every theme publish, defeating
/// `.equatable()` upstream (CLAUDE.md "Zero Unnecessary Re-render"). `isDark`
/// must be derived from `@Environment(\.colorScheme)` instead — the blessed
/// leaf-view alternative — while the `externalPlayer` `@ObservedObject`
/// (per-instance playback data, not a global singleton) remains legitimate.
@Suite("AudioPlayerView theme observation")
struct AudioPlayerViewThemeObservationTests {

    @MainActor
    private func makeAttachment() -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(
            id: "att-theme-1",
            fileName: "a.m4a",
            mimeType: "audio/m4a",
            fileUrl: "https://x/a.m4a",
            duration: 1600
        )
    }

    @Test("AudioPlayerView does not hold an @ObservedObject on ThemeManager")
    @MainActor
    func test_audioPlayerView_doesNotObserveThemeManager() {
        let view = AudioPlayerView(attachment: makeAttachment(), context: .messageBubble)
        let mirror = Mirror(reflecting: view)
        let observesThemeManager = mirror.children.contains { child in
            let typeName = String(describing: type(of: child.value))
            return typeName.contains("ObservedObject") && typeName.contains("ThemeManager")
        }
        #expect(!observesThemeManager, "AudioPlayerView must not @ObservedObject ThemeManager.shared — leaf view rule violation")
    }
}
