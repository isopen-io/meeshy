import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class ClipBarAccessibilityTests: XCTestCase {

    private final class Recorder {
        var events: [String] = []
    }

    private func model(zoom: CGFloat = 1, locked: Bool = false, muteLabels: Bool = false,
                       muted: Bool = false) -> ClipBarAccessibility {
        ClipBarAccessibility(
            geometry: TimelineGeometry(zoomScale: zoom),
            isLocked: locked,
            muteLabels: muteLabels ? (mute: "Couper", unmute: "Activer") : nil,
            isMuted: muted
        )
    }

    private func callbacks(_ recorder: Recorder, mute: Bool = true) -> ClipBarCallbacks {
        ClipBarCallbacks(
            onTap: { recorder.events.append("tap") },
            onDoubleTap: { recorder.events.append("doubleTap") },
            onMoveDelta: { recorder.events.append("move(\(Int($0.rounded())))") },
            onMoveEnded: { recorder.events.append("ended") },
            onTrimStartDelta: { recorder.events.append("trimStart(\(Int($0.rounded())))") },
            onTrimEndDelta: { recorder.events.append("trimEnd(\(Int($0.rounded())))") },
            onToggleMute: mute ? { recorder.events.append("mute") } : nil
        )
    }

    func test_stepPoints_isPointOneSecondAtCurrentZoom() {
        XCTAssertEqual(model(zoom: 1).stepPoints, 5, accuracy: 0.001)
        XCTAssertEqual(model(zoom: 2).stepPoints, 10, accuracy: 0.001)
    }

    func test_moveDelta_followsTheDirection_andIsNilWhenLocked() throws {
        XCTAssertEqual(try XCTUnwrap(model().moveDelta(.increment)), 5, accuracy: 0.001)
        XCTAssertEqual(try XCTUnwrap(model().moveDelta(.decrement)), -5, accuracy: 0.001)
        XCTAssertNil(model(locked: true).moveDelta(.increment))
    }

    func test_adjust_increment_callsMoveDeltaThenMoveEnded_inOrder() {
        let recorder = Recorder()
        callbacks(recorder).adjust(.increment, model: model())
        XCTAssertEqual(recorder.events, ["move(5)", "ended"])
    }

    func test_adjust_onLockedClip_doesNothing() {
        let recorder = Recorder()
        callbacks(recorder).adjust(.increment, model: model(locked: true))
        XCTAssertTrue(recorder.events.isEmpty)
    }

    func test_actionKinds_unlocked_trimsAndInspect() {
        XCTAssertEqual(model().actionKinds, [.startLater, .startEarlier, .endLater, .endEarlier, .inspect])
    }

    func test_actionKinds_locked_inspectOnly() {
        XCTAssertEqual(model(locked: true).actionKinds, [.inspect])
    }

    func test_actionKinds_mutedOffersUnmute_unmutedOffersMute() {
        XCTAssertEqual(model(muteLabels: true, muted: true).actionKinds.last, .unmute)
        XCTAssertEqual(model(muteLabels: true, muted: false).actionKinds.last, .mute)
    }

    func test_actionKinds_noMuteHandler_noMuteAction() {
        let kinds = model(muteLabels: false).actionKinds
        XCTAssertFalse(kinds.contains(.mute))
        XCTAssertFalse(kinds.contains(.unmute))
    }

    func test_actionLabels_resolveInBundleModule_andAreNotKeys() {
        let subject = model(muteLabels: true)
        for kind in ClipBarAction.allCases {
            let label = subject.label(for: kind)
            XCTAssertFalse(label.isEmpty, kind.rawValue)
            XCTAssertFalse(label.hasPrefix("story.timeline.a11y.action"), "clé non résolue : \(label)")
        }
    }

    func test_perform_startLater_callsTrimStartOncePlusStep() {
        let recorder = Recorder()
        callbacks(recorder).perform(.startLater, model: model())
        XCTAssertEqual(recorder.events, ["trimStart(5)"])
    }

    func test_perform_endEarlier_callsTrimEndMinusStep() {
        let recorder = Recorder()
        callbacks(recorder).perform(.endEarlier, model: model())
        XCTAssertEqual(recorder.events, ["trimEnd(-5)"])
    }

    func test_perform_inspect_callsDoubleTap_andMute_callsToggleMute() {
        let recorder = Recorder()
        let subject = callbacks(recorder)
        subject.perform(.inspect, model: model())
        subject.perform(.mute, model: model(muteLabels: true))
        XCTAssertEqual(recorder.events, ["doubleTap", "mute"])
    }

    func test_videoAudioTextBars_exposeModelMatchingTheirProps() {
        let geometry = TimelineGeometry(zoomScale: 1)
        let video = VideoClipBar(clipId: "v", title: "V", startTime: 0, duration: 2, fadeIn: 0, fadeOut: 0,
                                 isSelected: false, isLocked: false, isDark: false, geometry: geometry,
                                 laneHeight: 52, frames: [], isMuted: true, onToggleMute: {},
                                 onTap: {}, onDoubleTap: {}, onTrimStartDelta: { _ in },
                                 onTrimEndDelta: { _ in }, onMoveDelta: { _ in })
        XCTAssertEqual(video.accessibilityModel.actionKinds.last, .unmute)
        let audio = AudioClipBar(clipId: "a", title: "A", startTime: 0, duration: 2, volume: 0.5,
                                 isMuted: false, isSelected: false, isLocked: true, isDark: false,
                                 geometry: geometry, laneHeight: 52, waveformSamples: [],
                                 onTap: {}, onDoubleTap: {}, onMoveDelta: { _ in },
                                 onToggleMute: {})
        XCTAssertEqual(audio.accessibilityModel.actionKinds, [.inspect, .mute])
        let text = TextClipBar(clipId: "t", content: "T", startTime: 0, duration: 2, isSelected: false,
                               isLocked: false, isDark: false, geometry: geometry, laneHeight: 52,
                               onTap: {}, onDoubleTap: {}, onMoveDelta: { _ in })
        XCTAssertFalse(text.accessibilityModel.actionKinds.contains(.mute))
        XCTAssertTrue(text.accessibilityModel.actionKinds.contains(.startLater))
    }

    func test_audioBar_valueStartsWithDisplayedRange_andKeepsVolume() {
        let audio = AudioClipBar(clipId: "a", title: "A", startTime: 1, duration: 2, volume: 0.5,
                                 isMuted: false, isSelected: false, isLocked: false, isDark: false,
                                 geometry: TimelineGeometry(zoomScale: 1), laneHeight: 52, waveformSamples: [],
                                 onTap: {}, onDoubleTap: {}, onMoveDelta: { _ in })
        let range = String(format: String(localized: "story.timeline.a11y.clip.displayedRange", bundle: .module),
                           Float(1), Float(3))
        XCTAssertTrue(audio.accessibilityValueComposed.hasPrefix(range))
        XCTAssertTrue(audio.accessibilityValueComposed.hasSuffix(audio.accessibilityValueDescription))
        XCTAssertEqual(audio.accessibilityValueDescription, "Volume 50%")
    }
}
