import Foundation

// MARK: - Démarrer une vidéo n'envoie qu'UNE commande de débit (#17035)

/// **Combien de commandes de débit un démarrage envoie au serveur média.**
///
/// Mesuré sur l'iPhone 18 Pro Max (iOS 27.0.1, rapport HangTracer de la
/// recette porteur) : démarrer une vidéo du fil gelait le fil principal 1 045 ms.
/// Le fil principal exécutait un bloc qu'AVFoundation poste LUI-MÊME à chaque
/// `kFigPlaybackItemNotification_PlayableRangeChanged`
/// (`__avplayeritem_fpItemNotificationCallback_block_invoke`) : quand la
/// notification n'emporte pas les intervalles lisibles, il relit
/// `loadedTimeRanges` (`-[AVPlayerItem _loadedTimeRanges]`) en SYNCHRONE à
/// travers la file de commandes du lecteur. Aucun observateur de l'app n'y
/// prend part (désassemblage d'AVFCore : le bloc est posté sans condition par
/// `avplayeritem_fpItemNotificationCallback`). Le fil principal attend donc
/// toute commande déjà en file — et la file était dans
/// `remoteXPCPlayer_SetRateWithOptions`, un aller-retour synchrone vers le
/// serveur média.
///
/// `play()` suivi de `rate = …` en mettait DEUX en file (compté sur
/// `-[AVPlayer _handleSetRate:…]_block_invoke` : deux passages, même quand la
/// vitesse vaut 1), et un lecteur adopté qui jouait déjà en ajoutait une pour
/// rien. La loi : au plus une commande, et aucune quand le lecteur demande
/// déjà ce débit. Poser `rate` à une valeur non nulle EST démarrer la lecture
/// (même politique d'attente que `play()`).
public nonisolated enum PlaybackStartRateLaw {

    /// Le débit à poser pour démarrer à `speed`, `nil` : le lecteur le demande
    /// déjà, rien ne part vers le serveur. `currentRate` est le débit DEMANDÉ
    /// (`AVPlayer.rate`, lu dans l'état local du lecteur, sans aller-retour).
    public static func rateToSet(currentRate: Float, speed: Float) -> Float? {
        currentRate == speed ? nil : speed
    }
}
