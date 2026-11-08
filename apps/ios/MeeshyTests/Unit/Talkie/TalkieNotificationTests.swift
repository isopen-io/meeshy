import XCTest
import UserNotifications
import MeeshySDK
@testable import Meeshy

/// La notification de réveil d'un talkie (#17143, précision du porteur du 2026-11-08) : la SEULE notification de
/// Meeshy dont la voix se joue sur place, par le lecteur EXISTANT de la notification déployée (#8859) — sa catégorie
/// n'est posée que pour `talkie_incoming`, et aucune autre notification ne la reçoit.
@MainActor
final class TalkieNotificationTests: XCTestCase {

    private func talkiePayload(_ extra: [String: Any] = [:]) -> [AnyHashable: Any] {
        ["type": "talkie_incoming", "talkieId": "aaaaaaaaaaaaaaaaaaaaaaaa", "fromUserId": "bob", "fromUserName": "Bob",
         "attachmentUrl": "https://gate.meeshy.me/api/v1/attachments/file/t%2Fvoix.m4a",
         "attachmentMimeType": "audio/mp4",
         "attachmentDurationMs": "4200"]
            .merging(extra) { _, new in new }
    }

    func test_theTalkieCategory_isOneContract_acrossTheSDKTheExtensionAndTheApp() {
        XCTAssertEqual(NotificationDetailPolicy.talkieCategory, TalkieWakeContract.category)
        XCTAssertEqual(NotificationDetailPolicy.talkiePushType, TalkieWakeContract.pushType)
        XCTAssertEqual(MeeshyNotificationCategory.talkie.rawValue, TalkieWakeContract.category)
    }

    func test_onlyTheTalkieWakePush_getsTheTalkieCategory() {
        XCTAssertEqual(NotificationDetailPolicy.talkieCategory(forType: "talkie_incoming"), "MEESHY_TALKIE")
        let others = ["new_message", "message_reply", "mention", "incoming_call", "missed_call", "post_like", "bring", "unknown", ""]
        others.forEach { XCTAssertNil(NotificationDetailPolicy.talkieCategory(forType: $0), $0) }
    }

    /// Témoin du porteur : un message vocal ordinaire, même avec les clés d'un talkie, ne se range JAMAIS dans la
    /// catégorie du talkie.
    func test_noMessageNotification_isEverRefinedIntoTheTalkieCategory() {
        ["new_message", "message_reply", "reply", "message_forwarded"].forEach { type in
            let refined = NotificationDetailPolicy.refinedCategory("MEESHY_MESSAGE", type: type, userInfo: talkiePayload(["type": type]))
            XCTAssertNotEqual(refined, NotificationDetailPolicy.talkieCategory, type)
        }
    }

    func test_theTalkieVoice_isPlayedByTheExistingExpandedPlayer() {
        let resolved = NotificationExpandedContent.resolve(userInfo: talkiePayload()) { URL(string: $0) }
        guard case .audio(let audio) = resolved else {
            return XCTFail("le réveil d'un talkie qui porte sa voix se déploie dans le lecteur existant")
        }
        XCTAssertTrue(audio.remoteURL.absoluteString.hasSuffix("t%2Fvoix.m4a"))
        XCTAssertEqual(audio.durationMs, 4200)
    }

    func test_aTalkieWakeWithoutVoiceYet_deploysNothing_theTapOpensTheAppThatReplays() {
        let payload = talkiePayload().filter { !($0.key as? String ?? "").hasPrefix("attachment") }
        XCTAssertNil(NotificationExpandedContent.resolve(userInfo: payload) { URL(string: $0) })
        XCTAssertNotNil(TalkieWakePush(userInfo: payload))
    }

    func test_theRegisteredTalkieCategory_carriesNoAction() throws {
        var registered: Set<UNNotificationCategory> = []
        AppDelegate.registerNotificationCategories(bundle: .main) { registered = $0 }
        let talkie = try XCTUnwrap(registered.first { $0.identifier == MeeshyNotificationCategory.talkie.rawValue })
        XCTAssertTrue(talkie.actions.isEmpty)
    }
}
