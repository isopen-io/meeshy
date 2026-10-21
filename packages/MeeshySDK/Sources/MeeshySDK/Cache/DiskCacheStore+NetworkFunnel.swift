import Foundation
import os

extension DiskCacheStore {
    /// Ce qu'un appelant demande au funnel, gardé tel quel pour pouvoir
    /// relancer le transfert avec SON profil (#11283).
    struct NetworkFetch: Sendable {
        let urlString: String
        let url: URL
        let transfer: NetworkTransfer
        let profile: MediaTransferProfile
        let progress: MediaFileDownloader.ProgressHandler?
        let cancelsWithCaller: Bool
    }

    /// Single network funnel: every remote fetch for this store goes through
    /// here so concurrent callers (`data(for:)`, `image(for:)`, prefetchers)
    /// share ONE URLSession task per media key instead of opening duplicate
    /// connections. Observed on device: the same voice note fetched 2-3×
    /// concurrently by independent paths saturated a slow cellular link
    /// (NSURLError -1001 ×50 → HTTP/2 connection torn down).
    ///
    /// Un appelant rejoint le transfert en vol quel que soit son profil ; si ce
    /// transfert, plus restreint que lui (préchargement différé interdit de
    /// réseau facturé), échoue sur le réseau, l'appelant reprend avec son
    /// propre profil au lieu d'hériter de l'échec (#11283).
    func networkData(
        for urlString: String,
        url: URL,
        transfer: NetworkTransfer? = nil,
        profile: MediaTransferProfile = .standard,
        progress: MediaFileDownloader.ProgressHandler? = nil,
        cancelsWithCaller: Bool = false
    ) async throws -> Data {
        let fileKey = Self.fileKey(for: urlString)
        let fetch = NetworkFetch(
            urlString: urlString,
            url: url,
            transfer: transfer ?? networkTransfer,
            profile: profile,
            progress: progress,
            cancelsWithCaller: cancelsWithCaller
        )
        // Un transfert déjà annulé (l'utilisateur vient de l'arrêter) ne se
        // rejoint pas : il ne rendrait qu'une `CancellationError`.
        if let existing = inFlightTasks[fileKey], !existing.task.isCancelled {
            return try await join(existing, fileKey: fileKey, fetch: fetch)
        }
        return try await launchTransfer(fileKey: fileKey, fetch: fetch)
    }

    private func join(_ existing: InFlightDownload, fileKey: String, fetch: NetworkFetch) async throws -> Data {
        do {
            return try await existing.task.value
        } catch let error as URLError where !existing.profile.covers(fetch.profile) {
            logger.debug("Joined restricted transfer failed (\(error.code.rawValue)), resuming with the caller's profile")
            if let resumed = inFlightTasks[fileKey], resumed.id != existing.id,
               !resumed.task.isCancelled, resumed.profile.covers(fetch.profile) {
                return try await resumed.task.value
            }
            return try await launchTransfer(fileKey: fileKey, fetch: fetch)
        }
    }

    private func launchTransfer(fileKey: String, fetch: NetworkFetch) async throws -> Data {
        let task = Task<Data, Error> {
            // Média protégé même-origine (ex. audio de la bibliothèque de sons
            // servi par `/api/v1/static/:filename`, route JWT) : la requête nue
            // recevait 401 et la story jouait MUETTE, gelée sur le spinner de
            // stall (bug prod 2026-08-02, post 6a6ef0b44415c63ff8da7855).
            let request = Self.networkRequest(
                for: fetch.url,
                apiOrigin: MeeshyConfig.shared.serverOrigin,
                authToken: APIClient.shared.authToken,
                sessionToken: APIClient.shared.anonymousSessionToken
            )
            if fetch.transfer == .streamedToFile {
                return try await streamedNetworkData(
                    for: fetch.urlString,
                    request: request,
                    profile: fetch.profile,
                    progress: fetch.progress
                )
            }
            return try await inMemoryNetworkData(for: fetch.urlString, request: request)
        }

        let entry = InFlightDownload(task: task, profile: fetch.profile)
        inFlightTasks[fileKey] = entry
        defer {
            if inFlightTasks[fileKey]?.id == entry.id { inFlightTasks[fileKey] = nil }
        }
        guard fetch.cancelsWithCaller else { return try await task.value }
        return try await withTaskCancellationHandler {
            try await task.value
        } onCancel: {
            task.cancel()
        }
    }

    private func inMemoryNetworkData(for urlString: String, request: URLRequest) async throws -> Data {
        let (data, response) = try await urlSession.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw DiskCacheError.notCached(urlString)
        }
        // #9478 — un fichier rappelé, expiré ou consommé rend 404 : la
        // copie locale échue partirait sinon resservie par
        // `cachedFileURL(for:)`, qui ne regarde pas la fraîcheur.
        if MediaCacheDirective.meansGone(statusCode: httpResponse.statusCode) {
            await evict(urlString)
            throw DiskCacheError.notCached(urlString)
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            throw DiskCacheError.notCached(urlString)
        }
        await store(data, for: urlString, honoring: httpResponse)
        return data
    }
}
