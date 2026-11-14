import Foundation

/// **Ce que la session de capture peut faire MAINTENANT, dérivé d'elle seule** (#17433).
///
/// Le viseur affichait son aperçu pendant que le déclencheur disait « La caméra n'est pas
/// prête » : la couche d'aperçu garde sa dernière image quand la session s'arrête ou
/// s'interrompt, et l'attente du toucher comptait trois secondes depuis le doigt, quel que
/// soit l'état de la session. L'état se lit désormais sur les faits de la session réelle —
/// vœu de marche, marche, interruption et sa raison, bascule, connexion photo — et l'attente
/// se décide d'après lui : une session qui démarre ou qui se remet d'une interruption
/// réparable mérite qu'on l'attende ; une session que personne ne veut, jamais.
nonisolated enum CameraCaptureAvailability: Equatable, Sendable {
    /// Personne ne veut la session : le viseur est fermé.
    case closed
    /// Voulue, pas encore en marche.
    case starting
    /// Un objectif s'installe.
    case switching
    /// La session s'est interrompue ; la raison est celle d'AVFoundation.
    case interrupted(reason: Int?)
    /// En marche, mais la connexion photo n'écrit pas.
    case stalled
    /// Une photo peut partir.
    case ready

    /// Les faits que la session expose, relus à chaque question.
    nonisolated struct Facts: Equatable, Sendable {
        var wantsToRun: Bool
        var isRunning: Bool
        var isInterrupted: Bool
        var interruptionReason: Int?
        var isSwitching: Bool
        var hasPhotoConnection: Bool
        var photoConnectionIsActive: Bool
        var photoConnectionIsEnabled: Bool
    }

    static func resolve(_ facts: Facts) -> CameraCaptureAvailability {
        guard facts.wantsToRun else { return .closed }
        guard !facts.isSwitching else { return .switching }
        guard !facts.isInterrupted else { return .interrupted(reason: facts.interruptionReason) }
        guard facts.isRunning else { return .starting }
        let ecrit = CameraRecordingReadiness.mayCapturePhoto(
            sessionIsRunning: facts.isRunning, hasVideoConnection: facts.hasPhotoConnection,
            connectionIsActive: facts.photoConnectionIsActive, connectionIsEnabled: facts.photoConnectionIsEnabled)
        return ecrit ? .ready : .stalled
    }
}

/// **Ce que fait un toucher qui attend la session** (#17433) : il part dès qu'elle est prête,
/// il attend tant qu'elle s'en approche, et il renonce seulement quand elle n'y arrivera pas.
nonisolated enum CameraCaptureWait {

    enum Decision: Equatable, Sendable {
        case shoot
        case wait
        case giveUp
    }

    /// Ce qu'on accorde à une session qui démarre, bascule ou se remet d'une interruption
    /// réparable : un démarrage à froid prend ≈ 0,7 s, la reprise après le retrait du micro
    /// autant ; au-delà de six secondes, quelque chose est cassé.
    static let recoveringBudget: TimeInterval = 6
    /// Ce qu'on accorde à une session en marche dont la connexion n'écrit pas encore, ou
    /// interrompue pour une raison que seul le système lèvera.
    static let settledBudget: TimeInterval = 3

    static func decide(_ availability: CameraCaptureAvailability, elapsed: TimeInterval,
                       settledBudget: TimeInterval = CameraCaptureWait.settledBudget) -> Decision {
        switch availability {
        case .ready: return .shoot
        case .closed: return .giveUp
        case .starting, .switching:
            return elapsed < max(recoveringBudget, settledBudget) ? .wait : .giveUp
        case .interrupted(let raison):
            let budget = CameraInterruptionResponse.response(reason: raison, isRecording: false) == .dropMicrophoneAndResume
                ? max(recoveringBudget, settledBudget) : settledBudget
            return elapsed < budget ? .wait : .giveUp
        case .stalled:
            return elapsed < settledBudget ? .wait : .giveUp
        }
    }
}

/// **Une interruption se TRAITE, elle ne se subit pas** (#17433).
///
/// Le micro entre dans la session dès l'armement d'un viseur qui filme. Quand un autre client
/// audio prend l'appareil (talkie, vocal, appel), AVFoundation interrompt TOUTE la session —
/// la vidéo comprise — avec la raison `audioDeviceInUseByAnotherClient` : l'aperçu se fige sur
/// sa dernière image et le déclencheur refuse. Hors prise, retirer le micro rend l'objectif ;
/// il revient de lui-même à la prochaine vidéo (`enableAudioCaptureIfNeeded`). Les autres
/// raisons (arrière-plan, objectif pris, pression système) se lèvent seules.
nonisolated enum CameraInterruptionResponse: Equatable, Sendable {
    case dropMicrophoneAndResume
    case waitForEnd

    /// `AVCaptureSession.InterruptionReason.audioDeviceInUseByAnotherClient`.
    static let audioDeviceInUseByAnotherClient = 2

    static func response(reason: Int?, isRecording: Bool) -> CameraInterruptionResponse {
        guard reason == audioDeviceInUseByAnotherClient, !isRecording else { return .waitForEnd }
        return .dropMicrophoneAndResume
    }
}
