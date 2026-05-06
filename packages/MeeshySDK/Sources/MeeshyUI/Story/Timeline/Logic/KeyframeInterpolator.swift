//
// KeyframeInterpolator.swift
// MeeshyUI / Story / Timeline / Logic
//
// Generic keyframe interpolation with `Lerpable` protocol.
// Supports Float, CGFloat, CGPoint, CGSize values with StoryEasing
// applied per origin keyframe.
//
// Spec: docs/superpowers/specs/2026-05-05-story-timeline-editor-design.md §4.3
//
// No UIKit / SwiftUI imports — pure value computations.
//

import Foundation
import CoreGraphics
import MeeshySDK

// MARK: - Lerpable

/// Capability for linear interpolation between two values of the same type.
///
/// `t` is in `[0, 1]` and is **not** clamped by the protocol — the caller is
/// expected to clamp/ease before calling. The `KeyframeInterpolator` performs
/// clamping itself before invoking `lerp`.
public protocol Lerpable: Sendable {
    nonisolated static func lerp(from: Self, to: Self, t: Float) -> Self
}

extension Float: Lerpable {
    public nonisolated static func lerp(from: Float, to: Float, t: Float) -> Float {
        return from + (to - from) * t
    }
}

extension CGFloat: Lerpable {
    public nonisolated static func lerp(from: CGFloat, to: CGFloat, t: Float) -> CGFloat {
        return from + (to - from) * CGFloat(t)
    }
}

extension CGPoint: Lerpable {
    public nonisolated static func lerp(from: CGPoint, to: CGPoint, t: Float) -> CGPoint {
        return CGPoint(
            x: CGFloat.lerp(from: from.x, to: to.x, t: t),
            y: CGFloat.lerp(from: from.y, to: to.y, t: t)
        )
    }
}

extension CGSize: Lerpable {
    public nonisolated static func lerp(from: CGSize, to: CGSize, t: Float) -> CGSize {
        return CGSize(
            width:  CGFloat.lerp(from: from.width,  to: to.width,  t: t),
            height: CGFloat.lerp(from: from.height, to: to.height, t: t)
        )
    }
}

// MARK: - KeyframeInterpolator

/// Pure-Swift keyframe interpolation. The input is a list of
/// `(time, value, easing)` tuples (sorted by time on entry — see Task 16
/// for unsorted-input safety).
///
/// - 0 keyframes -> returns `nil`. The caller falls back to the static value.
/// - 1 keyframe  -> returns its value (constant for all `t`).
/// - N keyframes -> finds the segment `[k_i, k_{i+1}]` such that
///   `k_i.time <= t <= k_{i+1}.time`, computes
///   `u = (t - k_i.time) / (k_{i+1}.time - k_i.time)`, applies
///   `k_i.easing.apply(u)`, and returns `T.lerp(from: k_i.value, to: k_{i+1}.value, t: easedU)`.
/// - `t < k_0.time` -> returns `k_0.value` (clamp).
/// - `t > k_n.time` -> returns `k_n.value` (clamp).
public enum KeyframeInterpolator {

    public nonisolated static func interpolate<T: Lerpable>(
        keyframes: [(time: Float, value: T, easing: StoryEasing)],
        at time: Float
    ) -> T? {
        guard !keyframes.isEmpty else { return nil }

        let sorted = keyframes.sorted { $0.time < $1.time }

        if sorted.count == 1 {
            return sorted[0].value
        }
        if let first = sorted.first, time <= first.time {
            return first.value
        }
        if let last = sorted.last, time >= last.time {
            return last.value
        }

        for i in 0..<(sorted.count - 1) {
            let lo = sorted[i]
            let hi = sorted[i + 1]
            if time >= lo.time && time <= hi.time {
                let span = hi.time - lo.time
                let u = span > 0 ? (time - lo.time) / span : 0
                let easedU = lo.easing.apply(u)
                return T.lerp(from: lo.value, to: hi.value, t: easedU)
            }
        }

        return sorted.last?.value
    }
}
