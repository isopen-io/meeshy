import Foundation

/// Mémoire BORNÉE des empreintes de fichiers (#9875).
///
/// L'empreinte SHA-256 est la clé du point de reprise TUS. Elle relisait le
/// fichier ENTIER à chaque tentative : un vocal ou une vidéo de 200 Mo rejoué
/// par la file durable après une coupure se relisait autant de fois qu'il
/// était retenté, avant même le premier octet envoyé. Un `TusUploadManager`
/// naissant à chaque envoi, la mémoire est de PROCESSUS (`shared`).
///
/// Un fichier est reconnu par son chemin, sa taille ET sa date de
/// modification : un fichier réécrit au même chemin change d'identité et se
/// rehache. Au-delà de `capacity` entrées, la plus ancienne cède.
final class FileDigestMemo: @unchecked Sendable {
    struct Identity: Hashable {
        let path: String
        let size: Int64
        let modifiedAt: Date
    }

    static let shared = FileDigestMemo(capacity: 32)

    private let capacity: Int
    private let lock = NSLock()
    private var digests: [Identity: String] = [:]
    private var insertionOrder: [Identity] = []

    init(capacity: Int) {
        self.capacity = max(1, capacity)
    }

    func digest(of fileURL: URL, computing compute: (URL) throws -> String) throws -> String {
        guard let identity = Self.identity(of: fileURL) else { return try compute(fileURL) }
        if let known = lock.withLock({ digests[identity] }) { return known }
        let digest = try compute(fileURL)
        lock.withLock { remember(digest, for: identity) }
        return digest
    }

    var count: Int {
        lock.withLock { digests.count }
    }

    private func remember(_ digest: String, for identity: Identity) {
        guard digests[identity] == nil else { return }
        digests[identity] = digest
        insertionOrder.append(identity)
        while insertionOrder.count > capacity {
            let evicted = insertionOrder.removeFirst()
            digests[evicted] = nil
        }
    }

    private static func identity(of fileURL: URL) -> Identity? {
        let path = fileURL.standardizedFileURL.path
        guard let attributes = try? FileManager.default.attributesOfItem(atPath: path),
              let size = (attributes[.size] as? NSNumber)?.int64Value,
              let modifiedAt = attributes[.modificationDate] as? Date else { return nil }
        return Identity(path: path, size: size, modifiedAt: modifiedAt)
    }
}
