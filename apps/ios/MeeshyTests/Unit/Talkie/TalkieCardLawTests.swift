import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// Le talkie agréable (#19732) : on voit les trente secondes s'écouler, on sait que la voix est partie, un refus dit
/// pourquoi au lieu de faire disparaître la carte, et la voix reçue s'annonce au toucher et, Meeshy non muet, à l'oreille.
@MainActor
final class TalkieCardLawTests: XCTestCase {

    private static let start = Date(timeIntervalSince1970: 1_800_000_000)
    private static let window = TalkieTalkWindow(startedAt: start, maxDuration: 30)

    private func at(_ seconds: TimeInterval) -> Date { Self.start.addingTimeInterval(seconds) }

    // MARK: - Le décompte des trente secondes

    func test_remaining_countsDownFromTheMaximum_andNeverGoesNegative() {
        XCTAssertEqual(TalkieCountdown.remaining(Self.window, at: at(0)), 30)
        XCTAssertEqual(TalkieCountdown.remaining(Self.window, at: at(12.5)), 17.5)
        XCTAssertEqual(TalkieCountdown.remaining(Self.window, at: at(45)), 0)
        XCTAssertEqual(TalkieCountdown.remaining(Self.window, at: at(-3)), 30, "une horloge en retard ne rallonge rien")
    }

    func test_fraction_emptiesTheRingFromFullToNothing() {
        XCTAssertEqual(TalkieCountdown.fraction(Self.window, at: at(0)), 1)
        XCTAssertEqual(TalkieCountdown.fraction(Self.window, at: at(15)), 0.5, accuracy: 0.0001)
        XCTAssertEqual(TalkieCountdown.fraction(Self.window, at: at(31)), 0)
        XCTAssertEqual(TalkieCountdown.fraction(TalkieTalkWindow(startedAt: Self.start, maxDuration: 0), at: at(0)), 0)
    }

    func test_seconds_roundsUp_soTheLastSecondStillShowsOne() {
        XCTAssertEqual(TalkieCountdown.seconds(Self.window, at: at(0)), 30)
        XCTAssertEqual(TalkieCountdown.seconds(Self.window, at: at(29.2)), 1)
        XCTAssertEqual(TalkieCountdown.seconds(Self.window, at: at(30)), 0)
    }

    func test_announces_onlyAFewMilestones_notEverySecond() {
        XCTAssertEqual((0...30).filter(TalkieCountdown.announces), [5, 10, 20])
    }

    // MARK: - Ce qu'une prise de parole close laisse sur la carte

    func test_aftermath_ofAVoiceThatLeft_isSent_evenWhenStoppedAtTheLimit() {
        XCTAssertEqual(TalkieAftermath.of(nil), .sent)
        XCTAssertEqual(TalkieAftermath.of(.limit), .sent, "le décompte a dit la limite : la voix est partie, ce n'est pas un refus")
        XCTAssertEqual(TalkieAftermath.of(.voice), .sentAsVoice)
    }

    func test_aftermath_ofARefusal_isARefusal() {
        let refusals: [TalkieSendOutcome] = [.notAllowed, .e2ee, .rateLimited, .offline, .failed, .micDenied]
        refusals.forEach { XCTAssertEqual(TalkieAftermath.of($0), .refused($0), "\($0)") }
    }

    func test_aSentAftermath_fadesBriefly_aRefusalStaysUntilTheNextPress() {
        XCTAssertNotNil(TalkieAftermath.sent.fadesAfter)
        XCTAssertNotNil(TalkieAftermath.sentAsVoice.fadesAfter)
        XCTAssertLessThanOrEqual(TalkieAftermath.sent.fadesAfter ?? 9, 2)
        XCTAssertNil(TalkieAftermath.refused(.offline).fadesAfter)
    }

    func test_onlyARefusedCircle_removesTheButton_andTheCardStillSaysWhy() {
        XCTAssertFalse(TalkieAftermath.refused(.notAllowed).keepsHoldButton)
        let others: [TalkieAftermath] = [.sent, .sentAsVoice, .refused(.offline), .refused(.micDenied), .refused(.failed),
                                         .refused(.rateLimited), .refused(.e2ee)]
        others.forEach { XCTAssertTrue($0.keepsHoldButton, "\($0) : le bouton reste, il réessaie") }
    }

    func test_onlyTheMicrophone_hasAnActionThatUnblocks() {
        XCTAssertEqual(TalkieAftermath.refused(.micDenied).unblock, .openSettings)
        let others: [TalkieAftermath] = [.sent, .sentAsVoice, .refused(.offline), .refused(.notAllowed), .refused(.failed)]
        others.forEach { XCTAssertNil($0.unblock, "\($0)") }
    }

    // MARK: - La ligne unique de la carte

    func test_line_followsThePhase_whileTheVoiceIsLive() {
        XCTAssertEqual(TalkieCardLine.resolve(phase: .idle, waking: false, aftermath: nil), .hold)
        XCTAssertEqual(TalkieCardLine.resolve(phase: .starting(toUserId: "b"), waking: false, aftermath: .sent), .connecting)
        XCTAssertEqual(TalkieCardLine.resolve(phase: .talking(toUserId: "b", talkieId: "t"), waking: false, aftermath: nil), .talking)
        XCTAssertEqual(TalkieCardLine.resolve(phase: .talking(toUserId: "b", talkieId: "t"), waking: true, aftermath: nil), .waking)
        XCTAssertEqual(TalkieCardLine.resolve(phase: .recordingCopy(toUserId: "b"), waking: false, aftermath: nil), .recordingCopy)
    }

    func test_line_atRest_saysWhatTheLastTalkBecame() {
        XCTAssertEqual(TalkieCardLine.resolve(phase: .idle, waking: false, aftermath: .sent), .aftermath(.sent))
        XCTAssertEqual(TalkieCardLine.resolve(phase: .idle, waking: false, aftermath: .refused(.offline)),
                       .aftermath(.refused(.offline)))
    }

    func test_everyLine_isWritten_andTheRefusalOfTheCircle_saysWhy() {
        let lines: [TalkieCardLine] = [.hold, .connecting, .talking, .waking, .recordingCopy, .aftermath(.sent),
                                       .aftermath(.sentAsVoice), .aftermath(.refused(.notAllowed)), .aftermath(.refused(.micDenied))]
        lines.forEach { XCTAssertFalse(ProfileTalkieWording.text(for: $0, name: "Awa").isEmpty, "\($0)") }
        XCTAssertTrue(ProfileTalkieWording.text(for: .talking, name: "Awa").contains("Awa"))
        XCTAssertNotEqual(ProfileTalkieWording.text(for: .aftermath(.refused(.notAllowed)), name: "Awa"),
                          ProfileTalkieWording.text(for: .aftermath(.refused(.failed)), name: "Awa"))
    }

    func test_remainingSeconds_areSpokenAsADuration() {
        let spoken = ProfileTalkieWording.remaining(seconds: 10)
        XCTAssertTrue(spoken.contains("10"))
        XCTAssertNotEqual(spoken, "10")
    }

    // MARK: - Le toucher et le son

    func test_aVoiceThatLeft_vibratesSuccess_andChimes() {
        XCTAssertEqual(TalkieCueLaw.afterRelease(.sent), TalkieCue(haptic: .success, sound: .sent))
        XCTAssertEqual(TalkieCueLaw.afterRelease(.sentAsVoice), TalkieCue(haptic: .success, sound: .sent))
    }

    func test_aRefusal_vibratesAWarning_inSilence() {
        XCTAssertEqual(TalkieCueLaw.afterRelease(.refused(.offline)), TalkieCue(haptic: .warning, sound: nil))
    }

    func test_anIncomingVoice_vibrates_andChimesOnlyWhenMeeshyIsNotMuted() {
        XCTAssertEqual(TalkieCueLaw.incoming(vibrationEnabled: true, soundEnabled: true), TalkieCue(haptic: .attention, sound: .incoming))
        XCTAssertEqual(TalkieCueLaw.incoming(vibrationEnabled: true, soundEnabled: false), TalkieCue(haptic: .attention, sound: nil))
        XCTAssertEqual(TalkieCueLaw.incoming(vibrationEnabled: false, soundEnabled: true), TalkieCue(haptic: nil, sound: .incoming))
    }

    func test_theTwoChimes_areDistinctSystemSounds() {
        XCTAssertNotEqual(TalkieSound.sent.systemSoundID, TalkieSound.incoming.systemSoundID)
    }

    // MARK: - Le raccourci ouvre la face qui porte le talkie

    func test_theShortcut_opensTheActionsFace_ofTheCloseOne() throws {
        let url = try XCTUnwrap(TalkieShortcutRoute.url(username: " leo.m "))
        XCTAssertEqual(DeepLinkParser.parse(url), .userProfile(username: "leo.m", face: .actions))
        XCTAssertNil(TalkieShortcutRoute.url(username: " "))
    }

    func test_aProfileLink_withoutFace_staysOnTheVitrine() {
        XCTAssertEqual(DeepLinkParser.parse(URL(string: "meeshy://u/leo.m")!), .userProfile(username: "leo.m", face: .vitrine))
        XCTAssertEqual(DeepLinkParser.parse(URL(string: "meeshy://u/leo.m?face=nope")!), .userProfile(username: "leo.m"))
    }

    func test_theProfileSheetUser_carriesTheFaceItOpensOn() {
        let user = ProfileSheetUser(username: "leo.m")
        XCTAssertEqual(user.openingFace, .vitrine)
        XCTAssertEqual(user.opening(on: .actions).openingFace, .actions)
        XCTAssertEqual(user.opening(on: .actions), user, "la face d'ouverture ne change pas QUI on ouvre")
    }
}
