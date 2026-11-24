import MeeshyUI
import XCTest
@testable import Meeshy

/// Où la voix du talkie vit (#20531) : en orbe sur le bouton de l'en-tête, sans sortir de sa rangée, et autour du grand
/// avatar de la fiche, à 35 % de son rayon ; montée seulement quand une voix va vers la personne ou vient d'elle.
final class TalkieVoiceHostTests: XCTestCase {

    private func key(_ userId: String, _ direction: TalkieVoiceDirection) -> TalkieVoiceKey {
        TalkieVoiceKey(userId: userId, direction: direction)
    }

    func test_headerOrb_neverExceedsRow() {
        for (button, row) in [(CGFloat(28), CGFloat(44)), (32, 44), (28, 60), (44, 44)] {
            let orb = TalkieVoiceHostLaw.headerOrb(buttonSize: button, rowHeight: row)
            XCTAssertLessThanOrEqual(orb.baseRadius + orb.maxAmplitude, row / 2, "\(button) × \(row)")
            XCTAssertEqual(orb.baseRadius, button / 2)
        }
    }

    func test_headerOrb_rowSmallerThanTheButton_hasNoAmplitude() {
        let orb = TalkieVoiceHostLaw.headerOrb(buttonSize: 44, rowHeight: 30)
        XCTAssertEqual(orb.maxAmplitude, 0)
    }

    func test_profileHero_amplitudeIs35PercentOfRadius() {
        for size in [CGFloat(112), 36, 80] {
            let hero = TalkieVoiceHostLaw.profileHero(outerRingRadius: size / 2 + 7, avatarSize: size)
            XCTAssertEqual(hero.maxAmplitude, 0.35 * size / 2, accuracy: 0.0001)
            XCTAssertEqual(hero.baseRadius, size / 2 + 7)
        }
    }

    func test_shows_aVoiceToOrFromThePerson_mountsTheHost() {
        XCTAssertTrue(TalkieVoiceHostLaw.shows(userId: "bob", voices: [key("bob", .outgoing)]))
        XCTAssertTrue(TalkieVoiceHostLaw.shows(userId: "bob", voices: [key("bob", .incoming)]))
    }

    func test_shows_silenceOrAnotherPersonsVoice_mountsNothing() {
        XCTAssertFalse(TalkieVoiceHostLaw.shows(userId: "bob", voices: []))
        XCTAssertFalse(TalkieVoiceHostLaw.shows(userId: "bob", voices: [key("ana", .outgoing), key("ana", .incoming)]))
    }

    func test_heroState_captionsOnlyMyVoiceToThem() {
        XCTAssertEqual(TalkieVoiceHostLaw.heroState(userId: "bob", voices: [key("bob", .outgoing)]),
                       .voice(captioned: true))
        XCTAssertEqual(TalkieVoiceHostLaw.heroState(userId: "bob", voices: [key("bob", .incoming)]),
                       .voice(captioned: false))
        XCTAssertEqual(TalkieVoiceHostLaw.heroState(userId: "bob", voices: [key("bob", .incoming), key("bob", .outgoing)]),
                       .voice(captioned: true))
        XCTAssertEqual(TalkieVoiceHostLaw.heroState(userId: "bob", voices: [key("ana", .outgoing)]), .silent)
    }

    func test_headerSlot_offeredButton_isTheButton_whateverTheVoice() {
        XCTAssertEqual(TalkieVoiceHostLaw.headerSlot(offered: true, withdrawn: false, incoming: false), .button)
        XCTAssertEqual(TalkieVoiceHostLaw.headerSlot(offered: true, withdrawn: false, incoming: true), .button)
    }

    func test_headerSlot_notOfferedOrWithdrawn_showsTheListeningSlotOnlyWhileThePeerSpeaks() {
        XCTAssertEqual(TalkieVoiceHostLaw.headerSlot(offered: false, withdrawn: false, incoming: true), .listeningSlot)
        XCTAssertEqual(TalkieVoiceHostLaw.headerSlot(offered: true, withdrawn: true, incoming: true), .listeningSlot)
        XCTAssertEqual(TalkieVoiceHostLaw.headerSlot(offered: false, withdrawn: false, incoming: false), .none)
        XCTAssertEqual(TalkieVoiceHostLaw.headerSlot(offered: true, withdrawn: true, incoming: false), .none)
    }

    func test_incoming_isOnlyTheVoiceFromThePeer() {
        XCTAssertTrue(TalkieVoiceHostLaw.incoming(userId: "bob", voices: [key("bob", .incoming)]))
        XCTAssertFalse(TalkieVoiceHostLaw.incoming(userId: "bob", voices: [key("bob", .outgoing), key("ana", .incoming)]))
    }

    func test_delivery_followsWhatTheGatewayAnswered() {
        XCTAssertEqual(TalkieHeaderDelivery.resolve(phase: .talking(toUserId: "u", talkieId: "t"), waking: false), .live)
        XCTAssertEqual(TalkieHeaderDelivery.resolve(phase: .talking(toUserId: "u", talkieId: "t"), waking: true), .relayed)
        XCTAssertEqual(TalkieHeaderDelivery.resolve(phase: .recordingCopy(toUserId: "u"), waking: true), .recorded)
    }

    func test_announcement_onEnteringLive_andOnEachDeliveryChangeWhileLive() {
        XCTAssertEqual(TalkieVoiceHostLaw.announcement(previous: nil, current: .live), .live)
        XCTAssertEqual(TalkieVoiceHostLaw.announcement(previous: .live, current: .relayed), .relayed)
        XCTAssertEqual(TalkieVoiceHostLaw.announcement(previous: .relayed, current: .recorded), .recorded)
    }

    func test_announcement_neitherWhenNothingChangesNorWhenTheVoiceEnds() {
        XCTAssertNil(TalkieVoiceHostLaw.announcement(previous: .live, current: .live))
        XCTAssertNil(TalkieVoiceHostLaw.announcement(previous: .relayed, current: nil))
        XCTAssertNil(TalkieVoiceHostLaw.announcement(previous: nil, current: nil))
    }

    func test_announcementText_saysWhatTheVoiceBecomes_onePhrasePerDelivery() {
        let texts = [TalkieHeaderDelivery.live, .relayed, .recorded].map(TalkieHeaderWording.announcement)
        XCTAssertEqual(Set(texts).count, 3)
        XCTAssertEqual(TalkieHeaderWording.announcement(.recorded),
                       String(localized: "talkie.header.announce.recorded", bundle: .main))
    }

    func test_peerSpeaking_namesThePeer_likeTheReceptionIndicator() {
        XCTAssertTrue(TalkieHeaderWording.peerSpeaking(name: "Bob").contains("Bob"))
    }

    func test_clockSeconds_withoutAVoice_isNil_andCountsFromItsStart() {
        let start = Date(timeIntervalSinceReferenceDate: 1000)
        XCTAssertNil(TalkieVoiceClock.seconds(startedAt: nil, now: start))
        XCTAssertEqual(TalkieVoiceClock.seconds(startedAt: start, now: start.addingTimeInterval(4.2)), 4)
    }
}
