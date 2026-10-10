import XCTest
import AVFoundation
@testable import MeeshyUI

/// **Une vidéo ne joue qu'à UN endroit** (#9575, directive porteur 2026-10-07).
///
/// Le moteur partagé tient un seul `AVPlayer`, et sept surfaces le montaient
/// sur le seul critère « l'URL active est la mienne ». Pendant un PiP, la bulle
/// d'origine remontait donc le MÊME player dans sa propre couche : deux images
/// pour une lecture. Le verdict est une fonction pure du moteur — les surfaces
/// ne réécrivent plus le prédicat.
final class VideoSurfaceMountVerdictTests: XCTestCase {

    private static let media = "https://cdn.meeshy.me/a.mp4"

    private func verdict(_ role: VideoSurfaceRole,
                         surface: String = VideoSurfaceMountVerdictTests.media,
                         active: String = VideoSurfaceMountVerdictTests.media,
                         pip: Bool) -> Bool {
        SharedAVPlayerManager.mayMountPlayer(role: role,
                                             surfaceMedia: surface,
                                             activeMedia: active,
                                             isPipActive: pip)
    }

    // MARK: - Le verdict de montage

    func test_inline_mountsItsOwnMedia_whenNoPipIsActive() {
        XCTAssertTrue(verdict(.inline, pip: false))
    }

    func test_inline_neverMounts_whileThePipWindowPlays() {
        XCTAssertFalse(verdict(.inline, pip: true),
                       "la bulle rend sa vignette tant que la fenêtre PiP joue : une vidéo, un endroit")
    }

    func test_fullscreen_mountsEvenDuringPip_becauseItTakesTheVideoBack() {
        XCTAssertTrue(verdict(.fullscreen, pip: true),
                      "le plein écran REPREND la vidéo : c'est lui qui arrête le PiP, pas l'inverse")
        XCTAssertTrue(verdict(.fullscreen, pip: false))
    }

    func test_pictureInPicture_existsOnlyWhileThePipIsActive() {
        XCTAssertTrue(verdict(.pictureInPicture, pip: true))
        XCTAssertFalse(verdict(.pictureInPicture, pip: false))
    }

    func test_noRole_mountsAnotherMedia() {
        for role in [VideoSurfaceRole.inline, .fullscreen, .pictureInPicture] {
            XCTAssertFalse(verdict(role, active: "https://cdn.meeshy.me/b.mp4", pip: false), "\(role)")
            XCTAssertFalse(verdict(role, active: "https://cdn.meeshy.me/b.mp4", pip: true), "\(role)")
        }
    }

    func test_noRole_mountsWhenNothingIsLoaded() {
        for role in [VideoSurfaceRole.inline, .fullscreen, .pictureInPicture] {
            XCTAssertFalse(verdict(role, surface: "", active: "", pip: false),
                           "deux identités VIDES ne sont pas « le même média » (\(role))")
            XCTAssertFalse(verdict(role, active: "", pip: true), "\(role)")
        }
    }

    // MARK: - Le plein écran reprend la vidéo au PiP

    func test_fullscreenReclaimsPip_onlyForItsOwnMedia_andOnlyWhilePipIsActive() {
        XCTAssertTrue(SharedAVPlayerManager.fullscreenReclaimsPip(
            surfaceMedia: Self.media, activeMedia: Self.media, isPipActive: true))
        XCTAssertFalse(SharedAVPlayerManager.fullscreenReclaimsPip(
            surfaceMedia: Self.media, activeMedia: Self.media, isPipActive: false),
            "rien à reprendre : aucun arrêt de PiP ne part à vide")
        XCTAssertFalse(SharedAVPlayerManager.fullscreenReclaimsPip(
            surfaceMedia: Self.media, activeMedia: "https://cdn.meeshy.me/b.mp4", isPipActive: true),
            "le PiP d'un AUTRE média n'est pas à cette surface")
    }

    // MARK: - Fermer le plein écran

    func test_closingFullscreen_keepsPlaying_onlyWhenThePipTookOver() {
        XCTAssertEqual(SharedAVPlayerManager.fullscreenCloseDisposition(pipHandedOff: true),
                       .keepsPlayingInPip)
        XCTAssertEqual(SharedAVPlayerManager.fullscreenCloseDisposition(pipHandedOff: false),
                       .stops,
                       "sans PiP, fermer arrête : la bulle derrière ne joue pas sans qu'on l'ait demandé")
    }

    // MARK: - Le moteur vivant répond par la même fonction

    @MainActor
    func test_theLiveEngine_answersThroughTheSameVerdict() {
        let manager = SharedAVPlayerManager.shared
        let previousURL = manager.activeURL
        let previousPip = manager.isPipActive
        defer {
            manager.activeURL = previousURL
            manager.isPipActive = previousPip
        }

        manager.activeURL = Self.media
        manager.isPipActive = false
        XCTAssertTrue(manager.mayMountPlayer(role: .inline, urlString: Self.media))

        manager.isPipActive = true
        XCTAssertFalse(manager.mayMountPlayer(role: .inline, urlString: Self.media))
        XCTAssertTrue(manager.mayMountPlayer(role: .fullscreen, urlString: Self.media))
    }

    @MainActor
    func test_theCarrierPlayer_isDeclinedToAnInlineSurface_whileThePipPlays() {
        let manager = SharedAVPlayerManager.shared
        let previousPlayer = manager.player
        let previousAttachment = manager.attachmentId
        let previousPip = manager.isPipActive
        defer {
            manager.player = previousPlayer
            manager.attachmentId = previousAttachment
            manager.isPipActive = previousPip
        }
        let shared = AVPlayer()
        manager.player = shared
        manager.attachmentId = "64b0000000000000000000aa"

        manager.isPipActive = false
        XCTAssertTrue(manager.loadedPlayer(matching: "64b0000000000000000000aa", role: .inline) === shared,
                      "hors PiP, la carte reprend le player du porteur — le témoin peut donc tomber")

        manager.isPipActive = true
        XCTAssertNil(manager.loadedPlayer(matching: "64b0000000000000000000aa", role: .inline),
                     "la carte du fil ne reprend pas le player que la fenêtre PiP joue")
        XCTAssertTrue(manager.loadedPlayer(matching: "64b0000000000000000000aa", role: .fullscreen) === shared,
                      "le lecteur plein écran, lui, le reprend")
        XCTAssertNil(manager.loadedPlayer(matching: "64b0000000000000000000bb", role: .fullscreen))
    }

    func test_aLivePipWindow_keepsItsController() {
        XCTAssertFalse(SharedAVPlayerManager.mayReplacePipController(isPipActive: true),
                       "une surface qui se monte pendant le PiP ne remplace pas le contrôleur de la fenêtre")
        XCTAssertTrue(SharedAVPlayerManager.mayReplacePipController(isPipActive: false))
    }

    func test_theScenePlayer_asksAsInlineInAFeed_andAsFullscreenInAReader() {
        XCTAssertEqual(MeeshyScenePlayer.carrierSurfaceRole(mode: .card), .inline)
        XCTAssertEqual(MeeshyScenePlayer.carrierSurfaceRole(mode: .preview), .inline)
        XCTAssertEqual(MeeshyScenePlayer.carrierSurfaceRole(mode: .reader), .fullscreen)
        XCTAssertEqual(MeeshyScenePlayer.carrierSurfaceRole(mode: .reel), .fullscreen)
    }

    func test_theFullscreenVerdict_ignoresThePip() {
        XCTAssertTrue(SharedAVPlayerManager.mayMountFullscreenPlayer(
            surfaceMedia: Self.media, activeMedia: Self.media))
        XCTAssertFalse(SharedAVPlayerManager.mayMountFullscreenPlayer(
            surfaceMedia: Self.media, activeMedia: ""))
    }
}
