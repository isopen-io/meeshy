import UIKit

final class LoadMoreRepliesCell: UICollectionViewCell {
    private let label = UILabel()
    var parentId: String?
    var remaining: Int = 0

    override init(frame: CGRect) {
        super.init(frame: frame)
        label.font = .systemFont(ofSize: 13, weight: .medium)
        label.textColor = .systemBlue
        contentView.addSubview(label)
        label.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            label.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
            label.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 56 + 40),
            label.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -16),
            contentView.heightAnchor.constraint(greaterThanOrEqualToConstant: 36)
        ])
    }

    required init?(coder: NSCoder) { fatalError() }

    func configure(parentId: String, remaining: Int) {
        self.parentId = parentId
        self.remaining = remaining
        label.text = "View \(remaining) more replies"
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        label.text = nil
        parentId = nil
        remaining = 0
    }
}
