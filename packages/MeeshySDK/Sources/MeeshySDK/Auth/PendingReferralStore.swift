import Foundation

/// La forme d'un code d'invitation — la seule question qu'un client tranche
/// seul (#6584, #8075). Il ne VALIDE rien : seule la passerelle sait si un
/// jeton est actif. `aff_…` (jeton de campagne) et `ref_…` (code d'un compte)
/// sortent du même générateur, d'où une garde d'identifiant opaque : d'un seul
/// tenant, de longueur raisonnable, casse conservée.
///
/// Miroir de `apps/web/src/lib/view/referral-code.ts`.
public enum ReferralCode {
    public static let maxLength = 128

    /// Le code sans ses espaces de bord, ou `nil` s'il n'a pas la forme d'un code.
    public static func normalized(_ raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= maxLength,
              trimmed.rangeOfCharacter(from: .whitespacesAndNewlines) == nil else { return nil }
        return trimmed
    }
}

/// Le code d'invitation, entre l'ouverture du lien et l'inscription (#8075).
///
/// Quelqu'un ouvre une invitation, regarde l'app, puis s'inscrit — parfois le
/// lendemain. Le code doit donc survivre aux relancements, et périr après
/// trente jours comme celui du web.
public protocol PendingReferralStoreProviding: AnyObject {
    /// Mémorise un code bien formé. Un code mal formé n'efface RIEN.
    func remember(_ code: String)
    /// Le code mémorisé et non expiré, ou `nil`.
    func recall() -> String?
    /// Oublie le code — une fois le compte créé.
    func forget()
}

public final class PendingReferralStore: PendingReferralStoreProviding, @unchecked Sendable {
    public static let shared = PendingReferralStore()
    public static let storageKey = "meeshy.pendingReferral"
    /// Trente jours, comme le web (`REFERRAL_MEMORY_TTL_MS`).
    public static let defaultTimeToLive: TimeInterval = 30 * 24 * 3600

    private struct Remembered: Codable {
        let code: String
        let savedAt: Date
    }

    private let defaults: UserDefaults
    private let timeToLive: TimeInterval
    private let now: @Sendable () -> Date

    public init(
        defaults: UserDefaults = .standard,
        timeToLive: TimeInterval = PendingReferralStore.defaultTimeToLive,
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.defaults = defaults
        self.timeToLive = timeToLive
        self.now = now
    }

    public func remember(_ code: String) {
        guard let normalized = ReferralCode.normalized(code),
              let data = try? JSONEncoder().encode(Remembered(code: normalized, savedAt: now())) else { return }
        defaults.set(data, forKey: Self.storageKey)
    }

    public func recall() -> String? {
        guard let data = defaults.data(forKey: Self.storageKey),
              let remembered = try? JSONDecoder().decode(Remembered.self, from: data) else { return nil }
        guard now().timeIntervalSince(remembered.savedAt) <= timeToLive else {
            forget()
            return nil
        }
        return ReferralCode.normalized(remembered.code)
    }

    public func forget() {
        defaults.removeObject(forKey: Self.storageKey)
    }
}
