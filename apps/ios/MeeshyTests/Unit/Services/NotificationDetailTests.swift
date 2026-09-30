import XCTest
import Contacts
import UserNotifications
import MeeshySDK
@testable import Meeshy

/// **Le DÉTAIL d'un message notifié, de la charge au geste** (#8858, sous-lot
/// iOS de #8856).
///
/// Une position et une carte de visite arrivaient avec un corps vide, une
/// invitation en URL brute, et la seule action offerte était « Répondre ».
/// Ces témoins tiennent la politique (protection, catégorie, vignette, corps,
/// délai de carte), les catégories enregistrées, et le routage des trois
/// nouveaux gestes — Plans, Contacts, Rejoindre.
@MainActor
final class NotificationDetailTests: XCTestCase {

    private let labels = NotificationMessageDetail.Labels(sharedLocation: "Position partagée", invitation: "Invitation")

    private func locationPayload(_ extra: [String: Any] = [:]) -> [AnyHashable: Any] {
        ["type": "new_message", "conversationId": "c1", "messageId": "m1",
         "locationLat": "48.8584", "locationLon": "2.2945", "locationName": "Tour Eiffel"]
            .merging(extra) { _, new in new }
    }

    private func contactPayload() -> [AnyHashable: Any] {
        ["type": "new_message", "conversationId": "c1", "messageId": "m1",
         "contactName": "Jean Dupont", "contactPhone": "+33612345678", "contactEmail": "jean@exemple.fr"]
    }

    private func invitePayload() -> [AnyHashable: Any] {
        ["type": "new_message", "conversationId": "c1", "messageId": "m1",
         "inviteUrl": "https://meeshy.me/join/abc123", "inviteConversationTitle": "Les voisins"]
    }

    // MARK: - Politique : le second verrou de protection

    func test_detail_protectedByLocKey_isNil() {
        XCTAssertNil(NotificationDetailPolicy.detail(userInfo: locationPayload(
            ["notificationLocKey": "notification.view_once_message"])))
    }

    func test_detail_ephemeralOrBlurredOrViewOnceFlags_isNil() {
        for flags in ["1", "2", "4"] {
            XCTAssertNil(NotificationDetailPolicy.detail(userInfo: contactPayload()
                .merging(["effectFlags": flags]) { _, new in new }), "effectFlags=\(flags)")
        }
    }

    func test_detail_appearanceOnlyFlags_doNotHideTheDetail() {
        XCTAssertNotNil(NotificationDetailPolicy.detail(userInfo: locationPayload(["effectFlags": "8"])))
    }

    // MARK: - Politique : la catégorie

    func test_refinedCategory_messageWithDetail_takesItsCategory() {
        XCTAssertEqual(NotificationDetailPolicy.refinedCategory("MEESHY_MESSAGE", type: "new_message",
                                                                userInfo: locationPayload()), "MEESHY_LOCATION")
        XCTAssertEqual(NotificationDetailPolicy.refinedCategory("MEESHY_MESSAGE", type: "message_reply",
                                                                userInfo: contactPayload()), "MEESHY_CONTACT")
        XCTAssertEqual(NotificationDetailPolicy.refinedCategory("MEESHY_MESSAGE", type: "new_message",
                                                                userInfo: invitePayload()), "MEESHY_INVITE")
    }

    /// Une RÉACTION porte le message réagi, pas un message qui arrive.
    func test_refinedCategory_reaction_keepsTheMessageCategory() {
        XCTAssertEqual(NotificationDetailPolicy.refinedCategory("MEESHY_MESSAGE", type: "message_reaction",
                                                                userInfo: locationPayload()), "MEESHY_MESSAGE")
    }

    func test_refinedCategory_mentionOrSocial_isUntouched() {
        XCTAssertEqual(NotificationDetailPolicy.refinedCategory("MEESHY_MENTION", type: "user_mentioned",
                                                                userInfo: locationPayload()), "MEESHY_MENTION")
    }

    func test_refinedCategory_linkOrProtected_keepsTheMessageCategory() {
        let link: [AnyHashable: Any] = ["type": "new_message", "linkUrl": "https://lemonde.fr/a"]
        XCTAssertEqual(NotificationDetailPolicy.refinedCategory("MEESHY_MESSAGE", type: "new_message",
                                                                userInfo: link), "MEESHY_MESSAGE")
        XCTAssertEqual(NotificationDetailPolicy.refinedCategory(
            "MEESHY_MESSAGE", type: "new_message",
            userInfo: locationPayload(["notificationLocKey": "notification.hidden_message"])), "MEESHY_MESSAGE")
    }

    /// La passerelle ne pose AUCUNE clé pour une carte de visite sans nom
    /// (#8857) : la catégorie qu'elle déclare en `aps.category` est gardée.
    func test_refinedCategory_namelessContact_keepsTheDeclaredCategory() {
        let bare: [AnyHashable: Any] = ["type": "new_message", "conversationId": "c1"]
        XCTAssertEqual(NotificationDetailPolicy.refinedCategory("MEESHY_MESSAGE", type: "new_message",
                                                                userInfo: bare, declared: "MEESHY_CONTACT"), "MEESHY_CONTACT")
        XCTAssertEqual(NotificationDetailPolicy.refinedCategory("MEESHY_MESSAGE", type: "new_message",
                                                                userInfo: bare, declared: "MEESHY_SOCIAL"), "MEESHY_MESSAGE")
        XCTAssertEqual(NotificationDetailPolicy.refinedCategory("MEESHY_MESSAGE", type: "message_reaction",
                                                                userInfo: bare, declared: "MEESHY_CONTACT"), "MEESHY_MESSAGE")
        XCTAssertEqual(NotificationDetailPolicy.refinedCategory(
            "MEESHY_MESSAGE", type: "new_message",
            userInfo: bare.merging(["effectFlags": "4"]) { _, new in new }, declared: "MEESHY_CONTACT"), "MEESHY_MESSAGE")
    }

    // MARK: - Politique : vignette vidéo

    func test_videoThumbnailURL_onlyForAVideo_neverWhenProtected() {
        let video: [AnyHashable: Any] = ["attachmentMimeType": "video/mp4", "thumbnailUrl": "/api/v1/attachments/file/t.jpg"]
        XCTAssertEqual(NotificationDetailPolicy.videoThumbnailURL(userInfo: video), "/api/v1/attachments/file/t.jpg")
        XCTAssertNil(NotificationDetailPolicy.videoThumbnailURL(userInfo: video.merging(["effectFlags": "4"]) { _, new in new }))
        XCTAssertNil(NotificationDetailPolicy.videoThumbnailURL(userInfo: ["attachmentMimeType": "image/jpeg", "thumbnailUrl": "https://cdn/t.jpg"]))
        XCTAssertNil(NotificationDetailPolicy.videoThumbnailURL(userInfo: ["attachmentMimeType": "video/mp4", "thumbnailUrl": ""]))
    }

    func test_thumbnailMimeType_readsTheExtension_defaultsToJPEG() {
        XCTAssertEqual(NotificationDetailPolicy.thumbnailMimeType(for: URL(string: "https://cdn/t.png")!), "image/png")
        XCTAssertEqual(NotificationDetailPolicy.thumbnailMimeType(for: URL(string: "https://cdn/t.webp")!), "image/webp")
        XCTAssertEqual(NotificationDetailPolicy.thumbnailMimeType(for: URL(string: "https://cdn/thumb")!), "image/jpeg")
    }

    // MARK: - Politique : corps détaillé

    func test_detailedBody_emptyBody_isComposed() {
        XCTAssertEqual(NotificationDetailPolicy.detailedBody(currentBody: "", userInfo: locationPayload(), labels: labels),
                       "📍 Tour Eiffel")
        XCTAssertEqual(NotificationDetailPolicy.detailedBody(currentBody: " ", userInfo: contactPayload(), labels: labels),
                       "👤 Jean Dupont")
    }

    func test_detailedBody_bareInviteURL_isComposed() {
        XCTAssertEqual(NotificationDetailPolicy.detailedBody(currentBody: "https://meeshy.me/join/abc123",
                                                             userInfo: invitePayload(), labels: labels),
                       "✉️ Invitation · Les voisins")
    }

    func test_detailedBody_gatewayComposedBody_isKept() {
        XCTAssertNil(NotificationDetailPolicy.detailedBody(currentBody: "📍 Tour Eiffel · Paris",
                                                           userInfo: locationPayload(), labels: labels))
    }

    func test_detailedBody_protectedMessage_isNeverComposed() {
        XCTAssertNil(NotificationDetailPolicy.detailedBody(
            currentBody: "", userInfo: locationPayload(["effectFlags": "1"]), labels: labels))
    }

    // MARK: - Politique : délai de l'instantané de carte

    func test_snapshotTimeout_isBoundedByTheBudget() {
        XCTAssertEqual(NotificationDetailPolicy.snapshotTimeout(budgetRemaining: 27, minimum: 2), 8)
        XCTAssertEqual(NotificationDetailPolicy.snapshotTimeout(budgetRemaining: 5, minimum: 2), 4)
        XCTAssertNil(NotificationDetailPolicy.snapshotTimeout(budgetRemaining: 2.5, minimum: 2))
    }

    // MARK: - Catégories enregistrées

    func test_categories_carryTheirActions_andForegroundTheApp() throws {
        let reply = UNTextInputNotificationAction(identifier: MeeshyNotificationAction.reply.rawValue, title: "Répondre", options: [])
        let markRead = UNNotificationAction(identifier: MeeshyNotificationAction.markRead.rawValue, title: "Lu", options: [])
        let categories = NotificationDetailCategories.categories(reply: reply, markRead: markRead)
        let byId = Dictionary(uniqueKeysWithValues: categories.map { ($0.identifier, $0) })

        let expected: [(MeeshyNotificationCategory, MeeshyNotificationAction)] = [
            (.location, .openInMaps), (.contact, .addContact), (.invite, .joinInvite),
        ]
        for (category, action) in expected {
            let registered = try XCTUnwrap(byId[category.rawValue], category.rawValue)
            XCTAssertEqual(registered.actions.map(\.identifier), [action.rawValue, MeeshyNotificationAction.reply.rawValue])
            XCTAssertTrue(registered.actions[0].options.contains(.foreground), action.rawValue)
        }
    }

    /// Les identifiants sont un contrat : la NSE les POSE, l'app les
    /// ENREGISTRE, la passerelle les pousse en `aps.category`.
    func test_categoryIdentifiers_matchWhatTheExtensionSets() {
        XCTAssertEqual(MeeshyNotificationCategory.location.rawValue,
                       NotificationDetailPolicy.detail(userInfo: locationPayload())?.categoryIdentifier)
        XCTAssertEqual(MeeshyNotificationCategory.contact.rawValue,
                       NotificationDetailPolicy.detail(userInfo: contactPayload())?.categoryIdentifier)
        XCTAssertEqual(MeeshyNotificationCategory.invite.rawValue,
                       NotificationDetailPolicy.detail(userInfo: invitePayload())?.categoryIdentifier)
    }

    // MARK: - Routage des gestes

    private final class Recorder {
        var external: [URL] = []
        var deepLinks: [URL] = []
        var contacts: [NotificationContactCard] = []
        var opened = 0
        var consumed: [NotificationRef] = []
    }

    private struct ImmediateBackgroundTasks: BackgroundTaskScheduling {
        func beginTask(name: String, expirationHandler: (@Sendable () -> Void)?) -> UIBackgroundTaskIdentifier { .invalid }
        func endTask(_ identifier: UIBackgroundTaskIdentifier) {}
    }

    private func makeSUT() -> (NotificationActionHandler, Recorder) {
        let recorder = Recorder()
        let sut = NotificationActionHandler(
            messageService: MockMessageService(),
            conversationService: MockConversationService(),
            postService: MockPostService(),
            friendService: MockFriendService(),
            backgroundTasks: ImmediateBackgroundTasks(),
            authTokenProvider: { nil },
            applyAuthToken: { _ in },
            openNotification: { _ in recorder.opened += 1 },
            consume: { recorder.consumed.append($0) },
            openExternalURL: { recorder.external.append($0) },
            openDeepLink: { recorder.deepLinks.append($0) },
            presentNewContact: { recorder.contacts.append($0) }
        )
        return (sut, recorder)
    }

    func test_openInMaps_opensAppleMapsOnThePlace() async throws {
        let (sut, recorder) = makeSUT()
        await sut.handle(actionIdentifier: MeeshyNotificationAction.openInMaps.rawValue,
                         userInfo: locationPayload(["notificationId": "n1"]), replyText: nil)

        let url = try XCTUnwrap(recorder.external.first)
        XCTAssertEqual(url.host, "maps.apple.com")
        XCTAssertTrue(url.absoluteString.contains("ll=48.8584,2.2945"))
        XCTAssertEqual(recorder.opened, 0)
        XCTAssertEqual(recorder.consumed, [.notification(id: "n1")])
    }

    func test_addContact_opensTheConversation_thenTheNewContactSheet() async {
        let (sut, recorder) = makeSUT()
        await sut.handle(actionIdentifier: MeeshyNotificationAction.addContact.rawValue,
                         userInfo: contactPayload(), replyText: nil)

        XCTAssertEqual(recorder.opened, 1)
        XCTAssertEqual(recorder.contacts, [NotificationContactCard(name: "Jean Dupont", phone: "+33612345678", email: "jean@exemple.fr")])
    }

    func test_joinInvite_entersTheConversationLinkFlow() async {
        let (sut, recorder) = makeSUT()
        await sut.handle(actionIdentifier: MeeshyNotificationAction.joinInvite.rawValue,
                         userInfo: invitePayload(), replyText: nil)

        XCTAssertEqual(recorder.deepLinks.map(\.absoluteString), ["https://meeshy.me/join/abc123"])
        XCTAssertEqual(recorder.opened, 0)
    }

    /// Un geste dont la charge ne porte plus (ou pas) son détail — message
    /// protégé, gateway plus ancien — ouvre la notification : jamais inerte,
    /// jamais Plans ni Contacts pour un contenu protégé.
    func test_detailAction_withoutReadableDetail_opensTheNotification() async {
        let (sut, recorder) = makeSUT()
        await sut.handle(actionIdentifier: MeeshyNotificationAction.openInMaps.rawValue,
                         userInfo: locationPayload(["effectFlags": "4"]), replyText: nil)
        await sut.handle(actionIdentifier: MeeshyNotificationAction.joinInvite.rawValue,
                         userInfo: contactPayload(), replyText: nil)

        XCTAssertEqual(recorder.opened, 2)
        XCTAssertTrue(recorder.external.isEmpty)
        XCTAssertTrue(recorder.deepLinks.isEmpty)
        XCTAssertTrue(recorder.contacts.isEmpty)
    }

    // MARK: - La fiche pré-remplie

    func test_newContact_isPrefilledFromTheCard() {
        let contact = NotificationContactPresenter.contact(from: NotificationContactCard(
            name: "Jean Dupont", phone: "+33612345678", email: "jean@exemple.fr"))
        XCTAssertEqual(contact.givenName, "Jean")
        XCTAssertEqual(contact.familyName, "Dupont")
        XCTAssertEqual(contact.phoneNumbers.first?.value.stringValue, "+33612345678")
        XCTAssertEqual(contact.emailAddresses.first?.value as String?, "jean@exemple.fr")
    }
}
