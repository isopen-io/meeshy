import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le contenu de la carte (contrat § 4) : le bloc média, puis la ligne
/// d'auteur, le texte servi par le Prisme et la ligne de statistiques. Feuille
/// `Equatable` : elle ne se réévalue que si la carte change.
struct ContentLinkCardBody: View, Equatable {
    let card: ContentCard
    let accentColor: String
    let isDark: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let media = card.media {
                ContentLinkCardMedia(media: media, kind: card.kind, extraCount: card.extraMediaCount, accentColor: accentColor)
                    .equatable()
            }
            VStack(alignment: .leading, spacing: MeeshySpacing.xsPlus) {
                ContentLinkCardAuthorLine(card: card, accentColor: accentColor, isDark: isDark)
                ContentLinkCardText(emoji: card.moodEmoji, text: card.text, lineLimit: card.media == nil ? 3 : 2, isDark: isDark)
                ContentLinkCardStats(stats: card.stats, isBookmarkedByMe: card.isBookmarkedByMe, isDark: isDark)
                    .equatable()
            }
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, MeeshySpacing.smPlus)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .modifier(ContentLinkCardSurface(isDark: isDark))
    }
}

// MARK: - Ligne d'auteur

/// Avatar, nom affiché (sinon `@pseudo`) et date relative ; sans bloc média,
/// la pastille du type ouvre la ligne.
struct ContentLinkCardAuthorLine: View {
    let card: ContentCard
    let accentColor: String
    let isDark: Bool

    var body: some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            if card.media == nil {
                ContentLinkCardKindPill(kind: card.kind, accentColor: accentColor, onMedia: false)
            }
            MeeshyAvatar(name: card.author.name, context: .custom(ContentLinkCardLayout.avatarSide),
                         avatarURL: card.author.avatarURL, isDark: isDark)
                .accessibilityHidden(true)
            Text(card.author.name)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                .foregroundStyle(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950)
                .lineLimit(1)
            MetaSeparator()
            Text(RelativeTimeFormatter.shortString(for: card.createdAt))
                .lineLimit(1)
                .fixedSize()
        }
        .font(MeeshyFont.relative(MeeshyFont.smallSize))
        .foregroundStyle(isDark ? MeeshyColors.indigo300 : MeeshyColors.neutral500)
    }
}

// MARK: - Texte (et émoji d'une humeur)

struct ContentLinkCardText: View {
    let emoji: String?
    let text: String?
    let lineLimit: Int
    let isDark: Bool

    var body: some View {
        if emoji != nil || text != nil {
            HStack(alignment: .top, spacing: MeeshySpacing.sm) {
                if let emoji {
                    Text(verbatim: emoji)
                        .font(MeeshyFont.relative(MeeshyFont.displaySize))
                }
                if let text {
                    Text(text)
                        .font(MeeshyFont.relative(MeeshyFont.labelSize))
                        .foregroundStyle(isDark ? MeeshyColors.indigo100 : MeeshyColors.indigo950)
                        .lineLimit(lineLimit)
                        .truncationMode(.tail)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

// MARK: - Pastille du type

/// Icône et mot du type — ceux du reste de l'app (`PostType.icon`,
/// « Publication », « Réel », « Story », « Humeur »).
struct ContentLinkCardKindPill: View {
    let kind: PostType
    let accentColor: String
    let onMedia: Bool

    var body: some View {
        HStack(spacing: MeeshySpacing.xxs) {
            Image(systemName: kind.icon)
            Text(ContentLinkCardCopy.kind(kind))
                .lineLimit(1)
        }
        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
        .foregroundStyle(onMedia ? Color.white : Color(hex: accentColor))
        .padding(.horizontal, MeeshySpacing.xsPlus)
        .padding(.vertical, MeeshySpacing.xxs)
        .background(Capsule().fill(onMedia ? Color.black.opacity(MeeshyOpacity.strong) : Color(hex: accentColor).opacity(MeeshyOpacity.light)))
        .fixedSize()
        .accessibilityHidden(true)
    }
}

// MARK: - Statistiques

/// 👁 vues (toujours) · ♥ j'aime (si > 0) · 💬 commentaires (si > 0) · 🔖 favoris
/// (toujours, PLEIN quand le lecteur l'a enregistré) — les icônes de la carte
/// de post, les chiffres abrégés de `CompactCountLabel`.
struct ContentLinkCardStats: View, Equatable {
    let stats: ContentCard.Stats
    let isBookmarkedByMe: Bool
    let isDark: Bool

    var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            metric("eye.fill", stats.views)
            if stats.likes > 0 { metric("heart.fill", stats.likes) }
            if stats.comments > 0 { metric("bubble.right", stats.comments) }
            metric(isBookmarkedByMe ? "bookmark.fill" : "bookmark", stats.bookmarks)
                .foregroundStyle(isBookmarkedByMe ? MeeshyColors.warning : secondary)
        }
        .font(.caption2.weight(.medium))
        .foregroundStyle(secondary)
        .accessibilityHidden(true)
    }

    private var secondary: Color {
        isDark ? MeeshyColors.indigo300 : MeeshyColors.neutral500
    }

    private func metric(_ icon: String, _ count: Int) -> some View {
        HStack(spacing: MeeshySpacing.xxs) {
            Image(systemName: icon)
            Text(verbatim: CompactCountLabel.text(count))
        }
    }
}
