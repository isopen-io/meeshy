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
        nameLabel.font = .systemFont(ofSize: 13, weight: .semibold)
        contentView.addSubview(nameLabel)
        nameLabel.translatesAutoresizingMaskIntoConstraints = false

        contentLabel.font = .systemFont(ofSize: 14)
        contentLabel.numberOfLines = 0
        contentView.addSubview(contentLabel)
        contentLabel.translatesAutoresizingMaskIntoConstraints = false

        timestampLabel.font = .systemFont(ofSize: 11)
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
    }

    func configure(with record: CommentRecord, depth: Int = 1) {
        nameLabel.text = record.authorDisplayName ?? record.authorUsername
        contentLabel.text = record.content
        timestampLabel.text = Self.formatter.localizedString(for: record.createdAt, relativeTo: Date())
        leadingConstraint?.constant = Self.baseIndent + CGFloat(depth) * Self.indentPerDepth
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
