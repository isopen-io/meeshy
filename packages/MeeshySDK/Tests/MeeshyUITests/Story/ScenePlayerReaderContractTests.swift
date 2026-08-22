import XCTest
import SwiftUI
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// C0a — le delta d'API qui OUVRE `MeeshyScenePlayer` à ce que le viewer story
/// tient à son hôte canvas, SANS relâcher le mode `.card`.
///
/// Le contrat B4 gelé ne portait que `(document:mode:sceneIndex:isPlaying:accentColorHex:)`
/// et enveloppait un `StoryItem` SYNTHÉTIQUE dont `media` valait `[]`. Trois
/// manques en découlaient, chacun couvert ici :
///
/// 1. **Le porteur.** Sans `StoryItem.media`, `toRenderableSlide` perd son
///    hydratation read-time — `aspectRatio` (source de dimensionnement
///    PRIMAIRE : le composer stampe toujours la sentinelle 1.0), `duration`,
///    `audio.mediaURL`, le backdrop legacy — et le résolveur de `makeUIView`
///    perd son repli distant par `postMediaId`.
/// 2. **Le muet.** `isMuted = (mode == .card)` était un VERROU pour les trois
///    modes ; le viewer story a son propre `isGlobalMuted` piloté au rail. Le
///    mode doit poser un DÉFAUT pour `.reader`/`.preview`, et rester un verrou
///    pour `.card` (E3 s'y adosse par assertion vivante).
/// 3. **Les huit fils.** preloaded{Images,VideoURLs,AudioURLs}, onContentReady,
///    onContentProgress, onPlaybackProgressing, isOutgoing, et la chaîne de
///    langues du LECTEUR — laquelle doit voyager par l'INIT, seule fenêtre que
///    la garde de couture d'E4 (`StoryViewerScenePlayerGuardTests.callWindows`)
///    sait lire : un modificateur chaîné tombe HORS de l'appel équilibré.
@MainActor
final class ScenePlayerReaderContractTests: XCTestCase {

    // MARK: - (a) Le porteur : le player sert le StoryItem RÉEL, pas une coquille

    func test_theHostServesTheCarrierMediaIndex_notAnEmptyOne() {
        XCTAssertEqual(
            Self.player(mode: .reader, carrier: Self.carrier()).host.storyItem.media.map(\.id),
            ["media-carrier", "media-audio", "media-backdrop"],
            "Sans l'index des médias du porteur, le résolveur de makeUIView n'a plus de repli "
            + "distant par postMediaId : la story d'un autre reste noire."
        )
    }

    func test_withoutACarrier_theHostKeepsTheSyntheticItem() {
        XCTAssertTrue(Self.player(mode: .reader).host.storyItem.media.isEmpty,
                      "Le porteur est facultatif : les appelants B4 existants ne changent pas.")
    }

    func test_theCarrierRestoresThePrimaryDimensioning_theReadTimeAspectRatio() throws {
        let media = try XCTUnwrap(Self.slide(carrier: Self.carrier()).effects.mediaObjects?.first)
        XCTAssertEqual(media.aspectRatio, 1080.0 / 1920.0, accuracy: 0.0001,
                       "L'hydratation read-time depuis FeedMedia.width/height EST la source de "
                       + "dimensionnement primaire — sans elle un média non carré s'affiche squishé.")
    }

    func test_withoutTheCarrier_theAspectRatioStaysOnItsSentinel() throws {
        let media = try XCTUnwrap(Self.slide(carrier: nil).effects.mediaObjects?.first)
        XCTAssertEqual(media.aspectRatio, 1.0, accuracy: 0.0001,
                       "Le pendant NÉGATIF : sans porteur la sentinelle 1.0 du composer reste "
                       + "en place. C'est ce que le contrat B4 servait au viewer.")
    }

    func test_theCarrierRestoresTheMediaDuration_soTheTimelineIsNotTruncated() throws {
        let media = try XCTUnwrap(Self.slide(carrier: Self.carrier()).effects.mediaObjects?.first)
        XCTAssertEqual(media.duration, 12)
    }

    func test_theCarrierRestoresTheAudioAddress_keyedByPostMediaId() throws {
        let audio = try XCTUnwrap(Self.slide(carrier: Self.carrier()).effects.audioPlayerObjects?.first)
        XCTAssertEqual(audio.mediaURL, "https://cdn.meeshy.me/a.m4a",
                       "postMediaId n'est résolvable que par un consommateur qui porte l'index "
                       + "des médias : sans le porteur, l'export bakait un MP4 muet.")
    }

    func test_theCarrierRestoresTheLegacyBackdrop_theMediaNoObjectReferences() {
        XCTAssertEqual(Self.slide(carrier: Self.carrier()).mediaURL, "https://cdn.meeshy.me/bg.jpg",
                       "Le fond statique est l'entrée media qu'AUCUN objet ne référence — sans "
                       + "elle renderBackground retombe sur du NOIR.")
    }

    func test_withoutTheCarrier_thereIsNoBackdropToRoute() {
        XCTAssertNil(Self.slide(carrier: nil).mediaURL)
    }

    func test_theCarrierCaption_followsTheReaderPrism() {
        XCTAssertEqual(Self.slide(carrier: Self.carrier(), languages: ["fr"]).content, "Bonjour")
        XCTAssertEqual(Self.slide(carrier: Self.carrier(), languages: ["de"]).content, "Hello",
                       "Prisme règle n°1 : aucune langue ne sert ⇒ l'ORIGINAL, jamais "
                       + "translations.first.")
    }

    // MARK: - (a bis) L'identité de l'hôte : le porteur en est la RACINE

    func test_twoLegacyStoriesDoNotCollide_onTheHardcodedSceneIdentity() {
        let first = Self.player(mode: .reader, carrier: Self.carrier(id: "story-1")).host.storyItem.id
        let second = Self.player(mode: .reader, carrier: Self.carrier(id: "story-2")).host.storyItem.id
        XCTAssertNotEqual(first, second,
                          "CanvasV3(migrating:) fabrique SceneV3(id: \"s1\") EN DUR : l'identité "
                          + "de scène seule confondrait toute story legacy, et updateUIView ne "
                          + "verrait jamais identityChanged.")
    }

    func test_theCarrierIsTheRootOfTheHostIdentity() {
        XCTAssertEqual(MeeshyScenePlayer.hostIdentity(carrierId: "story-1", sceneId: "s1", loopPass: 0),
                       "story-1@s1")
        XCTAssertEqual(MeeshyScenePlayer.hostIdentity(carrierId: "story-1", sceneId: "s1", loopPass: 2),
                       "story-1@s1#2")
    }

    func test_theSceneStillRefinesTheIdentity_soAMultiSceneDocumentReplaysEachScene() {
        XCTAssertNotEqual(MeeshyScenePlayer.hostIdentity(carrierId: "story-1", sceneId: "a", loopPass: 0),
                          MeeshyScenePlayer.hostIdentity(carrierId: "story-1", sceneId: "b", loopPass: 0))
    }

    func test_withoutACarrier_theIdentityIsTheB4One() {
        XCTAssertEqual(MeeshyScenePlayer.hostIdentity(sceneId: "s1", loopPass: 0), "s1")
        XCTAssertEqual(MeeshyScenePlayer.hostIdentity(sceneId: "s1", loopPass: 2), "s1#2")
    }

    // MARK: - (b) Le muet : un DÉFAUT du mode, un VERROU pour la seule carte

    func test_theReaderTakesTheViewerMute_theModeOnlyDefaultsIt() {
        XCTAssertTrue(Self.player(mode: .reader, isMuted: true).host.mute,
                      "Le viewer story a son isGlobalMuted persistant : .reader DOIT pouvoir "
                      + "être muet.")
        XCTAssertFalse(Self.player(mode: .reader, isMuted: false).host.mute)
        XCTAssertFalse(Self.player(mode: .reader).host.mute,
                       "Sans commande, le mode garde son défaut.")
    }

    func test_thePreviewTakesTheViewerMuteToo() {
        XCTAssertTrue(Self.player(mode: .preview, isMuted: true).host.mute)
        XCTAssertFalse(Self.player(mode: .preview).host.mute)
    }

    func test_theCardStaysMutedByConstruction_evenWhenAskedToUnmute() {
        XCTAssertTrue(Self.player(mode: .card, isMuted: false).host.mute,
                      "E3 s'appuie sur ce verrou par assertion vivante "
                      + "(MuteButtonExistenceGuardTests) : la carte de fil n'a pas de bouton de "
                      + "son parce qu'elle est muette PAR CONSTRUCTION.")
    }

    func test_onlyTheCardLocksItsMute() {
        XCTAssertTrue(ScenePlayerConfig(mode: .card).locksMute)
        XCTAssertFalse(ScenePlayerConfig(mode: .reader).locksMute)
        XCTAssertFalse(ScenePlayerConfig(mode: .preview).locksMute)
    }

    func test_theMuteRule_isPure() {
        XCTAssertTrue(MeeshyScenePlayer.hostMute(config: ScenePlayerConfig(mode: .card),
                                                 requestedMute: false))
        XCTAssertTrue(MeeshyScenePlayer.hostMute(config: ScenePlayerConfig(mode: .reader),
                                                 requestedMute: true))
        XCTAssertFalse(MeeshyScenePlayer.hostMute(config: ScenePlayerConfig(mode: .reader),
                                                  requestedMute: false))
        XCTAssertFalse(MeeshyScenePlayer.hostMute(config: ScenePlayerConfig(mode: .reader),
                                                  requestedMute: nil))
        XCTAssertTrue(MeeshyScenePlayer.hostMute(config: ScenePlayerConfig(mode: .card),
                                                 requestedMute: nil))
    }

    // MARK: - (c) Les huit fils : chacun son canal, DANS l'init

    func test_thePreloadedAssetsReachTheHost() {
        let video = URL(fileURLWithPath: "/tmp/scene-player-video.mp4")
        let audio = URL(fileURLWithPath: "/tmp/scene-player-audio.m4a")
        let player = Self.player(mode: .reader,
                                 preloadedImages: ["media-carrier": UIImage()],
                                 preloadedVideoURLs: ["media-carrier": video],
                                 preloadedAudioURLs: ["media-audio": audio])
        XCTAssertEqual(Array(player.host.preloadedImages.keys), ["media-carrier"])
        XCTAssertEqual(player.host.preloadedVideoURLs["media-carrier"], video)
        XCTAssertEqual(player.host.preloadedAudioURLs["media-audio"], audio,
                       "Les clips composer non publiés sont keyés par audio.id : c'est le seul "
                       + "chemin par lequel le mixer les entend.")
    }

    func test_withoutPreloadedAssets_theHostGetsEmptyMaps() {
        let player = Self.player(mode: .reader)
        XCTAssertTrue(player.host.preloadedImages.isEmpty)
        XCTAssertTrue(player.host.preloadedVideoURLs.isEmpty)
        XCTAssertTrue(player.host.preloadedAudioURLs.isEmpty)
    }

    func test_theContentGateReachesTheHost() {
        var openings = 0
        Self.player(mode: .reader, onContentReady: { openings += 1 }).host.onContentReady?()
        XCTAssertEqual(openings, 1,
                       "onContentReady arme la porte du rail : sans ce fil, le rail part avant "
                       + "que le contenu soit affichable.")
    }

    func test_theLoadingFractionReachesTheHost() {
        var fractions: [Double] = []
        Self.player(mode: .reader, onContentProgress: { fractions.append($0) }).host.onContentProgress?(0.42)
        XCTAssertEqual(fractions, [0.42],
                       "Sans ce fil, la fraction reste à 0 et StoryReaderLoadingOverlay ne se "
                       + "retire jamais.")
    }

    func test_theStallSignalReachesTheHost() {
        var signals: [Bool] = []
        Self.player(mode: .reader, onPlaybackProgressing: { signals.append($0) })
            .host.onPlaybackProgressing?(false)
        XCTAssertEqual(signals, [false],
                       "Timeline unifiée : sans ce fil, le rail avance sur une vidéo qui bufferise.")
    }

    func test_withoutThoseThreads_theHostReceivesNone() {
        let player = Self.player(mode: .reader)
        XCTAssertNil(player.host.onContentReady)
        XCTAssertNil(player.host.onContentProgress)
        XCTAssertNil(player.host.onPlaybackProgressing)
    }

    func test_theOutgoingCanvasIsBornInEditMode() {
        XCTAssertTrue(Self.player(mode: .reader, isOutgoing: true).host.isOutgoing,
                      "Le canvas SORTANT du cross-fade ne démarre jamais ses AVPlayer ni son "
                      + "mixer : sans ce fil, les deux canvas jouent en double 350-400 ms.")
        XCTAssertFalse(Self.player(mode: .reader).host.isOutgoing)
    }

    func test_theReaderPrismTravelsByTheInit_notOnlyByTheModifier() {
        XCTAssertEqual(Self.player(mode: .reader, languages: ["fr", "en"]).host.preferredLanguages,
                       ["fr", "en"],
                       "La garde de couture d'E4 lit la fenêtre ÉQUILIBRÉE de l'appel : un "
                       + "modificateur chaîné tombe hors de cette fenêtre.")
    }

    func test_theChainedModifierStillWins_forTheCallSitesThatUseIt() {
        XCTAssertEqual(Self.player(mode: .card).preferredContentLanguages(["es"]).host.preferredLanguages,
                       ["es"],
                       "Non-régression E3 : FeedPostCard chaîne .preferredContentLanguages(...).")
    }

    // MARK: - Non-régression : `.card` garde tout son verrou sous les canaux neufs

    func test_theCardKeepsEveryLock_underTheNewChannels() {
        let card = Self.player(mode: .card,
                               carrier: Self.carrier(),
                               isPlaying: true,
                               isMuted: false,
                               languages: ["fr"])
        XCTAssertTrue(card.host.mute, "muet PAR CONSTRUCTION")
        XCTAssertTrue(card.host.isPaused, "née en pause, quoi que dise la commande")
        XCTAssertNotNil(card.host.onCompletion, "la carte se relance elle-même")
        XCTAssertNil(card.onPlaybackTime { _ in }.host.onPlaybackTime,
                     "la carte ne paie pas le fil de position")
    }

    // MARK: - Fixtures

    private static func slide(carrier: StoryItem?, languages: [String] = []) -> StorySlide {
        player(mode: .reader, carrier: carrier).host.storyItem
            .toRenderableSlide(preferredLanguages: languages)
    }

    private static func player(mode: ScenePlayerMode,
                               carrier: StoryItem? = nil,
                               sceneIndex: Int = 0,
                               isPlaying: Bool = false,
                               isMuted: Bool? = nil,
                               isOutgoing: Bool = false,
                               languages: [String] = [],
                               preloadedImages: [String: UIImage] = [:],
                               preloadedVideoURLs: [String: URL] = [:],
                               preloadedAudioURLs: [String: URL] = [:],
                               onContentReady: (() -> Void)? = nil,
                               onContentProgress: ((Double) -> Void)? = nil,
                               onPlaybackProgressing: ((Bool) -> Void)? = nil) -> MeeshyScenePlayer {
        MeeshyScenePlayer(document: CanvasV3(scenes: [readerScene()]),
                          mode: mode,
                          sceneIndex: .constant(sceneIndex),
                          isPlaying: .constant(isPlaying),
                          accentColorHex: "#7C3AED",
                          carrier: carrier,
                          preferredContentLanguages: languages,
                          isMuted: isMuted,
                          isOutgoing: isOutgoing,
                          preloadedImages: preloadedImages,
                          preloadedVideoURLs: preloadedVideoURLs,
                          preloadedAudioURLs: preloadedAudioURLs,
                          onContentReady: onContentReady,
                          onContentProgress: onContentProgress,
                          onPlaybackProgressing: onPlaybackProgressing)
    }

    /// Une scène de lecture complète : un fond de couleur, le média PORTEUR,
    /// un clip audio, un texte traduit. Aucun `aspectRatio` ni `duration` au
    /// payload — exactement ce que le composer publie (sentinelle 1.0).
    private static func readerScene(id: String = "s1") -> SceneV3 {
        SceneV3(id: id, objects: [
            ObjectV3(id: "bg", kind: .media,
                     anchor: .free(x: 0.5, y: 0.5), plane: .bg, z: 0,
                     transform: TransformV3(),
                     payload: ["background": .string("#000000")]),
            ObjectV3(id: "m1", kind: .media,
                     anchor: .free(x: 0.5, y: 0.5), plane: .content, z: 1,
                     transform: TransformV3(),
                     payload: ["postMediaId": .string("media-carrier"),
                               "mediaType": .string("video")]),
            ObjectV3(id: "a1", kind: .audio,
                     anchor: .free(x: 0.5, y: 0.5), plane: .fg, z: 2,
                     transform: TransformV3(),
                     payload: ["postMediaId": .string("media-audio")]),
            ObjectV3(id: "t1", kind: .text,
                     anchor: .free(x: 0.5, y: 0.5), plane: .fg, z: 3,
                     transform: TransformV3(), locale: "en",
                     payload: ["text": .string("Hello"),
                               "translations": .object(["fr": .string("Bonjour")])]),
        ])
    }

    /// Le PORTEUR tel que le viewer le tient : son id, sa légende traduite et
    /// son index de médias — dont le backdrop legacy qu'aucun objet ne référence.
    private static func carrier(id: String = "story-42") -> StoryItem {
        StoryItem(id: id,
                  content: "Hello",
                  media: [
                    FeedMedia(id: "media-carrier", type: .video,
                              url: "https://cdn.meeshy.me/v.mp4",
                              width: 1080, height: 1920, duration: 12),
                    FeedMedia(id: "media-audio", type: .audio,
                              url: "https://cdn.meeshy.me/a.m4a", duration: 30),
                    FeedMedia(id: "media-backdrop", type: .image,
                              url: "https://cdn.meeshy.me/bg.jpg"),
                  ],
                  createdAt: Date(timeIntervalSince1970: 1_700_000_000),
                  translations: [StoryTranslation(language: "fr", content: "Bonjour")])
    }
}
