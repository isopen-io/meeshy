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

    /// Commentaires ET littéraux de chaîne masqués — round 1 de revue,
    /// Important 2 : un `.contains()` sur le fichier BRUT rougit sur un
    /// commentaire qui CITE le motif cherché, et un simple retour à ligne
    /// entre un label et son argument (`forwardedFromId:\n    item…`) suffit
    /// à faire disparaître un `.contains()` littéral sans rien changer au
    /// comportement réel. `ShareSourceCommentStripping` délègue à
    /// `DeclarationBodyScanner.mask(_:)` — le seul masqueur du dépôt qui gère
    /// correctement l'état « dans une chaîne » (voir sa doc).
    private func maskedDispatcherSource() throws -> String {
        ShareSourceCommentStripping.strippingComments(try dispatcherSource)
    }

    /// Résout, en suivant UN SEUL niveau d'alias local (`let x = <expr>` /
    /// `var x = <expr>`), l'expression réellement passée à un paramètre
    /// ÉTIQUETÉ d'un appel — pour que la garde reste robuste à un renommage
    /// qui contournerait un `.contains()` littéral
    /// (`let sourceMessageId = item.copyAttachmentsFromClientMessageId; …;
    /// forwardedFromId: sourceMessageId`). `\s*` dans le motif du label
    /// absorbe aussi un retour à la ligne entre `label:` et son argument.
    ///
    /// Recherche non bornée à un scope : suffisant pour les deux
    /// contournements exacts construits par la revue (un seul alias, une
    /// seule fonction concernée dans ce fichier) — pas une analyse statique
    /// générale.
    private func resolvedArgument(forLabel label: String, in source: String) -> String? {
        guard let labelRange = source.range(of: "\(label)\\s*:", options: .regularExpression)
        else { return nil }

        let afterLabel = source[labelRange.upperBound...].drop(while: { $0.isWhitespace })
        let argument = String(afterLabel.prefix(while: {
            $0.isLetter || $0.isNumber || $0 == "_" || $0 == "."
        }))
        guard !argument.isEmpty else { return nil }

        // Chemin qualifié (`item.forwardedFromId`) : ce n'est PAS un
        // identifiant local qu'un `let`/`var` pourrait aliaser — rien à
        // résoudre plus loin.
        guard !argument.contains(".") else { return argument }

        // Identifiant nu : suit le seul alias local qui peut l'avoir
        // introduit avant le site d'appel.
        guard let aliasRange = source.range(
            of: "(?:let|var)\\s+\(argument)\\s*=", options: .regularExpression
        ) else { return argument }

        let rhs = source[aliasRange.upperBound...].prefix(while: { $0 != "\n" })
        return rhs.trimmingCharacters(in: .whitespaces)
    }

    /// Un partage multi-destinataires COPIE. Le jour où quelqu'un « simplifie »
    /// en réutilisant le chemin de transfert déjà présent dans ce fichier, ce
    /// garde rougit — et pas un destinataire mécontent.
    func test_dispatcher_wiresTheCopyModeForFanout() throws {
        let source = try maskedDispatcherSource()
        XCTAssertNotNil(
            source.range(of: "copyAttachmentsFromMessageId\\s*:", options: .regularExpression),
            "le dispatcher doit passer le mode COPIE au corps d'envoi"
        )
        XCTAssertNotNil(
            source.range(of: "ShareFanoutOriginResolver\\s*\\.\\s*resolve", options: .regularExpression),
            "l'origine doit être résolue, jamais devinée"
        )
    }

    /// Le champ de fan-out ne doit JAMAIS être branché sur `forwardedFromId` :
    /// c'est exactement le raccourci qui ferait fuiter le nom de la première
    /// conversation vers la seconde.
    ///
    /// Round 1 de revue, Important 2 — la garde d'origine faisait un
    /// `.contains()` exact sur `"forwardedFromId: item.copyAttachmentsFromClientMessageId"` :
    /// contournable par UN alias local (`let sourceMessageId = item
    /// .copyAttachmentsFromClientMessageId; …; forwardedFromId: sourceMessageId`)
    /// ou par un simple retour à la ligne entre le label et l'argument. Les
    /// deux contournements exacts construits par la revue sont couverts par
    /// `resolvedArgument(forLabel:in:)`, qui résout l'expression réellement
    /// liée plutôt que de chercher une sous-chaîne figée.
    func test_dispatcher_neverBindsTheFanoutOriginToForwardedFromId() throws {
        let source = try maskedDispatcherSource()
        let resolved = try XCTUnwrap(
            resolvedArgument(forLabel: "forwardedFromId", in: source),
            "le dispatcher doit toujours passer un forwardedFromId au corps d'envoi"
        )
        XCTAssertFalse(
            resolved.contains("copyAttachmentsFromClientMessageId"),
            "un partage vers « Famille » puis « Collègues » révélerait « Famille » aux collègues"
        )
    }
}
