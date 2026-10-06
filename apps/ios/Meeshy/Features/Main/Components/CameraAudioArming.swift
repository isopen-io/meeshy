import AVFoundation

/// **Quand le micro entre dans la session** (#9328).
///
/// Ajouter une entrée à une session DÉJÀ lancée la reconfigure : l'aperçu gèle
/// puis noircit le temps qu'elle se refasse — à l'instant précis où l'auteur
/// commence à filmer. Un micro déjà autorisé entre donc dans la configuration
/// initiale ; un micro jamais demandé attend que le son serve (aucun prompt à
/// l'ouverture d'un viseur photo), et un refus n'empêche pas de filmer muet.
///
/// **Ouvrir le viseur ne coupe pas la musique.** Brancher le micro bascule la
/// session audio de l'app en enregistrement, ce qui interrompt une autre app
/// qui joue : quand une musique tourne, le micro attend donc la prise — comme
/// l'appareil photo, qui ne la coupe qu'en filmant.
nonisolated enum CameraAudioArming {
    static func armsAtSetup(microphone: AVAuthorizationStatus, otherAudioPlaying: Bool) -> Bool {
        microphone == .authorized && !otherAudioPlaying
    }
}
