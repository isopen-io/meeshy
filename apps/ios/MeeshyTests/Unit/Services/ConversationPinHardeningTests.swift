import XCTest
import CryptoKit
@testable import Meeshy

/// **Le PIN d'une conversation résiste à la force brute** (#11388, audit
/// adversarial de #11385, constat 7).
///
/// Il était haché en SHA-256 sans sel, sans limite d'essais ni temporisation :
/// 10 000 essais suffisaient, et deux appareils portant le même PIN portaient
/// la même empreinte. Désormais : dérivation lente PBKDF2-HMAC-SHA256 sous un
/// sel aléatoire propre à chaque code, temporisation croissante après quatre
/// échecs (persistée, donc survivant à une relance), et déverrouillage
/// biométrique sur option. Un PIN posé par une version antérieure reste
/// vérifiable, puis est re-dérivé au premier succès.
@MainActor
final class ConversationPinHardeningTests: XCTestCase {

    private let conversationId = "0000000000000000000000d1"
    private let lockKey = "meeshy_lock_0000000000000000000000d1"
    private let start = Date(timeIntervalSince1970: 1_800_000_000)

    private func makeSUT(
        vault: InMemoryConversationLockVault = InMemoryConversationLockVault(),
        biometrics: StubBiometricUnlocker = StubBiometricUnlocker(),
        clock: PinLockClock? = nil
    ) -> (sut: ConversationLockManager, vault: InMemoryConversationLockVault, clock: PinLockClock) {
        let clock = clock ?? PinLockClock(now: start)
        let sut = ConversationLockManager(
            vault: vault,
            defaults: UserDefaults(suiteName: "pin-hardening-\(UUID().uuidString)")!,
            biometrics: biometrics,
            iterations: 1_000,
            now: { clock.now }
        )
        return (sut, vault, clock)
    }

    /// Le SHA-256 nu qu'écrivaient les versions antérieures — recalculé ici
    /// sans passer par le code testé, pour qu'un témoin de migration ne se
    /// valide pas lui-même.
    private func legacySHA256Hex(_ pin: String) -> String {
        SHA256.hash(data: Data(pin.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    // MARK: - La dérivation

    /// RFC 7914 § 11 — PBKDF2-HMAC-SHA256, P = "passwd", S = "salt", c = 1.
    func test_pbkdf2_matchesTheReferenceVector() throws {
        let digest = try XCTUnwrap(ConversationPinCredential.pbkdf2(pin: "passwd", salt: Data("salt".utf8), iterations: 1))

        XCTAssertEqual(ConversationPinCredential.hex(digest), "55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc")
    }

    func test_derive_samePinTwice_neverStoresTheSameValue() throws {
        let first = try XCTUnwrap(ConversationPinCredential.derive(pin: "1234", iterations: 1_000))
        let second = try XCTUnwrap(ConversationPinCredential.derive(pin: "1234", iterations: 1_000))

        XCTAssertNotEqual(first.encoded, second.encoded, "sans sel propre, deux appareils au même PIN portent la même empreinte")
        XCTAssertTrue(first.matches("1234"))
        XCTAssertTrue(second.matches("1234"))
    }

    func test_derive_storedValue_carriesNeitherThePinNorItsBareHash() throws {
        let credential = try XCTUnwrap(ConversationPinCredential.derive(pin: "1234", iterations: 1_000))

        XCTAssertTrue(credential.encoded.hasPrefix("pbkdf2-sha256$1000$"))
        XCTAssertFalse(credential.encoded.contains("1234"))
        XCTAssertFalse(credential.encoded.contains(legacySHA256Hex("1234")))
    }

    func test_decode_roundTrip_keepsTheCredential() throws {
        let credential = try XCTUnwrap(ConversationPinCredential.derive(pin: "987654", iterations: 1_000))

        let decoded = try XCTUnwrap(ConversationPinCredential.decode(credential.encoded))

        XCTAssertEqual(decoded, credential)
        XCTAssertTrue(decoded.matches("987654"))
        XCTAssertFalse(decoded.matches("987655"))
    }

    func test_decode_legacyHash_verifiesAndAsksToBeUpgraded() throws {
        let legacy = try XCTUnwrap(ConversationPinCredential.decode(legacySHA256Hex("4321")))

        XCTAssertTrue(legacy.matches("4321"))
        XCTAssertFalse(legacy.matches("4322"))
        XCTAssertTrue(legacy.needsUpgrade(toIterations: 1_000))
    }

    func test_decode_unreadableValue_isNoCredential() {
        XCTAssertNil(ConversationPinCredential.decode(""))
        XCTAssertNil(ConversationPinCredential.decode("pbkdf2-sha256$0$c2FsdA==$AAAA"))
        XCTAssertNil(ConversationPinCredential.decode("pbkdf2-sha256$99999999999$c2FsdA==$AAAA"))
        XCTAssertNil(ConversationPinCredential.decode(String(repeating: "z", count: 64)))
    }

    // MARK: - La temporisation

    func test_delay_firstFourFailures_costNothing() {
        XCTAssertEqual((0...4).map(ConversationPinThrottle.delay(afterFailures:)), [0, 0, 0, 0, 0])
    }

    func test_delay_fromTheFifthFailure_doublesUpToOneHour() {
        XCTAssertEqual((5...13).map(ConversationPinThrottle.delay(afterFailures:)), [30, 60, 120, 240, 480, 960, 1920, 3600, 3600])
    }

    func test_retryDelay_shrinksWithTime() {
        let throttle = ConversationPinThrottle(failures: 5, lastFailureAt: start)

        XCTAssertEqual(throttle.retryDelay(at: start.addingTimeInterval(10)), 20)
        XCTAssertEqual(throttle.retryDelay(at: start.addingTimeInterval(31)), 0)
    }

    /// Reculer l'horloge de l'appareil ne raccourcit pas l'attente.
    func test_retryDelay_clockMovedBackwards_waitsTheFullDelay() {
        let throttle = ConversationPinThrottle(failures: 6, lastFailureAt: start)

        XCTAssertEqual(throttle.retryDelay(at: start.addingTimeInterval(-3_600)), 60)
        XCTAssertEqual(throttle.anchored(at: start.addingTimeInterval(-3_600)).lastFailureAt, start.addingTimeInterval(-3_600))
    }

    // MARK: - Le gestionnaire

    func test_setLock_storesASaltedSlowDerivation_neverTheBareHash() throws {
        let (sut, vault, _) = makeSUT()

        sut.setLock(conversationId: conversationId, pin: "1234")

        let stored = try XCTUnwrap(vault.read(lockKey))
        XCTAssertTrue(stored.hasPrefix("pbkdf2-sha256$"))
        XCTAssertNotEqual(stored, legacySHA256Hex("1234"))
        XCTAssertEqual(sut.attemptLock(conversationId: conversationId, pin: "1234"), .granted)
    }

    /// Un PIN posé par une version antérieure reste vérifiable, puis est
    /// re-dérivé au premier succès — jamais avant, puisque le clair n'est connu
    /// qu'à la saisie.
    func test_attemptLock_legacyHash_isAcceptedThenReDerived() throws {
        let vault = InMemoryConversationLockVault(items: [lockKey: legacySHA256Hex("2468")])
        let defaults = UserDefaults(suiteName: "pin-legacy-\(UUID().uuidString)")!
        defaults.set([conversationId], forKey: "meeshy.lockedConversationIds")
        let start = self.start
        let sut = ConversationLockManager(vault: vault, defaults: defaults, biometrics: StubBiometricUnlocker(), iterations: 1_000, now: { start })

        XCTAssertTrue(sut.isLocked(conversationId))
        XCTAssertEqual(sut.attemptLock(conversationId: conversationId, pin: "1357"), .rejected(retryIn: 0))
        XCTAssertEqual(vault.read(lockKey), legacySHA256Hex("2468"), "un échec ne doit rien réécrire")

        XCTAssertEqual(sut.attemptLock(conversationId: conversationId, pin: "2468"), .granted)

        let upgraded = try XCTUnwrap(vault.read(lockKey))
        XCTAssertTrue(upgraded.hasPrefix("pbkdf2-sha256$1000$"))
        XCTAssertEqual(sut.attemptLock(conversationId: conversationId, pin: "2468"), .granted)
    }

    func test_attemptLock_fifthWrongPin_throttlesEvenTheRightOne() {
        let (sut, _, _) = makeSUT()
        sut.setLock(conversationId: conversationId, pin: "1234")

        let outcomes = (0..<5).map { _ in sut.attemptLock(conversationId: conversationId, pin: "0000") }

        XCTAssertEqual(outcomes, [.rejected(retryIn: 0), .rejected(retryIn: 0), .rejected(retryIn: 0), .rejected(retryIn: 0), .rejected(retryIn: 30)])
        XCTAssertEqual(sut.attemptLock(conversationId: conversationId, pin: "1234"), .throttled(retryIn: 30))
        XCTAssertFalse(sut.admitsOpening(conversationId), "un PIN refusé pour temporisation n'ouvre rien")
    }

    func test_attemptLock_afterTheDelay_rightPinGrantsAndResetsTheCounter() {
        let (sut, _, clock) = makeSUT()
        sut.setLock(conversationId: conversationId, pin: "1234")
        (0..<5).forEach { _ in _ = sut.attemptLock(conversationId: conversationId, pin: "0000") }

        clock.now = start.addingTimeInterval(31)

        XCTAssertEqual(sut.attemptLock(conversationId: conversationId, pin: "1234"), .granted)
        XCTAssertEqual(sut.attemptLock(conversationId: conversationId, pin: "0000"), .rejected(retryIn: 0))
    }

    /// La temporisation vit avec le code, pas dans la mémoire du processus :
    /// tuer l'app ne la remet pas à zéro.
    func test_throttle_survivesARelaunch() {
        let (first, vault, clock) = makeSUT()
        first.setLock(conversationId: conversationId, pin: "1234")
        (0..<5).forEach { _ in _ = first.attemptLock(conversationId: conversationId, pin: "0000") }
        let defaults = UserDefaults(suiteName: "pin-relaunch-\(UUID().uuidString)")!
        defaults.set([conversationId], forKey: "meeshy.lockedConversationIds")

        let relaunched = ConversationLockManager(vault: vault, defaults: defaults, biometrics: StubBiometricUnlocker(), iterations: 1_000, now: { clock.now })

        XCTAssertEqual(relaunched.attemptLock(conversationId: conversationId, pin: "1234"), .throttled(retryIn: 30))
    }

    func test_attemptMasterPin_isThrottledToo() {
        let (sut, _, _) = makeSUT()
        sut.setMasterPin("123456")

        (0..<5).forEach { _ in _ = sut.attemptMasterPin("000000") }

        XCTAssertEqual(sut.attemptMasterPin("123456"), .throttled(retryIn: 30))
        XCTAssertFalse(sut.verifyMasterPin("123456"))
    }

    func test_setLock_newPin_resetsTheCounter() {
        let (sut, _, _) = makeSUT()
        sut.setLock(conversationId: conversationId, pin: "1234")
        (0..<5).forEach { _ in _ = sut.attemptLock(conversationId: conversationId, pin: "0000") }

        sut.removeLock(conversationId: conversationId)
        sut.setLock(conversationId: conversationId, pin: "5678")

        XCTAssertEqual(sut.attemptLock(conversationId: conversationId, pin: "5678"), .granted)
    }

    // MARK: - Le laissez-passer du routeur

    func test_admitsOpening_rightPinGrantsOneOpeningOnly() {
        let (sut, _, _) = makeSUT()
        sut.setLock(conversationId: conversationId, pin: "1234")
        XCTAssertFalse(sut.admitsOpening(conversationId))

        XCTAssertTrue(sut.verifyLock(conversationId: conversationId, pin: "1234"))

        XCTAssertTrue(sut.admitsOpening(conversationId))
        XCTAssertFalse(sut.admitsOpening(conversationId))
    }

    func test_admitsOpening_unusedPassExpires() {
        let (sut, _, clock) = makeSUT()
        sut.setLock(conversationId: conversationId, pin: "1234")
        _ = sut.attemptLock(conversationId: conversationId, pin: "1234")

        clock.now = start.addingTimeInterval(ConversationLockManager.openingPassLifetime + 1)

        XCTAssertFalse(sut.admitsOpening(conversationId))
    }

    func test_admitsOpening_conversationWithoutLock_alwaysOpens() {
        let (sut, _, _) = makeSUT()

        XCTAssertTrue(sut.admitsOpening(conversationId))
    }

    // MARK: - La biométrie

    func test_unlockWithBiometrics_offByDefault_neverPrompts() async {
        let biometrics = StubBiometricUnlocker()
        let (sut, _, _) = makeSUT(biometrics: biometrics)
        sut.setLock(conversationId: conversationId, pin: "1234")

        let unlocked = await sut.unlockWithBiometrics(conversationId: conversationId, reason: "test")

        XCTAssertFalse(unlocked)
        XCTAssertEqual(biometrics.prompts, 0)
        XCTAssertFalse(sut.offersBiometricUnlock)
    }

    /// L'activer exige le master PIN : un téléphone laissé déverrouillé ne
    /// suffit pas à remplacer les codes par un visage.
    func test_enableBiometricUnlock_wrongMasterPin_staysOff() {
        let (sut, _, _) = makeSUT()
        sut.setMasterPin("123456")

        XCTAssertEqual(sut.enableBiometricUnlock(authorizedBy: "000000"), .rejected(retryIn: 0))
        XCTAssertFalse(sut.biometricUnlockEnabled)
    }

    func test_unlockWithBiometrics_enabled_grantsASingleOpening() async {
        let biometrics = StubBiometricUnlocker()
        let (sut, _, _) = makeSUT(biometrics: biometrics)
        sut.setMasterPin("123456")
        sut.setLock(conversationId: conversationId, pin: "1234")
        XCTAssertEqual(sut.enableBiometricUnlock(authorizedBy: "123456"), .granted)

        let unlocked = await sut.unlockWithBiometrics(conversationId: conversationId, reason: "test")

        XCTAssertTrue(unlocked)
        XCTAssertEqual(biometrics.prompts, 1)
        XCTAssertTrue(sut.admitsOpening(conversationId))
        XCTAssertFalse(sut.admitsOpening(conversationId))
    }

    func test_unlockWithBiometrics_faceRefused_opensNothing() async {
        let biometrics = StubBiometricUnlocker()
        biometrics.accepts = false
        let (sut, _, _) = makeSUT(biometrics: biometrics)
        sut.setMasterPin("123456")
        sut.setLock(conversationId: conversationId, pin: "1234")
        _ = sut.enableBiometricUnlock(authorizedBy: "123456")

        let unlocked = await sut.unlockWithBiometrics(conversationId: conversationId, reason: "test")

        XCTAssertFalse(unlocked)
        XCTAssertFalse(sut.admitsOpening(conversationId))
    }

    /// Un visage ou une empreinte ajouté APRÈS l'activation (il suffit de
    /// connaître le code de l'appareil) ne doit pas ouvrir les conversations :
    /// la biométrie se désactive et le PIN redevient la seule porte.
    func test_unlockWithBiometrics_enrollmentChanged_disablesItAndRefuses() async {
        let biometrics = StubBiometricUnlocker()
        let (sut, _, _) = makeSUT(biometrics: biometrics)
        sut.setMasterPin("123456")
        sut.setLock(conversationId: conversationId, pin: "1234")
        _ = sut.enableBiometricUnlock(authorizedBy: "123456")

        biometrics.enrollment = Data([9, 9, 9])
        let unlocked = await sut.unlockWithBiometrics(conversationId: conversationId, reason: "test")

        XCTAssertFalse(unlocked)
        XCTAssertEqual(biometrics.prompts, 0)
        XCTAssertFalse(sut.biometricUnlockEnabled)
    }

    func test_resetForLogout_wipesCodesCountersAndBiometrics() {
        let (sut, vault, _) = makeSUT()
        sut.setMasterPin("123456")
        sut.setLock(conversationId: conversationId, pin: "1234")
        _ = sut.enableBiometricUnlock(authorizedBy: "123456")
        _ = sut.attemptLock(conversationId: conversationId, pin: "0000")

        sut.resetForLogout()

        XCTAssertTrue(vault.items.isEmpty, "restes : \(vault.items.keys.sorted())")
        XCTAssertFalse(sut.biometricUnlockEnabled)
        XCTAssertFalse(sut.masterPinConfigured)
    }
}

// MARK: - Doublures

@MainActor
final class InMemoryConversationLockVault: ConversationLockVault {
    nonisolated deinit {}

    private(set) var items: [String: String]

    init(items: [String: String] = [:]) {
        self.items = items
    }

    func read(_ key: String) -> String? {
        items[key]
    }

    func write(_ value: String, for key: String) -> Bool {
        items[key] = value
        return true
    }

    func delete(_ key: String) {
        items[key] = nil
    }
}

@MainActor
final class StubBiometricUnlocker: BiometricUnlocking {
    nonisolated deinit {}

    var kind: BiometricKind? = .faceID
    var enrollment: Data? = Data([1, 2, 3])
    var accepts = true
    private(set) var prompts = 0

    func availableKind() -> BiometricKind? {
        kind
    }

    func enrollmentState() -> Data? {
        enrollment
    }

    func authenticate(reason: String) async -> Bool {
        prompts += 1
        return accepts
    }
}

private final class PinLockClock {
    var now: Date

    init(now: Date) {
        self.now = now
    }
}
