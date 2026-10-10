import XCTest
import UserNotifications
import MeeshySDK
@testable import Meeshy

/// **La notification DÉPLOYÉE — ce qu'elle montre, par type et par protection**
/// (#8859, sous-lot iOS de #8856).
///
/// Un appui long sur une notification ne montrait que le texte : un vocal ne
/// s'écoutait pas, une position ne s'explorait pas. L'extension de contenu
/// (`MeeshyNotificationContentExtension`) rend désormais un lecteur, une carte
/// ou une fiche. Ces témoins tiennent la DÉCISION — ce qui s'affiche, et
/// surtout ce qui ne s'affiche jamais pour un message protégé — ainsi que la
/// catégorie qui fait choisir l'extension et les petites lois du lecteur.
@MainActor
final class NotificationExpandedContentTests: XCTestCase {

    private func audioPayload(_ extra: [String: Any] = [:]) -> [AnyHashable: Any] {
        ["type": "new_message", "conversationId": "c1", "messageId": "m1",
         "attachmentUrl": "https://gate.meeshy.me/api/v1/attachments/file/a%2Fvocal.m4a",
         "attachmentMimeType": "audio/mp4; codecs=mp4a.40.2",
         "attachmentDurationMs": "12400"]
            .merging(extra) { _, new in new }
    }

    private func locationPayload(_ extra: [String: Any] = [:]) -> [AnyHashable: Any] {
        ["type": "new_message", "conversationId": "c1", "messageId": "m1",
         "locationLat": "48.8584", "locationLon": "2.2945", "locationName": "Tour Eiffel"]
            .merging(extra) { _, new in new }
    }

    private func contactPayload(_ extra: [String: Any] = [:]) -> [AnyHashable: Any] {
        ["type": "new_message", "conversationId": "c1", "messageId": "m1",
         "contactName": "Jean Dupont", "contactPhone": "+33612345678", "contactEmail": "jean@exemple.fr"]
            .merging(extra) { _, new in new }
    }

    private let resolveURL: (String) -> URL? = { raw in
        raw.hasPrefix("https://") ? URL(string: raw) : nil
    }

    private func resolve(_ userInfo: [AnyHashable: Any]) -> NotificationExpandedContent? {
        NotificationExpandedContent.resolve(userInfo: userInfo, resolveURL: resolveURL)
    }

    // MARK: - Par type

    func test_resolve_voiceMessage_isAPlayerOnTheServedTrack() throws {
        guard case .audio(let audio) = resolve(audioPayload()) else {
            return XCTFail("un vocal doit se déployer en lecteur")
        }
        XCTAssertEqual(audio.remoteURL.absoluteString,
                       "https://gate.meeshy.me/api/v1/attachments/file/a%2Fvocal.m4a")
        XCTAssertEqual(audio.durationMs, 12_400)
    }

    func test_resolve_voiceMessageWithoutDeclaredDuration_keepsThePlayer() {
        guard case .audio(let audio) = resolve(audioPayload(["attachmentDurationMs": ""])) else {
            return XCTFail("une durée absente ne doit pas retirer le lecteur")
        }
        XCTAssertNil(audio.durationMs)
    }

    func test_resolve_location_isTheMapOfThePlace() {
        guard case .location(let place) = resolve(locationPayload()) else {
            return XCTFail("une position doit se déployer en carte")
        }
        XCTAssertEqual(place.latitude, 48.8584, accuracy: 0.0001)
        XCTAssertEqual(place.longitude, 2.2945, accuracy: 0.0001)
        XCTAssertEqual(place.name, "Tour Eiffel")
    }

    func test_resolve_contact_isTheCard() {
        XCTAssertEqual(resolve(contactPayload()), .contact(NotificationContactCard(
            name: "Jean Dupont", phone: "+33612345678", email: "jean@exemple.fr")))
    }

    func test_resolve_imageOrInviteOrLink_hasNoExpandedView() {
        XCTAssertNil(resolve(audioPayload(["attachmentMimeType": "image/jpeg"])))
        XCTAssertNil(resolve(["type": "new_message", "inviteUrl": "https://meeshy.me/join/abc"]))
        XCTAssertNil(resolve(["type": "new_message", "linkUrl": "https://lemonde.fr/a"]))
    }

    // MARK: - Protection : rien ne se déploie

    func test_resolve_protectedByLocKey_showsNothing() {
        let key = ["notificationLocKey": "notification.view_once_message"]
        XCTAssertNil(resolve(audioPayload(key)))
        XCTAssertNil(resolve(locationPayload(key)))
        XCTAssertNil(resolve(contactPayload(key)))
    }

    func test_resolve_ephemeralBlurredOrViewOnceFlags_showNothing() {
        for flags in ["1", "2", "4"] {
            XCTAssertNil(resolve(audioPayload(["effectFlags": flags])), "audio effectFlags=\(flags)")
            XCTAssertNil(resolve(locationPayload(["effectFlags": flags])), "position effectFlags=\(flags)")
            XCTAssertNil(resolve(contactPayload(["effectFlags": flags])), "contact effectFlags=\(flags)")
        }
    }

    /// `showPreview:false` — la passerelle ne pose AUCUN champ de contenu, et
    /// la clé de protection vide l'URL (`attachmentUrl: ''`). Rien à déployer.
    func test_resolve_hiddenPreviewOrEmptiedMedia_showsNothing() {
        XCTAssertNil(resolve(["type": "new_message", "conversationId": "c1", "encryptedContent": "x"]))
        XCTAssertNil(resolve(audioPayload(["attachmentUrl": ""])))
        XCTAssertNil(resolve(audioPayload(["attachmentUrl": "javascript:alert(1)"])))
    }

    // MARK: - Source de lecture

    func test_playableURL_prefersTheAttachedAudioFile() {
        let remote = URL(string: "https://gate.meeshy.me/a.m4a")!
        let local = URL(fileURLWithPath: "/tmp/ABC.m4a")
        let image = URL(fileURLWithPath: "/tmp/ABC.png")
        XCTAssertEqual(NotificationExpandedContent.playableURL(attachmentURLs: [image, local], remote: remote), local)
    }

    func test_playableURL_withoutAttachedAudio_streamsTheRemoteTrack() {
        let remote = URL(string: "https://gate.meeshy.me/a.m4a")!
        let image = URL(fileURLWithPath: "/tmp/ABC.png")
        XCTAssertEqual(NotificationExpandedContent.playableURL(attachmentURLs: [image], remote: remote), remote)
        XCTAssertEqual(NotificationExpandedContent.playableURL(attachmentURLs: [], remote: remote), remote)
    }

    // MARK: - Lecteur : vitesse et horloge

    func test_nextRate_cyclesOneThenOneAndAHalfThenTwo() {
        XCTAssertEqual(NotificationPlaybackRate.next(after: 1), 1.5)
        XCTAssertEqual(NotificationPlaybackRate.next(after: 1.5), 2)
        XCTAssertEqual(NotificationPlaybackRate.next(after: 2), 1)
        XCTAssertEqual(NotificationPlaybackRate.next(after: 0.7), 1)
    }

    func test_rateLabel_followsTheLocaleDecimalSeparator() {
        XCTAssertEqual(NotificationPlaybackRate.label(for: 1, locale: Locale(identifier: "fr_FR")), "1×")
        XCTAssertEqual(NotificationPlaybackRate.label(for: 1.5, locale: Locale(identifier: "fr_FR")), "1,5×")
        XCTAssertEqual(NotificationPlaybackRate.label(for: 1.5, locale: Locale(identifier: "en_US")), "1.5×")
    }

    func test_clock_formatsMinutesAndSeconds_andNeverGoesNegative() {
        XCTAssertEqual(NotificationPlaybackRate.clock(seconds: 0), "0:00")
        XCTAssertEqual(NotificationPlaybackRate.clock(seconds: 7.9), "0:07")
        XCTAssertEqual(NotificationPlaybackRate.clock(seconds: 65), "1:05")
        XCTAssertEqual(NotificationPlaybackRate.clock(seconds: -3), "0:00")
        XCTAssertEqual(NotificationPlaybackRate.clock(seconds: .nan), "0:00")
    }

    func test_progress_isBoundedBetweenZeroAndOne() {
        XCTAssertEqual(NotificationPlaybackRate.progress(elapsed: 3, duration: 12), 0.25, accuracy: 0.0001)
        XCTAssertEqual(NotificationPlaybackRate.progress(elapsed: 30, duration: 12), 1)
        XCTAssertEqual(NotificationPlaybackRate.progress(elapsed: 3, duration: 0), 0)
        XCTAssertEqual(NotificationPlaybackRate.progress(elapsed: 3, duration: .nan), 0)
    }

    // MARK: - Lecteur : un seul axe

    /// Le bouton natif est dessiné par le SYSTÈME à `nativeButtonFrame` : il
    /// doit tomber au centre de la pastille de lecture, sur l'axe de la ligne
    /// de progression, et au même gabarit que la pastille de vitesse.
    func test_nativeButtonFrame_isCentredInThePlayPill_onTheRowAxis() {
        let geometry = NotificationPlayerGeometry.standard
        let frame = geometry.nativeButtonFrame
        XCTAssertEqual(frame.midY, geometry.axisY, accuracy: 0.001)
        XCTAssertEqual(frame.midX, geometry.inset + geometry.pillSide / 2, accuracy: 0.001)
        XCTAssertEqual(geometry.axisY, geometry.height / 2, accuracy: 0.001)
        XCTAssertLessThan(frame.width, geometry.pillSide)
        XCTAssertGreaterThanOrEqual(geometry.pillSide, 44)
    }

    func test_seekFraction_followsTheFinger_andStaysOnTheTrack() {
        XCTAssertEqual(NotificationPlayerGeometry.seekFraction(x: 50, trackWidth: 200), 0.25, accuracy: 0.0001)
        XCTAssertEqual(NotificationPlayerGeometry.seekFraction(x: -20, trackWidth: 200), 0)
        XCTAssertEqual(NotificationPlayerGeometry.seekFraction(x: 260, trackWidth: 200), 1)
        XCTAssertEqual(NotificationPlayerGeometry.seekFraction(x: 10, trackWidth: 0), 0)
    }

    // MARK: - Catégorie : ce qui fait choisir l'extension

    func test_refinedCategory_voiceMessage_isTheAudioCategory() {
        XCTAssertEqual(NotificationDetailPolicy.refinedCategory("MEESHY_MESSAGE", type: "new_message",
                                                                userInfo: audioPayload()), "MEESHY_AUDIO")
        XCTAssertEqual(NotificationDetailPolicy.refinedCategory("MEESHY_MESSAGE", type: "message_reply",
                                                                userInfo: audioPayload()), "MEESHY_AUDIO")
    }

    func test_refinedCategory_protectedOrEmptiedOrNonAudio_keepsTheMessageCategory() {
        let cases: [[AnyHashable: Any]] = [
            audioPayload(["notificationLocKey": "notification.ephemeral_message"]),
            audioPayload(["effectFlags": "4"]),
            audioPayload(["attachmentUrl": ""]),
            audioPayload(["attachmentMimeType": "video/mp4"]),
        ]
        for userInfo in cases {
            XCTAssertEqual(NotificationDetailPolicy.refinedCategory("MEESHY_MESSAGE", type: "new_message",
                                                                    userInfo: userInfo), "MEESHY_MESSAGE")
        }
    }

    func test_refinedCategory_reactionToAVoiceMessage_keepsTheMessageCategory() {
        XCTAssertEqual(NotificationDetailPolicy.refinedCategory("MEESHY_MESSAGE", type: "message_reaction",
                                                                userInfo: audioPayload()), "MEESHY_MESSAGE")
    }

    func test_audioCategory_isRegisteredWithReplyAndMarkRead() throws {
        let reply = UNTextInputNotificationAction(identifier: MeeshyNotificationAction.reply.rawValue, title: "Répondre", options: [])
        let markRead = UNNotificationAction(identifier: MeeshyNotificationAction.markRead.rawValue, title: "Lu", options: [])
        let categories = NotificationDetailCategories.categories(reply: reply, markRead: markRead)
        let audio = try XCTUnwrap(categories.first { $0.identifier == MeeshyNotificationCategory.audio.rawValue })
        XCTAssertEqual(audio.actions.map(\.identifier),
                       [MeeshyNotificationAction.reply.rawValue, MeeshyNotificationAction.markRead.rawValue])
    }

    // MARK: - Contrat : l'extension embarquée déclare ces catégories

    /// Les catégories que l'extension de contenu DÉCLARE (Info.plist) sont
    /// exactement celles pour lesquelles elle sait rendre quelque chose. Une
    /// catégorie déclarée sans rendu afficherait un cadre vide ; une catégorie
    /// rendue mais non déclarée ne serait jamais choisie par iOS.
    func test_embeddedContentExtension_declaresTheExpandedCategories() throws {
        let plugins = try XCTUnwrap(Bundle.main.builtInPlugInsURL)
        let plist = plugins.appendingPathComponent("MeeshyNotificationContentExtension.appex/Info.plist")
        let info = try XCTUnwrap(NSDictionary(contentsOf: plist), "extension de contenu absente de l'app")
        let attributes = try XCTUnwrap((info["NSExtension"] as? [String: Any])?["NSExtensionAttributes"] as? [String: Any])
        let declared = try XCTUnwrap(attributes["UNNotificationExtensionCategory"] as? [String])
        XCTAssertEqual(Set(declared), Set(NotificationExpandedContent.categoryIdentifiers))
        XCTAssertEqual(Set(NotificationExpandedContent.categoryIdentifiers), [
            MeeshyNotificationCategory.audio.rawValue,
            MeeshyNotificationCategory.location.rawValue,
            MeeshyNotificationCategory.contact.rawValue,
        ])
        XCTAssertEqual(attributes["UNNotificationExtensionUserInteractionEnabled"] as? Bool, true)
    }

    /// iOS cherche la classe de contexte du point d'extension dans
    /// l'EXÉCUTABLE avant de charger quoi que ce soit. Un exécutable qui ne
    /// lie pas `UserNotificationsUI` — le cas en Debug quand Xcode déplace le
    /// code dans `….debug.dylib` — se lance, ne plante pas, et rend une
    /// notification déployée VIDE : mesuré au simulateur, invisible à tout le
    /// reste de la suite.
    func test_embeddedContentExtension_executableLinksUserNotificationsUI() throws {
        let plugins = try XCTUnwrap(Bundle.main.builtInPlugInsURL)
        let appex = try XCTUnwrap(Bundle(url: plugins.appendingPathComponent("MeeshyNotificationContentExtension.appex")))
        let executable = try Data(contentsOf: try XCTUnwrap(appex.executableURL))
        XCTAssertNotNil(executable.range(of: Data("UserNotificationsUI.framework".utf8)),
                        "l'exécutable de l'extension de contenu ne lie pas UserNotificationsUI")
    }
}
