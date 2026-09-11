// apps/ios/Meeshy/Features/Main/Views/MessageListViewController+ChromeFade.swift

import UIKit

// MARK: - Voile du chrome (#6013)

extension MessageListViewController {

    /// Pose sur la liste le voile de `ThreadChromeFade`. Sa géométrie vient des
    /// réserves que la liste tient déjà : la bande îlot (`topInset`), la rangée
    /// de l'en-tête flottant, et la réserve du composeur — `contentInset.top`,
    /// la liste étant renversée.
    func applyChromeFade(_ visibility: ThreadChromeFade.Visibility, transition: ListInsetTransition?) {
        guard collectionView != nil,
              let container = collectionView.superview as? ThreadChromeFadeContainer else { return }
        container.apply(
            ThreadChromeFade.resolve(
                usesFlatRow: readingMode.usesFlatRow,
                topInset: topInset,
                headerRowClearance: ConversationView.riverHeaderClearance,
                bottomRest: collectionView.contentInset.top,
                visibility: visibility
            ),
            transition: transition
        )
    }
}
