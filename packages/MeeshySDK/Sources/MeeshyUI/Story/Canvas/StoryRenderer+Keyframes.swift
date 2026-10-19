import Foundation
import QuartzCore
import CoreMedia
import UIKit
import MeeshySDK

// MARK: - applyKeyframes

extension StoryRenderer {

    /// Interpolated overrides produced by `applyKeyframes`.
    public struct KeyframeOverrides: Sendable {
        public nonisolated let position: CGPoint?
        public nonisolated let scale: Double?
        public nonisolated let opacity: Double?

        public nonisolated init(position: CGPoint?, scale: Double?, opacity: Double?) {
            self.position = position
            self.scale = scale
            self.opacity = opacity
        }
    }

    /// Returns interpolated overrides at `currentTime` (global seconds) for an
    /// item whose animation clock starts at `startTime`.
    ///
    /// Pure computation — no UIKit access. `nonisolated` so tests can call it
    /// without hopping to `@MainActor`. Delegates per-channel arithmetic to
    /// `KeyframeInterpolator`. Returns `nil` overrides when `keyframes` is empty.
    ///
    /// **Base-position semantics** : when `currentTime` is BEFORE the first
    /// keyframe of a channel, we return `nil` for that channel so the
    /// renderer keeps the layer's authored base position / scale / opacity.
    /// Without this, a single keyframe at relative t=2s would lock the
    /// element to the keyframed value from t=0..2 instead of leaving it at
    /// its base, producing the visual "the text starts somewhere unexpected
    /// then jumps into place" complaint. The behaviour after the first
    /// keyframe is unchanged: interpolation between consecutive keyframes,
    /// then clamp on the last keyframe's value past the end of the track.
    public nonisolated static func applyKeyframes(keyframes: [StoryKeyframe],
                                                  at currentTime: Double,
                                                  startTime: Double = 0) -> KeyframeOverrides {
        guard !keyframes.isEmpty else {
            return KeyframeOverrides(position: nil, scale: nil, opacity: nil)  // nonisolated init
        }
        let local = Float(max(0, currentTime - startTime))

        // Per-channel "before first keyframe" gate. Each animated channel
        // (x, y, scale, opacity) is keyed independently — a text object can
        // animate scale starting at t=1 and opacity starting at t=0 — so we
        // need a per-channel first-keyframe lookup, not a global one.
        let firstX = keyframes.compactMap { kf in kf.x.map { _ in kf.time } }.min()
        let firstY = keyframes.compactMap { kf in kf.y.map { _ in kf.time } }.min()
        let firstScale = keyframes.compactMap { kf in kf.scale.map { _ in kf.time } }.min()
        let firstOpacity = keyframes.compactMap { kf in kf.opacity.map { _ in kf.time } }.min()

        let xTuples: [(time: Float, value: CGFloat, easing: StoryEasing)] = keyframes.compactMap { kf in
            kf.x.map { (kf.time, $0, kf.easing ?? .linear) }
        }
        let yTuples: [(time: Float, value: CGFloat, easing: StoryEasing)] = keyframes.compactMap { kf in
            kf.y.map { (kf.time, $0, kf.easing ?? .linear) }
        }
        let scaleTuples: [(time: Float, value: CGFloat, easing: StoryEasing)] = keyframes.compactMap { kf in
            kf.scale.map { (kf.time, $0, kf.easing ?? .linear) }
        }
        let opacityTuples: [(time: Float, value: CGFloat, easing: StoryEasing)] = keyframes.compactMap { kf in
            kf.opacity.map { (kf.time, $0, kf.easing ?? .linear) }
        }

        // Gate each channel : skip interpolation when the playhead is BEFORE
        // its earliest authored keyframe. The renderer then leaves the layer
        // at its base value for that channel (see doc comment above).
        let xVal: CGFloat? = (firstX.map { local >= $0 } ?? false)
            ? KeyframeInterpolator.interpolate(keyframes: xTuples, at: local) : nil
        let yVal: CGFloat? = (firstY.map { local >= $0 } ?? false)
            ? KeyframeInterpolator.interpolate(keyframes: yTuples, at: local) : nil
        let sVal: CGFloat? = (firstScale.map { local >= $0 } ?? false)
            ? KeyframeInterpolator.interpolate(keyframes: scaleTuples, at: local) : nil
        let oVal: CGFloat? = (firstOpacity.map { local >= $0 } ?? false)
            ? KeyframeInterpolator.interpolate(keyframes: opacityTuples, at: local) : nil

        let pos: CGPoint? = (xVal != nil && yVal != nil) ? CGPoint(x: xVal!, y: yVal!) : nil
        return KeyframeOverrides(
            position: pos,
            scale: sVal.map { Double($0) },
            opacity: oVal.map { Double($0) }
        )
    }
}

// MARK: - fadeOpacity

extension StoryRenderer {

    /// Opacité absolue à re-poser sur la layer d'un item NON-média à chaque
    /// tick de `.play`, ou `nil` si l'item n'a ni enveloppe fade ni keyframe
    /// d'opacité (la layer garde alors son opacité par défaut).
    ///
    /// Pourquoi une post-passe plutôt qu'un calcul au build : `ItemSignature`
    /// (clé du `StoryRendererCache`) ne retient que l'opacité des KEYFRAMES
    /// (`overrides.opacity ?? 1.0`), jamais l'enveloppe fadeIn/fadeOut. Une
    /// layer construite au premier tick où sa fenêtre s'ouvre est ensuite
    /// resservie telle quelle par le cache : sans re-pose, elle conserverait
    /// à jamais l'opacité de son tick de construction.
    ///
    /// Bug corrigé (2026-07-25) : un texte à `startTime = 20.006` avec
    /// `fadeIn = 0.5`, construit à t ≈ 20.01, restait figé à
    /// (20.01 − 20.006) / 0.5 ≈ 2 % d'opacité — invisible pour toute la story.
    /// Les médias avaient déjà leur post-passe (R14/C1) ; textes et stickers
    /// non.
    ///
    /// Ordre : une opacité de keyframe est authored explicitement, elle prime
    /// sur l'enveloppe fade qui n'est qu'un défaut — identique à `renderItem`.
    public static func resolvedNonMediaOpacity(item: any RenderableItem,
                                               at seconds: Double) -> Double? {
        let keyframeOpacity = applyKeyframes(
            keyframes: (item as? StoryTextObject)?.keyframes ?? [],
            at: seconds,
            startTime: item.startTime ?? 0
        ).opacity
        return keyframeOpacity ?? fadeOpacity(item: item, at: seconds)
    }

    /// Returns the snapshot opacity in `[0, 1]` produced by the item's `fadeIn` /
    /// `fadeOut` envelope at the given absolute playback time.
    ///
    /// Pure computation — no UIKit access. `nonisolated` so tests can call it
    /// without hopping to `@MainActor`. Mirrors the AVFoundation opacity ramps
    /// applied to video clips in `VideoCompositor.layerInstructionConfig`,
    /// guaranteeing that what the timeline preview displays matches what the
    /// final export produces (WYSIWYG at the playhead).
    ///
    /// Semantics:
    /// - During `[start, start + fadeIn]`: ramps `0 → 1` linearly.
    /// - During `[end - fadeOut, end]`: ramps `1 → 0` linearly (where
    ///   `end = start + duration`).
    /// - Otherwise inside the visibility window: `1.0`.
    /// - Outside the visibility window: returns `nil` (callers should rely on
    ///   `shouldRender` to drop the layer entirely; we do not produce a `0`
    ///   opacity here to keep the snapshot semantics narrow).
    ///
    /// Returns `nil` when no fade envelope is configured (fadeIn == nil &&
    /// fadeOut == nil) so the caller can preserve `CALayer`'s default `1.0`
    /// without touching the property.
    @MainActor public static func fadeOpacity(item: any RenderableItem,
                                              at currentTime: Double) -> Double? {
        let fadeIn = item.fadeIn ?? 0
        let fadeOut = item.fadeOut ?? 0
        guard fadeIn > 0 || fadeOut > 0 else { return nil }

        let start = item.startTime ?? 0
        let duration = item.duration
        let end: Double = duration.map { start + $0 } ?? .infinity

        guard currentTime >= start, currentTime < end else { return nil }

        if fadeIn > 0, currentTime < start + fadeIn {
            let progress = (currentTime - start) / fadeIn
            return max(0, min(1, progress))
        }

        if fadeOut > 0, end.isFinite, currentTime > end - fadeOut {
            let progress = (end - currentTime) / fadeOut
            return max(0, min(1, progress))
        }

        return 1.0
    }
}
