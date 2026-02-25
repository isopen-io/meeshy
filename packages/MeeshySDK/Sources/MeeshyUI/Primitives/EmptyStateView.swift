import SwiftUI

public struct EmptyStateView: View {
    public let icon: String
    public let title: String
    public let subtitle: String
    public var actionTitle: String? = nil
    public var action: (() -> Void)? = nil

    @ObservedObject private var theme = ThemeManager.shared

    public init(icon: String, title: String, subtitle: String, actionTitle: String? = nil, action: (() -> Void)? = nil) {
        self.icon = icon
        self.title = title
        self.subtitle = subtitle
        self.actionTitle = actionTitle
        self.action = action
    }

    public var body: some View {
        VStack(spacing: 16) {
            Spacer()

            Image(systemName: icon)
                .font(.system(size: 48, weight: .light))
                .foregroundStyle(
                    LinearGradient(
                        colors: [Color(hex: "FF2E63"), Color(hex: "A855F7")],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .opacity(0.6)

            Text(title)
                .font(.system(size: 18, weight: .semibold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            Text(subtitle)
                .font(.system(size: 14, weight: .regular, design: .rounded))
                .foregroundColor(theme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            if let actionTitle, let action {
                Button(action: action) {
                    Text(actionTitle)
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .foregroundColor(.white)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 10)
                        .background(
                            LinearGradient(
                                colors: [Color(hex: "FF2E63"), Color(hex: "A855F7")],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .clipShape(Capsule())
                }
                .padding(.top, 4)
            }

            Spacer()
        }
        .frame(maxWidth: .infinity)
    }
}
