import AVFoundation
import MeeshySDK

/// **L'édition n'a pas besoin de l'objectif** (#9352) : la session s'arrête sans
/// rien démonter — entrées, sorties et réglages restent en place — et repart
/// telle quelle quand on revient viser. Par la file de la session, comme tout
/// démarrage et tout arrêt. La caméra de recette ne touche ni la session ni sa
/// file : elle n'a rien à suspendre.
extension CameraModel {

    /// La dernière trame retourne au pool : elle ne se montrera pas figée au retour.
    func pauseRunning() {
        guard !runsFixture else { return }
        liveFeed.flush()
        sessionQueue.setRunning(false, session)
    }

    /// Sans accès à la caméra rien n'a été monté : rien ne repart.
    func resumeRunning() {
        guard !runsFixture, permission.isUsable else { return }
        sessionQueue.setRunning(true, session)
    }
}
