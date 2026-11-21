import Foundation
import MeeshySDK

/// LE MOUVEMENT PART AVEC MA POSITION (#19887). Posé devant l'émetteur du partage, il joint à chaque relevé l'activité
/// de l'appareil, sans que le centre d'envoi n'ait rien à en savoir.
///
/// Une passerelle d'avant #19887 tient un schéma STRICT : elle refuse la clé `motion` (`INVALID`). Le même relevé
/// repart alors aussitôt sans elle ; s'il passe, aucun mouvement ne part plus jusqu'à l'arrêt du partage. S'il est
/// refusé aussi, le mouvement n'y était pour rien et reste joint. Une liste seule n'a pas de position : elle part telle
/// quelle. Arrêter le partage cesse d'écouter l'activité, et le partage suivant retente le mouvement.
@MainActor
final class SharedLocationMotionTaggingEmitter: SharedLocationEmitting {
    private nonisolated let inner: SharedLocationEmitting
    private let motion: SharedLocationMotionProviding
    private var attachesMotion = true

    nonisolated deinit {}

    init(inner: SharedLocationEmitting, motion: SharedLocationMotionProviding) {
        self.inner = inner
        self.motion = motion
    }

    nonisolated var isConnected: Bool { inner.isConnected }

    nonisolated func start(_ request: SharedLocationStartRequest) async -> SharedLocationStartVerdict {
        await startTagged(request)
    }

    nonisolated func update(_ fix: SharedLocationFix) async -> SharedLocationStartVerdict {
        await updateTagged(fix)
    }

    nonisolated func stop() async -> Bool {
        await stopListening()
        return await inner.stop()
    }

    // MARK: - Sur le main, où vit l'état du partage

    private func startTagged(_ request: SharedLocationStartRequest) async -> SharedLocationStartVerdict {
        guard !request.isListOnly else { return await inner.start(request) }
        motion.begin()
        let tagged = request.withMotion(currentMotion)
        guard tagged.carriesMotion else { return await inner.start(request.withMotion(nil)) }
        let verdict = await inner.start(tagged)
        guard verdict == .refused(.invalid) else { return verdict }
        return settleRetry(await inner.start(request.withMotion(nil)))
    }

    private func updateTagged(_ fix: SharedLocationFix) async -> SharedLocationStartVerdict {
        motion.begin()
        guard let current = currentMotion else { return await inner.update(fix.withMotion(nil)) }
        let verdict = await inner.update(fix.withMotion(current))
        guard verdict == .refused(.invalid) else { return verdict }
        return settleRetry(await inner.update(fix.withMotion(nil)))
    }

    private func stopListening() {
        motion.end()
        attachesMotion = true
    }

    private var currentMotion: SharedLocationMotion? {
        attachesMotion ? motion.latest : nil
    }

    /// Le relevé sans mouvement est ACCEPTÉ là où le relevé avec mouvement était refusé : la passerelle ne lit pas la
    /// clé. Tout autre verdict (refus, hors ligne, accusé perdu) ne prouve rien, et le mouvement reste joint.
    private func settleRetry(_ verdict: SharedLocationStartVerdict) -> SharedLocationStartVerdict {
        if case .started = verdict { attachesMotion = false }
        return verdict
    }
}
