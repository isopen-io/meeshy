import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **Le partage que l'extension relaie à l'app** (#10947, revue du lot iOS) :
/// - une fiche n'est servie qu'au compte qui l'a déposée (une fiche sans
///   propriétaire, au premier compte connecté) ;
/// - elle reste sur le disque jusqu'à ce que l'écran de partage soit REFERMÉ,
///   pas seulement présenté : une app tuée avant « Envoyer » la retrouve.
@MainActor
final class ShareRelayConsumerTests: XCTestCase {

    private func directory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("share-relay-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return url
    }

    private func fiche(_ shareId: String, owner: String?, at seconds: TimeInterval = 1_000) -> ShareRelayHandoff {
        ShareRelayHandoff(shareId: shareId, createdAt: Date(timeIntervalSince1970: seconds), text: "Texte de \(owner ?? "personne")",
                          media: [], conversationIds: ["c1"], ownerUserId: owner)
    }

    private func consumer(_ directory: URL, user: String?) -> ShareRelayConsumer {
        ShareRelayConsumer(directory: { directory }, mediaRoot: { nil }, now: { Date(timeIntervalSince1970: 2_000) },
                           currentUserId: { user })
    }

    func test_aFicheOfAnotherAccount_isNeverServed() throws {
        let dir = try directory()
        try fiche("cid_a", owner: "alice").write(in: dir)

        let sut = consumer(dir, user: "bob")
        sut.consumeNext()

        XCTAssertNil(sut.pending, "le compte B ne voit jamais le partage du compte A")
    }

    func test_theOwnersFiche_isServedToItsOwner() throws {
        let dir = try directory()
        try fiche("cid_a", owner: "alice").write(in: dir)

        let sut = consumer(dir, user: "alice")
        sut.consumeNext()

        XCTAssertEqual(sut.pending?.shareId, "cid_a")
    }

    func test_aFicheWithoutOwner_isServedToTheSignedInAccount() throws {
        let dir = try directory()
        try fiche("cid_n", owner: nil).write(in: dir)

        let sut = consumer(dir, user: "bob")
        sut.consumeNext()

        XCTAssertEqual(sut.pending?.shareId, "cid_n", "fragment « Connectez-vous pour envoyer » : le partage attend le premier compte")
    }

    func test_withoutSignedInAccount_nothingIsServed() throws {
        let dir = try directory()
        try fiche("cid_n", owner: nil).write(in: dir)

        let sut = consumer(dir, user: nil)
        sut.consumeNext()

        XCTAssertNil(sut.pending)
    }

    func test_aPresentedFiche_staysOnDisk_untilTheSheetCloses() throws {
        let dir = try directory()
        try fiche("cid_a", owner: "alice").write(in: dir)
        let sut = consumer(dir, user: "alice")
        sut.consumeNext()
        sut.markPresented("cid_a")

        let relaunched = consumer(dir, user: "alice")
        relaunched.consumeNext()
        XCTAssertEqual(relaunched.pending?.shareId, "cid_a", "une app tuée avant « Envoyer » retrouve le partage annoncé « En file »")

        sut.settle("cid_a")
        let afterClose = consumer(dir, user: "alice")
        afterClose.consumeNext()
        XCTAssertNil(sut.pending)
        XCTAssertNil(afterClose.pending, "l'écran refermé solde la fiche")
    }

    func test_settling_servesTheNextFicheOfTheSameAccount() throws {
        let dir = try directory()
        try fiche("cid_1", owner: "alice", at: 1_000).write(in: dir)
        try fiche("cid_2", owner: "alice", at: 1_100).write(in: dir)
        try fiche("cid_x", owner: "carol", at: 900).write(in: dir)
        let sut = consumer(dir, user: "alice")
        sut.consumeNext()
        XCTAssertEqual(sut.pending?.shareId, "cid_1")

        sut.settle("cid_1")

        XCTAssertEqual(sut.pending?.shareId, "cid_2")
    }

    /// A arme un relais, se déconnecte, B se connecte avant que l'écran ne
    /// s'ouvre : le relais en mémoire n'est pas présentable à B (#10978).
    func test_aRelayArmedForOneAccount_isNotPresentableToTheNextOne() throws {
        let dir = try directory()
        try fiche("cid_a", owner: "alice").write(in: dir)
        final class Session { var user: String? = "alice" }
        let session = Session()
        let sut = ShareRelayConsumer(directory: { dir }, mediaRoot: { nil }, now: { Date(timeIntervalSince1970: 2_000) },
                                     currentUserId: { session.user })
        sut.consumeNext()
        XCTAssertEqual(sut.presentable()?.shareId, "cid_a")

        session.user = "bob"

        XCTAssertNil(sut.presentable(), "le texte et les médias de A ne s'ouvrent jamais sous B")
        XCTAssertNil(sut.pending)
    }

    func test_forget_dropsTheRelayHeldInMemory() throws {
        let dir = try directory()
        try fiche("cid_a", owner: "alice").write(in: dir)
        let sut = consumer(dir, user: "alice")
        sut.consumeNext()
        sut.markPresented("cid_a")

        sut.forget()

        XCTAssertNil(sut.pending)
        XCTAssertNil(sut.presentedShareId)
    }

    /// Une fiche écrite avant ce champ se relit sans lui (rétrocompatibilité).
    func test_aFicheWrittenBeforeTheOwnerField_decodesWithoutOwner() throws {
        let json = #"{"version":1,"shareId":"cid_old","createdAt":"1970-01-01T00:16:40Z","text":"x","media":[],"conversationIds":[]}"#
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(ShareRelayHandoff.self, from: Data(json.utf8))
        XCTAssertNil(decoded.ownerUserId)
    }
}
