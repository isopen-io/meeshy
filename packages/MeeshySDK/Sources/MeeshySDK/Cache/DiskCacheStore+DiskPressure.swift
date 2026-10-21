import Foundation

/// Éviction sous pression DISQUE réelle (IL8, #11286) : le volume manque
/// d'espace, indépendamment du budget du store. La règle de choix est dans
/// `DiskPressureReclaimPlan` ; ici, la lecture du volume et la suppression.
/// Jamais une victime : une épingle active, un téléchargement en cours, un
/// fichier servi par URL depuis moins de `readRegistry.window`.
extension DiskCacheStore {

    /// `availableBytes` injecté pour les témoins ; `nil` lit la capacité
    /// réelle du volume. Échec de lecture ⇒ aucune éviction (fail-open).
    public func evictUnderDiskPressure(availableBytes: Int64? = nil) async {
        guard let free = availableBytes ?? volumeFreeBytes() else { return }
        let now = Date()
        purgeExpiredPins(now: now)
        let protected = protectedFileNamesUnderPressure(now: now)
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

    /// URL NEUVE à chaque lecture : une `URL` garde en cache les valeurs de
    /// ressource déjà lues, et rien ne vide ce cache sur l'exécuteur d'un
    /// acteur. Relire `baseDirectory` rendrait l'espace libre du premier appel
    /// pour toute la vie du store.
    private func volumeFreeBytes() -> Int64? {
        let volumeProbe = URL(fileURLWithPath: baseDirectory.path, isDirectory: true)
        do {
            let values = try volumeProbe.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
            return values.volumeAvailableCapacityForImportantUsage
        } catch {
            logger.error("Free disk space unreadable, skipping pressure eviction: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    private func protectedFileNamesUnderPressure(now: Date) -> Set<String> {
        Set(pinExpiries.keys)
            .union(inFlightTasks.keys)
            .union(readRegistry.recentlyRead(now: now))
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
