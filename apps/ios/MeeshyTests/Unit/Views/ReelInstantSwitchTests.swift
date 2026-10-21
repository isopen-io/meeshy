import XCTest
import UIKit
import SwiftUI
@testable import Meeshy
import MeeshySDK
import MeeshyUI

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

// MARK: - Élu n'est pas posé (#10354)

@MainActor
final class ReelPlaybackRestingTests: XCTestCase {

    func test_majorityMidGesture_doesNotSettleTheIncomingReel() {
        var election = ReelPlaybackElection(activeId: "r1")
        election.scrolling(true)
        election.majority("r2")
        XCTAssertEqual(election.activeId, "r2")
        XCTAssertEqual(election.restingId, "r1", "à mi-course, le réel entrant ne fait que play() : il n'est pas posé")
    }

    func test_scrollEnd_settlesTheElectedReel() {
        var election = ReelPlaybackElection(activeId: "r1")
        election.scrolling(true)
        election.majority("r2")
        election.scrolling(false)
        XCTAssertEqual(election.restingId, "r2")
    }

    func test_positionChangeWhileStillScrolling_waitsForTheEnd() {
        var election = ReelPlaybackElection(activeId: "r1")
        election.scrolling(true)
        election.settled("r2")
        XCTAssertEqual(election.restingId, "r1", "l'inertie n'est pas finie : rien de lourd encore")
        election.scrolling(false)
        XCTAssertEqual(election.restingId, "r2")
    }

    func test_withoutScrollPhase_positionChangeSettles() {
        var election = ReelPlaybackElection(activeId: "r1")
        election.majority("r2")
        election.settled("r2")
        XCTAssertEqual(election.restingId, "r2", "iOS 17 : currentPageID ne bascule qu'une fois le paging posé")
    }

    func test_draggingBackUnderHalf_keepsTheOriginalSettled() {
        var election = ReelPlaybackElection(activeId: "r1")
        election.scrolling(true)
        election.majority("r2")
        election.majority("r1")
        election.scrolling(false)
        XCTAssertEqual(election.restingId, "r1")
        XCTAssertTrue(ReelSwitchWork.engages(isElected: election.activeId == "r1", isSettled: election.restingId == "r1"))
    }

    func test_seedSettlesAtOnce() {
        var election = ReelPlaybackElection()
        election.settled("r7")
        XCTAssertEqual(election.restingId, "r7")
    }
}

// MARK: - Garde de source : le chemin d'élection reste léger (#10354)

/// Le chemin qui s'exécute À MI-COURSE — l'élection (`elect`, la loi
/// `ReelPlaybackElection`) et l'entrée / la sortie de la page vidéo
/// (`switchIn`, `switchOut`) — ne crée aucun lecteur, ne touche pas la
/// session audio et ne construit aucun contrôleur PiP.
final class ReelElectionPathSourceGuardTests: XCTestCase {

    private static let forbidden = ["load(", "setCategory(", "setActive(", "AVPictureInPictureController(",
                                    "AVPlayer(", "AVQueuePlayer(", "AVPlayerItem(", "activatePlaybackSync(", "activateContentPlayback(",
                                    "willStartPlaying(", "configurePip("]

    private var views: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views")
    }

    private func source(_ file: String) throws -> String {
        try String(contentsOf: views.appendingPathComponent(file), encoding: .utf8)
    }

    /// Le corps d'une déclaration, de son en-tête à l'accolade qui la ferme.
    static func body(of header: String, in source: String) -> String? {
        guard let start = source.range(of: header),
              let open = source.range(of: "{", range: start.upperBound..<source.endIndex) else { return nil }
        var depth = 0
        var index = open.lowerBound
        while index < source.endIndex {
            switch source[index] {
            case "{": depth += 1
            case "}":
                depth -= 1
                if depth == 0 { return String(source[open.lowerBound...index]) }
            default: break
            }
            index = source.index(after: index)
        }
        return nil
    }

    static func offenders(in body: String) -> [String] {
        body.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.hasPrefix("//") && !$0.hasPrefix("///") }
            .filter { line in forbidden.contains { line.contains($0) } }
    }

    func test_videoSwitchInAndOut_doNoHeavyWork() throws {
        let video = try source("ReelsPlayerView+Video.swift")
        for header in ["private func switchIn(ready: Bool)", "private func switchOut()"] {
            let body = try XCTUnwrap(Self.body(of: header, in: video), "\(header) introuvable")
            XCTAssertEqual(Self.offenders(in: body), [], "\(header) fait du travail lourd à mi-course")
        }
    }

    func test_videoIsActiveChange_goesThroughTheSwitchOnly() throws {
        let video = try source("ReelsPlayerView+Video.swift")
        let body = try XCTUnwrap(Self.body(of: ".adaptiveOnChange(of: isActive)", in: video))
        XCTAssertTrue(body.contains("switchIn(ready: ready)") && body.contains("switchOut()"))
        XCTAssertFalse(body.contains("drive("), "le moteur complet attend la page posée")
    }

    func test_electionAndItsLaw_doNoHeavyWork() throws {
        let player = try source("ReelsPlayerView.swift")
        let elect = try XCTUnwrap(Self.body(of: "private func elect(trigger: String", in: player))
        XCTAssertEqual(Self.offenders(in: elect), [])
        let law = try XCTUnwrap(Self.body(of: "nonisolated struct ReelPlaybackElection", in: try source("ReelInstantSwitch.swift")))
        XCTAssertEqual(Self.offenders(in: law), [])
    }

    func test_sceneAndAudio_engageOnlyOnceSettled() throws {
        let player = try source("ReelsPlayerView.swift")
        XCTAssertTrue(player.contains("ReelSceneView(reel: reel, document: document, isActive: isEngaged,"),
                      "la scène (canvas, calques, mixer) ne démarre qu'une fois posée")
        XCTAssertTrue(player.contains(".adaptiveOnChange(of: isEngaged)"),
                      "le son d'un réel audio ne démarre qu'une fois posé")
        XCTAssertTrue(player.contains("isActive: isEngaged,"), "la porte d'autostart audio lit l'engagement")
    }

    func test_guardCatchesAHeavyCall() {
        let sample = """
        private func switchIn(ready: Bool) {
            manager.load(urlString: url)
        }
        """
        let body = Self.body(of: "private func switchIn(ready: Bool)", in: sample) ?? ""
        XCTAssertEqual(Self.offenders(in: body).count, 1)
    }
}

// MARK: - Le poster arrive net (#10354)

@MainActor
final class ReelPosterPrefetchTests: XCTestCase {

    private func reel(_ media: FeedMedia) -> FeedPost {
        FeedPost(id: "r1", author: "Awa", authorId: "u1", type: "REEL", content: "", media: [media])
    }

    private func resolved(_ raw: String) -> String {
        MeeshyConfig.resolveMediaURL(raw)?.absoluteString ?? raw
    }

    func test_videoReel_prefetchesTheThumbnailThePosterReads() {
        let media = FeedMedia(id: "m1", type: .video, url: "/u/v.mp4", thumbnailUrl: "/u/v-thumb.jpg")
        XCTAssertEqual(ReelPosterPrefetch.posterURL(for: reel(media)), resolved("/u/v-thumb.jpg"),
                       "même clé que ReelPoster(url: media.thumbnailUrl ?? media.url)")
    }

    func test_videoReelWithoutThumbnail_prefetchesNothing() {
        let media = FeedMedia(id: "m1", type: .video, url: "/u/v.mp4")
        XCTAssertNil(ReelPosterPrefetch.posterURL(for: reel(media)), "une adresse vidéo n'est pas une image")
    }

    func test_imageReel_prefetchesTheFullImageTheCellReads() {
        let media = FeedMedia(id: "m1", type: .image, url: "/u/p.jpg", thumbnailUrl: "/u/p-thumb.jpg")
        XCTAssertEqual(ReelPosterPrefetch.posterURL(for: reel(media)), resolved("/u/p.jpg"),
                       "même clé que ReelImageCell(fullUrl: media.url ?? media.thumbnailUrl)")
    }

    func test_audioReel_hasNoPoster() {
        let media = FeedMedia(id: "m1", type: .audio, url: "/u/a.m4a")
        XCTAssertNil(ReelPosterPrefetch.posterURL(for: reel(media)))
    }

    func test_decodeSize_isTheScreen_boundedByTheSyncCap() {
        XCTAssertEqual(ReelPosterPrefetch.pixelSize(screenPoints: CGSize(width: 440, height: 956), scale: 3),
                       DiskCacheStore.warmedPixelCap)
        XCTAssertEqual(ReelPosterPrefetch.pixelSize(screenPoints: CGSize(width: 320, height: 568), scale: 2), 1136)
    }

    func test_decodeSize_sharesTheSlotThePageReadsAtInit() {
        XCTAssertGreaterThan(ReelPosterPrefetch.pixelSize(screenPoints: CGSize(width: 390, height: 844), scale: 3),
                             DiskCacheStore.fullFormatPixelCap,
                             "au-dessus de 1 200 px, la variante occupe le slot plein format lu par residentImage")
    }

    func test_prefetchedPoster_isServedFromMemory() {
        let url = resolved("/u/poster-\(UUID().uuidString).jpg")
        XCTAssertNil(WarmImageProbe.residentImage(for: url))
        let poster = UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4)).image { _ in }
        DiskCacheStore.cacheImageForPreview(poster, key: url)
        XCTAssertNotNil(WarmImageProbe.residentImage(for: url),
                        "le poster préchargé est servi par le cache mémoire, à l'init de la page, sans disque")
    }
}

/// **Revenir sur un réel le reprend à l'instant (#10354).**
///
/// Le pool de lecteurs rend le plus LOIN du réel affiché quand il déborde : le
/// réel qu'on vient de quitter garde son lecteur, sa tête et sa dernière image.
/// La loi d'éviction est témoignée dans le SDK (`PlaybackResumeLawTests`) ; ici,
/// la carte des distances que l'écran des réels lui déclare.
@MainActor
final class ReelResumeTests: XCTestCase {

    private static let base = "https://gate.meeshy.me/api/v1/attachments/file"

    private func videoReel(_ id: String, file: String? = nil) -> FeedPost {
        FeedPost(id: id, author: "alice", authorId: "u1", type: "REEL", content: "",
                 media: [FeedMedia(id: "m-\(id)", type: .video, url: "\(Self.base)/\(file ?? id).mp4")])
    }

    private func imageReel(_ id: String) -> FeedPost {
        FeedPost(id: id, author: "alice", authorId: "u1", type: "REEL", content: "",
                 media: [FeedMedia(id: "m-\(id)", type: .image, url: "\(Self.base)/\(id).jpg")])
    }

    private func key(_ reel: FeedPost) -> String {
        ReelPrewarm.videoURL(for: reel)!.absoluteString
    }

    func test_distances_signedFromTheDisplayedReel() {
        let reels = (0..<5).map { videoReel("r\($0)") }

        let distances = ReelPagerPreloader.retentionDistances(reels: reels, activeIndex: 2)

        XCTAssertEqual(distances[key(reels[1])], -1, "le réel qu'on vient de quitter est un voisin")
        XCTAssertEqual(distances[key(reels[3])], 1)
        XCTAssertEqual(distances[key(reels[0])], -2)
        XCTAssertEqual(distances[key(reels[4])], 2)
        XCTAssertEqual(distances[key(reels[2])], 0)
    }

    func test_distances_skipReelsWithoutVideo() {
        let reels = [videoReel("v0"), imageReel("i1"), videoReel("v2")]

        let distances = ReelPagerPreloader.retentionDistances(reels: reels, activeIndex: 1)

        XCTAssertEqual(distances.count, 2)
    }

    func test_distances_sameVideoTwice_keepsTheClosest() {
        let reels = [videoReel("a", file: "same"), videoReel("b"), videoReel("c"), videoReel("d", file: "same")]

        let distances = ReelPagerPreloader.retentionDistances(reels: reels, activeIndex: 2)

        XCTAssertEqual(distances[key(reels[3])], 1)
    }

    func test_distances_beyondTheRadius_areNotDeclared() {
        let reels = (0..<30).map { videoReel("r\($0)") }

        let distances = ReelPagerPreloader.retentionDistances(reels: reels, activeIndex: 0, radius: 10)

        XCTAssertNil(distances[key(reels[11])])
        XCTAssertEqual(distances[key(reels[10])], 10)
    }

    func test_prewarm_prerollsTheNeighbourAtItsResume() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/ReelPrewarm.swift"))
        XCTAssertTrue(source.contains("preloadAndCachePlayer(url: url, resume: resumePosition(of: post))"))
        XCTAssertTrue(source.contains("MediaResumeResolver.resumePosition("),
                      "la reprise du voisin se résout comme celle du moteur, par le résolveur partagé")
    }

    /// Le tier média (#11281) entre dans le contexte vivant : la fenêtre des
    /// réels ne se règle pas sur la seule mémoire.
    func test_liveContext_carriesTheDeviceMediaTier() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/ReelPrewarm.swift"))
        XCTAssertTrue(source.contains("tier: DeviceMediaTier.current"))
    }

    /// Avec ces distances, le pool garde le réel quitté face à un préchauffage
    /// plus lointain arrivé après lui.
    func test_distancesFeedThePoolEviction_keepingTheReelJustLeft() {
        let reels = (0..<6).map { videoReel("r\($0)") }
        let distances = ReelPagerPreloader.retentionDistances(reels: reels, activeIndex: 2)

        let victim = PlayerPoolEviction.victim(
            order: [key(reels[1]), key(reels[5]), key(reels[3]), key(reels[4])],
            distances: distances)

        XCTAssertEqual(victim, key(reels[5]))
    }
}

/// **Sous les réels, rien ne travaille (#10354).** La liste des conversations,
/// montée sous la couche des réels, se réévaluait à chaque rendu de la racine
/// (`MeeshyAvatar.body`, `StoryCoverURLMemo.coverURL` au profil Release).
@MainActor
final class ReelsCoverTests: XCTestCase {

    func test_cover_onlyOnceTheRevealHasCompleted() {
        XCTAssertTrue(ReelsCover.isCovered(hasLaunch: true, revealCompleted: true))
        XCTAssertFalse(ReelsCover.isCovered(hasLaunch: true, revealCompleted: false),
                       "pendant le disque d'ouverture et dès la fermeture, la liste se voit")
        XCTAssertFalse(ReelsCover.isCovered(hasLaunch: false, revealCompleted: true))
    }

    func test_freeze_twoCoveredValuesAreEqual_soTheBodyIsNotReevaluated() {
        XCTAssertEqual(CoveredFreeze(isCovered: true) { Text("a") },
                       CoveredFreeze(isCovered: true) { Text("b") })
    }

    func test_freeze_anyUncoveredValue_reevaluates() {
        XCTAssertNotEqual(CoveredFreeze(isCovered: false) { Text("a") },
                          CoveredFreeze(isCovered: false) { Text("a") },
                          "découverte, la liste suit chaque rendu de la racine, comme avant")
        XCTAssertNotEqual(CoveredFreeze(isCovered: true) { Text("a") },
                          CoveredFreeze(isCovered: false) { Text("a") },
                          "au découvrement, la liste se remet à jour")
    }

    func test_root_freezesTheListAndHidesWhatTheReelsCover() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/RootView.swift"))
        XCTAssertTrue(source.contains("CoveredFreeze(isCovered: reelsCoverScreen) { ConversationListView("))
        XCTAssertTrue(source.contains(".equatable()"))
        XCTAssertEqual(source.components(separatedBy: ".opacity(reelsCoverScreen ? 0 : 1)").count - 1, 2,
                       "la pile de navigation et le fil ne se composent plus sous les réels")
    }
}
