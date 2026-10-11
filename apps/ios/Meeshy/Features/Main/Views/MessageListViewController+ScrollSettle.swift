// apps/ios/Meeshy/Features/Main/Views/MessageListViewController+ScrollSettle.swift

import UIKit
import MeeshySDK

//
// La fin d'une passe de défilement vers un message — extraite de
// `MessageListViewController` (hors budget de taille, interdit d'ajout) pour
// que #9907 puisse y poser l'appui long d'une pièce sans grossir le fichier.
//

extension MessageListViewController {

    /// Fin d'une passe : la loi tranche — posé (flash), re-visée (nouvelle
    /// animation, budget décrémenté), ou abandon (flash sur place, la cible
    /// est de toute façon à l'écran ou presque).
    func verifyScrollSettleTarget() {
        guard var target = scrollSettleTarget else { return }
        guard let dataSource,
              let indexPath = dataSource.indexPath(for: .message(localId: target.localId)),
              let attrs = collectionView.layoutAttributesForItem(at: indexPath)
        else {
            // Cible sortie du snapshot (changement de fenêtre) — le chemin
            // parent (jumpToQuotedMessage) reprendra avec son propre trigger.
            scrollSettleTarget = nil
            return
        }
        let desired = ScrollToMessageSettleLaw.centeredOffsetY(
            itemFrame: attrs.frame,
            boundsHeight: collectionView.bounds.height,
            contentHeight: collectionView.contentSize.height,
            topContentInset: collectionView.contentInset.top,
            bottomContentInset: collectionView.contentInset.bottom
        )
        switch ScrollToMessageSettleLaw.verdict(
            currentOffsetY: collectionView.contentOffset.y,
            desiredOffsetY: desired,
            passesRemaining: target.passesRemaining
        ) {
        case .settled, .giveUp:
            scrollSettleTarget = nil
            isIntentionalProgrammaticScroll = false
            captureSceneLockAnchor()
            flashCell(at: indexPath, strong: target.strong)
        case .correct:
            target.passesRemaining -= 1
            scrollSettleTarget = target
            isIntentionalProgrammaticScroll = true
            collectionView.scrollToItem(at: indexPath, at: .centeredVertically, animated: true)
            scheduleScrollSettleFallback()
        }
    }
}
