import Combine
import Foundation
import MeeshySDK

// #8433 · #8438 · #8439 — `CallManager` vu des contrôles d'un appel. Dans son
// propre fichier : `CallManager.swift` est hors budget, il n'y reçoit rien.
// Le contrôleur est un singleton de processus (comme le socket) : il s'attache
// à l'appel au premier accès et suit ensuite son état et son roster.

extension CallManager: CallControlsHosting {
    var controls: CallControlsController {
        CallControlsController.shared.attach(to: self)
    }

    var controlsCallId: String? {
        callState.isActive ? currentCallId : nil
    }

    /// Même chemin qu'un toucher sur « Micro » : CallKit, pairs et interface
    /// le voient ; l'utilisateur le rallume lui-même ensuite.
    func applyModeratorMute() {
        guard !isMuted else { return }
        toggleMute()
    }

    func participantName(for userId: String) -> String {
        if let member = GroupCallMeshCoordinator.shared.roster.member(userId) { return member.displayName }
        if userId == remoteUserId, !isGroupPrimaryVacated, let name = remoteUsername { return name }
        return ""
    }
}

extension CallControlsController {
    private static var attachment: AnyCancellable?

    /// Une fois par processus : l'initiateur se lit quand l'appel sort en
    /// sonnant, le rang de conversation au décroché, et tout s'oublie au
    /// raccroché.
    @discardableResult
    func attach(to callManager: CallManager) -> CallControlsController {
        guard host == nil else { return self }
        host = callManager
        forwardChanges(to: callManager.objectWillChange)
        var isInitiator = false
        let states = callManager.$callState
            .removeDuplicates()
            .sink { [weak self, weak callManager] state in
                guard let self, let callManager else { return }
                switch state {
                case .ringing(isOutgoing: true):
                    isInitiator = true
                case .connected:
                    self.updateModeration(CallModerationRule(isActiveInitiator: isInitiator, conversationRole: nil))
                    let conversationId = callManager.conversationId
                    let initiator = isInitiator
                    Task { @MainActor [weak self] in
                        guard let conversationId else { return }
                        let role = await ConversationStore.shared.conversation(id: conversationId)?.currentUserRole
                        self?.updateModeration(CallModerationRule(isActiveInitiator: initiator, conversationRole: role))
                    }
                case .idle:
                    isInitiator = false
                    self.callEnded()
                default:
                    break
                }
            }
        let roster = GroupCallMeshCoordinator.shared.$roster
            .sink { [weak self] roster in
                self?.rosterChanged(memberIds: Set(roster.members.map(\.userId)))
            }
        Self.attachment = AnyCancellable { states.cancel(); roster.cancel() }
        return self
    }
}
