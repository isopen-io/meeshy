import Foundation

/// Disponibilité de lecture d'une vidéo dans une bulle de message. Miroir
/// d'`AudioAvailability` pour la cohérence des composants média.
public enum VideoAvailability: Equatable, Sendable {
    case ready
    case needsDownload
    case downloading(progress: Double)

    /// Pure resolution (hors téléchargement actif) à partir de faits déjà
    /// collectés. Fonction pure, testable sans I/O.
    public static func resolve(
        isLocalFile: Bool,
        localFileExists: Bool,
        isServerCached: Bool
    ) -> VideoAvailability {
        if isLocalFile {
            return localFileExists ? .ready : .needsDownload
        }
        return isServerCached ? .ready : .needsDownload
    }
}
