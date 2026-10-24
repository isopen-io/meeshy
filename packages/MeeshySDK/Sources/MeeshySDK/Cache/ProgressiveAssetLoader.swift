import Foundation
@preconcurrency import AVFoundation
import UniformTypeIdentifiers

/// **Le lecteur lit le fichier que le cache écrit (#9881).**
///
/// `AVURLAsset` sur une URL `https` ouvre ses propres requêtes de plage, à
/// côté du téléchargement qui remplit le cache : deux transferts pour un même
/// média. Cet asset porte une URL `meeshy-cache://` que seul son chargeur sait
/// servir : chaque plage demandée par le lecteur est lue dans le
/// `ProgressiveMediaDownload` de ce média, au fur et à mesure qu'il se remplit
/// (`ProgressiveRangeLaw`). Le lecteur joue dès que la tête est là.
///
/// Building block opaque : la source rend le téléchargement à lire, et
/// l'appelant seul décide si elle peut en ouvrir un.
// unchecked: hérité d'AVURLAsset ; ses deux propriétés sont immuables et Sendable.
public final class ProgressiveURLAsset: AVURLAsset, @unchecked Sendable {
    public static let scheme = "meeshy-cache"

    /// L'URL d'origine du média — clé de cache et repli de type de contenu.
    public let remoteURL: URL
    private let loader: ProgressiveAssetLoader

    public init(remoteURL: URL, source: @escaping ProgressiveAssetLoader.Source) {
        self.remoteURL = remoteURL
        self.loader = ProgressiveAssetLoader(remoteURL: remoteURL, source: source)
        super.init(url: ProgressiveURLAsset.loaderURL(for: remoteURL), options: nil)
        resourceLoader.setDelegate(loader, queue: loader.queue)
    }

    /// L'URL que seul le chargeur sait ouvrir : le schéma remplacé, le reste
    /// intact — l'extension du chemin garde son sens pour AVFoundation.
    public static func loaderURL(for remoteURL: URL) -> URL {
        guard var components = URLComponents(url: remoteURL, resolvingAgainstBaseURL: false) else { return remoteURL }
        components.scheme = scheme
        return components.url ?? remoteURL
    }
}

// unchecked: les requêtes en attente vivent sous `state` (Locked) et ne sont touchées que sur `queue`.
public final class ProgressiveAssetLoader: NSObject, AVAssetResourceLoaderDelegate, @unchecked Sendable {
    public typealias Source = @Sendable @concurrent () async -> ProgressiveMediaDownload?

    let queue = DispatchQueue(label: "me.meeshy.progressive-asset-loader", qos: .userInitiated)

    private struct State {
        var pending: [AVAssetResourceLoadingRequest] = []
        var download: ProgressiveMediaDownload?
        var observer: UUID?
        var unavailable = false
        var resolving: Task<Void, Never>?
    }

    private let remoteURL: URL
    private let source: Source
    private let state = Locked(uncheckedState: State())

    init(remoteURL: URL, source: @escaping Source) {
        self.remoteURL = remoteURL
        self.source = source
        super.init()
    }

    deinit {
        let (download, observer, resolving) = state.mutateUnchecked { ($0.download, $0.observer, $0.resolving) }
        resolving?.cancel()
        if let download, let observer { download.removeObserver(observer) }
    }

    public func resourceLoader(
        _ resourceLoader: AVAssetResourceLoader,
        shouldWaitForLoadingOfRequestedResource loadingRequest: AVAssetResourceLoadingRequest
    ) -> Bool {
        guard loadingRequest.request.url?.scheme == ProgressiveURLAsset.scheme else { return false }
        state.mutateUnchecked { $0.pending.append(loadingRequest) }
        resolveSourceIfNeeded()
        serve()
        return true
    }

    public func resourceLoader(
        _ resourceLoader: AVAssetResourceLoader,
        didCancel loadingRequest: AVAssetResourceLoadingRequest
    ) {
        state.mutateUnchecked { $0.pending.removeAll { $0 === loadingRequest } }
    }

    /// Le téléchargement s'obtient UNE fois par asset, à la première demande.
    private func resolveSourceIfNeeded() {
        let shouldResolve = state.mutateUnchecked { state -> Bool in
            guard state.download == nil, state.resolving == nil, !state.unavailable else { return false }
            return true
        }
        guard shouldResolve else { return }
        let source = self.source
        let task = Task { [weak self] in
            let download = await source()
            self?.adopt(download)
        }
        state.mutateUnchecked { $0.resolving = task }
    }

    private func adopt(_ download: ProgressiveMediaDownload?) {
        guard let download else {
            state.mutateUnchecked { $0.unavailable = true }
            queue.async { [weak self] in self?.serve() }
            return
        }
        let token = download.observe { [weak self] in
            self?.queue.async { [weak self] in self?.serve() }
        }
        state.mutateUnchecked { state in
            state.download = download
            state.observer = token
        }
        queue.async { [weak self] in self?.serve() }
    }

    /// Rejoue la loi de plage sur chaque requête en attente ; à appeler sur `queue`.
    private func serve() {
        let (requests, download, unavailable) = state.mutateUnchecked { ($0.pending, $0.download, $0.unavailable) }
        guard !requests.isEmpty else { return }
        if unavailable {
            requests.forEach { $0.finishLoading(with: URLError(.resourceUnavailable)) }
            state.mutateUnchecked { $0.pending = [] }
            return
        }
        guard let download else { return }
        let finished = requests.filter { serve($0, from: download) }
        guard !finished.isEmpty else { return }
        state.mutateUnchecked { state in
            state.pending.removeAll { pending in finished.contains { $0 === pending } }
        }
    }

    /// Sert ce qui peut l'être ; rend `true` quand la requête est close.
    private func serve(_ request: AVAssetResourceLoadingRequest, from download: ProgressiveMediaDownload) -> Bool {
        let snapshot = download.snapshot
        if snapshot.hasFailed {
            request.finishLoading(with: URLError(.networkConnectionLost))
            return true
        }
        if let info = request.contentInformationRequest {
            guard fillContentInformation(info, from: snapshot) else { return false }
        }
        guard let dataRequest = request.dataRequest else {
            request.finishLoading()
            return true
        }
        return serveData(dataRequest, of: request, from: download)
    }

    private func serveData(
        _ dataRequest: AVAssetResourceLoadingDataRequest,
        of request: AVAssetResourceLoadingRequest,
        from download: ProgressiveMediaDownload
    ) -> Bool {
        while true {
            let range = ProgressiveRangeRequest(
                requestedOffset: dataRequest.requestedOffset,
                requestedLength: Int64(dataRequest.requestedLength),
                currentOffset: dataRequest.currentOffset,
                toEndOfResource: dataRequest.requestsAllDataToEndOfResource
            )
            switch ProgressiveRangeLaw.answer(for: range, file: download.snapshot.file) {
            case .wait:
                return false
            case .finished:
                request.finishLoading()
                return true
            case .serve(let offset, let length):
                guard let chunk = try? download.read(offset: offset, length: length), !chunk.isEmpty else {
                    request.finishLoading(with: URLError(.cannotDecodeContentData))
                    return true
                }
                dataRequest.respond(with: chunk)
            }
        }
    }

    /// Le type et la longueur, dès la réponse du serveur. Sans longueur
    /// annoncée, la longueur n'est connue qu'à la fin du fichier.
    private func fillContentInformation(
        _ info: AVAssetResourceLoadingContentInformationRequest,
        from snapshot: ProgressiveMediaDownload.Snapshot
    ) -> Bool {
        guard snapshot.hasResponded else { return false }
        let length = snapshot.file.expectedBytes ?? (snapshot.file.isComplete ? snapshot.file.availableBytes : nil)
        guard let length else { return false }
        info.contentType = Self.contentType(mimeType: snapshot.mimeType, remoteURL: remoteURL)
        info.contentLength = length
        info.isByteRangeAccessSupported = true
        return true
    }

    /// L'UTI que demande AVFoundation : celui du type MIME servi, sinon celui
    /// de l'extension de l'URL, sinon MPEG-4 (le format que l'app publie).
    public static func contentType(mimeType: String?, remoteURL: URL) -> String {
        if let mimeType, let type = UTType(mimeType: mimeType), type.conforms(to: .audiovisualContent) {
            return type.identifier
        }
        if let type = UTType(filenameExtension: remoteURL.pathExtension), type.conforms(to: .audiovisualContent) {
            return type.identifier
        }
        return UTType.mpeg4Movie.identifier
    }
}
