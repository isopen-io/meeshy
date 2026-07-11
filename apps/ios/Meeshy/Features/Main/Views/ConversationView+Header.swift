// MARK: - Extracted from ConversationView.swift
import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import os

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
                isDarkMode: isDark
            )
        )
    }

    // MARK: - Header Avatar (thin wrapper → extracted struct to avoid PAC crashes)
    var headerAvatarView: some View {
        ConversationHeaderAvatarView(
            composerState: $composerState,
            headerState: $headerState,
            conversation: conversation,
            topActiveMembers: topActiveMembers,
            accentColor: accentColor,
            secondaryColor: secondaryColor,
            headerMoodEmoji: headerMoodEmoji,
            headerPresenceState: headerPresenceState,
            onNavigateToDM: { userId, name in
                Task { await self.navigateToDM(with: userId, name: name) }
            },
            onViewProfile: {
                if let conv = conversation, let profileUser = ProfileSheetUser.from(conversation: conv) {
                    router.deepLinkProfileUser = profileUser
                }
            }
        )
    }

    // MARK: - Header Call Buttons (audio + video)

    @ViewBuilder
    var headerCallButtons: some View {
        if isDirect, let userId = conversation?.participantUserId {
            // §7.6 — the start-call buttons are owned by a dedicated subview that
            // observes CallManager, so during an active call they swap to a
            // "tap to return" indicator (preventing a 2nd call from the header)
            // without forcing the whole ConversationView to observe the singleton.
            HeaderCallButtonsView(
                conversationId: conversation?.id ?? "",
                userId: userId,
                calleeName: resolvedCalleeName,
                accentColor: accentColor,
                secondaryColor: secondaryColor
            )
        }
    }

    /// Resolves the callee display name for DM calls.
    /// Prefers: conversation title (display name) > participantUsername > "Inconnu"
    /// Guards against ObjectId/UUID strings leaking as the displayed name.
    private var resolvedCalleeName: String {
        let candidates: [String?] = [
            conversation?.title,
            conversation?.participantUsername
        ]
        for candidate in candidates {
            if let name = candidate, !name.isEmpty, !looksLikeObjectId(name) {
                return name
            }
        }
        return "Inconnu"
    }

    /// Returns true if the string looks like a MongoDB ObjectId (24-char hex) or UUID.
    private func looksLikeObjectId(_ value: String) -> Bool {
        if value.count == 24, value.allSatisfy(\.isHexDigit) { return true }
        if UUID(uuidString: value) != nil { return true }
        return false
    }

    // MARK: - Header Tags Row (category first, then colored tags, horizontally scrollable)
    @ViewBuilder
    var headerTagsRow: some View {
        let isEncrypted = conversation?.encryptionMode != nil
        let hasTags = conversationSection != nil || !(conversation?.tags.isEmpty ?? true) || isEncrypted
        if hasTags {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 4) {
                    // Lock icon (encryption only, no text)
                    if isEncrypted {
                        Image(systemName: "lock.fill")
                            .font(MeeshyFont.relative(9, weight: .semibold))
                            .foregroundColor(theme.success)
                            .accessibilityLabel(String(localized: "conversation.encrypted", defaultValue: "Encrypted conversation", bundle: .main))
                    }

                    // Category tag
                    if let section = conversationSection {
                        HStack(spacing: 2) {
                            Image(systemName: section.icon)
                                .font(MeeshyFont.relative(7, weight: .bold))
                            Text(section.name)
                                .font(MeeshyFont.relative(8, weight: .bold))
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
                                .font(MeeshyFont.relative(8, weight: .semibold))
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

    // MARK: - Navigate to DM

    func navigateToDM(with userId: String, name: String) async {
        // Check if a DM already exists in the loaded conversation list
        if let existing = conversationListViewModel.conversations.first(where: {
            $0.type == .direct && $0.participantUserId == userId
        }) {
            router.navigateToConversation(existing)
            return
        }

        // P4.1: the network call lives in `ConversationCreator` so the
        // view doesn't have to know about APIClient.shared, the body
        // encoding, or the conversion to the local `Conversation` model.
        // Errors are intentionally swallowed here (preserved behaviour) —
        // the call is fire-and-forget from a user gesture; if it fails
        // the user can re-tap.
        let currentUserId = AuthManager.shared.currentUser?.id ?? ""
        do {
            let newConv = try await ConversationCreator().createDirectConversation(
                with: userId,
                currentUserId: currentUserId
            )
            await conversationListViewModel.refresh()
            router.navigateToConversation(newConv)
        } catch {
            Logger.network.error("createDirectConversation failed: \(error.localizedDescription)")
        }
    }
}

// MARK: - Header Call Buttons (§7.6)
// Owns the CallManager observation so the header reacts to call state without
// the whole ConversationView subscribing. Idle → audio + video start buttons;
// active call → a green "tap to return" indicator (blocks starting a 2nd call,
// gives one-tap return to the in-progress call).

private struct HeaderCallButtonsView: View {
    let conversationId: String
    let userId: String
    let calleeName: String
    let accentColor: String
    let secondaryColor: String

    @ObservedObject private var callManager = CallManager.shared
    /// Set when the SERVER (not this device's own `CallManager`) reports an
    /// active call for this conversation — the case `callManager.callState`
    /// alone can't detect: this device's own session was lost (app relaunch,
    /// crash) while the call is still ongoing. User-requested 2026-07-11 —
    /// "il faut permettre... l'indicateur minuteur vert... doit être présent
    /// avec la possibilité au touché de rejoindre l'appel". Reconciliation
    /// itself (the REST call) is an SDK atom (`ActiveCallService`); deciding
    /// WHEN to call it and how it changes this button is app orchestration.
    @State private var reconciledActiveCall: ActiveCallSession?

    var body: some View {
        Group {
            if callManager.callState.isActive {
                returnToCallIndicator
            } else if let activeCall = reconciledActiveCall {
                rejoinCallIndicator(activeCall)
            } else {
                startCallButtons
            }
        }
        // Re-reconciles whenever the conversation changes (task id) — not on
        // every body re-eval, which would otherwise fire on every callState
        // tick (e.g. once a rejoin succeeds and callDuration starts ticking).
        .task(id: conversationId) {
            await reconcileActiveCall()
        }
        // Invalidation temps réel : le gateway fanout `call:ended` jusqu'aux
        // user-rooms de TOUS les membres de la conversation
        // (resolveCallEndedRooms) — un viewer non-participant le reçoit donc
        // aussi. Sans ça, la pill « Rejoindre » (posée une seule fois au
        // .task ci-dessus) resterait pointée sur un appel mort jusqu'au
        // prochain passage dans la conversation, et un tap déclencherait un
        // call:join rejeté « This call has already ended ». Match par callId :
        // un appel qui finit dans une AUTRE conversation ne doit pas effacer
        // la pill de celle-ci. Hop main obligatoire : le publisher émet
        // depuis la queue du socket (classe SIGTRAP connue des surfaces
        // d'appel).
        .onReceive(MessageSocketManager.shared.callEnded.receive(on: DispatchQueue.main)) { event in
            if reconciledActiveCall?.id == event.callId {
                reconciledActiveCall = nil
            }
        }
    }

    private var returnToCallIndicator: some View {
        Button {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.75)) {
                callManager.displayMode = .fullScreen
            }
            HapticFeedback.medium()
        } label: {
            HStack(spacing: 5) {
                Circle()
                    .fill(MeeshyColors.success)
                    .frame(width: 7, height: 7)
                Image(systemName: "phone.fill")
                    .font(MeeshyFont.relative(10, weight: .semibold))
                Text(callManager.formattedDuration)
                    .font(MeeshyFont.relative(11, weight: .semibold, design: .monospaced))
            }
            .foregroundColor(MeeshyColors.success)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(
                Capsule()
                    .fill(MeeshyColors.success.opacity(0.15))
                    .overlay(Capsule().stroke(MeeshyColors.success.opacity(0.3), lineWidth: 0.5))
            )
        }
        .accessibilityLabel(String(localized: "call.header.return", defaultValue: "Appel en cours, toucher pour revenir", bundle: .main))
    }

    /// Same visual family as `returnToCallIndicator` (green pill, same glyph)
    /// but no live duration — this device hasn't rejoined the media session
    /// yet, so there's nothing ticking to show. Tapping calls
    /// `CallManager.rejoinActiveCall`, which resumes the WebRTC session
    /// directly into `.connecting` — once that lands, `callManager.callState.isActive`
    /// flips true and this view naturally swaps to `returnToCallIndicator`.
    private func rejoinCallIndicator(_ activeCall: ActiveCallSession) -> some View {
        Button {
            callManager.rejoinActiveCall(
                callId: activeCall.id,
                conversationId: conversationId,
                remoteUserId: userId,
                remoteUsername: calleeName,
                isVideo: activeCall.isVideo
            )
            HapticFeedback.medium()
        } label: {
            HStack(spacing: 5) {
                Circle()
                    .fill(MeeshyColors.success)
                    .frame(width: 7, height: 7)
                Image(systemName: "phone.fill")
                    .font(MeeshyFont.relative(10, weight: .semibold))
                Text(String(localized: "call.header.rejoin", defaultValue: "Rejoindre", bundle: .main))
                    .font(MeeshyFont.relative(11, weight: .semibold))
            }
            .foregroundColor(MeeshyColors.success)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(
                Capsule()
                    .fill(MeeshyColors.success.opacity(0.15))
                    .overlay(Capsule().stroke(MeeshyColors.success.opacity(0.3), lineWidth: 0.5))
            )
        }
        .accessibilityLabel(String(localized: "call.header.rejoin.a11y", defaultValue: "Appel en cours, toucher pour rejoindre", bundle: .main))
    }

    /// Reconciles with the server on every conversation open — this
    /// device's own `callManager.callState` can't tell the difference
    /// between "no call" and "a call is active but this session lost it".
    /// Skipped when `callManager` already knows locally (no need to hit the
    /// network, and avoids a race that could momentarily contradict local
    /// state) or for non-direct conversations (no single peer to rejoin).
    private func reconcileActiveCall() async {
        guard !callManager.callState.isActive else { return }
        // try? flattens the throws+Optional combination (SE-0230) — a
        // network error and "no active call" both collapse to nil here,
        // which is the right behavior: reconciliation is best-effort and
        // silent, never surfaced as an error to the user.
        guard let session = try? await ActiveCallService.shared.activeCall(conversationId: conversationId),
              session.conversationId == conversationId else { return }
        reconciledActiveCall = session
    }

    /// Bouton d'appel unique : un `Menu` qui laisse choisir vocal ou vidéo via un
    /// menu contextuel (au lieu de deux boutons séparés). Le glyphe adopte le verre
    /// adaptatif (Liquid Glass iOS 26, repli `.ultraThinMaterial` en deçà) teinté à
    /// la couleur d'accent de la conversation.
    private var startCallButtons: some View {
        Menu {
            Button {
                CallManager.shared.startCall(conversationId: conversationId, userId: userId, displayName: calleeName, isVideo: false)
            } label: {
                Label(String(localized: "call.start.audio", defaultValue: "Appel vocal", bundle: .main), systemImage: "phone.fill")
            }
            Button {
                CallManager.shared.startCall(conversationId: conversationId, userId: userId, displayName: calleeName, isVideo: true)
            } label: {
                Label(String(localized: "call.start.video", defaultValue: "Appel vidéo", bundle: .main), systemImage: "video.fill")
            }
        } label: {
            callGlyph("phone.fill")
                .meeshyTapTarget()
        }
        .accessibilityLabel(String(localized: "call.start.menu", defaultValue: "Appeler", bundle: .main))
        .accessibilityHint(String(localized: "call.start.menu.hint", defaultValue: "Choisir un appel vocal ou vidéo", bundle: .main))
    }

    private func callGlyph(_ systemName: String) -> some View {
        Image(systemName: systemName)
            .font(MeeshyFont.relative(13, weight: .semibold))
            .foregroundStyle(
                LinearGradient(
                    colors: [Color(hex: accentColor), Color(hex: secondaryColor)],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
            )
            // Matches expandedHeaderSearchButton's circle exactly (28×28,
            // font 13) — user-requested 2026-07-11: the two header buttons
            // must read as the same size.
            .frame(width: 28, height: 28)
            .meeshyTapTarget()
            .adaptiveGlass(in: Circle(), tint: Color(hex: accentColor).opacity(0.4), interactive: true)
    }
}

// MARK: - Conversation Header Avatar View
// Extracted struct to avoid PAC (Pointer Authentication Code) crashes on ARM64e:
// @ViewBuilder computed properties capturing @EnvironmentObject + @State in @escaping closures
// cause EXC_BAD_ACCESS in swift_retain. Using a dedicated struct gives SwiftUI proper ownership.

private struct ConversationHeaderAvatarView: View {
    @Binding var composerState: ConversationComposerState
    @Binding var headerState: ConversationHeaderState

    let conversation: Conversation?
    let topActiveMembers: [ConversationActiveMember]
    let accentColor: String
    let secondaryColor: String
    let headerMoodEmoji: String?
    let headerPresenceState: PresenceState
    var onNavigateToDM: (String, String) -> Void
    var onViewProfile: (() -> Void)?

    @EnvironmentObject private var storyViewModel: StoryViewModel
    @EnvironmentObject private var statusViewModel: StatusViewModel

    private var isDirect: Bool { conversation?.type == .direct }

    private func memberStoryState(for userId: String) -> StoryRingState {
        storyViewModel.storyRingState(forUserId: userId)
    }

    private func avatarContextMenu(for userId: String, name: String) -> [AvatarContextMenuItem] {
        // NB : l'entrée « Voir la story » est ajoutée automatiquement par
        // `MeeshyAvatar` dès qu'un `onViewStory` est fourni et qu'une story
        // existe (`storyState != .none`). On ne la duplique donc pas ici —
        // on n'ajoute que les entrées profil / conversation / message.
        var items: [AvatarContextMenuItem] = []
        if isDirect {
            items.append(AvatarContextMenuItem(label: "Voir le profil", icon: "person.circle.fill") {
                onViewProfile?()
            })
        }
        items.append(AvatarContextMenuItem(label: "Conversation", icon: "info.circle.fill") {
            composerState.showConversationInfo = true
        })
        if !isDirect {
            items.append(AvatarContextMenuItem(label: "Envoyer un message", icon: "bubble.left.fill") {
                onNavigateToDM(userId, name)
            })
        }
        return items
    }

    private var collapsedStoryState: StoryRingState {
        if isDirect, let userId = conversation?.participantUserId {
            return memberStoryState(for: userId)
        }
        return .none
    }

    private var directContextMenu: [AvatarContextMenuItem] {
        guard let userId = conversation?.participantUserId else { return [] }
        return avatarContextMenu(for: userId, name: conversation?.name ?? "Contact")
    }

    var body: some View {
        if composerState.showOptions {
            // Expanded: participant avatar(s) — tap collapses band
            if isDirect, let userId = conversation?.participantUserId {
                MeeshyAvatar(
                    name: conversation?.name ?? "?",
                    context: .conversationHeaderExpanded,
                    accentColor: accentColor,
                    secondaryColor: secondaryColor,
                    avatarURL: conversation?.participantAvatarURL,
                    storyState: memberStoryState(for: userId),
                    moodEmoji: statusViewModel.statusForUser(userId: userId)?.moodEmoji,
                    presenceState: PresenceManager.shared.presenceState(for: userId),
                    onTap: {
                        HapticFeedback.light()
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                            composerState.showOptions = false
                        }
                    },
                    onViewStory: {
                        headerState.storyUserIdForHeader = userId
                        headerState.showStoryViewerFromHeader = true
                    },
                    onMoodTap: statusViewModel.moodTapHandler(for: userId),
                    contextMenuItems: directContextMenu
                )
            } else {
                HStack(spacing: 4) {
                    // Stacked active member avatars
                    if !topActiveMembers.isEmpty {
                        HStack(spacing: -6) {
                            ForEach(topActiveMembers) { member in
                                MeeshyAvatar(
                                    name: member.name,
                                    context: .conversationHeaderStacked,
                                    accentColor: member.color,
                                    avatarURL: member.avatarURL,
                                    storyState: memberStoryState(for: member.id),
                                    moodEmoji: statusViewModel.statusForUser(userId: member.id)?.moodEmoji,
                                    presenceState: PresenceManager.shared.presenceState(for: member.id),
                                    onTap: {
                                        HapticFeedback.light()
                                        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                                            composerState.showOptions = false
                                        }
                                    },
                                    onViewStory: {
                                        headerState.storyUserIdForHeader = member.id
                                        headerState.showStoryViewerFromHeader = true
                                    },
                                    onMoodTap: statusViewModel.moodTapHandler(for: member.id),
                                    contextMenuItems: avatarContextMenu(for: member.id, name: member.name)
                                )
                            }
                        }
                    }

                    // Conversation avatar (always visible for groups)
                    MeeshyAvatar(
                        name: conversation?.name ?? "?",
                        context: .conversationHeaderExpanded,
                        accentColor: accentColor,
                        secondaryColor: secondaryColor,
                        avatarURL: conversation?.avatar,
                        onTap: {
                            HapticFeedback.light()
                            withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                                composerState.showOptions = false
                            }
                        }
                    )
                }
            }
        } else {
            // Collapsed: avatar trigger — tap expands band, long press shows context menu
            MeeshyAvatar(
                name: conversation?.name ?? "?",
                context: .conversationHeaderCollapsed,
                accentColor: accentColor,
                secondaryColor: secondaryColor,
                avatarURL: conversation?.type == .direct ? conversation?.participantAvatarURL : conversation?.avatar,
                storyState: collapsedStoryState,
                moodEmoji: headerMoodEmoji,
                presenceState: headerPresenceState,
                onTap: {
                    HapticFeedback.light()
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                        composerState.showOptions = true
                    }
                },
                onViewStory: isDirect ? {
                    if let userId = conversation?.participantUserId {
                        headerState.storyUserIdForHeader = userId
                        headerState.showStoryViewerFromHeader = true
                    }
                } : nil,
                onMoodTap: isDirect ? statusViewModel.moodTapHandler(for: conversation?.participantUserId ?? "", repliesInline: true) : nil,
                contextMenuItems: directContextMenu
            )
        }
    }
}
