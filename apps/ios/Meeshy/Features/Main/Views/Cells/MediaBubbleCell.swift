import UIKit
import MeeshySDK

final class MediaBubbleCell: UICollectionViewCell {
    private let imageView = UIImageView()
    private let deliveryIndicator = DeliveryIndicatorView()
    private let durationLabel = UILabel()
    private var currentRecord: MessageRecord?
    private var loadTask: Task<Void, Never>?

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupViews()
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setupViews() {
        imageView.contentMode = .scaleAspectFill
        imageView.clipsToBounds = true
        imageView.layer.cornerRadius = 16
        imageView.backgroundColor = .systemGray5
        contentView.addSubview(imageView)
        imageView.translatesAutoresizingMaskIntoConstraints = false

        contentView.addSubview(deliveryIndicator)
        deliveryIndicator.translatesAutoresizingMaskIntoConstraints = false

        durationLabel.font = .monospacedDigitSystemFont(ofSize: 12, weight: .medium)
        durationLabel.textColor = .white
        durationLabel.isHidden = true
        contentView.addSubview(durationLabel)
        durationLabel.translatesAutoresizingMaskIntoConstraints = false
    }

    func configure(with record: MessageRecord, isMe: Bool, imageCache: DecodedImageCache) {
        currentRecord = record

        deliveryIndicator.configure(
            state: record.state, timestamp: record.createdAt, isFromCurrentUser: isMe)

        durationLabel.isHidden = record.messageType != "video"

        if let cached = imageCache.get(record.localId) {
            imageView.image = UIImage(cgImage: cached)
        } else {
            imageView.image = nil
            imageView.backgroundColor = .systemGray5
            loadTask = Task { [weak self] in
                let decoded = await ThumbnailPrefetcher.shared.get(key: record.localId)
                guard !Task.isCancelled, let decoded else { return }
                await MainActor.run {
                    self?.imageView.image = UIImage(cgImage: decoded)
                }
            }
        }
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
        loadTask?.cancel()
        loadTask = nil
        currentRecord = nil
        imageView.image = nil
        imageView.backgroundColor = .systemGray5
    }
}
