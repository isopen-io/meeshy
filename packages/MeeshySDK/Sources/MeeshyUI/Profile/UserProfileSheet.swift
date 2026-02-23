import SwiftUI
import MeeshySDK

// MARK: - User Profile Sheet

public struct UserProfileSheet: View {
    public let user: ProfileSheetUser
    public let conversations: [MeeshyConversation]
    public var isCurrentUser: Bool = false
    public var isBlocked: Bool = false
    public var isBlockedByTarget: Bool = false
    public var isLoading: Bool = false
    public var fullUser: MeeshyUser?
    public var onNavigateToConversation: ((MeeshyConversation) -> Void)?
    public var onSendMessage: (() -> Void)?
    public var onBlock: (() -> Void)?
    public var onUnblock: (() -> Void)?
    public var onDismiss: (() -> Void)?

    @ObservedObject private var theme = ThemeManager.shared

    public init(
        user: ProfileSheetUser,
        conversations: [MeeshyConversation] = [],
        isCurrentUser: Bool = false,
        isBlocked: Bool = false,
        isBlockedByTarget: Bool = false,
        isLoading: Bool = false,
        fullUser: MeeshyUser? = nil,
        onNavigateToConversation: ((MeeshyConversation) -> Void)? = nil,
        onSendMessage: (() -> Void)? = nil,
        onBlock: (() -> Void)? = nil,
        onUnblock: (() -> Void)? = nil,
        onDismiss: (() -> Void)? = nil
    ) {
        self.user = user
        self.conversations = conversations
        self.isCurrentUser = isCurrentUser
        self.isBlocked = isBlocked
        self.isBlockedByTarget = isBlockedByTarget
        self.isLoading = isLoading
        self.fullUser = fullUser
        self.onNavigateToConversation = onNavigateToConversation
        self.onSendMessage = onSendMessage
        self.onBlock = onBlock
        self.onUnblock = onUnblock
        self.onDismiss = onDismiss
    }

    private var resolvedAccent: String {
        user.accentColor
    }

    private var displayUser: ProfileSheetUser {
        guard let full = fullUser else { return user }
        return ProfileSheetUser.from(user: full)
    }

    public var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 0) {
                bannerSection
                identitySection
                    .padding(.top, -40)

                if isBlockedByTarget {
                    blockedByTargetCard
                        .padding(.horizontal, 20)
                        .padding(.top, 16)
                } else if isBlocked {
                    blockedByMeCard
                        .padding(.horizontal, 20)
                        .padding(.top, 16)
                } else {
                    normalContent
                }

                Spacer(minLength: 40)
            }
        }
        .background(theme.backgroundPrimary)
        .ignoresSafeArea(edges: .top)
    }

    // MARK: - Banner

    private var bannerSection: some View {
        ZStack(alignment: .bottom) {
            LinearGradient(
                colors: isBlockedByTarget
                    ? [Color.gray.opacity(0.5), Color.gray.opacity(0.3)]
                    : [Color(hex: resolvedAccent).opacity(0.6), Color(hex: resolvedAccent).opacity(0.2)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .frame(height: 130)
            .overlay(
                ZStack {
                    Circle()
                        .fill(Color(hex: resolvedAccent).opacity(0.15))
                        .frame(width: 200)
                        .offset(x: -80, y: -30)
                    Circle()
                        .fill(Color(hex: resolvedAccent).opacity(0.1))
                        .frame(width: 150)
                        .offset(x: 100, y: 20)
                }
            )
            .clipped()
        }
    }

    // MARK: - Identity

    private var identitySection: some View {
        VStack(spacing: 6) {
            profileAvatar
                .bounceOnAppear()

            Text(displayUser.resolvedDisplayName)
                .font(.system(size: 20, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            Text("@\(displayUser.username)")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: resolvedAccent))

            if !isBlockedByTarget {
                presenceText
            }
        }
        .padding(.top, 4)
    }

    @ViewBuilder
    private var profileAvatar: some View {
        let avatarName = displayUser.resolvedDisplayName
        let showRing = !isBlockedByTarget && !isBlocked

        MeeshyAvatar(
            name: avatarName,
            mode: .custom(80),
            accentColor: isBlockedByTarget ? "888888" : resolvedAccent,
            avatarURL: displayUser.avatarURL,
            storyState: showRing ? .read : .none,
            presenceState: isBlockedByTarget ? .offline : presenceFromUser
        )
    }

    @ViewBuilder
    private var presenceText: some View {
        if displayUser.isOnline == true {
            HStack(spacing: 4) {
                Circle()
                    .fill(Color(hex: "2ECC71"))
                    .frame(width: 8, height: 8)
                Text("En ligne")
                    .font(.system(size: 12))
                    .foregroundColor(Color(hex: "2ECC71"))
            }
        } else if let lastActive = displayUser.lastActiveAt {
            Text(lastActiveText(from: lastActive))
                .font(.system(size: 12))
                .foregroundColor(theme.textMuted)
        }
    }

    private var presenceFromUser: PresenceState {
        displayUser.isOnline == true ? .online : .offline
    }

    // MARK: - Normal Content

    @ViewBuilder
    private var normalContent: some View {
        VStack(spacing: 16) {
            if isLoading {
                loadingPlaceholder
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
            } else {
                if let bio = displayUser.bio, !bio.isEmpty {
                    bioCard(bio)
                        .padding(.horizontal, 20)
                        .padding(.top, 16)
                }

                languagePills
                    .padding(.horizontal, 20)

                if !isCurrentUser {
                    sendMessageButton
                        .padding(.horizontal, 20)
                        .padding(.top, 4)
                }

                if !conversations.isEmpty {
                    sharedConversationsList
                        .padding(.top, 8)
                }
            }
        }
    }

    // MARK: - Bio Card

    private func bioCard(_ bio: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(bio)
                .font(.system(size: 14))
                .foregroundColor(theme.textSecondary)
                .lineLimit(5)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(theme.surfaceGradient(tint: resolvedAccent))
        .glassCard(cornerRadius: 16)
    }

    // MARK: - Language Pills

    @ViewBuilder
    private var languagePills: some View {
        let sysLang = LanguageDisplay.from(code: displayUser.systemLanguage)
        let regLang = LanguageDisplay.from(code: displayUser.regionalLanguage)

        if sysLang != nil || regLang != nil {
            HStack(spacing: 8) {
                if let lang = sysLang {
                    languagePill(lang)
                }
                if let lang = regLang, lang.code != sysLang?.code {
                    languagePill(lang)
                }
            }
        }
    }

    private func languagePill(_ lang: LanguageDisplay) -> some View {
        HStack(spacing: 4) {
            Text(lang.flag)
                .font(.system(size: 14))
            Text(lang.name)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(theme.textPrimary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(theme.surface(tint: resolvedAccent, intensity: 0.12))
        .clipShape(Capsule())
        .overlay(
            Capsule().stroke(theme.border(tint: resolvedAccent, intensity: 0.2), lineWidth: 1)
        )
    }

    // MARK: - Send Message Button

    private var sendMessageButton: some View {
        Button {
            HapticFeedback.medium()
            onSendMessage?()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "paperplane.fill")
                    .font(.system(size: 14, weight: .semibold))
                Text("Envoyer un message")
                    .font(.system(size: 15, weight: .semibold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                LinearGradient(
                    colors: [MeeshyColors.pink, MeeshyColors.cyan],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .shadow(color: MeeshyColors.pink.opacity(0.3), radius: 8, y: 4)
        }
        .pressable()
    }

    // MARK: - Shared Conversations

    private var sharedConversationsList: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Conversations en commun (\(conversations.count))")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(theme.textMuted)
                .padding(.horizontal, 20)

            VStack(spacing: 0) {
                ForEach(Array(conversations.enumerated()), id: \.element.id) { index, conv in
                    Button {
                        HapticFeedback.light()
                        onNavigateToConversation?(conv)
                    } label: {
                        HStack(spacing: 12) {
                            MeeshyAvatar(
                                name: conv.name,
                                mode: .messageBubble,
                                accentColor: conv.accentColor,
                                avatarURL: conv.avatar ?? conv.participantAvatarURL
                            )

                            Text(conv.name)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(theme.textPrimary)
                                .lineLimit(1)

                            Spacer()

                            Image(systemName: "chevron.right")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(theme.textMuted)
                        }
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .contentShape(Rectangle())
                    }
                    .staggeredAppear(index: index)

                    if index < conversations.count - 1 {
                        Divider()
                            .padding(.leading, 64)
                            .opacity(0.3)
                    }
                }
            }
        }
    }

    // MARK: - Loading Placeholder

    private var loadingPlaceholder: some View {
        VStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 12)
                .fill(theme.surface(tint: resolvedAccent, intensity: 0.1))
                .frame(height: 60)
                .shimmer()

            HStack(spacing: 8) {
                RoundedRectangle(cornerRadius: 20)
                    .fill(theme.surface(tint: resolvedAccent, intensity: 0.1))
                    .frame(width: 80, height: 30)
                RoundedRectangle(cornerRadius: 20)
                    .fill(theme.surface(tint: resolvedAccent, intensity: 0.1))
                    .frame(width: 80, height: 30)
            }
            .shimmer()
        }
    }

    // MARK: - Blocked By Target

    private var blockedByTargetCard: some View {
        VStack(spacing: 8) {
            Image(systemName: "lock.fill")
                .font(.system(size: 20))
                .foregroundColor(theme.error)

            Text("Profil restreint")
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(theme.textPrimary)

            Text("Cet utilisateur a restreint l'acces a son profil.")
                .font(.system(size: 13))
                .foregroundColor(theme.textSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(20)
        .background(theme.surfaceGradient(tint: "FF6B6B"))
        .glassCard(cornerRadius: 16)
    }

    // MARK: - Blocked By Me

    private var blockedByMeCard: some View {
        VStack(spacing: 12) {
            Text("Vous avez bloque cet utilisateur")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textSecondary)

            Button {
                HapticFeedback.medium()
                onUnblock?()
            } label: {
                Text("Debloquer")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 10)
                    .background(
                        LinearGradient(
                            colors: [Color(hex: "FF6B6B"), Color(hex: "FF2E63")],
                            startPoint: .leading, endPoint: .trailing
                        )
                    )
                    .clipShape(Capsule())
            }
            .pressable()
        }
        .frame(maxWidth: .infinity)
        .padding(20)
        .background(theme.surfaceGradient(tint: "888888"))
        .glassCard(cornerRadius: 16)
    }

    // MARK: - Helpers

    private func lastActiveText(from date: Date) -> String {
        let seconds = Int(-date.timeIntervalSinceNow)
        if seconds < 60 { return "Vu a l'instant" }
        if seconds < 3600 { return "Vu il y a \(seconds / 60)min" }
        if seconds < 86400 { return "Vu il y a \(seconds / 3600)h" }
        return "Vu il y a \(seconds / 86400)j"
    }
}
