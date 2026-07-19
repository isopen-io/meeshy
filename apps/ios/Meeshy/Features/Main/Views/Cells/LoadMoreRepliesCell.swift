import UIKit
import SwiftUI
import MeeshyUI

final class LoadMoreRepliesCell: UICollectionViewCell {
    private let label = UILabel()
    var parentId: String?
    var remaining: Int = 0

    override init(frame: CGRect) {
        super.init(frame: frame)
        let base = UIFont.systemFont(
            ofSize: UIFont.preferredFont(forTextStyle: .footnote).pointSize,
            weight: .medium
        )
        label.font = UIFontMetrics(forTextStyle: .footnote).scaledFont(for: base)
        label.adjustsFontForContentSizeCategory = true
        label.numberOfLines = 0
        label.textColor = UIColor(MeeshyColors.indigo500)
        contentView.addSubview(label)
        label.translatesAutoresizingMaskIntoConstraints = false

        let centerY = label.centerYAnchor.constraint(equalTo: contentView.centerYAnchor)
        centerY.priority = .defaultHigh

        NSLayoutConstraint.activate([
            centerY,
            label.topAnchor.constraint(greaterThanOrEqualTo: contentView.topAnchor, constant: 8),
            label.bottomAnchor.constraint(lessThanOrEqualTo: contentView.bottomAnchor, constant: -8),
            label.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 56 + 40),
            label.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -16),
            contentView.heightAnchor.constraint(greaterThanOrEqualToConstant: 44)
        ])

        isAccessibilityElement = true
        accessibilityTraits = .button
    }

    required init?(coder: NSCoder) { fatalError() }

    func configure(parentId: String, remaining: Int) {
        self.parentId = parentId
        self.remaining = remaining
        let text = String(
            localized: "comments.load-more-replies",
            defaultValue: "Voir ^[\(remaining) réponse](inflect: true) de plus",
            bundle: .main
        )
        label.text = text
        accessibilityLabel = text
        accessibilityHint = String(
            localized: "comments.load-more-replies.a11y-hint",
            defaultValue: "Affiche les réponses supplémentaires",
            bundle: .main
        )
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        label.text = nil
        accessibilityLabel = nil
        parentId = nil
        remaining = 0
    }
}
