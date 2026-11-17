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
            profileCardSection
            safetySection
        }
        .padding(.horizontal, MeeshySpacing.xl)
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

    private func requestCall(isVideo: Bool) {
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
            connectionContextBanner
            connectionControls
        }
    }

    @ViewBuilder
    private var connectionControls: some View {
        switch connectionStatus {
        case .none:
            ProfileRelationSlot(section: relationSection, userId: resolvedUserId, displayName: displayUser.resolvedDisplayName,
                                linked: $relationLinked) {
                VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                    connectionButton(.request) { Task { await sendConnectionRequest() } }
                    ProfileLockedCapabilities(level: .public, tint: accentTint)
                }
            }
        case .pendingSent:
            connectionButton(.cancel) { Task { await cancelRequest() } }
            connectionButton(.resend) { Task { await resendRequest() } }
        case .pendingReceived:
            connectionButton(.accept) { Task { await acceptRequest() } }
            connectionButton(.decline) { Task { await declineRequest() } }
        case .connected:
            ProfileRelationSlot(section: relationSection, userId: resolvedUserId, displayName: displayUser.resolvedDisplayName,
                                linked: $relationLinked) { ProfileConnectedBadge() }
        }
    }

    private func connectionButton(_ step: ProfileConnectionStep, action: @escaping () -> Void) -> some View {
        MeeshyButton(
            step.title,
            systemImage: step.systemImage,
            kind: step.isPrimary ? .primary : .outline,
            width: .fill,
            tint: step.isPrimary ? accentTint : nil,
            action: action
        )
    }

    /// Le contexte au-dessus des boutons de demande, pour qu'accepter ou annuler se comprenne même quand la
    /// notification d'origine est partie — « connexion de quoi ? ».
    @ViewBuilder
    var connectionContextBanner: some View {
        let name = displayUser.resolvedDisplayName
        switch connectionStatus {
        case .pendingReceived:
            MeeshyNote(String(localized: "profile.connection.context.received",
                              defaultValue: "\(name) souhaite entrer en contact avec vous.", bundle: .module),
                       lead: .systemImage("person.crop.circle.badge.questionmark"))
        case .pendingSent:
            MeeshyNote(String(localized: "profile.connection.context.sent",
                              defaultValue: "Demande envoyée à \(name) · en attente", bundle: .module),
                       lead: .systemImage("paperplane.circle"))
        case .none, .connected:
            EmptyView()
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
        VStack(spacing: MeeshySpacing.smPlus) {
            if isBlocked {
                MeeshyButton(
                    String(localized: "profile.action.unblockUser", defaultValue: "Débloquer l'utilisateur", bundle: .module),
                    systemImage: "hand.raised.slash", kind: .outline, width: .fill,
                    action: { Task { await unblockUser() } }
                )
            } else {
                MeeshyButton(
                    String(localized: "profile.action.blockUser", defaultValue: "Bloquer cet utilisateur", bundle: .module),
                    systemImage: ProfileRelationAction.block.systemImage, kind: .danger, width: .fill, isDestructive: true,
                    action: { Task { await blockUser() } }
                )
            }
            MeeshyButton(
                String(localized: "profile.action.report", defaultValue: "Signaler", bundle: .module),
                systemImage: ProfileRelationAction.report.systemImage, kind: .danger, width: .fill, isDestructive: true,
                action: { showReportSheet = true }
            )
        }
        .padding(.top, MeeshySpacing.md)
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

/// Une étape de la demande de connexion (planche `Etat-Demande`) : un libellé, un glyphe, primaire ou non.
nonisolated enum ProfileConnectionStep: CaseIterable, Sendable {
    case request, cancel, resend, accept, decline

    var title: String {
        switch self {
        case .request: return String(localized: "profile.action.connectionRequest", defaultValue: "Demande de connexion", bundle: .module)
        case .cancel: return String(localized: "profile.action.cancelRequest", defaultValue: "Annuler la demande", bundle: .module)
        case .resend: return String(localized: "profile.action.resendRequest", defaultValue: "Renvoyer la demande", bundle: .module)
        case .accept: return String(localized: "profile.action.acceptConnection", defaultValue: "Accepter la connexion", bundle: .module)
        case .decline: return String(localized: "profile.action.declineConnection", defaultValue: "Refuser la connexion", bundle: .module)
        }
    }

    var systemImage: String {
        switch self {
        case .request: return "person.badge.plus"
        case .cancel: return "xmark"
        case .resend: return "arrow.clockwise"
        case .accept: return "checkmark"
        case .decline: return "xmark"
        }
    }

    /// Demander et accepter sont les gestes qui avancent ; annuler, renvoyer et refuser restent secondaires.
    var isPrimary: Bool {
        self == .request || self == .accept
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

    var label: String {
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
