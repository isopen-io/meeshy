import Foundation
import Combine
import UIKit
import MeeshySDK

/// **Exécute `CallActivityLaw`** : ouvre, met à jour et ferme la Live
/// Activity d'appel au fil de `CallManager` (#9782).
///
/// Lié à la pile d'appel quand elle naît (`CallManagerHost.adopt`), jamais
/// avant : l'îlot ne réveille pas `CallManager`. Toute modification publiée
/// par la pile (état, micro, attente, sous-titres) est relue après un court
/// tassement, puis confiée à la loi. Le retour au premier plan rejoue la loi :
/// une activité refusée parce que l'appel a été décroché depuis l'écran
/// verrouillé s'ouvre alors.
@MainActor
final class CallLiveActivityCoordinator {
    nonisolated deinit {}

    static let shared = CallLiveActivityCoordinator()

    private weak var manager: CallManager?
    private var running: CallActivitySnapshot?
    private var host: (any LiveActivityHostProviding<CallActivitySnapshot>)?
    private var cancellables = Set<AnyCancellable>()
    private var encryption: (conversationId: String, isEncrypted: Bool?)?

    func bind(_ manager: CallManager) {
        guard self.manager !== manager else { return }
        self.manager = manager
        cancellables = []
        guard let host = makeHost() else { return }
        self.host = host
        host.endOrphans()
        LiveActivityCommandBinding.shared.install()

        let transcription = manager.$transcriptionService
            .map { $0.objectWillChange }
            .switchToLatest()
            .map { _ in () }
        let foreground = NotificationCenter.default
            .publisher(for: UIApplication.didBecomeActiveNotification)
            .map { _ in () }
        Publishers.Merge3(manager.objectWillChange.map { _ in () }, transcription, foreground)
            .debounce(for: .milliseconds(250), scheduler: DispatchQueue.main)
            .sink { [weak self] in self?.apply() }
            .store(in: &cancellables)
    }

    private func makeHost() -> (any LiveActivityHostProviding<CallActivitySnapshot>)? {
        #if canImport(ActivityKit)
        guard #available(iOS 16.1, *) else { return nil }
        return LiveActivityHost<CallActivityAttributes> {
            CallActivityAttributes(labels: CallActivityLabels(
                mute: String(localized: "call.pill.mute", defaultValue: "Couper le micro", bundle: .main),
                unmute: String(localized: "call.pill.unmute", defaultValue: "Réactiver le micro", bundle: .main),
                hangUp: String(localized: "call.pill.hangup", defaultValue: "Raccrocher", bundle: .main)
            ))
        }
        #else
        return nil
        #endif
    }

    private static var wording: CallActivityLaw.Wording {
        CallActivityLaw.Wording(
            ringing: String(localized: "call.pill.status.ringing", defaultValue: "Sonnerie…", bundle: .main),
            connecting: String(localized: "call.pill.status.connecting", defaultValue: "Connexion…", bundle: .main),
            audioCall: String(localized: "call.start.audio", defaultValue: "Appel vocal", bundle: .main),
            videoCall: String(localized: "call.type.video", defaultValue: "Appel vidéo", bundle: .main),
            onHold: String(localized: "liveActivity.call.onHold", defaultValue: "En attente", bundle: .main),
            reconnecting: String(localized: "call.pill.status.reconnecting", defaultValue: "Reconnexion…", bundle: .main),
            ended: String(localized: "call.ended.remote", defaultValue: "Appel terminé", bundle: .main)
        )
    }

    private func apply() {
        guard let manager, let host else { return }
        let step = CallActivityLaw.step(running: running, input: input(from: manager), wording: Self.wording)
        running = step.running
        switch step.action {
        case .none:
            guard let running, !host.isRunning, UIApplication.shared.applicationState == .active else { return }
            host.start(running)
        case .start(let snapshot):
            host.start(snapshot)
        case .update(let snapshot):
            host.isRunning ? host.update(snapshot) : host.start(snapshot)
        case .end(let snapshot):
            encryption = nil
            host.end(snapshot, dismissAfter: 0)
        }
    }

    private func input(from manager: CallManager) -> CallActivityLaw.Input {
        let title = title(of: manager)
        return CallActivityLaw.Input(
            phase: phase(of: manager.callState),
            title: title,
            accentHex: CallSpeakerColor.hex(for: manager.remoteUserId ?? title),
            isVideo: manager.isVideoEnabled,
            isMuted: manager.isMuted,
            isOnHold: manager.isOnHold,
            connectedSince: manager.callStartDate,
            systemShowsCall: manager.callUsesCallKit,
            isEndToEndEncrypted: isEncrypted(manager.conversationId),
            captionsActive: manager.transcriptionService.isShowingOverlay,
            caption: latestCaption(of: manager)
        )
    }

    private func title(of manager: CallManager) -> String {
        if manager.isGroupMeshCall,
           let group = GroupCallMeshCoordinator.shared.groupTitle(for: manager.conversationId),
           !group.isEmpty {
            return group
        }
        if let name = manager.remoteUsername, !name.isEmpty { return name }
        return String(localized: "call.peer.fallback", defaultValue: "Appel", bundle: .main)
    }

    private func phase(of state: CallState) -> CallActivityLaw.CallPhase {
        switch state {
        case .idle: return .idle
        case .ringing(let isOutgoing): return .ringing(isOutgoing: isOutgoing)
        case .offering, .connecting: return .connecting
        case .connected: return .connected
        case .reconnecting: return .reconnecting
        case .ended: return .ended
        }
    }

    /// La dernière phrase FINALE d'un pair, servie comme l'écran d'appel la
    /// sert (Prisme : la traduction quand elle existe). Ma propre parole n'a
    /// rien à faire sur mon écran verrouillé.
    private func latestCaption(of manager: CallManager) -> CallActivityLaw.Caption? {
        let localUserId = AuthManager.shared.currentUser?.id ?? ""
        guard let segment = manager.transcriptionService.segments.last(where: {
            $0.isFinal && $0.speakerId != localUserId
        }) else { return nil }
        let named = manager.participantName(for: segment.speakerId)
        let line = CallCaptionLine.make(
            segment: segment,
            isLocal: false,
            speakerName: named.isEmpty ? (segment.speakerDisplayName ?? "") : named,
            prefersOriginal: false,
            isRevealed: false
        )
        return CallActivityLaw.Caption(
            speaker: line.speakerName,
            text: line.text,
            languageTag: line.languageTag,
            isFinal: line.isFinal,
            isTranslatedOnDevice: false
        )
    }

    /// Le chiffrement de la conversation de l'appel, lu une fois par appel.
    /// Tant qu'il n'est pas connu, la loi le tient pour chiffré.
    private func isEncrypted(_ conversationId: String?) -> Bool? {
        guard let conversationId else { return nil }
        if let encryption, encryption.conversationId == conversationId { return encryption.isEncrypted }
        encryption = (conversationId, nil)
        Task { @MainActor [weak self] in
            let conversation = await ConversationStore.shared.conversation(id: conversationId)
            guard let self, self.encryption?.conversationId == conversationId, let conversation else { return }
            self.encryption = (conversationId, conversation.encryptionMode != nil)
            self.apply()
        }
        return nil
    }
}
