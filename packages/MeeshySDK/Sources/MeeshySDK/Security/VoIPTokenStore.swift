import Foundation

/// A record describing the most recent VoIP push token the app has
/// registered with the backend.
///
/// `at` is the wall-clock moment at which the registration completed —
/// `VoIPPushManager` reads it to enforce its cooldown so PushKit's
/// repeated `didUpdatePushCredentials` callbacks do not spam the gateway.
public struct VoIPTokenRecord: Sendable, Codable, Equatable {
    public let token: String
    public let at: Date

    public init(token: String, at: Date) {
        self.token = token
        self.at = at
    }
}

/// Storage abstraction for the VoIP device token.
///
/// The default backing is the Keychain (`KeychainVoIPTokenStore`) — VoIP
/// tokens are credentials, not user preferences, and storing them in
/// `UserDefaults` exposes them to unencrypted `.plist` backups.
///
/// Conforming types must be safe to call from any actor: the methods are
/// `async` and the operations are short.
public protocol VoIPTokenStoring: Sendable {
    func read() async -> VoIPTokenRecord?
    func save(token: String, at date: Date) async throws
    func clear() async

    /// One-shot migration from the legacy `UserDefaults`-backed storage.
    ///
    /// Idempotent: returns the migrated record on the first call (or any
    /// time the keychain is already populated), then `nil` afterwards.
    /// Clears the legacy `UserDefaults` keys regardless of outcome so the
    /// secret never lingers in plaintext storage.
    @discardableResult
    func migrateFromUserDefaultsIfNeeded() async -> VoIPTokenRecord?
}

/// Keychain-backed implementation of ``VoIPTokenStoring``.
///
/// The record is stored as a JSON blob under a single Keychain entry so the
/// `(token, registeredAt)` pair always stays in sync — partial writes are
/// impossible.
public final class KeychainVoIPTokenStore: VoIPTokenStoring, @unchecked Sendable {

    /// Legacy `UserDefaults` keys used before this migration. Public so the
    /// host app can also clear them on logout if it bypassed the store.
    public static let legacyTokenKey = "com.meeshy.voip.lastRegisteredToken"
    public static let legacyDateKey = "com.meeshy.voip.lastRegisteredAt"

    private let keychain: KeychainManager
    private let storageKey: String
    private let userDefaults: UserDefaults
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    public init(
        keychain: KeychainManager = .shared,
        storageKey: String = "voip.registeredDevice",
        userDefaults: UserDefaults = .standard
    ) {
        self.keychain = keychain
        self.storageKey = storageKey
        self.userDefaults = userDefaults
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
    }

    public func read() async -> VoIPTokenRecord? {
        guard let raw = await keychain.loadAsync(forKey: storageKey),
              let data = raw.data(using: .utf8) else { return nil }
        return try? decoder.decode(VoIPTokenRecord.self, from: data)
    }

    public func save(token: String, at date: Date) async throws {
        let record = VoIPTokenRecord(token: token, at: date)
        let data = try encoder.encode(record)
        guard let json = String(data: data, encoding: .utf8) else {
            throw KeychainError.saveFailed(errSecParam)
        }
        try await keychain.saveAsync(json, forKey: storageKey)
    }

    public func clear() async {
        let key = storageKey
        let keychain = self.keychain
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            DispatchQueue.global(qos: .userInitiated).async {
                keychain.delete(forKey: key)
                cont.resume()
            }
        }
    }

    @discardableResult
    public func migrateFromUserDefaultsIfNeeded() async -> VoIPTokenRecord? {
        let defaults = userDefaults
        let legacyTokenKey = Self.legacyTokenKey
        let legacyDateKey = Self.legacyDateKey

        if let existing = await read() {
            // Even when the keychain is already populated we purge any legacy
            // copy so the secret cannot survive in plaintext.
            defaults.removeObject(forKey: legacyTokenKey)
            defaults.removeObject(forKey: legacyDateKey)
            return existing
        }

        guard let legacyToken = defaults.string(forKey: legacyTokenKey),
              !legacyToken.isEmpty else {
            defaults.removeObject(forKey: legacyTokenKey)
            defaults.removeObject(forKey: legacyDateKey)
            return nil
        }

        let legacyDate = (defaults.object(forKey: legacyDateKey) as? Date)
            ?? Date.distantPast
        try? await save(token: legacyToken, at: legacyDate)

        defaults.removeObject(forKey: legacyTokenKey)
        defaults.removeObject(forKey: legacyDateKey)

        return VoIPTokenRecord(token: legacyToken, at: legacyDate)
    }
}
