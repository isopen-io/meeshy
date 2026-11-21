import XCTest
import Foundation
import MeeshySDK
@testable import MeeshyUI

@MainActor
final class JoinFlowCopyTests: XCTestCase {

    private static let languages = ["fr", "en", "de", "es", "pt-BR", "it", "ar"]

    private func lproj(_ code: String) throws -> Bundle {
        let path = try XCTUnwrap(
            Bundle.module.path(forResource: code, ofType: "lproj"),
            "\(code).lproj absent de Bundle.module"
        )
        return try XCTUnwrap(Bundle(path: path))
    }

    func test_joinedSentence_substitueTitreEtPseudo() throws {
        XCTAssertEqual(
            JoinFlowCopy.joinedSentence(conversationTitle: "Lisbonne", username: "aiko", in: try lproj("fr")),
            "Vous avez rejoint Lisbonne en tant que aiko"
        )
        XCTAssertEqual(
            JoinFlowCopy.joinedSentence(conversationTitle: nil, username: "aiko", in: try lproj("fr")),
            "Vous avez rejoint la conversation en tant que aiko"
        )
        XCTAssertEqual(
            JoinFlowCopy.joinedSentence(conversationTitle: "Lisbonne", username: "aiko", in: try lproj("en")),
            "You joined Lisbonne as aiko"
        )
    }

    func test_joinedSentence_neRendJamaisLaCleBruteDansLesSeptLangues() throws {
        for code in Self.languages {
            let sentence = JoinFlowCopy.joinedSentence(conversationTitle: "T", username: "u", in: try lproj(code))
            XCTAssertFalse(sentence.contains("joinFlow.success"), code)
            XCTAssertTrue(sentence.contains("T") && sentence.contains("u"), code)
        }
    }

    func test_loadFailure_mappeLesStatuts() throws {
        let bundle = try lproj("fr")

        XCTAssertEqual(
            JoinFlowCopy.loadFailure(MeeshyError.server(statusCode: 404, message: "x"), in: bundle),
            "Ce lien de conversation est introuvable"
        )
        XCTAssertEqual(JoinFlowCopy.loadFailure(MeeshyError.server(statusCode: 410, message: "fermé"), in: bundle), "fermé")
        XCTAssertEqual(
            JoinFlowCopy.loadFailure(NSError(domain: "t", code: 1), in: bundle),
            "Impossible de charger les informations du lien"
        )
    }

    func test_joinFailure_mappeLesStatuts() throws {
        let bundle = try lproj("fr")

        XCTAssertEqual(JoinFlowCopy.joinFailure(MeeshyError.server(statusCode: 409, message: "pris"), in: bundle), "pris")
        XCTAssertEqual(JoinFlowCopy.joinFailure(MeeshyError.server(statusCode: 410, message: "expiré"), in: bundle), "expiré")
        XCTAssertEqual(
            JoinFlowCopy.joinFailure(MeeshyError.server(statusCode: 429, message: "x"), in: bundle),
            "Trop d'utilisateurs connectés"
        )
        XCTAssertEqual(
            JoinFlowCopy.joinFailure(NSError(domain: "t", code: 1), in: bundle),
            "Erreur inattendue"
        )
    }

    func test_isGone_onlyForALinkThatIsNoLongerValid() {
        XCTAssertTrue(JoinFlowCopy.isGone(MeeshyError.server(statusCode: 410, message: "Ce lien a expire")),
                      "expiré, éteint ou plein : le lien n'est plus valable (planche Etat-Erreur vue 3)")
        XCTAssertFalse(JoinFlowCopy.isGone(MeeshyError.server(statusCode: 404, message: "x")))
        XCTAssertFalse(JoinFlowCopy.isGone(MeeshyError.server(statusCode: 500, message: "x")), "une panne se réessaie")
        XCTAssertFalse(JoinFlowCopy.isGone(URLError(.notConnectedToInternet)))
    }

    func test_goneCopy_isTranslatedInTheSevenLanguages() throws {
        for code in Self.languages {
            let bundle = try lproj(code)
            XCTAssertNotEqual(JoinFlowCopy.goneTitle(in: bundle), "joinFlow.gone.title", code)
            XCTAssertNotEqual(JoinFlowCopy.goneMessage(in: bundle), "joinFlow.gone.message", code)
        }
        XCTAssertEqual(JoinFlowCopy.goneTitle(in: try lproj("fr")), "Ce lien n'est plus valable")
    }

    func test_goneMessage_namesTheCreatorWhenThePreviewServedHim() throws {
        let french = try lproj("fr")

        XCTAssertEqual(JoinFlowCopy.goneMessage(creatorFirstName: "Aïssa", in: french), "Demande un nouveau lien à Aïssa.")
        XCTAssertEqual(JoinFlowCopy.goneMessage(creatorFirstName: nil, in: french), JoinFlowCopy.goneMessage(in: french))
        XCTAssertEqual(JoinFlowCopy.goneMessage(creatorFirstName: "Aïssa", in: try lproj("en")), "Ask Aïssa for a new link.")
    }

    func test_goneLinkCopy_isTranslatedInTheSevenLanguages() throws {
        for code in Self.languages {
            let bundle = try lproj(code)
            let named = JoinFlowCopy.goneMessage(creatorFirstName: "Aïssa", in: bundle)
            XCTAssertTrue(named.contains("Aïssa") && !named.contains("joinFlow."), "\(code) : \(named)")
            let label = JoinFlowCopy.goneTicketLabel(title: "Studio", address: "meeshy.me/chat/s", in: bundle)
            XCTAssertTrue(label.contains("Studio") && label.contains("meeshy.me/chat/s"), "\(code) : \(label)")
            XCTAssertNotEqual(JoinFlowCopy.goneInvitation(in: bundle), "joinFlow.gone.invitation", code)
            XCTAssertNotEqual(JoinFlowCopy.goneCreatorCaption(in: bundle), "joinFlow.gone.creatorRole", code)
        }
    }
}
