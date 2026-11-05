import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La carte de la publication citée, posée sur la scène du compositeur.**
///
/// Figée : elle ne reçoit aucun toucher (le fond de la scène reste à l'auteur)
/// et VoiceOver la lit d'un seul tenant. Même anatomie que la citation du fil
/// (`FeedPostCard.repostView`) — auteur, moment, texte, premier média — pour
/// que l'auteur reconnaisse ce qu'il cite.
struct ComposerQuotedPublicationCard: View {
    let quoted: ComposerQuotedPublication

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            HStack(spacing: MeeshySpacing.sm) {
                MeeshyAvatar(
                    name: quoted.author,
                    context: .postComment,
                    accentColor: quoted.authorColor,
                    avatarURL: quoted.authorAvatarURL,
                    ring: quoted.authorRing
                )
                Text(quoted.author)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                    .foregroundStyle(Color.white)
                    .lineLimit(1)
                MetaSeparator().foregroundStyle(Color.white.opacity(0.6))
                Text(RelativeTimeFormatter.shortString(for: quoted.timestamp))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                    .foregroundStyle(Color.white.opacity(0.7))
            }
            if !quoted.text.isEmpty || quoted.moodEmoji != nil {
                HStack(alignment: .firstTextBaseline, spacing: MeeshySpacing.xsPlus) {
                    if let mood = quoted.moodEmoji { Text(mood) }
                    Text(quoted.text)
                        .font(MeeshyFont.relative(MeeshyFont.labelSize))
                        .foregroundStyle(Color.white.opacity(0.9))
                        .lineLimit(6)
                }
            }
            if let media = quoted.primaryMedia {
                ZStack(alignment: .bottomTrailing) {
                    FeedMediaTile(media: media)
                        .frame(maxWidth: .infinity)
                        .frame(height: 140)
                        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm))
                    if quoted.mediaCount > 1 {
                        Text("+\(quoted.mediaCount - 1)")
                            .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .bold))
                            .foregroundStyle(Color.white)
                            .padding(.horizontal, MeeshySpacing.xsPlus)
                            .padding(.vertical, MeeshySpacing.xxs)
                            .background(Capsule().fill(Color.black.opacity(0.6)))
                            .padding(MeeshySpacing.sm)
                    }
                }
            }
        }
        .padding(MeeshySpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                .fill(Color.black.opacity(0.55))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.md)
                        .stroke(Color(hex: quoted.authorColor).opacity(0.6), lineWidth: 1)
                )
        )
        .allowsHitTesting(false)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "feed.post.original.label",
                                   defaultValue: "Publication originale de \(quoted.author)", bundle: .main))
        .accessibilityValue(quoted.text)
    }
}

/// **Ce que la scène rappelle sans le porter** : l'invite d'une scène vide et
/// la publication citée, posées sur le 9:16 sans recevoir aucun toucher.
struct ComposerSceneHints: View {
    let quickCapture: ComposerSceneQuickCapture.Hint?
    let quoted: ComposerQuotedPublication?
    let aspectRatio: CGFloat

    var body: some View {
        ZStack {
            if let quickCapture { ComposerSceneQuickCaptureHint(hint: quickCapture) }
            if let quoted {
                Color.clear
                    .aspectRatio(aspectRatio, contentMode: .fit)
                    .overlay { ComposerQuotedPublicationCard(quoted: quoted).padding(MeeshySpacing.lg) }
                    .allowsHitTesting(false)
            }
        }
    }
}
