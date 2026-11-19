import SwiftUI
import UIKit
import MeeshySDK

// MARK: - UserProfileSheet — la face Actions (#18870, hiérarchie #19433)
//
// Ce que je peux FAIRE avec cette personne, fait du kit (loi 12), dans l'ordre de la planche `Autre-Actions` :
// « Parler » en actions libellées (K32), Talkie et « Ensemble » (lus par l'app), « Où il est », la demande de
// connexion tant qu'aucun lien n'est servi, « Son téléphone » (lu par l'app), « Pour aller plus loin » — le chemin vers
// le cercle suivant, jamais ce qu'il tient fermé (#19674) —, « Sa fiche » en rangées (K06 : envoyer
// son profil, copier son lien, son QR, ses nouveautés, notre cercle), et en bas, séparés, bloquer et signaler (K40
// destructif). Chaque section porte son propre espace : une section que l'app ne montre pas ne laisse aucun trou.
// Rien de ce que l'ancien onglet Détails permettait ne disparaît (loi 11).

extension UserProfileSheet {

    @ViewBuilder
    var actionsFace: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(ProfileActionsSection.order, id: \.self) { section in
                actionsSection(section)
                    .meeshyCascade(rank: ProfileActionsSection.order.firstIndex(of: section) ?? 0)
            }
        }
        .meeshyCascadeFace()
        .padding(.horizontal, MeeshySpacing.xl)
        .task(id: pendingRequestId) { await loadPendingRequest() }
        .sheet(isPresented: $sharesProfile) {
            ProfileSendPresentation(route: ProfileSendRoute.of(self), host: sendSheet,
                                    exits: ProfileSendExits.of(self))
        }
    }

    @ViewBuilder
    private func actionsSection(_ section: ProfileActionsSection) -> some View {
        switch section {
        case .talk: talkSection.padding(.bottom, MeeshySpacing.xxl)
        case .part(let part): ProfileActionsPartSlot.of(self, part)
        case .whereTheyAre: ProfileWhereSlot.of(self, .card)
        case .circle: circleSection
        case .card: ProfileActionsCardSection.of(self)
        case .safety: safetySection
        }
    }

    // MARK: - Parler

    private var talkSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: String(localized: "profile.relation.section.talk", defaultValue: "Parler", bundle: .module))
            MeeshyActionGrid {
                ProfileTalkAction(operation: .write, reach: talkReach(.write), badge: writeBadge, tint: accentTint) {
                    openConversation()
                }
                if offersCall {
                    ProfileTalkAction(operation: .call, reach: talkReach(.call), tint: accentTint) { requestCall(isVideo: false) }
                    ProfileTalkAction(operation: .video, reach: talkReach(.video), tint: accentTint) { requestCall(isVideo: true) }
                }
                ProfileWhereSlot.of(self, .action)
            }
            .disabled(isInteractionDisabled)
        }
    }

    /// La pastille d'« Écrire » (#19646) : rien sur ma fiche ni quand l'un de nous a bloqué l'autre.
    var writeBadge: ProfileWriteBadge {
        isCurrentUser || isInteractionDisabled ? .empty : directDigest.badge
    }

    /// Hors ligne (planche `Etat-HorsLigne`) : « Écrire » partira au retour du réseau dans une directe connue, les appels
    /// — et une première conversation — l'attendent.
    func talkReach(_ action: ProfileRelationAction) -> ProfileTalkReach {
        ProfileTalkReach.resolve(action, isOffline: talksOffline, knowsDirect: directDigest.knowsDirect)
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

    /// La demande de connexion garde « Notre cercle » tant qu'aucun lien n'est servi ; lié, c'est une rangée de « Sa fiche ».
    @ViewBuilder
    private var circleSection: some View {
        if ProfileActionsSection.showsCircleTitle(linked: relationLinked) {
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                MeeshySectionHeader(title: String(localized: "profile.relation.section.circle", defaultValue: "Notre cercle", bundle: .module))
                connectionControls
            }
            .padding(.bottom, MeeshySpacing.xxl)
        } else {
            connectionControls
        }
    }

    var requestStage: ProfileRequestStage {
        ProfileRequestStage.resolve(connection: connectionStatus, request: pendingRequest, justAccepted: justAccepted,
                                    sendFailed: requestUnsent, prism: ReaderPrism.resolve(for: dependencies.currentUser()),
                                    acceptsRequests: loader.profile?.acceptsFriendRequests)
    }

    @ViewBuilder
    private var connectionControls: some View {
        let name = displayUser.resolvedDisplayName
        switch requestStage {
        case .open, .unsent:
            ProfileRelationSlot(section: relationSection, userId: resolvedUserId, displayName: name,
                                standing: $relationStanding, tint: accentTint) {
                VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                    ProfileFriendRequestCard(tint: accentTint, unsent: requestStage == .unsent, isSending: isSendingRequest,
                                             draft: requestStage == .unsent ? unsentNote : nil) { note in
                        Task { await sendConnectionRequest(message: note) }
                    }
                    ProfileNextCircles(level: .public, name: name, tint: accentTint)
                }
            }
        case .closed:
            ProfileRelationSlot(section: relationSection, userId: resolvedUserId, displayName: name,
                                standing: $relationStanding, tint: accentTint) {
                ProfileClosedRequestCard(name: name)
            }
        case .sent(let sentAt):
            ProfileSentRequestCard(name: name, sentAt: sentAt, tint: accentTint, isPending: isSendingRequest,
                                   onResend: { Task { await resendRequest() } },
                                   onCancel: { Task { await cancelRequest() } })
            ProfileRelationFailureSlot(failure: relationFailure, stage: requestStage) { failed in
                Task { await retryRelation(failed) }
            }
        case .received(let note):
            ProfileReceivedRequestCard(name: name, note: note, tint: accentTint,
                                       onAccept: { Task { await acceptRequest() } },
                                       onDecline: { Task { await declineRequest() } })
            ProfileRelationFailureSlot(failure: relationFailure, stage: requestStage) { failed in
                Task { await retryRelation(failed) }
            }
        case .accepted:
            ProfileAcceptedRequestCard(name: name, isOnline: resolvedPresence == .online, tint: accentTint,
                                       onWrite: { openConversation() })
            ProfileRelationSlot(section: relationSection, userId: resolvedUserId, displayName: name,
                                standing: $relationStanding, tint: accentTint) { EmptyView() }
        case .connected:
            ProfileRelationSlot(section: relationSection, userId: resolvedUserId, displayName: name,
                                standing: $relationStanding, tint: accentTint) { ProfileConnectedBadge() }
        }
    }

    // MARK: - Sa fiche

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

    /// Le signalement part avec son motif, son mot et ses messages joints ; « Bloquer aussi » ne bloque qu'une fois le
    /// signalement parti, et la fiche passe aussitôt à son état bloqué. Un blocage raté est rendu à la feuille, qui le dit.
    func sendReport(_ draft: ProfileReportDraft) async -> ProfileReportOutcome {
        guard let userId = resolvedUserId, !userId.isEmpty else { return .notSent }
        let outcome = await connectionActions.reportThenBlock(userId: userId, draft: draft, alreadyBlocked: isBlocked)
        if outcome.isBlocked { isBlocked = true }
        return outcome
    }

    /// « Réessayer » sous un blocage qui n'a pas abouti : `true` une fois la personne bloquée.
    func retryReportBlock() async -> Bool {
        guard let userId = resolvedUserId, !userId.isEmpty else { return false }
        guard await connectionActions.block(userId: userId) else { return false }
        isBlocked = true
        return true
    }
}
