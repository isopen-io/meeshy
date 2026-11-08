import AVFoundation
import UIKit
import Combine

/// **Chaque prise vidéo a son jeton, de son départ à sa livraison** (#9351).
///
/// Le fichier arrive après l'arrêt — parfois bien après, une fusion de bascule
/// prenant plus d'une seconde. Le jeton suit donc le FICHIER (`segmentTokens`)
/// et non l'instant de livraison, et une nouvelle prise attend que la précédente
/// soit livrée ou perdue : l'intention de l'une ne passe jamais à l'autre.
extension CameraModel {

    /// La prise finit sans fichier : son jeton se referme, et la capture l'apprend.
    func abandonRecording(token: String?) {
        abandonedRecordingId = token
        closeRecordingToken(token)
    }

    /// La prise précédente est arrêtée mais pas encore livrée : la suivante l'attend.
    /// Après l'arrêt, `isRecordingVideo` reste vrai jusqu'au délégué d'AVFoundation ;
    /// pendant la fusion d'une bascule, il est déjà faux.
    var recordingIsPending: Bool {
        recordingId != nil && (!isRecordingVideo || stopIsRequested)
    }
}

/// **Une prise close par le système n'est pas une prise perdue** (OPUS-11).
///
/// Un appel entrant, le passage en arrière-plan, Siri, la durée ou la taille
/// maximale, un disque presque plein : AVFoundation clôt l'enregistrement avec
/// une erreur, mais le fichier est VALIDE (`AVErrorRecordingSuccessfullyFinishedKey`).
/// Le jeter perdait la vidéo entière, sans un mot. Seule une erreur sans fichier
/// lisible est une perte — et même alors, les segments déjà pris d'une bascule
/// d'objectif restent.
enum CameraRecordingEnding: Equatable {
    /// L'arrêt demandé, ou la fin d'un segment de bascule.
    case finished
    /// Le système a clos la prise ; son fichier est lisible.
    case interrupted
    /// Le fichier de ce segment est inutilisable.
    case lost

    /// La suite de la prise, selon la fin du segment et ce qui est déjà gardé.
    enum Next: Equatable {
        /// La machine habituelle : arrêt voulu, ou reprise après une bascule.
        case asUsual
        /// La prise se clôt sur ce qui a été filmé, et l'auteur l'apprend.
        case keepWhatWasFilmed
        /// Rien n'est lisible : la prise se termine sans fichier.
        case nothingToKeep
    }

    static func of(_ error: Error?) -> CameraRecordingEnding {
        guard let error else { return .finished }
        let fichierValide = (error as NSError).userInfo[AVErrorRecordingSuccessfullyFinishedKey] as? Bool
        return fichierValide == true ? .interrupted : .lost
    }

    var keepsFile: Bool { self != .lost }

    /// `keptSegments` compte les segments gardés, celui-ci compris s'il l'est.
    func next(keptSegments: Int) -> Next {
        switch self {
        case .finished: return .asUsual
        case .interrupted: return .keepWhatWasFilmed
        case .lost: return keptSegments > 0 ? .keepWhatWasFilmed : .nothingToKeep
        }
    }
}

/// **Une prise coupée ou perdue se dit** (OPUS-11). La vidéo coupée : l'auteur
/// apprend que ce qui a été filmé est gardé. Revenu d'un appel ou de
/// l'arrière-plan, l'avis attend que l'app soit au premier plan : affiché pendant
/// l'absence, personne ne le verrait. La photo qu'AVFoundation ne rend pas :
/// une haptique d'erreur et un message, plus un déclencheur qui se tait.
@MainActor
enum CameraTakeNotice {

    static var recordingInterrupted: String {
        String(localized: "camera.recording.interrupted",
               defaultValue: "Vidéo interrompue. Ce qui a été filmé est gardé.", bundle: .main)
    }

    static var photoLost: String {
        String(localized: "camera.photo.lost",
               defaultValue: "La photo n'a pas pu être prise. Réessayez.", bundle: .main)
    }

    static func announceInterruptedRecording() {
        guard UIApplication.shared.applicationState == .active else { return announceOnReturn() }
        FeedbackToastManager.shared.showNotice(recordingInterrupted)
    }

    static func announceLostPhoto() {
        FeedbackToastManager.shared.showError(photoLost)
    }

    /// Le premier retour au premier plan, une fois : l'abonnement se retire avec l'avis.
    private static var onReturn: AnyCancellable?

    private static func announceOnReturn() {
        onReturn = NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)
            .first()
            .receive(on: DispatchQueue.main)
            .sink { _ in
                MainActor.assumeIsolated {
                    onReturn = nil
                    FeedbackToastManager.shared.showNotice(recordingInterrupted)
                }
            }
    }
}
