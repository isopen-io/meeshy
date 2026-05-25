import Foundation

/// Disponibilité de lecture d'un audio dans une bulle de message.
/// Pilote l'état du bouton de tête de `AudioPlayerView` :
/// `.ready` → play, `.needsDownload` → bouton télécharger,
/// `.downloading` → anneau de progression.
public enum AudioAvailability: Equatable, Sendable {
    /// Jouable immédiatement : fichier local présent OU audio en cache.
    case ready
    /// Audio serveur pas encore en cache : un téléchargement est requis.
    case needsDownload
    /// Téléchargement en cours. `progress` dans [0, 1] ; 0 = indéterminé.
    case downloading(progress: Double)

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
