import UIKit
import MeeshySDK

final class DeliveryIndicatorView: UIView {
    private let timestampLabel = UILabel()
    private let iconView = UIImageView()

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupViews()
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setupViews() {
        let stack = UIStackView(arrangedSubviews: [timestampLabel, iconView])
        stack.axis = .horizontal
        stack.spacing = 4
        stack.alignment = .center
        addSubview(stack)
        stack.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor)
        ])

        timestampLabel.font = .systemFont(ofSize: 11)
        timestampLabel.textColor = .secondaryLabel

        iconView.contentMode = .scaleAspectFit
        iconView.preferredSymbolConfiguration = UIImage.SymbolConfiguration(pointSize: 10)
        NSLayoutConstraint.activate([
            iconView.widthAnchor.constraint(equalToConstant: 16),
            iconView.heightAnchor.constraint(equalToConstant: 12)
        ])
    }

    func configure(state: MessageState, timestamp: Date, isFromCurrentUser: Bool) {
        timestampLabel.text = Self.timeFormatter.string(from: timestamp)

        guard isFromCurrentUser else {
            iconView.isHidden = true
            return
        }
        iconView.isHidden = false

        let (image, color) = iconConfig(for: state)
        UIView.transition(with: iconView, duration: 0.25, options: .transitionCrossDissolve) {
            self.iconView.image = image
            self.iconView.tintColor = color
        }
    }

    private func iconConfig(for state: MessageState) -> (UIImage?, UIColor) {
        switch state {
        case .sending, .queued, .draft:
            return (UIImage(systemName: "clock"), .secondaryLabel)
        case .sent:
            return (UIImage(systemName: "checkmark"), .secondaryLabel)
        case .delivered:
            return (UIImage(systemName: "checkmark")?.withConfiguration(
                UIImage.SymbolConfiguration(paletteColors: [.secondaryLabel])), .secondaryLabel)
        case .read:
            return (UIImage(systemName: "checkmark")?.withConfiguration(
                UIImage.SymbolConfiguration(paletteColors: [.systemBlue])), .systemBlue)
        case .failed:
            return (UIImage(systemName: "exclamationmark.circle"), .systemRed)
        }
    }

    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f
    }()
}
