import XCTest
import MeeshySDK
@testable import Meeshy

/// #10482 — un compte que la passerelle dit supprimé quitte l'appareil : le
/// sélecteur et le trousseau (`AuthManager.retireDeletedAccount`) et son dossier
/// du jeu (`Application Support/MeeshyGame/<id>`). Le compte NOMMÉ seul — celui
/// d'un autre compte de l'appareil reste intact — et seulement sur le signal.
/// Un retrait interrompu est noté, et rejoué au lancement suivant.
@MainActor
final class DeletedAccountRetirementTests: XCTestCase {

    @MainActor
    private final class RetiringDouble: DeletedAccountRetiring {
        nonisolated deinit {}
        var retired: [String] = []
        var succeeds = true
        var onRetire: (() -> Void)?

        func retireDeletedAccount(userId: String) async -> Bool {
            retired.append(userId)
            onRetire?()
            return succeeds
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
        sessionResolved: @escaping DeletedAccountRetirement.SessionResolution = {}
    ) -> (sut: DeletedAccountRetirement, accounts: RetiringDouble) {
        let accounts = RetiringDouble()
        let sut = DeletedAccountRetirement(accounts: accounts, gameBase: base, defaults: defaults, sessionResolved: sessionResolved)
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
}
