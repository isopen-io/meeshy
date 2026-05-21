import Testing
import Foundation
@testable import MeeshyUI
@testable import MeeshySDK

// MARK: - StoryReaderAudioMuteRegistry

@MainActor
@Suite("StoryReaderAudioMuteRegistry")
struct StoryReaderAudioMuteRegistryTests {

    private func makeSubject() -> StoryReaderAudioMuteRegistry {
        StoryReaderAudioMuteRegistry()
    }

    @Test("isMuted is false by default for any id")
    func defaultIsUnmuted() {
        let r = makeSubject()
        #expect(r.isMuted("foo") == false)
        #expect(r.muted.isEmpty)
    }

    @Test("toggle adds the id and returns true on first call")
    func toggleFirstCallMutes() {
        let r = makeSubject()
        let result = r.toggle("clip-1")
        #expect(result == true)
        #expect(r.isMuted("clip-1") == true)
        #expect(r.muted == ["clip-1"])
    }

    @Test("toggle removes the id and returns false on second call")
    func toggleSecondCallUnmutes() {
        let r = makeSubject()
        _ = r.toggle("clip-1")
        let result = r.toggle("clip-1")
        #expect(result == false)
        #expect(r.isMuted("clip-1") == false)
        #expect(r.muted.isEmpty)
    }

    @Test("toggle isolates between ids")
    func toggleIndependentIds() {
        let r = makeSubject()
        _ = r.toggle("a")
        _ = r.toggle("b")
        #expect(r.isMuted("a") == true)
        #expect(r.isMuted("b") == true)
        #expect(r.isMuted("c") == false)
        _ = r.toggle("a")
        #expect(r.isMuted("a") == false)
        #expect(r.isMuted("b") == true)
    }

    @Test("clear removes every muted id")
    func clearEmptiesAll() {
        let r = makeSubject()
        _ = r.toggle("a"); _ = r.toggle("b"); _ = r.toggle("c")
        r.clear()
        #expect(r.muted.isEmpty)
        #expect(r.isMuted("a") == false)
    }

    @Test("clear on already-empty registry is a no-op")
    func clearOnEmptyNoOp() {
        let r = makeSubject()
        r.clear()  // ne doit pas crasher
        #expect(r.muted.isEmpty)
    }
}

// MARK: - StoryReaderPlayheadState

@MainActor
@Suite("StoryReaderPlayheadState")
struct StoryReaderPlayheadStateTests {

    private func makeSubject() -> StoryReaderPlayheadState {
        StoryReaderPlayheadState()
    }

    @Test("elapsedSeconds is nil before any publish")
    func initialIsNil() {
        let s = makeSubject()
        #expect(s.elapsedSeconds == nil)
    }

    @Test("first publish always sets a value (no quantum gate)")
    func firstPublishSets() {
        let s = makeSubject()
        s.publish(0.001)  // sous le quantum mais c'est le premier tick
        #expect(s.elapsedSeconds == 0.001)
    }

    @Test("publish below quantum delta is throttled")
    func publishBelowQuantumThrottled() {
        let s = makeSubject()
        s.publish(1.0)
        s.publish(1.0 + StoryReaderPlayheadState.quantum / 2)
        #expect(s.elapsedSeconds == 1.0)  // pas mis à jour
    }

    @Test("publish above quantum delta updates")
    func publishAboveQuantumUpdates() {
        let s = makeSubject()
        s.publish(1.0)
        let next = 1.0 + StoryReaderPlayheadState.quantum * 2
        s.publish(next)
        #expect(s.elapsedSeconds == next)
    }

    @Test("publish clamps negative values to 0")
    func publishClampsNegative() {
        let s = makeSubject()
        s.publish(-5.0)
        #expect(s.elapsedSeconds == 0)
    }

    @Test("backward jump exceeding quantum is published (loops / scrubs)")
    func backwardJumpPublished() {
        let s = makeSubject()
        s.publish(5.0)
        s.publish(0.5)  // delta > quantum
        #expect(s.elapsedSeconds == 0.5)
    }

    @Test("reset returns state to nil")
    func resetClears() {
        let s = makeSubject()
        s.publish(2.5)
        s.reset()
        #expect(s.elapsedSeconds == nil)
    }

    @Test("reset on already-nil state is a no-op")
    func resetOnNilNoOp() {
        let s = makeSubject()
        s.reset()
        #expect(s.elapsedSeconds == nil)
    }

    @Test("after reset, next publish behaves like a first publish")
    func resetThenPublish() {
        let s = makeSubject()
        s.publish(2.5)
        s.reset()
        s.publish(0.001)
        #expect(s.elapsedSeconds == 0.001)  // pas de throttle après reset
    }
}

// MARK: - AudioForegroundReaderOverlay.visibleAudios

@MainActor
@Suite("AudioForegroundReaderOverlay.visibleAudios")
struct AudioForegroundReaderOverlayFilterTests {

    private func audio(id: String,
                       isBackground: Bool? = false,
                       startTime: Float? = nil,
                       duration: Float? = nil) -> StoryAudioPlayerObject {
        StoryAudioPlayerObject(
            id: id,
            postMediaId: "media-\(id)",
            placement: "overlay",
            x: 0.5, y: 0.8,
            volume: 1.0,
            waveformSamples: [],
            isBackground: isBackground,
            startTime: startTime,
            duration: duration
        )
    }

    @Test("background audios are filtered out")
    func backgroundExcluded() {
        let bg = audio(id: "bg", isBackground: true)
        let fg = audio(id: "fg", isBackground: false)
        let result = AudioForegroundReaderOverlay.visibleAudios(
            in: [bg, fg],
            elapsed: 0,
            slideDuration: 10
        )
        #expect(result.map(\.id) == ["fg"])
    }

    @Test("audio with no startTime/duration is visible across the full slide")
    func defaultsCoverSlide() {
        let a = audio(id: "a")
        for t in [0.0, 5.0, 10.0] {
            let r = AudioForegroundReaderOverlay.visibleAudios(in: [a], elapsed: t, slideDuration: 10)
            #expect(r.map(\.id) == ["a"], "elapsed=\(t)")
        }
    }

    @Test("audio is hidden before its startTime")
    func hiddenBeforeStart() {
        let a = audio(id: "a", startTime: 3.0, duration: 4.0)
        let r = AudioForegroundReaderOverlay.visibleAudios(in: [a], elapsed: 1.5, slideDuration: 10)
        #expect(r.isEmpty)
    }

    @Test("audio is hidden after its end (startTime + duration)")
    func hiddenAfterEnd() {
        let a = audio(id: "a", startTime: 3.0, duration: 4.0)
        let r = AudioForegroundReaderOverlay.visibleAudios(in: [a], elapsed: 8.0, slideDuration: 10)
        #expect(r.isEmpty)
    }

    @Test("audio is visible at exact start and end boundaries (inclusive)")
    func boundariesInclusive() {
        let a = audio(id: "a", startTime: 3.0, duration: 4.0)
        let rStart = AudioForegroundReaderOverlay.visibleAudios(in: [a], elapsed: 3.0, slideDuration: 10)
        let rEnd = AudioForegroundReaderOverlay.visibleAudios(in: [a], elapsed: 7.0, slideDuration: 10)
        #expect(rStart.map(\.id) == ["a"])
        #expect(rEnd.map(\.id) == ["a"])
    }

    @Test("audio with no duration uses slideDuration as end")
    func nilDurationFallsBackOnSlide() {
        let a = audio(id: "a", startTime: 2.0, duration: nil)
        let inside = AudioForegroundReaderOverlay.visibleAudios(in: [a], elapsed: 9.0, slideDuration: 10)
        let outside = AudioForegroundReaderOverlay.visibleAudios(in: [a], elapsed: 11.0, slideDuration: 10)
        #expect(inside.map(\.id) == ["a"])
        #expect(outside.isEmpty)
    }

    @Test("multiple foreground audios with overlapping windows all visible")
    func overlappingWindows() {
        let a = audio(id: "a", startTime: 0, duration: 5)
        let b = audio(id: "b", startTime: 3, duration: 5)
        let r = AudioForegroundReaderOverlay.visibleAudios(in: [a, b], elapsed: 4.0, slideDuration: 10)
        #expect(Set(r.map(\.id)) == ["a", "b"])
    }

    @Test("isBackground == nil is treated as foreground (legacy stories)")
    func nilBackgroundIsForeground() {
        let a = audio(id: "a", isBackground: nil)
        let r = AudioForegroundReaderOverlay.visibleAudios(in: [a], elapsed: 1.0, slideDuration: 10)
        #expect(r.map(\.id) == ["a"])
    }
}
