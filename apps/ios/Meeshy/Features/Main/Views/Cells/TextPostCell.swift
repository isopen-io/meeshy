import UIKit
import MeeshySDK

final class TextPostCell: UICollectionViewCell {
    private let authorStack = UIStackView()
    private let avatarView = UIImageView()
    private let nameLabel = UILabel()
    private let usernameLabel = UILabel()
    private let contentLabel = UILabel()
    private let timestampLabel = UILabel()
    private let statsStack = UIStackView()
    private let likeButton = UIButton(type: .system)
    private let commentButton = UIButton(type: .system)
    private let repostButton = UIButton(type: .system)

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
        usernameLabel.font = .systemFont(ofSize: 13)
        usernameLabel.textColor = .secondaryLabel

        let nameStack = UIStackView(arrangedSubviews: [nameLabel, usernameLabel])
        nameStack.axis = .vertical
        nameStack.spacing = 2

        authorStack.addArrangedSubview(avatarView)
        authorStack.addArrangedSubview(nameStack)
        authorStack.spacing = 10
        authorStack.alignment = .center
        mainStack.addArrangedSubview(authorStack)

        contentLabel.font = .systemFont(ofSize: 16)
        contentLabel.numberOfLines = 0
        mainStack.addArrangedSubview(contentLabel)

        timestampLabel.font = .systemFont(ofSize: 12)
        timestampLabel.textColor = .tertiaryLabel
        mainStack.addArrangedSubview(timestampLabel)

        likeButton.titleLabel?.font = .systemFont(ofSize: 13)
        commentButton.titleLabel?.font = .systemFont(ofSize: 13)
        repostButton.titleLabel?.font = .systemFont(ofSize: 13)
        statsStack.addArrangedSubview(likeButton)
        statsStack.addArrangedSubview(commentButton)
        statsStack.addArrangedSubview(repostButton)
        statsStack.distribution = .fillEqually
        statsStack.spacing = 8
        mainStack.addArrangedSubview(statsStack)

        let separator = UIView()
        separator.backgroundColor = .separator
        separator.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(separator)
        NSLayoutConstraint.activate([
            separator.heightAnchor.constraint(equalToConstant: 0.5),
            separator.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            separator.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            separator.bottomAnchor.constraint(equalTo: contentView.bottomAnchor)
        ])
    }

    func configure(with record: PostRecord) {
        nameLabel.text = record.authorDisplayName ?? record.authorUsername
        usernameLabel.text = record.authorUsername.map { "@\($0)" }
        contentLabel.text = record.content
        timestampLabel.text = RelativeTimeFormatter.shortString(for: record.createdAt)
        likeButton.setTitle("  \(record.likeCount)", for: .normal)
        likeButton.setImage(UIImage(systemName: record.isLikedByMe ? "heart.fill" : "heart"), for: .normal)
        likeButton.tintColor = record.isLikedByMe ? .systemRed : .secondaryLabel
        likeButton.accessibilityLabel = PostStatAccessibility.likesLabel(record.likeCount)
        commentButton.setTitle("  \(record.commentCount)", for: .normal)
        commentButton.setImage(UIImage(systemName: "bubble.right"), for: .normal)
        commentButton.accessibilityLabel = PostStatAccessibility.commentsLabel(record.commentCount)
        repostButton.setTitle("  \(record.repostCount)", for: .normal)
        repostButton.setImage(UIImage(systemName: "arrow.2.squarepath"), for: .normal)
        repostButton.accessibilityLabel = PostStatAccessibility.repostsLabel(record.repostCount)
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        contentLabel.text = nil
        nameLabel.text = nil
        avatarView.image = nil
    }
}
