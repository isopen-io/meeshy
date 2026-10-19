import Foundation
import QuartzCore
import CoreMedia
import UIKit
import MeeshySDK

// MARK: - applyOpening

extension StoryRenderer {

    /// Shared duration (seconds) of the slide opening AND closing transitions.
    public nonisolated static let slideTransitionDuration: Double = 1.2

    /// Peak scale of the `.zoom` transition (opening settles 1.08 → 1.0,
    /// closing ramps 1.0 → 1.08).
    public nonisolated static let zoomTransitionScale: CGFloat = 1.08

    /// Horizontal travel of the `.slide` transition, as a fraction of the
    /// canvas width (opening enters from +travel → 0, closing exits 0 → −travel).
    public nonisolated static let slideTransitionTravelFraction: CGFloat = 0.08

    /// Model-layer `sublayerTransform` of a `.zoom` / `.slide` opening at
    /// `progress` ∈ [0, 1] (clamped) — the ONE curve every surface samples:
    /// `applyOpening` animates between its two ends, and
    /// `StoryAVCompositor.applyStaticOpening` poses it frame by frame because
    /// `layer.render(in:)` runs no animation engine. `.zoom` settles from
    /// `zoomTransitionScale` to 1; `.slide` from `+canvasWidth ×
    /// slideTransitionTravelFraction` (leading edge) to 0. `.fade` / `.reveal`
    /// never touch the transform: identity. Pure arithmetic — `nonisolated`
    /// like `closingProgress`, so tests and the export need no actor hop.
    public nonisolated static func openingSublayerTransform(_ effect: StoryTransitionEffect,
                                                            progress: Double,
                                                            canvasWidth: CGFloat) -> CATransform3D {
        let remaining = CGFloat(1 - min(1, max(0, progress)))
        switch effect {
        case .zoom:
            let scale = 1 + (zoomTransitionScale - 1) * remaining
            return CATransform3DMakeScale(scale, scale, 1)
        case .slide:
            let travel = canvasWidth * slideTransitionTravelFraction
            return CATransform3DMakeTranslation(travel * remaining, 0, 0)
        case .fade, .reveal:
            return CATransform3DIdentity
        }
    }

    /// Applies a slide-opening animation to `rootLayer` at playback position `elapsed`.
    ///
    /// - `.reveal`: attaches a circular `CAShapeLayer` mask and animates its `path`
    ///   from a 1-pt circle to a circle that fully covers the layer bounds.
    /// - `.fade`: adds a `CABasicAnimation` on `opacity` keyed `"opening-fade"`.
    /// - `.zoom`: animates `sublayerTransform` from a 1.08 scale down to identity,
    ///   keyed `"opening-zoom"`.
    /// - `.slide`: animates `sublayerTransform` from a light horizontal offset
    ///   (+8% of the canvas width) back to identity, keyed `"opening-slide"`.
    /// - `nil`: no-op.
    ///
    /// `.zoom` / `.slide` animate `sublayerTransform` rather than `transform` so
    /// the model-layer `transform` stays identity: `layoutSubviews` re-assigns
    /// `rootLayer.frame` and setting `frame` on a transformed layer corrupts its
    /// geometry.
    ///
    /// Call only when transitioning into `.play` at `elapsed = 0`. The animations use
    /// `fillMode = .forwards` + `isRemovedOnCompletion = false` so the final state
    /// persists after the animation completes.
    @MainActor
    public static func applyOpening(_ effect: StoryTransitionEffect?,
                                    rootLayer: CALayer,
                                    elapsed: Double) {
        guard let effect, elapsed < slideTransitionDuration else { return }
        switch effect {
        case .reveal:
            let mask = CAShapeLayer()
            mask.frame = rootLayer.bounds
            let center = CGPoint(x: rootLayer.bounds.midX, y: rootLayer.bounds.midY)
            let maxRadius = hypot(rootLayer.bounds.width, rootLayer.bounds.height) / 2
            let startPath = UIBezierPath(arcCenter: center, radius: 1,
                                         startAngle: 0, endAngle: .pi * 2,
                                         clockwise: true).cgPath
            let endPath = UIBezierPath(arcCenter: center, radius: maxRadius,
                                       startAngle: 0, endAngle: .pi * 2,
                                       clockwise: true).cgPath
            mask.path = startPath
            rootLayer.mask = mask
            let anim = CABasicAnimation(keyPath: "path")
            anim.fromValue = startPath
            anim.toValue = endPath
            anim.duration = slideTransitionDuration
            anim.fillMode = .forwards
            anim.isRemovedOnCompletion = false
            mask.add(anim, forKey: openingRevealAnimationKey)

        case .fade:
            let anim = CABasicAnimation(keyPath: "opacity")
            anim.fromValue = 0
            anim.toValue = 1
            anim.duration = slideTransitionDuration
            anim.fillMode = .forwards
            anim.isRemovedOnCompletion = false
            rootLayer.add(anim, forKey: openingFadeAnimationKey)

        case .zoom:
            let anim = CABasicAnimation(keyPath: "sublayerTransform")
            anim.fromValue = NSValue(caTransform3D: openingSublayerTransform(
                .zoom, progress: 0, canvasWidth: rootLayer.bounds.width))
            anim.toValue = NSValue(caTransform3D: openingSublayerTransform(
                .zoom, progress: 1, canvasWidth: rootLayer.bounds.width))
            anim.duration = slideTransitionDuration
            anim.fillMode = .forwards
            anim.isRemovedOnCompletion = false
            rootLayer.add(anim, forKey: openingZoomAnimationKey)

        case .slide:
            let anim = CABasicAnimation(keyPath: "sublayerTransform")
            anim.fromValue = NSValue(caTransform3D: openingSublayerTransform(
                .slide, progress: 0, canvasWidth: rootLayer.bounds.width))
            anim.toValue = NSValue(caTransform3D: openingSublayerTransform(
                .slide, progress: 1, canvasWidth: rootLayer.bounds.width))
            anim.duration = slideTransitionDuration
            anim.fillMode = .forwards
            anim.isRemovedOnCompletion = false
            rootLayer.add(anim, forKey: openingSlideAnimationKey)
        }
    }
}

// MARK: - applyClosing

extension StoryRenderer {

    nonisolated static let closingRevealMaskName = "closing-reveal-mask"

    /// Keys of the `applyOpening` animations that write ROOT-LAYER properties
    /// `applyClosing` also writes, grouped by the property they animate.
    ///
    /// They matter because the opening animations are installed with
    /// `fillMode = .forwards` + `isRemovedOnCompletion = false`: once finished
    /// they STAY attached to the layer and keep holding their `toValue` over
    /// the model value — for the whole life of the canvas, `rootLayer` being a
    /// stored `let` that `rebuildLayers()` never replaces. A playhead-driven
    /// snapshot writing the model value is therefore invisible on screen until
    /// the fill is removed. `opening-reveal` is absent on purpose: it animates
    /// the MASK layer's `path`, and the closing reveal swaps the mask wholesale.
    nonisolated static let openingFadeAnimationKey = "opening-fade"
    nonisolated static let openingZoomAnimationKey = "opening-zoom"
    nonisolated static let openingSlideAnimationKey = "opening-slide"
    nonisolated static let openingRevealAnimationKey = "opening-reveal"

    nonisolated static let openingOpacityAnimationKeys = [openingFadeAnimationKey]
    nonisolated static let openingTransformAnimationKeys = [openingZoomAnimationKey,
                                                            openingSlideAnimationKey]

    /// Drops the opening fills that would override what `applyClosing` is about
    /// to write — and ONLY those. An opening `.fade` left in place while the
    /// slide exits by `.zoom` is harmless (different keyPath), so removing it
    /// would truncate a still-running entrance for nothing.
    @MainActor
    private static func clearOpeningFill(for effect: StoryTransitionEffect,
                                         on rootLayer: CALayer) {
        switch effect {
        case .fade:
            openingOpacityAnimationKeys.forEach(rootLayer.removeAnimation(forKey:))
        case .zoom, .slide:
            openingTransformAnimationKeys.forEach(rootLayer.removeAnimation(forKey:))
        case .reveal:
            break
        }
    }

    /// Linear exit progress in `[0, 1]` of the slide-closing transition at
    /// `elapsed`: `0` before `totalDuration − slideTransitionDuration`, ramping
    /// to `1` at `totalDuration`. Pure arithmetic — `nonisolated` so tests can
    /// call it without hopping to `@MainActor`.
    public nonisolated static func closingProgress(totalDuration: Double,
                                                   at elapsed: Double) -> Double {
        guard totalDuration.isFinite, totalDuration > 0 else { return 0 }
        let start = totalDuration - slideTransitionDuration
        guard elapsed > start else { return 0 }
        return min(1, (elapsed - start) / slideTransitionDuration)
    }

    /// Applies the slide-closing transition to `rootLayer` as a pure snapshot of
    /// the playhead — the symmetric counterpart of `applyOpening`, but driven by
    /// `render(at:)`-style ticks instead of an autonomous `CAAnimation`. The exit
    /// state is re-derived from `elapsed` on every call, so pauses, stalls and
    /// seeks stay frame-exact and Reduce-Motion-safe (no runtime-animated
    /// transition, opacity/transform are tied to the playhead).
    ///
    /// - `.fade`: root opacity ramps `1 → 0`.
    /// - `.zoom`: `sublayerTransform` scales `1.0 → 1.08` (inverse of the opening).
    /// - `.slide`: sublayers translate `0 → −8%` of the canvas width.
    /// - `.reveal`: a circular mask shrinks from covering the canvas to 1 pt.
    /// - `nil`: no-op.
    ///
    /// Before the closing window every call restores the neutral value for the
    /// configured effect, so a cached/reused root layer never keeps a stale exit
    /// frame after a seek back or a replay. `sublayerTransform` is used instead
    /// of `transform` for the same `layoutSubviews` frame-assignment reason as
    /// the opening.
    @MainActor
    public static func applyClosing(_ effect: StoryTransitionEffect?,
                                    rootLayer: CALayer,
                                    elapsed: Double,
                                    totalDuration: Double) {
        guard let effect else { return }
        let progress = closingProgress(totalDuration: totalDuration, at: elapsed)
        // Once the exit has actually started, the entrance's fill-forward
        // animation must go: it holds its `toValue` over the model layer, so
        // every value written below would be computed, stored — and never seen.
        // Strictly BEFORE the window (progress 0) the opening is left alone: on
        // a slide shorter than twice `slideTransitionDuration` the two windows
        // overlap, and the entrance keeps playing until the exit takes over.
        if progress > 0 {
            clearOpeningFill(for: effect, on: rootLayer)
        }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }
        switch effect {
        case .fade:
            rootLayer.opacity = Float(1 - progress)

        case .zoom:
            let scale = 1 + (zoomTransitionScale - 1) * CGFloat(progress)
            rootLayer.sublayerTransform = CATransform3DMakeScale(scale, scale, 1)

        case .slide:
            let travel = rootLayer.bounds.width * slideTransitionTravelFraction
            rootLayer.sublayerTransform = CATransform3DMakeTranslation(
                -travel * CGFloat(progress), 0, 0)

        case .reveal:
            applyClosingReveal(progress: progress, rootLayer: rootLayer)
        }
    }

    /// Restores the neutral root-layer state that `applyClosing` may have
    /// altered (opacity, sublayerTransform, closing mask). Called when a canvas
    /// (re)enters a mode so a replay — or the next slide reusing the same canvas
    /// with a different `closing` — never inherits the previous exit frame. Only
    /// the closing-owned mask is removed; an opening `.reveal` mask is preserved.
    @MainActor
    public static func resetClosing(rootLayer: CALayer) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }
        // Neutral means neutral ON SCREEN: assigning the model value is not
        // enough while an opening fill still overrides it. `setMode` calls this
        // BEFORE `applyOpening`, so a slide entering `.play` re-installs its own
        // entrance right after — and a canvas going back to `.edit`, or reused
        // for the next slide, stops inheriting the previous slide's.
        (openingOpacityAnimationKeys + openingTransformAnimationKeys)
            .forEach(rootLayer.removeAnimation(forKey:))
        rootLayer.opacity = 1
        rootLayer.sublayerTransform = CATransform3DIdentity
        if rootLayer.mask?.name == closingRevealMaskName {
            rootLayer.mask = nil
        }
    }

    @MainActor
    private static func applyClosingReveal(progress: Double, rootLayer: CALayer) {
        guard progress > 0 else {
            if rootLayer.mask?.name == closingRevealMaskName {
                rootLayer.mask = nil
            }
            return
        }
        let mask: CAShapeLayer
        if let existing = rootLayer.mask as? CAShapeLayer,
           existing.name == closingRevealMaskName {
            mask = existing
        } else {
            mask = CAShapeLayer()
            mask.name = closingRevealMaskName
        }
        mask.frame = rootLayer.bounds
        let center = CGPoint(x: rootLayer.bounds.midX, y: rootLayer.bounds.midY)
        let maxRadius = hypot(rootLayer.bounds.width, rootLayer.bounds.height) / 2
        let radius = max(1, maxRadius * (1 - CGFloat(progress)))
        mask.path = UIBezierPath(arcCenter: center, radius: radius,
                                 startAngle: 0, endAngle: .pi * 2,
                                 clockwise: true).cgPath
        if rootLayer.mask !== mask {
            rootLayer.mask = mask
        }
    }
}

// MARK: - clipTransitionOpacity

extension StoryRenderer {

    /// Returns the effective opacity `[0, 1]` for `media` at playback time `at`,
    /// given a list of `StoryClipTransition` entries and the global time at which
    /// the transition window starts (`transitionStart`).
    ///
    /// Only `kind == .crossfade` is handled; other kinds are treated as opaque.
    /// Outside the transition window the function returns `1.0`.
    ///
    /// `nonisolated` — pure arithmetic, no UIKit.
    public nonisolated static func clipTransitionOpacity(for media: StoryMediaObject,
                                                         transitions: [StoryClipTransition],
                                                         transitionStart: Double,
                                                         at time: Double) -> Double {
        for tr in transitions where tr.kind == .crossfade {
            let duration = Double(tr.duration)
            let inWindow = time >= transitionStart && time <= (transitionStart + duration)
            guard inWindow else { continue }
            let progress = (time - transitionStart) / duration
            if media.id == tr.fromClipId { return 1.0 - progress }
            if media.id == tr.toClipId   { return progress }
        }
        return 1.0
    }
}
