import UIKit
import SwiftUI

final class LoadMoreRepliesCell: UICollectionViewCell {
    private let label = UILabel()
    var parentId: String?
    var remaining: Int = 0

    override init(frame: CGRect) {
        super.init(frame: frame)
        label.font = UIFontMetrics(forTextStyle: .subheadline)
            .scaledFont(for: .systemFont(ofSize: 13, weight: .medium))
        label.adjustsFontForContentSizeCategory = true
        label.numberOfLines = 0
        label.textColor = UIColor(MeeshyColors.indigo500)
        contentView.addSubview(label)
        label.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            label.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
            label.topAnchor.constraint(greaterThanOrEqualTo: contentView.topAnchor, constant: 8),
            label.bottomAnchor.constraint(lessThanOrEqualTo: contentView.bottomAnchor, constant: -8),
            label.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 56 + 40),
            label.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -16),
            contentView.heightAnchor.constraint(greaterThanOrEqualToConstant: 36)
        ])
        isAccessibilityElement = true
        accessibilityTraits = .button
    }

    required init?(coder: NSCoder) { fatalError() }

    func configure(parentId: String, remaining: Int) {
        self.parentId = parentId
        self.remaining = remaining
        let text = Self.loadMoreLabel(remaining: remaining)
        label.text = text
        accessibilityLabel = text
    }

    static func loadMoreLabel(remaining: Int) -> String {
        if remaining == 1 {
            return String(localized: "comments.load-more-replies.one",
                          defaultValue: "View 1 more reply",
                          bundle: .main)
        }
        return String(localized: "comments.load-more-replies.other",
                      defaultValue: "View \(remaining) more replies",
                      bundle: .main)
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        label.text = nil
        accessibilityLabel = nil
        parentId = nil
        remaining = 0
    }
}
