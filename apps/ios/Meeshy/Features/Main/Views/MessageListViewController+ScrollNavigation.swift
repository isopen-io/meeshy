import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import os

// Défilements voulus : vers le bas, vers un message, recherche lente, éclair de cellule (#10758).
extension MessageListViewController {

    // MARK: - Scroll to Bottom

    func scrollToBottom(animated: Bool = true) {
        // Avant le premier instantané (fil en attente), la liste n'a AUCUNE section : interroger la
        // section 0 y est une incohérence que UIKit refuse. Les deux gardes, dans cet ordre.
        guard collectionView.numberOfSections > 0, collectionView.numberOfItems(inSection: 0) > 0 else { return }
        // Scroll VOULU, posé APRÈS le guard : le verrou de scène le laisse passer.
        // Animé, il retombe à `scrollViewDidEndScrollingAnimation` ou `settleAtRest` ;
        // non animé, au tour suivant, par une tâche qu'un saut suivant annule.
        beginIntentionalProgrammaticScroll()
        // Un « aller au dernier message » remplace toute visée vérifiée en
        // cours — sans quoi la fin de SON animation re-viserait l'ancienne
        // cible et renverrait l'utilisateur en arrière.
        scrollSettleTarget = nil
        if !animated {
            programmaticScrollRelease = Task { [weak self] in
                guard !Task.isCancelled, let self else { return }
                programmaticScrollRelease = nil
                isIntentionalProgrammaticScroll = false
                captureSceneLockAnchor()
            }
        }
        collectionView.scrollToItem(at: IndexPath(item: 0, section: 0), at: .top, animated: animated)
        // RC2.4 — un scroll programmatique ne déclenche pas fiablement `scrollViewDidScroll` :
        // near-bottom et badge non-lu se resynchronisent ici, sinon le prochain apply les re-bumpe.
        if !isCurrentlyNearBottom {
            isCurrentlyNearBottom = true
            onNearBottomChanged?(true)
            // Même règle qu'un défilement au doigt : arriver au bas signale ce
            // qui s'y trouve. Le remontage auto d'un message entrant n'entre
            // pas ici — il ne se produit QUE déjà au bas.
            flushSeenNow()
        }
        if pendingUnreadCount > 0 {
            pendingUnreadCount = 0
            onNewMessagesBadge?(0)
        }
    }

    // MARK: - Scroll to specific message (reply chip tap)

    /// Locates `localId` in the current snapshot and scrolls it into view,
    /// then briefly flashes the cell so the user can find it. Called by the
    /// reply-chip tap inside `ThemedMessageBubble`. Forwards to the SwiftUI
    /// `onScrollToMessage` closure so the parent ConversationViewModel can
    /// also load older messages if the target lives outside the current
    /// window.
    /// Resolves a message id — either a local UUID or a gateway-issued
    /// server id — to the local UUID used by the diffable datasource. The
    /// snapshot items are keyed on `localId`; reply chips pass the server
    /// id; this method bridges the two without forcing every call site
    /// to remember which kind it has.
    func resolveLocalId(_ id: String) -> String {
        // Most call sites pass a localId already (e.g. the typing → message
        // glue, the scroll-to-bottom action). Look it up via the
        // server-side map only when we don't already match an item key —
        // saves a dict probe on the hot scroll-to-bottom path.
        serverIdToLocalId[id] ?? id
    }

    func scrollToMessage(localId: String) {
        beginIntentionalProgrammaticScroll()
        // Forward to parent first — if the message lives outside the current
        // window, the parent ViewModel will trigger a `loadWindow(around:)`
        // which repopulates the store. The store observer reapplies the
        // snapshot, then this method runs again with the message visible.
        Logger.messages.debug("scrollToMessage requested target=\(localId, privacy: .public)")
        onScrollToMessage?(localId)

        // Reply chips pass the citation's SERVER id; the snapshot uses
        // LOCAL ids. Translate before the lookup so any message in the
        // current window is reachable, regardless of which id flavour the
        // caller has.
        let resolvedId = resolveLocalId(localId)

        // Items are inserted reversed (newest first) for the inverted
        // collection view. Locate by linear scan over the snapshot — there
        // are at most `MessageStore.initialWindowSize` items initially (growing dynamically) so the cost is
        // negligible compared to the layout pass that follows.
        let snapshot = dataSource.snapshot()
        guard let index = snapshot.itemIdentifiers.firstIndex(where: {
            if case .message(let id) = $0 { return id == resolvedId }
            return false
        }) else {
            // Not in the current snapshot — `onScrollToMessage` was just
            // asked to load it. When the store observer reapplies the
            // snapshot, the second pass through `scrollToMessage` (driven
            // by `scrollState.scrollToMessageId`) will find it. If it
            // doesn't, the log below will show the gap during diagnostic.
            Logger.messages.debug("scrollToMessage target=\(localId, privacy: .public) NOT in snapshot — relying on parent jump path")
            return
        }

        // Visée VÉRIFIÉE (ScrollToMessageSettleLaw) : l'ancien
        // `scrollToItem` + flash différé visait un offset calculé sur des
        // hauteurs estimées et atterrissait à côté dès que des cellules se
        // réalisaient pendant l'animation — le flash partait alors sur une
        // cellule hors écran, et l'utilisateur voyait le fil « sauter au
        // mauvais endroit ». Le flash part désormais à la pose vérifiée.
        beginVerifiedScroll(toLocalId: resolvedId, at: IndexPath(item: index, section: 0), strong: false)
    }

    /// Scrolls fast (no slow-scroll preamble) to a message that was just loaded
    /// from the server after a quoted-message search. Stops any ongoing slow
    /// scroll, then jumps directly to the target with a highlight flash.
    func scrollToMessageFast(localId: String) {
        beginIntentionalProgrammaticScroll()
        stopSlowScroll()

        // Same id-flavour bridge as `scrollToMessage` — see
        // `resolveLocalId(_:)` for the rationale.
        let resolvedId = resolveLocalId(localId)

        let snapshot = dataSource.snapshot()
        guard let index = snapshot.itemIdentifiers.firstIndex(where: {
            if case .message(let id) = $0 { return id == resolvedId }
            return false
        }) else { return }

        // Même visée vérifiée que `scrollToMessage` — ce chemin arrive après
        // un `loadWindow(around:)` : la fenêtre vient d'être ENTIÈREMENT
        // remplacée, donc AUCUNE cellule autour de la cible n'est réalisée et
        // l'écart estimé/réel y est maximal. C'était le saut « au mauvais
        // emplacement » le plus visible (recherche, citation hors fenêtre).
        beginVerifiedScroll(toLocalId: resolvedId, at: IndexPath(item: index, section: 0), strong: true)
    }

    // MARK: - Cell Frame Lookup

    // `focalOverlayPreview(messageId:)` a vécu ici jusqu'au 2026-08-23 :
    // il capturait les PIXELS de la cellule Focal pour que l'aperçu élevé de
    // l'appui long soit le rendu RÉEL, sans second chemin. L'intention tenait ;
    // le cadrage non. La cellule Focal fait tenir son identité et sa barre de
    // méta À CHEVAL sur son cadre — bornée aux `bounds` de la cellule, la
    // capture les tranchait en deux. Retiré : l'overlay rend le message NORMAL
    // dans tous les modes de lecture (directive produit 2026-08-23).

    /// On-screen frame (window coordinates) of the realized cell hosting
    /// `messageId`, or `nil` when that cell is not currently visible.
    /// `convert(_:to: nil)` resolves the collection view's inverted-axis
    /// transform, so the returned rect is the upright frame the user sees.
    /// Used to anchor the floating quick-reaction bar to the tapped bubble.
    func cellFrameInWindow(messageId: String) -> CGRect? {
        // Quick-reaction bar anchors on a tap by id — same server/local
        // id-flavour bridge as the scroll routines.
        let resolvedId = resolveLocalId(messageId)
        let snapshot = dataSource.snapshot()
        guard let index = snapshot.itemIdentifiers.firstIndex(where: {
            if case .message(let id) = $0 { return id == resolvedId }
            return false
        }) else { return nil }
        guard let cell = collectionView.cellForItem(at: IndexPath(item: index, section: 0)) else {
            return nil
        }
        return cell.convert(cell.bounds, to: nil)
    }

    // MARK: - Slow Continuous Scroll (Quoted Message Search)

    /// Starts a slow, continuous scroll toward older messages (visually upward).
    /// Used during quoted message search to give the user a visual impression
    /// that the app is actively browsing through message history.
    func startSlowScrollUp() {
        isIntentionalProgrammaticScroll = true
        // Le slow-scroll pilote l'offset frame par frame : aucune visée
        // vérifiée ne doit lui disputer la destination.
        scrollSettleTarget = nil
        guard slowScrollDisplayLink == nil else { return }
        // Proxy weak partagé (WeakDisplayLinkTarget) : un link `target: self`
        // retenait le VC entier (run loop → link → VC, deinit inatteignable)
        // quand on quittait la conversation pendant une recherche de message
        // cité — tick 60-120 fps + paginations réseau pour un écran mort.
        let link = WeakDisplayLinkTarget.makeLink(frameRateRange: .clock) { [weak self] link in
            guard let self else {
                link.invalidate()
                return
            }
            self.slowScrollTick(link)
        }
        link.add(to: .main, forMode: .common)
        slowScrollDisplayLink = link
    }

    /// Stops the slow continuous scroll.
    func stopSlowScroll() {
        isIntentionalProgrammaticScroll = false
        slowScrollDisplayLink?.invalidate()
        slowScrollDisplayLink = nil
    }

    @objc private func slowScrollTick(_ displayLink: CADisplayLink) {
        guard let cv = collectionView else {
            stopSlowScroll()
            return
        }
        let dt = displayLink.targetTimestamp - displayLink.timestamp
        let delta = slowScrollSpeed * CGFloat(dt)
        let maxY = cv.contentSize.height - cv.bounds.height + cv.contentInset.bottom
        guard maxY > 0 else { return }
        let newY = min(cv.contentOffset.y + delta, maxY)
        cv.contentOffset.y = newY

        // If we hit the end, trigger pagination so the slow scroll can continue
        // once new older messages are loaded.
        if newY >= maxY - 100, !isLoadingOlder {
            guard !store.messages.isEmpty, let onLoadOlder else { return }
            isLoadingOlder = true
            Task { @MainActor [weak self] in
                defer { self?.isLoadingOlder = false }
                await onLoadOlder()
            }
        }
    }

    // MARK: - Cell Flash Highlight

    /// RETRAIT FOCAL iOS (2026-08-18) : le flash CALayer de la décoration
    /// est parti avec le pass — l'historique (transform + alpha de cellule)
    /// sert TOUS les modes, il n'y a plus de perspective à préserver.
    func flashCell(at indexPath: IndexPath, strong: Bool = false) {
        legacyFlashCell(at: indexPath, strong: strong)
        releasePieceSpotlight(at: indexPath)
    }

    /// Comportement HISTORIQUE, verbatim — Script / bulles (R1 sans objet :
    /// ces modes ne portent aucune perspective à préserver).
    private func legacyFlashCell(at indexPath: IndexPath, strong: Bool = false) {
        let delay: TimeInterval = strong ? 0.25 : 0.35
        let flashAlpha: CGFloat = strong ? 0.2 : 0.4
        let flashDuration: TimeInterval = strong ? 0.15 : 0.18
        let recoverDuration: TimeInterval = strong ? 0.25 : 0.22
        // L'éclair vise un MESSAGE, pas une position : une arrivée ou l'indicateur de frappe inséré en tête
        // pendant le délai décalent les rangs, et l'IndexPath capturé éclairait alors un autre message.
        // L'élément est relevé maintenant, sa position relue au moment de l'éclair.
        let target = dataSource?.itemIdentifier(for: indexPath)

        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self else { return }
            let resolved = target.flatMap { self.dataSource?.indexPath(for: $0) } ?? (target == nil ? indexPath : nil)
            guard let resolved, let cell = self.collectionView.cellForItem(at: resolved) else { return }
            // Scale bounce for strong flash
            if strong {
                cell.transform = CGAffineTransform(scaleX: 1.02, y: 1.02)
            }
            UIView.animate(withDuration: flashDuration, animations: {
                cell.alpha = flashAlpha
            }) { _ in
                UIView.animate(withDuration: recoverDuration, delay: 0, options: .curveEaseOut) {
                    cell.alpha = 1.0
                    if strong {
                        cell.transform = .identity
                    }
                }
            }
        }
    }
}
