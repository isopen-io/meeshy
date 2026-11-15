import XCTest
import MeeshySDK
@testable import Meeshy

/// Les mots du talkie (#17141) : le repli est une INFORMATION neutre, jamais une erreur ; le réveil nomme le
/// destinataire ; le (i) dit l'usage d'urgence ; le canal PushToTalk garde un identifiant stable.
@MainActor
final class TalkieWordingTests: XCTestCase {

    func test_onlyTheFallback_isAnInformation() {
        XCTAssertTrue(ProfileTalkieWording.isInformation(.voice))
        let errors: [TalkieSendOutcome] = [.notAllowed, .e2ee, .rateLimited, .offline, .failed, .micDenied, .limit]
        errors.forEach { XCTAssertFalse(ProfileTalkieWording.isInformation($0), "\($0)") }
    }

    func test_theFallbackNotice_saysAMessageWillBeSentInTheMostRecentConversation() {
        let notice = ProfileTalkieWording.notice(.voice)
        XCTAssertFalse(notice.isEmpty)
        XCTAssertNotEqual(notice, ProfileTalkieWording.notice(.failed))
    }

    func test_waking_namesTheRecipient() {
        XCTAssertTrue(ProfileTalkieWording.waking(name: "Awa").contains("Awa"))
    }

    func test_theInfo_isWritten() {
        XCTAssertFalse(TalkieInfoWording.text.isEmpty)
        XCTAssertFalse(TalkieInfoWording.a11y.isEmpty)
    }

    func test_aRecordingCopy_looksLive() {
        XCTAssertEqual(TalkieHoldLook.resolve(pressed: false, phase: .recordingCopy(toUserId: "bob")), .live)
    }

    func test_theChannelUUID_isStable() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "talkie-ptt-\(UUID().uuidString)"))
        let first = TalkiePushToTalkRules.channelUUID(in: defaults)
        XCTAssertEqual(TalkiePushToTalkRules.channelUUID(in: defaults), first)
    }

    func test_theParticipantName_comesFromThePush_orFallsBack() {
        XCTAssertEqual(TalkiePushToTalkRules.participantName(for: ["talkieId": "t", "fromUserId": "u", "fromUserName": "Awa"], fallback: "X"), "Awa")
        XCTAssertEqual(TalkiePushToTalkRules.participantName(for: ["junk": 1], fallback: "X"), "X")
    }

    func test_theTokenIsHex() {
        XCTAssertEqual(TalkiePushToTalkRules.hex(Data([0x0a, 0xff, 0x00])), "0aff00")
    }
}
