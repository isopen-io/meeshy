import UIKit
import MeeshySDK

final class ReplyCell: UICollectionViewCell {
    private let nameLabel = UILabel()
    private let contentLabel = UILabel()
    private let timestampLabel = UILabel()
    private var leadingConstraint: NSLayoutConstraint?
    static let baseIndent: CGFloat = 16
    static let indentPerDepth: CGFloat = 40

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupViews()
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setupViews() {
        nameLabel.font = UIFontMetrics(forTextStyle: .footnote)
            .scaledFont(for: .systemFont(ofSize: 13, weight: .semibold))
        nameLabel.adjustsFontForContentSizeCategory = true
        nameLabel.numberOfLines = 0
        contentView.addSubview(nameLabel)
        nameLabel.translatesAutoresizingMaskIntoConstraints = false

        contentLabel.font = UIFontMetrics(forTextStyle: .body)
            .scaledFont(for: .systemFont(ofSize: 14))
        contentLabel.adjustsFontForContentSizeCategory = true
        contentLabel.numberOfLines = 0
        contentView.addSubview(contentLabel)
        contentLabel.translatesAutoresizingMaskIntoConstraints = false

        timestampLabel.font = UIFontMetrics(forTextStyle: .caption2)
            .scaledFont(for: .systemFont(ofSize: 11))
        timestampLabel.adjustsFontForContentSizeCategory = true
        timestampLabel.numberOfLines = 0
        timestampLabel.textColor = .tertiaryLabel
        contentView.addSubview(timestampLabel)
        timestampLabel.translatesAutoresizingMaskIntoConstraints = false

        leadingConstraint = nameLabel.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: Self.baseIndent + Self.indentPerDepth)

        NSLayoutConstraint.activate([
            leadingConstraint!,
            nameLabel.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 6),
            nameLabel.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -16),
            contentLabel.topAnchor.constraint(equalTo: nameLabel.bottomAnchor, constant: 2),
            contentLabel.leadingAnchor.constraint(equalTo: nameLabel.leadingAnchor),
            contentLabel.trailingAnchor.constraint(equalTo: nameLabel.trailingAnchor),
            timestampLabel.topAnchor.constraint(equalTo: contentLabel.bottomAnchor, constant: 2),
            timestampLabel.leadingAnchor.constraint(equalTo: nameLabel.leadingAnchor),
            timestampLabel.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -6)
        ])

        isAccessibilityElement = true
    }

    func configure(with record: CommentRecord, depth: Int = 1) {
        let name = record.authorDisplayName ?? record.authorUsername ?? ""
        let content = record.content
        let time = RelativeTimeFormatter.shortString(for: record.createdAt)
        nameLabel.text = name
        contentLabel.text = content
        timestampLabel.text = time
        leadingConstraint?.constant = Self.baseIndent + CGFloat(depth) * Self.indentPerDepth
        accessibilityLabel = Self.accessibilityLabel(name: name, content: content, time: time)
    }

    static func accessibilityLabel(name: String, content: String, time: String) -> String {
        String(
            localized: "comments.reply.a11yLabel",
            defaultValue: "\(name), reply. \(content). \(time)",
            bundle: .main
        )
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        contentLabel.text = nil
        nameLabel.text = nil
        timestampLabel.text = nil
        accessibilityLabel = nil
    }
}
