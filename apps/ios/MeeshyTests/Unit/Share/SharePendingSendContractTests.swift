import XCTest
@testable import Meeshy

/// Le relais différé traverse une frontière de process : l'extension écrit
/// (`SharePendingSend`, cible MeeshyShareExtension) et l'app relit
/// (`SharePendingSendConsumer.PendingSend`, cible Meeshy). Les deux cibles ne
/// peuvent pas partager un type — l'extension est délibérément sans dépendance
/// SDK — donc le contrat est dupliqué, comme l'est déjà
/// `ConversationSnapshotPayload` / `ConversationLocalSnapshot` côté NSE.
///
/// Ce bundle de tests compile LES DEUX. C'est le seul endroit du dépôt où la
/// dérive entre les deux miroirs peut être attrapée mécaniquement.
final class SharePendingSendContractTests: XCTestCase {

    private let reference = SharePendingSend(
        clientMessageId: "cid_00000000-0000-4000-8000-000000000000",
        conversationId: "conv42",
        content: "bonjour",
        createdAt: Date(timeIntervalSince1970: 1_785_000_000)
    )

    func test_payloadWrittenByExtension_decodesInTheApp() throws {
        let data = try SharePendingSend.encoder().encode(reference)

        let decoded = try SharePendingSendConsumer.decoder()
            .decode(SharePendingSendConsumer.PendingSend.self, from: data)

        XCTAssertEqual(decoded.clientMessageId, reference.clientMessageId)
        XCTAssertEqual(decoded.conversationId, reference.conversationId)
        XCTAssertEqual(decoded.content, reference.content)
        XCTAssertEqual(
            decoded.createdAt.timeIntervalSince1970,
            reference.createdAt.timeIntervalSince1970,
            accuracy: 1
        )
    }

    /// Les deux côtés doivent viser le MÊME répertoire, sinon l'app relit un
    /// dossier que personne ne remplit — reproduction exacte du défaut
    /// `recent_contacts` qu'on est en train de corriger.
    func test_bothSidesAgreeOnTheDirectoryName() {
        XCTAssertEqual(
            SharePendingSend.directoryName,
            SharePendingSendConsumer.directoryName
        )
    }

    func test_bothSidesAgreeOnTheAppGroup() {
        XCTAssertEqual(
            SharePendingSend.appGroupIdentifier,
            SharePendingSendConsumer.appGroupIdentifier
        )
        XCTAssertEqual(SharePendingSend.appGroupIdentifier, "group.me.meeshy.apps")
    }

    /// Le nom de fichier EST le `clientMessageId` : deux écritures du même
    /// envoi ne peuvent pas produire deux relais, donc pas deux messages.
    func test_fileName_isDerivedFromClientMessageId() {
        XCTAssertEqual(reference.fileName, "cid_00000000-0000-4000-8000-000000000000.json")
    }
}
