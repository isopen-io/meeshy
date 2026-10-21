import SwiftUI
import MeeshySDK
import MeeshyUI

/// L'aperçu du post cité, posé sous le champ de `FeedComposerSheet` quand la
/// feuille compose une citation. Il ne lit que le post qu'on lui remet.
struct FeedComposerQuotedPostPreview: View {
    let quoted: FeedPost

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            HStack(spacing: MeeshySpacing.sm) {
                LivePresence { MeeshyAvatar(
                    name: quoted.author,
                    context: .postComment,
                    accentColor: quoted.authorColor,
                    avatarURL: quoted.authorAvatarURL,
                    presenceState: PresenceManager.shared.knownPresenceState(for: quoted.authorId),
                    ring: quoted.authorRing
                ) }
                Text(quoted.author)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                    .foregroundColor(theme.accentText(quoted.authorColor))
                MetaSeparator().foregroundColor(theme.textMuted)
                Text(quoted.timestamp, style: .relative)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                    .foregroundColor(theme.textMuted)
            }
            Text(quoted.displayContent)
                .font(MeeshyFont.relative(MeeshyFont.labelSize))
                .foregroundColor(theme.textSecondary)
                .lineLimit(4)
        }
        .padding(MeeshySpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                .fill(theme.surfaceGradient(tint: quoted.authorColor))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                        .stroke(theme.border(tint: quoted.authorColor, intensity: 0.2), lineWidth: 1)
                )
        )
        .padding(.horizontal, MeeshySpacing.lg)
    }
}
