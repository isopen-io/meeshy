import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Equivalence tests proving that `ReaderTransitionResolver.opacity` (used by the
/// SwiftUI reader) and `StoryRenderer.clipTransitionOpacity` (used by the offline
/// compositor) produce consistent results so the viewer and exporter cannot diverge.
///
/// The resolver layers media-window clipping on top of the canonical primitive, so
/// equivalence is asserted inside the media window. Outside the media window the
/// resolver returns 0 by contract — that case is exercised separately.
final class ReaderRendererConsistencyTests: XCTestCase {

    // MARK: Fixtures

    private func makeMedia(id: String, start: Double, duration: Double) -> StoryMediaObject {
        StoryMediaObject(
            id: id, postMediaId: "pm-\(id)",
            mediaType: "video", placement: "media",
            aspectRatio: 1.0,
            startTime: start, duration: duration
        )
    }

    private func canonicalOutgoing(media: StoryMediaObject,
                                   transition: StoryClipTransition,
                                   mediaEnd: Double,
                                   at currentTime: Double) -> Double {
        let transitionStart = mediaEnd - Double(transition.duration)
        return StoryRenderer.clipTransitionOpacity(
            for: media,
            transitions: [transition],
            transitionStart: transitionStart,
            at: currentTime
        )
    }

    private func canonicalIncoming(media: StoryMediaObject,
                                   transition: StoryClipTransition,
                                   mediaStart: Double,
                                   at currentTime: Double) -> Double {
        StoryRenderer.clipTransitionOpacity(
            for: media,
            transitions: [transition],
            transitionStart: mediaStart,
            at: currentTime
        )
    }

    // MARK: 1. Out-of-window divergence is documented (resolver clips; renderer assumes clipping done by caller)

    func test_opacity_outOfWindow_consistentWithRenderer() {
        // Outside the media window the resolver MUST clip to 0 (its contract for the
        // SwiftUI reader). The canonical renderer is unconditioned on the media window
        // and returns 1.0 when no transition is matched. Once a caller composes the
        // renderer with a media-window mask (as the compositor does) the two agree.
        let media = makeMedia(id: "a", start: 0, duration: 5)
        let trans = StoryClipTransition(fromClipId: "a", toClipId: "b", kind: .crossfade, duration: 1.0)

        for t in [-1.0, 5.5, 10.0] as [Double] {
            let resolverValue = ReaderTransitionResolver.opacity(
                for: media, transitions: [trans], currentTime: Float(t))
            // Resolver clips to 0 outside [start, end].
            XCTAssertEqual(resolverValue, 0.0, accuracy: 0.0001,
                           "Resolver MUST return 0 outside media window at t=\(t)")

            // Composing the renderer with a window mask yields the same result.
            let inWindow = t >= 0 && t <= 5
            let windowMask: Double = inWindow ? 1.0 : 0.0
            let composed = windowMask * canonicalOutgoing(
                media: media, transition: trans, mediaEnd: 5.0, at: t)
            XCTAssertEqual(Double(resolverValue), composed, accuracy: 0.0001,
                           "Composed renderer (window×canonical) must match resolver at t=\(t)")
        }
    }

    // MARK: 2. In-window equivalence (no transition)

    func test_opacity_inWindow_consistentWithRenderer() {
        // With no transitions both implementations return 1.0 inside the window.
        let media = makeMedia(id: "a", start: 0, duration: 5)

        for t in stride(from: 0.5, through: 4.5, by: 0.5) {
            let resolver = ReaderTransitionResolver.opacity(
                for: media, transitions: [], currentTime: Float(t))
            // Renderer with no transitions returns 1.0 by construction.
            let renderer = StoryRenderer.clipTransitionOpacity(
                for: media, transitions: [], transitionStart: 0, at: t)
            XCTAssertEqual(Double(resolver), renderer, accuracy: 0.0001,
                           "In-window no-transition must match at t=\(t)")
            XCTAssertEqual(Double(resolver), 1.0, accuracy: 0.0001)
        }
    }

    // MARK: 3. Boundary instants

    func test_opacity_atBoundaries_consistentWithRenderer() {
        let media = makeMedia(id: "a", start: 0, duration: 5)
        let trans = StoryClipTransition(fromClipId: "a", toClipId: "b", kind: .crossfade, duration: 1.0)

        // At t == start (= 0): media is at the start, outgoing transition hasn't begun
        // (transitionStart = end - duration = 4). Renderer returns 1.0; resolver should
        // also return 1.0 because t is in window and not yet inside the crossfade.
        let atStart = ReaderTransitionResolver.opacity(
            for: media, transitions: [trans], currentTime: 0.0)
        let canonicalAtStart = canonicalOutgoing(
            media: media, transition: trans, mediaEnd: 5.0, at: 0.0)
        XCTAssertEqual(Double(atStart), canonicalAtStart, accuracy: 0.0001,
                       "At t=start resolver and canonical must agree")
        XCTAssertEqual(atStart, 1.0, accuracy: 0.0001)

        // At t == end (= 5): we are at the very end of both the media window and the
        // outgoing crossfade. Canonical: progress = 1.0 → 1 - 1 = 0. Resolver: same.
        let atEnd = ReaderTransitionResolver.opacity(
            for: media, transitions: [trans], currentTime: 5.0)
        let canonicalAtEnd = canonicalOutgoing(
            media: media, transition: trans, mediaEnd: 5.0, at: 5.0)
        XCTAssertEqual(Double(atEnd), canonicalAtEnd, accuracy: 0.0001,
                       "At t=end resolver and canonical must agree")
        XCTAssertEqual(atEnd, 0.0, accuracy: 0.0001)
    }

    // MARK: 4. Fade-in equivalence (incoming crossfade)

    func test_opacity_withFadeIn_matches() {
        // Media "b" enters via a crossfade starting at its mediaStart for 1s.
        let media = makeMedia(id: "b", start: 5, duration: 5)
        let trans = StoryClipTransition(fromClipId: "a", toClipId: "b", kind: .crossfade, duration: 1.0)

        // Sample across the fade-in window and into the steady-state region.
        let samples: [Double] = [5.0, 5.1, 5.25, 5.5, 5.75, 5.9, 6.0, 7.0, 8.0, 9.5]
        for t in samples {
            let resolver = ReaderTransitionResolver.opacity(
                for: media, transitions: [trans], currentTime: Float(t))
            // Canonical fade-in factor: transitionStart = mediaStart (= 5).
            let factor = canonicalIncoming(
                media: media, transition: trans, mediaStart: 5.0, at: t)
            // Resolver also applies window clipping; here t is always in window.
            XCTAssertGreaterThanOrEqual(t, 5.0)
            XCTAssertLessThanOrEqual(t, 10.0)
            XCTAssertEqual(Double(resolver), factor, accuracy: 0.0001,
                           "Fade-in factor must match canonical at t=\(t)")
        }
    }

    // MARK: 5. Fade-out equivalence (outgoing crossfade)

    func test_opacity_withFadeOut_matches() {
        // Media "a" leaves via a crossfade in the last 1s of its window.
        let media = makeMedia(id: "a", start: 0, duration: 5)
        let trans = StoryClipTransition(fromClipId: "a", toClipId: "b", kind: .crossfade, duration: 1.0)

        // Sample across the fade-out window and the steady-state region preceding it.
        let samples: [Double] = [0.0, 1.0, 2.0, 3.0, 3.9, 4.0, 4.1, 4.25, 4.5, 4.75, 4.9, 5.0]
        for t in samples {
            let resolver = ReaderTransitionResolver.opacity(
                for: media, transitions: [trans], currentTime: Float(t))
            let factor = canonicalOutgoing(
                media: media, transition: trans, mediaEnd: 5.0, at: t)
            XCTAssertEqual(Double(resolver), factor, accuracy: 0.0001,
                           "Fade-out factor must match canonical at t=\(t)")
        }
    }

    // MARK: 6. Dissolve — resolver degrades to a crossfade ramp, canonical primitive stays pass-through

    func test_opacity_dissolveTransition_resolverDegradesToCrossfadeRamp() {
        // C4 — the LIVE resolver renders dissolve as an equivalent crossfade
        // opacity ramp (the reader has no per-pixel compositor). The canonical
        // `clipTransitionOpacity` primitive stays crossfade-only so the MP4
        // export path (`DissolveVideoCompositor` / CIDissolveTransition) keeps
        // the real per-pixel dissolve.
        let media = makeMedia(id: "a", start: 0, duration: 5)
        let dissolve = StoryClipTransition(fromClipId: "a", toClipId: "b", kind: .dissolve, duration: 1.0)
        let crossfade = StoryClipTransition(fromClipId: "a", toClipId: "b", kind: .crossfade, duration: 1.0)

        for t in stride(from: 0.0, through: 5.0, by: 0.5) {
            let resolver = ReaderTransitionResolver.opacity(
                for: media, transitions: [dissolve], currentTime: Float(t))
            let crossfadeEquivalent = canonicalOutgoing(
                media: media, transition: crossfade, mediaEnd: 5.0, at: t)
            XCTAssertEqual(Double(resolver), crossfadeEquivalent, accuracy: 0.0001,
                           "Live dissolve must ramp exactly like a crossfade at t=\(t)")

            let primitive = StoryRenderer.clipTransitionOpacity(
                for: media, transitions: [dissolve], transitionStart: 4.0, at: t)
            XCTAssertEqual(primitive, 1.0, accuracy: 0.0001,
                           "The canonical primitive must stay crossfade-only at t=\(t)")
        }
    }
}
