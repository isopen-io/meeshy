import SwiftUI
import MeeshySDK

public struct EmptyStateView: View {
    public let icon: String
    public let title: String
    public let subtitle: String
    public let actionLabel: String?
    public let accentColor: String
    public var onAction: (() -> Void)?

    @ObservedObject private var theme = ThemeManager.shared

    public init(
        icon: String,
        title: String,
        subtitle: String,
        actionLabel: String? = nil,
        accentColor: String = "4ECDC4",
        onAction: (() -> Void)? = nil
    ) {
        self.icon = icon
        self.title = title
        self.subtitle = subtitle
        self.actionLabel = actionLabel
        self.accentColor = accentColor
        self.onAction = onAction
    }

    public var body: some View {
        VStack(spacing: 16) {
            Spacer()

            Image(systemName: icon)
                .font(.system(size: 52, weight: .light))
                .foregroundColor(Color(hex: accentColor).opacity(0.4))
                .padding(.bottom, 4)

            Text(title)
                .font(.system(size: 18, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .multilineTextAlignment(.center)

            Text(subtitle)
                .font(.system(size: 14))
                .foregroundColor(theme.textMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            if let actionLabel, let onAction {
                Button {
                    HapticFeedback.light()
                    onAction()
                } label: {
                    Text(actionLabel)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 10)
                        .background(
                            Capsule()
                                .fill(Color(hex: accentColor))
                        )
                }
                .padding(.top, 4)
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title). \(subtitle)")
    }
}
