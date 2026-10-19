import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **La fiche de studio que l'extension remet à l'app** (#10986) — même règle
/// que la fiche de relais (#10978) :
/// - une fiche n'est servie qu'au compte qui l'a déposée ;
/// - une fiche sans propriétaire n'est servie que si elle a été écrite SANS
///   session par une extension qui sait nommer le compte (v2) — jamais une
///   fiche ancienne (v1), dont on ne sait pas à qui elle était ;
/// - ce qui a été servi à un compte ne s'ouvre pas sous le suivant, et la
///   déconnexion l'oublie.
@MainActor
final class ShareComposeHandoffConsumerTests: XCTestCase {

    private func directory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("share-compose-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return url
    }

    /// Écrite par le type de l'EXTENSION, relue par l'app : le contrat est
    /// éprouvé au passage.
    private func write(_ shareId: String, owner: String?, at seconds: TimeInterval = 1_000, in directory: URL) throws {
        let fiche = ShareComposeHandoff(shareId: shareId, createdAt: Date(timeIntervalSince1970: seconds),
                                        text: "Texte de \(owner ?? "personne")", media: [], ownerUserId: owner)
        try JSONEncoder.meeshyShareCompose.encode(fiche)
            .write(to: directory.appendingPathComponent("\(shareId).json"), options: .atomic)
    }

    private func writeLegacy(_ shareId: String, in directory: URL) throws {
        let json = #"{"version":1,"shareId":"\#(shareId)","createdAt":"1970-01-01T00:16:40Z","text":"ancien","media":[]}"#
        try Data(json.utf8).write(to: directory.appendingPathComponent("\(shareId).json"))
    }

    private final class Session { var user: String? }

    private func consumer(_ directory: URL, session: Session) -> ShareComposeHandoffConsumer {
        ShareComposeHandoffConsumer(directory: { directory }, mediaRoot: { nil }, currentUserId: { session.user })
    }

    private func consumer(_ directory: URL, user: String?) -> ShareComposeHandoffConsumer {
        let session = Session()
        session.user = user
        return consumer(directory, session: session)
    }

    func test_aFicheOfAnotherAccount_isNeverServed() async throws {
        let dir = try directory()
        try write("cid_a", owner: "alice", in: dir)

        let sut = consumer(dir, user: "bob")
        await sut.consumeNext()

        XCTAssertNil(sut.pending, "le studio de B ne s'ouvre jamais sur le partage de A")
    }

    func test_theOwnersFiche_isServedToItsOwner() async throws {
        let dir = try directory()
        try write("cid_a", owner: "alice", in: dir)

        let sut = consumer(dir, user: "alice")
        await sut.consumeNext()

        XCTAssertEqual(sut.presentable?.shareId, "cid_a")
    }

    func test_aFicheOfAnotherAccount_doesNotHideTheOwnersNextOne() async throws {
        let dir = try directory()
        try write("cid_a", owner: "alice", at: 1_000, in: dir)
        try write("cid_b", owner: "bob", at: 2_000, in: dir)

        let sut = consumer(dir, user: "bob")
        await sut.consumeNext()

        XCTAssertEqual(sut.pending?.shareId, "cid_b", "la plus ancienne SERVABLE, pas la plus ancienne du dossier")
    }

    func test_aFicheWrittenWithoutSession_isServedToTheSignedInAccount() async throws {
        let dir = try directory()
        try write("cid_n", owner: nil, in: dir)

        let sut = consumer(dir, user: "bob")
        await sut.consumeNext()

        XCTAssertEqual(sut.pending?.shareId, "cid_n", "partagé avant la connexion : le partage attend le premier compte")
    }

    func test_aLegacyFicheWithoutOwner_isServedToNobody() async throws {
        let dir = try directory()
        try writeLegacy("cid_old", in: dir)

        let sut = consumer(dir, user: "bob")
        await sut.consumeNext()

        XCTAssertNil(sut.pending, "une fiche v1 ne dit pas à qui elle était : elle n'est servie à personne")
    }

    func test_withoutSignedInAccount_nothingIsServed() async throws {
        let dir = try directory()
        try write("cid_n", owner: nil, in: dir)

        let sut = consumer(dir, user: nil)
        await sut.consumeNext()

        XCTAssertNil(sut.pending)
    }

    /// A arme le studio, se déconnecte, B se connecte avant que le cover ne
    /// s'ouvre : la pièce de A n'est pas présentable à B.
    func test_aComposeServedToOneAccount_isNotPresentableToTheNextOne() async throws {
        let dir = try directory()
        try write("cid_a", owner: "alice", in: dir)
        let session = Session()
        session.user = "alice"
        let sut = consumer(dir, session: session)
        await sut.consumeNext()
        XCTAssertEqual(sut.presentable?.shareId, "cid_a")

        session.user = "bob"

        XCTAssertNil(sut.presentable, "le texte et les médias de A ne s'ouvrent jamais sous B")
    }

    func test_consumeNext_underAnotherAccount_replacesWhatWasServedToThePreviousOne() async throws {
        let dir = try directory()
        try write("cid_a", owner: "alice", at: 1_000, in: dir)
        try write("cid_b", owner: "bob", at: 2_000, in: dir)
        let session = Session()
        session.user = "alice"
        let sut = consumer(dir, session: session)
        await sut.consumeNext()

        session.user = "bob"
        await sut.consumeNext()

        XCTAssertEqual(sut.presentable?.shareId, "cid_b")
    }

    func test_forget_dropsTheComposeHeldInMemory_andKeepsTheFiche() async throws {
        let dir = try directory()
        try write("cid_a", owner: "alice", in: dir)
        let sut = consumer(dir, user: "alice")
        await sut.consumeNext()

        sut.forget()

        XCTAssertNil(sut.pending)
        XCTAssertTrue(FileManager.default.fileExists(atPath: dir.appendingPathComponent("cid_a.json").path),
                      "la mémoire part ; le disque, c'est le wipe de logout qui le purge")
    }
}
