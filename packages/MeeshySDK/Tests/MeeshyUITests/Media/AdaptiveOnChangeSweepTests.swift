import XCTest
@testable import MeeshyUI

/// Mechanical sweep: these SDK views must drive their reactive state through
/// the `adaptiveOnChange` compat shim (two-param `(oldValue, newValue)`
/// closure, backed to iOS 16) instead of the deprecated single-parameter
/// `onChange(of:perform:)`. ViewInspector isn't a project dependency, so this
/// locks the call sites as a source-guard — read the code, not comments (cf.
/// `AvatarBannerNoRetryWiringTests`, the repo's established pattern for
/// asserting SwiftUI wiring that can't be introspected at runtime).
@MainActor
final class AdaptiveOnChangeSweepTests: XCTestCase {

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Media/
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_authTextField_usesAdaptiveOnChange_notRawOnChange() throws {
        let source = try sdkSource("Sources/MeeshyUI/Auth/Components/AuthTextField.swift")
        XCTAssertFalse(source.contains(".onChange(of: text) { newValue in"),
                        "AuthTextField must not use the deprecated single-param .onChange")
        XCTAssertTrue(source.contains(".adaptiveOnChange(of: text) { _, newValue in"),
                      "AuthTextField must drive validation through adaptiveOnChange")
    }

    func test_mediaTranscriptionView_usesAdaptiveOnChange_notRawOnChange() throws {
        let source = try sdkSource("Sources/MeeshyUI/Media/MediaTranscriptionView.swift")
        XCTAssertFalse(source.contains(".onChange(of: activeIndex) { idx in"),
                        "MediaTranscriptionView must not use the deprecated single-param .onChange")
        XCTAssertTrue(source.contains(".adaptiveOnChange(of: activeIndex) { _, idx in"),
                      "MediaTranscriptionView must scroll-to-active-segment through adaptiveOnChange")
    }

    func test_audioPlayerView_usesAdaptiveOnChange_forBothSites_notRawOnChange() throws {
        let source = try sdkSource("Sources/MeeshyUI/Media/AudioPlayerView.swift")
        XCTAssertFalse(source.contains(".onChange(of: player.isPlaying) { playing in"),
                        "AudioPlayerView must not use the deprecated single-param .onChange for isPlaying")
        XCTAssertTrue(source.contains(".adaptiveOnChange(of: player.isPlaying) { _, playing in"),
                      "AudioPlayerView must propagate isPlaying through adaptiveOnChange")

        XCTAssertFalse(source.contains(".onChange(of: externalLanguage?.wrappedValue) { newLang in"),
                        "AudioPlayerView must not use the deprecated single-param .onChange for externalLanguage")
        XCTAssertTrue(source.contains(".adaptiveOnChange(of: externalLanguage?.wrappedValue) { _, newLang in"),
                      "AudioPlayerView must react to externalLanguage through adaptiveOnChange")
    }
}
