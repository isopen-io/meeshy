import UIKit

final class LoadMoreRepliesCell: UICollectionViewCell {
    private let label = UILabel()
    var parentId: String?
    var remaining: Int = 0

    private static let accentColor = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0x81 / 255, green: 0x8C / 255, blue: 0xF8 / 255, alpha: 1) // indigo400
            : UIColor(red: 0x63 / 255, green: 0x66 / 255, blue: 0xF1 / 255, alpha: 1) // indigo500
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        label.font = .preferredFont(forTextStyle: .subheadline)
        label.adjustsFontForContentSizeCategory = true
        label.numberOfLines = 0
        label.textColor = Self.accentColor
        contentView.addSubview(label)
        label.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            label.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 8),
            label.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -8),
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
        let text = Self.labelText(remaining: remaining)
        label.text = text
        accessibilityLabel = text
        accessibilityHint = String(
            localized: "comments.load-more-replies.hint",
            defaultValue: "Shows the remaining replies in this thread",
            bundle: .main
        )
    }

    static func labelText(remaining: Int) -> String {
        String(
            localized: "comments.load-more-replies",
            defaultValue: "View ^[\(remaining) more reply](inflect: true)",
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
