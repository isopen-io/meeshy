import XCTest
@testable import Meeshy

/// Au moment de l'enfilage, la cible d'origine n'a pas encore été envoyée :
/// son identifiant SERVEUR n'existe pas. La ligne d'outbox porte donc un
/// identifiant LOCAL, que le dispatcher résout au moment de partir.
///
/// Sans cette résolution, deux issues également mauvaises : envoyer sans le
/// champ (le destinataire recevrait un message VIDE de pièces jointes), ou
/// abandonner la ligne (la cible serait perdue sans trace).
final class ShareFanoutOriginResolverTests: XCTestCase {

    func test_resolve_withoutAFanoutField_isNotAFanout() {
        XCTAssertEqual(
            ShareFanoutOriginResolver.resolve(
                copyAttachmentsFromClientMessageId: nil, resolvedServerId: nil),
            .notAFanout
        )
    }

    /// Un identifiant serveur connu par erreur ne transforme pas un envoi
    /// ordinaire en fan-out.
    func test_resolve_withoutAFanoutField_ignoresAStrayServerId() {
        XCTAssertEqual(
            ShareFanoutOriginResolver.resolve(
                copyAttachmentsFromClientMessageId: nil, resolvedServerId: "srv1"),
            .notAFanout
        )
    }

    func test_resolve_withAnAcknowledgedOrigin_isReady() {
        XCTAssertEqual(
            ShareFanoutOriginResolver.resolve(
                copyAttachmentsFromClientMessageId: "cid_abc_t0", resolvedServerId: "srv1"),
            .ready(serverMessageId: "srv1")
        )
    }

    /// L'origine n'est pas encore acquittée : la ligne doit ATTENDRE, pas
    /// partir amputée. Le dispatcher lève, l'outbox réessaie en backoff.
    func test_resolve_withAnUnacknowledgedOrigin_waits() {
        XCTAssertEqual(
            ShareFanoutOriginResolver.resolve(
                copyAttachmentsFromClientMessageId: "cid_abc_t0", resolvedServerId: nil),
            .waitingForOrigin(clientMessageId: "cid_abc_t0")
        )
    }

    /// Un identifiant serveur vide n'est pas un identifiant : le laisser
    /// passer enverrait `copyAttachmentsFromMessageId: ""`, que Prisma rejette
    /// sur un `@db.ObjectId`.
    func test_resolve_withAnEmptyServerId_waits() {
        XCTAssertEqual(
            ShareFanoutOriginResolver.resolve(
                copyAttachmentsFromClientMessageId: "cid_abc_t0", resolvedServerId: ""),
            .waitingForOrigin(clientMessageId: "cid_abc_t0")
        )
    }

    // MARK: - Garde de source : le dispatcher ne transfère JAMAIS un partage

    private var dispatcherSource: String {
        get throws {
            try String(
                contentsOf: URL(fileURLWithPath: #filePath)
                    .deletingLastPathComponent()   // Share
                    .deletingLastPathComponent()   // Unit
                    .deletingLastPathComponent()   // MeeshyTests
                    .deletingLastPathComponent()   // ios
                    .appendingPathComponent(
                        "Meeshy/Features/Main/Services/OutboxDispatcher.swift"),
                encoding: .utf8
            )
        }
    }

    /// Un partage multi-destinataires COPIE. Le jour où quelqu'un « simplifie »
    /// en réutilisant le chemin de transfert déjà présent dans ce fichier, ce
    /// garde rougit — et pas un destinataire mécontent.
    func test_dispatcher_wiresTheCopyModeForFanout() throws {
        let source = try dispatcherSource
        XCTAssertTrue(source.contains("copyAttachmentsFromMessageId:"),
                      "le dispatcher doit passer le mode COPIE au corps d'envoi")
        XCTAssertTrue(source.contains("ShareFanoutOriginResolver.resolve"),
                      "l'origine doit être résolue, jamais devinée")
    }

    /// Le champ de fan-out ne doit JAMAIS être branché sur `forwardedFromId` :
    /// c'est exactement le raccourci qui ferait fuiter le nom de la première
    /// conversation vers la seconde.
    func test_dispatcher_neverBindsTheFanoutOriginToForwardedFromId() throws {
        XCTAssertFalse(
            try dispatcherSource.contains("forwardedFromId: item.copyAttachmentsFromClientMessageId"),
            "un partage vers « Famille » puis « Collègues » révélerait « Famille » aux collègues"
        )
    }
}
