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
    /// Faisceau de test du double-tap de FOND — la bascule AJUSTER ⇄ REMPLIR.
    /// Le double-tap est spécifique au fond (il ne fait pas partie du flot de
    /// geste unifié BG/FG), d'où ce faisceau dédié.
    ///
    /// **Il APPELLE la bascule, il ne la recopie plus** (#6125). Il en portait
    /// une copie, et les deux avaient divergé : celle-ci ne notifiait pas
    /// `onItemModified`. Un témoin vert y prouvait donc quelque chose que le
    /// doigt ne faisait pas — le défaut le plus coûteux d'un faisceau, puisque
    /// sa seule raison d'être est de tenir lieu du geste.
    internal func performDoubleTapForTesting(targetId: String) {
        guard targetId == backgroundMediaObjectId else { return }
        toggleBackgroundFitMode()
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
        // **En LECTURE, un geste de manipulation ne doit pas seulement ne rien
        // faire : il ne doit pas RECONNAÎTRE** (directive porteur 2026-09-06 :
        // « impossible de swiper les scènes pour passer aux suivantes »).
        //
        // `handlePan` sortait déjà par `guard mode == .edit else { return }` —
        // et c'est exactement ce qui rendait le défaut invisible en lecture de
        // code : le geste ne PRODUISAIT rien, donc il avait l'air inoffensif.
        // Mais il avait déjà été RECONNU. Un `UIPanGestureRecognizer` qui
        // reconnaît prive le `UIScrollView` du pager parent de son propre pan,
        // et le carrousel de scènes cessait de tourner — dans la carte du fil
        // comme en plein écran.
        //
        // > **Ne rien faire n'est pas la même chose que laisser passer.** Un
        // > garde posé dans le HANDLER arrive trop tard : la décision qui
        // > compte est celle de RECONNAÎTRE, et elle se prend ici.
        //
        // Le défaut nous a doublement trompés : le glissement échouait aussi
        // sous `idb`, et nous en avons conclu — deux sessions, séparément — que
        // l'outil ne savait pas produire un geste paginé. C'est le produit qui
        // ne l'acceptait pas. **Un outil muet et un produit sourd rendent le
        // même silence** ; seul un vrai doigt sur un vrai écran les sépare, et
        // c'est le porteur qui a tranché.
        //
        // Les TAPS ne sont pas concernés : ils n'entrent pas en concurrence
        // avec un défilement, et ce sont eux qui ouvrent le plein écran.
        if mode != .edit, isManipulationRecognizer(gestureRecognizer) { return false }
        return super.gestureRecognizerShouldBegin(gestureRecognizer)
    }

    /// **Les gestes qui TRANSFORMENT un objet**, par opposition à ceux qui le
    /// désignent.
    ///
    /// Nommés par identité et non par classe : `singleTapRecognizer` et
    /// `doubleTapRecognizer` sont aussi des `UIGestureRecognizer`, et un test
    /// de type les rangerait du mauvais côté le jour où un tap servirait à
    /// déplacer quelque chose.
    func isManipulationRecognizer(_ recognizer: UIGestureRecognizer) -> Bool {
        recognizer === panRecognizer
            || recognizer === pinchRecognizer
            || recognizer === rotationRecognizer
            || recognizer === canvasZoomPinchRecognizer
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
