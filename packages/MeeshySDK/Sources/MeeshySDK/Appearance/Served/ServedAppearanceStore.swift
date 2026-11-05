import Combine
import Foundation

// MARK: - Les contrats servis des packs d'apparence, sur l'appareil (#16264)

/// Où lire les octets d'un fichier de pack : sans attendre (le disque seul), ou en
/// allant les chercher. `ContentAddressedStore` en production, un double en test.
public protocol PackContractBytesReading: Sendable {
    func storedData(for file: PackAssetFile) -> Data?
    func data(for file: PackAssetFile) async throws -> Data
}

extension ContentAddressedStore: PackContractBytesReading {}

/// **Les contrats `<sha16>.json` des packs d'apparence NON embarqués** — fonds, bannières,
/// contours et cadres de bannière. Les lectures sont SYNCHRONES et ne touchent jamais le
/// réseau : la mémoire, puis le disque vérifié ; un contrat absent rend `nil` (on peint sans
/// lui, jamais une erreur). Les chargements sont explicites (`load`, `prepare`).
public protocol ServedAppearanceProviding: AnyObject, Sendable {
    /// Le contrat d'une adresse, s'il est sur l'appareil ; vérifié contre son empreinte.
    func contract(src: String) -> ServedAppearanceContract?
    /// La dernière adresse de contrat connue d'un pack — gardée hors ligne.
    func contractSource(domain: PackDomain, slug: String) -> String?
    /// Télécharge (une fois), vérifie et garde le contrat d'une adresse.
    @discardableResult func load(src: String) async -> ServedAppearanceContract?
    /// Rend disponibles les contrats des packs installés, possédés et non embarqués.
    func prepare(domain: PackDomain, installed: [ShopPack]) async
    /// Rend disponible le contrat d'UN pack, choisi ailleurs (le fond d'une conversation).
    @discardableResult func prepare(domain: PackDomain, slug: String) async -> ServedAppearanceContract?
    /// Un contrat est arrivé : les écrans ouverts se repeignent.
    var changes: AnyPublisher<Void, Never> { get }
}

public final class ServedAppearanceStore: ServedAppearanceProviding, @unchecked Sendable {
    public static let shared = ServedAppearanceStore()

    public typealias DetailFetch = @Sendable @concurrent (PackDomain, String) async throws -> ShopPack

    private static let indexKey = "meeshy.served-appearance.contracts.v1"

    private let bytes: PackContractBytesReading
    private let detail: DetailFetch
    private let defaults: UserDefaults
    private let lock = NSLock()
    private var memory: [String: ServedAppearanceContract] = [:]
    private var absent: Set<String> = []
    private var index: [String: PackAssetRef]
    private let subject = PassthroughSubject<Void, Never>()

    public init(bytes: PackContractBytesReading = ContentAddressedStore.shared,
                detail: @escaping DetailFetch = { try await PackService<ShopPack>(domain: $0).detail(slug: $1) },
                defaults: UserDefaults = .standard) {
        self.bytes = bytes
        self.detail = detail
        self.defaults = defaults
        self.index = defaults.data(forKey: Self.indexKey)
            .flatMap { try? JSONDecoder().decode([String: PackAssetRef].self, from: $0) } ?? [:]
    }

    public var changes: AnyPublisher<Void, Never> { subject.eraseToAnyPublisher() }

    public func contract(src: String) -> ServedAppearanceContract? {
        if let known = lock.withLock({ memory[src] }) { return known }
        guard lock.withLock({ !absent.contains(src) }), let file = file(for: src) else { return nil }
        guard let data = bytes.storedData(for: file), let contract = Self.verified(data, file) else {
            lock.withLock { _ = absent.insert(src) }
            return nil
        }
        lock.withLock { memory[src] = contract }
        return contract
    }

    public func contractSource(domain: PackDomain, slug: String) -> String? {
        lock.withLock { index[Self.key(domain, slug)]?.src }
    }

    @discardableResult
    public func load(src: String) async -> ServedAppearanceContract? {
        if let known = contract(src: src) { return known }
        guard let file = file(for: src),
              let data = try? await bytes.data(for: file),
              let contract = Self.verified(data, file) else { return nil }
        lock.withLock {
            memory[src] = contract
            absent.remove(src)
        }
        subject.send(())
        return contract
    }

    public func prepare(domain: PackDomain, installed: [ShopPack]) async {
        let served = installed.filter { !$0.isBundled && $0.isEquipableOnProfile }.map(\.slug)
        await withTaskGroup(of: Void.self) { group in
            for slug in served {
                group.addTask { [self] in _ = await prepare(domain: domain, slug: slug) }
            }
        }
    }

    @discardableResult
    public func prepare(domain: PackDomain, slug: String) async -> ServedAppearanceContract? {
        if let fresh = try? await detail(domain, slug).contract {
            remember(fresh, domain: domain, slug: slug)
        }
        guard let src = contractSource(domain: domain, slug: slug) else { return nil }
        return await load(src: src)
    }

    // MARK: - Interne

    private func remember(_ ref: PackAssetRef, domain: PackDomain, slug: String) {
        let snapshot: [String: PackAssetRef]? = lock.withLock {
            guard index[Self.key(domain, slug)] != ref else { return nil }
            index[Self.key(domain, slug)] = ref
            return index
        }
        guard let snapshot, let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults.set(data, forKey: Self.indexKey)
    }

    /// L'empreinte ENTIÈRE quand un détail l'a servie ; sinon le préfixe que l'adresse engage
    /// (le décor d'autrui ne sert que l'adresse). Une adresse non adressée par contenu ne se lit pas.
    private func file(for src: String) -> PackAssetFile? {
        let full = lock.withLock { index.values.first { $0.src == src } }
        return full?.file ?? PackAssetFile(name: src).flatMap { $0.name.hasSuffix(".json") ? $0 : nil }
    }

    private static func verified(_ data: Data, _ file: PackAssetFile) -> ServedAppearanceContract? {
        guard ContentAddressedStore.matches(data, file) else { return nil }
        return ServedAppearanceContract(data: data)
    }

    private static func key(_ domain: PackDomain, _ slug: String) -> String {
        domain.rawValue + "/" + slug
    }
}

// MARK: - Ce que les résolveurs lisent

extension ServedAppearanceProviding {
    /// Le contrat d'un pack, à la condition qu'il soit bien de CE domaine.
    public func contract(domain: PackDomain, slug: String) -> ServedAppearanceContract? {
        guard let src = contractSource(domain: domain, slug: slug), let contract = contract(src: src),
              contract.domain == domain else { return nil }
        return contract
    }

    /// Le modèle de fond d'un pack servi (le fond d'une conversation) ; `nil` ⇒ Signature.
    public func wallpaper(pack: String, design: String) -> AppearanceDesign? {
        contract(domain: .wallpaper, slug: pack)?.appearanceDesigns.first { $0.key == design }
    }

    /// Ce que porte un choix optimiste : l'adresse du contrat d'un pack servi, pour qu'il se peigne
    /// dès le toucher ; un pack sans contrat connu reste embarqué, comme avant.
    public func servedItem(_ ref: ProfileDecorRef, side: ProfileDecorSide) -> ServedProfileDecorItem {
        guard let domain = PackDomain(rawValue: side.packDomain),
              let src = contractSource(domain: domain, slug: ref.pack) else {
            return ServedProfileDecorItem(pack: ref.pack, item: ref.item, origin: .builtin, contract: nil)
        }
        return ServedProfileDecorItem(pack: ref.pack, item: ref.item, origin: .official, contract: src)
    }

    /// Le contrat qu'un décor servi désigne, s'il est de son côté.
    func contract(for item: ServedProfileDecorItem, side: ProfileDecorSide) -> ServedAppearanceContract? {
        guard let src = item.contract, let contract = contract(src: src),
              contract.domain.rawValue == side.packDomain else { return nil }
        return contract
    }
}
