import UIKit

final class LoadMoreRepliesCell: UICollectionViewCell {
    private let label = UILabel()
    var parentId: String?
    var remaining: Int = 0

    override init(frame: CGRect) {
        super.init(frame: frame)
        // Scale the 13-pt medium action label with Dynamic Type instead of pinning
        // it — the row is a tap target, so its text must grow with the user's text
        // size like every native "show more" affordance.
        label.font = UIFontMetrics(forTextStyle: .subheadline)
            .scaledFont(for: .systemFont(ofSize: 13, weight: .medium))
        label.adjustsFontForContentSizeCategory = true
        label.numberOfLines = 0
        label.textColor = .systemBlue
        contentView.addSubview(label)
        label.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            label.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
            label.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 56 + 40),
            label.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -16),
            // HIG minimum touch target for the tappable "load more" action.
            contentView.heightAnchor.constraint(greaterThanOrEqualToConstant: 44)
        ])
    }

    required init?(coder: NSCoder) { fatalError() }

    func configure(parentId: String, remaining: Int) {
        self.parentId = parentId
        self.remaining = remaining
        let text = Self.loadMoreText(remaining: remaining)
        label.text = text
        // The whole cell is the tap target (didSelectItemAt → onToggleThread), so
        // expose it to VoiceOver as a single button element, not loose static text.
        isAccessibilityElement = true
        accessibilityTraits = .button
        accessibilityLabel = text
    }

    /// Localized, grammatically-correct count string. Singular and plural are
    /// separate keys so each locale applies its own plural rule (English base
    /// defaults inline, matching the file family's `String(localized:)` idiom).
    private static func loadMoreText(remaining: Int) -> String {
        if remaining == 1 {
            return String(
                localized: "comment.replies.load-more-one",
                defaultValue: "View 1 more reply",
                bundle: .main
            )
        }
        return String(
            localized: "comment.replies.load-more-other",
            defaultValue: "View \(remaining) more replies",
            bundle: .main
        )
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        label.text = nil
        parentId = nil
        remaining = 0
        accessibilityLabel = nil
        accessibilityTraits = .none
    }
}
