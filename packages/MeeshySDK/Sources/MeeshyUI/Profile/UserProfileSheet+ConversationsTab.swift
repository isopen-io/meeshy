import SwiftUI
import MeeshySDK

// MARK: - UserProfileSheet — Conversations tab
//
// Moved verbatim from the historical `conversationsTabContent`. Reuses
// `sendMessageButton`, `MeeshyAvatar`, and the shared-conversation navigation. Sans conversation en commun, le bloc
// d'état du kit (K38) dit le vide et propose « Envoyer un premier message » (planche `Etat-Vide`, #18873).

extension UserProfileSheet {

    var isInteractionDisabled: Bool {
        isBlocked || isBlockedByTarget
    }

    @ViewBuilder
    var conversationsTab: some View {
        if effectiveConversations.isEmpty {
            MeeshyStateBlock(
                kind: isInteractionDisabled ? .denied : .empty,
                title: isInteractionDisabled
                    ? String(localized: "profile.conversations.interactionsDisabled", defaultValue: "Interactions désactivées", bundle: .module)
                    : String(localized: "profile.conversations.noShared", defaultValue: "Aucune conversation en commun", bundle: .module),
                primary: firstMessageExit,
                size: .compact,
                tint: accentTint,
                systemImage: isInteractionDisabled ? "nosign" : "bubble.left.and.bubble.right"
            )
            .padding(.horizontal, MeeshySpacing.xl)
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
                    Button {
                        guard !isInteractionDisabled else { return }
                        HapticFeedback.light()
                        guard let onNavigateToConversation else { return openSharedConversation(conv) }
                        onNavigateToConversation(conv)
                    } label: {
                        HStack(spacing: MeeshySpacing.md) {
                            MeeshyAvatar(
                                name: conv.name,
                                context: .conversationList,
                                accentColor: conv.accentColor,
                                avatarURL: conv.avatar ?? conv.participantAvatarURL
                            )

                            Text(conv.name)
                                .meeshyScaledFont(MeeshyFont.labelSize, weight: .medium)
                                .foregroundStyle(theme.textPrimary)
                                .lineLimit(1)

                            Spacer()

                            Image(systemName: "chevron.forward")
                                .meeshyScaledFont(MeeshyIconSize.xs, weight: .semibold)
                                .foregroundStyle(theme.textMuted)
                        }
                        .padding(.horizontal, MeeshySpacing.xl)
                        .padding(.vertical, MeeshySpacing.smPlus)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(MeeshyPointerPlainButtonStyle(shape: .rectangle))
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

    /// La sortie du vide : écrire le premier message, sur la fiche d'un autre qu'aucun blocage ne ferme.
    private var firstMessageExit: MeeshyStateBlockAction? {
        guard !isCurrentUser, !isInteractionDisabled else { return nil }
        return MeeshyStateBlockAction(
            title: String(localized: "profile.conversations.firstMessage", defaultValue: "Envoyer un premier message", bundle: .module),
            systemImage: "paperplane"
        ) {
            HapticFeedback.medium()
            openConversation()
        }
    }

    private func openSharedConversation(_ conv: MeeshyConversation) {
        dismiss()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            NotificationCenter.default.post(name: Notification.Name("navigateToConversation"), object: conv)
        }
    }
}
