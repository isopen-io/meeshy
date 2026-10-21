import Foundation

/// Éviction sous pression DISQUE réelle (IL8, #11286) : le volume manque
/// d'espace, indépendamment du budget du store. La règle de choix est dans
/// `DiskPressureReclaimPlan` ; ici, la lecture du volume et la suppression.
extension DiskCacheStore {

    /// `availableBytes` injecté pour les témoins ; `nil` lit la capacité
    /// réelle du volume. Échec de lecture ⇒ aucune éviction (fail-open).
    public func evictUnderDiskPressure(availableBytes: Int64? = nil) async {
        guard let free = availableBytes ?? volumeFreeBytes() else { return }
        let now = Date()
        purgeExpiredPins(now: now)
        let protected = protectedFileNamesUnderPressure()
        let candidates = diskPressureCandidates()
        let victims = DiskPressureReclaimPlan.victims(
            candidates: candidates,
            availableBytes: free,
            protectedFileNames: protected
        )
        victims.forEach { victim in
            memoryCache.removeObject(forKey: victim.fileName as NSString)
            fileTimestamps.removeValue(forKey: victim.fileName)
            fileManager.removeItemLogging(
                at: diskFilePath(for: victim.fileName),
                context: "cache disk-pressure eviction",
                logger: logger
            )
        }
        if !victims.isEmpty {
            logger.debug("Disk pressure eviction: \(victims.count) files removed, free was \(free) bytes")
        }
    }

    private func volumeFreeBytes() -> Int64? {
        do {
            let values = try baseDirectory.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
            return values.volumeAvailableCapacityForImportantUsage
        } catch {
            logger.error("Free disk space unreadable, skipping pressure eviction: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    private func protectedFileNamesUnderPressure() -> Set<String> {
        Set(pinExpiries.keys).union(inFlightTasks.keys)
    }

    private func diskPressureCandidates() -> [DiskPressureCandidate] {
        guard let enumerator = fileManager.enumerator(
            at: baseDirectory,
            includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey],
            options: [.skipsHiddenFiles]
        ) else { return [] }
        return enumerator.allObjects.compactMap { item -> DiskPressureCandidate? in
            guard let fileURL = item as? URL,
                  let values = try? fileURL.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey]),
                  let modDate = values.contentModificationDate,
                  let size = values.fileSize else { return nil }
            return DiskPressureCandidate(fileName: fileURL.lastPathComponent, modifiedAt: modDate, sizeBytes: size)
        }
    }
}
