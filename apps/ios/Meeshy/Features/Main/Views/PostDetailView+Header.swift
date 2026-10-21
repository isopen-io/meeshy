import SwiftUI
import MeeshySDK
import MeeshyUI

/// **L'en-tête flottant du détail d'un post** — la puce de l'auteur révélée
/// au défilement, et le `CollapsibleHeader` qui la porte. Extrait de
/// `PostDetailView.swift` (#10956), hors budget : le menu « … » reste chez
/// l'hôte, où ses gardes de libellés le lisent.
extension PostDetailView {

    // MARK: - Floating Header (CollapsibleHeader)

    /// Centered author chip revealed in the floating header as the inline
    /// author block scrolls away. Tapping opens the profile sheet (mirrors the
    /// inline name tap).
    @ViewBuilder
    private func authorRevealView(_ post: FeedPost) -> some View {
        HStack(spacing: MeeshySpacing.sm) {
            Button {
                selectedProfileUser = .from(feedPost: post)
            } label: {
                HStack(spacing: MeeshySpacing.sm) {
                    LivePresence { MeeshyAvatar(
                        name: post.author,
                        context: .custom(26),
                        accentColor: post.authorColor,
                        avatarURL: post.authorAvatarURL,
                        presenceState: PresenceManager.shared.knownPresenceState(for: post.authorId),
                        ring: post.authorRing
                    ) }
                    .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(post.author)
                            .font(.subheadline.weight(.bold))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(1)
                        let reach = PostReachFormatter.components(
                            username: post.authorUsername,
                            isAuthor: isPostAuthor
                        )
                        if reach.pseudo != nil || reach.showsStats {
                            HStack(spacing: MeeshySpacing.xs) {
                                if let pseudo = reach.pseudo {
                                    Text(pseudo)
                                        .font(.caption2)
                                        .foregroundColor(theme.textMuted)
                                        .lineLimit(1)
                                        .truncationMode(.tail)
                                        .layoutPriority(0)
                                }
                                if reach.showsStats {
                                    if reach.pseudo != nil {
                                        MetaSeparator().font(.caption2).foregroundColor(theme.textMuted)
                                    }
                                    HStack(spacing: MeeshySpacing.xxs) {
                                        ReachMetricLabel(
                                            icon: "eye.fill",
                                            count: post.viewCount,
                                            label: String(localized: "feed.reel.views", defaultValue: "Vues", bundle: .main),
                                            tint: theme.textMuted
                                        )
                                        MetaSeparator().font(.caption2).foregroundColor(theme.textMuted)
                                        ReachMetricLabel(
                                            icon: "chart.bar.fill",
                                            count: post.impressionCount,
                                            label: String(localized: "feed.reel.impressions", defaultValue: "Impressions", bundle: .main),
                                            tint: theme.textMuted
                                        )
                                    }
                                    // Stats must always print in full (up to "2.3M") —
                                    // they're the values the user cross-checks against the
                                    // inline reach line. Pin their size + priority so the
                                    // @pseudo yields/truncates first; never clip a number.
                                    .lineLimit(1)
                                    .fixedSize(horizontal: true, vertical: false)
                                    .layoutPriority(1)
                                }
                            }
                        }
                    }
                }
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(String(format: String(localized: "a11y.post.author_profile", defaultValue: "Profil de %@", bundle: .main), post.author))
            .accessibilityHint(String(localized: "a11y.post.author_profile.hint", defaultValue: "Ouvre le profil de l'auteur", bundle: .main))
        }
    }

    func postDetailHeader(_ post: FeedPost) -> some View {
        // Seul ce reader se re-rend au fil du scroll — la racine écrit
        // `headerScrollRelay.offset` sans s'y abonner (P1-1).
        ScrollOffsetReader(relay: headerScrollRelay) { offset in
            CollapsibleHeader(
                title: "",
                scrollOffset: offset,
                showBackButton: true,
                onBack: { HapticFeedback.light(); router.pop() },
                titleColor: theme.textPrimary,
                backArrowColor: theme.textPrimary,
                backgroundColor: theme.backgroundPrimary,
                centerReveal: { authorRevealView(post) },
                trailing: { postMenu }
            )
        }
    }
}
