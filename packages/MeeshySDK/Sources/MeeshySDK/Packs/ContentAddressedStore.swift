import CryptoKit
import Foundation

// MARK: - Le magasin des fichiers de pack, adressés par contenu (#10157, #10150)

/// Ce qui va chercher un fichier de pack sur le réseau.
public protocol PackAssetFetching: Sendable {
    func fetch(file name: String) async throws -> Data
}

/// `GET /api/v1/pack-assets/<fichier>` : public, sans jeton, immuable.
public struct PackAssetHTTPFetcher: PackAssetFetching {
    private let session: URLSession

    public init(session: URLSession = .shared) {
        self.session = session
    }

    public func fetch(file name: String) async throws -> Data {
        guard let url = URL(string: PackAssetsEndpoint.byFile(file: name).absoluteURLString) else {
            throw URLError(.badURL)
        }
        let (data, response) = try await session.data(from: url)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
        return data
    }
}

public enum ContentAddressedStoreError: Error, Equatable {
    /// Les octets reçus ne sont pas ceux que le nom (ou la référence) engage.
    case digestMismatch
}

/// **Les octets d'un pack officiel, sur l'appareil, vérifiés** (§ 5.10.6).
///
/// Un fichier se nomme par son empreinte : il ne change jamais, donc il ne se
/// revalide jamais — il se lit du disque, ou se télécharge UNE fois et se
/// garde. Chaque lecture vérifie le SHA-256 (l'empreinte entière quand la
/// référence la porte, le préfixe du nom sinon) : un fichier altéré sur le
/// disque se retélécharge, un fichier altéré en route ne s'écrit pas.
///
/// `Application Support/meeshy-packs`, exclu de la sauvegarde : ce qu'on
/// retélécharge ne pèse pas dans iCloud. Jamais `CacheCoordinator` : un pack
/// installé ne s'évince pas sous la pression d'un fil d'images.
public actor ContentAddressedStore {
    public static let shared = ContentAddressedStore()

    private let directory: URL
    private let fetcher: PackAssetFetching
    private var inFlight: [String: Task<Data, Error>] = [:]
    private var preparedDirectory = false

    public init(directory: URL? = nil, fetcher: PackAssetFetching = PackAssetHTTPFetcher()) {
        self.directory = directory ?? Self.defaultDirectory
        self.fetcher = fetcher
    }

    public static var defaultDirectory: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("meeshy-packs", isDirectory: true)
    }

    /// Les octets de `file` : du disque s'ils y sont intacts, sinon du réseau
    /// (une seule requête pour des demandes simultanées), vérifiés puis gardés.
    public func data(for file: PackAssetFile) async throws -> Data {
        if let stored = readVerified(file) { return stored }
        let data = try await download(file.name)
        guard Self.matches(data, file) else { throw ContentAddressedStoreError.digestMismatch }
        write(data, name: file.name)
        return data
    }

    public func contains(_ file: PackAssetFile) -> Bool {
        readVerified(file) != nil
    }

    /// Efface du magasin les fichiers nommés, sauf ceux qu'un téléchargement
    /// écrit en ce moment ; rend ceux qui sont partis.
    @discardableResult
    public func prune(_ names: Set<String>) -> Set<String> {
        let removable = names.filter { PackAssetName.isContentAddressed($0) && inFlight[$0] == nil }
        return removable.filter { name in
            (try? FileManager.default.removeItem(at: directory.appendingPathComponent(name))) != nil
        }
    }

    // MARK: - Interne

    /// Une seule requête pour des demandes simultanées du même nom ; chaque
    /// demandeur vérifie ENSUITE les octets contre SA référence — celle qui
    /// porte l'empreinte entière ne se contente jamais du contrôle de préfixe
    /// d'une autre.
    private func download(_ name: String) async throws -> Data {
        if let running = inFlight[name] { return try await running.value }
        let fetcher = self.fetcher
        let task = Task { try await fetcher.fetch(file: name) }
        inFlight[name] = task
        defer { inFlight[name] = nil }
        return try await task.value
    }

    private func readVerified(_ file: PackAssetFile) -> Data? {
        let url = directory.appendingPathComponent(file.name)
        guard let data = try? Data(contentsOf: url) else { return nil }
        guard Self.matches(data, file) else {
            try? FileManager.default.removeItem(at: url)
            return nil
        }
        return data
    }

    private func write(_ data: Data, name: String) {
        prepareDirectory()
        try? data.write(to: directory.appendingPathComponent(name), options: .atomic)
    }

    private func prepareDirectory() {
        guard !preparedDirectory else { return }
        preparedDirectory = true
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var url = directory
        try? url.setResourceValues(values)
    }

    static func matches(_ data: Data, _ file: PackAssetFile) -> Bool {
        let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        if let full = file.sha256 { return digest == full }
        return digest.hasPrefix(file.namedPrefix)
    }
}
