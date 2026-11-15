// apps/ios/Meeshy/Features/Main/Views/MessageListViewController+DayHeaderCell.swift

import UIKit
import SwiftUI
import MeeshySDK
import MeeshyUI

// Registration du séparateur de jour : le libellé est recalculé à chaque rendu de cellule pour suivre minuit (#10758).

extension MessageListViewController {

    func makeDayHeaderRegistration() -> UICollectionView.CellRegistration<MessageListCell, MessageListItem> {
        UICollectionView.CellRegistration<MessageListCell, MessageListItem> { [weak self] cell, _, item in
            guard let self, case .dayHeader(let dayStart) = item else {
                cell.contentConfiguration = nil
                return
            }
            let label = self.relativeDayLabel(for: dayStart)
            let dark = self.isDark
            cell.contentConfiguration = UIHostingConfiguration {
                MessageDaySeparator(label: label, isDark: dark)
                    .scaleEffect(x: 1, y: -1)
            }
            .margins(.all, 0)
            cell.backgroundColor = .clear
        }
    }
}
