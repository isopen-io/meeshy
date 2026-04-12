import SwiftUI
import Combine
import MeeshySDK

public struct EmptyStateView: View {
    public let icon: String
    public let title: String
    public let subtitle: String
    public let actionLabel: String?
    public let accentColor: String
    public let compact: Bool
    public var onAction: (() -> Void)?

    @ObservedObject private var theme = ThemeManager.shared
    @State private var appeared = false

    public init(
        icon: String,
        title: String,
        subtitle: String,
        actionLabel: String? = nil,
        accentColor: String = "4ECDC4",
        compact: Bool = false,
        onAction: (() -> Void)? = nil
    ) {
        self.icon = icon
        self.title = title
        self.subtitle = subtitle
        self.actionLabel = actionLabel
        self.accentColor = accentColor
        self.compact = compact
        self.onAction = onAction
    }

    public var body: some View {
        VStack(spacing: compact ? 10 : 16) {
            Spacer()

            Image(systemName: icon)
                .font(.system(size: compact ? 36 : 52, weight: .light))
                .foregroundColor(Color(hex: accentColor).opacity(0.4))
                .padding(.bottom, compact ? 0 : 4)

            if let actionLabel, let onAction, compact {
                actionButton(label: actionLabel, action: onAction)
            }

            Text(title)
                .font(.system(size: compact ? 15 : 18, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .multilineTextAlignment(.center)

            if !subtitle.isEmpty {
                Text(subtitle)
                    .font(.system(size: compact ? 12 : 14))
                    .foregroundColor(theme.textMuted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }

            if let actionLabel, let onAction, !compact {
                actionButton(label: actionLabel, action: onAction)
                    .padding(.top, 4)
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .opacity(appeared ? 1 : 0)
        .offset(y: appeared ? 0 : 12)
        .onAppear {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.15)) {
                appeared = true
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title). \(subtitle)")
    }

    private func actionButton(label: String, action: @escaping () -> Void) -> some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            Text(label)
                .font(.system(size: compact ? 13 : 14, weight: .semibold))
                .foregroundColor(.white)
                .padding(.horizontal, compact ? 16 : 24)
                .padding(.vertical, compact ? 8 : 10)
                .background(
                    Capsule()
                        .fill(Color(hex: accentColor))
                )
        }
    }
}
