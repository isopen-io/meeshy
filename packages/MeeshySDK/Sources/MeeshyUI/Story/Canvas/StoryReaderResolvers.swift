import Foundation
import CoreGraphics
import MeeshySDK

/// Pure resolver applying timeline transitions to media object opacity at a given playback time.
///
/// The transition math itself (crossfade fade-in / fade-out curve) is delegated to
/// `StoryRenderer.clipTransitionOpacity(for:transitions:transitionStart:at:)` so that the
/// SwiftUI reader and the offline compositor share a single source of truth.
///
/// The resolver layers two responsibilities on top of the canonical primitive:
///   1. Clipping to the media's own timing window: returns `0` when `currentTime` is
///      outside `[startTime, startTime + duration]`. The renderer assumes that window
///      clipping is performed by its caller; the resolver bakes it in for SwiftUI.
///   2. Combining outgoing and incoming crossfades that involve the same media id by
///      multiplying their individual opacity factors (useful for stacked transitions).
///
/// Moved from the deleted `StoryCanvasReaderView+Timeline.swift` during Phase A4 reader migration.
public enum ReaderTransitionResolver {

    /// Returns the rendered opacity for `media` at `currentTime`, accounting for any matching
    /// `clipTransitions`. `.crossfade` uses the canonical ramp; `.dissolve` is DEGRADED to the
    /// same crossfade opacity ramp for live playback — the reader has no per-pixel compositor,
    /// so without the fallback a serialized dissolve was invisible at read time. The MP4 export
    /// keeps the real effect (`VideoCompositor` routes dissolve through
    /// `DissolveVideoCompositor` / `CIDissolveTransition`).
    ///
    /// Outside the media's `[start, end]` window the resolver returns `0`. Inside the window
    /// each matching transition contributes a multiplicative factor computed by
    /// `StoryRenderer.clipTransitionOpacity` so that the reader and compositor agree.
    public nonisolated static func opacity(
        for media: StoryMediaObject,
        transitions: [StoryClipTransition],
        currentTime: Float
    ) -> Float {
        let start = Float(media.startTime ?? 0)
        let duration = Float(media.duration ?? 0)
        let end = start + duration
        guard currentTime >= start, currentTime <= end else { return 0 }

        let t = Double(currentTime)
        var opacity: Float = 1.0

        for transition in transitions.map(liveRenderableTransition) {
            let isOutgoing = transition.fromClipId == media.id
            let isIncoming = transition.toClipId == media.id
            guard isOutgoing || isIncoming else { continue }

            let transitionDuration = Double(transition.duration)
            let transitionStart: Double = isOutgoing
                ? Double(end) - transitionDuration
                : Double(start)

            let factor = StoryRenderer.clipTransitionOpacity(
                for: media,
                transitions: [transition],
                transitionStart: transitionStart,
                at: t
            )
            opacity *= Float(factor)
        }

        return max(0, min(1, opacity))
    }

    /// Maps a serialized transition to the one the LIVE reader can actually
    /// render: `.crossfade` passes through, `.dissolve` is normalised to an
    /// equivalent `.crossfade` (degraded opacity ramp — the canonical
    /// `StoryRenderer.clipTransitionOpacity` primitive stays crossfade-only so
    /// the exporter's per-pixel dissolve path keeps its own semantics).
    private nonisolated static func liveRenderableTransition(
        _ transition: StoryClipTransition
    ) -> StoryClipTransition {
        switch transition.kind {
        case .crossfade:
            return transition
        case .dissolve:
            return StoryClipTransition(id: transition.id,
                                       fromClipId: transition.fromClipId,
                                       toClipId: transition.toClipId,
                                       kind: .crossfade,
                                       duration: transition.duration,
                                       easing: transition.easing)
        }
    }
}

/// Pure resolver applying keyframe interpolation to a media object at a given playback time.
/// Moved from the deleted `StoryCanvasReaderView+Timeline.swift` during Phase A4 reader migration.
public enum ReaderKeyframeResolver {

    /// Returns the interpolated position (x, y) at `currentTime`, or `nil` if no keyframes.
    /// Note: keyframe.time is interpreted as offset relative to media.startTime per spec section 2.1.
    public nonisolated static func resolvedPosition(
        for media: StoryMediaObject,
        keyframes: [StoryKeyframe]?,
        currentTime: Float
    ) -> CGPoint? {
        guard let frames = keyframes, !frames.isEmpty else { return nil }
        let start = Float(media.startTime ?? 0)
        let local = currentTime - start

        let xs: [(time: Float, value: CGFloat, easing: StoryEasing)] = frames.compactMap { kf in
            kf.x.map { (time: kf.time, value: $0, easing: kf.easing ?? .linear) }
        }
        let ys: [(time: Float, value: CGFloat, easing: StoryEasing)] = frames.compactMap { kf in
            kf.y.map { (time: kf.time, value: $0, easing: kf.easing ?? .linear) }
        }

        let x = KeyframeInterpolator.interpolate(keyframes: xs, at: local)
        let y = KeyframeInterpolator.interpolate(keyframes: ys, at: local)
        if x == nil && y == nil { return nil }
        return CGPoint(x: x ?? CGFloat(media.x), y: y ?? CGFloat(media.y))
    }

    /// Returns the interpolated scale at `currentTime`, or `nil` if no keyframes.
    public nonisolated static func resolvedScale(
        keyframes: [StoryKeyframe]?,
        currentTime: Float
    ) -> CGFloat? {
        guard let frames = keyframes, !frames.isEmpty else { return nil }
        let scales: [(time: Float, value: CGFloat, easing: StoryEasing)] = frames.compactMap { kf in
            kf.scale.map { (time: kf.time, value: $0, easing: kf.easing ?? .linear) }
        }
        return KeyframeInterpolator.interpolate(keyframes: scales, at: currentTime)
    }

    /// Returns the interpolated opacity at `currentTime`, or `nil` if no keyframes.
    public nonisolated static func resolvedOpacity(
        keyframes: [StoryKeyframe]?,
        currentTime: Float
    ) -> CGFloat? {
        guard let frames = keyframes, !frames.isEmpty else { return nil }
        let opacities: [(time: Float, value: CGFloat, easing: StoryEasing)] = frames.compactMap { kf in
            kf.opacity.map { (time: kf.time, value: $0, easing: kf.easing ?? .linear) }
        }
        return KeyframeInterpolator.interpolate(keyframes: opacities, at: currentTime)
    }
}
