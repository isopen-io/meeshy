import XCTest
import MeeshySDK
@testable import Meeshy

/// **Le SECOND déclencheur de « Composer »** (loi 6, lot 5).
///
/// La loi 6 est explicite : « ce n'est pas une dixième porte, c'est un second
/// POINT D'ENTRÉE de `.conversationMedia` — même graine, même éventail ». La
/// feuille de transfert gagne donc une entrée à côté de ses pilules de
/// destination, et cette suite retient ce qui distingue un second point d'entrée
/// d'une seconde porte : **la feuille ne monte pas le meuble**. Elle se referme
/// et rend la main.
@MainActor
final class ForwardPickerComposeEntryTests: XCTestCase {

    private func sheetCode() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Components
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Components/ForwardPickerSheet.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func hostCode() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/ConversationView.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    /// **Garde NÉGATIVE**, doublée de son garde-fou. Sans le second, un chemin
    /// devenu faux rendrait une chaîne vide, et l'assertion passerait au vert en
    /// ayant perdu son objet — le mode d'extinction propre aux gardes négatives.
    func test_laFeuille_neMontePasLeMeuble() throws {
        let code = try sheetCode()

        XCTAssertTrue(
            code.contains("struct ForwardPickerSheet"),
            "Garde-fou : la source lue n'est pas celle de la feuille."
        )
        XCTAssertFalse(
            code.contains("MeeshyComposerHost("),
            "La feuille monterait le meuble elle-même : un SECOND contrat d'envoi, une seconde sortie, une "
                + "seconde reprise hors-ligne — à faire diverger de celle de la porte."
        )
    }

    /// Loi 4 : un contrôle existe s'il a un EFFET. L'entrée « Composer » de la
    /// section « Publier » appelle la fermeture que son hôte lui donne — sans
    /// elle, ce serait un bouton inerte de plus.
    func test_lentreeComposer_appelleSaFermeture() throws {
        let code = try sheetCode()

        XCTAssertTrue(code.contains("var onCompose:"), "La feuille doit RECEVOIR le déclencheur.")
        XCTAssertTrue(
            code.contains("onCompose?()"),
            "L'entrée doit APPELER la fermeture — sinon elle est peinte et ne fait rien."
        )
    }

    /// La feuille se referme AVANT d'appeler sa fermeture : présenter le plein
    /// écran de la porte pendant que la feuille est encore montée est la course
    /// « Attempt to present … which is already presenting » que ce dépôt a déjà
    /// payée deux fois.
    func test_laFeuille_seReferme_avantDAppelerSaFermeture() throws {
        let compact = try sheetCode()
            .components(separatedBy: .whitespacesAndNewlines).joined()

        let dismiss = try XCTUnwrap(
            compact.range(of: "dismiss()onCompose?()"),
            "L'entrée doit exécuter `dismiss()` puis `onCompose?()`, dans cet ordre et sans rien entre eux."
        )
        XCTAssertFalse(dismiss.isEmpty)
    }

    /// L'entrée n'est PAS offerte quand rien ne la ferait agir : le média n'est
    /// pas composable ou pas emportable, ou l'hôte n'a pas branché de fermeture.
    /// Absente, jamais grisée (loi 4).
    ///
    /// **La feuille LIT la règle, elle ne la réécrit pas.** Ce déclencheur et
    /// l'appui long mènent au MÊME plein écran ; la conjonction a vécu ici en
    /// double, dans une `private var` de `View` qu'aucun test de comportement ne
    /// peut voir passer de `&&` à `||`. La garde négative ci-dessous est ce qui
    /// empêche qu'elle y revienne.
    func test_lentree_estGateeSurLaComposabilite_etSurSonHote() throws {
        let code = try sheetCode()

        XCTAssertTrue(
            code.contains("ComposableAttachment.offers(message:"),
            "La feuille doit LIRE la règle d'offre partagée — un audio se publie (`PublicationTargetRule`) "
                + "et ne se compose pas, et une pièce protégée ne s'emporte pas du tout."
        )
        for reecriture in ["isEncrypted", "isBlurred", "isViewOnce",
                           "ComposableAttachment.form(mimeType:"] {
            XCTAssertFalse(
                code.contains(reecriture),
                "La feuille réécrit la règle d'offre (« \(reecriture) ») au lieu de la lire : deux écritures "
                    + "de la même conjonction sont deux règles qui ont déjà commencé à diverger."
            )
        }
        XCTAssertTrue(
            code.contains("onCompose != nil"),
            "Un hôte qui ne branche rien ne doit pas voir l'entrée — un contrôle sans effet est de l'UI morte."
        )
    }

    /// **Une rangée, UNE pièce désignée.**
    ///
    /// La section « Publier » portait DEUX règles d'élection : les pilules
    /// publiaient `attachments.first`, « Composer » composait l'unique pièce
    /// composable, où qu'elle soit. Sur `[document.pdf, photo.jpg]` — un envoi
    /// nominal, `MultiAttachmentSendPlanner` rangeant `.file` et `.image` dans
    /// le MÊME lot — cela donnait un en-tête « Publier » AUCUNE pilule et la
    /// seule entrée « Composer » ; sur `[note vocale, photo.jpg]`, deux
    /// contrôles voisins visant deux médias différents.
    ///
    /// La désignation est désormais unique et LUE de la règle partagée : la
    /// pièce composable quand l'offre tient, la première sinon. Conséquence
    /// mesurable : « Composer » offert ⟹ la pièce désignée est une image ou une
    /// vidéo ⟹ `PublicationTargetRule.targets` n'est jamais vide ⟹ l'en-tête
    /// « Publier » ne peut plus coiffer une rangée sans publication.
    func test_laRangee_designeUneSeulePiece_pourSesDeuxControles() throws {
        let code = try sheetCode()

        XCTAssertTrue(
            code.contains("ComposableAttachment.target(in: message)"),
            "Les pilules doivent viser la pièce que la règle d'offre désigne : deux élections dans une "
                + "rangée, ce sont deux médias différents sous un seul en-tête."
        )
        let designation = try XCTUnwrap(
            code.components(separatedBy: "private var primaryAttachment").dropFirst().first,
            "La désignation a disparu — la garde ne mesurerait RIEN."
        )
        XCTAssertTrue(
            String(designation.prefix(300)).contains("message.attachments.first"),
            "Le repli reste la PREMIÈRE pièce : sans lui, un message sans pièce composable perdrait ses "
                + "pilules (audio, notamment)."
        )
    }

    /// **L'hôte présente le MÊME état que l'appui long.** Deux états auraient
    /// été deux montages de la porte, donc deux contrats à faire diverger — ce
    /// que la loi 6 nomme « un seul chemin de présentation, deux déclencheurs ».
    func test_lHote_promeutLaMemeCible_queLappuiLong() throws {
        let code = try hostCode()

        // `ConversationComposerState` vit dans son propre fichier depuis #4823
        // (dette de taille de l'hôte) : le garde-fou lit la DÉCLARATION de la
        // vue, la seule chose que l'extraction ne peut pas emporter.
        XCTAssertTrue(
            code.contains("struct ConversationView: View"),
            "Garde-fou : la source lue n'est pas celle de l'hôte."
        )
        XCTAssertEqual(
            code.components(separatedBy: "ConversationMediaComposerDoor(").count - 1, 1,
            "L'hôte monte la porte une fois, et une seule : deux montages, deux sorties à tenir d'accord."
        )
        XCTAssertTrue(
            code.contains("composerState.pendingComposeTarget"),
            "Le second déclencheur doit RETENIR sa cible le temps que la feuille se démonte — présenter "
                + "pendant le démontage est la course « already presenting »."
        )
    }
}
