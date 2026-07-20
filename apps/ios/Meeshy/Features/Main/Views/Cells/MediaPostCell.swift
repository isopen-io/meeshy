import UIKit
import MeeshySDK

final class MediaPostCell: UICollectionViewCell {
    private let authorStack = UIStackView()
    private let avatarView = UIImageView()
    private let nameLabel = UILabel()
    private let contentLabel = UILabel()
    private let timestampLabel = UILabel()
    private let mediaImageView = UIImageView()
    private let statsStack = UIStackView()
    private let likeButton = UIButton(type: .system)
    private let commentButton = UIButton(type: .system)

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupViews()
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setupViews() {
        let mainStack = UIStackView()
        mainStack.axis = .vertical
        mainStack.spacing = 8
        contentView.addSubview(mainStack)
        mainStack.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            mainStack.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 12),
            mainStack.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 16),
            mainStack.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -16),
            mainStack.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -12)
        ])

        avatarView.layer.cornerRadius = 20
        avatarView.clipsToBounds = true
        avatarView.backgroundColor = .systemGray5
        avatarView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            avatarView.widthAnchor.constraint(equalToConstant: 40),
            avatarView.heightAnchor.constraint(equalToConstant: 40)
        ])

        nameLabel.font = .systemFont(ofSize: 15, weight: .semibold)
        let nameStack = UIStackView(arrangedSubviews: [avatarView, nameLabel])
        nameStack.spacing = 10
        nameStack.alignment = .center
        mainStack.addArrangedSubview(nameStack)

        contentLabel.font = .systemFont(ofSize: 16)
        contentLabel.numberOfLines = 3
        mainStack.addArrangedSubview(contentLabel)

        mediaImageView.contentMode = .scaleAspectFill
        mediaImageView.clipsToBounds = true
        mediaImageView.layer.cornerRadius = 12
        mediaImageView.backgroundColor = .systemGray5
        mediaImageView.translatesAutoresizingMaskIntoConstraints = false
        mainStack.addArrangedSubview(mediaImageView)
        NSLayoutConstraint.activate([
            mediaImageView.heightAnchor.constraint(equalToConstant: 200)
        ])

        timestampLabel.font = .systemFont(ofSize: 12)
        timestampLabel.textColor = .tertiaryLabel
        mainStack.addArrangedSubview(timestampLabel)

        likeButton.titleLabel?.font = .systemFont(ofSize: 13)
        commentButton.titleLabel?.font = .systemFont(ofSize: 13)
        statsStack.addArrangedSubview(likeButton)
        statsStack.addArrangedSubview(commentButton)
        statsStack.addArrangedSubview(UIView())
        statsStack.spacing = 16
        mainStack.addArrangedSubview(statsStack)
    }

    func configure(with record: PostRecord) {
        nameLabel.text = record.authorDisplayName ?? record.authorUsername
        contentLabel.text = record.content
        contentLabel.isHidden = record.content == nil
        timestampLabel.text = RelativeTimeFormatter.shortString(for: record.createdAt)
        likeButton.setTitle("  \(record.likeCount)", for: .normal)
        likeButton.setImage(UIImage(systemName: record.isLikedByMe ? "heart.fill" : "heart"), for: .normal)
        likeButton.tintColor = record.isLikedByMe ? .systemRed : .secondaryLabel
        likeButton.accessibilityLabel = PostStatAccessibility.likesLabel(record.likeCount)
        commentButton.setTitle("  \(record.commentCount)", for: .normal)
        commentButton.setImage(UIImage(systemName: "bubble.right"), for: .normal)
        commentButton.accessibilityLabel = PostStatAccessibility.commentsLabel(record.commentCount)
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        contentLabel.text = nil
        timestampLabel.text = nil
        mediaImageView.image = nil
    }
}
