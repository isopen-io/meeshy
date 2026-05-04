import UIKit
import MeeshySDK

final class TextBubbleCell: UICollectionViewCell {
    private let bubbleView = UIView()
    private let textLabel = UILabel()
    private let deliveryIndicator = DeliveryIndicatorView()
    private let senderLabel = UILabel()
    private var currentRecord: MessageRecord?

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupViews()
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setupViews() {
        bubbleView.layer.cornerRadius = 16
        bubbleView.clipsToBounds = true
        contentView.addSubview(bubbleView)
        bubbleView.translatesAutoresizingMaskIntoConstraints = false

        senderLabel.font = .systemFont(ofSize: 13, weight: .semibold)
        bubbleView.addSubview(senderLabel)
        senderLabel.translatesAutoresizingMaskIntoConstraints = false

        textLabel.font = .systemFont(ofSize: 16)
        textLabel.numberOfLines = 0
        bubbleView.addSubview(textLabel)
        textLabel.translatesAutoresizingMaskIntoConstraints = false

        bubbleView.addSubview(deliveryIndicator)
        deliveryIndicator.translatesAutoresizingMaskIntoConstraints = false
    }

    func configure(with record: MessageRecord, isMe: Bool) {
        currentRecord = record
        textLabel.text = record.content
        senderLabel.text = isMe ? nil : record.senderName
        senderLabel.textColor = UIColor(hex: record.senderColor ?? "#6366F1") ?? .label
        senderLabel.isHidden = isMe

        bubbleView.backgroundColor = isMe
            ? UIColor(named: "BubbleOutgoing") ?? .systemBlue.withAlphaComponent(0.15)
            : UIColor(named: "BubbleIncoming") ?? .secondarySystemBackground

        deliveryIndicator.configure(
            state: record.state, timestamp: record.createdAt, isFromCurrentUser: isMe)

        setNeedsLayout()
    }

    override func preferredLayoutAttributesFitting(
        _ layoutAttributes: UICollectionViewLayoutAttributes
    ) -> UICollectionViewLayoutAttributes {
        let attrs = super.preferredLayoutAttributesFitting(layoutAttributes)
        if let record = currentRecord, let height = record.cachedBubbleHeight {
            attrs.size.height = CGFloat(height) + 4
        }
        return attrs
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        currentRecord = nil
        textLabel.text = nil
        senderLabel.text = nil
    }
}
