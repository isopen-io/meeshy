import Foundation
import Combine
import CommonCrypto
import CryptoKit
import LocalAuthentication
import Security
import MeeshySDK

/// Où vivent les empreintes des PIN, vu comme trois fonctions : un double en
/// test (#11558). `SecretsConversationLockVault` l'adapte au coffre.
struct ConversationLockSecrets {
    let read: (String) -> String?
    let save: (String, String) -> Bool
    let delete: (String) -> Void
}

// MARK: - Le contenu masqué (#11387)

extension Notification.Name {
    /// Le jeu des conversations verrouillées a changé : ce qui publie du
    /// contenu HORS de l'app (widget, cliché lu par l'extension de
    /// notification) se republie sans attendre la prochaine mise à jour de la
    /// liste.
    static let conversationContentLocksDidChange = Notification.Name("meeshy.conversationContentLocksDidChange")
}

// MARK: - La porte du routeur (#11386)

/// La SEULE question que le routeur pose au verrou avant de poser une
/// conversation à l'écran (`Router.admitConversation`).
///
/// `true` : la conversation n'est pas verrouillée, ou le PIN — ou la
/// biométrie — vient d'en autoriser UNE ouverture. Le laissez-passer se
/// consomme : la question suivante redemande le PIN.
@MainActor
protocol ConversationLockGating: AnyObject {
    func admitsOpening(_ conversationId: String) -> Bool
}

// MARK: - Le coffre

/// Où vivent les codes, leurs compteurs d'échecs et l'état d'enrôlement
/// biométrique. En production, le trousseau, propre à l'appareil.
@MainActor
protocol ConversationLockVault {
    func read(_ key: String) -> String?
    @discardableResult
    func write(_ value: String, for key: String) -> Bool
    func delete(_ key: String)
}

struct KeychainConversationLockVault: ConversationLockVault {
    let service: String

    init(service: String = "me.meeshy.app.conversation-locks") {
        self.service = service
    }

    func read(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    @discardableResult
    func write(_ value: String, for key: String) -> Bool {
        delete(key)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: Data(value.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
    }

    func delete(_ key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
    }
}

/// Un coffre bâti sur trois fonctions : les tests de lecture paresseuse
/// (#11558) y comptent les lectures sans toucher le trousseau.
struct SecretsConversationLockVault: ConversationLockVault {
    let secrets: ConversationLockSecrets

    func read(_ key: String) -> String? { secrets.read(key) }

    @discardableResult
    func write(_ value: String, for key: String) -> Bool { secrets.save(key, value) }

    func delete(_ key: String) { secrets.delete(key) }
}

// MARK: - Le code dérivé (#11388)

/// Ce que le coffre garde d'un PIN : jamais le PIN, jamais son SHA-256 nu.
///
/// PBKDF2-HMAC-SHA256 sous un sel aléatoire de 16 octets PROPRE À CHAQUE CODE
/// (plus fort qu'un sel par appareil : deux conversations au même PIN ne
/// partagent pas d'empreinte), encodé `pbkdf2-sha256$<itérations>$<sel>$<dérivé>`.
///
/// La dérivation lente renchérit une attaque HORS LIGNE sans la rendre
/// impossible : un code à 4 chiffres n'a que 10 000 valeurs. La barrière réelle
/// est double — l'élément de trousseau ne quitte pas l'appareil
/// (`ThisDeviceOnly`) et chaque essai en ligne passe par
/// `ConversationPinThrottle`.
///
/// `legacySHA256` lit les codes posés par les versions antérieures : vérifiables
/// tels quels, re-dérivés au premier succès (le clair n'est connu qu'à la
/// saisie).
nonisolated struct ConversationPinCredential: Equatable, Sendable {
    nonisolated enum Scheme: Equatable, Sendable {
        case legacySHA256
        case pbkdf2SHA256(iterations: Int, salt: Data)
    }

    static let defaultIterations = 100_000
    static let maximumIterations = 10_000_000
    static let saltLength = 16
    static let digestLength = 32
    private static let schemeTag = "pbkdf2-sha256"

    let scheme: Scheme
    let digest: Data

    static func derive(
        pin: String,
        iterations: Int = ConversationPinCredential.defaultIterations,
        salt: Data = ConversationPinCredential.randomSalt()
    ) -> ConversationPinCredential? {
        guard let digest = pbkdf2(pin: pin, salt: salt, iterations: iterations) else { return nil }
        return ConversationPinCredential(scheme: .pbkdf2SHA256(iterations: iterations, salt: salt), digest: digest)
    }

    static func decode(_ stored: String) -> ConversationPinCredential? {
        decodeDerived(stored) ?? decodeLegacy(stored)
    }

    var encoded: String {
        switch scheme {
        case .legacySHA256:
            return Self.hex(digest)
        case .pbkdf2SHA256(let iterations, let salt):
            return [Self.schemeTag, String(iterations), salt.base64EncodedString(), digest.base64EncodedString()]
                .joined(separator: "$")
        }
    }

    func matches(_ pin: String) -> Bool {
        guard let candidate = candidateDigest(for: pin) else { return false }
        return Self.constantTimeEquals(candidate, digest)
    }

    func needsUpgrade(toIterations target: Int) -> Bool {
        guard case .pbkdf2SHA256(let iterations, _) = scheme else { return true }
        return iterations < target
    }

    static func pbkdf2(pin: String, salt: Data, iterations: Int) -> Data? {
        guard iterations > 0, iterations <= maximumIterations, !salt.isEmpty else { return nil }
        let saltBytes = [UInt8](salt)
        let pinLength = pin.utf8.count
        let keyLength = digestLength
        var derived = [UInt8](repeating: 0, count: keyLength)
        let status = pin.withCString { pinPointer in
            CCKeyDerivationPBKDF(
                CCPBKDFAlgorithm(kCCPBKDF2),
                pinPointer,
                pinLength,
                saltBytes,
                saltBytes.count,
                CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256),
                UInt32(iterations),
                &derived,
                keyLength
            )
        }
        guard status == Int32(kCCSuccess) else { return nil }
        return Data(derived)
    }

    static func randomSalt() -> Data {
        SymmetricKey(size: .bits128).withUnsafeBytes { Data($0) }
    }

    static func hex(_ data: Data) -> String {
        data.map { String(format: "%02x", $0) }.joined()
    }

    static func constantTimeEquals(_ lhs: Data, _ rhs: Data) -> Bool {
        guard lhs.count == rhs.count else { return false }
        return zip(lhs, rhs).reduce(UInt8(0)) { $0 | ($1.0 ^ $1.1) } == 0
    }

    private func candidateDigest(for pin: String) -> Data? {
        switch scheme {
        case .legacySHA256:
            return Data(SHA256.hash(data: Data(pin.utf8)))
        case .pbkdf2SHA256(let iterations, let salt):
            return Self.pbkdf2(pin: pin, salt: salt, iterations: iterations)
        }
    }

    private static func decodeDerived(_ stored: String) -> ConversationPinCredential? {
        let parts = stored.split(separator: "$", omittingEmptySubsequences: false).map(String.init)
        guard parts.count == 4, parts[0] == schemeTag,
              let iterations = Int(parts[1]), iterations > 0, iterations <= maximumIterations,
              let salt = Data(base64Encoded: parts[2]), !salt.isEmpty,
              let digest = Data(base64Encoded: parts[3]), digest.count == digestLength else { return nil }
        return ConversationPinCredential(scheme: .pbkdf2SHA256(iterations: iterations, salt: salt), digest: digest)
    }

    private static func decodeLegacy(_ stored: String) -> ConversationPinCredential? {
        let characters = Array(stored.utf8)
        let hexDigits = Set("0123456789abcdefABCDEF".utf8)
        guard characters.count == digestLength * 2, characters.allSatisfy(hexDigits.contains) else { return nil }
        let bytes = stride(from: 0, to: characters.count, by: 2).compactMap { index in
            UInt8(String(decoding: characters[index..<index + 2], as: UTF8.self), radix: 16)
        }
        guard bytes.count == digestLength else { return nil }
        return ConversationPinCredential(scheme: .legacySHA256, digest: Data(bytes))
    }
}

// MARK: - La temporisation (#11388)

/// Les échecs d'un code, et ce qu'ils coûtent : rien pour les quatre premiers,
/// puis 30 s, doublées à chaque échec, plafonnées à une heure. Dix mille essais
/// coûtent alors plus d'un an.
///
/// Persistée avec le code (le coffre), donc tuer l'app ne la remet pas à zéro ;
/// une horloge reculée ne raccourcit pas l'attente (`anchored(at:)`).
nonisolated struct ConversationPinThrottle: Codable, Equatable, Sendable {
    static let freeFailures = 4
    static let baseDelay: TimeInterval = 30
    static let maximumDelay: TimeInterval = 3_600

    let failures: Int
    let lastFailureAt: Date?

    init(failures: Int = 0, lastFailureAt: Date? = nil) {
        self.failures = failures
        self.lastFailureAt = lastFailureAt
    }

    static func delay(afterFailures failures: Int) -> TimeInterval {
        guard failures > freeFailures else { return 0 }
        let doublings = min(failures - freeFailures - 1, 20)
        return min(baseDelay * pow(2, Double(doublings)), maximumDelay)
    }

    func retryDelay(at now: Date) -> TimeInterval {
        let delay = Self.delay(afterFailures: failures)
        guard delay > 0, let lastFailureAt else { return 0 }
        let elapsed = max(0, now.timeIntervalSince(lastFailureAt))
        return max(0, delay - elapsed)
    }

    /// Un dernier échec daté dans le FUTUR (horloge reculée) est ramené à
    /// maintenant : l'attente repart entière au lieu de durer jusqu'à la date
    /// d'origine — ou de disparaître.
    func anchored(at now: Date) -> ConversationPinThrottle {
        guard let lastFailureAt, lastFailureAt > now else { return self }
        return ConversationPinThrottle(failures: failures, lastFailureAt: now)
    }

    func recordingFailure(at now: Date) -> ConversationPinThrottle {
        ConversationPinThrottle(failures: failures + 1, lastFailureAt: now)
    }
}

/// Le verdict d'un essai. `retryIn` : secondes avant qu'un nouvel essai soit
/// seulement examiné (0 = tout de suite).
nonisolated enum PinAttemptOutcome: Equatable, Sendable {
    case granted
    case rejected(retryIn: TimeInterval)
    case throttled(retryIn: TimeInterval)

    var retryDelay: TimeInterval? {
        switch self {
        case .granted: return nil
        case .rejected(let wait), .throttled(let wait): return wait
        }
    }
}

// MARK: - La biométrie (#11388)

nonisolated enum BiometricKind: Equatable, Sendable {
    case faceID
    case touchID
    case other

    var systemImage: String {
        switch self {
        case .faceID: return "faceid"
        case .touchID: return "touchid"
        case .other: return "person.badge.key.fill"
        }
    }
}

@MainActor
protocol BiometricUnlocking {
    func availableKind() -> BiometricKind?
    /// Empreinte de l'ensemble des visages / doigts enrôlés : elle change dès
    /// qu'on en ajoute ou retire un.
    func enrollmentState() -> Data?
    func authenticate(reason: String) async -> Bool
}

struct DeviceBiometricUnlocker: BiometricUnlocking {
    func availableKind() -> BiometricKind? {
        let context = LAContext()
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) else { return nil }
        switch context.biometryType {
        case .faceID: return .faceID
        case .touchID: return .touchID
        case .none: return nil
        default: return .other
        }
    }

    func enrollmentState() -> Data? {
        let context = LAContext()
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) else { return nil }
        return context.evaluatedPolicyDomainState
    }

    func authenticate(reason: String) async -> Bool {
        let context = LAContext()
        context.localizedFallbackTitle = ""
        let verdict = try? await context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason)
        return verdict ?? false
    }
}

// MARK: - Le gestionnaire

@MainActor
final class ConversationLockManager: ObservableObject, ConversationLockGating {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    static let shared = ConversationLockManager(
        contentLockMirror: UserDefaults(suiteName: UserPreferencesManager.appGroupSuiteName),
        contentLockMirrorFile: NSELockedConversationMirror.fileURL(
            inContainer: FileManager.default.containerURL(
                forSecurityApplicationGroupIdentifier: UserPreferencesManager.appGroupSuiteName
            )
        ),
        purgeDeliveredBanners: { conversationId in
            NotificationActionHandler.removeDeliveredBanners(forThreadOf: .conversation(id: conversationId))
        }
    )

    /// Durée de vie d'une ouverture autorisée et pas encore consommée.
    static let openingPassLifetime: TimeInterval = 60

    @Published private(set) var lockedConversationIds: Set<String> = []
    private var knownMasterPin: Bool?
    private var knownBiometricUnlock: Bool?

    private let vault: ConversationLockVault
    private let defaults: UserDefaults
    private let biometrics: BiometricUnlocking
    private let iterations: Int
    private let now: () -> Date
    /// #11387 — le jeu COMPLET des conversations verrouillées, miroité dans
    /// l'App Group pour l'extension de notification (le cliché de la liste
    /// n'en couvre que les pages chargées). `nil` : aucun miroir (tests).
    /// La clé `UserDefaults` est le renfort des versions antérieures ; le
    /// FICHIER est ce que l'extension lit d'abord (#12655).
    private let contentLockMirror: UserDefaults?
    private let contentLockMirrorFile: URL?
    /// #11387 — verrouiller retire du Centre de notifications les bannières
    /// DÉJÀ délivrées de la conversation : elles montraient son contenu.
    private let purgeDeliveredBanners: @MainActor (String) -> Void

    private let masterPinKey = "meeshy_master_pin"
    private let biometricStateKey = "meeshy_lock_biometric_state"
    private let lockedIdsDefaultsKey = "meeshy.lockedConversationIds"

    private var openingPasses: [String: Date] = [:]
    private var cancellables = Set<AnyCancellable>()

    init(
        vault: ConversationLockVault = KeychainConversationLockVault(),
        defaults: UserDefaults = .standard,
        biometrics: BiometricUnlocking = DeviceBiometricUnlocker(),
        iterations: Int = ConversationPinCredential.defaultIterations,
        now: @escaping () -> Date = { Date() },
        contentLockMirror: UserDefaults? = nil,
        contentLockMirrorFile: URL? = nil,
        purgeDeliveredBanners: @escaping @MainActor (String) -> Void = { _ in }
    ) {
        self.vault = vault
        self.defaults = defaults
        self.biometrics = biometrics
        self.iterations = iterations
        self.now = now
        self.contentLockMirror = contentLockMirror
        self.contentLockMirrorFile = contentLockMirrorFile
        self.purgeDeliveredBanners = purgeDeliveredBanners
        loadLockedIds()
        wireAuthLogoutHook()
    }

    convenience init(secrets: ConversationLockSecrets) {
        self.init(vault: SecretsConversationLockVault(secrets: secrets))
    }

    /// Le PIN maître est-il posé ? Lu au trousseau au PREMIER besoin (#11558) :
    /// le gestionnaire est construit pendant le rendu des premières lignes de
    /// la liste, et la valeur ne sert qu'au geste de verrouillage et aux Réglages.
    var masterPinConfigured: Bool {
        if let knownMasterPin { return knownMasterPin }
        let configured = vault.read(masterPinKey) != nil
        knownMasterPin = configured
        return configured
    }

    /// La biométrie est-elle activée ? Même lecture paresseuse que le PIN maître.
    var biometricUnlockEnabled: Bool {
        if let knownBiometricUnlock { return knownBiometricUnlock }
        let enabled = vault.read(biometricStateKey) != nil
        knownBiometricUnlock = enabled
        return enabled
    }

    private func noteMasterPin(_ configured: Bool) {
        objectWillChange.send()
        knownMasterPin = configured
    }

    private func noteBiometricUnlock(_ enabled: Bool) {
        objectWillChange.send()
        knownBiometricUnlock = enabled
    }

    /// P7-11 — pattern calqué sur `FeedbackToastManager.wireAuthLogoutHook` :
    /// à la déconnexion (`isAuthenticated` → false, valeur initiale ignorée),
    /// wipe des verrous + master PIN pour qu'aucun état de A ne s'applique à B.
    private func wireAuthLogoutHook() {
        AuthManager.shared.$isAuthenticated
            .removeDuplicates()
            .dropFirst()
            .filter { !$0 }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.resetForLogout() }
            .store(in: &cancellables)
    }

    // MARK: - Master PIN (6 digits)

    func hasMasterPin() -> Bool {
        vault.read(masterPinKey) != nil
    }

    func setMasterPin(_ pin: String) {
        store(pin, under: masterPinKey)
        noteMasterPin(true)
    }

    func attemptMasterPin(_ pin: String) -> PinAttemptOutcome {
        attempt(pin, against: masterPinKey)
    }

    func verifyMasterPin(_ pin: String) -> Bool {
        attemptMasterPin(pin) == .granted
    }

    /// Supprime le master PIN. Ne pas appeler si des conversations sont verrouillées.
    func removeMasterPin() {
        guard lockedConversationIds.isEmpty else { return }
        forceRemoveMasterPin()
    }

    /// Force la suppression du master PIN (pour tests / unlock all). La
    /// biométrie, autorisée par lui, part avec lui.
    func forceRemoveMasterPin() {
        erase(masterPinKey)
        noteMasterPin(false)
        disableBiometricUnlock()
    }

    /// P7-11 — logout = purge cross-compte totale (invariant 9). Le keychain
    /// (`me.meeshy.app.conversation-locks`) survit au logout ET à la
    /// réinstallation, et n'est pas namespacé par compte : sans wipe, le
    /// master PIN et les verrous du compte A s'appliquent au compte B.
    /// Après logout les conversations elles-mêmes sont purgées (7 tables +
    /// prefs + URLCache) — leurs PINs n'ont plus d'objet.
    func resetForLogout() {
        removeAllLocks()
        forceRemoveMasterPin()
    }

    // MARK: - Per-conversation PIN (4 digits)

    func isLocked(_ conversationId: String) -> Bool {
        lockedConversationIds.contains(conversationId)
    }

    /// **LA décision « contenu masqué »** (#11387 : le verrou PIN protège le
    /// CONTENU, pas seulement l'ouverture). Sans PIN, une conversation verrouillée ne montre ni son
    /// dernier message, ni la frappe, ni le brouillon, ni vignette, ni aperçu
    /// d'appui long, et rien ne la précharge. La rangée, le chargeur d'aperçu,
    /// le widget et le cliché de l'extension de notification la consultent ;
    /// aucun ne réécrit la règle.
    ///
    /// Un PIN donné n'ouvre qu'UNE fois (`admitsOpening`) : revenu à la liste,
    /// le contenu est de nouveau masqué.
    nonisolated static func hidesContent(of conversationId: String, lockedConversationIds: Set<String>) -> Bool {
        lockedConversationIds.contains(conversationId)
    }

    func hidesContent(of conversationId: String) -> Bool {
        Self.hidesContent(of: conversationId, lockedConversationIds: lockedConversationIds)
    }

    func setLock(conversationId: String, pin: String) {
        store(pin, under: lockKey(conversationId))
        openingPasses[conversationId] = nil
        lockedConversationIds.insert(conversationId)
        saveLockedIds()
        purgeDeliveredBanners(conversationId)
    }

    /// Un essai sur le code d'une conversation. Accordé, il vaut UNE ouverture
    /// (`admitsOpening`), dans la minute.
    func attemptLock(conversationId: String, pin: String) -> PinAttemptOutcome {
        let outcome = attempt(pin, against: lockKey(conversationId))
        if outcome == .granted { openingPasses[conversationId] = now() }
        return outcome
    }

    func verifyLock(conversationId: String, pin: String) -> Bool {
        attemptLock(conversationId: conversationId, pin: pin) == .granted
    }

    func removeLock(conversationId: String) {
        erase(lockKey(conversationId))
        openingPasses[conversationId] = nil
        lockedConversationIds.remove(conversationId)
        saveLockedIds()
    }

    func removeAllLocks() {
        lockedConversationIds.forEach { erase(lockKey($0)) }
        openingPasses.removeAll()
        lockedConversationIds.removeAll()
        saveLockedIds()
    }

    // MARK: - La porte (#11386)

    func admitsOpening(_ conversationId: String) -> Bool {
        guard isLocked(conversationId) else { return true }
        guard let grantedAt = openingPasses.removeValue(forKey: conversationId) else { return false }
        let age = now().timeIntervalSince(grantedAt)
        return age >= 0 && age < Self.openingPassLifetime
    }

    // MARK: - Biométrie (#11388)

    /// Le capteur de l'appareil, s'il est utilisable. `nil` : aucun, ou aucun
    /// visage / doigt enrôlé.
    var biometricKind: BiometricKind? {
        biometrics.availableKind()
    }

    var offersBiometricUnlock: Bool {
        biometricUnlockEnabled && biometrics.availableKind() != nil
    }

    /// L'activer exige le master PIN : un téléphone laissé déverrouillé ne
    /// suffit pas à remplacer les codes par un visage. L'état d'enrôlement est
    /// noté au même instant.
    func enableBiometricUnlock(authorizedBy masterPin: String) -> PinAttemptOutcome {
        let outcome = attemptMasterPin(masterPin)
        guard outcome == .granted, let enrollment = biometrics.enrollmentState() else { return outcome }
        noteBiometricUnlock(vault.write(enrollment.base64EncodedString(), for: biometricStateKey))
        return outcome
    }

    func disableBiometricUnlock() {
        vault.delete(biometricStateKey)
        noteBiometricUnlock(false)
    }

    /// Un visage ou un doigt ajouté depuis l'activation (il suffit de connaître
    /// le code de l'appareil) désactive la biométrie au lieu d'ouvrir : le PIN
    /// redevient la seule porte jusqu'à une nouvelle activation.
    func unlockWithBiometrics(conversationId: String, reason: String) async -> Bool {
        guard isLocked(conversationId), let enrolled = vault.read(biometricStateKey) else { return false }
        guard biometrics.enrollmentState()?.base64EncodedString() == enrolled else {
            disableBiometricUnlock()
            return false
        }
        guard await biometrics.authenticate(reason: reason) else { return false }
        openingPasses[conversationId] = now()
        return true
    }

    // MARK: - Private helpers

    private func lockKey(_ conversationId: String) -> String {
        "meeshy_lock_\(conversationId)"
    }

    private func throttleKey(_ key: String) -> String {
        "\(key).attempts"
    }

    private func attempt(_ pin: String, against key: String) -> PinAttemptOutcome {
        guard let stored = vault.read(key), let credential = ConversationPinCredential.decode(stored) else {
            return .rejected(retryIn: 0)
        }
        let moment = now()
        let recorded = throttle(for: key)
        let current = recorded.anchored(at: moment)
        if current != recorded { saveThrottle(current, for: key) }
        let wait = current.retryDelay(at: moment)
        guard wait <= 0 else { return .throttled(retryIn: wait) }
        guard credential.matches(pin) else {
            let failed = current.recordingFailure(at: moment)
            saveThrottle(failed, for: key)
            return .rejected(retryIn: failed.retryDelay(at: moment))
        }
        vault.delete(throttleKey(key))
        if credential.needsUpgrade(toIterations: iterations) { store(pin, under: key) }
        return .granted
    }

    @discardableResult
    private func store(_ pin: String, under key: String) -> Bool {
        guard let credential = ConversationPinCredential.derive(pin: pin, iterations: iterations),
              vault.write(credential.encoded, for: key) else { return false }
        vault.delete(throttleKey(key))
        return true
    }

    private func erase(_ key: String) {
        vault.delete(key)
        vault.delete(throttleKey(key))
    }

    private func throttle(for key: String) -> ConversationPinThrottle {
        guard let raw = vault.read(throttleKey(key)),
              let recorded = try? JSONDecoder().decode(ConversationPinThrottle.self, from: Data(raw.utf8)) else {
            return ConversationPinThrottle()
        }
        return recorded
    }

    private func saveThrottle(_ throttle: ConversationPinThrottle, for key: String) {
        guard let data = try? JSONEncoder().encode(throttle) else { return }
        vault.write(String(decoding: data, as: UTF8.self), for: throttleKey(key))
    }

    // MARK: - Persistence

    private func saveLockedIds() {
        defaults.set(Array(lockedConversationIds), forKey: lockedIdsDefaultsKey)
        mirrorLockedIds()
        NotificationCenter.default.post(name: .conversationContentLocksDidChange, object: nil)
    }

    /// Le miroir se réécrit aussi au lancement : un verrou posé avant que le
    /// miroir existe (mise à jour de l'app) rejoint l'extension sans attendre
    /// le prochain changement.
    private func loadLockedIds() {
        let ids = defaults.stringArray(forKey: lockedIdsDefaultsKey) ?? []
        lockedConversationIds = Set(ids)
        mirrorLockedIds()
    }

    private func mirrorLockedIds() {
        NSELockedConversationMirror.mirror(
            lockedConversationIds, toFile: contentLockMirrorFile, defaults: contentLockMirror
        )
    }
}
