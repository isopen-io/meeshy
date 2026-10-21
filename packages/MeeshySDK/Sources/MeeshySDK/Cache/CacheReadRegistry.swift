import Foundation
import os

/// Horloge des fichiers que le store vient de REMETTRE à un lecteur (IL8, #11286).
///
/// Un player reçoit une URL de fichier (`cachedFileURL(for:)`,
/// `localFileURL(for:)`) puis lit le fichier À CÔTÉ du store, sans le prévenir
/// de la fin de sa lecture. L'éviction sous pression disque ne peut donc pas
/// savoir qu'un fichier est « en cours de lecture » ; elle sait en revanche
/// qu'il vient d'être servi. Un fichier servi depuis moins de
/// `window` n'est jamais une victime de pression : c'est ce qui empêche la
/// passe de retirer le fichier qu'un player s'apprête à ouvrir. Au-delà de la
/// fenêtre, un player qui a déjà OUVERT le fichier continue de le lire après
/// sa suppression (le descripteur garde l'inode vivant).
///
/// Lecture et écriture sans saut d'acteur : `cachedFileURL(for:)` est
/// `nonisolated` et rend son URL avant que toute tâche ait pu s'exécuter.
final class CacheReadRegistry: Sendable {
    let window: TimeInterval
    private let pruneThreshold: Int
    private let lastRead = OSAllocatedUnfairLock<[String: Date]>(initialState: [:])

    init(window: TimeInterval = 30 * 60, pruneThreshold: Int = 256) {
        self.window = window
        self.pruneThreshold = pruneThreshold
    }

    func noteRead(_ fileKey: String, at date: Date = Date()) {
        let cutoff = date.addingTimeInterval(-window)
        let threshold = pruneThreshold
        lastRead.withLock { reads in
            reads[fileKey] = date
            guard reads.count > threshold else { return }
            reads = reads.filter { $0.value >= cutoff }
        }
    }

    /// Clés de fichier lues depuis moins de `window` à `now` ; les plus
    /// anciennes quittent le registre au passage, qui reste ainsi borné.
    func recentlyRead(now: Date = Date()) -> Set<String> {
        let cutoff = now.addingTimeInterval(-window)
        return lastRead.withLock { reads in
            reads = reads.filter { $0.value >= cutoff }
            return Set(reads.keys)
        }
    }
}
