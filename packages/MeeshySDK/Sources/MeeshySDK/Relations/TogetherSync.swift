import Foundation

/// LA LOI DE SYNCHRONISATION DE « ENSEMBLE » (#17097) — portage À L'IDENTIQUE de
/// `apps/web/src/lib/together/together-sync.ts` (mêmes seuils, mêmes cas) : pure, sans horloge ni lecteur.
///
/// - La position COURANTE vaut `positionMs + (horloge serveur − at)` en lecture, `positionMs` en pause. Une horloge
///   locale en retard ne la fait jamais reculer.
/// - L'écart d'horloge serveur − local s'estime par les `at` reçus : un événement arrive toujours APRÈS son `at`, donc
///   chaque échantillon sous-estime l'écart de la latence ; le plus grand est le plus juste.
/// - La dérive se rattrape sans à-coup quand elle est petite (vitesse ±5 %), par un saut au-delà d'une seconde ; en
///   pause, aucun mouvement ne la rattraperait : on saute dès qu'elle se voit.
public enum TogetherSync {

    public enum Correction: Sendable, Equatable {
        case none
        case rate(Double)
        case seek(toMs: Double)
    }

    public enum Gesture: Sendable, Equatable {
        case play
        case pause
        case seek
    }

    public enum GestureEffect: Sendable, Equatable {
        /// Le geste change l'état partagé : il part chez l'autre.
        case send
        /// Il ne fait que réaligner CE lecteur sur la séance.
        case align
    }

    static let nudgeFromMs: Double = 150
    static let seekFromMs: Double = 1_000
    static let pausedToleranceMs: Double = 100
    static let nudge: Double = 0.05

    public static func servedPositionMs(_ playback: TogetherPlayback, serverNowMs: Double) -> Double {
        guard playback.playing else { return playback.positionMs }
        return playback.positionMs + max(0, serverNowMs - playback.at)
    }

    public static func estimateClockOffset(current: Double?, serverAt: Double, localAt: Double) -> Double {
        let measured = serverAt - localAt
        guard let current else { return measured }
        return max(current, measured)
    }

    public static func correction(localMs: Double, targetMs: Double, playing: Bool) -> Correction {
        let drift = localMs - targetMs
        let distance = abs(drift)
        guard playing else { return distance > pausedToleranceMs ? .seek(toMs: targetMs) : .none }
        if distance >= seekFromMs { return .seek(toMs: targetMs) }
        if distance >= nudgeFromMs { return .rate(drift < 0 ? 1 + nudge : 1 - nudge) }
        return .none
    }

    /// Un geste fait ICI ne part chez l'autre que s'il CHANGE l'état partagé : lecture ↔ pause, ou un déplacement d'au
    /// moins une seconde. Sinon il ne fait que réaligner ce lecteur.
    public static func effect(of gesture: Gesture, localMs: Double, targetMs: Double, sharedPlaying: Bool) -> GestureEffect {
        switch gesture {
        case .play: return sharedPlaying ? .align : .send
        case .pause: return sharedPlaying ? .send : .align
        case .seek: return abs(localMs - targetMs) >= seekFromMs ? .send : .align
        }
    }
}
