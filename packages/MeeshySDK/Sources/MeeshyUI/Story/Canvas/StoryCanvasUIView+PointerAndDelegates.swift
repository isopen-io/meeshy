import UIKit
import QuartzCore
import CoreMedia
import AVFoundation
import Metal
import PencilKit
import Combine
import os
import MeeshySDK

// MARK: - UIPointerInteractionDelegate (iPad / Mac Catalyst)

extension StoryCanvasUIView: UIPointerInteractionDelegate {
    public func pointerInteraction(_ interaction: UIPointerInteraction,
                                   regionFor request: UIPointerRegionRequest,
                                   defaultRegion: UIPointerRegion) -> UIPointerRegion? {
        guard mode == .edit, hitTestItem(at: request.location) != nil else { return nil }
        return defaultRegion
    }

    public func pointerInteraction(_ interaction: UIPointerInteraction,
                                   styleFor region: UIPointerRegion) -> UIPointerStyle? {
        guard mode == .edit, let view = interaction.view else { return nil }
        let preview = UITargetedPreview(view: view)
        return UIPointerStyle(effect: .lift(preview))
    }

    #if DEBUG
    /// Test seam mirroring `handleDoubleTap` cycle (auto → fit → fill → auto)
    /// for the background. Commits to the model + fires the callback.
    /// The double-tap is bg-specific (toggle fit mode override) and not part
    /// of the unified BG/FG gesture flow, so it keeps its dedicated test seam.
    internal func performDoubleTapForTesting(targetId: String) {
        guard targetId == backgroundMediaObjectId else { return }
        let current = slide.effects.backgroundTransform?.videoFitMode
        let next: String?
        switch current {
        case nil:    next = "fit"
        case "fit":  next = "fill"
        case "fill": next = nil
        default:     next = nil
        }
        var updated = slide
        var bg = updated.effects.backgroundTransform ?? StoryBackgroundTransform()
        bg.videoFitMode = next
        updated.effects.backgroundTransform = bg.isIdentity ? nil : bg
        slide = updated
        onBackgroundTransformChanged?(bg)
    }
    #endif
}

// MARK: - UIGestureRecognizerDelegate

extension StoryCanvasUIView: UIGestureRecognizerDelegate {
    /// Pinch + rotation are allowed simultaneously (natural two-finger transform).
    /// Pan is exclusive — running it alongside pinch/rotation would corrupt the
    /// snapshot-based deltas (drag uses translation, others use scale/rotation).
    /// Le `canvasZoomPinchRecognizer` (3 doigts) est exclusif vis-à-vis du
    /// `pinchRecognizer` (2 doigts) pour éviter qu'un pinch sur élément
    /// scale aussi le viewport.
    public func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                                   shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        let isPanA = gestureRecognizer === panRecognizer
        let isPanB = other === panRecognizer
        if isPanA || isPanB { return false }
        let isCanvasZoomA = gestureRecognizer === canvasZoomPinchRecognizer
        let isCanvasZoomB = other === canvasZoomPinchRecognizer
        if isCanvasZoomA || isCanvasZoomB { return false }
        return true
    }

    /// Single choke point for "a gesture is being attempted on this canvas" —
    /// `setupGesturesAll()` sets `self` as the delegate of every recognizer it
    /// attaches (pan, pinch, rotation, single/double tap, three-finger canvas
    /// zoom), so this fires for every one of them without touching any
    /// individual `handle*` method. Wakes the idle-throttled edit clock
    /// (issue #3906) — see `noteEditInteraction()`.
    ///
    /// `override`: `UIView` itself already implements
    /// `UIGestureRecognizerDelegate.gestureRecognizerShouldBegin(_:)`
    /// (`UIView.h`, its own default delegate behavior for its gesture
    /// recognizers) — this is not a fresh protocol witness. Calling
    /// `super` and returning its result (rather than hardcoding `true`)
    /// preserves whatever UIKit's own default decides, so gesture
    /// recognition behavior is unchanged.
    public override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        noteEditInteraction()
        return super.gestureRecognizerShouldBegin(gestureRecognizer)
    }

    /// **Le champ de saisie possède ses touches** (#5099).
    ///
    /// Sans ce refus, le `singleTapRecognizer` posé sur le canvas se reconnaît
    /// sur un tap tombé dans le `StoryInlineTextEditor` et — `cancelsTouchesInView`
    /// valant `true` par défaut — **annule** ce tap pour le `UITextView`. Le
    /// champ ne devenait donc jamais premier répondeur au doigt : toucher le
    /// texte, ou son placeholder quand il est vide, ne levait pas le clavier.
    ///
    /// La règle est PURE et vit à côté (`StoryCanvasInlineEditTouchPolicy`) : ce
    /// qu'elle décide se mesure sans monter une scène, et son doc-comment porte
    /// la raison de comparer par DESCENDANCE plutôt que par identité — `touch.view`
    /// n'est presque jamais le `UITextView` lui-même.
    ///
    /// Aucun geste n'est retiré : une touche posée AILLEURS que sur le champ
    /// arrive au canvas exactement comme avant, y compris celle qui désigne un
    /// autre objet pendant qu'on écrit.
    public func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                                  shouldReceive touch: UITouch) -> Bool {
        StoryCanvasInlineEditTouchPolicy.canvasReceives(touched: touch.view,
                                                        inlineEditor: inlineEditor)
    }
}
