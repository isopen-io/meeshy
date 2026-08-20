import XCTest
import MeeshySDK

/// La fiche est un write-ahead : elle est réécrite ATOMIQUEMENT à chaque
/// transition (fichiers copiés, upload terminé, cible servie) et n'est
/// supprimée que lorsque TOUTES les cibles sont `sent`.
///
/// Sans le premier invariant, une interruption après l'upload
/// re-téléverserait plusieurs gigaoctets (les attachments orphelins ne sont
/// balayés qu'à H+24). Sans le second, une interruption après la première
/// cible perdrait les suivantes SANS TRACE : le `clientMessageId` ne
/// dédoublonne que sur `(conversationId, clientMessageId)`, il ne rattrape
/// pas une cible jamais servie.
final class SharePendingShareTests: XCTestCase {

    private func makeDirectory() throws -> URL {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("share-fiche-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private func makeShare(
        shareId: String = "cid_00000000-0000-4000-8000-000000000000",
        media: [ShareStagedMedia] = [],
        conversationIds: [String] = ["conv1", "conv2"]
    ) -> SharePendingShare {
        SharePendingShare.make(
            shareId: shareId,
            createdAt: Date(timeIntervalSince1970: 1_785_000_000),
            content: "bonjour",
            media: media,
            conversationIds: conversationIds
        )
    }

    private let photo = ShareStagedMedia(
        relPath: "cid_00000000-0000-4000-8000-000000000000/0.jpg",
        ext: "jpg", mime: "image/jpeg", bytes: 2048
    )

    // MARK: - Construction

    func test_make_stampsTheCurrentVersion() {
        XCTAssertEqual(makeShare().v, 1)
        XCTAssertEqual(SharePendingShare.currentVersion, 1)
    }

    func test_make_marksEveryTargetPending() {
        let share = makeShare()
        XCTAssertEqual(share.targets.map(\.conversationId), ["conv1", "conv2"])
        XCTAssertEqual(share.targets.map(\.state), [.pending, .pending])
        XCTAssertTrue(share.targets.allSatisfy { $0.serverMessageId == nil })
    }

    /// La PREMIÈRE cible porte les octets : c'est elle qui téléverse, les
    /// autres réclameront une copie serveur des mêmes pièces jointes.
    func test_make_withMedia_designatesTheFirstTargetAsOrigin() {
        XCTAssertEqual(makeShare(media: [photo]).originTargetIndex, 0)
    }

    func test_make_withoutMedia_hasNoOrigin() {
        XCTAssertNil(makeShare().originTargetIndex,
                     "un partage de texte n'a pas d'octets à porter")
    }

    func test_make_startsWithoutUploadedAttachmentIds() {
        XCTAssertNil(makeShare(media: [photo]).uploadedAttachmentIds,
                     "le champ n'est écrit qu'APRÈS un upload réussi")
    }

    // MARK: - Identifiant client par cible (round 1 de revue)
    //
    // L'ancienne dérivation `"\(shareId)_t\(index)"` produisait `cid_<uuid>_t0`
    // — rejeté par le motif serveur strictement ancré
    // (`packages/shared/utils/client-message-id.ts:22-23`), sur les DEUX
    // chemins d'envoi (REST et socket). Chaque cible porte désormais son
    // PROPRE identifiant, généré une fois par `.make()` et PERSISTÉ.

    /// Une fiche décrit N cibles, mais l'enfilage est fait PAR CIBLE : deux
    /// cibles ne doivent jamais partager le même identifiant.
    func test_make_assignsADistinctClientMessageIdToEachTarget() {
        let share = makeShare(conversationIds: ["conv1", "conv2", "conv3"])
        let ids = share.targets.map(\.clientMessageId)

        XCTAssertEqual(Set(ids).count, ids.count, "chaque cible doit porter un identifiant DISTINCT")
    }

    /// LE test qui manquait avant round 1 : confronter l'identifiant produit
    /// à la grammaire réelle du serveur, via le validateur du SDK plutôt
    /// qu'une copie locale du motif.
    func test_make_everyTargetClientMessageId_matchesTheServerGrammar() {
        let share = makeShare(conversationIds: ["conv1", "conv2", "conv3"])

        for id in share.targets.map(\.clientMessageId) {
            XCTAssertTrue(ClientMessageId.isValid(id), "« \(id) » rejeté par le motif serveur")
        }
    }

    // MARK: - Sérialisation

    func test_encodedShare_roundTripsThroughJSON() throws {
        var share = makeShare(media: [photo])
        share.uploadedAttachmentIds = ["att1"]
        share.targets[0].state = .sent
        share.targets[0].serverMessageId = "srv1"

        let data = try SharePendingShare.encoder().encode(share)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        XCTAssertEqual(try decoder.decode(SharePendingShare.self, from: data), share)
    }

    func test_fileName_isDerivedFromTheShareIdentifier() {
        XCTAssertEqual(makeShare(shareId: "cid_abc").fileName, "cid_abc.json")
    }

    // MARK: - Invariants de commit

    func test_commit_withPendingTargets_writesTheFiche() throws {
        let dir = try makeDirectory()
        let share = makeShare()

        try share.commit(in: dir)

        let written = try Data(contentsOf: dir.appendingPathComponent(share.fileName))
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        XCTAssertEqual(try decoder.decode(SharePendingShare.self, from: written), share)
    }

    /// Invariant 1 : chaque transition réécrit la fiche. Une reprise doit
    /// retrouver l'ÉTAT COURANT, pas l'état initial.
    func test_commit_afterATransition_overwritesWithTheNewState() throws {
        let dir = try makeDirectory()
        var share = makeShare()
        try share.commit(in: dir)

        share.targets[0].state = .sent
        share.targets[0].serverMessageId = "srv1"
        try share.commit(in: dir)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let reread = try decoder.decode(
            SharePendingShare.self,
            from: try Data(contentsOf: dir.appendingPathComponent(share.fileName))
        )
        XCTAssertEqual(reread.targets[0].state, .sent)
        XCTAssertEqual(reread.targets[0].serverMessageId, "srv1")
        XCTAssertEqual(reread.targets[1].state, .pending)
    }

    /// Invariant 2, et c'est LE point : une seule cible servie ne supprime
    /// rien. La supprimer perdrait les autres sans trace.
    func test_commit_withOneTargetServed_keepsTheFiche() throws {
        let dir = try makeDirectory()
        var share = makeShare()
        share.targets[0].state = .sent
        try share.commit(in: dir)

        XCTAssertTrue(FileManager.default.fileExists(
            atPath: dir.appendingPathComponent(share.fileName).path),
            "la fiche n'est supprimée QUE lorsque TOUTES les cibles sont servies")
    }

    func test_commit_withEveryTargetServed_removesTheFiche() throws {
        let dir = try makeDirectory()
        var share = makeShare()
        try share.commit(in: dir)

        share.targets[0].state = .sent
        share.targets[1].state = .sent
        try share.commit(in: dir)

        XCTAssertFalse(FileManager.default.fileExists(
            atPath: dir.appendingPathComponent(share.fileName).path))
    }

    /// Une cible en échec n'est PAS servie : la fiche doit survivre pour que
    /// l'app la reprenne.
    func test_commit_withAFailedTarget_keepsTheFiche() throws {
        let dir = try makeDirectory()
        var share = makeShare()
        share.targets[0].state = .sent
        share.targets[1].state = .failed
        try share.commit(in: dir)

        XCTAssertTrue(FileManager.default.fileExists(
            atPath: dir.appendingPathComponent(share.fileName).path))
        XCTAssertFalse(share.isFullyServed)
    }

    func test_isFullyServed_requiresEveryTarget() {
        var share = makeShare()
        XCTAssertFalse(share.isFullyServed)
        share.targets[0].state = .sent
        XCTAssertFalse(share.isFullyServed)
        share.targets[1].state = .sent
        XCTAssertTrue(share.isFullyServed)
    }
}
