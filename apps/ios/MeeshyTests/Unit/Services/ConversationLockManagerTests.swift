import XCTest
import UIKit
@testable import Meeshy

@MainActor
final class ConversationLockManagerTests: XCTestCase {

    private var manager: ConversationLockManager!

    override func setUp() async throws {
        manager = ConversationLockManager.shared
        manager.removeAllLocks()
        if manager.hasMasterPin() { manager.forceRemoveMasterPin() }
    }

    override func tearDown() async throws {
        manager.removeAllLocks()
        if manager.hasMasterPin() { manager.forceRemoveMasterPin() }
        manager = nil
    }

    // MARK: - Master PIN

    func test_hasMasterPin_whenNoneSet_returnsFalse() {
        XCTAssertFalse(manager.hasMasterPin())
    }

    func test_setMasterPin_thenHasMasterPin_returnsTrue() {
        manager.setMasterPin("123456")
        XCTAssertTrue(manager.hasMasterPin())
    }

    func test_verifyMasterPin_withCorrectPin_returnsTrue() {
        manager.setMasterPin("123456")
        XCTAssertTrue(manager.verifyMasterPin("123456"))
    }

    func test_verifyMasterPin_withWrongPin_returnsFalse() {
        manager.setMasterPin("123456")
        XCTAssertFalse(manager.verifyMasterPin("654321"))
    }

    func test_forceRemoveMasterPin_removesPin() {
        manager.setMasterPin("123456")
        manager.forceRemoveMasterPin()
        XCTAssertFalse(manager.hasMasterPin())
    }

    // MARK: - Per-conversation lock

    func test_isLocked_whenNotLocked_returnsFalse() {
        XCTAssertFalse(manager.isLocked("conv-1"))
    }

    func test_setLock_thenIsLocked_returnsTrue() {
        manager.setMasterPin("123456")
        manager.setLock(conversationId: "conv-1", pin: "1234")
        XCTAssertTrue(manager.isLocked("conv-1"))
    }

    func test_verifyLock_withCorrectPin_returnsTrue() {
        manager.setMasterPin("123456")
        manager.setLock(conversationId: "conv-1", pin: "1234")
        XCTAssertTrue(manager.verifyLock(conversationId: "conv-1", pin: "1234"))
    }

    func test_verifyLock_withWrongPin_returnsFalse() {
        manager.setMasterPin("123456")
        manager.setLock(conversationId: "conv-1", pin: "1234")
        XCTAssertFalse(manager.verifyLock(conversationId: "conv-1", pin: "9999"))
    }

    func test_removeLock_removesConversationLock() {
        manager.setMasterPin("123456")
        manager.setLock(conversationId: "conv-1", pin: "1234")
        manager.removeLock(conversationId: "conv-1")
        XCTAssertFalse(manager.isLocked("conv-1"))
    }

    func test_removeAllLocks_removesAllConversations_keepsMasterPin() {
        manager.setMasterPin("123456")
        manager.setLock(conversationId: "conv-1", pin: "1111")
        manager.setLock(conversationId: "conv-2", pin: "2222")
        manager.removeAllLocks()
        XCTAssertFalse(manager.isLocked("conv-1"))
        XCTAssertFalse(manager.isLocked("conv-2"))
        XCTAssertTrue(manager.hasMasterPin())
    }

    func test_lockedConversationIds_reflectsCurrentLocks() {
        manager.setMasterPin("123456")
        manager.setLock(conversationId: "conv-1", pin: "1111")
        manager.setLock(conversationId: "conv-2", pin: "2222")
        XCTAssertEqual(manager.lockedConversationIds, ["conv-1", "conv-2"])
    }

    func test_eachConversationHasIndependentPin() {
        manager.setMasterPin("123456")
        manager.setLock(conversationId: "conv-1", pin: "1111")
        manager.setLock(conversationId: "conv-2", pin: "2222")
        XCTAssertTrue(manager.verifyLock(conversationId: "conv-1", pin: "1111"))
        XCTAssertFalse(manager.verifyLock(conversationId: "conv-1", pin: "2222"))
        XCTAssertTrue(manager.verifyLock(conversationId: "conv-2", pin: "2222"))
        XCTAssertFalse(manager.verifyLock(conversationId: "conv-2", pin: "1111"))
    }

    func test_removeMasterPin_whenConversationsLocked_doesNotRemovePin() {
        manager.setMasterPin("123456")
        manager.setLock(conversationId: "conv-1", pin: "1111")
        manager.removeMasterPin()
        XCTAssertTrue(manager.hasMasterPin())
    }

    // MARK: - P7-11 : logout = purge totale (invariant 9)

    /// Le keychain (`me.meeshy.app.conversation-locks`) survit au logout, à la
    /// réinstallation ET n'est pas namespacé par compte : sans wipe, le master
    /// PIN et les verrous du compte A s'appliquent au compte B (fuite
    /// cross-compte, miroir du bug URLCache T15b-b). Après logout, les
    /// conversations elles-mêmes sont purgées — leurs PINs n'ont plus d'objet.
    func test_resetForLogout_wipesMasterPin_andAllLocks() {
        manager.setMasterPin("123456")
        manager.setLock(conversationId: "conv-logout", pin: "1234")

        manager.resetForLogout()

        XCTAssertFalse(manager.hasMasterPin(),
            "master PIN must not survive logout (cross-account leak)")
        XCTAssertFalse(manager.isLocked("conv-logout"),
            "per-conversation locks must not survive logout")
        XCTAssertFalse(manager.verifyLock(conversationId: "conv-logout", pin: "1234"),
            "the lock's keychain entry must be wiped, not just the in-memory set")
        XCTAssertTrue(manager.lockedConversationIds.isEmpty)
    }

    // MARK: - #11558 : le PIN maître se lit au premier besoin

    /// Le gestionnaire est construit pendant le rendu des premières lignes de la
    /// liste (actions de balayage) : sa lecture du trousseau y était un XPC
    /// synchrone du fil principal, pour une valeur qui ne sert qu'au geste.
    func test_init_doesNotReadTheKeychain() {
        let secrets = CountingLockSecrets(["meeshy_master_pin": "hash"])

        _ = ConversationLockManager(secrets: secrets.store)

        XCTAssertEqual(secrets.reads, 0)
    }

    func test_masterPinConfigured_isReadOnce_atFirstNeed() {
        let secrets = CountingLockSecrets(["meeshy_master_pin": "hash"])
        let sut = ConversationLockManager(secrets: secrets.store)

        XCTAssertTrue(sut.masterPinConfigured)
        XCTAssertTrue(sut.masterPinConfigured)

        XCTAssertEqual(secrets.reads, 1)
    }

    func test_masterPinConfigured_noPin_isFalse() {
        let sut = ConversationLockManager(secrets: CountingLockSecrets([:]).store)

        XCTAssertFalse(sut.masterPinConfigured)
    }

    func test_setMasterPin_beforeAnyRead_isConfigured_withoutReading() {
        let secrets = CountingLockSecrets([:])
        let sut = ConversationLockManager(secrets: secrets.store)

        sut.setMasterPin("123456")

        XCTAssertTrue(sut.masterPinConfigured)
        XCTAssertEqual(secrets.reads, 0)
    }

    func test_forceRemoveMasterPin_afterARead_isNotConfigured() {
        let secrets = CountingLockSecrets(["meeshy_master_pin": "hash"])
        let sut = ConversationLockManager(secrets: secrets.store)
        _ = sut.masterPinConfigured

        sut.forceRemoveMasterPin()

        XCTAssertFalse(sut.masterPinConfigured)
    }

    // MARK: - #12655 : un processus lancé avant le premier déverrouillage

    private let lockedIdsKey = "meeshy.lockedConversationIds"

    @MainActor
    private final class ProtectedData {
        nonisolated deinit {}
        var available: Bool
        init(available: Bool) { self.available = available }
    }

    private struct LaunchFixture {
        let standard: UserDefaults
        let mirror: UserDefaults
        let mirrorFile: URL
        let center: NotificationCenter
    }

    private func makeLaunchFixture() throws -> LaunchFixture {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let standardSuite = "pin-standard-\(UUID().uuidString)"
        let mirrorSuite = "pin-mirror-\(UUID().uuidString)"
        let fixture = LaunchFixture(
            standard: try XCTUnwrap(UserDefaults(suiteName: standardSuite)),
            mirror: try XCTUnwrap(UserDefaults(suiteName: mirrorSuite)),
            mirrorFile: try XCTUnwrap(NSELockedConversationMirror.fileURL(inContainer: directory)),
            center: NotificationCenter()
        )
        addTeardownBlock {
            try? FileManager.default.removeItem(at: directory)
            UserDefaults().removePersistentDomain(forName: standardSuite)
            UserDefaults().removePersistentDomain(forName: mirrorSuite)
        }
        return fixture
    }

    private func makeLaunchedManager(_ fixture: LaunchFixture, protectedData: ProtectedData) -> ConversationLockManager {
        ConversationLockManager(
            vault: InMemoryConversationLockVault(),
            defaults: fixture.standard,
            biometrics: StubBiometricUnlocker(),
            iterations: 1_000,
            contentLockMirror: fixture.mirror,
            contentLockMirrorFile: fixture.mirrorFile,
            isProtectedDataAvailable: { protectedData.available },
            notificationCenter: fixture.center
        )
    }

    /// Avant le premier déverrouillage, `.standard` se lit VIDE (PushKit, VoIP
    /// réveillent l'app en arrière-plan). Le gestionnaire ne réécrit alors ni
    /// la liste ni le miroir : écrire `[]` aurait effacé les verrous pour
    /// l'extension, désormais autoritaire sur une liste vide.
    func test_aLaunchWithoutProtectedData_writesNeitherTheListNorTheMirror() throws {
        let fixture = try makeLaunchFixture()
        NSELockedConversationMirror.mirror(["coffre"], toFile: fixture.mirrorFile, defaults: fixture.mirror)

        _ = makeLaunchedManager(fixture, protectedData: ProtectedData(available: false))

        XCTAssertNil(fixture.standard.stringArray(forKey: lockedIdsKey), "aucune liste lue, aucune liste écrite")
        XCTAssertEqual(fixture.mirror.stringArray(forKey: NSELockedConversationMirror.legacyDefaultsKey), ["coffre"])
        XCTAssertEqual(NSELockedConversationMirror.readFile(at: fixture.mirrorFile), .ids(["coffre"]))
    }

    /// La porte PIN ne s'ouvre pas sur une liste vide lue par erreur : en
    /// mémoire, le gestionnaire reprend le miroir de fichier quand il se lit.
    func test_aLaunchWithoutProtectedData_keepsTheMirroredLocksInMemory() throws {
        let fixture = try makeLaunchFixture()
        NSELockedConversationMirror.mirror(["coffre"], toFile: fixture.mirrorFile, defaults: nil)

        let sut = makeLaunchedManager(fixture, protectedData: ProtectedData(available: false))

        XCTAssertTrue(sut.isLocked("coffre"))
        XCTAssertFalse(sut.admitsOpening("coffre"))
    }

    /// Un geste fait avant que la liste soit lue ne persiste pas une liste
    /// partielle : les verrous qu'elle ignore survivraient sinon effacés.
    func test_aChangeBeforeTheListIsRead_doesNotOverwriteThePersistedLocks() throws {
        let fixture = try makeLaunchFixture()
        fixture.standard.set(["coffre", "autre"], forKey: lockedIdsKey)
        let sut = makeLaunchedManager(fixture, protectedData: ProtectedData(available: false))

        sut.removeLock(conversationId: "autre")

        XCTAssertEqual(Set(fixture.standard.stringArray(forKey: lockedIdsKey) ?? []), ["coffre", "autre"])
        XCTAssertNil(fixture.mirror.stringArray(forKey: NSELockedConversationMirror.legacyDefaultsKey))
    }

    /// Les données protégées deviennent disponibles : la liste se relit et le
    /// miroir se réécrit.
    func test_theListIsRead_whenProtectedDataBecomesAvailable() throws {
        let fixture = try makeLaunchFixture()
        fixture.standard.set(["coffre"], forKey: lockedIdsKey)
        let protectedData = ProtectedData(available: false)
        let sut = makeLaunchedManager(fixture, protectedData: protectedData)
        XCTAssertFalse(sut.isLocked("coffre"))

        let reloaded = expectation(description: "la liste se relit")
        let subscription = sut.$lockedConversationIds.first { $0.contains("coffre") }.sink { _ in reloaded.fulfill() }
        protectedData.available = true
        fixture.center.post(name: UIApplication.protectedDataDidBecomeAvailableNotification, object: nil)
        wait(for: [reloaded], timeout: 2)
        subscription.cancel()

        XCTAssertTrue(sut.isLocked("coffre"))
        XCTAssertEqual(NSELockedConversationMirror.readFile(at: fixture.mirrorFile), .ids(["coffre"]))
        XCTAssertEqual(fixture.mirror.stringArray(forKey: NSELockedConversationMirror.legacyDefaultsKey), ["coffre"])
    }

    /// La déconnexion lève tous les verrous : c'est une intention, pas une
    /// lecture, et elle s'écrit même avant que la liste ait été lue.
    func test_logout_beforeTheListIsRead_stillWipesTheLocks() throws {
        let fixture = try makeLaunchFixture()
        fixture.standard.set(["coffre"], forKey: lockedIdsKey)
        let sut = makeLaunchedManager(fixture, protectedData: ProtectedData(available: false))

        sut.resetForLogout()

        XCTAssertEqual(fixture.standard.stringArray(forKey: lockedIdsKey), [])
        XCTAssertEqual(NSELockedConversationMirror.readFile(at: fixture.mirrorFile), .ids([]))
    }

    /// Une fois écrite, la liste l'est toujours, vide comprise : une clé
    /// ABSENTE ne dit plus « aucun verrou », elle dit « illisible »
    /// (`CFPreferences` sert encore le domaine vide d'avant le premier
    /// déverrouillage). Le miroir de fichier fait alors foi, et ne se réécrit pas.
    func test_aListThatReadsAbsent_withProtectedData_keepsTheMirroredLocks() throws {
        let fixture = try makeLaunchFixture()
        NSELockedConversationMirror.mirror(["coffre"], toFile: fixture.mirrorFile, defaults: fixture.mirror)

        let sut = makeLaunchedManager(fixture, protectedData: ProtectedData(available: true))

        XCTAssertTrue(sut.isLocked("coffre"))
        XCTAssertEqual(NSELockedConversationMirror.readFile(at: fixture.mirrorFile), .ids(["coffre"]))
    }

    func test_aLaunchWithProtectedData_readsTheListAndMirrorsIt() throws {
        let fixture = try makeLaunchFixture()
        fixture.standard.set(["coffre"], forKey: lockedIdsKey)

        let sut = makeLaunchedManager(fixture, protectedData: ProtectedData(available: true))

        XCTAssertTrue(sut.isLocked("coffre"))
        XCTAssertEqual(NSELockedConversationMirror.readFile(at: fixture.mirrorFile), .ids(["coffre"]))
    }
}

@MainActor
private final class CountingLockSecrets {
    private var entries: [String: String]
    private(set) var reads = 0

    init(_ entries: [String: String]) { self.entries = entries }

    var store: ConversationLockSecrets {
        ConversationLockSecrets(
            read: { [self] key in
                reads += 1
                return entries[key]
            },
            save: { [self] key, value in
                entries[key] = value
                return true
            },
            delete: { [self] key in entries[key] = nil }
        )
    }
}
