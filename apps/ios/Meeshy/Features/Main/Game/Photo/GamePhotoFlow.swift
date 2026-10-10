import Foundation

/// LE DÉROULÉ DE LA PHOTO (#9382) — un réducteur PUR (conception, partie VI) :
/// proposition → caméra → frappe en place → résultat. L'écran lui envoie des
/// événements et lit l'étape ; il ne peut pas produire une étape impossible
/// (déclencher une caméra qui n'est pas vivante, partager avant d'avoir
/// composé) : l'événement hors de son étape est ignoré. Miroir de
/// `apps/web/src/lib/game-photo/flow.ts`.
///
/// Le refus de la caméra n'est pas une impasse : sa raison est NOMMÉE dans
/// l'état, et la galerie comme la carte seule restent possibles depuis tous ses
/// états.
nonisolated enum PhotoCameraPhase: Equatable, Sendable {
    case opening
    case live
    case failed(CameraFailure)
}

nonisolated enum PhotoFlowState: Equatable, Sendable {
    case offer
    case camera(PhotoCameraPhase)
    case striking(PhotoMode)
    case result(PhotoMode, kept: Bool?)
    case failed
    case done(deferred: Bool)
}

nonisolated enum PhotoFlowEvent: Equatable, Sendable {
    case selfie
    case card
    case later
    case close
    case cameraReady
    case cameraFailed(CameraFailure)
    case shutter
    case gallery
    case composed
    case composeFailed
    case kept(Bool)
}

nonisolated enum GamePhotoFlow {
    static func reduce(_ state: PhotoFlowState, _ event: PhotoFlowEvent) -> PhotoFlowState {
        if case .done = state { return state }
        if event == .close { return .done(deferred: false) }

        switch state {
        case .offer:
            switch event {
            case .selfie: return .camera(.opening)
            case .card: return .striking(.card)
            case .later: return .done(deferred: true)
            default: return state
            }
        case .camera(let phase):
            switch event {
            case .cameraReady where phase == .opening: return .camera(.live)
            case .cameraFailed(let reason): return .camera(.failed(reason))
            case .shutter where phase == .live: return .striking(.selfie)
            case .gallery: return .striking(.gallery)
            case .card: return .striking(.card)
            default: return state
            }
        case .striking(let mode):
            switch event {
            case .composed: return .result(mode, kept: nil)
            case .composeFailed: return .failed
            default: return state
            }
        case .result(let mode, _):
            if case .kept(let ok) = event { return .result(mode, kept: ok) }
            return state
        case .failed, .done:
            return state
        }
    }
}
