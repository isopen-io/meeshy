import Combine
import CoreVideo
import Foundation
import MeeshySDK
import os

// #8063 — le partage d'écran d'un appel, côté app.
//
// Deux moitiés, qui ne se croisent que par l'état qu'elles publient :
// • LOCALE — l'extension ReplayKit diffuse, `ScreenShareService` reçoit ses
//   trames, ce contrôleur branche la piste « écran » sur l'émetteur vidéo à la
//   place de la caméra et l'annonce au pair (`call:toggle-screen`) ; l'arrêt
//   rend la caméra si elle était allumée, sinon repasse l'émetteur en réception.
// • DISTANTE — le pair annonce son partage (`call:media-toggled`,
//   `mediaType: "screen"`) : son flux s'affiche en grand même si sa caméra
//   était éteinte, et l'arrêt retombe sur l'état de sa caméra.

/// Ce que l'app fait d'une trame d'écran reçue de l'extension. Appelé sur la
/// file du socket, jamais sur le fil principal.
nonisolated protocol ScreenShareFrameSink: AnyObject, Sendable {
    func push(pixelBuffer: CVPixelBuffer, rotationDegrees: Int, timestampNs: Int64)
}

struct ScreenShareTrackActivation: Sendable {
    let sink: any ScreenShareFrameSink
    /// Vrai quand l'émetteur vidéo ne SORTAIT rien (appel audio, caméra
    /// coupée) : la direction SDP change, le pair doit recevoir une offre.
    let needsRenegotiation: Bool
}

/// La piste vidéo sortante, vue du partage d'écran.
protocol ScreenShareVideoRouting: AnyObject {
    func beginScreenShareTrack() async throws -> ScreenShareTrackActivation
    /// Rend `true` quand la direction SDP change (retour en réception seule).
    func endScreenShareTrack(restoreCamera: Bool) async -> Bool
}

/// Ce que le contrôleur lit de l'appel en cours.
protocol CallScreenShareHosting: AnyObject {
    var screenShareCallId: String? { get }
    var screenShareRestoresCamera: Bool { get }
    var screenShareRouter: (any ScreenShareVideoRouting)? { get }
    func screenShareNeedsRenegotiation() async
}

final class CallScreenShareController: ObservableObject {
    @Published private(set) var isSharing = false
    @Published private(set) var isRemoteSharing = false
    private(set) var remoteCameraEnabled = true
    private(set) var pendingTransition: Task<Void, Never>?

    weak var host: (any CallScreenShareHosting)?

    private let service: any ScreenShareServiceProviding
    private let emitToggle: (String, Bool) -> Void
    private let reportFailure: () -> Void
    private var changeForwarding: AnyCancellable?
    private let logger = Logger(subsystem: "me.meeshy.app", category: "screen-share")

    init(
        service: (any ScreenShareServiceProviding)? = nil,
        emitToggle: ((String, Bool) -> Void)? = nil,
        reportFailure: (() -> Void)? = nil
    ) {
        self.service = service ?? ScreenShareService()
        self.emitToggle = emitToggle ?? { callId, enabled in
            MessageSocketManager.shared.emitCallToggleScreen(callId: callId, enabled: enabled)
        }
        self.reportFailure = reportFailure ?? {
            FeedbackToastManager.shared.showError(
                String(localized: "call.screenShare.error", defaultValue: "Impossible de partager l'écran", bundle: .main)
            )
        }
        self.service.onBroadcastStarted = { [weak self] in self?.broadcastDidStart() }
        self.service.onBroadcastFinished = { [weak self] in self?.broadcastDidFinish() }
    }

    /// L'écran d'appel observe `CallManager` : ses changements doivent y
    /// remonter pour que la bannière et la mise en page suivent.
    func forwardChanges(to publisher: ObservableObjectPublisher) {
        changeForwarding = objectWillChange.sink { [weak publisher] _ in publisher?.send() }
    }

    var isRemoteVideoVisible: Bool { remoteCameraEnabled || isRemoteSharing }

    // MARK: - Local sharing

    /// Ouvre le socket AVANT que le sélecteur système ne lance l'extension :
    /// sans app en écoute, elle s'arrête aussitôt en disant pourquoi.
    func prepareBroadcast() -> Bool {
        guard host?.screenShareCallId != nil else { return false }
        return service.startListening()
    }

    func stopSharing() {
        service.requestBroadcastStop()
    }

    func announceIfSharing() {
        guard isSharing, let callId = host?.screenShareCallId else { return }
        emitToggle(callId, true)
    }

    @discardableResult
    func broadcastDidStart() -> Task<Void, Never> {
        enqueue { await $0.performStart() }
    }

    @discardableResult
    func broadcastDidFinish() -> Task<Void, Never> {
        enqueue { await $0.performFinish() }
    }

    func callEnded() {
        if isSharing { service.requestBroadcastStop() }
        service.setFrameSink(nil)
        service.stopListening()
        pendingTransition?.cancel()
        pendingTransition = nil
        isSharing = false
        isRemoteSharing = false
        remoteCameraEnabled = true
    }

    // MARK: - Remote sharing

    func applyRemoteCamera(enabled: Bool) -> Bool {
        remoteCameraEnabled = enabled
        return isRemoteVideoVisible
    }

    func applyRemoteScreenShare(enabled: Bool) -> Bool {
        isRemoteSharing = enabled
        return isRemoteVideoVisible
    }

    // MARK: - Transitions

    /// Début et fin arrivent par notifications Darwin, dans l'ordre, mais
    /// chacun attend WebRTC : sans file, une fin arrivée pendant le
    /// branchement de la piste le verrait « pas encore en partage » et
    /// laisserait l'écran sur l'émetteur.
    private func enqueue(_ operation: @escaping @MainActor (CallScreenShareController) async -> Void) -> Task<Void, Never> {
        let previous = pendingTransition
        let task = Task { [weak self] in
            await previous?.value
            guard let self, !Task.isCancelled else { return }
            await operation(self)
        }
        pendingTransition = task
        return task
    }

    private func performStart() async {
        guard !isSharing else { return }
        guard let host, let callId = host.screenShareCallId, let router = host.screenShareRouter else {
            service.requestBroadcastStop()
            return
        }
        do {
            let activation = try await router.beginScreenShareTrack()
            service.setFrameSink(activation.sink)
            isSharing = true
            emitToggle(callId, true)
            logger.info("screen share started (renegotiation=\(activation.needsRenegotiation))")
            if activation.needsRenegotiation { await host.screenShareNeedsRenegotiation() }
        } catch {
            logger.error("screen share track failed: \(error.localizedDescription)")
            service.requestBroadcastStop()
            reportFailure()
        }
    }

    private func performFinish() async {
        guard isSharing else { return }
        service.setFrameSink(nil)
        isSharing = false
        guard let host, let router = host.screenShareRouter else { return }
        let needsRenegotiation = await router.endScreenShareTrack(restoreCamera: host.screenShareRestoresCamera)
        if let callId = host.screenShareCallId { emitToggle(callId, false) }
        logger.info("screen share stopped (renegotiation=\(needsRenegotiation))")
        if needsRenegotiation { await host.screenShareNeedsRenegotiation() }
    }
}
