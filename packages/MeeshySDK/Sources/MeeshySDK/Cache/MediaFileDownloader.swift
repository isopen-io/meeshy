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
public final class MediaFileDownloader: NSObject, @unchecked Sendable {
    public typealias ProgressHandler = @Sendable (_ writtenBytes: Int64, _ expectedBytes: Int64) -> Void

    public struct Download: Sendable {
        public let fileURL: URL
        public let response: URLResponse
    }

    public let stagingDirectory: URL

    private let configuration: URLSessionConfiguration
    private let cadenceInterval: TimeInterval
    private let lock = NSLock()
    private var sessions: [MediaTransferProfile: URLSession] = [:]
    private var transfers: [ObjectIdentifier: Transfer] = [:]
    private let logger = MeeshyLog.logger(.mediaFileDownload, subsystem: .legacySDK)

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
    private final class CancellationRelay: @unchecked Sendable {
        private let lock = NSLock()
        private var task: URLSessionTask?
        private var cancelled = false

        func attach(_ task: URLSessionTask) {
            let alreadyCancelled = lock.withLock { () -> Bool in
                self.task = task
                return cancelled
            }
            if alreadyCancelled { task.cancel() }
        }

        func cancel() {
            let task = lock.withLock { () -> URLSessionTask? in
                cancelled = true
                return self.task
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
        let current = lock.withLock { () -> [URLSession] in
            defer { sessions = [:] }
            return Array(sessions.values)
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
                lock.withLock { transfers[ObjectIdentifier(task)] = transfer }
                relay.attach(task)
                task.resume()
            }
        } onCancel: {
            relay.cancel()
        }
    }

    /// Une session par profil : une `URLSession` ne change pas de configuration
    /// après sa création. Au plus quatre (deux priorités × deux réglages).
    private func session(for profile: MediaTransferProfile) -> URLSession {
        lock.withLock {
            if let existing = sessions[profile] { return existing }
            let created = URLSession(
                configuration: profile.configured(from: configuration),
                delegate: self,
                delegateQueue: nil
            )
            sessions[profile] = created
            return created
        }
    }

    private func transfer(for task: URLSessionTask) -> Transfer? {
        lock.withLock { transfers[ObjectIdentifier(task)] }
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
        let handler = lock.withLock { () -> ProgressHandler? in
            guard let transfer = transfers[ObjectIdentifier(downloadTask)], transfer.progress != nil else { return nil }
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
        lock.withLock { transfer.staged = outcome }
    }

    public func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let transfer = lock.withLock({ transfers.removeValue(forKey: ObjectIdentifier(task)) }) else { return }
        let staged = lock.withLock { transfer.staged }
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
