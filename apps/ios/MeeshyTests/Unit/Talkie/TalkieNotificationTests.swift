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

    private let gateway = "https://gate.meeshy.me"

    func test_aTalkieVoiceFromTheConfiguredGateway_isKept() {
        let sealed = NotificationDetailPolicy.sealingUntrustedTalkieVoice(talkiePayload(), apiBaseURL: gateway)
        XCTAssertEqual(sealed["attachmentUrl"] as? String, talkiePayload()["attachmentUrl"] as? String)
    }

    func test_aTalkieVoiceFromAnotherOrigin_isDropped_theTapFallsBackToJoin() {
        ["https://evil.example/voix.m4a", "https://gate.meeshy.me.evil.example/v.m4a", "meeshy://talkie/play?u=x"].forEach { url in
            let sealed = NotificationDetailPolicy.sealingUntrustedTalkieVoice(talkiePayload(["attachmentUrl": url]), apiBaseURL: gateway)
            XCTAssertNil(sealed["attachmentUrl"], url)
            XCTAssertNil(sealed["attachmentMimeType"], url)
            XCTAssertNil(NotificationExpandedContent.resolve(userInfo: sealed) { URL(string: $0) }, url)
            XCTAssertNotNil(TalkieWakePush(userInfo: sealed), url)
        }
    }

    func test_anUntrustedVoiceUrlBesideATrustedAttachment_dropsBoth() {
        let sealed = NotificationDetailPolicy.sealingUntrustedTalkieVoice(talkiePayload(["audioUrl": "https://evil.example/v.m4a"]), apiBaseURL: gateway)
        XCTAssertNil(sealed["attachmentUrl"])
        XCTAssertNil(sealed["audioUrl"])
    }

    func test_theGatewayFollowUp_withItsSignedTalkieAudio_isKept() {
        let followUp = talkiePayload([
            "phase": "ended", "attachmentUrl": "https://gate.meeshy.me/api/v1/talkie/aaaaaaaaaaaaaaaaaaaaaaaa/audio?e=1&t=sig",
            "attachmentMimeType": "audio/aac", "audioUrl": "/api/v1/talkie/aaaaaaaaaaaaaaaaaaaaaaaa/audio?e=1&t=sig",
        ])
        let sealed = NotificationDetailPolicy.sealingUntrustedTalkieVoice(followUp, apiBaseURL: gateway)
        XCTAssertNotNil(sealed["attachmentUrl"])
        XCTAssertNotNil(sealed["audioUrl"])
    }

    func test_theSessionToken_goesOnlyToTheGatewayUnderTheExpectedPaths() {
        let allowed = ["https://gate.meeshy.me/api/v1/attachments/file/a%2Fb.m4a", "https://gate.meeshy.me/api/v1/talkie/x/audio?e=1&t=s"]
        allowed.forEach { XCTAssertTrue(NotificationDetailPolicy.mayCarrySessionToken(URL(string: $0), apiBaseURL: gateway), $0) }
        let refused = [
            "https://evil.example/api/v1/talkie/x/audio", "https://gate.meeshy.me/api/v1/users/me",
            "https://gate.meeshy.me/api/v1/talkie/../users/me", "https://gate.meeshy.me/api/v1/talkie/%2E%2E/users/me",
            "http://gate.meeshy.me/api/v1/talkie/x/audio", "https://gate.meeshy.me:444/api/v1/talkie/x/audio",
        ]
        refused.forEach { XCTAssertFalse(NotificationDetailPolicy.mayCarrySessionToken(URL(string: $0), apiBaseURL: gateway), $0) }
        XCTAssertFalse(NotificationDetailPolicy.mayCarrySessionToken(nil, apiBaseURL: gateway))
    }

    func test_aTalkieVoiceOnTheGatewayButOutsideTheExpectedPaths_isDropped() {
        let sealed = NotificationDetailPolicy.sealingUntrustedTalkieVoice(
            talkiePayload(["attachmentUrl": "https://gate.meeshy.me/api/v1/users/me/export"]), apiBaseURL: gateway
        )
        XCTAssertNil(sealed["attachmentUrl"])
    }

    func test_theSeal_leavesEveryOtherNotificationUntouched() {
        let message: [AnyHashable: Any] = ["type": "new_message", "attachmentUrl": "https://cdn.example/x.m4a"]
        let sealed = NotificationDetailPolicy.sealingUntrustedTalkieVoice(message, apiBaseURL: gateway)
        XCTAssertEqual(sealed["attachmentUrl"] as? String, "https://cdn.example/x.m4a")
    }

    func test_theExpandedTalkie_playsOnlyTheAttachedFile_neverAStream() {
        let streamed = NotificationExpandedContent.talkieVoiceOnlyFromAttachment(talkiePayload(), attachmentURLs: [])
        XCTAssertNil(NotificationExpandedContent.resolve(userInfo: streamed) { URL(string: $0) })

        let attached = NotificationExpandedContent.talkieVoiceOnlyFromAttachment(
            talkiePayload(), attachmentURLs: [URL(fileURLWithPath: "/tmp/voix.m4a")]
        )
        XCTAssertNotNil(NotificationExpandedContent.resolve(userInfo: attached) { URL(string: $0) })
    }

    func test_theRegisteredTalkieCategory_carriesNoAction() throws {
        var registered: Set<UNNotificationCategory> = []
        AppDelegate.registerNotificationCategories(bundle: .main) { registered = $0 }
        let talkie = try XCTUnwrap(registered.first { $0.identifier == MeeshyNotificationCategory.talkie.rawValue })
        XCTAssertTrue(talkie.actions.isEmpty)
    }
}
