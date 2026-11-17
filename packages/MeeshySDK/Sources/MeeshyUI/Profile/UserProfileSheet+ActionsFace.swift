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
        .confirmationDialog(
            String(localized: "profile.action.report", defaultValue: "Signaler", bundle: .module),
            isPresented: $showReportSheet,
            titleVisibility: .visible
        ) {
            ForEach(ProfileReportReason.allCases, id: \.self) { reason in
                Button(reason.label, role: .destructive) {
                    submitReport(reportType: reason.rawValue)
                }
            }
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .module), role: .cancel) {}
        }
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
                labeledAction(.write, hint: writesARequest ? Self.writeRequestHint : nil) { openConversation() }
                if offersCall {
                    labeledAction(.call) { requestCall(isVideo: false) }
                    labeledAction(.video) { requestCall(isVideo: true) }
                }
                ProfileWhereSlot.of(self, .action)
            }
            .disabled(isInteractionDisabled)
        }
    }

    static var writeRequestHint: String {
        String(localized: "profile.relation.write.requestHint", defaultValue: "Ton premier message arrive dans ses demandes", bundle: .module)
    }

    func labeledAction(_ operation: ProfileRelationAction, hint: String? = nil, action: @escaping () -> Void) -> some View {
        MeeshyLabeledAction(
            title: operation.title,
            systemImage: operation.systemImage,
            tint: accentTint,
            hint: hint,
            action: action
        )
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
        ProfileRequestStage.resolve(connection: connectionStatus, request: pendingRequest, justAccepted: justAccepted)
    }

    @ViewBuilder
    private var connectionControls: some View {
        let name = displayUser.resolvedDisplayName
        switch requestStage {
        case .open:
            ProfileRelationSlot(section: relationSection, userId: resolvedUserId, displayName: name,
                                linked: $relationLinked) {
                VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                    ProfileFriendRequestCard(tint: accentTint) { note in Task { await sendConnectionRequest(message: note) } }
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

    private func submitReport(reportType: String) {
        guard let userId = resolvedUserId, !userId.isEmpty else { return }
        HapticFeedback.medium()
        Task {
            let sent = await connectionActions.report(userId: userId, reportType: reportType)
            postToast(
                sent
                    ? String(localized: "profile.toast.reportSent", defaultValue: "Signalement envoyé", bundle: .module)
                    : String(localized: "profile.toast.reportFailed", defaultValue: "Impossible d'envoyer le signalement", bundle: .module),
                isSuccess: sent
            )
        }
    }
}

/// Les huit motifs d'un signalement, à la valeur de l'énumération de la passerelle.
nonisolated enum ProfileReportReason: String, CaseIterable, Sendable {
    case spam
    case inappropriate
    case harassment
    case violence
    case hateSpeech = "hate_speech"
    case fakeProfile = "fake_profile"
    case impersonation
    case other

    /// `@MainActor` malgré le type `nonisolated` : `Bundle.module`.
    @MainActor var label: String {
        switch self {
        case .spam: return String(localized: "report.reason.spam", defaultValue: "Spam", bundle: .module)
        case .inappropriate: return String(localized: "report.reason.inappropriate", defaultValue: "Contenu inapproprié", bundle: .module)
        case .harassment: return String(localized: "report.reason.harassment", defaultValue: "Harcèlement", bundle: .module)
        case .violence: return String(localized: "report.reason.violence", defaultValue: "Violence", bundle: .module)
        case .hateSpeech: return String(localized: "report.reason.hate_speech", defaultValue: "Discours haineux", bundle: .module)
        case .fakeProfile: return String(localized: "report.reason.fake_profile", defaultValue: "Faux profil", bundle: .module)
        case .impersonation: return String(localized: "report.reason.impersonation", defaultValue: "Usurpation d'identité", bundle: .module)
        case .other: return String(localized: "report.reason.other", defaultValue: "Autre", bundle: .module)
        }
    }
}
