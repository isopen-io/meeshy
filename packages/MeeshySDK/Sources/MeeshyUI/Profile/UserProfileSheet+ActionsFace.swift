import SwiftUI
import UIKit
import MeeshySDK

// MARK: - UserProfileSheet — la face Actions (#18870)
//
// Ce que je peux FAIRE avec cette personne, fait du kit (loi 12) : « Parler » en actions libellées (K32), « Notre
// cercle » (la demande de connexion, puis l'emplacement de l'app : le niveau commun, Talkie, Bring, Ensemble, position,
// batterie, injoignable, et ce qui reste fermé en rangées verrouillées K37), « Sa fiche » (envoyer son profil, copier
// son lien), et en bas, séparés, bloquer et signaler (K40 destructif). Rien de ce que l'ancien onglet Détails
// permettait ne disparaît (loi 11).

extension UserProfileSheet {

    @ViewBuilder
    var actionsFace: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xxl) {
            talkSection
            circleSection
            ProfileWhereSlot.of(self, .card)
            profileCardSection
            safetySection
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .task(id: pendingRequestId) { await loadPendingRequest() }
        .sheet(isPresented: $sharesProfile) {
            if let link = ProfileLink(username: displayUser.username) {
                ProfileActivitySheet(items: [link.url])
                    .presentationDetents([.medium, .large])
            }
        }
    }

    // MARK: - Parler

    private var talkSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: String(localized: "profile.relation.section.talk", defaultValue: "Parler", bundle: .module))
            MeeshyActionGrid {
                labeledAction(.write, reach: talkReach(.write)) { openConversation() }
                if offersCall {
                    labeledAction(.call, reach: talkReach(.call)) { requestCall(isVideo: false) }
                        .disabled(talkReach(.call) == .needsNetwork)
                    labeledAction(.video, reach: talkReach(.video)) { requestCall(isVideo: true) }
                        .disabled(talkReach(.video) == .needsNetwork)
                }
                ProfileWhereSlot.of(self, .action)
            }
            .disabled(isInteractionDisabled)
        }
    }

    func labeledAction(_ operation: ProfileRelationAction, hint: String? = nil, reach: ProfileTalkReach = .available,
                       action: @escaping () -> Void) -> some View {
        MeeshyLabeledAction(
            title: operation.title,
            systemImage: operation.systemImage,
            value: ProfileStatesCopy.reachMention(reach),
            valueKind: reach == .queued ? .accent : .quiet,
            tint: accentTint,
            hint: hint,
            action: action
        )
    }

    /// Hors ligne (planche `Etat-HorsLigne`) : « Écrire » partira au retour du réseau, les appels l'attendent.
    func talkReach(_ action: ProfileRelationAction) -> ProfileTalkReach {
        ProfileTalkReach.resolve(action, isOffline: ProfileTalkReach.isOffline(phase))
    }

    var offersCall: Bool {
        onCall != nil && !isCurrentUser && !isInteractionDisabled
    }

    func requestCall(isVideo: Bool) {
        guard let request = ProfileCallRequest(
            userId: displayUser.userId,
            displayName: displayUser.resolvedDisplayName,
            isVideo: isVideo,
            sharedConversations: effectiveConversations
        ) else { return }
        onCall?(request)
    }

    // MARK: - Notre cercle

    private var circleSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: String(localized: "profile.relation.section.circle", defaultValue: "Notre cercle", bundle: .module))
            connectionControls
        }
    }

    var requestStage: ProfileRequestStage {
        ProfileRequestStage.resolve(connection: connectionStatus, request: pendingRequest, justAccepted: justAccepted,
                                    sendFailed: requestUnsent)
    }

    @ViewBuilder
    private var connectionControls: some View {
        let name = displayUser.resolvedDisplayName
        switch requestStage {
        case .open, .unsent:
            ProfileRelationSlot(section: relationSection, userId: resolvedUserId, displayName: name,
                                linked: $relationLinked) {
                VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                    ProfileFriendRequestCard(tint: accentTint, unsent: requestStage == .unsent) { note in
                        Task { await sendConnectionRequest(message: note) }
                    }
                    ProfileLockedCapabilities(level: .public, tint: accentTint)
                }
            }
        case .sent(let sentAt):
            ProfileSentRequestCard(name: name, sentAt: sentAt, tint: accentTint,
                                   onResend: { Task { await resendRequest() } },
                                   onCancel: { Task { await cancelRequest() } })
        case .received(let note):
            ProfileReceivedRequestCard(name: name, note: note, tint: accentTint,
                                       onAccept: { Task { await acceptRequest() } },
                                       onDecline: { Task { await declineRequest() } })
        case .accepted:
            ProfileAcceptedRequestCard(name: name, isOnline: resolvedPresence == .online, tint: accentTint,
                                       onWrite: { openConversation() })
            ProfileRelationSlot(section: relationSection, userId: resolvedUserId, displayName: name,
                                linked: $relationLinked) { EmptyView() }
        case .connected:
            ProfileRelationSlot(section: relationSection, userId: resolvedUserId, displayName: name,
                                linked: $relationLinked) { ProfileConnectedBadge() }
        }
    }

    // MARK: - Sa fiche

    @ViewBuilder
    private var profileCardSection: some View {
        if let link = ProfileLink(username: displayUser.username) {
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                MeeshySectionHeader(title: String(localized: "profile.relation.section.card", defaultValue: "Sa fiche", bundle: .module))
                MeeshyActionGrid {
                    labeledAction(.sendProfile) { sharesProfile = true }
                    MeeshyLabeledAction(
                        title: String(localized: "profile.relation.action.copyLink", defaultValue: "Copier son lien", bundle: .module),
                        systemImage: "doc.on.doc",
                        tint: accentTint,
                        hint: link.displayText,
                        action: { copyProfileLink(link) }
                    )
                }
            }
        }
    }

    func copyProfileLink(_ link: ProfileLink) {
        UIPasteboard.general.url = link.url
        HapticFeedback.success()
        postToast(String(localized: "profile.relation.toast.linkCopied", defaultValue: "Lien copié", bundle: .module), isSuccess: true)
    }

    // MARK: - Bloquer, signaler

    private var safetySection: some View {
        ProfileSafetyButtons(isBlocked: isBlocked, onUnblock: { Task { await unblockUser() } },
                             onBlock: { Task { await blockUser() } }, onReport: { showReportSheet = true })
    }

    /// Le signalement part avec son motif et son mot ; « Bloquer aussi » ne bloque qu'une fois le signalement parti,
    /// et la fiche passe aussitôt à son état bloqué.
    func sendReport(_ draft: ProfileReportDraft) async -> ProfileReportOutcome {
        guard let userId = resolvedUserId, !userId.isEmpty, let reason = draft.reason else { return .notSent }
        guard await connectionActions.report(userId: userId, reportType: reason.rawValue, reason: draft.sentDetails) else {
            return .notSent
        }
        guard draft.alsoBlocks, !isBlocked else { return ProfileReportOutcome(isSent: true, isBlocked: isBlocked) }
        let blocked = await connectionActions.block(userId: userId)
        if blocked { isBlocked = true }
        return ProfileReportOutcome(isSent: true, isBlocked: blocked)
    }
}
