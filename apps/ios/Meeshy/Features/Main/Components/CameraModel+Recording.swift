import Foundation

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
