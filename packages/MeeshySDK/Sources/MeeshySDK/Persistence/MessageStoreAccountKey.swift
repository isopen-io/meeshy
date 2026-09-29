import CryptoKit
import Foundation

/// Le compte auquel appartient une base locale des messages (#8656, #8657).
///
/// La base GRDB des messages — timeline, outbox, fil social, index de
/// recherche — n'a aucune colonne propriétaire. Partagée entre les comptes
/// d'un appareil, elle laissait lire au compte suivant, le temps d'une purge
/// asynchrone, les lignes du compte quitté (contenu protégé compris), et une
/// conversation partagée par les deux comptes y mêlait leurs auteurs. Chaque
/// compte a donc SON fichier, et un compte se dit « utilisateur +
/// environnement » : le même identifiant existe en production et en staging.
///
/// Le nom de fichier est une empreinte, jamais l'identifiant en clair : le
/// dossier App Group est lisible par les extensions, et l'identité d'un compte
/// n'a rien à faire dans un nom de fichier.
public struct MessageStoreAccountKey: Hashable, Sendable {
    public let userId: String
    public let environmentHost: String

    public static let legacyDatabaseFileName = "meeshy_messages.sqlite"
    public static let activeUserIdDefaultsKey = "meeshy_active_user_id"
    static let fileNamePrefix = "meeshy_messages_acct_"
    static let cacheArchivePrefix = "meeshy_cache_acct_"
    static let fileNameSuffix = ".sqlite"

    public init?(userId: String?, serverOrigin: String?) {
        guard let trimmed = userId?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty else { return nil }
        self.userId = trimmed
        self.environmentHost = Self.normalizedHost(of: serverOrigin ?? "")
    }

    /// Le compte tel qu'il a été gravé (hôte déjà normalisé) — relu depuis
    /// le marqueur du propriétaire du cache (#8674).
    init(userId: String, environmentHost: String) {
        self.userId = userId
        self.environmentHost = environmentHost
    }

    public var databaseFileName: String {
        Self.fileNamePrefix + fingerprint + Self.fileNameSuffix
    }

    /// Le cache (`CacheCoordinator`) d'un compte QUITTÉ mais gardé sur
    /// l'appareil, mis de côté jusqu'à son retour (#8674). Même empreinte que
    /// sa base de messages : un compte, deux fichiers, jamais son identifiant
    /// en clair.
    public var cacheArchiveFileName: String {
        Self.cacheArchivePrefix + fingerprint + Self.fileNameSuffix
    }

    /// L'empreinte du compte, qui nomme tout ce que l'appareil garde de lui.
    public var fingerprint: String {
        let digest = SHA256.hash(data: Data("\(environmentHost)|\(userId)".utf8))
        return digest.prefix(16).map { String(format: "%02x", $0) }.joined()
    }

    public static func isAccountStoreFileName(_ name: String) -> Bool {
        name.hasPrefix(fileNamePrefix) && name.hasSuffix(fileNameSuffix)
    }

    public static func isCacheArchiveFileName(_ name: String) -> Bool {
        name.hasPrefix(cacheArchivePrefix) && name.hasSuffix(fileNameSuffix)
    }

    /// Le compte actif tel que l'app le publie dans l'App Group — ce que lit
    /// l'extension de notification pour pré-enregistrer dans la base du
    /// DESTINATAIRE, et dans aucune autre. `nil` quand personne n'est connecté :
    /// l'extension n'écrit alors nulle part.
    public static func activeAccount(appGroupDefaults: UserDefaults?, serverOrigin: String) -> MessageStoreAccountKey? {
        MessageStoreAccountKey(
            userId: appGroupDefaults?.string(forKey: activeUserIdDefaultsKey),
            serverOrigin: serverOrigin
        )
    }

    static func normalizedHost(of origin: String) -> String {
        let trimmed = origin.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard let components = URLComponents(string: trimmed), let host = components.host, !host.isEmpty else {
            return trimmed.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        }
        return components.port.map { "\(host):\($0)" } ?? host
    }
}
