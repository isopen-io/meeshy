// apps/ios/Meeshy/Features/Main/Views/MessageListViewController+LongMessage.swift

import UIKit
import SwiftUI

//
// Le dépliage EN PLACE d'un message long (#8147), dans les modes que ce fil
// rend (Bulles, Script, Focal). Il remplace la feuille « Lire plus » : le
// message se déplie DANS le fil, sans saut de défilement, et reçoit l'effet
// Focal — bloc de verre (posé par la rangée), loupe et voisins atténués
// (posés ici, sur les layers). Loi : `LongMessageExpansionLaw`.
//

extension MessageListViewController {

    /// Le message long déplié — un seul à la fois.
    var expandedLongMessageLocalId: String? {
        get { longMessageExpansionState.localId }
        set { longMessageExpansionState.localId = newValue }
    }

    /// L'état de dépliage d'UNE cellule, remis à la bulle par l'environnement
    /// (la rangée plate le reçoit par `FocalRowInput.isExpanded`).
    func longMessageExpansion(for localId: String) -> LongMessageExpansion {
        LongMessageExpansion(messageId: localId, isExpanded: expandedLongMessageLocalId == localId) { [weak self] in
            self?.toggleLongMessageExpansion(localId)
        }
    }

    /// « Lire la suite » / « Réduire ». Replie le précédent déplié, anime la
    /// hauteur de la cellule en tenant immobile le bord ancré
    /// (`LongMessageExpansionLaw.anchor`) — aucun saut de défilement — puis
    /// pose l'effet Focal. Réduire le mouvement ⇒ aucune animation.
    func toggleLongMessageExpansion(_ localId: String) {
        guard isViewLoaded, dataSource != nil else { return }
        let previous = expandedLongMessageLocalId
        let next = LongMessageExpansionLaw.nextExpanded(current: previous, toggled: localId)
        expandedLongMessageLocalId = next
        // Le déplié devient LE message mis en avant : l'élu du mode Focal
        // rend sa carte, une seule mise en avant à la fois.
        if next != nil, focalFocusedLocalId != nil {
            focalFocusedLocalId = nil
            syncFocalFocusDetails()
        }

        var snapshot = dataSource.snapshot()
        let present = Set(snapshot.itemIdentifiers)
        let items = Array(Set([previous, localId].compactMap { $0 }))
            .map { MessageListItem.message(localId: $0) }
            .filter { present.contains($0) }
        guard !items.isEmpty else { return }
        snapshot.reconfigureItems(items)

        let anchor = LongMessageExpansionLaw.anchor(isExpanding: next == localId)
        if visibleCell(forLocalId: localId) != nil, let edge = visualEdge(ofLocalId: localId, anchor: anchor) {
            beginAnchorHold(.init(localId: localId, anchor: anchor, edge: edge))
        }
        // La cellule re-hébergée s'auto-dimensionne dans la passe forcée — pas
        // d'invalidation du layout ici : elle périmerait le mémo de la pastille
        // de jour (`MessageListStickyDayMemoGuardTests`). Le bord ancré est
        // recalé DANS la passe où la hauteur change (`holdAnchoredEdge`, sur
        // `contentSize`), donc dans la même animation : il ne bouge à aucune
        // image (#8157).
        let resize = { [weak self] in
            guard let self else { return }
            self.applyToDataSource(snapshot) {}
            self.collectionView.layoutIfNeeded()
            self.holdAnchoredEdge()
        }
        guard !UIAccessibility.isReduceMotionEnabled else {
            UIView.performWithoutAnimation(resize)
            applyLongMessageExpansionPresentation(animated: false)
            return
        }
        UIView.animate(
            withDuration: FocalMetrics.Focus.expandDuration,
            delay: 0,
            options: [.curveEaseInOut, .beginFromCurrentState, .allowUserInteraction],
            animations: resize
        )
        applyLongMessageExpansionPresentation(animated: true)
    }

    /// Tient le bord ancré du dépliage pendant que sa hauteur se pose : à
    /// chaque changement de `contentSize`, quelle que soit la passe de layout
    /// qui le porte. La fenêtre se referme d'elle-même après l'animation.
    private func beginAnchorHold(_ hold: LongMessageExpansionState.Hold) {
        longMessageExpansionState.hold = hold
        longMessageExpansionState.contentSizeObservation = collectionView.observe(\.contentSize, options: [.new]) { [weak self] _, _ in
            MainActor.assumeIsolated { self?.holdAnchoredEdge() }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + LongMessageExpansionLaw.holdWindow) { [weak self] in
            guard let self, self.longMessageExpansionState.hold?.id == hold.id else { return }
            self.longMessageExpansionState.hold = nil
            self.longMessageExpansionState.contentSizeObservation = nil
        }
    }

    /// Ramène le bord tenu à son ordonnée VISUELLE d'avant la passe
    /// (`LongMessageExpansionLaw.anchoredOffset`). Le layout du fil tient,
    /// lui, le bas visuel ; sans ce décalage, un déplié dont le haut est sous
    /// le chrome grandirait vers le HAUT. Le doigt garde toujours la main.
    private func holdAnchoredEdge() {
        guard let hold = longMessageExpansionState.hold,
              !collectionView.isTracking,
              let edgeAfter = visualEdge(ofLocalId: hold.localId, anchor: hold.anchor)
        else { return }
        let inset = collectionView.adjustedContentInset
        let target = LongMessageExpansionLaw.anchoredOffset(
            current: collectionView.contentOffset.y,
            edgeBefore: hold.edge,
            edgeAfter: edgeAfter,
            minOffset: -inset.top,
            maxOffset: collectionView.contentSize.height - collectionView.bounds.height + inset.bottom
        )
        guard abs(target - collectionView.contentOffset.y) > 0.5 else { return }
        // Un défilement VOULU : loin du bas, le verrou de scène (loi du
        // rouleau) annule tout mouvement d'offset non piloté — il rendait ici
        // l'ancre d'avant, et le déplié grandissait vers le haut (#8157).
        // Le verrou ADOPTE ensuite la position atteinte.
        let wasIntentional = isIntentionalProgrammaticScroll
        isIntentionalProgrammaticScroll = true
        collectionView.contentOffset.y = target
        isIntentionalProgrammaticScroll = wasIntentional
        captureSceneLockAnchor()
    }

    /// L'effet Focal du déplié : loupe sur lui, voisins atténués — tant qu'il
    /// est VISIBLE. Sans déplié à l'écran, le fil redevient uniforme, sauf
    /// pendant la scène Focal, qui possède alors les layers.
    ///
    /// - Parameter excluding: la cellule qui QUITTE l'écran
    ///   (`didEndDisplaying`), encore listée parmi les visibles.
    func applyLongMessageExpansionPresentation(animated: Bool, excluding: UICollectionViewCell? = nil) {
        guard isViewLoaded else { return }
        let cells = collectionView.visibleCells.filter { $0 !== excluding }
        let expandedCell = expandedLongMessageLocalId.flatMap { id in cells.first { localId(of: $0) == id } }
        guard expandedCell != nil || !(readingMode == .focal && focalSceneActive) else { return }
        for cell in cells {
            let layer = cell.contentView.layer
            let isExpanded = cell === expandedCell
            guard expandedCell != nil else {
                FocalScrollPerspective.reset(layer)
                continue
            }
            cell.layer.zPosition = isExpanded ? 1 : 0
            guard !isExpanded else {
                FocalScrollPerspective.magnify(layer, isFocused: true, animated: animated)
                continue
            }
            let alpha = Float(LongMessageExpansionLaw.alpha(isExpandedCell: false, expansionVisible: true))
            guard layer.opacity != alpha || !CATransform3DIsIdentity(layer.transform) else { continue }
            let pose = {
                layer.transform = CATransform3DIdentity
                layer.opacity = alpha
            }
            guard animated else {
                pose()
                continue
            }
            UIView.animate(withDuration: FocalMetrics.Focus.expandDuration, delay: 0, options: [.beginFromCurrentState, .allowUserInteraction], animations: pose)
        }
    }

    /// Le déplié est-il à l'écran ? La scène Focal lui cède alors les layers.
    var isLongMessageExpansionVisible: Bool {
        guard let id = expandedLongMessageLocalId, isViewLoaded else { return false }
        return collectionView.visibleCells.contains { localId(of: $0) == id }
    }

    private func localId(of cell: UICollectionViewCell) -> String? {
        guard let indexPath = collectionView.indexPath(for: cell),
              case .message(let localId) = dataSource?.itemIdentifier(for: indexPath) else { return nil }
        return localId
    }

    private func visibleCell(forLocalId localId: String) -> UICollectionViewCell? {
        guard let indexPath = dataSource?.indexPath(for: .message(localId: localId)) else { return nil }
        return collectionView.cellForItem(at: indexPath)
    }

    /// Ordonnée VISUELLE (repère de `view`) du bord ancré — la conversion
    /// traverse le renversement du fil. Lue sur les attributs du LAYOUT, pas
    /// sur `cell.frame` : quand `contentSize` change, le layout porte déjà
    /// la nouvelle hauteur alors que la cellule n'a pas encore été reposée.
    private func visualEdge(ofLocalId localId: String, anchor: LongMessageExpansionLaw.Anchor) -> CGFloat? {
        guard let indexPath = dataSource?.indexPath(for: .message(localId: localId)),
              let attributes = collectionView.layoutAttributesForItem(at: indexPath) else { return nil }
        let frame = collectionView.convert(attributes.frame, to: view)
        return anchor == .top ? frame.minY : frame.maxY
    }
}
