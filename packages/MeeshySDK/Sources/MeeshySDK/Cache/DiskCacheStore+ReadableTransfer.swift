import Foundation
import os

/// Le transfert vidéo LISIBLE pendant sa course (#9881).
///
/// Une story vidéo ouverte à froid lisait l'URL en streaming ET la
/// téléchargeait en parallèle pour le cache : deux requêtes, puis un
/// `replaceCurrentItem` vers le fichier local en pleine lecture. Un store
/// `readsWhileDownloading` écrit chaque transfert en flux dans un
/// `ProgressiveMediaDownload` : le lecteur lit la tête du fichier que le cache
/// est en train d'écrire, le préchargeur et le centre de téléchargement
/// rejoignent ce même transfert, et le fichier fini est adopté sous sa clé.
/// Les directives de fraîcheur (#9478) restent celles de
/// `adopt(downloadedFile:for:honoring:)`.
extension DiskCacheStore {
    struct ReadableTransfer {
        let entryId: UUID
        let download: ProgressiveMediaDownload
    }

    /// Le fichier lisible de `urlString` : celui du cache s'il y est, celui du
    /// transfert en cours sinon. Sans l'un ni l'autre, `startsTransfer` décide
    /// d'en ouvrir un — l'appelant porte la politique réseau, jamais le store.
    /// Un transfert NON lisible déjà en vol (préchargement d'un store sans
    /// lecture en flux, téléchargeur externe) est attendu, jamais doublé.
    public func readableDownload(
        for urlString: String,
        startsTransfer: Bool,
        profile: MediaTransferProfile = .standard
    ) async -> ProgressiveMediaDownload? {
        if let local = localFileURL(for: urlString) {
            return try? ProgressiveMediaDownload(completedFile: local)
        }
        let fileKey = Self.fileKey(for: urlString)
        if let live = liveReadable(fileKey: fileKey) { return live }
        if let inFlight = inFlightTasks[fileKey], !inFlight.task.isCancelled {
            _ = try? await inFlight.task.value
            return localFileURL(for: urlString).flatMap { try? ProgressiveMediaDownload(completedFile: $0) }
        }
        guard startsTransfer, readsWhileDownloading, let url = try? Self.remoteURL(urlString) else { return nil }
        let fetch = NetworkFetch(
            urlString: urlString,
            url: url,
            transfer: .streamedToFile,
            profile: profile,
            progress: nil,
            cancelsWithCaller: false
        )
        _ = startTransfer(fileKey: fileKey, fetch: fetch)
        return liveReadable(fileKey: fileKey)
    }

    /// Lecture synchrone, sans saut d'acteur : un transfert lisible de
    /// `urlString` est-il en cours ? Le lecteur d'une bulle ne joue en flux
    /// qu'un téléchargement que la politique réseau a déjà autorisé.
    nonisolated public func hasReadableTransfer(for urlString: String) -> Bool {
        let fileKey = Self.fileKey(for: urlString)
        return readableKeys.read { $0.contains(fileKey) }
    }

    func makeReadableDownload() -> ProgressiveMediaDownload? {
        guard readsWhileDownloading else { return nil }
        let staging = fileDownloader.stagingDirectory.appendingPathComponent(UUID().uuidString, isDirectory: false)
        do {
            return try ProgressiveMediaDownload(stagingFile: staging)
        } catch {
            logger.error("readable transfer staging failed, falling back to a plain file transfer: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    func registerReadable(_ download: ProgressiveMediaDownload, entryId: UUID, fileKey: String) {
        readableTransfers[fileKey] = ReadableTransfer(entryId: entryId, download: download)
        readableKeys.mutate { $0.insert(fileKey) }
    }

    func releaseReadable(entryId: UUID, fileKey: String) {
        guard readableTransfers[fileKey]?.entryId == entryId else { return }
        readableTransfers[fileKey] = nil
        readableKeys.mutate { $0.remove(fileKey) }
    }

    /// Le transfert lisible encore inscrit au funnel : une purge qui l'a retiré
    /// (et annulé) ne le laisse plus servir.
    private func liveReadable(fileKey: String) -> ProgressiveMediaDownload? {
        guard let readable = readableTransfers[fileKey] else { return nil }
        guard let inFlight = inFlightTasks[fileKey], inFlight.id == readable.entryId, !inFlight.task.isCancelled else {
            return nil
        }
        return readable.download
    }

    /// Branche lisible du funnel : les octets arrivent dans `download`, que
    /// les lecteurs suivent ; à la fin, le fichier est adopté sous sa clé (ou
    /// laissé au téléchargement, qui le supprime, si la réponse l'interdit).
    /// `head` : la tête amorcée que ce transfert reprend (#11288) — attendue,
    /// puis complétée par plage ; entière, elle est adoptée sans réseau.
    func readableNetworkData(
        for urlString: String,
        request: URLRequest,
        profile: MediaTransferProfile,
        progress: MediaFileDownloader.ProgressHandler?,
        into download: ProgressiveMediaDownload,
        after head: ProgressiveHeadLedger.Head? = nil
    ) async throws -> Data {
        do {
            let headResponse: URLResponse? = await head?.response.value ?? nil
            let response: URLResponse
            switch try download.prepareContinuation() {
            case .complete:
                guard let headResponse else { throw DiskCacheError.notCached(urlString) }
                response = headResponse
            case .resume(let offset):
                var continued = request
                continued.setValue(ProgressiveResumeLaw.rangeHeader(from: offset, length: nil), forHTTPHeaderField: "Range")
                response = try await fileDownloader.stream(continued, profile: profile, into: download, resumingAt: offset, progress: progress)
            }
            guard let http = response as? HTTPURLResponse else {
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
            download.closeWriting()
            let cached = await adopt(downloadedFile: download.stagedFileURL, for: urlString, honoring: http)
            download.finish(relocatedTo: cached)
            guard let cached else { return try Data(contentsOf: download.stagedFileURL) }
            return try Data(contentsOf: cached, options: .mappedIfSafe)
        } catch {
            download.fail(error)
            throw error
        }
    }
}
