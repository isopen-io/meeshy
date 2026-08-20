import XCTest
@testable import Meeshy

/// La fiche de reprise traverse une frontière de process : l'extension écrit
/// (`SharePendingShare`, cible MeeshyShareExtension) et l'app relit
/// (`SharePendingSendConsumer.PendingShare`, cible Meeshy). Les deux cibles ne
/// peuvent pas partager un type — l'extension est délibérément sans dépendance
/// SDK — donc le contrat est dupliqué, comme l'est déjà
/// `ConversationSnapshotPayload` / `ConversationLocalSnapshot` côté NSE.
///
/// Ce bundle de tests compile LES DEUX. C'est le seul endroit du dépôt où la
/// dérive entre les deux miroirs peut être attrapée mécaniquement — **états par
/// cible compris**, qui sont précisément ce que l'ancien relais n'avait pas.
final class SharePendingSendContractTests: XCTestCase {

    private let photo = ShareStagedMedia(
        relPath: "cid_00000000-0000-4000-8000-000000000000/0.jpg",
        ext: "jpg", mime: "image/jpeg", bytes: 2048
    )

    /// `.make()` génère un `clientMessageId` ALÉATOIRE par cible (round 1 de
    /// revue) : deux appels produiraient donc deux fiches non-`Equatable`,
    /// alors que plusieurs tests ci-dessous appellent `makeReference()` deux
    /// fois et comparent les résultats. Les identifiants sont donc remplacés
    /// ici par des valeurs FIXES pour que la fiche de référence soit stable
    /// d'un appel à l'autre.
    private func makeReference() -> SharePendingShare {
        var share = SharePendingShare.make(
            shareId: "cid_00000000-0000-4000-8000-000000000000",
            createdAt: Date(timeIntervalSince1970: 1_785_000_000),
            content: "bonjour",
            media: [photo],
            conversationIds: ["conv42", "conv43"]
        )
        share.uploadedAttachmentIds = ["att1"]
        share.targets[0] = SharePendingShare.Target(
            conversationId: "conv42",
            clientMessageId: "cid_10000000-0000-4000-8000-000000000000",
            state: .sent,
            serverMessageId: "srv1")
        share.targets[1] = SharePendingShare.Target(
            conversationId: "conv43",
            clientMessageId: "cid_20000000-0000-4000-8000-000000000000",
            state: .failed)
        return share
    }

    // MARK: - Traversée du contrat

    func test_ficheWrittenByExtension_decodesInTheApp() throws {
        let data = try SharePendingShare.encoder().encode(makeReference())

        let decoded = try SharePendingSendConsumer.decoder()
            .decode(SharePendingSendConsumer.PendingShare.self, from: data)

        XCTAssertEqual(decoded.v, 1)
        XCTAssertEqual(decoded.clientMessageId, "cid_00000000-0000-4000-8000-000000000000")
        XCTAssertEqual(decoded.content, "bonjour")
        XCTAssertEqual(decoded.uploadedAttachmentIds, ["att1"])
        XCTAssertEqual(decoded.originTargetIndex, 0)
        XCTAssertEqual(
            decoded.createdAt.timeIntervalSince1970, 1_785_000_000, accuracy: 1)
    }

    /// LE point que l'ancien relais ne pouvait pas porter : chaque cible a son
    /// propre état, et il doit survivre à la traversée. Sans lui, une reprise
    /// après interruption réenverrait une cible déjà servie, ou en oublierait
    /// une jamais servie.
    func test_perTargetState_survivesTheCrossing() throws {
        let reference = makeReference()
        let data = try SharePendingShare.encoder().encode(reference)

        let decoded = try SharePendingSendConsumer.decoder()
            .decode(SharePendingSendConsumer.PendingShare.self, from: data)

        XCTAssertEqual(decoded.targets.map(\.conversationId), ["conv42", "conv43"])
        XCTAssertEqual(decoded.targets.map(\.state), [.sent, .failed])
        XCTAssertEqual(decoded.targets.map(\.serverMessageId), ["srv1", nil])
        XCTAssertEqual(decoded.targets.map(\.clientMessageId), reference.targets.map(\.clientMessageId))
    }

    func test_mediaDescriptors_surviveTheCrossing() throws {
        let data = try SharePendingShare.encoder().encode(makeReference())

        let decoded = try SharePendingSendConsumer.decoder()
            .decode(SharePendingSendConsumer.PendingShare.self, from: data)

        XCTAssertEqual(decoded.media.count, 1)
        XCTAssertEqual(decoded.media[0].relPath, photo.relPath)
        XCTAssertEqual(decoded.media[0].ext, "jpg")
        XCTAssertEqual(decoded.media[0].mime, "image/jpeg")
        XCTAssertEqual(decoded.media[0].bytes, 2048)
    }

    /// Le sens RETOUR compte aussi : l'extension du lot B-2 relit sa propre
    /// fiche après un upload, et l'app la réécrit à chaque cible servie.
    func test_ficheWrittenByTheApp_decodesInTheExtension() throws {
        let appShare = try SharePendingSendConsumer.decoder()
            .decode(
                SharePendingSendConsumer.PendingShare.self,
                from: try SharePendingShare.encoder().encode(makeReference())
            )

        let data = try SharePendingSendConsumer.encoder().encode(appShare)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        XCTAssertEqual(try decoder.decode(SharePendingShare.self, from: data), makeReference())
    }

    // MARK: - Emplacements et dérivation

    /// Les deux côtés doivent viser le MÊME répertoire, sinon l'app relit un
    /// dossier que personne ne remplit — reproduction exacte du défaut
    /// `recent_contacts` déjà corrigé.
    func test_bothSidesAgreeOnTheDirectoryNames() {
        XCTAssertEqual(SharePendingShare.directoryName,
                       SharePendingSendConsumer.directoryName)
        XCTAssertEqual(SharePendingShare.mediaDirectoryName,
                       SharePendingSendConsumer.mediaDirectoryName)
        XCTAssertEqual(SharePendingShare.mediaDirectoryName, "share_pending_media")
    }

    func test_bothSidesAgreeOnTheAppGroup() {
        XCTAssertEqual(SharePendingShare.appGroupIdentifier,
                       SharePendingSendConsumer.appGroupIdentifier)
        XCTAssertEqual(SharePendingShare.appGroupIdentifier, "group.me.meeshy.apps")
    }

    func test_bothSidesAgreeOnTheVersion() {
        XCTAssertEqual(SharePendingShare.currentVersion,
                       SharePendingSendConsumer.currentVersion)
    }

    func test_bothSidesAgreeOnTheFileName() throws {
        let appShare = try SharePendingSendConsumer.decoder()
            .decode(
                SharePendingSendConsumer.PendingShare.self,
                from: try SharePendingShare.encoder().encode(makeReference())
            )
        XCTAssertEqual(appShare.fileName, makeReference().fileName)
        XCTAssertEqual(appShare.fileName, "cid_00000000-0000-4000-8000-000000000000.json")
    }

    // MARK: - Compatibilité descendante

    /// Un utilisateur peut mettre à jour l'app avec un relais de l'ANCIEN
    /// format encore sur disque. Le jeter perdrait un partage que
    /// l'utilisateur croit envoyé.
    func test_legacyRelay_stillDecodesAsASingleTargetShare() throws {
        let legacy = Data("""
        {"clientMessageId":"cid_legacy","conversationId":"conv7",\
        "content":"salut","createdAt":"2026-07-29T10:00:00Z"}
        """.utf8)

        let share = try XCTUnwrap(SharePendingSendConsumer.decodeRelay(legacy))

        XCTAssertEqual(share.clientMessageId, "cid_legacy")
        XCTAssertEqual(share.content, "salut")
        XCTAssertEqual(share.targets.map(\.conversationId), ["conv7"])
        XCTAssertEqual(share.targets.map(\.state), [.pending])
        XCTAssertEqual(
            share.targets.map(\.clientMessageId), ["cid_legacy"],
            "l'ancien relais postait déjà `cid_legacy` directement (aucune dérivation par index "
            + "n'existait avant ce lot) — la promotion doit le réutiliser TEL QUEL, pas le suffixer"
        )
        XCTAssertTrue(share.media.isEmpty)
        XCTAssertNil(share.originTargetIndex)
    }

    /// Une version INCONNUE n'est pas devinée : la deviner ferait enfiler des
    /// cibles fantômes ou en oublier.
    func test_unknownVersion_isRefused() {
        let future = Data("""
        {"v":99,"clientMessageId":"cid_x","createdAt":"2026-07-29T10:00:00Z",\
        "content":null,"media":[],"targets":[]}
        """.utf8)

        XCTAssertNil(SharePendingSendConsumer.decodeRelay(future))
    }

    func test_corruptPayload_isRefused() {
        XCTAssertNil(SharePendingSendConsumer.decodeRelay(Data("pas du json".utf8)))
    }
}
