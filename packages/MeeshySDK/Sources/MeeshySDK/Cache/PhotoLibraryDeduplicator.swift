import Foundation
import UIKit

// MARK: - Contrats

/// Ce qu'un enregistrement dans l'album Meeshy a produit (#10370).
public enum PhotoLibrarySaveOutcome: Sendable, Equatable {
    case saved
    /// Le média y était déjà : rien n'a été écrit.
    case alreadyPresent
    case failed

    /// Le média est dans l'album à l'issue de l'appel, qu'il vienne d'y entrer ou non.
    public var isInAlbum: Bool { self != .failed }
}

/// Ce que la photothèque peut dire d'un asset connu par son identifiant local.
public enum PhotoLibraryAssetPresence: Sendable, Equatable {
    case present
    case absent
    /// La photothèque n'est pas lisible (accès « ajout seulement ») ou ne montre
    /// qu'une sélection (accès limité) : l'absence n'y prouverait rien.
    case unknown
}

/// Le registre persistant `empreinte → identifiant local de l'asset`.
public protocol PhotoLibraryMediaRegistering: AnyObject, Sendable {
    func localIdentifier(for signature: PhotoLibraryMediaSignature) -> String?
    func record(_ signature: PhotoLibraryMediaSignature, localIdentifier: String)
    func forget(_ signature: PhotoLibraryMediaSignature)
    /// Un alias stable (l'identifiant d'une pièce jointe) qui désigne la même empreinte :
    /// il permet de dire « déjà enregistré » sans relire le fichier.
    func noteAlias(_ alias: String, for signature: PhotoLibraryMediaSignature)
    func signature(forAlias alias: String) -> PhotoLibraryMediaSignature?
}

/// La lecture de la photothèque, réduite aux deux questions du dédoublonnage.
public protocol PhotoLibraryAssetProbing: Sendable {
    func presence(ofAsset localIdentifier: String) -> PhotoLibraryAssetPresence
    /// Les empreintes que portent les noms d'origine des assets de l'album Meeshy
    /// (`PhotoLibraryMediaSignature.markedFileName`), ou `nil` si l'album n'est pas lisible.
    func albumMarks() -> [PhotoLibraryMediaSignature: String]?
}

/// L'écriture d'un asset ; rend son identifiant local, ou `nil` en cas d'échec.
public protocol PhotoLibraryAssetCreating: Sendable {
    func create(_ request: PhotoLibraryAssetRequest) async -> String?
}

/// Ce qu'il faut écrire — le nom d'origine porte déjà la marque de l'empreinte.
public struct PhotoLibraryAssetRequest: @unchecked Sendable {
    public enum Kind: Sendable, Equatable { case photo, video }
    public enum Source: @unchecked Sendable {
        case data(Data)
        case file(URL, move: Bool)
        /// Des pixels seuls (capture d'écran) : Photos encode lui-même, sans nom d'origine.
        case pixels(UIImage)
    }

    public let kind: Kind
    public let source: Source
    public let originalFileName: String?
    public let typeIdentifier: String?

    public init(kind: Kind, source: Source, originalFileName: String?, typeIdentifier: String? = nil) {
        self.kind = kind
        self.source = source
        self.originalFileName = originalFileName
        self.typeIdentifier = typeIdentifier
    }
}

// MARK: - La règle

/// **Un média n'entre qu'une fois dans l'album Meeshy** (#10370).
///
/// Avant toute écriture, l'empreinte est cherchée :
/// 1. dans le registre — l'asset qu'il désigne existe-t-il encore ? Présent, ou
///    invérifiable (accès « ajout seulement »), il est DÉJÀ là ; absent (l'utilisateur
///    l'a supprimé), le registre l'oublie et l'écriture repart ;
/// 2. à défaut, une fois par processus et seulement si l'album est lisible, dans les
///    noms d'origine de l'album : c'est ce qui retrouve, après une réinstallation qui
///    a effacé le registre, ce que l'album contenait déjà.
///
/// Deux demandes simultanées pour la même empreinte (l'enregistrement automatique
/// et un toucher sur « Enregistrer ») ne font qu'une écriture : la seconde attend
/// la première et rend `.alreadyPresent`.
public actor PhotoLibraryDeduplicator {

    private let registry: PhotoLibraryMediaRegistering
    private let probe: PhotoLibraryAssetProbing
    private let creator: PhotoLibraryAssetCreating
    private var inFlight: [PhotoLibraryMediaSignature: Task<PhotoLibrarySaveOutcome, Never>] = [:]
    private var albumIndexed = false

    public init(registry: PhotoLibraryMediaRegistering,
                probe: PhotoLibraryAssetProbing,
                creator: PhotoLibraryAssetCreating) {
        self.registry = registry
        self.probe = probe
        self.creator = creator
    }

    public func save(_ request: PhotoLibraryAssetRequest,
                     signature: PhotoLibraryMediaSignature,
                     alias: String? = nil) async -> PhotoLibrarySaveOutcome {
        if let alias, !alias.isEmpty { registry.noteAlias(alias, for: signature) }
        if let running = inFlight[signature] {
            let earlier = await running.value
            if earlier.isInAlbum { return .alreadyPresent }
        }
        if isAlreadyInAlbum(signature) { return .alreadyPresent }

        let creator = creator
        let write = Task { () -> PhotoLibrarySaveOutcome in
            guard let localIdentifier = await creator.create(request) else { return .failed }
            self.registry.record(signature, localIdentifier: localIdentifier)
            return .saved
        }
        inFlight[signature] = write
        let outcome = await write.value
        inFlight[signature] = nil
        return outcome
    }

    /// L'empreinte désigne-t-elle un asset de l'album ? Sans rien écrire.
    public func isAlreadyInAlbum(_ signature: PhotoLibraryMediaSignature) -> Bool {
        if let localIdentifier = registry.localIdentifier(for: signature) {
            switch probe.presence(ofAsset: localIdentifier) {
            case .present, .unknown:
                return true
            case .absent:
                registry.forget(signature)
                return false
            }
        }
        guard !albumIndexed, let marks = probe.albumMarks() else { return false }
        albumIndexed = true
        marks.forEach { registry.record($0.key, localIdentifier: $0.value) }
        return marks[signature] != nil
    }
}

// MARK: - Le registre persistant

/// Registre borné dans `UserDefaults`. Il ne survit pas à une désinstallation —
/// c'est la marque du nom d'origine qui prend alors le relais.
public final class PhotoLibraryMediaRegistry: PhotoLibraryMediaRegistering, @unchecked Sendable {

    public static let shared = PhotoLibraryMediaRegistry()

    static let entriesKey = "meeshy.photoLibrary.signatures.v1"
    static let aliasesKey = "meeshy.photoLibrary.aliases.v1"
    static let capacity = 5000

    private let defaults: UserDefaults
    private let lock = NSLock()
    private var entries: [String: String]
    private var entryOrder: [String]
    private var aliases: [String: String]
    private var aliasOrder: [String]

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let storedEntries = defaults.dictionary(forKey: Self.entriesKey) as? [String: String] ?? [:]
        let storedAliases = defaults.dictionary(forKey: Self.aliasesKey) as? [String: String] ?? [:]
        self.entries = storedEntries
        self.entryOrder = Array(storedEntries.keys)
        self.aliases = storedAliases
        self.aliasOrder = Array(storedAliases.keys)
    }

    public func localIdentifier(for signature: PhotoLibraryMediaSignature) -> String? {
        lock.withLock { entries[signature.token] }
    }

    public func record(_ signature: PhotoLibraryMediaSignature, localIdentifier: String) {
        lock.withLock {
            if entries.updateValue(localIdentifier, forKey: signature.token) == nil {
                entryOrder.append(signature.token)
            }
            Self.trim(&entries, order: &entryOrder)
            defaults.set(entries, forKey: Self.entriesKey)
        }
    }

    public func forget(_ signature: PhotoLibraryMediaSignature) {
        lock.withLock {
            guard entries.removeValue(forKey: signature.token) != nil else { return }
            entryOrder.removeAll { $0 == signature.token }
            defaults.set(entries, forKey: Self.entriesKey)
        }
    }

    public func noteAlias(_ alias: String, for signature: PhotoLibraryMediaSignature) {
        lock.withLock {
            guard aliases[alias] != signature.token else { return }
            if aliases.updateValue(signature.token, forKey: alias) == nil {
                aliasOrder.append(alias)
            }
            Self.trim(&aliases, order: &aliasOrder)
            defaults.set(aliases, forKey: Self.aliasesKey)
        }
    }

    public func signature(forAlias alias: String) -> PhotoLibraryMediaSignature? {
        lock.withLock { aliases[alias].flatMap { PhotoLibraryMediaSignature(token: $0) } }
    }

    private static func trim(_ map: inout [String: String], order: inout [String]) {
        guard order.count > capacity else { return }
        let overflow = order.prefix(order.count - capacity)
        overflow.forEach { map.removeValue(forKey: $0) }
        order.removeFirst(overflow.count)
    }
}
