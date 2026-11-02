import MeeshySDK
import MeeshyUI

/// **Un appel Meeshy entrant BAISSE le son Meeshy pendant qu'il sonne, et
/// l'ARRÊTE quand on décroche** (#11063, décision porteur h du 2026-10-20).
///
/// - L'appel entrant sonne ⇒ la vidéo, le vocal, le PiP en cours baissent
///   (`RecordingPlaybackDucker`, le même mécanisme que pendant un
///   enregistrement, #11042) : ils restent audibles sous la sonnerie.
/// - On décroche ⇒ la lecture s'arrête, marquée « interrompue » : elle reprend
///   au raccrochage (`.callEndedShouldResume`, #11040). Le volume revient à sa
///   valeur d'avant pendant qu'elle est en pause.
/// - On refuse, l'appel est manqué ou annulé ⇒ le volume remonte.
/// - Un appel SORTANT (c'est l'utilisateur qui l'a lancé) arrête la lecture
///   tout de suite, comme avant.
///
/// Un appel téléphonique ou FaceTime ne passe pas par ici : iOS interrompt la
/// session, et les lecteurs suivent son signal.
nonisolated enum CallRingPlaybackLaw {

    enum Effect: Equatable {
        case none
        /// L'appel entrant sonne : baisser.
        case duck
        /// L'appel prend la main : arrêter, marqué « interrompu ».
        case interrupt
        /// L'appel entrant est décroché : arrêter, puis rendre le volume.
        case interruptAndRestore
        /// L'appel entrant a cessé de sonner sans être pris : rendre le volume.
        case restore
    }

    static func effect(from old: CallState, to new: CallState) -> Effect {
        let wasRingingIn = isRingingIn(old)
        let ringsIn = isRingingIn(new)
        if wasRingingIn {
            if ringsIn { return .none }
            return new.isActive ? .interruptAndRestore : .restore
        }
        guard !old.isActive, new.isActive else { return .none }
        return ringsIn ? .duck : .interrupt
    }

    private static func isRingingIn(_ state: CallState) -> Bool {
        state == .ringing(isOutgoing: false)
    }
}

/// Applique `CallRingPlaybackLaw` aux lecteurs de Meeshy.
@MainActor
enum CallRingPlayback {

    static func apply(_ effect: CallRingPlaybackLaw.Effect) {
        switch effect {
        case .none:
            break
        case .duck:
            RecordingPlaybackDucker.shared.duck()
        case .interrupt:
            interrupt()
        case .interruptAndRestore:
            interrupt()
            RecordingPlaybackDucker.shared.restore()
        case .restore:
            RecordingPlaybackDucker.shared.restore()
        }
    }

    /// AVANT l'arrêt : la suspension des vocaux doit lire si la lecture était
    /// en cours pour décider de la reprise.
    private static func interrupt() {
        ConversationAudioCoordinator.shared.suspendForSystemCall()
        PlaybackCoordinator.shared.interruptAllForCall()
    }
}
