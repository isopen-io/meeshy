import Foundation
import os

/// Emplacement disque des files persistantes (`Documents/meeshy_cache/<fichier>`).
/// Crée le dossier au besoin et journalise l'échec dans la catégorie de la file
/// appelante — un dossier indisponible ne bloque jamais l'appelant, l'écriture
/// qui suit échouera et sera journalisée par lui.
struct QueueFileLocation: Sendable {
    static let directoryName = "meeshy_cache"

    let logCategory: MeeshyLog.Category

    /// Dossier `meeshy_cache` SANS création (chemins de lecture).
    static var directoryURL: URL {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return documents.appendingPathComponent(directoryName, isDirectory: true)
    }

    /// URL d'un fichier de lecture, sans effet de bord.
    static func readURL(fileName: String) -> URL {
        directoryURL.appendingPathComponent(fileName)
    }

    /// URL d'un fichier d'écriture : le dossier est créé s'il manque.
    func writeURL(fileName: String) -> URL {
        let cacheDir = Self.directoryURL
        if !FileManager.default.fileExists(atPath: cacheDir.path) {
            do {
                try FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
            } catch {
                MeeshyLog.logger(logCategory, subsystem: .legacySDK)
                    .error("Cache directory unavailable — the queue file cannot be persisted: \(error.localizedDescription, privacy: .public)")
            }
        }
        return cacheDir.appendingPathComponent(fileName)
    }
}
