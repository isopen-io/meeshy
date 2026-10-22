import XCTest
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
