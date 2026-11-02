import Foundation
import os

/// Cadence des rapports de progression d'un transfert (#9863) : au plus un
/// rapport par `minimumInterval`, plus toujours le premier et le dernier.
///
/// Un délégué `URLSession` signale CHAQUE paquet écrit — plusieurs centaines
/// par seconde sur un bon réseau. Les relayer tels quels vers le fil principal
/// republierait l'état de toutes les surfaces qui montrent le média à chaque
/// paquet. Règle pure, sans horloge propre : l'appelant fournit `now`.
public struct TransferProgressCadence: Sendable, Equatable {
    public let minimumInterval: TimeInterval
    private var lastEmission: TimeInterval?

    public init(minimumInterval: TimeInterval = 0.1) {
        self.minimumInterval = minimumInterval
    }

    public mutating func admits(writtenBytes: Int64, expectedBytes: Int64, now: TimeInterval) -> Bool {
        let completes = expectedBytes > 0 && writtenBytes >= expectedBytes
        if !completes, let last = lastEmission, now - last < minimumInterval { return false }
        lastEmission = now
        return true
    }
}

/// Télécharge une ressource vers un FICHIER, jamais vers un `Data` (#9863).
///
/// `URLSessionDownloadTask` écrit les octets sur le disque au fil de l'eau :
/// une vidéo de 30 Mo ne transite jamais entière par la mémoire, et aucune
/// boucle ne parcourt ses octets un à un. Le fichier rendu vit dans
/// `stagingDirectory` ; l'appelant le DÉPLACE (cache) ou le supprime — il en
/// est propriétaire dès le retour. En échec ou en annulation, rien ne reste.
///
/// Building block opaque : il ne connaît ni cache, ni directive, ni clé.
// unchecked: état mutable sous `ledger` (Locked) ; `URLSessionConfiguration` et `Transfer` ne sont pas Sendable.
public final class MediaFileDownloader: NSObject, @unchecked Sendable {
    public typealias ProgressHandler = @Sendable (_ writtenBytes: Int64, _ expectedBytes: Int64) -> Void

    public struct Download: Sendable {
        public let fileURL: URL
        public let response: URLResponse
    }

    public let stagingDirectory: URL

    private let configuration: URLSessionConfiguration
    private let cadenceInterval: TimeInterval
    private let ledger = Locked(uncheckedState: TransferLedger())
    private let logger = MeeshyLog.logger(.mediaFileDownload, subsystem: .legacySDK)

    private struct TransferLedger {
        var sessions: [MediaTransferProfile: URLSession] = [:]
        var transfers: [ObjectIdentifier: Transfer] = [:]
        var streams: [ObjectIdentifier: ReadableTransfer] = [:]
    }

    /// Un transfert LISIBLE en cours de route (#9881) : ses octets vont dans
    /// un `ProgressiveMediaDownload` au fil de leur arrivée.
    private final class ReadableTransfer {
        let continuation: CheckedContinuation<URLResponse, Error>
        let sink: ProgressiveMediaDownload
        let progress: ProgressHandler?
        /// Où commence ce transfert dans le fichier : `0`, ou la fin d'une
        /// tête qu'il reprend (#11288).
        let offset: Int64
        /// Octets au-delà desquels une réponse ENTIÈRE (serveur qui ignore
        /// `Range`) est coupée : une tête ne télécharge jamais tout le fichier.
        let limit: Int64?
        var cadence: TransferProgressCadence
        var acceptance: ProgressiveResumeLaw.Acceptance?
        var rejected: URLResponse?
        var written: Int64 = 0
        /// La tête a atteint `limit` : la tâche est annulée, et les paquets
        /// déjà en route ne s'écrivent plus.
        var cut = false

        init(continuation: CheckedContinuation<URLResponse, Error>, sink: ProgressiveMediaDownload, progress: ProgressHandler?, offset: Int64, limit: Int64?, cadence: TransferProgressCadence) {
            self.continuation = continuation
            self.sink = sink
            self.progress = progress
            self.offset = offset
            self.limit = limit
            self.cadence = cadence
        }
    }

    private final class Transfer {
        let continuation: CheckedContinuation<Download, Error>
        let progress: ProgressHandler?
        var cadence: TransferProgressCadence
        var staged: Result<Download, Error>?

        init(continuation: CheckedContinuation<Download, Error>, progress: ProgressHandler?, cadence: TransferProgressCadence) {
            self.continuation = continuation
            self.progress = progress
            self.cadence = cadence
        }
    }

    /// La tâche réseau d'un appel, retenue pour que l'annulation de la `Task`
    /// appelante l'atteigne — même quand elle arrive avant sa création.
    // unchecked: la tâche et le drapeau vivent sous `state` (Locked) ; `URLSessionTask` n'est pas Sendable.
    final class CancellationRelay: @unchecked Sendable {
        private struct RelayState {
            var task: URLSessionTask?
            var cancelled = false
        }

        private let state = Locked(uncheckedState: RelayState())

        func attach(_ task: URLSessionTask) {
            let alreadyCancelled = state.mutateUnchecked { state -> Bool in
                state.task = task
                return state.cancelled
            }
            if alreadyCancelled { task.cancel() }
        }

        func cancel() {
            let task = state.mutateUnchecked { state -> URLSessionTask? in
                state.cancelled = true
                return state.task
            }
            task?.cancel()
        }
    }

    public init(
        configuration: URLSessionConfiguration,
        stagingDirectory: URL? = nil,
        cadenceInterval: TimeInterval = 0.1
    ) {
        self.configuration = configuration
        self.stagingDirectory = stagingDirectory ?? FileManager.default.temporaryDirectory
            .appendingPathComponent("MeeshyMediaDownloads", isDirectory: true)
        self.cadenceInterval = cadenceInterval
        super.init()
    }

    /// Lâche la session (elle retient son délégué jusqu'à son invalidation).
    public func invalidate() {
        let current = ledger.mutateUnchecked { ledger -> [URLSession] in
            defer { ledger.sessions = [:] }
            return Array(ledger.sessions.values)
        }
        current.forEach { $0.finishTasksAndInvalidate() }
    }

    /// Télécharge `request` vers un fichier de `stagingDirectory`, par la
    /// session du `profile`. Une réponse HTTP d'erreur (404…) rend AUSSI un
    /// fichier, avec sa réponse : c'est à l'appelant de lire le statut, puis de
    /// supprimer le fichier. L'annulation de la `Task` appelante annule le
    /// transfert et lève `CancellationError`.
    public func download(
        _ request: URLRequest,
        profile: MediaTransferProfile = .standard,
        progress: ProgressHandler? = nil
    ) async throws -> Download {
        try Task.checkCancellation()
        let relay = CancellationRelay()
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Download, Error>) in
                let transferSession = session(for: profile)
                let task = transferSession.downloadTask(with: request)
                let transfer = Transfer(
                    continuation: continuation,
                    progress: progress,
                    cadence: TransferProgressCadence(minimumInterval: cadenceInterval)
                )
                ledger.mutateUnchecked { $0.transfers[ObjectIdentifier(task)] = transfer }
                relay.attach(task)
                task.resume()
            }
        } onCancel: {
            relay.cancel()
        }
    }

    /// Télécharge `request` EN FLUX dans `sink`, lisible pendant le transfert
    /// (#9881). Rend la réponse à la fin ; une réponse HTTP d'erreur arrête le
    /// transfert à son premier octet et se rend telle quelle, sans rien écrire.
    /// L'annulation de la `Task` appelante annule le transfert et lève
    /// `CancellationError` ; une panne réseau lève l'`URLError` d'origine.
    ///
    /// `resumingAt` : le transfert REPREND une tête déjà écrite dans `sink`
    /// (#11288) ; une réponse qui ne commence pas à cet octet lève
    /// `ProgressiveResumeLaw.RangeNotHonoredError` sans rien écrire.
    /// `limit` : une réponse entière est coupée après ce nombre d'octets.
    public func stream(
        _ request: URLRequest,
        profile: MediaTransferProfile = .standard,
        into sink: ProgressiveMediaDownload,
        resumingAt offset: Int64 = 0,
        limit: Int64? = nil,
        progress: ProgressHandler? = nil
    ) async throws -> URLResponse {
        try Task.checkCancellation()
        let relay = CancellationRelay()
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<URLResponse, Error>) in
                let task = session(for: profile).dataTask(with: request)
                let stream = ReadableTransfer(
                    continuation: continuation,
                    sink: sink,
                    progress: progress,
                    offset: offset,
                    limit: limit,
                    cadence: TransferProgressCadence(minimumInterval: cadenceInterval)
                )
                ledger.mutateUnchecked { $0.streams[ObjectIdentifier(task)] = stream }
                relay.attach(task)
                task.resume()
            }
        } onCancel: {
            relay.cancel()
        }
    }

    /// Une session par profil : une `URLSession` ne change pas de configuration
    /// après sa création. Au plus quatre (deux priorités × deux réglages).
    func session(for profile: MediaTransferProfile) -> URLSession {
        ledger.mutateUnchecked { ledger in
            if let existing = ledger.sessions[profile] { return existing }
            let created = URLSession(
                configuration: profile.configured(from: configuration),
                delegate: self,
                delegateQueue: nil
            )
            ledger.sessions[profile] = created
            return created
        }
    }

    private func transfer(for task: URLSessionTask) -> Transfer? {
        ledger.mutateUnchecked { $0.transfers[ObjectIdentifier(task)] }
    }

    private func stage(_ location: URL) throws -> URL {
        try FileManager.default.createDirectory(at: stagingDirectory, withIntermediateDirectories: true)
        let staged = stagingDirectory.appendingPathComponent(UUID().uuidString, isDirectory: false)
        try FileManager.default.moveItem(at: location, to: staged)
        return staged
    }

    private static func normalized(_ error: Error) -> Error {
        if let urlError = error as? URLError, urlError.code == .cancelled { return CancellationError() }
        return error
    }
}

extension MediaFileDownloader: URLSessionDownloadDelegate {
    public func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didWriteData bytesWritten: Int64,
        totalBytesWritten: Int64,
        totalBytesExpectedToWrite: Int64
    ) {
        let now = ProcessInfo.processInfo.systemUptime
        let handler = ledger.mutateUnchecked { ledger -> ProgressHandler? in
            guard let transfer = ledger.transfers[ObjectIdentifier(downloadTask)], transfer.progress != nil else { return nil }
            guard transfer.cadence.admits(
                writtenBytes: totalBytesWritten,
                expectedBytes: totalBytesExpectedToWrite,
                now: now
            ) else { return nil }
            return transfer.progress
        }
        handler?(totalBytesWritten, totalBytesExpectedToWrite)
    }

    /// Le fichier système disparaît au retour de cette méthode : on le déplace
    /// ici, sur la file du délégué (jamais le fil principal).
    public func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didFinishDownloadingTo location: URL
    ) {
        guard let transfer = transfer(for: downloadTask) else { return }
        let outcome: Result<Download, Error>
        do {
            let staged = try stage(location)
            if let response = downloadTask.response {
                outcome = .success(Download(fileURL: staged, response: response))
            } else {
                try? FileManager.default.removeItem(at: staged)
                outcome = .failure(URLError(.badServerResponse))
            }
        } catch {
            logger.error("staging failed for a media download: \(error.localizedDescription, privacy: .public)")
            outcome = .failure(error)
        }
        ledger.mutateUnchecked { _ in transfer.staged = outcome }
    }

    public func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let stream = ledger.mutateUnchecked({ $0.streams.removeValue(forKey: ObjectIdentifier(task)) }) {
            finishStream(stream, task: task, error: error)
            return
        }
        guard let transfer = ledger.mutateUnchecked({ $0.transfers.removeValue(forKey: ObjectIdentifier(task)) }) else { return }
        let staged = ledger.mutateUnchecked { _ in transfer.staged }
        if let error {
            if case .success(let download) = staged {
                try? FileManager.default.removeItem(at: download.fileURL)
            }
            transfer.continuation.resume(throwing: Self.normalized(error))
            return
        }
        switch staged {
        case .success(let download):
            transfer.continuation.resume(returning: download)
        case .failure(let stagingError):
            transfer.continuation.resume(throwing: stagingError)
        case nil:
            transfer.continuation.resume(throwing: URLError(.cannotCreateFile))
        }
    }
}

extension MediaFileDownloader: URLSessionDataDelegate {
    /// Les octets d'un flux vont dans son fichier, sur la file du délégué. La
    /// réponse est lue au premier paquet : une erreur HTTP (404…) arrête le
    /// transfert sans qu'un seul de ses octets passe pour du média.
    public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard let stream = ledger.mutateUnchecked({ $0.streams[ObjectIdentifier(dataTask)] }) else { return }
        if ledger.mutateUnchecked({ _ in stream.rejected != nil || stream.cut }) { return }
        guard accept(stream, response: dataTask.response) else {
            dataTask.cancel()
            return
        }
        do {
            try stream.sink.append(data)
        } catch {
            logger.error("progressive media write failed: \(error.localizedDescription, privacy: .public)")
            dataTask.cancel()
            return
        }
        let now = ProcessInfo.processInfo.systemUptime
        let report = ledger.mutateUnchecked { _ -> (ProgressHandler, Int64, Int64)? in
            stream.written += Int64(data.count)
            let expected = dataTask.countOfBytesExpectedToReceive
            let whole = stream.offset + stream.written
            let wholeExpected = expected > 0 ? stream.offset + expected : expected
            guard let progress = stream.progress,
                  stream.cadence.admits(writtenBytes: whole, expectedBytes: wholeExpected, now: now) else { return nil }
            return (progress, whole, wholeExpected)
        }
        if let report { report.0(report.1, report.2) }
        if cutsAtLimit(stream) { dataTask.cancel() }
    }

    /// La première réponse d'un flux décide de tout le reste : refusée, elle
    /// n'écrit rien ; acceptée, elle annonce la taille du fichier entier.
    private func accept(_ stream: ReadableTransfer, response: URLResponse?) -> Bool {
        if ledger.mutateUnchecked({ _ in stream.acceptance != nil }) { return true }
        guard let response else { return true }
        guard let acceptance = ProgressiveResumeLaw.acceptance(of: response, resumingAt: stream.offset) else {
            ledger.mutateUnchecked { _ in stream.rejected = response }
            return false
        }
        ledger.mutateUnchecked { _ in stream.acceptance = acceptance }
        stream.sink.respond(expectedBytes: acceptance.totalBytes, mimeType: response.mimeType, resumable: acceptance.resumable)
        return true
    }

    /// Une réponse ENTIÈRE qui atteint `limit` est coupée, et rien de ce qui
    /// arrive après ne s'écrit : les paquets en route après l'annulation
    /// remplissaient la tête jusqu'au fichier entier, sans réponse pour
    /// l'adopter, et l'élection levait `notCached`. Un fichier déjà arrivé en
    /// entier n'est pas coupé : sa réponse le rend adoptable.
    private func cutsAtLimit(_ stream: ReadableTransfer) -> Bool {
        ledger.mutateUnchecked { _ -> Bool in
            guard let limit = stream.limit, let acceptance = stream.acceptance, !acceptance.resumable else { return false }
            let arrived = stream.offset + stream.written
            let whole = acceptance.totalBytes.map { arrived >= $0 } ?? false
            guard arrived >= limit, !whole else { return false }
            stream.cut = true
            return true
        }
    }

    private func finishStream(_ stream: ReadableTransfer, task: URLSessionTask, error: Error?) {
        if error == nil, let response = task.response, !accept(stream, response: response) {
            stream.continuation.resume(with: Self.rejection(of: response))
            return
        }
        if let rejected = ledger.mutateUnchecked({ _ in stream.rejected }) {
            stream.continuation.resume(with: Self.rejection(of: rejected))
            return
        }
        if let error {
            stream.continuation.resume(throwing: Self.normalized(error))
            return
        }
        guard let response = task.response else {
            stream.continuation.resume(throwing: URLError(.badServerResponse))
            return
        }
        stream.continuation.resume(returning: response)
    }

    /// Une erreur HTTP se rend telle quelle (l'appelant lit son statut) ; une
    /// réponse RÉUSSIE refusée est une reprise que le serveur n'a pas honorée.
    private static func rejection(of response: URLResponse) -> Result<URLResponse, Error> {
        guard isSuccess(response) else { return .success(response) }
        return .failure(ProgressiveResumeLaw.RangeNotHonoredError())
    }

    private static func isSuccess(_ response: URLResponse) -> Bool {
        guard let http = response as? HTTPURLResponse else { return true }
        return (200...299).contains(http.statusCode)
    }
}
