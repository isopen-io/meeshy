import XCTest
@testable import MeeshySDK
@testable import Meeshy

/// #10482 — un compte que la passerelle dit supprimé quitte l'appareil : le
/// sélecteur et le trousseau (`AuthManager.retireDeletedAccount`) et son dossier
/// du jeu (`Application Support/MeeshyGame/<id>`). Le compte NOMMÉ seul — celui
/// d'un autre compte de l'appareil reste intact — et seulement sur le signal.
/// Un retrait interrompu est noté, et rejoué au lancement suivant.
@MainActor
final class DeletedAccountRetirementTests: XCTestCase {

    /// Un signal marque le compte « en attente de retrait » pour tout le
    /// processus : la marque ne doit pas survivre au témoin.
    override func tearDown() async throws {
        AccountDeletedSignal.forgetAwaitingRetirementForTesting()
        try await super.tearDown()
    }

    @MainActor
    private final class RetiringDouble: DeletedAccountRetiring {
        nonisolated deinit {}
        var retired: [String] = []
        var succeeds = true
        var onRetire: (() -> Void)?
        var sessionsIssued: [String: Date] = [:]

        func retireDeletedAccount(userId: String) async -> Bool {
            retired.append(userId)
            onRetire?()
            return succeeds
        }

        func sessionIssuedAt(for userId: String) -> Date? {
            sessionsIssued[userId]
        }
    }

    @MainActor
    private final class Flag {
        nonisolated deinit {}
        var raised = false
    }

    private func makeBase() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("game-retire-\(UUID().uuidString)", isDirectory: true)
    }

    private func makeDefaults() -> UserDefaults {
        UserDefaults(suiteName: "deleted-account-retirement-\(UUID().uuidString)")!
    }

    private func makeSUT(
        base: URL,
        defaults: UserDefaults,
        sessionResolved: @escaping DeletedAccountRetirement.SessionResolution = {},
        now: Date = Date(timeIntervalSince1970: 1_000)
    ) -> (sut: DeletedAccountRetirement, accounts: RetiringDouble) {
        let accounts = RetiringDouble()
        let sut = DeletedAccountRetirement(
            accounts: accounts, gameBase: base, defaults: defaults, sessionResolved: sessionResolved, now: { now })
        return (sut, accounts)
    }

    /// Le carnet d'un compte, tel que `GamePhotoNotebook.standard` le range.
    private func seedNotebook(of userId: String, base: URL) throws -> URL {
        let notebook = GamePhotoNotebook.accountFolder(userId: userId, base: base).appendingPathComponent("Notebook", isDirectory: true)
        try FileManager.default.createDirectory(at: notebook, withIntermediateDirectories: true)
        try Data("photo".utf8).write(to: notebook.appendingPathComponent("moment-story.jpg"))
        return notebook
    }

    private func exists(_ url: URL) -> Bool { FileManager.default.fileExists(atPath: url.path) }

    func test_accountFolder_isTheFolderTheNotebookLivesIn() {
        let base = makeBase()
        XCTAssertEqual(
            GamePhotoNotebook.accountFolder(userId: "user-a", base: base),
            base.appendingPathComponent("MeeshyGame", isDirectory: true).appendingPathComponent("user-a", isDirectory: true)
        )
    }

    func test_retire_erasesTheNamedAccountGameAndKeepsTheOthers() async throws {
        let base = makeBase()
        defer { try? FileManager.default.removeItem(at: base) }
        let ada = try seedNotebook(of: "user-a", base: base)
        let bob = try seedNotebook(of: "user-b", base: base)
        let defaults = makeDefaults()
        let (sut, accounts) = makeSUT(base: base, defaults: defaults)

        let done = await sut.retire("user-a")

        XCTAssertTrue(done)
        XCTAssertEqual(accounts.retired, ["user-a"], "le compte nommé quitte le sélecteur et le trousseau")
        XCTAssertFalse(exists(GamePhotoNotebook.accountFolder(userId: "user-a", base: base)))
        XCTAssertFalse(exists(ada))
        XCTAssertTrue(exists(bob.appendingPathComponent("moment-story.jpg")), "le jeu d'un autre compte de l'appareil reste intact")
        XCTAssertTrue(sut.pending.isEmpty, "un retrait abouti n'est plus noté")
    }

    func test_retire_somethingThatIsNotAnIdentifier_touchesNothing() async throws {
        let base = makeBase()
        defer { try? FileManager.default.removeItem(at: base) }
        let bob = try seedNotebook(of: "user-b", base: base)
        let (sut, accounts) = makeSUT(base: base, defaults: makeDefaults())

        let done = await sut.retire("../user-b")

        XCTAssertFalse(done)
        XCTAssertTrue(accounts.retired.isEmpty)
        XCTAssertTrue(exists(bob))
    }

    func test_retire_interrupted_staysNotedForTheNextLaunch() async throws {
        let base = makeBase()
        defer { try? FileManager.default.removeItem(at: base) }
        _ = try seedNotebook(of: "user-a", base: base)
        let defaults = makeDefaults()
        let (sut, accounts) = makeSUT(base: base, defaults: defaults)
        accounts.succeeds = false

        let done = await sut.retire("user-a")

        XCTAssertFalse(done)
        XCTAssertEqual(sut.pending, ["user-a"])
    }

    func test_replayPending_retiresWhatWasNotedOnceTheSessionIsRead() async throws {
        let base = makeBase()
        defer { try? FileManager.default.removeItem(at: base) }
        _ = try seedNotebook(of: "user-a", base: base)
        let bob = try seedNotebook(of: "user-b", base: base)
        let defaults = makeDefaults()
        defaults.set(["user-a", "../user-b"], forKey: DeletedAccountRetirement.pendingKey)
        let sessionRead = Flag()
        let (sut, accounts) = makeSUT(base: base, defaults: defaults, sessionResolved: { sessionRead.raised = true })
        accounts.onRetire = { XCTAssertTrue(sessionRead.raised, "un retrait rejoué attend la lecture de la session du trousseau") }

        await sut.replayPending()

        XCTAssertEqual(accounts.retired, ["user-a"], "ce qui n'a pas la forme d'un identifiant ne nomme aucun compte")
        XCTAssertFalse(exists(GamePhotoNotebook.accountFolder(userId: "user-a", base: base)))
        XCTAssertTrue(exists(bob))
        XCTAssertTrue(sut.pending.isEmpty)
    }

    func test_install_retiresOnTheSignal() async throws {
        let base = makeBase()
        defer { try? FileManager.default.removeItem(at: base) }
        _ = try seedNotebook(of: "user-a", base: base)
        let center = NotificationCenter()
        let (sut, accounts) = makeSUT(base: base, defaults: makeDefaults())
        let retired = expectation(description: "retrait")
        accounts.onRetire = { retired.fulfill() }
        sut.install(center: center)

        AccountDeletedSignal.signal(accountId: "user-a", center: center)

        await fulfillment(of: [retired], timeout: 2)
        XCTAssertEqual(accounts.retired, ["user-a"])
    }

    func test_install_withoutTheSignal_retiresNothing() async throws {
        let base = makeBase()
        defer { try? FileManager.default.removeItem(at: base) }
        let ada = try seedNotebook(of: "user-a", base: base)
        let center = NotificationCenter()
        let (sut, accounts) = makeSUT(base: base, defaults: makeDefaults())
        let retired = expectation(description: "aucun retrait")
        retired.isInverted = true
        accounts.onRetire = { retired.fulfill() }
        sut.install(center: center)

        GuestSessionEnd.accessRevoked.signal(refusedSessionToken: "anon", center: center)
        center.post(name: .meeshyAccountDeleted, object: nil, userInfo: ["accountId": "../user-a"])

        await fulfillment(of: [retired], timeout: 0.5)
        XCTAssertTrue(accounts.retired.isEmpty)
        XCTAssertTrue(exists(ada))
    }

    // MARK: - La note est datée

    func test_replayPending_anAccountSignedInAgainSinceTheNote_isNoLongerRetired() async throws {
        let base = makeBase()
        defer { try? FileManager.default.removeItem(at: base) }
        let ada = try seedNotebook(of: "user-a", base: base)
        let defaults = makeDefaults()
        let (first, failing) = makeSUT(base: base, defaults: defaults, now: Date(timeIntervalSince1970: 1_000))
        failing.succeeds = false
        _ = await first.retire("user-a")
        XCTAssertEqual(first.pending, ["user-a"])
        let (sut, accounts) = makeSUT(base: base, defaults: defaults, now: Date(timeIntervalSince1970: 3_000))
        accounts.sessionsIssued["user-a"] = Date(timeIntervalSince1970: 2_000)

        await sut.replayPending()

        XCTAssertTrue(accounts.retired.isEmpty, "un compte reconnecté depuis la note n'est plus retiré par elle")
        XCTAssertTrue(sut.pending.isEmpty, "la note est abandonnée")
        XCTAssertTrue(exists(ada.appendingPathComponent("moment-story.jpg")))
    }

    func test_replayPending_aSessionOlderThanTheNote_stillRetires() async throws {
        let base = makeBase()
        defer { try? FileManager.default.removeItem(at: base) }
        _ = try seedNotebook(of: "user-a", base: base)
        let defaults = makeDefaults()
        let (first, failing) = makeSUT(base: base, defaults: defaults, now: Date(timeIntervalSince1970: 1_000))
        failing.succeeds = false
        _ = await first.retire("user-a")
        let (sut, accounts) = makeSUT(base: base, defaults: defaults, now: Date(timeIntervalSince1970: 3_000))
        accounts.sessionsIssued["user-a"] = Date(timeIntervalSince1970: 500)

        await sut.replayPending()

        XCTAssertEqual(accounts.retired, ["user-a"])
        XCTAssertFalse(exists(GamePhotoNotebook.accountFolder(userId: "user-a", base: base)))
        XCTAssertTrue(sut.pending.isEmpty)
    }

    // MARK: - Une écriture en vol ne ressuscite pas le jeu

    func test_replayPending_reErasesTheGameOfARetiredAccountRecreatedByALateWrite() async throws {
        let base = makeBase()
        defer { try? FileManager.default.removeItem(at: base) }
        _ = try seedNotebook(of: "user-a", base: base)
        let bob = try seedNotebook(of: "user-b", base: base)
        let defaults = makeDefaults()
        let (first, _) = makeSUT(base: base, defaults: defaults)
        _ = await first.retire("user-a")
        let late = try seedNotebook(of: "user-a", base: base)
        let (sut, accounts) = makeSUT(base: base, defaults: defaults, now: Date(timeIntervalSince1970: 5_000))

        await sut.replayPending()

        XCTAssertFalse(exists(late), "le dossier recréé par une écriture en vol est réeffacé au lancement")
        XCTAssertFalse(exists(GamePhotoNotebook.accountFolder(userId: "user-a", base: base)))
        XCTAssertTrue(exists(bob.appendingPathComponent("moment-story.jpg")), "le jeu d'un autre compte reste intact")
        XCTAssertTrue(accounts.retired.isEmpty, "un compte enterré n'est pas retiré une seconde fois")
    }

    func test_replayPending_aRetiredAccountSignedInAgain_keepsItsNewGame() async throws {
        let base = makeBase()
        defer { try? FileManager.default.removeItem(at: base) }
        _ = try seedNotebook(of: "user-a", base: base)
        let defaults = makeDefaults()
        let (first, _) = makeSUT(base: base, defaults: defaults, now: Date(timeIntervalSince1970: 1_000))
        _ = await first.retire("user-a")
        let fresh = try seedNotebook(of: "user-a", base: base)
        let (sut, accounts) = makeSUT(base: base, defaults: defaults, now: Date(timeIntervalSince1970: 5_000))
        accounts.sessionsIssued["user-a"] = Date(timeIntervalSince1970: 2_000)

        await sut.replayPending()

        XCTAssertTrue(exists(fresh), "le jeu d'un compte repris depuis son retrait est le sien")
        XCTAssertNil(sut.buried["user-a"], "sa tombe est levée")
    }
}
