import XCTest
import MeeshySDK
@testable import Meeshy

/// #8103 — **chaque segment ne garde que ce qui est le sien.** La passerelle
/// sert des messages ; l'écran montre des éléments, partitionnés comme la
/// clause serveur.
@MainActor
final class ConversationMediaHubRulesTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func piece(_ id: String, mime: String, name: String = "", viewOnce: Bool = false) -> MeeshyMessageAttachment {
        var attachment = MeeshyMessageAttachment(id: id, originalName: name, mimeType: mime)
        attachment.isViewOnce = viewOnce
        return attachment
    }

    private func message(_ id: String, at offset: TimeInterval = 0, content: String = "",
                         attachments: [MeeshyMessageAttachment] = [], location: SharedPlace? = nil) -> MeeshyMessage {
        MeeshyMessage(id: id, conversationId: "c", content: content,
                      createdAt: Date(timeIntervalSince1970: 1_700_000_000 + offset),
                      attachments: attachments, senderName: "Ana", location: location)
    }

    private func items(_ carriers: [MeeshyMessage], _ kind: ConversationMediaKind, hidden: Set<String> = []) -> [ConversationMediaHubItem] {
        ConversationMediaHubRules.items(of: carriers, kind: kind, now: now, isHidden: { hidden.contains($0) })
    }

    func test_items_mixedMessage_eachSegmentKeepsOnlyItsOwnPiece() {
        let mixed = message("m1", attachments: [piece("photo", mime: "image/jpeg"), piece("pdf", mime: "application/pdf"),
                                                piece("voice", mime: "audio/m4a"), piece("card", mime: "text/vcard")])

        XCTAssertEqual(items([mixed], .visual).map(\.id), ["m1:photo"])
        XCTAssertEqual(items([mixed], .document).map(\.id), ["m1:pdf"])
        XCTAssertEqual(items([mixed], .audio).map(\.id), ["m1:voice"])
        XCTAssertEqual(items([mixed], .contact).map(\.id), ["m1:card"])
    }

    func test_items_viewOnceAtMessageOrPiece_isNeverListed() {
        let viewOncePiece = message("m1", attachments: [piece("a", mime: "image/png", viewOnce: true)])
        var viewOnceMessage = message("m2", attachments: [piece("b", mime: "image/png")])
        viewOnceMessage.isViewOnce = true

        XCTAssertTrue(items([viewOncePiece, viewOnceMessage], .visual).isEmpty)
    }

    func test_items_deletedHiddenOrExpired_areExcluded() {
        var deleted = message("m1", attachments: [piece("a", mime: "image/png")])
        deleted.deletedAt = now
        var expired = message("m2", attachments: [piece("b", mime: "image/png")])
        expired.expiresAt = now.addingTimeInterval(-1)
        let hidden = message("m3", attachments: [piece("c", mime: "image/png")])

        XCTAssertTrue(items([deleted, expired, hidden], .visual, hidden: ["m3"]).isEmpty)
    }

    func test_items_areOrderedNewestFirst() {
        let old = message("old", at: 1, attachments: [piece("a", mime: "image/png")])
        let recent = message("new", at: 9, attachments: [piece("b", mime: "image/png")])

        XCTAssertEqual(items([old, recent], .visual).map(\.messageId), ["new", "old"])
    }

    func test_items_links_listEveryWebUrlOnce() {
        let carrier = message("m1", content: "voir https://example.com/a et https://example.com/a puis http://meeshy.me/c/abc")

        let links = items([carrier], .link)

        XCTAssertEqual(links.count, 2)
        XCTAssertEqual(links.first?.payload, .link(url: "https://example.com/a", host: "example.com", conversation: nil))
    }

    func test_items_conversation_keepsOnlyMeeshyConversationAddresses() {
        let carrier = message("m1", content: "https://example.com https://meeshy.me/join/lnk42 meeshy://c/abc123")

        let conversations = items([carrier], .conversation)

        XCTAssertEqual(conversations.count, 2, "\(conversations.map(\.id))")
        guard case .link(_, _, let target) = conversations.first?.payload else { return XCTFail("pas un lien") }
        XCTAssertEqual(target, .shareLink(identifier: "lnk42"))
    }

    func test_items_location_readsTheHoistedPlaceOrALocationPiece() {
        let place = SharedPlace(latitude: 48.85, longitude: 2.35, name: "Paris")
        let hoisted = message("m1", at: 2, location: place)
        var pin = MeeshyMessageAttachment(id: "loc", originalName: "Lyon", mimeType: "application/x-location")
        pin.latitude = 45.76
        pin.longitude = 4.83
        let pinned = message("m2", at: 1, attachments: [pin])

        let places = items([hoisted, pinned], .location)

        XCTAssertEqual(places.count, 2)
        XCTAssertEqual(places.first?.payload, .place(place))
        XCTAssertTrue(items([pinned], .document).isEmpty, "un lieu en pièce n'est pas un document")
    }

    func test_matches_searchesContentAndFileNameWithoutCaseOrAccents() {
        let carrier = message("m1", content: "La Réunion de lundi", attachments: [piece("a", mime: "application/pdf", name: "Facture-Été.pdf")])

        XCTAssertTrue(ConversationMediaHubRules.matches(carrier, query: "reunion"))
        XCTAssertTrue(ConversationMediaHubRules.matches(carrier, query: "facture-ete"))
        XCTAssertFalse(ConversationMediaHubRules.matches(carrier, query: "budget"))
    }
}
