import SwiftUI
import MeeshySDK
import MeeshyUI

/// Détail des réactions d'un message (groupes + filtre par emoji + liste
/// des utilisateurs). État réseau 100 % encapsulé — extrait de l'ancien
/// `MessageDetailSheet.reactionsTabContent`. Aucun changement de comportement.
struct MessageReactionsDetailView: View {
    let message: Message
    let contactColor: String
    let conversationId: String

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    @State private var reactionGroups: [ReactionGroup] = []
    @State private var isLoadingReactions = false
    @State private var reactionFilter: String = "all"

    var body: some View {
        VStack(spacing: 12) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    reactionFilterCapsule(
                        label: String(localized: "message-detail.reactions.all", defaultValue: "Toutes", bundle: .main),
                        count: reactionGroups.reduce(0) { $0 + $1.count },
                        isSelected: reactionFilter == "all"
                    ) {
                        reactionFilter = "all"
                    }
                    ForEach(reactionGroups) { group in
                        reactionFilterCapsule(
                            label: group.emoji,
                            count: group.count,
                            isSelected: reactionFilter == group.emoji
                        ) {
                            reactionFilter = group.emoji
                        }
                    }
                }
            }

            if isLoadingReactions {
                ProgressView()
                    .tint(Color(hex: contactColor))
                    .padding(.vertical, 20)
            } else if reactionGroups.isEmpty {
                // Gate on `reactionGroups`, not `filteredReactionUsers`: every
                // filter capsule is generated FROM `reactionGroups`, so once
                // groups are seeded (see `loadReactionDetails`) selecting any
                // capsule always yields ≥1 row — `filteredReactionUsers` only
                // goes empty in lockstep with `reactionGroups`.
                emptyReactionsView
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(filteredReactionUsers) { item in
                        reactionUserRow(item)
                    }
                }
            }
        }
        .onAppear { Task { await loadReactionDetails() } }
    }

    private var filteredReactionUsers: [ReactionUserItem] {
        var items: [ReactionUserItem] = []
        for group in reactionGroups {
            if reactionFilter == "all" || reactionFilter == group.emoji {
                for user in group.users {
                    items.append(ReactionUserItem(
                        userId: user.userId,
                        username: user.username,
                        avatar: user.avatar,
                        emoji: group.emoji,
                        createdAt: user.createdAt
                    ))
                }
            }
        }
        return items.sorted { $0.createdAt > $1.createdAt }
    }

    private func reactionFilterCapsule(label: String, count: Int, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) { action() }
            HapticFeedback.light()
        } label: {
            HStack(spacing: 4) {
                Text(label)
                    .font(.subheadline.weight(.medium))
                Text("\(count)")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(isSelected ? Color(hex: contactColor) : theme.textMuted)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(
                Capsule()
                    .fill(isSelected
                          ? Color(hex: contactColor).opacity(0.15)
                          : isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04))
            )
            .foregroundColor(isSelected ? Color(hex: contactColor) : theme.textSecondary)
        }
        // Selected filter is otherwise signalled by color alone — expose it to
        // VoiceOver via the trait so the active emoji filter is not lost to
        // non-sighted users (HIG: never rely on color to convey state).
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }

    private func reactionUserRow(_ item: ReactionUserItem) -> some View {
        HStack(spacing: 10) {
            MeeshyAvatar(
                name: item.username,
                context: .userListItem,
                accentColor: contactColor,
                avatarURL: item.avatar
            )
            // Avatar duplicates the username text below — hide it so the
            // combined row reads once (name, emoji, when) instead of twice.
            .accessibilityHidden(true)

            Text(item.username)
                .font(.subheadline.weight(.medium))
                .foregroundColor(theme.textPrimary)

            if reactionFilter == "all" {
                Text(item.emoji)
                    .font(.title3)
            }

            Spacer()

            Text(relativeDate(item.createdAt))
                .font(.caption2)
                .foregroundColor(theme.textMuted)
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 4)
        // Group avatar + name + emoji + timestamp into one VoiceOver stop
        // ("Alice, 😀, il y a 2 h") rather than four separate swipes.
        .accessibilityElement(children: .combine)
    }

    private var emptyReactionsView: some View {
        VStack(spacing: 8) {
            Image(systemName: "face.smiling")
                .font(.system(size: 28, weight: .light)) // decorative empty-state glyph (parity with MessageViewsDetailView)
                .foregroundColor(theme.textMuted.opacity(0.4))
                .accessibilityHidden(true)
            Text(String(localized: "message-detail.reactions.empty", defaultValue: "Aucune reaction", bundle: .main))
                .font(.footnote.weight(.medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 30)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Network Actions

    /// `true` quand `message.id` est un ObjectId MongoDB (24 hex). Un message
    /// encore optimiste garde son id local `cid_…` : il n'existe pas côté
    /// serveur, et l'endpoint `/reactions/:id` répondrait 400 "Validation failed".
    private var messageHasServerId: Bool {
        message.id.count == 24 && message.id.allSatisfy(\.isHexDigit)
    }

    /// Seeds `reactionGroups` from `message.reactions` — the same raw data
    /// already summarized into the pills shown under the bubble the user
    /// just opened this screen from — before ever touching the network.
    /// Offline (or on a network failure below) this seed is the final,
    /// preserved state instead of an empty array, which used to render
    /// "Aucune reaction" under a bubble that visibly has some.
    ///
    /// Per-user identity is limited to what the client already has:
    /// `MeeshyReaction` only carries `participantId`, not a username/avatar,
    /// so only the current user's own reaction resolves to a real name —
    /// every other row uses the existing `common.unknown` placeholder
    /// (already used the same way in `RequestsTab`/`ThreadView`) rather than
    /// fabricating an identity. The real usernames arrive once the network
    /// fetch succeeds and replaces this seed.
    static func seedReactionGroups(
        from reactions: [MeeshyReaction],
        currentUserId: String,
        currentUserDisplayName: String
    ) -> [ReactionGroup] {
        let unknownLabel = String(localized: "common.unknown", defaultValue: "Unknown", bundle: .main)
        var usersByEmoji: [String: [ReactionUserDetail]] = [:]
        var emojiOrder: [String] = []
        for reaction in reactions {
            if usersByEmoji[reaction.emoji] == nil {
                emojiOrder.append(reaction.emoji)
            }
            let isMe = reaction.participantId != nil && reaction.participantId == currentUserId
            let detail = ReactionUserDetail(
                userId: reaction.participantId ?? reaction.id,
                username: isMe ? currentUserDisplayName : unknownLabel,
                avatar: nil,
                createdAt: reaction.createdAt
            )
            usersByEmoji[reaction.emoji, default: []].append(detail)
        }
        return emojiOrder.map { emoji in
            let users = usersByEmoji[emoji] ?? []
            return ReactionGroup(emoji: emoji, count: users.count, users: users)
        }
    }

    private func loadReactionDetails() async {
        guard !isLoadingReactions || reactionGroups.isEmpty else { return }
        if reactionGroups.isEmpty, !message.reactions.isEmpty {
            let user = AuthManager.shared.currentUser
            reactionGroups = Self.seedReactionGroups(
                from: message.reactions,
                currentUserId: user?.id ?? "",
                currentUserDisplayName: user?.displayName ?? user?.username
                    ?? String(localized: "common.unknown", defaultValue: "Unknown", bundle: .main)
            )
        }
        isLoadingReactions = reactionGroups.isEmpty
        defer { isLoadingReactions = false }
        guard messageHasServerId else {
            // Not-yet-persisted optimistic message — nothing better exists
            // server-side either way. Keep the seed (was `reactionGroups = []`).
            return
        }
        do {
            let response: APIResponse<ReactionSyncResponse> = try await APIClient.shared.request(
                endpoint: "/reactions/\(message.id)"
            )
            if response.success {
                reactionGroups = response.data.reactions
            }
        } catch {
            // Network failure — keep the seed rather than erasing it (was
            // `reactionGroups = []`, the false-empty bug this fix addresses).
        }
    }

    private func relativeDate(_ date: Date) -> String {
        RelativeTimeFormatter.longString(for: date)
    }
}

// MARK: - Reaction User Item

private struct ReactionUserItem: Identifiable {
    let userId: String
    let username: String
    let avatar: String?
    let emoji: String
    let createdAt: Date

    var id: String { "\(userId)-\(emoji)" }
}
