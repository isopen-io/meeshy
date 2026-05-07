import Foundation
import CoreGraphics
import MeeshySDK

/// Pure resolver applying timeline transitions to media object opacity at a given playback time.
/// Used by `StoryCanvasReaderView` to render `clipTransitions` in lecture seule (read-only).
public enum ReaderTransitionResolver {

    /// Returns the rendered opacity for `media` at `currentTime`, accounting for any matching
    /// `clipTransitions` (crossfade only — dissolve is handled by the engine compositor and is
    /// transparent to the SwiftUI reader).
    public nonisolated static func opacity(
        for media: StoryMediaObject,
        transitions: [StoryClipTransition],
        currentTime: Float
    ) -> Float {
        let start = media.startTime ?? 0
        let duration = media.duration ?? 0
        let end = start + duration
        guard currentTime >= start, currentTime <= end else { return 0 }

        var opacity: Float = 1.0
        for transition in transitions where transition.kind == .crossfade {
            if transition.fromClipId == media.id {
                let outgoingStart = end - transition.duration
                if currentTime > outgoingStart {
                    let progress = (currentTime - outgoingStart) / transition.duration
                    opacity *= max(0, 1 - progress)
                }
            }
            if transition.toClipId == media.id {
                let incomingEnd = start + transition.duration
                if currentTime < incomingEnd {
                    let progress = (currentTime - start) / transition.duration
                    opacity *= max(0, min(1, progress))
                }
            }
        }
        return max(0, min(1, opacity))
    }
}

/// Pure resolver applying keyframe interpolation to a media object at a given playback time.
/// Read-only — used by `StoryCanvasReaderView` to honor `keyframes` published in story V2.
public enum ReaderKeyframeResolver {

    /// Returns the interpolated position (x, y) at `currentTime`, or `nil` if no keyframes.
    /// Note: keyframe.time is interpreted as offset relative to media.startTime per spec section 2.1.
    public nonisolated static func resolvedPosition(
        for media: StoryMediaObject,
        keyframes: [StoryKeyframe]?,
        currentTime: Float
    ) -> CGPoint? {
        guard let frames = keyframes, !frames.isEmpty else { return nil }
        let start = media.startTime ?? 0
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
        return CGPoint(x: x ?? media.x, y: y ?? media.y)
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
