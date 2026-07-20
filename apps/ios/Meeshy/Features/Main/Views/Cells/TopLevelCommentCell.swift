import UIKit
import MeeshySDK

final class TopLevelCommentCell: UICollectionViewCell {
    private let avatarView = UIImageView()
    private let nameLabel = UILabel()
    private let contentLabel = UILabel()
    private let timestampLabel = UILabel()
    private let likeButton = UIButton(type: .system)
    private let replyButton = UIButton(type: .system)

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupViews()
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setupViews() {
        avatarView.layer.cornerRadius = 16
        avatarView.clipsToBounds = true
        avatarView.backgroundColor = .systemGray5
        contentView.addSubview(avatarView)
        avatarView.translatesAutoresizingMaskIntoConstraints = false

        nameLabel.font = UIFontMetrics(forTextStyle: .footnote)
            .scaledFont(for: .systemFont(ofSize: 14, weight: .semibold))
        nameLabel.adjustsFontForContentSizeCategory = true
        nameLabel.numberOfLines = 0
        contentView.addSubview(nameLabel)
        nameLabel.translatesAutoresizingMaskIntoConstraints = false

        contentLabel.font = UIFontMetrics(forTextStyle: .body)
            .scaledFont(for: .systemFont(ofSize: 15))
        contentLabel.adjustsFontForContentSizeCategory = true
        contentLabel.numberOfLines = 0
        contentView.addSubview(contentLabel)
        contentLabel.translatesAutoresizingMaskIntoConstraints = false

        timestampLabel.font = UIFontMetrics(forTextStyle: .caption2)
            .scaledFont(for: .systemFont(ofSize: 12))
        timestampLabel.adjustsFontForContentSizeCategory = true
        timestampLabel.numberOfLines = 0
        timestampLabel.textColor = .tertiaryLabel
        contentView.addSubview(timestampLabel)
        timestampLabel.translatesAutoresizingMaskIntoConstraints = false

        likeButton.setImage(UIImage(systemName: "heart"), for: .normal)
        likeButton.tintColor = .secondaryLabel
        contentView.addSubview(likeButton)
        likeButton.translatesAutoresizingMaskIntoConstraints = false

        replyButton.setTitle(
            String(localized: "a11y.comment.reply", defaultValue: "Reply", bundle: .main),
            for: .normal
        )
        replyButton.titleLabel?.font = UIFontMetrics(forTextStyle: .caption2)
            .scaledFont(for: .systemFont(ofSize: 12, weight: .medium))
        replyButton.titleLabel?.adjustsFontForContentSizeCategory = true
        replyButton.tintColor = .secondaryLabel
        contentView.addSubview(replyButton)
        replyButton.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            avatarView.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 8),
            avatarView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 16),
            avatarView.widthAnchor.constraint(equalToConstant: 32),
            avatarView.heightAnchor.constraint(equalToConstant: 32),
            nameLabel.topAnchor.constraint(equalTo: avatarView.topAnchor),
            nameLabel.leadingAnchor.constraint(equalTo: avatarView.trailingAnchor, constant: 8),
            nameLabel.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -16),
            contentLabel.topAnchor.constraint(equalTo: nameLabel.bottomAnchor, constant: 4),
            contentLabel.leadingAnchor.constraint(equalTo: nameLabel.leadingAnchor),
            contentLabel.trailingAnchor.constraint(equalTo: nameLabel.trailingAnchor),
            timestampLabel.topAnchor.constraint(equalTo: contentLabel.bottomAnchor, constant: 4),
            timestampLabel.leadingAnchor.constraint(equalTo: nameLabel.leadingAnchor),
            likeButton.centerYAnchor.constraint(equalTo: timestampLabel.centerYAnchor),
            likeButton.leadingAnchor.constraint(equalTo: timestampLabel.trailingAnchor, constant: 12),
            replyButton.centerYAnchor.constraint(equalTo: timestampLabel.centerYAnchor),
            replyButton.leadingAnchor.constraint(equalTo: likeButton.trailingAnchor, constant: 12),
            timestampLabel.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -8)
        ])

        isAccessibilityElement = true
    }

    func configure(with record: CommentRecord) {
        let name = record.authorDisplayName ?? record.authorUsername
        let content = record.content
        let time = RelativeTimeFormatter.shortString(for: record.createdAt)
        nameLabel.text = name
        contentLabel.text = content
        timestampLabel.text = time
        accessibilityLabel = Self.accessibilityLabel(name: name, content: content, time: time)
    }

    static func accessibilityLabel(name: String, content: String, time: String) -> String {
        String(
            localized: "comments.comment.a11yLabel",
            defaultValue: "\(name), comment. \(content). \(time)",
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
