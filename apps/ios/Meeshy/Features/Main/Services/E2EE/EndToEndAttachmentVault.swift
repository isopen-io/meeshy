import CryptoKit
import Foundation
import MeeshyE2EE
import MeeshySDK
import UniformTypeIdentifiers
import os

/// Où vit le clair d'une pièce jointe chiffrée de bout en bout, une fois
/// déchiffrée sur CET appareil (#10789). Le fichier est nommé par le SECRET qui
/// l'ouvre — `SHA-256(condensat ‖ clé)` — et l'extension de son type réel (les
/// lecteurs système la lisent pour reconnaître le format), jamais par
/// l'identifiant du blob : un serveur ou un pair qui réutilise l'identifiant
/// d'une autre pièce ne peut pas faire passer son clair pour le sien (audit du
/// 2026-10-25). Pur et déterministe : la bulle pose cette adresse avant même
/// que le fichier existe.
nonisolated struct EndToEndMediaPaths: Sendable, Equatable {
    let directory: URL

    static let live = EndToEndMediaPaths(
        directory: FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("E2EEMedia", isDirectory: true)
    )

    func file(digest: Data, key: Data, contentType: String) -> URL {
        let ext = UTType(mimeType: contentType)?.preferredFilenameExtension ?? "bin"
        let name = SHA256.hash(data: digest + key).prefix(16).map { String(format: "%02x", $0) }.joined()
        return directory.appendingPathComponent("\(name).\(ext)")
    }

    func file(for pointer: E2EEAttachmentPointer) -> URL {
        file(digest: pointer.digest, key: pointer.key, contentType: pointer.contentType)
    }

    func thumbnail(of pointer: E2EEAttachmentPointer) -> URL? {
        pointer.thumbnail.map { file(digest: $0.digest, key: $0.key, contentType: $0.contentType) }
    }
}

/// Ce qui va chercher le blob CHIFFRÉ d'une pièce, par son identifiant : la
/// passerelle ne le sert qu'aux membres, par `GET /attachments/:id`. Au-delà de
/// `maxBytes`, le téléchargement est refusé : un serveur ne remplit pas le disque.
nonisolated protocol EndToEndBlobFetching: Sendable {
    func blob(_ blobId: String, to destination: URL, maxBytes: Int) async throws
}

/// Le clair des pièces chiffrées de bout en bout, sur cet appareil.
nonisolated protocol EndToEndAttachmentMaterializing: Sendable {
    var paths: EndToEndMediaPaths { get }
    /// Télécharge, vérifie et déchiffre ce qui manque ; rend le nombre de
    /// fichiers présents (pièces et affiches). Un blob dont le condensat ou le
    /// HMAC est faux ne laisse rien.
    func materialize(_ pointers: [E2EEAttachmentPointer]) async -> Int
    /// L'expéditeur garde le clair qu'il vient de chiffrer : rien à télécharger.
    func adopt(localFile: URL, secret: E2EEAttachmentSecret, contentType: String) async
    /// Une vue unique consommée, un éphémère échu : le clair de ses pièces et
    /// de leurs affiches quitte l'appareil, téléchargement en cours compris.
    func discard(_ pointers: [E2EEAttachmentPointer]) async
    /// Fermeture de session : plus aucun clair de pièce ne reste.
    func wipe() async
}

/// **Le clair d'une pièce jointe chiffrée de bout en bout ne vit que là**
/// (#10789, #12952) : un dossier de l'app dont chaque fichier est protégé par
/// `NSFileProtectionCompleteUnlessOpen` — illisible pour toute nouvelle
/// ouverture dès que l'appareil se verrouille, la lecture déjà en cours (un
/// vocal) continuant — et exclu de la sauvegarde. Jamais dans les caches média
/// de l'app, qui n'ont pas cette protection. La clé ne vit que dans
/// `e2ee.sqlite` (le pointeur).
///
/// Modèle de menace : appareil volé verrouillé (fichiers inaccessibles), serveur
/// qui altère un blob (le condensat puis le HMAC le refusent, rien n'est écrit),
/// qui gonfle un blob (taille bornée par le pointeur) ou qui réutilise un
/// identifiant (fichiers nommés par le secret). Hors modèle : appareil
/// déverrouillé compromis.
actor EndToEndAttachmentVault: EndToEndAttachmentMaterializing {
    static let shared = EndToEndAttachmentVault(paths: .live, fetcher: GatewayEndToEndBlobFetcher())
    nonisolated static let protection = FileProtectionType.completeUnlessOpen

    nonisolated let paths: EndToEndMediaPaths
    private let fetcher: any EndToEndBlobFetching
    private var inFlight: [URL: Task<Bool, Never>] = [:]
    private var sweptLeftovers = false
    private let logger = Logger(subsystem: "me.meeshy.app", category: "e2ee-media")

    init(paths: EndToEndMediaPaths, fetcher: any EndToEndBlobFetching) {
        self.paths = paths
        self.fetcher = fetcher
        // Les lecteurs à URL-chaîne (audio, forme d'onde, code) ne lisent un
        // fichier local que sous cette racine.
        DiskCacheStore.allowLocalReads(under: paths.directory)
    }

    func materialize(_ pointers: [E2EEAttachmentPointer]) async -> Int {
        sweepLeftoversOnce()
        let pieces = pointers.filter(\.isReadable).flatMap { pointer -> [(String, URL, E2EEAttachmentSecret)] in
            let main = (pointer.id, paths.file(for: pointer), pointer.secret)
            guard let thumbnail = pointer.thumbnail, let target = paths.thumbnail(of: pointer) else { return [main] }
            return [(thumbnail.id, target, thumbnail.secret), main]
        }
        var present = 0
        for (blobId, target, secret) in pieces {
            if await materialize(blobId, to: target, with: secret) { present += 1 }
        }
        return present
    }

    private func materialize(_ blobId: String, to target: URL, with secret: E2EEAttachmentSecret) async -> Bool {
        if FileManager.default.fileExists(atPath: target.path) { return true }
        if let running = inFlight[target] { return await running.value }
        let task = Task { [fetcher, paths, logger] in
            await Self.download(blobId, to: target, with: secret, fetcher: fetcher, paths: paths, logger: logger)
        }
        inFlight[target] = task
        let done = await task.value
        inFlight[target] = nil
        return done
    }

    @concurrent
    nonisolated private static func download(
        _ blobId: String, to target: URL, with secret: E2EEAttachmentSecret,
        fetcher: any EndToEndBlobFetching, paths: EndToEndMediaPaths, logger: Logger
    ) async -> Bool {
        let blob = FileManager.default.temporaryDirectory.appendingPathComponent("e2ee-blob-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: blob) }
        do {
            try prepare(paths)
            try await fetcher.blob(blobId, to: blob, maxBytes: E2EEAttachmentCipher.blobSize(forPlaintextSize: secret.size))
            try E2EEAttachmentCipher.open(fileAt: blob, to: target, with: secret, protection: protection)
            try excludeFromBackup(target)
            return true
        } catch let refusal as E2EEAttachmentCipherError {
            logger.error("e2ee attachment refused blob=\(blobId, privacy: .private) reason=\(String(describing: refusal), privacy: .public)")
            return false
        } catch {
            logger.warning("e2ee attachment not fetched blob=\(blobId, privacy: .private): \(String(describing: type(of: error)), privacy: .public)")
            return false
        }
    }

    func adopt(localFile: URL, secret: E2EEAttachmentSecret, contentType: String) async {
        let target = paths.file(digest: secret.digest, key: secret.key, contentType: contentType)
        guard !FileManager.default.fileExists(atPath: target.path) else { return }
        do {
            try Self.prepare(paths)
            try FileManager.default.copyItem(at: localFile, to: target)
            try FileManager.default.setAttributes([.protectionKey: Self.protection], ofItemAtPath: target.path)
            try Self.excludeFromBackup(target)
        } catch {
            logger.warning("e2ee own attachment not kept: \(String(describing: type(of: error)), privacy: .public)")
        }
    }

    /// Un déchiffrement interrompu (app tuée) laisse un `.partial` : clair
    /// incomplet, jamais lu, effacé à la première ouverture qui suit.
    private func sweepLeftoversOnce() {
        guard !sweptLeftovers else { return }
        sweptLeftovers = true
        let leftovers = (try? FileManager.default.contentsOfDirectory(at: paths.directory, includingPropertiesForKeys: nil)) ?? []
        leftovers.filter { $0.pathExtension == "partial" }.forEach { try? FileManager.default.removeItem(at: $0) }
    }

    func discard(_ pointers: [E2EEAttachmentPointer]) async {
        let targets = pointers.flatMap { [paths.file(for: $0)] + (paths.thumbnail(of: $0).map { [$0] } ?? []) }
        for target in targets {
            if let running = inFlight.removeValue(forKey: target) {
                running.cancel()
                _ = await running.value
            }
            try? FileManager.default.removeItem(at: target)
        }
    }

    func wipe() async {
        inFlight.values.forEach { $0.cancel() }
        inFlight = [:]
        try? FileManager.default.removeItem(at: paths.directory)
    }

    nonisolated private static func prepare(_ paths: EndToEndMediaPaths) throws {
        try FileManager.default.createDirectory(
            at: paths.directory, withIntermediateDirectories: true,
            attributes: [.protectionKey: protection]
        )
        try excludeFromBackup(paths.directory)
    }

    nonisolated private static func excludeFromBackup(_ url: URL) throws {
        var mutable = url
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try mutable.setResourceValues(values)
    }
}

/// `GET /api/v1/attachments/:id`, au nom de la session : le blob chiffré, tel
/// que la passerelle le garde. Jamais la route par chemin, qui le refuse.
/// L'identifiant n'est qu'un segment d'adresse (`isReadable` l'a déjà borné à
/// 24 hexadécimaux), et la taille ne dépasse jamais celle que le pointeur annonce.
nonisolated struct GatewayEndToEndBlobFetcher: EndToEndBlobFetching {
    func blob(_ blobId: String, to destination: URL, maxBytes: Int) async throws {
        guard let credential = APIClient.shared.requestCredential,
              let base = URL(string: MeeshyConfig.shared.apiBaseURL) else {
            throw URLError(.userAuthenticationRequired)
        }
        var request = URLRequest(url: base.appendingPathComponent("attachments").appendingPathComponent(blobId))
        request.setValue(credential.value, forHTTPHeaderField: credential.header)
        try await BoundedBlobDownload.fetch(request, to: destination, maxBytes: maxBytes)
    }
}

/// **Un blob se télécharge sous la taille que son pointeur annonce, et pas un
/// octet de plus** (revue de sécurité du 2026-10-25) : la taille DÉCLARÉE
/// (`expectedContentLength`, `Content-Length`) se juge dès la réponse, avant
/// tout octet ; puis chaque morceau du flux se compte, et le téléchargement est
/// annulé au premier octet de trop. Un serveur compromis qui sert un blob sans
/// fin ne remplit donc pas le disque. Rien n'est posé à `destination` qu'un
/// blob entier, dans la limite et sous un statut 200.
nonisolated final class BoundedBlobDownload: NSObject, URLSessionDataDelegate, @unchecked Sendable {
    enum Refusal: Error, Equatable {
        case status(Int)
        case tooLarge
    }

    private let maxBytes: Int
    private let partial: URL
    private let lock = NSLock()
    private var handle: FileHandle?
    private var received = 0
    private var refusal: (any Error)?
    private var continuation: CheckedContinuation<Void, any Error>?

    private init(maxBytes: Int, partial: URL) {
        self.maxBytes = maxBytes
        self.partial = partial
    }

    static func fetch(
        _ request: URLRequest, to destination: URL, maxBytes: Int,
        configuration: URLSessionConfiguration = .ephemeral
    ) async throws {
        let partial = destination.appendingPathExtension("download")
        let download = BoundedBlobDownload(maxBytes: maxBytes, partial: partial)
        let session = URLSession(configuration: configuration, delegate: download, delegateQueue: nil)
        defer {
            session.invalidateAndCancel()
            try? FileManager.default.removeItem(at: partial)
        }
        let task = session.dataTask(with: request)
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                download.lock.withLock { download.continuation = continuation }
                task.resume()
            }
        } onCancel: {
            task.cancel()
        }
        try? FileManager.default.removeItem(at: destination)
        try FileManager.default.moveItem(at: partial, to: destination)
    }

    /// La taille que la réponse annonce, par l'un ou l'autre de ses deux canaux.
    static func declaredLength(of response: HTTPURLResponse) -> Int? {
        let header = response.value(forHTTPHeaderField: "Content-Length").flatMap { Int($0.trimmingCharacters(in: .whitespaces)) }
        let expected = response.expectedContentLength >= 0 ? Int(response.expectedContentLength) : nil
        return [header, expected].compactMap { $0 }.max()
    }

    func urlSession(
        _ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
        completionHandler: @escaping @Sendable (URLSession.ResponseDisposition) -> Void
    ) {
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            refuse(Refusal.status((response as? HTTPURLResponse)?.statusCode ?? 0))
            return completionHandler(.cancel)
        }
        if let declared = Self.declaredLength(of: http), declared > maxBytes {
            refuse(Refusal.tooLarge)
            return completionHandler(.cancel)
        }
        do {
            try? FileManager.default.removeItem(at: partial)
            guard FileManager.default.createFile(atPath: partial.path, contents: nil) else { throw URLError(.cannotCreateFile) }
            let opened = try FileHandle(forWritingTo: partial)
            lock.withLock { handle = opened }
            completionHandler(.allow)
        } catch {
            refuse(error)
            completionHandler(.cancel)
        }
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        let accepted = lock.withLock { () -> FileHandle? in
            guard refusal == nil else { return nil }
            received += data.count
            return received <= maxBytes ? handle : nil
        }
        guard let accepted else {
            refuse(Refusal.tooLarge)
            return dataTask.cancel()
        }
        do {
            try accepted.write(contentsOf: data)
        } catch {
            refuse(error)
            dataTask.cancel()
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: (any Error)?) {
        let (continuation, outcome) = lock.withLock { () -> (CheckedContinuation<Void, any Error>?, (any Error)?) in
            try? handle?.close()
            handle = nil
            let pending = self.continuation
            self.continuation = nil
            return (pending, refusal ?? error)
        }
        guard let continuation else { return }
        if let outcome {
            continuation.resume(throwing: outcome)
        } else {
            continuation.resume()
        }
    }

    private func refuse(_ error: any Error) {
        lock.withLock { if refusal == nil { refusal = error } }
    }
}
