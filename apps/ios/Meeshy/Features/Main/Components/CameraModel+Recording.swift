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

    /// Seul le jeton de la prise en cours se referme : une fin tardive d'une
    /// autre prise ne libère rien.
    func closeRecordingToken(_ token: String?) {
        guard let token, recordingId == token else { return }
        recordingId = nil
    }

    /// Une prise jamais livrée (session coupée pendant une bascule) ne bloque pas
    /// le viseur suivant.
    func forgetStaleRecording() {
        guard !isRecordingVideo, let ancienne = recordingId else { return }
        segmentTokens = [:]
        abandonRecording(token: ancienne)
    }
}
