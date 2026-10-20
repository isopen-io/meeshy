// apps/ios/Meeshy/Features/Main/Views/MessageListViewController+ConversationStartCell.swift

import UIKit
import SwiftUI
import MeeshySDK
import MeeshyUI

// Registration du marqueur « Début de la conversation », INERTE depuis le retrait Focal du 2026-08-18 : `applySnapshot` n'appende plus `.conversationStart` (#10758).

extension MessageListViewController {

    func makeConversationStartRegistration() -> UICollectionView.CellRegistration<MessageListCell, MessageListItem> {
        UICollectionView.CellRegistration<MessageListCell, MessageListItem> { [weak self] cell, _, item in
            guard let self, case .conversationStart = item else {
                cell.contentConfiguration = nil
                return
            }
            let name = self.conversationViewModel?.currentConversationName ?? ""
            let dark = self.isDark
            let firstDayLabel: String? = self.store.messages.first.map { oldest in
                self.relativeDayLabel(for: oldest.createdAt)
            }
            cell.contentConfiguration = UIHostingConfiguration {
                FocalConversationStartRow(
                    conversationName: name,
                    isDark: dark,
                    firstMessageDayLabel: firstDayLabel
                )
                .scaleEffect(x: 1, y: -1)
            }
            .margins(.all, 0)
            cell.backgroundColor = .clear
        }
    }
}
