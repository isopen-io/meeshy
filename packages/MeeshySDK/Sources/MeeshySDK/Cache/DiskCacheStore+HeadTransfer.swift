import Foundation

/// La TÊTE d'une vidéo, amorcée avant que quiconque ne la lise (#11288).
///
/// La fenêtre lointaine des réels (N±3…N±10) téléchargeait chaque fichier
/// entier : un balayage de vingt réels en tirait vingt, quand la plupart ne
/// seraient jamais vus. Elle ne demande plus que leur début
/// (`Range: bytes=0-<n>`), écrit dans un fichier lisible et tenu dans
/// `heads`, hors du cache. Le transfert qui élit le réel — préchargement
/// proche, lecteur, téléchargement d'une surface — le REPREND (`startTransfer`)
/// à son dernier octet, dans le même fichier : aucun octet de la tête ne
/// repart, et le lecteur lit la tête dès l'élection.
extension DiskCacheStore {

    /// Amorce les `bytes` premiers octets de `urlString`, sauf si la vidéo est
    /// déjà sur le disque, en transfert, ou amorcée. Rend quand la tête est
    /// arrivée — ou interrompue : l'annulation de l'appelant l'arrête, et ce qui
    /// est arrivé par plage reste repris. L'appelant porte la politique réseau
    /// (`profile`), jamais le store.
    public func prefetchHead(of urlString: String, bytes: Int, profile: MediaTransferProfile = .standard) async {
        let fileKey = Self.fileKey(for: urlString)
        guard bytes > 0, readsWhileDownloading, localFileURL(for: urlString) == nil,
              inFlightTasks[fileKey] == nil, !heads.holds(fileKey),
              let url = try? Self.remoteURL(urlString),
              let download = makeReadableDownload() else { return }
        var request = Self.networkRequest(
            for: url,
            apiOrigin: MeeshyConfig.shared.serverOrigin,
            authToken: APIClient.shared.authToken,
            sessionToken: APIClient.shared.anonymousSessionToken
        )
        request.setValue(ProgressiveResumeLaw.rangeHeader(from: 0, length: bytes), forHTTPHeaderField: "Range")
        let downloader = fileDownloader
        let response = Task<URLResponse?, Never> {
            let answered = try? await downloader.stream(request, profile: profile, into: download, limit: Int64(bytes))
            download.closeWriting()
            return answered
        }
        heads.begin(fileKey: fileKey, download: download, response: response).forEach { $0.response.cancel() }
        _ = await withTaskCancellationHandler {
            await response.value
        } onCancel: {
            response.cancel()
        }
        if !download.isContinuable { heads.forget(fileKey: fileKey, download: download) }
    }

    /// Oublie les têtes de `urlStrings` (purge), en arrêtant leur transfert.
    func dropHeads(_ urlStrings: Set<String>) {
        heads.remove(Set(urlStrings.map { Self.fileKey(for: $0) })).forEach { $0.response.cancel() }
    }
}
