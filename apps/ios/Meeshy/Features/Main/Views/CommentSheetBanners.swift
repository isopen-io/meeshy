import SwiftUI
import MeeshySDK
import MeeshyUI

/// Bandeau au-dessus du composer pendant une édition — sortie possible
/// par la croix (le composer revient en mode création, texte effacé).
struct CommentEditingBanner: View {
    let accentColor: String
    let onCancel: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: "pencil")
                .font(MeeshyFont.relative(MeeshyIconSize.xs))
                .foregroundColor(Color(hex: accentColor))
            Text(String(localized: "feed.comments.editing", defaultValue: "Modification du commentaire", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                .foregroundStyle(theme.textSecondary)
            Spacer()
            Button {
                onCancel()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(MeeshyFont.relative(MeeshyIconSize.sm))
                    .foregroundStyle(theme.textMuted)
            }
            .accessibilityLabel(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main))
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.xsPlus)
        .background(theme.inputBackground.opacity(0.6))
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}

/// Bandeau « en réponse à » du composer de commentaire.
struct CommentReplyBanner: View {
    let reply: FeedComment
    let accentColor: String
    let onCancel: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            RoundedRectangle(cornerRadius: 2)
                .fill(Color(hex: reply.authorColor))
                .frame(width: 3, height: 36)

            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(reply.author)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                    .foregroundColor(Color(hex: reply.authorColor))

                MessageTextRenderer.render(
                    reply.displayContent,
                    fontSize: 12,
                    color: theme.textSecondary,
                    mentionColor: MeeshyColors.mentionColor(isDark: isDark),
                    hashtagColor: MeeshyColors.hashtagColor(isDark: isDark),
                    accentColor: Color(hex: reply.authorColor),
                    usesRelativeFont: true, trackedLinks: reply.trackedLinkMap
                )
                    .tint(Color(hex: reply.authorColor))
                    .lineLimit(1)
            }

            Spacer()

            Button {
                onCancel()
            } label: {
                // Figé : chrome xmark dans un cadre tap fixe 24×24 (doctrine 82i).
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(theme.textMuted)
                    .frame(width: 24, height: 24)
                    .background(Circle().fill(isDark ? Color.white.opacity(0.1) : Color.black.opacity(0.05)))
            }
            .accessibilityLabel(String(localized: "a11y.comment.cancel_reply", defaultValue: "Annuler la réponse", bundle: .main))
            .meeshyTapTarget(MeeshyControlSize.tapTarget)
        }
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.vertical, MeeshySpacing.sm)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.md)
                        .stroke(theme.border(tint: accentColor, intensity: 0.3), lineWidth: 1)
                )
        )
    }
}
