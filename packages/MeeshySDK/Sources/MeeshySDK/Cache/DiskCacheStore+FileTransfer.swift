import Foundation
import os

/// Le transfert EN FLUX vers un fichier (#9863).
///
/// `URLSession.data(for:)` rend le média entier en mémoire : une vidéo de 30 Mo
/// préchargée par le pager de réels ou par une story passait 30 Mo de RAM avant
/// de toucher le disque. Un store `streamedToFile` télécharge vers un fichier
/// (`MediaFileDownloader`), puis le DÉPLACE sous sa clé : aucun octet ne
/// transite par un `Data`, et le `Data` que rendent encore `data(for:)` est
/// projeté depuis le disque (`mappedIfSafe`), sans copie résidente.
///
/// Les directives de fraîcheur (#9478) restent celles de
/// `store(_:for:honoring:)`, lues par la même règle (`MediaCacheDirective`).
extension DiskCacheStore {
    /// Comment le funnel réseau rapatrie un média. Les images (petites,
    /// décodées depuis la mémoire) restent `inMemory` ; l'audio et la vidéo
    /// passent `streamedToFile`.
    public enum NetworkTransfer: Sendable {
        case inMemory
        case streamedToFile
    }

    /// Comme `data(for:)`, mais le transfert se fait TOUJOURS en flux vers un
    /// fichier et rapporte sa progression (cadencée par `MediaFileDownloader`).
    /// Rejoindre un téléchargement déjà en vol ne rapporte aucune progression.
    /// Annuler la `Task` appelante annule le transfert qu'elle a OUVERT, jamais
    /// celui qu'elle a seulement rejoint.
    public func data(
        for urlString: String,
        profile: MediaTransferProfile = .standard,
        progress: @escaping MediaFileDownloader.ProgressHandler
    ) async throws -> Data {
        let result = await load(for: urlString)
        if let data = result.snapshot()?.first { return data }
        let url = try Self.remoteURL(urlString)
        return try await networkData(
            for: urlString,
            url: url,
            transfer: .streamedToFile,
            profile: profile,
            progress: progress,
            cancelsWithCaller: true
        )
    }

    /// Jumelle FICHIER de `store(_:for:honoring:)` : déplace un fichier
    /// téléchargé sous `key`, sans jamais le relire en mémoire. Un média
    /// `no-store` / `no-cache` n'est pas gardé (le fichier reste à l'appelant,
    /// qui le supprime) et toute copie antérieure de la clé part. La taille du
    /// fichier adopté entre dans le budget disque comme une écriture.
    /// Rend l'URL du fichier en cache, ou `nil` quand il n'est pas gardé.
    @discardableResult
    public func adopt(downloadedFile fileURL: URL, for key: String, honoring response: URLResponse?) async -> URL? {
        guard MediaCacheDirective(response: response).mayPersist else {
            await refuseStorage(for: key)
            return nil
        }
        let fileKey = Self.fileKey(for: key)
        let destination = diskFilePath(for: fileKey)
        do {
            if fileManager.fileExists(atPath: destination.path) {
                _ = try fileManager.replaceItemAt(destination, withItemAt: fileURL)
            } else {
                try fileManager.moveItem(at: fileURL, to: destination)
            }
        } catch {
            logger.error("adopt(downloadedFile:) failed for key \(fileKey, privacy: .public): \(error.localizedDescription, privacy: .public)")
            return nil
        }
        touchModificationDate(atPath: destination.path)
        memoryCache.removeObject(forKey: fileKey as NSString)
        fileTimestamps[fileKey] = Date()
        transientKeys.remove(fileKey)
        let size = (try? fileManager.attributesOfItem(atPath: destination.path))?[.size] as? Int ?? 0
        await runBudgetEvictionIfNeeded(latestWriteSize: size)
        return destination
    }

    /// Une réponse a interdit le stockage (#9478) : la clé quitte tous les
    /// niveaux et ses octets ne seront gardés nulle part.
    func refuseStorage(for key: String) async {
        await evict(key)
        transientKeys.insert(Self.fileKey(for: key))
    }

    /// Branche `streamedToFile` du funnel réseau. Le fichier de transit est
    /// supprimé sur TOUS les chemins : déplacé dans le cache, ou effacé (échec,
    /// statut d'erreur, annulation, média non gardé).
    func streamedNetworkData(
        for urlString: String,
        request: URLRequest,
        profile: MediaTransferProfile,
        progress: MediaFileDownloader.ProgressHandler?
    ) async throws -> Data {
        let download = try await fileDownloader.download(request, profile: profile, progress: progress)
        defer { discardStagedFile(download.fileURL) }
        guard let http = download.response as? HTTPURLResponse else {
            throw DiskCacheError.notCached(urlString)
        }
        if MediaCacheDirective.meansGone(statusCode: http.statusCode) {
            await evict(urlString)
            throw DiskCacheError.notCached(urlString)
        }
        guard (200...299).contains(http.statusCode) else {
            throw DiskCacheError.notCached(urlString)
        }
        // Une purge a pu annuler ce transfert après l'arrivée des octets :
        // l'adopter ressusciterait le fichier qu'elle vient de détruire.
        try Task.checkCancellation()
        guard let cached = await adopt(downloadedFile: download.fileURL, for: urlString, honoring: http) else {
            return try Data(contentsOf: download.fileURL)
        }
        return try Data(contentsOf: cached, options: .mappedIfSafe)
    }

    private func discardStagedFile(_ fileURL: URL) {
        guard fileManager.fileExists(atPath: fileURL.path) else { return }
        fileManager.removeItemLogging(at: fileURL, context: "media download staging cleanup", logger: logger)
    }

    static func remoteURL(_ urlString: String) throws -> URL {
        guard let url = URL(string: urlString),
              let scheme = url.scheme?.lowercased(),
              scheme == "https" || scheme == "http" else {
            throw DiskCacheError.notCached(urlString)
        }
        return url
    }
}
