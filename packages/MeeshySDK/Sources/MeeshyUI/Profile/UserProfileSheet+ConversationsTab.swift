import SwiftUI
import MeeshySDK

// MARK: - UserProfileSheet — Conversations tab
//
// Nos conversations en commun et leur navigation. Sans conversation en commun, le bloc d'état du kit (K38) dit le vide
// et propose « Envoyer un premier message » (planche `Etat-Vide`, #18873). « Écrire » vit dans « Avec lui » et dans le
// raccourci du sélecteur : la liste ne le redouble pas. Les rangées entrent avec la cascade K26 de leur section.

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
            sharedConversationRows
        }
    }

    /// Les rangées de nos conversations en commun, en lecture seule quand je l'ai bloqué.
    var sharedConversationRows: some View {
        VStack(spacing: 0) {
            ForEach(Array(effectiveConversations.enumerated()), id: \.element.id) { index, conv in
                ProfileSharedConversationRow(conversation: conv, access: sharedConversationAccess) {
                    HapticFeedback.light()
                    guard let onNavigateToConversation else { return openSharedConversation(conv) }
                    onNavigateToConversation(conv)
                }

                if index < effectiveConversations.count - 1 {
                    Divider()
                        .padding(.leading, 64)
                        .opacity(MeeshyOpacity.medium)
                }
            }
        }
    }

    var sharedConversationAccess: ProfileSharedConversationAccess {
        ProfileSharedConversationAccess.resolve(isBlockedByMe: isBlocked, isUnavailable: isBlockedByTarget)
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

/// Une conversation en commun ; je l'ai bloqué, elle s'ouvre en lecture seule et le dit (planche `Etat-Bloque`) ;
/// introuvable ou il m'a bloqué, elle ferme.
struct ProfileSharedConversationRow: View {
    let conversation: MeeshyConversation
    let access: ProfileSharedConversationAccess
    let onOpen: () -> Void
    @ResolvedThemePalette private var theme

    var body: some View {
        Button {
            guard access != .closed else { return }
            onOpen()
        } label: {
            HStack(spacing: MeeshySpacing.md) {
                MeeshyAvatar(
                    name: conversation.name,
                    context: .conversationList,
                    accentColor: conversation.accentColor,
                    avatarURL: conversation.avatar ?? conversation.participantAvatarURL
                )
                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    Text(conversation.name)
                        .meeshyScaledFont(MeeshyFont.labelSize, weight: .medium)
                        .foregroundStyle(theme.textPrimary)
                        .lineLimit(1)
                    if access == .readOnly {
                        Label(ProfileStatesCopy.readOnly, systemImage: "lock")
                            .meeshyScaledFont(MeeshyFont.captionSize)
                            .foregroundStyle(theme.textMuted)
                    }
                }
                Spacer()
                Image(systemName: "chevron.forward")
                    .meeshyScaledFont(MeeshyIconSize.xs, weight: .semibold)
                    .foregroundStyle(theme.textMuted)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, MeeshySpacing.xl)
            .padding(.vertical, MeeshySpacing.smPlus)
            .contentShape(Rectangle())
        }
        .buttonStyle(MeeshyPointerPlainButtonStyle(shape: .rectangle))
        .disabled(access == .closed)
        .opacity(access == .closed ? 0.35 : 1)
    }
}
