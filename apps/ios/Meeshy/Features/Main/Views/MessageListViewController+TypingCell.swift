// apps/ios/Meeshy/Features/Main/Views/MessageListViewController+TypingCell.swift

import UIKit
import SwiftUI
import MeeshySDK
import MeeshyUI

// Registration de la cellule « X écrit… » : vraie cellule, dernière du flux inversé, donc bas visuel (#10758).

extension MessageListViewController {

    func makeTypingRegistration() -> UICollectionView.CellRegistration<MessageListCell, MessageListItem> {
        UICollectionView.CellRegistration<MessageListCell, MessageListItem> { [weak self] cell, _, _ in
            guard let self else {
                cell.contentConfiguration = nil
                return
            }
            let typingRoster = self.conversationViewModel?.typingParticipants ?? []
            let typingAccent = self.accentColor
            let typingDark = self.isDark
            let typingFlat = self.readingMode != .bubbles
            let typingHere = self.conversationHere
            cell.contentConfiguration = UIHostingConfiguration {
                TypingIndicatorBubble(
                    participants: typingRoster,
                    accentHex: typingAccent,
                    isDark: typingDark,
                    isFlat: typingFlat,
                    here: typingHere
                )
                .scaleEffect(x: 1, y: -1)
            }
            .margins(.all, 0)
            cell.backgroundColor = .clear
        }
    }
}
