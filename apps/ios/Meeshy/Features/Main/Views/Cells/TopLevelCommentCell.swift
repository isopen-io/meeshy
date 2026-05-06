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

        nameLabel.font = .systemFont(ofSize: 14, weight: .semibold)
        contentView.addSubview(nameLabel)
        nameLabel.translatesAutoresizingMaskIntoConstraints = false

        contentLabel.font = .systemFont(ofSize: 15)
        contentLabel.numberOfLines = 0
        contentView.addSubview(contentLabel)
        contentLabel.translatesAutoresizingMaskIntoConstraints = false

        timestampLabel.font = .systemFont(ofSize: 12)
        timestampLabel.textColor = .tertiaryLabel
        contentView.addSubview(timestampLabel)
        timestampLabel.translatesAutoresizingMaskIntoConstraints = false

        likeButton.setImage(UIImage(systemName: "heart"), for: .normal)
        likeButton.tintColor = .secondaryLabel
        contentView.addSubview(likeButton)
        likeButton.translatesAutoresizingMaskIntoConstraints = false

        replyButton.setTitle("Reply", for: .normal)
        replyButton.titleLabel?.font = .systemFont(ofSize: 12, weight: .medium)
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
    }

    func configure(with record: CommentRecord) {
        nameLabel.text = record.authorDisplayName ?? record.authorUsername
        contentLabel.text = record.content
        timestampLabel.text = Self.formatter.localizedString(for: record.createdAt, relativeTo: Date())
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        contentLabel.text = nil
        nameLabel.text = nil
    }

    private static let formatter: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .abbreviated
        return f
    }()
}
