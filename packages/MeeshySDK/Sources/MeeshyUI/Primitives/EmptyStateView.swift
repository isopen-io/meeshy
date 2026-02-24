import SwiftUI

public struct EmptyStateView: View {
    let icon: String
    let title: String
    let subtitle: String
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil

    @State private var appeared = false

    public init(
        icon: String,
        title: String,
        subtitle: String,
        actionTitle: String? = nil,
        action: (() -> Void)? = nil
    ) {
        self.icon = icon
        self.title = title
        self.subtitle = subtitle
        self.actionTitle = actionTitle
        self.action = action
    }

    public var body: some View {
        VStack(spacing: MeeshySpacing.lg) {
            Image(systemName: icon)
                .font(.system(size: 48, weight: .light))
                .foregroundStyle(MeeshyColors.cyan.opacity(0.5))
                .padding(.bottom, MeeshySpacing.sm)

            Text(title)
                .font(.system(size: MeeshyFont.headlineSize, weight: .semibold))
                .foregroundColor(ThemeManager.shared.textPrimary)
                .multilineTextAlignment(.center)

            Text(subtitle)
                .font(.system(size: MeeshyFont.subheadSize, weight: .regular))
                .foregroundColor(ThemeManager.shared.textMuted)
                .multilineTextAlignment(.center)
                .lineLimit(3)

            if let actionTitle, let action {
                Button(action: action) {
                    Text(actionTitle)
                        .font(.system(size: MeeshyFont.subheadSize, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, MeeshySpacing.xxl)
                        .padding(.vertical, MeeshySpacing.md)
                        .background(
                            Capsule()
                                .fill(MeeshyColors.cyan)
                        )
                        .shadow(color: MeeshyColors.cyan.opacity(0.3), radius: 8, y: 4)
                }
                .padding(.top, MeeshySpacing.sm)
            }
        }
        .padding(.horizontal, MeeshySpacing.xxxl)
        .frame(maxWidth: .infinity)
        .opacity(appeared ? 1 : 0)
        .offset(y: appeared ? 0 : 12)
        .onAppear {
            withAnimation(MeeshyAnimation.springDefault.delay(0.15)) {
                appeared = true
            }
        }
    }
}
