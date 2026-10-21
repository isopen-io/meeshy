import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - ConversationDashboardSectionCard

/// Le conteneur commun des sections du tableau de bord : carte translucide à
/// liseré dégradé teinté de l'accent de la conversation.
struct ConversationDashboardSectionCard<Content: View>: View {
    let accent: Color
    private let content: Content

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    init(accent: Color, @ViewBuilder content: () -> Content) {
        self.accent = accent
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.mdPlus) {
            content
        }
        .padding(MeeshySpacing.lg)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                .fill(isDark ? Color.white.opacity(0.035) : Color.white.opacity(MeeshyOpacity.intense))
        )
        .overlay(
            RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                .strokeBorder(
                    LinearGradient(
                        colors: [accent.opacity(MeeshyOpacity.light), accent.opacity(MeeshyOpacity.faint)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1
                )
        )
    }
}

// MARK: - ConversationDashboardSectionHeader

struct ConversationDashboardSectionHeader: View {
    let icon: String
    let title: String
    let accent: Color

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                .foregroundColor(accent)
            Text(title.uppercased())
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .heavy, design: .rounded))
                .foregroundColor(theme.textMuted)
                .tracking(1.5)
        }
    }
}
