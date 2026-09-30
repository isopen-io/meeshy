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
            VStack(spacing: MeeshySpacing.smPlus) {
                Image(systemName: isInteractionDisabled ? "nosign" : "bubble.left.and.bubble.right")
                    .font(.system(size: MeeshyIconSize.xxxl))
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
            .padding(.vertical, MeeshySpacing.xxl)
        } else {
            VStack(spacing: 0) {
                if !isCurrentUser {
                    sendMessageButton
                        .padding(.horizontal, MeeshySpacing.xl)
                        .padding(.top, MeeshySpacing.sm)
                        .padding(.bottom, MeeshySpacing.lg)
                        .opacity(isInteractionDisabled ? 0.35 : 1)
                        .allowsHitTesting(!isInteractionDisabled)
                }

                ForEach(Array(effectiveConversations.enumerated()), id: \.element.id) { index, conv in
                    HStack(spacing: MeeshySpacing.md) {
                        MeeshyAvatar(
                            name: conv.name,
                            context: .conversationList,
                            accentColor: conv.accentColor,
                            avatarURL: conv.avatar ?? conv.participantAvatarURL
                        )

                        Text(conv.name)
                            .font(.system(size: MeeshyFont.labelSize, weight: .medium))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(1)

                        Spacer()

                        Image(systemName: "chevron.forward")
                            .font(.system(size: MeeshyIconSize.xs, weight: .semibold))
                            .foregroundColor(theme.textMuted)
                    }
                    .padding(.horizontal, MeeshySpacing.xl)
                    .padding(.vertical, MeeshySpacing.smPlus)
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
                            .opacity(MeeshyOpacity.medium)
                    }
                }
            }
        }
    }
}
