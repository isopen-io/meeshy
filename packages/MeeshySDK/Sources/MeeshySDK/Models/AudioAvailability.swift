import Foundation

/// Disponibilité de lecture d'un audio dans une bulle de message.
/// Pilote l'état du bouton de tête de `AudioPlayerView` :
/// `.ready` → play, `.needsDownload` → bouton télécharger,
/// `.downloading` → anneau de progression + label « 410 KB / 850 KB ».
public enum AudioAvailability: Equatable, Sendable {
    /// Jouable immédiatement : fichier local présent OU audio en cache.
    case ready
    /// Audio serveur pas encore en cache : un téléchargement est requis.
    case needsDownload
    /// Téléchargement en cours.
    /// - `progress` dans [0, 1] ; 0 = indéterminé.
    /// - `downloadedBytes` / `totalBytes` permettent au label de rendre
    ///   « 410 KB / 850 KB » côté `AudioPlayerView`. Mettre à 0 quand
    ///   inconnu — le label retombe alors sur la simple progress.
    case downloading(progress: Double, downloadedBytes: Int64, totalBytes: Int64)

    /// Convenience init backward-compatible — anciens call sites qui ne
    /// connaissent pas le poids continuent à compiler sans changement.
    public static func downloading(progress: Double) -> AudioAvailability {
        .downloading(progress: progress, downloadedBytes: 0, totalBytes: 0)
    }

    /// Résout la disponibilité « au repos » (hors téléchargement actif) à
    /// partir de faits déjà collectés. Fonction pure : testable sans I/O.
    /// - Parameters:
    ///   - isLocalFile: l'URL de l'attachment utilise le schéma `file://`.
    ///   - localFileExists: le fichier local existe sur le disque.
    ///   - isServerCached: l'audio serveur est présent dans le cache disque.
    public static func resolve(
        isLocalFile: Bool,
        localFileExists: Bool,
        isServerCached: Bool
    ) -> AudioAvailability {
        if isLocalFile {
            return localFileExists ? .ready : .needsDownload
        }
        return isServerCached ? .ready : .needsDownload
    }
}
