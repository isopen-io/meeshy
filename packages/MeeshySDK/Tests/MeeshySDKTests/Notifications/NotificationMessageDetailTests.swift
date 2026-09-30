import XCTest
@testable import MeeshySDK

/// **Une notification se comprend d'un coup d'œil** (#8856, lot iOS #8858).
///
/// Une position et une carte de visite partaient avec un corps VIDE, une
/// invitation et un lien en URL brute. Ces témoins tiennent le lecteur UNIQUE
/// du détail (charge APNs et événement socket lisent les mêmes clés) et ce que
/// la bannière in-app en rend : pictogramme, corps détaillé, vignette.
final class NotificationMessageDetailTests: XCTestCase {

    private let labels = NotificationMessageDetail.Labels(sharedLocation: "Position partagée", invitation: "Invitation")

    private func makeEvent(context: String = "{}", metadata: String = "null", content: String = "") throws -> SocketNotificationEvent {
        let json = """
        {
            "id": "n1", "userId": "u1", "type": "new_message",
            "title": "Alice", "content": "\(content)",
            "actor": { "id": "a1", "displayName": "Alice" },
            "context": \(context),
            "metadata": \(metadata)
        }
        """
        return try JSONDecoder().decode(SocketNotificationEvent.self, from: Data(json.utf8))
    }

    // MARK: - Lecture de la charge APNs

    func test_init_locationAsStrings_readsCoordinatesAndPlace() {
        let detail = NotificationMessageDetail(userInfo: [
            "locationLat": "48.8584", "locationLon": "2.2945",
            "locationName": "Tour Eiffel", "locationAddress": "Champ de Mars, Paris",
        ])

        XCTAssertEqual(detail, .location(NotificationLocationDetail(
            latitude: 48.8584, longitude: 2.2945, name: "Tour Eiffel", address: "Champ de Mars, Paris")))
        XCTAssertEqual(detail?.categoryIdentifier, "MEESHY_LOCATION")
    }

    func test_init_locationAsNumbers_isReadToo() {
        let detail = NotificationMessageDetail(userInfo: ["locationLat": 4.05, "locationLon": 9.7])
        XCTAssertEqual(detail, .location(NotificationLocationDetail(latitude: 4.05, longitude: 9.7, name: nil, address: nil)))
    }

    func test_init_coordinatesOutOfRange_isNoLocation() {
        XCTAssertNil(NotificationMessageDetail(userInfo: ["locationLat": "123", "locationLon": "2"]))
        XCTAssertNil(NotificationMessageDetail(userInfo: ["locationLat": "abc", "locationLon": "2"]))
        XCTAssertNil(NotificationMessageDetail(userInfo: ["locationLat": "", "locationLon": ""]))
    }

    func test_init_contact_readsNamePhoneEmail() {
        let detail = NotificationMessageDetail(userInfo: [
            "contactName": "Jean Dupont", "contactPhone": "+33 6 12 34 56 78", "contactEmail": " ",
        ])
        XCTAssertEqual(detail, .contact(NotificationContactCard(name: "Jean Dupont", phone: "+33 6 12 34 56 78", email: nil)))
        XCTAssertEqual(detail?.categoryIdentifier, "MEESHY_CONTACT")
    }

    func test_init_inviteWinsOverLink_andKeepsItsCategory() {
        let detail = NotificationMessageDetail(userInfo: [
            "inviteUrl": "https://meeshy.me/join/abc123", "inviteConversationTitle": "Les voisins",
            "inviteMemberCount": "12", "linkUrl": "https://meeshy.me/join/abc123", "linkDomain": "meeshy.me",
        ])
        guard case .invite(let invite) = detail else { return XCTFail("attendu : invitation, reçu \(String(describing: detail))") }
        XCTAssertEqual(invite.url.absoluteString, "https://meeshy.me/join/abc123")
        XCTAssertEqual(invite.conversationTitle, "Les voisins")
        XCTAssertEqual(invite.memberCount, 12)
        XCTAssertEqual(detail?.categoryIdentifier, "MEESHY_INVITE")
    }

    func test_init_link_domainFallsBackToHost_andHasNoCategory() {
        let detail = NotificationMessageDetail(userInfo: ["linkUrl": "https://www.lemonde.fr/article"])
        guard case .link(let link) = detail else { return XCTFail("attendu : lien") }
        XCTAssertEqual(link.domain, "www.lemonde.fr")
        XCTAssertNil(detail?.categoryIdentifier)
    }

    func test_init_linkWithForeignScheme_isRefused() {
        XCTAssertNil(NotificationMessageDetail(userInfo: ["linkUrl": "javascript:alert(1)"]))
        XCTAssertNil(NotificationMessageDetail(userInfo: ["inviteUrl": "file:///etc/passwd"]))
    }

    func test_init_emptyPayload_isNil() {
        XCTAssertNil(NotificationMessageDetail(userInfo: ["type": "new_message", "thumbnailUrl": "https://cdn/t.jpg"]))
    }

    // MARK: - Corps

    func test_summary_followsTheContractForms() {
        XCTAssertEqual(NotificationMessageDetail.location(NotificationLocationDetail(
            latitude: 1, longitude: 2, name: "Tour Eiffel", address: "Paris")).summary(labels: labels),
                       "📍 Tour Eiffel · Paris")
        XCTAssertEqual(NotificationMessageDetail.location(NotificationLocationDetail(
            latitude: 1, longitude: 2, name: nil, address: nil)).summary(labels: labels),
                       "📍 Position partagée")
        XCTAssertEqual(NotificationMessageDetail.contact(NotificationContactCard(
            name: "Jean Dupont", phone: nil, email: nil)).summary(labels: labels), "👤 Jean Dupont")
        XCTAssertEqual(NotificationMessageDetail.invite(NotificationInviteDetail(
            url: URL(string: "https://meeshy.me/join/x")!, conversationTitle: "Les voisins", memberCount: nil))
            .summary(labels: labels), "✉️ Invitation · Les voisins")
        XCTAssertEqual(NotificationMessageDetail.link(NotificationLinkDetail(
            url: URL(string: "https://lemonde.fr/a")!, domain: "lemonde.fr", title: "Le titre", imageURL: nil))
            .summary(labels: labels), "🔗 lemonde.fr — Le titre")
    }

    func test_resolvedBody_replacesAnEmptyOrBareURLBody_keepsAComposedOne() {
        let link = NotificationMessageDetail(userInfo: ["linkUrl": "https://lemonde.fr/a", "linkDomain": "lemonde.fr"])!

        XCTAssertEqual(link.resolvedBody(served: "", labels: labels), "🔗 lemonde.fr")
        XCTAssertEqual(link.resolvedBody(served: "https://lemonde.fr/a", labels: labels), "🔗 lemonde.fr")
        XCTAssertEqual(link.resolvedBody(served: "regarde ça https://lemonde.fr/a", labels: labels),
                       "regarde ça https://lemonde.fr/a")

        let place = NotificationMessageDetail(userInfo: ["locationLat": "1", "locationLon": "2"])!
        XCTAssertEqual(place.resolvedBody(served: "📍 Chez moi", labels: labels), "📍 Chez moi")
        XCTAssertEqual(place.resolvedBody(served: nil, labels: labels), "📍 Position partagée")
    }

    func test_mapsURL_pinsTheCoordinatesAndTheName() throws {
        let place = NotificationLocationDetail(latitude: 48.8584, longitude: 2.2945, name: "Tour Eiffel", address: nil)
        let components = try XCTUnwrap(URLComponents(url: XCTUnwrap(place.mapsURL), resolvingAgainstBaseURL: false))
        XCTAssertEqual(components.host, "maps.apple.com")
        XCTAssertEqual(components.queryItems?.first(where: { $0.name == "ll" })?.value, "48.8584,2.2945")
        XCTAssertEqual(components.queryItems?.first(where: { $0.name == "q" })?.value, "Tour Eiffel")
    }

    // MARK: - Bannière in-app

    func test_banner_location_saysThePinInTheBodyOnly() throws {
        let event = try makeEvent(context: """
        { "conversationId": "c1", "conversationType": "direct", "messageType": "text",
          "locationLat": 48.8584, "locationLon": "2.2945", "locationName": "Tour Eiffel" }
        """)
        let banner = event.bannerPresentation()
        XCTAssertNil(banner.contentSymbol, "le « 📍 » du corps le dit déjà (#8897)")
        XCTAssertEqual(banner.body, "📍 Tour Eiffel")
    }

    func test_banner_contact_saysTheNameInTheBodyOnly() throws {
        let event = try makeEvent(context: """
        { "conversationId": "c1", "conversationType": "direct", "contactName": "Jean Dupont" }
        """, metadata: """
        { "attachments": { "count": 1, "firstType": "document", "firstFilename": "jean.vcf" } }
        """)
        let banner = event.bannerPresentation()
        XCTAssertNil(banner.contentSymbol)
        XCTAssertEqual(banner.body, "👤 Jean Dupont")
    }

    func test_banner_invite_keepsTheServerComposedBody() throws {
        let event = try makeEvent(context: """
        { "conversationId": "c1", "conversationType": "direct",
          "inviteUrl": "https://meeshy.me/join/abc", "inviteConversationTitle": "Les voisins" }
        """, content: "✉️ Invitation · Les voisins")
        let banner = event.bannerPresentation()
        XCTAssertNil(banner.contentSymbol)
        XCTAssertEqual(banner.body, "✉️ Invitation · Les voisins")
    }

    func test_banner_link_showsItsPreviewImage() throws {
        let event = try makeEvent(context: """
        { "conversationId": "c1", "conversationType": "direct", "linkUrl": "https://lemonde.fr/a",
          "linkDomain": "lemonde.fr", "linkTitle": "Le titre", "linkImageUrl": "https://cdn/og.jpg" }
        """, content: "https://lemonde.fr/a")
        let banner = event.bannerPresentation()
        XCTAssertNil(banner.contentSymbol, "la vignette montre le lien, le « 🔗 » le nomme")
        XCTAssertEqual(banner.body, "🔗 lemonde.fr — Le titre")
        XCTAssertEqual(banner.thumbnailURL, "https://cdn/og.jpg")
    }

    func test_banner_sticker_hasNoSymbolTile() throws {
        let event = try makeEvent(context: """
        { "conversationId": "c1", "conversationType": "direct", "messageType": "sticker" }
        """, content: "🐱 Sticker")
        XCTAssertFalse(event.bannerPresentation().showsContentTile, "« 🐱 Sticker » se dit dans le corps (#8897)")
    }

    func test_banner_video_showsItsThumbnail_neverTheFile() throws {
        let event = try makeEvent(context: """
        { "conversationId": "c1", "conversationType": "direct", "firstAttachmentUrl": "https://cdn/v.mp4",
          "firstAttachmentMimeType": "video/mp4", "thumbnailUrl": "https://cdn/v-thumb.jpg" }
        """, metadata: """
        { "attachments": { "count": 1, "firstType": "video" } }
        """, content: "🎥 Vidéo · 0:12")
        let banner = event.bannerPresentation()
        XCTAssertEqual(banner.thumbnailURL, "https://cdn/v-thumb.jpg")
        XCTAssertNil(banner.contentSymbol)
    }

    /// Le SECOND verrou : un message qui DÉCLARE une protection ne montre ni
    /// détail ni vignette, même si une clé a voyagé par erreur.
    func test_banner_protectedMessage_showsNoDetailNorThumbnail() throws {
        let event = try makeEvent(context: """
        { "conversationId": "c1", "conversationType": "direct", "notificationLocKey": "notification.view_once_message",
          "locationLat": "48.8", "locationLon": "2.2", "locationName": "Chez moi",
          "firstAttachmentMimeType": "video/mp4", "thumbnailUrl": "https://cdn/secret.jpg" }
        """, content: "👁️ 📍")
        let banner = event.bannerPresentation()
        XCTAssertNil(event.messageDetail)
        XCTAssertEqual(banner.body, "👁️ 📍")
        XCTAssertNil(banner.thumbnailURL)
        XCTAssertFalse(banner.showsContentTile)
    }

    func test_banner_detailInMetadata_isTheFallback() throws {
        let event = try makeEvent(metadata: """
        { "contactName": "Awa Diallo" }
        """)
        XCTAssertEqual(event.bannerPresentation().body, "👤 Awa Diallo")
    }

    /// La forme RÉELLE du fil socket (#8857) : `context.contentDetail`, objet
    /// imbriqué `NotificationContentDetail`, que la passerelle n'aplatit que
    /// pour le push.
    func test_banner_nestedContentDetail_isReadLikeTheFlatPushKeys() throws {
        let location = try makeEvent(context: """
        { "conversationType": "direct", "messageType": "text",
          "contentDetail": { "location": { "latitude": 48.8584, "longitude": 2.2945, "name": "Tour Eiffel", "address": null } } }
        """)
        XCTAssertEqual(location.bannerPresentation().body, "📍 Tour Eiffel")
        XCTAssertEqual(location.messageDetail?.categoryIdentifier, "MEESHY_LOCATION")

        let invite = try makeEvent(context: """
        { "conversationType": "direct",
          "contentDetail": { "invite": { "url": "https://meeshy.me/join/abc", "conversationTitle": "Les voisins", "memberCount": 12 } } }
        """)
        guard case .invite(let detail) = invite.messageDetail else { return XCTFail("attendu : invitation") }
        XCTAssertEqual(detail.memberCount, 12)

        let sticker = try makeEvent(context: """
        { "conversationType": "direct", "messageType": "text", "contentDetail": { "sticker": { "emoji": "🐱" } } }
        """, content: "🐱 Sticker")
        XCTAssertEqual(sticker.bannerPresentation().contentSymbol, "face.smiling.inverse")

        let video = try makeEvent(context: """
        { "conversationType": "direct", "firstAttachmentMimeType": "video/mp4",
          "contentDetail": { "videoThumbnailUrl": "https://cdn/t.jpg", "storyReply": { "authorId": null } } }
        """)
        XCTAssertEqual(video.bannerPresentation().thumbnailURL, "https://cdn/t.jpg")
        XCTAssertEqual(video.detailFields["storyReply"], "1")
    }

    func test_banner_ordinaryMessage_isUnchanged() throws {
        let event = try makeEvent(context: """
        { "conversationId": "c1", "conversationType": "direct" }
        """, content: "Salut !")
        let banner = event.bannerPresentation()
        XCTAssertEqual(banner.body, "Salut !")
        XCTAssertNil(event.messageDetail)
    }
}
