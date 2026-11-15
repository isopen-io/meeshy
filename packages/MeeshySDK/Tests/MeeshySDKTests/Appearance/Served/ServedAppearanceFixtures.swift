import CryptoKit
import Foundation
@testable import MeeshySDK

/// Des contrats servis RÉELS : les modèles d'un pack du catalogue embarqué, rhabillés en `<sha16>.json`
/// d'un pack qui n'est PAS embarqué. Rien ne part sur le réseau : les octets vivent dans `FakeContractBytes`.
enum ServedAppearanceFixtures {

    struct Contract {
        let data: Data
        let ref: PackAssetRef
        var src: String { ref.src }
    }

    /// `domain` = la valeur servie (`wallpaper`, `banner`, `avatar-ring`, `banner-frame`) ;
    /// `section`/`slug`/`items` désignent le pack embarqué dont on emprunte les modèles.
    static func contract(domain: String, section: String, slug: String, items: String) -> Contract {
        let catalog = (try? JSONSerialization.jsonObject(with: Data(AppearanceCatalogData.json.utf8))) as? [String: Any] ?? [:]
        let packs = catalog[section] as? [[String: Any]] ?? []
        let designs = packs.first { $0["slug"] as? String == slug }?[items] ?? []
        let body: [String: Any] = ["domain": domain, items: designs]
        let data = (try? JSONSerialization.data(withJSONObject: body, options: [.sortedKeys])) ?? Data()
        return Contract(data: data, ref: ref(for: data))
    }

    static func ref(for data: Data) -> PackAssetRef {
        let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        return PackAssetRef(src: String(digest.prefix(16)) + ".json", bytes: data.count, sha256: digest)!
    }

    static var wallpaper: Contract { contract(domain: "wallpaper", section: "wallpapers", slug: "heritages", items: "designs") }
    static var banner: Contract { contract(domain: "banner", section: "banners", slug: "bannieres-animees", items: "designs") }
    static var ring: Contract { contract(domain: "avatar-ring", section: "rings", slug: "contours-grec", items: "rings") }
    static var frame: Contract { contract(domain: "banner-frame", section: "bannerFrames", slug: "cadres-grec", items: "frames") }

    static func detail(_ slug: String, contract: Contract?) -> ShopPack {
        ShopPack(slug: slug, name: slug, origin: .official, installed: true, contract: contract?.ref)
    }

    static func installed(_ slug: String, owned: Bool = true, installed: Bool = true, builtin: Bool = false) -> ShopPack {
        ShopPack(slug: slug, name: slug, isBuiltin: builtin, origin: builtin ? .builtin : .official,
                 installed: installed, price: owned ? nil : 40, owned: owned ? nil : false)
    }

    static func defaults() -> UserDefaults {
        let name = "served-appearance-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }
}

/// Le disque et le réseau d'un magasin adressé par contenu, en mémoire. `network` peut servir
/// des octets ALTÉRÉS sous un nom honnête : la vérification d'empreinte doit les refuser.
final class FakeContractBytes: PackContractBytesReading, @unchecked Sendable {
    private let lock = NSLock()
    private var disk: [String: Data]
    private var network: [String: Data]
    private var fetched: [String] = []

    init(disk: [String: Data] = [:], network: [String: Data] = [:]) {
        self.disk = disk
        self.network = network
    }

    var fetches: [String] { lock.withLock { fetched } }
    var stored: [String: Data] { lock.withLock { disk } }

    func goOffline() { lock.withLock { network = [:] } }

    func storedData(for file: PackAssetFile) -> Data? {
        lock.withLock { disk[file.name] }
    }

    func data(for file: PackAssetFile) async throws -> Data {
        if let local = storedData(for: file) { return local }
        let served: Data? = lock.withLock {
            fetched.append(file.name)
            return network[file.name]
        }
        guard let served else { throw URLError(.notConnectedToInternet) }
        guard ContentAddressedStore.matches(served, file) else { throw ContentAddressedStoreError.digestMismatch }
        lock.withLock { disk[file.name] = served }
        return served
    }
}

/// Le détail `GET /packs/<domaine>/:slug`, sans serveur ; compte ses appels.
final class FakePackDetails: @unchecked Sendable {
    private let lock = NSLock()
    private var details: [String: ShopPack]
    private var asked: [String] = []

    init(_ details: [String: ShopPack] = [:]) {
        self.details = details
    }

    var calls: [String] { lock.withLock { asked } }

    func goOffline() { lock.withLock { details = [:] } }

    func fetch(domain: PackDomain, slug: String) async throws -> ShopPack {
        try lock.withLock {
            asked.append("\(domain.rawValue)/\(slug)")
            guard let detail = details["\(domain.rawValue)/\(slug)"] else { throw URLError(.notConnectedToInternet) }
            return detail
        }
    }
}
