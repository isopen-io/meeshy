import XCTest
import Foundation
import MeeshySDK
@testable import MeeshyUI

/// Planche `Etat-Erreur` vue 3 : « Ce lien n'est plus valable » dit QUEL lien (le billet barré) et QUI l'a créé
/// quand l'aperçu l'a servi ; sans aperçu, l'écran garde son bloc d'état et ne fabrique rien.
final class JoinFlowGoneLinkTests: XCTestCase {

    private static func info(conversationTitle: String?, name: String? = nil, creator: String) throws -> ShareLinkInfo {
        let title = conversationTitle.map { #","title":"\#($0)""# } ?? ""
        let linkName = name.map { #","name":"\#($0)""# } ?? ""
        let json = #"{"id":"l1","linkId":"studio-invites"\#(linkName),"conversation":{"id":"c1","type":"group","createdAt":"2026-09-30T12:00:00.000Z"\#(title)},"creator":\#(creator),"stats":{}}"#
        return try MeeshyCoders.decoder(.api).decode(ShareLinkInfo.self, from: Data(json.utf8))
    }

    func test_init_withoutAPreview_isNil() {
        XCTAssertNil(JoinFlowGoneLink(info: nil), "un lien mort dès l'ouverture n'a rien à montrer de lui")
    }

    func test_init_carriesTheConversationTitleTheLinkAndItsCreator() throws {
        let info = try Self.info(conversationTitle: "Studio — invités",
                                 creator: #"{"username":"aissa","firstName":"Aïssa","lastName":"Ndiaye"}"#)

        let gone = try XCTUnwrap(JoinFlowGoneLink(info: info))

        XCTAssertEqual(gone.title, "Studio — invités")
        XCTAssertEqual(gone.linkId, "studio-invites")
        XCTAssertEqual(gone.creator?.name, "Aïssa Ndiaye")
        XCTAssertEqual(gone.creator?.firstName, "Aïssa")
        XCTAssertEqual(gone.creator?.username, "aissa")
    }

    func test_init_fallsBackToTheLinkName_thenToNoTitle() throws {
        let named = try XCTUnwrap(JoinFlowGoneLink(info: try Self.info(conversationTitle: "  ", name: "Soirée",
                                                                         creator: #"{"username":"aissa"}"#)))
        XCTAssertEqual(named.title, "Soirée")

        let untitled = try XCTUnwrap(JoinFlowGoneLink(info: try Self.info(conversationTitle: nil,
                                                                           creator: #"{"username":"aissa"}"#)))
        XCTAssertNil(untitled.title)
    }

    func test_creator_withoutFirstName_isCalledByTheFirstWordOfHisName_thenByHisUsername() throws {
        let displayed = try XCTUnwrap(JoinFlowGoneLink(info: try Self.info(
            conversationTitle: nil, creator: #"{"username":"aissa","displayName":"Aïssa N."}"#)))
        XCTAssertEqual(displayed.creator?.firstName, "Aïssa")

        let bare = try XCTUnwrap(JoinFlowGoneLink(info: try Self.info(conversationTitle: nil,
                                                                       creator: #"{"username":"aissa"}"#)))
        XCTAssertEqual(bare.creator?.firstName, "aissa")
    }

    func test_creator_withAnEmptyUsername_isAbsent() throws {
        let gone = try XCTUnwrap(JoinFlowGoneLink(info: try Self.info(conversationTitle: "T",
                                                                       creator: #"{"username":" "}"#)))
        XCTAssertNil(gone.creator, "aucune carte « a créé ce lien » sans personne à y nommer")
    }
}
