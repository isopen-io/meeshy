import Foundation

/// Un fichier candidat à l'éviction sous pression disque (IL8, #11286).
struct DiskPressureCandidate: Equatable {
    let fileName: String
    let modifiedAt: Date
    let sizeBytes: Int
}

/// Règle pure : quels fichiers évincer quand le volume manque d'espace.
/// Sous `triggerFreeBytes` de capacité libre, on évince du plus ancien au
/// plus récent (LRU sur la date de modification) jusqu'à atteindre
/// `targetFreeBytes` ; les fichiers protégés (épingles actives, téléchargements
/// en cours) ne sont jamais des victimes.
enum DiskPressureReclaimPlan {
    static let triggerFreeBytes: Int64 = 512 * 1_024 * 1_024
    static let targetFreeBytes: Int64 = 1_024 * 1_024 * 1_024

    static func victims(
        candidates: [DiskPressureCandidate],
        availableBytes: Int64,
        protectedFileNames: Set<String>,
        triggerFreeBytes: Int64 = DiskPressureReclaimPlan.triggerFreeBytes,
        targetFreeBytes: Int64 = DiskPressureReclaimPlan.targetFreeBytes
    ) -> [DiskPressureCandidate] {
        guard availableBytes < triggerFreeBytes else { return [] }
        let deficit = targetFreeBytes - availableBytes
        let evictable = candidates
            .filter { !protectedFileNames.contains($0.fileName) }
            .sorted { $0.modifiedAt < $1.modifiedAt }
        let cumulative = evictable.reduce(into: [Int64]()) { sums, candidate in
            sums.append((sums.last ?? 0) + Int64(candidate.sizeBytes))
        }
        let count = cumulative.firstIndex { $0 >= deficit }.map { $0 + 1 } ?? evictable.count
        return Array(evictable.prefix(count))
    }
}
