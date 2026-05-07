import UIKit
import MeeshySDK

final class TextBubbleCell: UICollectionViewCell {
    private let bubbleView = UIView()
    private let textLabel = UILabel()
    private let deliveryIndicator = DeliveryIndicatorView()
    private let senderLabel = UILabel()
    private var currentRecord: MessageRecord?

    // Side anchors flipped between incoming (leading) and outgoing (trailing)
    // alignments. Stored so `configure(isMe:)` can toggle them per-row.
    private var leadingConstraint: NSLayoutConstraint!
    private var trailingConstraint: NSLayoutConstraint!

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupViews()
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setupViews() {
        contentView.addSubview(bubbleView)
        bubbleView.addSubview(senderLabel)
        bubbleView.addSubview(textLabel)
        bubbleView.addSubview(deliveryIndicator)

        bubbleView.layer.cornerRadius = 16
        bubbleView.clipsToBounds = true

        senderLabel.font = .systemFont(ofSize: 13, weight: .semibold)
        senderLabel.numberOfLines = 1

        textLabel.font = .systemFont(ofSize: 16)
        textLabel.numberOfLines = 0
        textLabel.textColor = .label

        [bubbleView, senderLabel, textLabel, deliveryIndicator].forEach {
            $0.translatesAutoresizingMaskIntoConstraints = false
        }

        leadingConstraint = bubbleView.leadingAnchor.constraint(
            equalTo: contentView.leadingAnchor, constant: 4
        )
        trailingConstraint = bubbleView.trailingAnchor.constraint(
            equalTo: contentView.trailingAnchor, constant: -4
        )

        NSLayoutConstraint.activate([
            bubbleView.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 2),
            bubbleView.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -2),
            bubbleView.widthAnchor.constraint(
                lessThanOrEqualTo: contentView.widthAnchor, multiplier: 0.78
            ),

            senderLabel.topAnchor.constraint(equalTo: bubbleView.topAnchor, constant: 8),
            senderLabel.leadingAnchor.constraint(equalTo: bubbleView.leadingAnchor, constant: 12),
            senderLabel.trailingAnchor.constraint(equalTo: bubbleView.trailingAnchor, constant: -12),

            textLabel.topAnchor.constraint(equalTo: senderLabel.bottomAnchor, constant: 2),
            textLabel.leadingAnchor.constraint(equalTo: bubbleView.leadingAnchor, constant: 12),
            textLabel.trailingAnchor.constraint(equalTo: bubbleView.trailingAnchor, constant: -12),

            deliveryIndicator.topAnchor.constraint(
                greaterThanOrEqualTo: textLabel.bottomAnchor, constant: 2
            ),
            deliveryIndicator.trailingAnchor.constraint(
                equalTo: bubbleView.trailingAnchor, constant: -10
            ),
            deliveryIndicator.bottomAnchor.constraint(
                equalTo: bubbleView.bottomAnchor, constant: -6
            )
        ])
    }

    func configure(with record: MessageRecord, isMe: Bool) {
        currentRecord = record
        textLabel.text = record.content
        senderLabel.text = isMe ? nil : record.senderName
        senderLabel.textColor = UIColor(hex: record.senderColor ?? "#6366F1") ?? .label
        senderLabel.isHidden = isMe
        // When the sender label is hidden we must collapse the gap so the
        // text isn't pushed down by an invisible baseline. The subsequent
        // setNeedsLayout below recomputes the bubble's intrinsic height.
        senderLabel.attributedText = senderLabel.isHidden
            ? NSAttributedString(string: "")
            : NSAttributedString(string: record.senderName ?? "")

        bubbleView.backgroundColor = isMe
            ? UIColor(named: "BubbleOutgoing") ?? UIColor.systemBlue.withAlphaComponent(0.22)
            : UIColor(named: "BubbleIncoming") ?? UIColor.secondarySystemBackground

        deliveryIndicator.configure(
            state: record.state, timestamp: record.createdAt, isFromCurrentUser: isMe)

        // Side alignment: outgoing pinned to trailing, incoming to leading.
        // Toggle the two opposing required-priority constraints so AutoLayout
        // resolves the bubble's horizontal position deterministically.
        if isMe {
            leadingConstraint.isActive = false
            trailingConstraint.isActive = true
        } else {
            trailingConstraint.isActive = false
            leadingConstraint.isActive = true
        }

        setNeedsLayout()
    }

    override func preferredLayoutAttributesFitting(
        _ layoutAttributes: UICollectionViewLayoutAttributes
    ) -> UICollectionViewLayoutAttributes {
        // Let AutoLayout resolve the height from the textLabel's wrap. A
        // cached height (when present) wins to avoid layout passes during
        // fast scroll, but defaulting to the system fitting size lets the
        // first display work correctly without a precomputed cache.
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

// MARK: - UIColor hex init

private extension UIColor {
    convenience init?(hex: String) {
        var hexSanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        hexSanitized = hexSanitized.replacingOccurrences(of: "#", with: "")
        guard hexSanitized.count == 6, let rgb = UInt64(hexSanitized, radix: 16) else { return nil }
        self.init(
            red: CGFloat((rgb >> 16) & 0xFF) / 255.0,
            green: CGFloat((rgb >> 8) & 0xFF) / 255.0,
            blue: CGFloat(rgb & 0xFF) / 255.0,
            alpha: 1.0
        )
    }
}
