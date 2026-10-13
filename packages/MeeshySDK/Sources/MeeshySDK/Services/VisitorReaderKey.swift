import Foundation

/// La clé d'un lecteur SANS compte (#10483) — ce qui permet à la passerelle de
/// compter UNE vue par lecteur sans savoir qui il est.
///
/// Un uuid aléatoire préfixé `visitor_`, tiré une fois et gardé dans le
/// trousseau : sans lien avec l'appareil ni avec la personne. Il voyage en
/// `X-Session-Token`, et la passerelle n'en écrit qu'une empreinte HMAC. Il est
/// effacé dès qu'un compte se connecte : un compte compte sous son identité.
public protocol VisitorReaderKeyProviding: Sendable {
    /// La clé courante, tirée à la première lecture.
    func readerKey() -> String
    /// Oublie la clé — la prochaine lecture en tire une neuve.
    func purge()
}

public final class VisitorReaderKey: VisitorReaderKeyProviding, @unchecked Sendable {
    public static let shared = VisitorReaderKey()

    public static let prefix = "visitor_"
    static let storageKey = "meeshy.visitor.readerKey"

    private let keychain: any KeychainStoring
    private let lock = NSLock()

    public init(keychain: any KeychainStoring = KeychainManager.shared) {
        self.keychain = keychain
    }

    public func readerKey() -> String {
        lock.lock()
        defer { lock.unlock() }
        if let stored = keychain.load(forKey: Self.storageKey, account: nil), stored.hasPrefix(Self.prefix) {
            return stored
        }
        let fresh = Self.prefix + UUID().uuidString.lowercased()
        try? keychain.save(fresh, forKey: Self.storageKey, account: nil)
        return fresh
    }

    public func purge() {
        lock.lock()
        defer { lock.unlock() }
        keychain.delete(forKey: Self.storageKey, account: nil)
    }
}
