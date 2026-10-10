import XCTest
@testable import Meeshy
import MeeshySDK

/// Le réel suivant joue dès qu'on y arrive (#9837) : quand il devient actif,
/// quelle image sa page montre, quel son on lui précharge, et ce qu'on mesure.
@MainActor
final class ReelInstantSwitchTests: XCTestCase {

    // MARK: - Élection : pendant le geste, pas après la décélération

    func test_election_neighbourBecomesActive_assoonAsItIsMajority_beforeTheGestureSettles() {
        var election = ReelPlaybackElection(activeId: "r1")
        election.majority("r2")
        XCTAssertEqual(election.activeId, "r2",
                       "le voisin passe la moitié de l'écran : il joue sans attendre la fin du geste")
    }

    func test_election_draggingBackUnderHalf_givesThePreviousReelBack() {
        var election = ReelPlaybackElection(activeId: "r1")
        election.majority("r2")
        election.majority("r1")
        XCTAssertEqual(election.activeId, "r1")
    }

    func test_election_settledGesture_confirms_andACodeDrivenPageImposesItself() {
        var election = ReelPlaybackElection(activeId: "r1")
        election.majority("r2")
        election.settled("r2")
        XCTAssertEqual(election.activeId, "r2")
        election.settled("r7")
        XCTAssertEqual(election.activeId, "r7", "une page posée par le code (seed, lien) s'impose")
    }

    func test_election_emptyPager_keepsTheLastReel() {
        var election = ReelPlaybackElection(activeId: "r1")
        election.settled(nil)
        XCTAssertEqual(election.activeId, "r1")
    }

    // MARK: - Image : la surface vidéo

    private final class Player {}

    func test_display_neighbourShowsItsPrerolledPlayer_paused() {
        let pooled = Player()
        let shown = ReelVideoDisplay.player(engineShowsThis: false, enginePlayer: Player(), pooledPlayer: pooled)
        XCTAssertTrue(shown === pooled, "la première image du voisin est déjà rendue avant qu'il n'arrive")
    }

    func test_display_activeReelShowsTheEngine_whichAdoptedTheSameInstance() {
        let adopted = Player()
        let shown = ReelVideoDisplay.player(engineShowsThis: true, enginePlayer: adopted, pooledPlayer: nil)
        XCTAssertTrue(shown === adopted)
    }

    func test_display_leavingReelKeepsItsImage_insteadOfFallingBackToThePoster() {
        let engine = Player()
        let shown = ReelVideoDisplay.player(engineShowsThis: true, enginePlayer: engine, pooledPlayer: Player())
        XCTAssertTrue(shown === engine)
    }

    func test_display_nothingPrepared_showsThePoster() {
        XCTAssertNil(ReelVideoDisplay.player(engineShowsThis: false, enginePlayer: Player(), pooledPlayer: nil as Player?))
        XCTAssertNil(ReelVideoDisplay.player(engineShowsThis: true, enginePlayer: nil as Player?, pooledPlayer: nil))
    }

    // MARK: - Son : ce qu'on précharge, et à quel palier

    func test_audioPrefetch_nearTiersPreloadSound_fartherTiersLeaveTheBandwidthToVideo() {
        XCTAssertTrue(ReelAudioPrefetch.prefetches(tier: .decode))
        XCTAssertTrue(ReelAudioPrefetch.prefetches(tier: .mount))
        XCTAssertFalse(ReelAudioPrefetch.prefetches(tier: .prime))
        XCTAssertFalse(ReelAudioPrefetch.prefetches(tier: .idle))
        XCTAssertFalse(ReelAudioPrefetch.prefetches(tier: .play), "le réel actif charge le sien lui-même")
    }

    private static let base = "https://gate.meeshy.me/api/v1/attachments/file"

    private func audioReel(translations: [MessageTranslatedAudio] = [], language: String = "en") -> FeedPost {
        FeedPost(id: "a1", author: "alice", authorId: "u1", type: "REEL", content: "",
                 media: [FeedMedia(id: "m1", type: .audio, url: "\(Self.base)/voice.m4a",
                                   transcription: MessageTranscription(attachmentId: "m1", text: "hi",
                                                                      language: language, confidence: 1),
                                   translatedAudios: translations)],
                 originalLanguage: language)
    }

    private func track(_ lang: String) -> MessageTranslatedAudio {
        MessageTranslatedAudio(id: "t-\(lang)", attachmentId: "m1", targetLanguage: lang,
                               url: "\(Self.base)/voice-\(lang).m4a", transcription: "…", durationMs: 3_000,
                               format: "m4a", cloned: false, quality: 0.9, ttsModel: "tts")
    }

    func test_audioPrefetch_audioReel_preloadsTheTrackThePrismWillPlay() {
        let reel = audioReel(translations: [track("es"), track("fr")])
        XCTAssertEqual(ReelAudioPrefetch.urls(for: reel, preferredLanguages: ["fr"]).map(\.absoluteString),
                       ["\(Self.base)/voice-fr.m4a"],
                       "lecteur francophone, vocal anglais, TTS français disponible : c'est lui qui jouera")
    }

    func test_audioPrefetch_audioReel_withoutAPreferredTrack_preloadsTheOriginal() {
        let reel = audioReel(translations: [track("es")])
        XCTAssertEqual(ReelAudioPrefetch.urls(for: reel, preferredLanguages: ["fr"]).map(\.absoluteString),
                       ["\(Self.base)/voice.m4a"])
    }

    func test_audioPrefetch_borrowedSound_preloadsTheBackgroundTrack() {
        var reel = FeedPost(id: "b1", author: "alice", authorId: "u1", type: "REEL", content: "")
        var effects = StoryEffects()
        effects.audioPlayerObjects = [StoryAudioPlayerObject(id: "snd", isBackground: true,
                                                             mediaURL: "\(Self.base)/sound.mp3")]
        reel.storyEffects = effects
        XCTAssertEqual(ReelAudioPrefetch.urls(for: reel, preferredLanguages: ["fr"]).map(\.absoluteString),
                       ["\(Self.base)/sound.mp3"])
    }

    func test_audioPrefetch_silentReel_preloadsNothing() {
        let reel = FeedPost(id: "v1", author: "alice", authorId: "u1", type: "REEL", content: "",
                            media: [FeedMedia(id: "m1", type: .image, url: "\(Self.base)/photo.jpg")])
        XCTAssertTrue(ReelAudioPrefetch.urls(for: reel, preferredLanguages: ["fr"]).isEmpty)
    }

    // MARK: - Mesure

    func test_meter_measuresElectionToFirstMedia_once() {
        var meter = ReelSwitchMeter()
        meter.elect("r2", at: 10.000)
        XCTAssertEqual(meter.mediaStarted("r2", at: 10.084), 84)
        XCTAssertNil(meter.mediaStarted("r2", at: 10.200), "un passage se mesure une fois")
    }

    func test_meter_ignoresTheMediaOfAnotherReel() {
        var meter = ReelSwitchMeter()
        meter.elect("r2", at: 10)
        XCTAssertNil(meter.mediaStarted("r1", at: 10.05), "le réel quitté qui joue encore ne ferme pas la mesure")
        meter.elect("r3", at: 11)
        XCTAssertNil(meter.mediaStarted("r2", at: 11.1), "une nouvelle élection remplace la mesure en cours")
        XCTAssertEqual(meter.mediaStarted("r3", at: 11.5), 500)
    }
}
