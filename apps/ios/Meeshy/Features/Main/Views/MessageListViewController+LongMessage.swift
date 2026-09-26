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

    /// L'état de dépliage d'UNE cellule, remis à la bulle par l'environnement
    /// (la rangée plate le reçoit par `FocalRowInput.isExpanded`).
    func longMessageExpansion(for localId: String) -> LongMessageExpansion {
        LongMessageExpansion(isExpanded: expandedLongMessageLocalId == localId) { [weak self] in
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
        let edgeBefore = visibleCell(forLocalId: localId).map { visualEdge(of: $0, anchor: anchor) }
        let changes = { [weak self] in
            guard let self else { return }
            self.applyToDataSource(snapshot) {}
            self.collectionView.layoutIfNeeded()
            guard let edgeBefore, let cell = self.visibleCell(forLocalId: localId) else { return }
            let inset = self.collectionView.adjustedContentInset
            self.collectionView.contentOffset.y = LongMessageExpansionLaw.anchoredOffset(
                current: self.collectionView.contentOffset.y,
                edgeBefore: edgeBefore,
                edgeAfter: self.visualEdge(of: cell, anchor: anchor),
                minOffset: -inset.top,
                maxOffset: self.collectionView.contentSize.height - self.collectionView.bounds.height + inset.bottom
            )
        }
        guard !UIAccessibility.isReduceMotionEnabled else {
            UIView.performWithoutAnimation(changes)
            applyLongMessageExpansionPresentation(animated: false)
            return
        }
        UIView.animate(
            withDuration: FocalMetrics.Focus.expandDuration,
            delay: 0,
            options: [.curveEaseInOut, .beginFromCurrentState, .allowUserInteraction],
            animations: changes
        )
        applyLongMessageExpansionPresentation(animated: true)
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
    /// traverse le renversement du fil.
    private func visualEdge(of cell: UICollectionViewCell, anchor: LongMessageExpansionLaw.Anchor) -> CGFloat {
        let frame = collectionView.convert(cell.frame, to: view)
        return anchor == .top ? frame.minY : frame.maxY
    }
}
