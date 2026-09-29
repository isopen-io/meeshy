import AVFoundation
import Combine
import Foundation
import MeeshySDK
import UIKit
@preconcurrency import WebRTC

// L'aperçu avant décroché côté `CallManager` (#8480) : ce que le coordinateur
// lit de l'appel, et les deux gestes que seul `CallManager` peut faire — ouvrir
// le son pendant la sonnerie, rétablir le micro coupé pendant la sonnerie.

extension CallManager: CallPreviewHostActing {
    /// Le moteur audio pendant la sonnerie. Sonnerie in-app : la session est
    /// déjà active (la sonnerie l'a ouverte). Appel signalé à CallKit, app au
    /// premier plan (#8627) : CallKit n'active la session qu'au décroché, on
    /// l'ouvre donc soi-même pour entendre l'appelant.
    func setPreviewAudible(_ audible: Bool) {
        let opensSession = audible && callUsesCallKit
        audioSessionQueue.sync {
            let rtc = RTCAudioSession.sharedInstance()
            rtc.lockForConfiguration()
            if opensSession, (try? AVAudioSession.sharedInstance().setActive(true, options: [])) != nil {
                rtc.audioSessionDidActivate(AVAudioSession.sharedInstance())
            }
            rtc.isAudioEnabled = audible
            rtc.unlockForConfiguration()
        }
        if audible { ringbackPlayer.stopRingtone() }
    }

    func restoreMicAfterRinging() {
        guard isMuted else { return }
        toggleMute()
    }

    var previewHostState: CallPreviewHostState {
        CallPreviewHostState(
            callId: currentCallId,
            localUserId: AuthManager.shared.currentUser?.id ?? "",
            peerUserId: remoteUserId,
            phase: Self.previewPhase(
                of: callState,
                ringsInApp: Self.previewRingsInApp(
                    usesCallKit: callUsesCallKit,
                    isAppActive: UIApplication.shared.applicationState == .active
                )
            ),
            isGroup: GroupCallMeshCoordinator.shared.isGroupConversation(conversationId),
            isMicMuted: isMuted,
            isVideoEnabled: isVideoEnabled
        )
    }

    /// #8627 — CallKit ne montre pas de vidéo, mais un appel qu'il signale
    /// sonne aussi dans l'app dès qu'elle est au premier plan.
    nonisolated static func previewRingsInApp(usesCallKit: Bool, isAppActive: Bool) -> Bool {
        !usesCallKit || isAppActive
    }

    nonisolated static func previewPhase(of state: CallState, ringsInApp: Bool) -> CallPreviewPhase {
        switch state {
        case .idle: return .none
        case .ringing(let isOutgoing) where isOutgoing: return .outgoingRinging
        case .ringing: return ringsInApp ? .incomingRinging : .none
        case .offering: return .outgoingRinging
        case .connecting: return .answering
        case .connected, .reconnecting: return .connected
        case .ended: return .ended
        }
    }
}

/// Branche le coordinateur d'aperçu sur la pile d'appel et la socket, une fois
/// par pile — le pendant de `GroupCallMeshBinding`.
@MainActor
final class CallPreviewBinding {
    nonisolated deinit {}

    static let shared = CallPreviewBinding()

    private let preview: CallPreviewCoordinator
    private var cancellables = Set<AnyCancellable>()
    private weak var boundManager: CallManager?

    init(preview: CallPreviewCoordinator = .shared) {
        self.preview = preview
    }

    func bind(_ manager: CallManager, socket: MessageSocketManager = .shared) {
        guard boundManager !== manager else { return }
        boundManager = manager
        cancellables = []
        preview.attach(host: manager)

        socket.callPreviewEvents
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.preview.handle($0) }
            .store(in: &cancellables)
        socket.callOfferReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.preview.handleIncomingCall($0) }
            .store(in: &cancellables)
        socket.callIceServersRefreshed
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.preview.handleIceServersRefreshed($0) }
            .store(in: &cancellables)

        let state = manager.$callState.map { _ in () }
        let peer = manager.$remoteUserId.map { _ in () }
        let muted = manager.$isMuted.map { _ in () }
        let video = manager.$isVideoEnabled.map { _ in () }
        let call = manager.$currentCallId.map { _ in () }
        let foreground = NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification).map { _ in () }
        let background = NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification).map { _ in () }
        Publishers.Merge(Publishers.Merge5(state, peer, muted, video, call), Publishers.Merge(foreground, background))
            .receive(on: DispatchQueue.main)
            .sink { [weak self, weak manager] in
                guard let manager else { return }
                self?.preview.sync(manager.previewHostState)
            }
            .store(in: &cancellables)
    }
}
