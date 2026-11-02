import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Une rangée de résultat de recherche de POST, RÉEL ou STORY (#14620)

struct PostSearchResultRow: View, Equatable {
    let result: GlobalSearchPostResult
    let highlightedQuery: String
    let isDark: Bool

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.result.id == rhs.result.id && lhs.result.text == rhs.result.text
            && lhs.highlightedQuery == rhs.highlightedQuery && lhs.isDark == rhs.isDark
    }

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        HStack(alignment: .top, spacing: MeeshySpacing.md) {
            MeeshyAvatar(name: result.authorName, context: .userListItem, avatarURL: result.authorAvatar, ring: result.post.authorRing)

            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                HStack(spacing: MeeshySpacing.xs) {
                    Text(result.authorName)
                        .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .bold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)

                    Spacer(minLength: MeeshySpacing.xs)

                    Text(RelativeTimeFormatter.shortString(for: result.createdAt))
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                        .foregroundColor(theme.textMuted)
                }

                Label(result.kind.displayName, systemImage: result.kind.icon)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                    .foregroundColor(MeeshyColors.indigo300)
                    .lineLimit(1)

                if !result.text.isEmpty {
                    Text(MessageSearchResultRow.highlighted(result.text, query: highlightedQuery))
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(2)
                }
            }

            if let thumbnail = result.thumbnailURL {
                CachedAsyncImage(url: thumbnail, targetSize: CGSize(width: 52, height: 52)) {
                    RoundedRectangle(cornerRadius: MeeshyRadius.sm).fill(theme.inputBorder)
                }
                .frame(width: 52, height: 52)
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm))
                .accessibilityHidden(true)
            }
        }
        .padding(MeeshySpacing.md)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.md)
                        .stroke(theme.inputBorder, lineWidth: MeeshyBorder.hairline)
                )
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(result.kind.displayName), \(result.authorName), \(result.text), \(RelativeTimeFormatter.shortString(for: result.createdAt))")
        .accessibilityHint(String(localized: "search.posts.opens", defaultValue: "Ouvre le contenu"))
        .accessibilityAddTraits(.isButton)
    }
}
