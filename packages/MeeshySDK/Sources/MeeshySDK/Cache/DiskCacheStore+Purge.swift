import Foundation

extension DiskCacheStore {
    // MARK: - Purge sélective (mesure et destruction ciblées)
    //
    // Ajouts pour la purge par type × domaine des Réglages. Le store est
    // indexé par `SHA256(url)` et ne connaît aucun domaine métier : c'est
    // l'appelant qui fournit la liste d'URLs qu'il a su attribuer (cf.
    // `CacheMediaAttribution`). Ces primitives ne font donc que deux choses —
    // MESURER ce que pèsent des clés données, et les DÉTRUIRE.

    /// Octets réellement occupés sur disque par `urlStrings`.
    ///
    /// Mesuré fichier par fichier, jamais estimé : une URL dont le fichier
    /// n'est pas (ou plus) en cache compte pour zéro. C'est ce qui permet à
    /// l'UI d'annoncer une taille exacte avant purge plutôt qu'un ordre de
    /// grandeur.
    public func diskBytes(forURLs urlStrings: Set<String>) async -> Int {
        var total = 0
        for urlString in urlStrings {
            let path = diskFilePath(for: Self.fileKey(for: urlString)).path
            guard let size = (try? fileManager.attributesOfItem(atPath: path))?[.size] as? Int else { continue }
            total += size
        }
        return total
    }

    /// Octets occupés par les fichiers que `urlStrings` ne couvre PAS.
    ///
    /// C'est le résidu « non attribué » : des médias bien présents sur disque
    /// dont l'entité porteuse (post, story, message) a quitté le cache GRDB.
    /// Plus personne ne peut les rattacher à un domaine, mais ils occupent une
    /// place réelle — les taire donnerait une somme des cases inférieure à la
    /// taille du cache, ce que l'utilisateur constaterait immédiatement.
    ///
    /// Le sidecar `.pins.json` est exclu du décompte via `.skipsHiddenFiles`,
    /// comme dans `estimatedDiskBytes()`.
    public func unattributedDiskBytes(excluding urlStrings: Set<String>) async -> Int {
        let known = Set(urlStrings.map { Self.fileKey(for: $0) })
        guard let enumerator = fileManager.enumerator(
            at: baseDirectory,
            includingPropertiesForKeys: [.fileSizeKey],
            options: [.skipsHiddenFiles]
        ) else { return 0 }
        var total = 0
        while let fileURL = enumerator.nextObject() as? URL {
            guard !known.contains(fileURL.lastPathComponent) else { continue }
            if let size = (try? fileURL.resourceValues(forKeys: [.fileSizeKey]))?.fileSize {
                total += size
            }
        }
        return total
    }

    /// Détruit les entrées de `urlStrings`, en ANNULANT d'abord tout
    /// téléchargement en vol pour ces clés.
    ///
    /// Sans cette annulation, une purge lancée pendant qu'un média se
    /// télécharge est silencieusement défaite : la tâche réseau se termine
    /// après la suppression et son `save()` réécrit le fichier. L'utilisateur
    /// voit alors le cache regrossir tout seul juste après avoir vidé une
    /// case — le pire des symptômes, parce qu'il ressemble à un bug de mesure
    /// et non à une purge incomplète.
    ///
    /// L'annulation est coopérative : `URLSession.data(from:)` honore
    /// l'annulation de la `Task`, et le `save()` qui suit ne s'exécute pas.
    /// On retire l'entrée du registre AVANT d'annuler pour qu'un appelant
    /// concurrent ne récupère pas une tâche déjà condamnée.
    @discardableResult
    public func purge(urls urlStrings: Set<String>) async -> Int {
        dropHeads(urlStrings)
        var freed = 0
        for urlString in urlStrings {
            let fileKey = Self.fileKey(for: urlString)
            if let inFlight = inFlightTasks.removeValue(forKey: fileKey) {
                inFlight.task.cancel()
            }
            let filePath = diskFilePath(for: fileKey)
            if let size = (try? fileManager.attributesOfItem(atPath: filePath.path))?[.size] as? Int {
                freed += size
            }
            memoryCache.removeObject(forKey: fileKey as NSString)
            fileTimestamps.removeValue(forKey: fileKey)
            fileManager.removeItemLogging(at: filePath, context: "purge sélective", logger: logger)
            // Même raison que dans `invalidate(for:)` : un pin conservé
            // re-protégerait le futur re-téléchargement de la même clé.
            loadPinsIfNeeded()
            if pinExpiries.removeValue(forKey: fileKey) != nil { persistPins() }
        }
        return freed
    }

    /// Détruit tout ce que `urlStrings` ne couvre PAS (le résidu non attribué).
    @discardableResult
    public func purgeUnattributed(excluding urlStrings: Set<String>) async -> Int {
        let known = Set(urlStrings.map { Self.fileKey(for: $0) })
        guard let enumerator = fileManager.enumerator(
            at: baseDirectory,
            includingPropertiesForKeys: [.fileSizeKey],
            options: [.skipsHiddenFiles]
        ) else { return 0 }
        var victims: [(url: URL, size: Int)] = []
        while let fileURL = enumerator.nextObject() as? URL {
            guard !known.contains(fileURL.lastPathComponent) else { continue }
            let size = (try? fileURL.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0
            victims.append((fileURL, size))
        }
        var freed = 0
        for victim in victims {
            let fileKey = victim.url.lastPathComponent
            if let inFlight = inFlightTasks.removeValue(forKey: fileKey) {
                inFlight.task.cancel()
            }
            memoryCache.removeObject(forKey: fileKey as NSString)
            fileTimestamps.removeValue(forKey: fileKey)
            fileManager.removeItemLogging(at: victim.url, context: "purge résidu non attribué", logger: logger)
            freed += victim.size
        }
        return freed
    }
}
