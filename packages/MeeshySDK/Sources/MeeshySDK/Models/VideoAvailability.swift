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

    /// La vidéo se JOUE-t-elle maintenant (#12027) ? Oui si son fichier est sur
    /// le disque, ou si un téléchargement DÉJÀ autorisé de ce fichier est
    /// lisible : la surface lit la tête pendant que le reste arrive. Jamais
    /// quand rien n'est en cours — la lecture n'ouvre aucun transfert.
    public func playsNow(
        fileUrl: String,
        hasReadableTransfer: (String) -> Bool = { CacheCoordinator.videoHasReadableTransfer(for: $0) }
    ) -> Bool {
        switch self {
        case .ready: return true
        case .needsDownload: return false
        case .downloading: return Self.playsWhileDownloading(fileUrl: fileUrl, hasReadableTransfer: hasReadableTransfer)
        }
    }

    /// Un téléchargement de `fileUrl` est-il lisible, sous la clé que le cache
    /// lui donne (l'URL résolue) ? Un fichier local n'est jamais un transfert.
    public static func playsWhileDownloading(
        fileUrl: String,
        hasReadableTransfer: (String) -> Bool = { CacheCoordinator.videoHasReadableTransfer(for: $0) }
    ) -> Bool {
        guard let resolved = MeeshyConfig.resolveMediaURL(fileUrl), !resolved.isFileURL else { return false }
        return hasReadableTransfer(resolved.absoluteString)
    }
}
