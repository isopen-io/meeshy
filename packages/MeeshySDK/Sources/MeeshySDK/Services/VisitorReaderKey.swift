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
    /// La clé gardée, SANS en tirer une neuve — `nil` après une purge.
    func storedReaderKey() -> String?
    /// Oublie la clé — la prochaine lecture en tire une neuve.
    func purge()
}

public final class VisitorReaderKey: VisitorReaderKeyProviding, Sendable {
    public static let shared = VisitorReaderKey()

    public static let prefix = "visitor_"
    static let storageKey = "meeshy.visitor.readerKey"

    private let keychain: Locked<any KeychainStoring>

    public init(keychain: any KeychainStoring = KeychainManager.shared) {
        self.keychain = Locked(keychain)
    }

    public func readerKey() -> String {
        keychain.read { store -> String in
            if let stored = store.load(forKey: VisitorReaderKey.storageKey, account: nil),
               stored.hasPrefix(VisitorReaderKey.prefix) {
                return stored
            }
            let fresh = VisitorReaderKey.prefix + UUID().uuidString.lowercased()
            try? store.save(fresh, forKey: VisitorReaderKey.storageKey, account: nil)
            return fresh
        }
    }

    public func storedReaderKey() -> String? {
        keychain.read { store -> String? in
            guard let stored = store.load(forKey: VisitorReaderKey.storageKey, account: nil),
                  stored.hasPrefix(VisitorReaderKey.prefix) else { return nil }
            return stored
        }
    }

    public func purge() {
        keychain.read { $0.delete(forKey: VisitorReaderKey.storageKey, account: nil) }
    }
}
