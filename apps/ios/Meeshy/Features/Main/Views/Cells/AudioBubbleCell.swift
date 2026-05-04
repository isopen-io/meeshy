import UIKit
import MeeshySDK

final class AudioBubbleCell: UICollectionViewCell {
    private let bubbleView = UIView()
    private let playButton = UIButton()
    private let waveformView = UIView()
    private let durationLabel = UILabel()
    private let deliveryIndicator = DeliveryIndicatorView()
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

        playButton.setImage(UIImage(systemName: "play.fill"), for: .normal)
        bubbleView.addSubview(playButton)
        playButton.translatesAutoresizingMaskIntoConstraints = false

        waveformView.backgroundColor = .systemGray4
        waveformView.layer.cornerRadius = 2
        bubbleView.addSubview(waveformView)
        waveformView.translatesAutoresizingMaskIntoConstraints = false

        durationLabel.font = .monospacedDigitSystemFont(ofSize: 12, weight: .regular)
        durationLabel.textColor = .secondaryLabel
        bubbleView.addSubview(durationLabel)
        durationLabel.translatesAutoresizingMaskIntoConstraints = false

        bubbleView.addSubview(deliveryIndicator)
        deliveryIndicator.translatesAutoresizingMaskIntoConstraints = false
    }

    func configure(with record: MessageRecord, isMe: Bool) {
        currentRecord = record
        bubbleView.backgroundColor = isMe
            ? UIColor(named: "BubbleOutgoing") ?? .systemBlue.withAlphaComponent(0.15)
            : UIColor(named: "BubbleIncoming") ?? .secondarySystemBackground
        deliveryIndicator.configure(
            state: record.state, timestamp: record.createdAt, isFromCurrentUser: isMe)
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        currentRecord = nil
    }
}
