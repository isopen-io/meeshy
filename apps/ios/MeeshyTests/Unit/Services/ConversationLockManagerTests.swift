import XCTest
import Security
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

    private func makeLaunchedManager(
        _ fixture: LaunchFixture,
        protectedData: ProtectedData,
        vault: InMemoryConversationLockVault = InMemoryConversationLockVault()
    ) -> ConversationLockManager {
        ConversationLockManager(
            vault: vault,
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

    // MARK: - #12655 : tant que la liste n'est pas lue, toute conversation peut être sous PIN

    func test_beforeTheListIsRead_everyConversationMayBeLocked() throws {
        let fixture = try makeLaunchFixture()

        let sut = makeLaunchedManager(fixture, protectedData: ProtectedData(available: false))

        XCTAssertFalse(sut.isLocked("ouverte"), "la liste n'a rien dit")
        XCTAssertTrue(sut.mayBeLocked("ouverte"), "rien n'est lu : fail-closed")
    }

    /// Écran verrouillé après le premier déverrouillage : `.standard` peut se
    /// fermer, le miroir de fichier non. Il suffit à savoir.
    func test_onceTheMirrorIsRead_onlyItsConversationsMayBeLocked() throws {
        let fixture = try makeLaunchFixture()
        NSELockedConversationMirror.mirror(["coffre"], toFile: fixture.mirrorFile, defaults: nil)

        let sut = makeLaunchedManager(fixture, protectedData: ProtectedData(available: false))

        XCTAssertTrue(sut.mayBeLocked("coffre"))
        XCTAssertFalse(sut.mayBeLocked("ouverte"))
    }

    func test_onceTheListIsRead_onlyItsConversationsMayBeLocked() throws {
        let fixture = try makeLaunchFixture()
        fixture.standard.set(["coffre"], forKey: lockedIdsKey)

        let sut = makeLaunchedManager(fixture, protectedData: ProtectedData(available: true))

        XCTAssertTrue(sut.mayBeLocked("coffre"))
        XCTAssertFalse(sut.mayBeLocked("ouverte"))
    }

    /// Un miroir présent mais illisible ne dit rien : rien n'est chargé, et
    /// toute conversation reste possiblement sous PIN.
    func test_anUnreadableMirror_withAnAbsentList_knowsNothing() throws {
        let fixture = try makeLaunchFixture()
        try Data("abîmé".utf8).write(to: fixture.mirrorFile)

        let sut = makeLaunchedManager(fixture, protectedData: ProtectedData(available: true))

        XCTAssertTrue(sut.mayBeLocked("ouverte"))
        XCTAssertEqual(try Data(contentsOf: fixture.mirrorFile), Data("abîmé".utf8), "rien n'est réécrit")
    }

    // MARK: - #12655 : tant que la liste est inconnue, le code d'une conversation la verrouille

    /// La liste ne se lit pas (miroir abîmé, `.standard` absent) : la
    /// conversation dont le trousseau tient le code reste sous PIN — ni
    /// ouverture, ni contenu, ni geste de rangée ne la traitent en ouverte.
    func test_anUnreadableMirror_withAnAbsentList_butAPinForTheConversation_admitsNoOpening() throws {
        let fixture = try makeLaunchFixture()
        try Data("abîmé".utf8).write(to: fixture.mirrorFile)
        let vault = InMemoryConversationLockVault()
        vault.write("code", for: "meeshy_lock_coffre")

        let sut = makeLaunchedManager(fixture, protectedData: ProtectedData(available: true), vault: vault)

        XCTAssertFalse(sut.admitsOpening("coffre"))
        XCTAssertTrue(sut.isLocked("coffre"))
        XCTAssertTrue(sut.hidesContent(of: "coffre"))
        XCTAssertFalse(sut.isLocked("ouverte"), "sans code, rien ne la verrouille")
        XCTAssertTrue(sut.admitsOpening("ouverte"))
    }

    /// Avant le premier déverrouillage, sans miroir lisible : même règle.
    func test_beforeTheListIsRead_aConversationWithAPin_hidesItsContent_andAdmitsNoOpening() throws {
        let fixture = try makeLaunchFixture()
        let vault = InMemoryConversationLockVault()
        vault.write("code", for: "meeshy_lock_coffre")

        let sut = makeLaunchedManager(fixture, protectedData: ProtectedData(available: false), vault: vault)

        XCTAssertTrue(sut.hidesContent(of: "coffre"))
        XCTAssertFalse(sut.admitsOpening("coffre"))
    }

    /// Une fois la liste LUE, elle seule fait foi : un code orphelin (verrou
    /// retiré dont l'effacement a échoué) ne verrouille rien.
    func test_onceTheListIsRead_anOrphanPin_locksNothing() throws {
        let fixture = try makeLaunchFixture()
        fixture.standard.set([String](), forKey: lockedIdsKey)
        let vault = InMemoryConversationLockVault()
        vault.write("code", for: "meeshy_lock_orpheline")

        let sut = makeLaunchedManager(fixture, protectedData: ProtectedData(available: true), vault: vault)

        XCTAssertFalse(sut.isLocked("orpheline"))
        XCTAssertTrue(sut.admitsOpening("orpheline"))
    }

    /// Ce qui publie HORS de l'app (widget) ou met en cache (préchargement)
    /// lit un JEU de verrous : tant que la liste est inconnue, il porte aussi
    /// les conversations dont le trousseau tient le code.
    func test_beforeTheListIsRead_theContentLockSet_includesTheConversationsWithAPin() throws {
        let fixture = try makeLaunchFixture()
        let vault = InMemoryConversationLockVault()
        vault.write("code", for: "meeshy_lock_coffre")
        vault.write("{}", for: "meeshy_lock_coffre.attempts")

        let sut = makeLaunchedManager(fixture, protectedData: ProtectedData(available: false), vault: vault)

        XCTAssertEqual(sut.contentLockedConversationIds, ["coffre"])
    }

    func test_onceTheListIsRead_theContentLockSet_isTheList() throws {
        let fixture = try makeLaunchFixture()
        fixture.standard.set(["coffre"], forKey: lockedIdsKey)
        let vault = InMemoryConversationLockVault()
        vault.write("code", for: "meeshy_lock_orpheline")

        let sut = makeLaunchedManager(fixture, protectedData: ProtectedData(available: true), vault: vault)

        XCTAssertEqual(sut.contentLockedConversationIds, ["coffre"])
    }

    /// Le widget et le préchargement lisent ce jeu-là par défaut, pas la
    /// liste nue : garde de SOURCE, leur défaut de production est le singleton.
    func test_theWidgetAndThePrefetcher_readTheContentLockSet() throws {
        for path in [
            "Meeshy/Features/Main/Services/WidgetDataManager.swift",
            "Meeshy/Features/Main/ViewModels/ConversationListMessagePrefetcher.swift",
        ] {
            let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
            XCTAssertTrue(code.contains("ConversationLockManager.shared.contentLockedConversationIds"), path)
            XCTAssertFalse(code.contains("ConversationLockManager.shared.lockedConversationIds"), path)
        }
    }

    /// Première installation : ni liste, ni miroir, ni code au trousseau.
    /// « Aucun verrou » est alors un savoir, et l'extension l'apprend.
    func test_aFirstInstall_knowsThereIsNoLock_andTellsTheExtension() throws {
        let fixture = try makeLaunchFixture()

        let sut = makeLaunchedManager(fixture, protectedData: ProtectedData(available: true))

        XCTAssertFalse(sut.mayBeLocked("ouverte"))
        XCTAssertEqual(NSELockedConversationMirror.readFile(at: fixture.mirrorFile), .ids([]))
    }

    // MARK: - #12655 : une mise à jour qui lit la liste ABSENTE, sans miroir

    /// Première ouverture après une mise à jour depuis une version qui
    /// n'écrivait pas le fichier miroir, en arrière-plan : `.standard` se lit
    /// absent, le miroir aussi. Les codes du trousseau disent qu'il y a des
    /// verrous : « aucun verrou » serait un mensonge que l'extension croirait.
    func test_anUpgradeWhoseListReadsAbsent_withoutMirror_butWithPins_doesNotDeclareNoLock() throws {
        let fixture = try makeLaunchFixture()
        let vault = InMemoryConversationLockVault()
        vault.write("pin-maître", for: "meeshy_master_pin")
        vault.write("code", for: "meeshy_lock_coffre")

        let sut = makeLaunchedManager(fixture, protectedData: ProtectedData(available: true), vault: vault)

        XCTAssertTrue(sut.mayBeLocked("coffre"))
        XCTAssertFalse(sut.admitsOpening("coffre"), "aucune ouverture sans PIN")
        XCTAssertNotEqual(NSELockedConversationMirror.readFile(at: fixture.mirrorFile), .ids([]))
    }

    /// Le trousseau tient un code par verrou (`setLock` l'écrit avant que la
    /// conversation entre dans la liste) : la liste se reconstruit depuis lui,
    /// et l'extension l'apprend.
    func test_anUpgradeWhoseListReadsAbsent_withoutMirror_rebuildsTheLocksFromTheirPins() throws {
        let fixture = try makeLaunchFixture()
        let vault = InMemoryConversationLockVault()
        vault.write("pin-maître", for: "meeshy_master_pin")
        vault.write("{}", for: "meeshy_master_pin.attempts")
        vault.write("enrôlement", for: "meeshy_lock_biometric_state")
        vault.write("code", for: "meeshy_lock_coffre")
        vault.write("{}", for: "meeshy_lock_coffre.attempts")

        let sut = makeLaunchedManager(fixture, protectedData: ProtectedData(available: true), vault: vault)

        XCTAssertEqual(sut.lockedConversationIds, ["coffre"])
        XCTAssertFalse(sut.mayBeLocked("ouverte"), "la liste reconstruite est un savoir")
        XCTAssertEqual(NSELockedConversationMirror.readFile(at: fixture.mirrorFile), .ids(["coffre"]))
    }

    /// Un PIN maître sans aucun code de conversation est l'état normal après
    /// le retrait du dernier verrou : il ne dit aucun verrou.
    func test_aMasterPinAlone_withoutMirror_knowsThereIsNoLock() throws {
        let fixture = try makeLaunchFixture()
        let vault = InMemoryConversationLockVault()
        vault.write("pin-maître", for: "meeshy_master_pin")

        let sut = makeLaunchedManager(fixture, protectedData: ProtectedData(available: true), vault: vault)

        XCTAssertFalse(sut.mayBeLocked("ouverte"))
        XCTAssertEqual(NSELockedConversationMirror.readFile(at: fixture.mirrorFile), .ids([]))
    }

    /// Le trousseau ne se laisse pas énumérer : rien ne dit qu'il n'y a pas de
    /// verrou. La liste reste inconnue, et rien ne s'écrit.
    func test_aListReadAbsent_withoutMirror_andAnUnreadableVault_knowsNothing_andWritesNothing() throws {
        let fixture = try makeLaunchFixture()
        let vault = InMemoryConversationLockVault()
        vault.enumerable = false

        let sut = makeLaunchedManager(fixture, protectedData: ProtectedData(available: true), vault: vault)

        XCTAssertTrue(sut.mayBeLocked("ouverte"))
        XCTAssertEqual(NSELockedConversationMirror.readFile(at: fixture.mirrorFile), .absent)
        XCTAssertNil(fixture.mirror.stringArray(forKey: NSELockedConversationMirror.legacyDefaultsKey))
    }

    /// Restée inconnue, la liste se relit au prochain retour au premier plan.
    func test_anUnknownList_isReadAgain_whenTheAppBecomesActive() throws {
        let fixture = try makeLaunchFixture()
        let vault = InMemoryConversationLockVault()
        vault.enumerable = false
        let sut = makeLaunchedManager(fixture, protectedData: ProtectedData(available: true), vault: vault)
        fixture.standard.set(["coffre"], forKey: lockedIdsKey)

        let reloaded = expectation(description: "la liste se relit")
        let subscription = sut.$lockedConversationIds.first { $0.contains("coffre") }.sink { _ in reloaded.fulfill() }
        fixture.center.post(name: UIApplication.didBecomeActiveNotification, object: nil)
        wait(for: [reloaded], timeout: 2)
        subscription.cancel()

        XCTAssertFalse(sut.mayBeLocked("ouverte"))
        XCTAssertEqual(NSELockedConversationMirror.readFile(at: fixture.mirrorFile), .ids(["coffre"]))
    }

    func test_aLaunchWithProtectedData_readsTheListAndMirrorsIt() throws {
        let fixture = try makeLaunchFixture()
        fixture.standard.set(["coffre"], forKey: lockedIdsKey)

        let sut = makeLaunchedManager(fixture, protectedData: ProtectedData(available: true))

        XCTAssertTrue(sut.isLocked("coffre"))
        XCTAssertEqual(NSELockedConversationMirror.readFile(at: fixture.mirrorFile), .ids(["coffre"]))
    }

    // MARK: - #12655 : la déconnexion ne laisse aucun code qu'une reconstruction ranimerait

    /// Les blocs que la file principale tient déjà — dont la relecture
    /// abonnée à `fixture.center` — passent avant celui-ci.
    private func drainMainQueue() {
        let drained = expectation(description: "file principale vidée")
        DispatchQueue.main.async { drained.fulfill() }
        wait(for: [drained], timeout: 2)
    }

    /// La liste est inconnue (données protégées indisponibles, aucun miroir) :
    /// la déconnexion ne peut pas se borner à la liste en mémoire. Un code
    /// laissé au trousseau, la réinstallation suivante reconstruirait le
    /// verrou du compte A pour le compte B.
    func test_aLogoutWhileTheListIsUnknown_leavesNoPinThatARebuildCouldRevive() throws {
        let fixture = try makeLaunchFixture()
        let vault = InMemoryConversationLockVault()
        vault.write("code", for: "meeshy_lock_coffre")
        vault.write("{}", for: "meeshy_lock_coffre.attempts")
        let sut = makeLaunchedManager(fixture, protectedData: ProtectedData(available: false), vault: vault)

        sut.resetForLogout()

        XCTAssertNil(vault.read("meeshy_lock_coffre"))
        XCTAssertTrue(vault.items.isEmpty, "restes : \(vault.items.keys.sorted())")
        let reinstall = try makeLaunchFixture()
        let next = makeLaunchedManager(reinstall, protectedData: ProtectedData(available: true), vault: vault)
        XCTAssertFalse(next.isLocked("coffre"))
        XCTAssertFalse(next.mayBeLocked("coffre"))
    }

    /// Le trousseau ne s'efface pas avant le premier déverrouillage : la
    /// déconnexion rejoue l'effacement dès que les données protégées le
    /// deviennent.
    func test_aLogoutBeforeTheFirstUnlock_wipesTheVault_onceProtectedDataBecomesAvailable() throws {
        let fixture = try makeLaunchFixture()
        let vault = InMemoryConversationLockVault(items: [
            "meeshy_master_pin": "pin-maître", "meeshy_lock_coffre": "code", "meeshy_lock_biometric_state": "enrôlement",
        ])
        vault.sealed = true
        let protectedData = ProtectedData(available: false)
        let sut = makeLaunchedManager(fixture, protectedData: protectedData, vault: vault)

        sut.resetForLogout()
        XCTAssertEqual(vault.items.count, 3, "un trousseau scellé ne s'efface pas")

        vault.sealed = false
        protectedData.available = true
        fixture.center.post(name: UIApplication.protectedDataDidBecomeAvailableNotification, object: nil)
        drainMainQueue()

        XCTAssertTrue(vault.items.isEmpty, "restes : \(vault.items.keys.sorted())")
        let reinstall = try makeLaunchFixture()
        let next = makeLaunchedManager(reinstall, protectedData: ProtectedData(available: true), vault: vault)
        XCTAssertFalse(next.isLocked("coffre"))
    }

    /// L'effacement en attente passe AVANT toute nouvelle écriture : rejoué
    /// après, il emporterait le code que le compte suivant vient de poser, et
    /// sa conversation resterait sous un PIN que plus rien ne vérifie.
    func test_aPendingLogoutWipe_neverErasesACodeWrittenAfterIt() throws {
        let fixture = try makeLaunchFixture()
        let vault = InMemoryConversationLockVault(items: ["meeshy_lock_coffre": "code"])
        vault.sealed = true
        let protectedData = ProtectedData(available: false)
        let sut = makeLaunchedManager(fixture, protectedData: protectedData, vault: vault)
        sut.resetForLogout()

        vault.sealed = false
        protectedData.available = true
        sut.setMasterPin("123456")
        XCTAssertTrue(sut.setLock(conversationId: "neuve", pin: "1234"))
        fixture.center.post(name: UIApplication.protectedDataDidBecomeAvailableNotification, object: nil)
        drainMainQueue()

        XCTAssertNil(vault.read("meeshy_lock_coffre"), "le code du compte sortant part")
        XCTAssertTrue(sut.isLocked("neuve"))
        XCTAssertEqual(sut.attemptLock(conversationId: "neuve", pin: "1234"), .granted)
        XCTAssertTrue(sut.verifyMasterPin("123456"))
    }

    // MARK: - #12655 : un verrou n'entre dans la liste qu'une fois son code écrit

    /// La liste est un sous-ensemble des codes du trousseau — c'est ce que la
    /// reconstruction suppose. Un code qui ne s'écrit pas ne verrouille rien,
    /// et ne promet rien à l'extension.
    func test_setLock_whenTheCodeCannotBeWritten_locksNothing_andSaysSo() throws {
        let fixture = try makeLaunchFixture()
        let vault = InMemoryConversationLockVault()
        let sut = makeLaunchedManager(fixture, protectedData: ProtectedData(available: true), vault: vault)
        vault.refusesWrites = true

        XCTAssertFalse(sut.setLock(conversationId: "coffre", pin: "1234"))

        XCTAssertFalse(sut.isLocked("coffre"))
        XCTAssertFalse(sut.lockedConversationIds.contains("coffre"))
        XCTAssertEqual(NSELockedConversationMirror.readFile(at: fixture.mirrorFile), .ids([]))
        XCTAssertFalse((fixture.standard.stringArray(forKey: lockedIdsKey) ?? []).contains("coffre"))
    }

    func test_setLock_whenTheCodeIsWritten_saysSo() throws {
        let fixture = try makeLaunchFixture()
        let sut = makeLaunchedManager(fixture, protectedData: ProtectedData(available: true))

        XCTAssertTrue(sut.setLock(conversationId: "coffre", pin: "1234"))

        XCTAssertEqual(NSELockedConversationMirror.readFile(at: fixture.mirrorFile), .ids(["coffre"]))
    }

    /// Changer le code d'une conversation sans pouvoir l'écrire garde l'ancien.
    func test_aCodeChangeThatCannotBeWritten_keepsTheOldCode() throws {
        let fixture = try makeLaunchFixture()
        let vault = InMemoryConversationLockVault()
        let sut = makeLaunchedManager(fixture, protectedData: ProtectedData(available: true), vault: vault)
        XCTAssertTrue(sut.setLock(conversationId: "coffre", pin: "1111"))
        vault.refusesWrites = true

        XCTAssertFalse(sut.setLock(conversationId: "coffre", pin: "2222"))

        XCTAssertTrue(sut.isLocked("coffre"))
        XCTAssertEqual(sut.attemptLock(conversationId: "coffre", pin: "1111"), .granted)
    }

    // MARK: - #12655 : le trousseau réel

    private func makeKeychainVault() -> KeychainConversationLockVault {
        KeychainConversationLockVault(service: "me.meeshy.tests.conversation-locks.\(UUID().uuidString)")
    }

    private func keychainItem(_ vault: KeychainConversationLockVault, _ account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: vault.service,
            kSecAttrAccount as String: account,
        ]
    }

    /// Réécrire un code le met à jour EN PLACE : effacé d'abord, un ajout
    /// refusé ensuite laissait la conversation sans aucun code. Une marque
    /// posée sur l'élément survit à la réécriture, ce qu'un élément recréé ne
    /// ferait pas.
    func test_theKeychainVault_rewritesACodeInPlace_neverDeletingItFirst() throws {
        let vault = makeKeychainVault()
        defer { vault.deleteAll() }
        let item = keychainItem(vault, "meeshy_lock_coffre")
        XCTAssertTrue(vault.write("ancien", for: "meeshy_lock_coffre"))
        let mark: [String: Any] = [kSecAttrLabel as String: "marque"]
        XCTAssertEqual(SecItemUpdate(item as CFDictionary, mark as CFDictionary), errSecSuccess)

        XCTAssertTrue(vault.write("nouveau", for: "meeshy_lock_coffre"))

        var found: AnyObject?
        let query = item.merging([
            kSecReturnAttributes as String: true, kSecMatchLimit as String: kSecMatchLimitOne,
        ]) { _, new in new }
        XCTAssertEqual(SecItemCopyMatching(query as CFDictionary, &found), errSecSuccess)
        XCTAssertEqual((found as? [String: Any])?[kSecAttrLabel as String] as? String, "marque", "l'élément a été recréé")
        XCTAssertEqual(vault.read("meeshy_lock_coffre"), "nouveau")
    }

    func test_theKeychainVault_deleteAll_leavesNoAccount() {
        let vault = makeKeychainVault()
        defer { vault.deleteAll() }
        vault.write("pin-maître", for: "meeshy_master_pin")
        vault.write("code", for: "meeshy_lock_coffre")

        XCTAssertTrue(vault.deleteAll())

        XCTAssertEqual(vault.accounts(), [])
        XCTAssertTrue(vault.deleteAll(), "un coffre déjà vide s'efface sans échec")
    }

    // MARK: - #12655 : les Réglages ne lisent pas une liste inconnue comme « aucun verrou »

    func test_beforeTheListIsRead_theMasterPinCannotBeRemoved() throws {
        let fixture = try makeLaunchFixture()
        let vault = InMemoryConversationLockVault()
        vault.write("code", for: "meeshy_lock_coffre")
        let sut = makeLaunchedManager(fixture, protectedData: ProtectedData(available: false), vault: vault)
        sut.setMasterPin("123456")

        XCTAssertFalse(sut.offersMasterPinRemoval)
        sut.removeMasterPin()
        XCTAssertTrue(sut.hasMasterPin(), "le code de la conversation dépend encore du PIN maître")
    }

    func test_onceTheListIsReadEmpty_theMasterPinCanBeRemoved() throws {
        let fixture = try makeLaunchFixture()
        let sut = makeLaunchedManager(fixture, protectedData: ProtectedData(available: true))
        sut.setMasterPin("123456")

        XCTAssertTrue(sut.offersMasterPinRemoval)
        sut.removeMasterPin()
        XCTAssertFalse(sut.hasMasterPin())
    }

    /// Garde de SOURCE : les Réglages comptent le jeu de verrous (liste, et
    /// codes du trousseau tant qu'elle est inconnue) et ne proposent de
    /// supprimer le PIN maître que sur la décision du gestionnaire.
    func test_theSecuritySettings_countTheContentLockSet_andAskBeforeOfferingRemoval() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/SecurityView.swift"))

        XCTAssertTrue(code.contains("lockManager.contentLockedConversationIds.count"))
        XCTAssertTrue(code.contains("lockManager.offersMasterPinRemoval"))
        XCTAssertFalse(code.contains("lockManager.lockedConversationIds"))
        XCTAssertFalse(code.contains("lockedCount == 0"))
    }

    // MARK: - #12655 : une liste qui devient connue s'annonce

    /// Le widget republie sur `.conversationContentLocksDidChange` : la liste
    /// qui se lit enfin change le jeu qu'il masque.
    func test_aListThatBecomesKnown_announcesTheContentLockChange() throws {
        let fixture = try makeLaunchFixture()
        fixture.standard.set(["coffre"], forKey: lockedIdsKey)
        let protectedData = ProtectedData(available: false)
        let sut = makeLaunchedManager(fixture, protectedData: protectedData)

        let announced = expectation(
            forNotification: .conversationContentLocksDidChange, object: nil, notificationCenter: fixture.center
        )
        protectedData.available = true
        fixture.center.post(name: UIApplication.protectedDataDidBecomeAvailableNotification, object: nil)
        wait(for: [announced], timeout: 2)

        XCTAssertTrue(sut.isLocked("coffre"))
    }

    func test_aListRebuiltFromTheVault_announcesTheContentLockChange() throws {
        let fixture = try makeLaunchFixture()
        let vault = InMemoryConversationLockVault()
        vault.write("code", for: "meeshy_lock_coffre")
        let announced = expectation(
            forNotification: .conversationContentLocksDidChange, object: nil, notificationCenter: fixture.center
        )

        let sut = makeLaunchedManager(fixture, protectedData: ProtectedData(available: true), vault: vault)

        wait(for: [announced], timeout: 2)
        XCTAssertEqual(sut.lockedConversationIds, ["coffre"])
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
