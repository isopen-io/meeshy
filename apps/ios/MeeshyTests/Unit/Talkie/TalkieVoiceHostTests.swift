import Combine
import MeeshyUI
import XCTest
@testable import Meeshy

/// Où la voix du talkie vit (#20531) : en orbe sur le bouton de l'en-tête, sans sortir de sa rangée, et autour du grand
/// avatar de la fiche, à 35 % de son rayon ; montée seulement quand une voix va vers la personne ou vient d'elle.
final class TalkieVoiceHostTests: XCTestCase {

    private func key(_ userId: String, _ direction: TalkieVoiceDirection) -> TalkieVoiceKey {
        TalkieVoiceKey(userId: userId, direction: direction)
    }

    /// L'orbe part du CENTRE du bouton (#20531) : au silence, un point ; la voix la pousse jusqu'au bord de la rangée
    /// au plus, jamais au-delà.
    func test_headerOrb_bornAtTheCentre_neverExceedsRow() {
        for (button, row) in [(CGFloat(28), CGFloat(44)), (32, 44), (28, 60), (44, 44), (44, 30)] {
            let orb = TalkieVoiceHostLaw.headerOrb(buttonSize: button, rowHeight: row)
            XCTAssertEqual(orb.baseRadius, 0)
            XCTAssertLessThanOrEqual(orb.maxAmplitude, row / 2, "\(button) × \(row)")
        }
    }

    /// Sur la fiche, l'orbe part du centre du bouton « Maintenir pour parler » et ne dépasse jamais la marge qui
    /// l'entoure : rien ne bouge autour d'elle.
    func test_holdOrb_bornAtTheCentre_staysInsideItsRoom() {
        for (button, room) in [(CGFloat(96), CGFloat(24)), (96, 0), (44, 12)] {
            let orb = TalkieVoiceHostLaw.holdOrb(buttonSize: button, room: room)
            XCTAssertEqual(orb.baseRadius, 0)
            XCTAssertEqual(orb.maxAmplitude, button / 2 + room, "\(button) × \(room)")
        }
    }

    /// L'orbe d'un bouton se voit : elle dépasse le bord d'au plus 70 % du rayon si la place le permet, jamais au-delà
    /// de sa marge, et elle répond à la voix plutôt qu'au niveau brut.
    func test_holdOrb_reachesSeventyPercentBeyondTheEdge_whenTheRoomAllows() {
        let roomy = TalkieVoiceHostLaw.holdOrb(buttonSize: 96, room: 100)
        XCTAssertEqual(roomy.maxAmplitude, 48 + 0.7 * 48, accuracy: 0.0001)
        XCTAssertEqual(roomy.response, .voice)
        XCTAssertEqual(TalkieVoiceHostLaw.holdOrb(buttonSize: 96, room: 24).maxAmplitude, 72)
        XCTAssertEqual(TalkieVoiceHostLaw.headerOrb(buttonSize: 28, rowHeight: 44).response, .voice)
    }

    /// Sur la fiche, la carte laisse à l'orbe au moins 60 % du rayon au-delà du bord, sans sortir de sa marge.
    func test_profileRowOrb_isClearlyVisible_andStaysInsideTheCard() {
        let radius = ProfileTalkieRow.diameter / 2
        XCTAssertGreaterThanOrEqual(ProfileTalkieRow.orb.maxAmplitude, 1.6 * radius)
        XCTAssertLessThanOrEqual(ProfileTalkieRow.orb.maxAmplitude, radius + ProfileTalkieRow.orbRoom)
    }

    /// L'orbe remplace l'anneau : tant qu'elle vit, ni reflet ni anneau du décompte autour du bouton.
    func test_holdRings_hiddenWhileTheOrbShows_backAtRest() {
        XCTAssertFalse(TalkieVoiceHostLaw.holdRingsVisible(orbShows: true))
        XCTAssertTrue(TalkieVoiceHostLaw.holdRingsVisible(orbShows: false))
    }

    /// Une marge négative rentre l'orbe dans le bouton, d'autant.
    func test_holdOrb_negativeRoom_staysInsideTheButton() {
        XCTAssertEqual(TalkieVoiceHostLaw.holdOrb(buttonSize: 96, room: -4).maxAmplitude, 44)
        XCTAssertEqual(TalkieVoiceHostLaw.holdOrb(buttonSize: 10, room: -40).maxAmplitude, 0)
    }

    /// Le bouton de la fiche montre la voix qui part vers la personne comme celle qui vient d'elle.
    func test_profileRowOrb_showsForEitherDirectionOfThatPerson() {
        XCTAssertTrue(TalkieVoiceHostLaw.shows(userId: "bob", voices: [key("bob", .outgoing)]))
        XCTAssertTrue(TalkieVoiceHostLaw.shows(userId: "bob", voices: [key("bob", .incoming)]))
        XCTAssertFalse(TalkieVoiceHostLaw.shows(userId: "bob", voices: [key("alice", .outgoing)]))
        XCTAssertEqual(ProfileTalkieRow.orb.baseRadius, 0)
        XCTAssertEqual(ProfileTalkieRow.orb.maxAmplitude, ProfileTalkieRow.diameter / 2 + ProfileTalkieRow.orbRoom)
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

    // MARK: - Lu hors du fil principal

    /// La fiche lit l'état de la voix par `.values` : l'itérateur Combine demande hors du fil principal, et `@Published`
    /// y rejoue sa valeur courante. Un maillon isolé au MainActor y piégeait l'app à l'ouverture d'un profil.
    @MainActor
    func test_heroVoiceStates_readOffTheMainActor_deliversTheCurrentState() async {
        let stage = TalkieVoiceStage()
        stage.begin(userId: "bob", direction: .outgoing, at: Date())
        let observer = TalkieVoiceStageObserver(stage: stage)
        let states = OffMainHeroStates(publisher: TalkieProfileHeroVoice.make(observer: observer).states("bob"))

        let first = await Task.detached { () -> ProfileHeroVoiceState? in
            for await value in states.publisher.values { return value }
            return nil
        }.value

        XCTAssertEqual(first, .voice(captioned: true))
    }
}

private struct OffMainHeroStates: @unchecked Sendable {
    let publisher: AnyPublisher<ProfileHeroVoiceState, Never>
}
