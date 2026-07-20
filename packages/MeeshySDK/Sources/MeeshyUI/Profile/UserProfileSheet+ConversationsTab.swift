import SwiftUI
import MeeshySDK

// MARK: - UserProfileSheet — Conversations tab
//
// Moved verbatim from the historical `conversationsTabContent`. Reuses
// `sendMessageButton`/`sendMessageButtonCompact`, `MeeshyAvatar`, and the
// shared-conversation navigation.

extension UserProfileSheet {

    var isInteractionDisabled: Bool {
        isBlocked || isBlockedByTarget
    }

    @ViewBuilder
    var conversationsTab: some View {
        if effectiveConversations.isEmpty {
            VStack(spacing: 10) {
                Image(systemName: isInteractionDisabled ? "nosign" : "bubble.left.and.bubble.right")
                    .font(.system(size: 28))
                    .foregroundColor(theme.textMuted.opacity(isInteractionDisabled ? 0.3 : 0.5))
                    .accessibilityHidden(true)

                if !isCurrentUser, !isInteractionDisabled {
                    sendMessageButtonCompact
                }

                Text(isInteractionDisabled
                     ? String(localized: "profile.conversations.interactionsDisabled", defaultValue: "Interactions desactivees", bundle: .module)
                     : String(localized: "profile.conversations.noShared", defaultValue: "Aucune conversation en commun", bundle: .module))
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(theme.textSecondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 24)
        } else {
            VStack(spacing: 0) {
                if !isCurrentUser {
                    sendMessageButton
                        .padding(.horizontal, 20)
                        .padding(.top, 8)
                        .padding(.bottom, 16)
                        .opacity(isInteractionDisabled ? 0.35 : 1)
                        .allowsHitTesting(!isInteractionDisabled)
                }

                ForEach(Array(effectiveConversations.enumerated()), id: \.element.id) { index, conv in
                    HStack(spacing: 12) {
                        MeeshyAvatar(
                            name: conv.name,
                            context: .conversationList,
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
                    .onTapGesture {
                        guard !isInteractionDisabled else { return }
                        HapticFeedback.light()
                        if let onNavigateToConversation {
                            onNavigateToConversation(conv)
                        } else {
                            dismiss()
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                                NotificationCenter.default.post(
                                    name: Notification.Name("navigateToConversation"),
                                    object: conv
                                )
                            }
                        }
                    }
                    .staggeredAppear(index: index)
                    .opacity(isInteractionDisabled ? 0.35 : 1)

                    if index < effectiveConversations.count - 1 {
                        Divider()
                            .padding(.leading, 64)
                            .opacity(0.3)
                    }
                }
            }
        }
    }
}
