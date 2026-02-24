// MARK: - Extracted from ConversationView.swift
import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Header, Background & Navigation
extension ConversationView {

    // MARK: - Conversation Background
    var conversationBackground: some View {
        ConversationAnimatedBackground(
            config: ConversationBackgroundConfig(
                conversationType: conversation?.type ?? .direct,
                isEncrypted: conversation?.encryptionMode != nil,
                isE2EEncrypted: conversation?.encryptionMode == "e2ee",
                memberCount: conversation?.memberCount ?? 2,
                accentHex: accentColor,
                secondaryHex: secondaryColor,
                isDarkMode: theme.mode.isDark
            )
        )
    }

    // MARK: - Header Avatar (morphs from trigger to participant display)
    @ViewBuilder
    var headerAvatarView: some View {
        if showOptions {
            // Expanded: participant avatar(s) — tap collapses band
            if isDirect, let userId = conversation?.participantUserId {
                MeeshyAvatar(
                    name: conversation?.name ?? "?",
                    mode: .custom(44),
                    accentColor: accentColor,
                    avatarURL: conversation?.participantAvatarURL,
                    storyState: memberStoryState(for: userId),
                    presenceState: presenceManager.presenceState(for: userId),
                    onTap: {
                        HapticFeedback.light()
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                            showOptions = false
                        }
                    },
                    onViewStory: {
                        if let groupIndex = storyViewModel.groupIndex(forUserId: userId) {
                            storyGroupIndexForHeader = groupIndex
                            showStoryViewerFromHeader = true
                        }
                    },
                    contextMenuItems: headerAvatarContextMenu(for: userId, name: conversation?.name ?? "Contact")
                )
            } else if !topActiveMembers.isEmpty {
                HStack(spacing: -6) {
                    ForEach(topActiveMembers) { member in
                        MeeshyAvatar(
                            name: member.name,
                            mode: .custom(28),
                            accentColor: member.color,
                            avatarURL: member.avatarURL,
                            storyState: memberStoryState(for: member.id),
                            presenceState: presenceManager.presenceState(for: member.id),
                            onTap: {
                                HapticFeedback.light()
                                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                                    showOptions = false
                                }
                            },
                            onViewStory: {
                                if let groupIndex = storyViewModel.groupIndex(forUserId: member.id) {
                                    storyGroupIndexForHeader = groupIndex
                                    showStoryViewerFromHeader = true
                                }
                            },
                            contextMenuItems: headerAvatarContextMenu(for: member.id, name: member.name)
                        )
                    }
                }
            } else if let conv = conversation, conv.memberCount > 2 {
                Button {
                    HapticFeedback.light()
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                        showOptions = false
                    }
                } label: {
                    HStack(spacing: 3) {
                        Image(systemName: "person.2.fill")
                            .font(.system(size: 9))
                        Text("\(conv.memberCount)")
                            .font(.system(size: 10, weight: .bold))
                    }
                    .foregroundColor(.white.opacity(0.5))
                }
            }
        } else {
            // Collapsed: avatar trigger — tap morphs into band
            ThemedAvatarButton(
                name: conversation?.name ?? "?",
                color: accentColor,
                secondaryColor: secondaryColor,
                isExpanded: false,
                hasStoryRing: headerHasStoryRing,
                avatarURL: conversation?.type == .direct ? conversation?.participantAvatarURL : conversation?.avatar,
                presenceState: headerPresenceState
            ) {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                    showOptions = true
                }
            }
            .contextMenu {
                if headerHasStoryRing {
                    Button {
                        if let userId = conversation?.participantUserId,
                           let groupIndex = storyViewModel.groupIndex(forUserId: userId) {
                            storyGroupIndexForHeader = groupIndex
                            showStoryViewerFromHeader = true
                        }
                    } label: {
                        Label("Voir les stories", systemImage: "play.circle.fill")
                    }
                }
                Button {
                    showConversationInfo = true
                } label: {
                    Label("Voir le profil", systemImage: "person.fill")
                }
                Button {
                    showConversationInfo = true
                } label: {
                    Label("Infos conversation", systemImage: "info.circle.fill")
                }
            }
        }
    }

    // MARK: - Header Call Buttons (audio + video)

    @ViewBuilder
    var headerCallButtons: some View {
        if isDirect, let userId = conversation?.participantUserId {
            HStack(spacing: 4) {
                // Audio call
                Button {
                    CallManager.shared.startCall(
                        userId: userId,
                        username: conversation?.name ?? "Inconnu",
                        isVideo: false
                    )
                } label: {
                    Image(systemName: "phone.fill")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [Color(hex: accentColor), Color(hex: secondaryColor)],
                                startPoint: .topLeading, endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 28, height: 28)
                        .background(Circle().fill(Color(hex: accentColor).opacity(0.15)))
                }
                .accessibilityLabel("Appel audio")

                // Video call
                Button {
                    CallManager.shared.startCall(
                        userId: userId,
                        username: conversation?.name ?? "Inconnu",
                        isVideo: true
                    )
                } label: {
                    Image(systemName: "video.fill")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [Color(hex: accentColor), Color(hex: secondaryColor)],
                                startPoint: .topLeading, endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 28, height: 28)
                        .background(Circle().fill(Color(hex: accentColor).opacity(0.15)))
                }
                .accessibilityLabel("Appel video")
            }
        }
    }

    // MARK: - Header Tags Row (category first, then colored tags, horizontally scrollable)
    @ViewBuilder
    var headerTagsRow: some View {
        let isEncrypted = conversation?.encryptionMode != nil
        let hasTags = conversationSection != nil || !(conversation?.tags.isEmpty ?? true) || isEncrypted
        if hasTags {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 4) {
                    // Encryption badge first
                    if isEncrypted {
                        HStack(spacing: 2) {
                            Image(systemName: "lock.fill")
                                .font(.system(size: 7, weight: .bold))
                            Text("E2EE")
                                .font(.system(size: 8, weight: .bold))
                        }
                        .foregroundColor(Color(hex: "4ECDC4"))
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(
                            Capsule()
                                .fill(Color(hex: "4ECDC4").opacity(0.2))
                                .overlay(
                                    Capsule()
                                        .stroke(Color(hex: "4ECDC4").opacity(0.3), lineWidth: 0.5)
                                )
                        )
                        .accessibilityLabel("Conversation chiffree")
                    }

                    // Category tag
                    if let section = conversationSection {
                        HStack(spacing: 2) {
                            Image(systemName: section.icon)
                                .font(.system(size: 7, weight: .bold))
                            Text(section.name)
                                .font(.system(size: 8, weight: .bold))
                        }
                        .foregroundColor(Color(hex: section.color))
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(
                            Capsule()
                                .fill(Color(hex: section.color).opacity(0.2))
                                .overlay(
                                    Capsule()
                                        .stroke(Color(hex: section.color).opacity(0.3), lineWidth: 0.5)
                                )
                        )
                    }

                    if let conv = conversation {
                        ForEach(conv.tags) { tag in
                            Text(tag.name)
                                .font(.system(size: 8, weight: .semibold))
                                .foregroundColor(Color(hex: tag.color))
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(
                                    Capsule()
                                        .fill(Color(hex: tag.color).opacity(0.12))
                                        .overlay(
                                            Capsule()
                                                .stroke(Color(hex: tag.color).opacity(0.25), lineWidth: 0.5)
                                        )
                                )
                        }
                    }
                }
            }
        }
    }

    // Helper: story state for a member
    func memberStoryState(for userId: String) -> StoryRingState {
        if storyViewModel.hasUnviewedStories(forUserId: userId) { return .unread }
        if storyViewModel.hasStories(forUserId: userId) { return .read }
        return .none
    }

    // Helper: context menu items for participant avatars in header band
    func headerAvatarContextMenu(for userId: String, name: String) -> [AvatarContextMenuItem] {
        var items: [AvatarContextMenuItem] = []
        if storyViewModel.hasStories(forUserId: userId) {
            items.append(AvatarContextMenuItem(label: "Voir les stories", icon: "play.circle.fill") {
                if let groupIndex = storyViewModel.groupIndex(forUserId: userId) {
                    storyGroupIndexForHeader = groupIndex
                    showStoryViewerFromHeader = true
                }
            })
        }
        items.append(AvatarContextMenuItem(label: "Voir le profil", icon: "person.fill") {
            showConversationInfo = true
        })
        items.append(AvatarContextMenuItem(label: "Envoyer un message", icon: "bubble.left.fill") {
            Task { await self.navigateToDM(with: userId, name: name) }
        })
        return items
    }

    // MARK: - Navigate to DM

    func navigateToDM(with userId: String, name: String) async {
        // Check if a DM already exists in the loaded conversation list
        if let existing = conversationListViewModel.conversations.first(where: {
            $0.type == .direct && $0.participantUserId == userId
        }) {
            router.navigateToConversation(existing)
            return
        }

        // Create a new DM via API
        do {
            struct CreateDMBody: Encodable {
                let type: String
                let participantIds: [String]
            }
            let body = CreateDMBody(type: "direct", participantIds: [userId])
            let response: APIResponse<APIConversation> = try await APIClient.shared.post(
                endpoint: "/conversations",
                body: body
            )
            if response.success {
                let currentUserId = AuthManager.shared.currentUser?.id ?? ""
                let newConv = response.data.toConversation(currentUserId: currentUserId)
                await conversationListViewModel.refresh()
                router.navigateToConversation(newConv)
            }
        } catch { }
    }
}
