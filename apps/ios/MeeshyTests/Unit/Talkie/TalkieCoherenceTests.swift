import XCTest
import MeeshySDK
@testable import Meeshy

/// #20579 — le talkie dit la même chose à chaque instant, sur chaque surface : le symbole d'un bouton suit le sort de
/// ma voix (connexion, direct, réveil, message vocal, partie), l'en-tête et le bandeau annoncent un changement de sort
/// au moment où il arrive, et l'orbe d'un bouton montre MA voix pendant que le pair, qui parle peut-être en même temps,
/// vit dans le spectre du bandeau.
@MainActor
final class TalkieCoherenceTests: XCTestCase {

    private let bob = "bob"

    private func glyph(_ phase: TalkieSender.Phase, waking: Bool = false, aftermath: TalkieAftermath? = nil,
                       delivery: Meeshy.TalkieDelivery = .live) -> TalkieHoldGlyph {
        TalkieHoldGlyph.resolve(phase: phase, waking: waking, aftermath: aftermath, delivery: delivery)
    }

    // MARK: - Le symbole d'un bouton

    func test_whileConnecting_theGlyphSaysConnecting_neverTheLiveWaveform() {
        XCTAssertEqual(glyph(.starting(toUserId: bob)), .connecting)
        XCTAssertNotEqual(glyph(.starting(toUserId: bob)).symbol(rest: "mic.fill"), TalkieHoldGlyph.live.symbol(rest: "mic.fill"))
    }

    func test_aLiveVoice_showsTheWaveform_aWakingVoice_theBell() {
        XCTAssertEqual(glyph(.talking(toUserId: bob, talkieId: "t")), .live)
        XCTAssertEqual(glyph(.talking(toUserId: bob, talkieId: "t"), waking: true), .waking)
        XCTAssertEqual(TalkieHoldGlyph.live.symbol(rest: "x"), "waveform")
        XCTAssertNotEqual(TalkieHoldGlyph.waking.symbol(rest: "x"), "waveform")
    }

    func test_aVoiceRecordedAsAMessage_neverLooksLive() {
        XCTAssertEqual(glyph(.recordingCopy(toUserId: bob)), .recording)
        XCTAssertNotEqual(TalkieHoldGlyph.recording.symbol(rest: "x"), TalkieHoldGlyph.live.symbol(rest: "x"))
    }

    func test_atRest_eachSurfaceKeepsItsOwnSymbol_butAnUnreachablePhoneSaysVoiceMessageEverywhere() {
        XCTAssertEqual(glyph(.idle).symbol(rest: "antenna.radiowaves.left.and.right"), "antenna.radiowaves.left.and.right")
        XCTAssertEqual(glyph(.idle).symbol(rest: "mic.fill"), "mic.fill")
        XCTAssertEqual(glyph(.idle, delivery: .voiceMessage), .leaveVoice)
        XCTAssertEqual(TalkieHoldGlyph.leaveVoice.symbol(rest: "a"), TalkieHoldGlyph.leaveVoice.symbol(rest: "b"))
    }

    func test_aVoiceThatLeft_showsTheCheck_aRefusalGoesBackToRest() {
        [TalkieAftermath.sent, .sentAtLimit, .sentAsVoice].forEach { XCTAssertEqual(glyph(.idle, aftermath: $0), .sent, "\($0)") }
        XCTAssertEqual(glyph(.idle, aftermath: .refused(.offline)), .rest)
    }

    // MARK: - Ce que l'en-tête et le bandeau annoncent quand le sort change

    func test_aFallback_isAnnouncedWhenItStarts_notOnlyOnceTheVoiceIsGone() {
        XCTAssertEqual(TalkieLiveNotice.on(previous: nil, current: .recorded, delivery: .live), .fallback)
        XCTAssertEqual(TalkieLiveNotice.fallback.text(name: "Awa"), ProfileTalkieWording.notice(.voice))
        XCTAssertNotEqual(ProfileTalkieWording.settledText(.voice), ProfileTalkieWording.notice(.voice),
                          "la fin dit « Parti en message vocal », le début a dit pourquoi")
        XCTAssertEqual(ProfileTalkieWording.settledText(.voice), ProfileTalkieWording.sentAsVoice)
    }

    func test_aChosenVoiceMessage_isNotAnnouncedAsAFallback() {
        XCTAssertNil(TalkieLiveNotice.on(previous: nil, current: .recorded, delivery: .voiceMessage))
    }

    func test_waking_isAnnouncedOnce_andTheLiveVoiceNever() {
        XCTAssertEqual(TalkieLiveNotice.on(previous: nil, current: .relayed, delivery: .live), .waking)
        XCTAssertTrue(TalkieLiveNotice.waking.text(name: "Awa").contains("Awa"))
        XCTAssertNil(TalkieLiveNotice.on(previous: .relayed, current: .relayed, delivery: .live))
        XCTAssertNil(TalkieLiveNotice.on(previous: nil, current: .live, delivery: .live))
        XCTAssertNil(TalkieLiveNotice.on(previous: .live, current: nil, delivery: .live))
    }

    // MARK: - Deux voix, deux places

    func test_whileITalk_theButtonOrbShowsMyVoice_evenWhenThePeerTalksToo() {
        let both: Set<TalkieVoiceKey> = [TalkieVoiceKey(userId: bob, direction: .outgoing),
                                         TalkieVoiceKey(userId: bob, direction: .incoming)]
        XCTAssertEqual(TalkieVoiceHostLaw.orbDirection(userId: bob, voices: both), .outgoing)
    }

    func test_whenOnlyThePeerTalks_theButtonOrbShowsHisVoice_andNothingOtherwise() {
        XCTAssertEqual(TalkieVoiceHostLaw.orbDirection(userId: bob, voices: [TalkieVoiceKey(userId: bob, direction: .incoming)]), .incoming)
        XCTAssertNil(TalkieVoiceHostLaw.orbDirection(userId: bob, voices: [TalkieVoiceKey(userId: "awa", direction: .outgoing)]))
    }
}
