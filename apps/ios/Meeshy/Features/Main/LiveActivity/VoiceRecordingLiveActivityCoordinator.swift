import Foundation
import Combine
import UIKit

/// **Exécute `VoiceRecordingActivityLaw`** depuis l'enregistreur de la
/// conversation qui enregistre (#9784).
///
/// La conversation déclare sa prise au démarrage (`track`) avec SES gestes
/// d'arrêt et d'abandon — ceux de son composeur : « Arrêter » pose le vocal
/// dans le tiroir comme le bouton stop, « Annuler » le jette. L'îlot n'a donc
/// aucun chemin à lui, et ne peut pas laisser un enregistrement que le
/// composeur ignorerait. La session s'oublie dès que l'enregistreur s'arrête.
@MainActor
final class VoiceRecordingLiveActivityCoordinator {
    nonisolated deinit {}

    static let shared = VoiceRecordingLiveActivityCoordinator()

    private struct Session {
        weak var recorder: AudioRecorderManager?
        let conversationId: String
        let title: String
        let onStop: () -> Void
        let onCancel: () -> Void
    }

    private var session: Session?
    private var running: VoiceRecordingActivityLaw.Running?
    private var cancellables = Set<AnyCancellable>()
    private lazy var host: (any LiveActivityHostProviding<VoiceRecordingSnapshot>)? = makeHost()
    private var didEndOrphans = false

    func track(
        recorder: AudioRecorderManager,
        conversationId: String,
        title: String,
        onStop: @escaping () -> Void,
        onCancel: @escaping () -> Void
    ) {
        if !didEndOrphans {
            didEndOrphans = true
            host?.endOrphans()
        }
        LiveActivityCommandBinding.shared.install()
        session = Session(
            recorder: recorder,
            conversationId: conversationId,
            title: title,
            onStop: onStop,
            onCancel: onCancel
        )
        cancellables = []
        recorder.objectWillChange
            .throttle(for: .milliseconds(500), scheduler: DispatchQueue.main, latest: true)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.apply() }
            .store(in: &cancellables)
        apply()
    }

    /// Le bouton « Arrêter » de l'îlot : le geste stop du composeur.
    func stop() {
        guard let session, session.recorder?.isRecording == true else { return finish() }
        session.onStop()
        apply()
    }

    /// Le bouton « Annuler » de l'îlot : le geste d'abandon du composeur.
    func cancel() {
        guard let session, session.recorder?.isRecording == true else { return finish() }
        session.onCancel()
        apply()
    }

    private func makeHost() -> (any LiveActivityHostProviding<VoiceRecordingSnapshot>)? {
        #if canImport(ActivityKit)
        guard #available(iOS 16.1, *) else { return nil }
        return LiveActivityHost<VoiceRecordingActivityAttributes> {
            VoiceRecordingActivityAttributes(labels: VoiceRecordingLabels(
                stop: String(localized: "composer.recording.stopAndAttach", defaultValue: "Arrêter et ajouter aux pièces jointes", bundle: .main),
                cancel: String(localized: "composer.recording.cancel", defaultValue: "Annuler l'enregistrement", bundle: .main)
            ))
        }
        #else
        return nil
        #endif
    }

    private static var wording: VoiceRecordingActivityLaw.Wording {
        VoiceRecordingActivityLaw.Wording(
            recording: String(localized: "composer.recording.inProgress", defaultValue: "Enregistrement en cours", bundle: .main)
        )
    }

    private func apply() {
        guard let host else { return }
        let step = VoiceRecordingActivityLaw.step(running: running, input: input(), wording: Self.wording)
        running = step.running
        switch step.action {
        case .none:
            return
        case .start(let snapshot):
            host.start(snapshot)
        case .update(let snapshot):
            host.update(snapshot)
        case .end(let snapshot):
            host.end(snapshot, dismissAfter: 0)
            forgetSession()
        }
    }

    private func input() -> VoiceRecordingActivityLaw.Input? {
        guard let session, let recorder = session.recorder, recorder.isRecording else { return nil }
        return VoiceRecordingActivityLaw.Input(
            isRecording: true,
            conversationId: session.conversationId,
            title: session.title,
            startedAt: Date().addingTimeInterval(-recorder.duration),
            levels: recorder.audioLevels.map { Double($0) },
            now: Date()
        )
    }

    /// Un bouton touché sans enregistrement vivant (app relancée, prise déjà
    /// close) ferme ce qui reste — jamais un enregistrement fantôme.
    private func finish() {
        guard let host else { return }
        if let running {
            var final = running.snapshot
            final.isFinished = true
            host.end(final, dismissAfter: 0)
        } else {
            host.endOrphans()
        }
        running = nil
        forgetSession()
    }

    private func forgetSession() {
        session = nil
        cancellables = []
    }
}
