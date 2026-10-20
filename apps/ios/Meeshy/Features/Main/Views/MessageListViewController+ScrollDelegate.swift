import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import os

// MARK: - UICollectionViewDelegate

extension MessageListViewController: UICollectionViewDelegate {

    func collectionView(
        _ collectionView: UICollectionView,
        willDisplay cell: UICollectionViewCell,
        forItemAt indexPath: IndexPath
    ) {
        applyFocalPerspectiveOnCellDisplay()
        applyLongMessageExpansionPresentation(animated: false)
        guard rendersThread, let serverId = serverMessageId(at: indexPath) else { return }
        let now = Self.nowMs()
        lastSeenActivityMs = now
        seenAccumulator.appeared(serverId, at: now)
    }

    func collectionView(
        _ collectionView: UICollectionView,
        didEndDisplaying cell: UICollectionViewCell,
        forItemAt indexPath: IndexPath
    ) {
        applyLongMessageExpansionPresentation(animated: true, excluding: cell)
        guard rendersThread, let serverId = serverMessageId(at: indexPath) else { return }
        let now = Self.nowMs()
        lastSeenActivityMs = now
        seenAccumulator.disappeared(serverId, at: now)
        // #7579 — un texte à vue unique qui SORT de l'écran passe à « déjà ouvert ».
        conversationViewModel?.closeViewOnce(messageId: serverId)
    }

    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        let offset = scrollView.contentOffset.y

        setScrollingActive(scrollView.isDragging || scrollView.isDecelerating)
        keyboardFirst.noteScroll(offsetY: offset, isTracking: scrollView.isTracking)
        // Chrome caché tant que le doigt est posé, puis tant que la décélération est LOIN de son offset d'arrivée (`FocalChromeReturn`, directive 2026-08-21).
        setChromeHiddenForScroll(FocalChromeReturn.isHidden(
            isTracking: scrollView.isTracking,
            isDecelerating: scrollView.isDecelerating,
            remainingDistance: decelerationTargetOffsetY.map { $0 - scrollView.contentOffset.y }
        ) && keyboardFirst.chromeMayCollapse)

        // Verrou de scène : UN SEUL inventaire de cellules visibles par frame, partagé seulement sur la branche qui laisse l'offset en place (`enforceSceneLock` appelle `setContentOffset`, l'inventaire d'avant n'y décrit plus l'écran).
        let isUserDriven = scrollView.isDragging || scrollView.isTracking || scrollView.isDecelerating
        let keepsOffset = isUserDriven || isIntentionalProgrammaticScroll || isCurrentlyNearBottom
        let visibleIndexPaths: [IndexPath]? = keepsOffset ? collectionView.indexPathsForVisibleItems : nil
        if let visibleIndexPaths {
            captureSceneLockAnchor(visibleIndexPaths: visibleIndexPaths)
        } else {
            enforceSceneLock()
        }

        // Focal : une pose par cellule visible et par frame, SEULEMENT sur un geste utilisateur (`FocalScrollPerspective`).
        noteFocalScrollTick(scrollView)
        noteScrollTimePillActivity()
        updateStickyDayLabel(visibleIndexPaths: visibleIndexPaths)
        noteNearBottomTransition(offset: offset)
        loadOlderIfNeeded(scrollView)
    }

    /// Dans le layout inversé, `contentOffset.y` proche de 0 est le bas visuel (messages récents) ; le seuil laisse une zone de confort avant l'apparition du bouton « dernier message ».
    func noteNearBottomTransition(offset: CGFloat) {
        let nearBottom = offset < Self.nearBottomFollowThreshold
        guard nearBottom != isCurrentlyNearBottom else { return }
        isCurrentlyNearBottom = nearBottom
        onNearBottomChanged?(nearBottom)
        if nearBottom && pendingUnreadCount > 0 {
            pendingUnreadCount = 0
            onNewMessagesBadge?(0)
        }
        // Atteindre le bas est une déclaration : l'accusé part maintenant, pas au repos d'une seconde du réveil périodique.
        if nearBottom {
            flushSeenNow()
        }
    }

    /// ROULEAU (2026-08-18) : 4 hauteurs d'ÉCRAN d'avance — on ne frappe jamais le bord chargé, sinon rebond élastique puis insertion.
    func loadOlderIfNeeded(_ scrollView: UIScrollView) {
        let contentHeight = scrollView.contentSize.height
        let frameHeight = scrollView.frame.height
        guard contentHeight > frameHeight else { return }
        let distanceFromBottom = contentHeight - scrollView.contentOffset.y - frameHeight

        if distanceFromBottom < frameHeight * 4, !isLoadingOlder {
            guard !store.messages.isEmpty, let onLoadOlder else { return }
            isLoadingOlder = true
            Task { @MainActor [weak self] in
                defer { self?.isLoadingOlder = false }
                await onLoadOlder()
            }
        }
    }

    // `scrollViewDidScroll` stops firing the instant motion actually stops —
    // it cannot observe the "scrolling ended" edge itself. These two catch
    // it: `willDecelerate == false` means the drag ended with no momentum
    // (finger lift while already still), `scrollViewDidEndDecelerating` is
    // the end of the momentum phase otherwise.
    /// Offset d'arrivée de la décélération qui commence — la distance qu'il
    /// reste à parcourir décide du retour du chrome (`FocalChromeReturn`).
    func scrollViewWillEndDragging(_ scrollView: UIScrollView, withVelocity velocity: CGPoint, targetContentOffset: UnsafeMutablePointer<CGPoint>) {
        decelerationTargetOffsetY = targetContentOffset.pointee.y
    }

    func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
        // Sans momentum : repos immédiat, le chrome revient. Avec momentum :
        // c'est l'approche de l'offset d'arrivée qui le fait revenir
        // (directive user 2026-08-21), plus la levée du doigt. Le flush des
        // reconfigures, lui, attend toujours le vrai arrêt.
        if !decelerate {
            decelerationTargetOffsetY = nil
            setChromeHiddenForScroll(false)
            settleAtRest()
        }
    }

    func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) {
        // La session de défilement se referme : la prochaine « durée soutenue »
        // se mesurera depuis son propre début. L'armement DÉJÀ acquis, lui,
        // survit — le désarmer ferait clignoter la carte à chaque pause, or
        // c'est à l'arrêt qu'on lit le message élu.
        focalScrollStartedAt = nil
        decelerationTargetOffsetY = nil
        settleAtRest()
    }

    /// Fin d'une animation programmatique (`scrollToItem(animated:)` /
    /// `setContentOffset(animated:)`) — jamais un geste. Même épilogue que
    /// l'arrêt d'un geste : retour du chrome + flush des reconfigures
    /// différés (§4.7ter).
    func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) {
        isIntentionalProgrammaticScroll = false
        settleAtRest()
        // Visée vérifiée : l'animation vient d'atterrir — la loi compare
        // l'offset atteint à celui qui centre la cible (attributs frais,
        // les cellules autour d'elle sont désormais réalisées) et re-vise
        // si l'écart dépasse la tolérance. Après `settleAtRest()` : le flush
        // des reconfigures différés est passé, les hauteurs sont posées.
        verifyScrollSettleTarget()
    }

    /// Le doigt reprend la main : toute visée vérifiée en cours est annulée —
    /// la scène n'appartient qu'au doigt (loi du rouleau), on ne re-vise
    /// jamais par-dessus un geste.
    func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
        scrollSettleTarget = nil
        keyboardFirst.gestureBegan(offsetY: scrollView.contentOffset.y)
    }

    /// **Adopter ce que le fil MESURE** (#4041) — à la POSE uniquement.
    ///
    /// L'échantillon est l'état RÉEL du layout : la hauteur que chaque item
    /// visible porte à cet instant, mesurée pour les cellules qui se sont
    /// posées, égale à l'estimation courante pour les autres. N'échantillonner
    /// que les cellules qui INVALIDENT biaiserait vers celles dont
    /// l'estimation est déjà fausse : une fois la rangée de suite adoptée,
    /// elle disparaîtrait de l'échantillon et seules les têtes de groupe y
    /// resteraient — la loi oscillerait de l'une à l'autre, une invalidation
    /// complète par pose.
    ///
    /// Jamais pendant un geste : la loi ne décide qu'au repos, et le layout
    /// ancre le repositionnement qui suit.
    func adoptRowHeightEstimateIfWorthwhile() {
        guard isViewLoaded,
              !collectionView.isDragging,
              !collectionView.isDecelerating,
              let layout = collectionView.collectionViewLayout as? MessageListLayout
        else { return }
        let visibleHeights = collectionView.indexPathsForVisibleItems.compactMap {
            layout.layoutAttributesForItem(at: $0)?.frame.height
        }
        guard let adopted = MessageListHeightEstimationLaw.proposal(
            visibleHeights: visibleHeights,
            current: currentRowHeightEstimate
        ) else { return }
        if readingMode.usesFlatRow {
            learnedFlatRowHeight = adopted
        } else {
            learnedBubbleRowHeight = adopted
        }
        layout.invalidateForAdoptedEstimate()
    }

    /// Pose commune à l'arrêt (geste ou animation) — RETRAIT FOCAL iOS
    /// (2026-08-18) : plus d'élection, plus de nudge, plus de typographie de
    /// focus ; il ne reste que le chrome et les reconfigures différés.
    func settleAtRest() {
        // Le rattrapage d'invalidation noté pendant le mouvement se joue ICI,
        // à la pose — plus jamais par re-proposition à chaque tour de boucle
        // (Time Profiler 2026-08-21, voir `MessageListLayout`).
        (collectionView.collectionViewLayout as? MessageListLayout)?.flushPendingRecoveryInvalidation()
        // Le fil vient de montrer ce qu'il mesure vraiment (#4041) : c'est le
        // seul moment où l'on a le droit de changer l'estimation servie.
        adoptRowHeightEstimateIfWorthwhile()
        syncFocalFocusDetails()
        scheduleFocalFlatten()
        // Filet de la revue adversariale 2026-08-18 : une animation
        // programmatique interrompue AU DOIGT ne livre jamais
        // `scrollViewDidEndScrollingAnimation` — le geste qui l'a tuée se
        // termine ICI. Sans cette retombée, le drapeau fuyait à true et le
        // verrou de scène restait désarmé pour la session.
        isIntentionalProgrammaticScroll = false
        setScrollingActive(false)
        setChromeHiddenForScroll(false)
        captureSceneLockAnchor()
        flushDeferredReconfigureAtSettle()
    }

}
