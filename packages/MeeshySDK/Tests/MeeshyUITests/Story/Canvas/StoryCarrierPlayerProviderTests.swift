import XCTest
import AVFoundation
import QuartzCore
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// B8e / O16 — le chemin LECTURE ne fabrique pas le temps du média porteur :
/// il le demande au fournisseur que l'hôte lui transmet. Le canvas de
/// COMPOSITION, lui, n'en reçoit aucun et garde ses players privés.
@MainActor
final class StoryCarrierPlayerProviderTests: XCTestCase {

    // MARK: - Foreground media layer

    func test_mediaLayer_playsThroughTheProvidedCarrierPlayer() throws {
        let shared = try Self.detachedPlayer()
        let layer = StoryMediaLayer()
        try Self.configureVideo(layer, postMediaId: "carrier-1",
                                provider: StubCarrierPlayerProvider(identity: "carrier-1",
                                                                    player: shared))
        XCTAssertTrue(layer.avPlayer === shared,
                      "O16 : la couche adopte le player du fournisseur, elle n'en ouvre pas un privé")
    }

    func test_mediaLayer_keepsItsPrivatePlayer_withoutAProvider() throws {
        let layer = StoryMediaLayer()
        try Self.configureVideo(layer, postMediaId: "carrier-1", provider: nil)
        XCTAssertNotNil(layer.avPlayer,
                        "Sans fournisseur (composition, prefetch) la couche garde son player privé")
    }

    func test_mediaLayer_keepsItsPrivatePlayer_whenTheProviderDeclines() throws {
        let shared = try Self.detachedPlayer()
        let layer = StoryMediaLayer()
        try Self.configureVideo(layer, postMediaId: "carrier-1",
                                provider: StubCarrierPlayerProvider(identity: "un-autre-media",
                                                                    player: shared))
        XCTAssertNotNil(layer.avPlayer)
        XCTAssertFalse(layer.avPlayer === shared,
                       "Un fournisseur qui décline laisse la couche ouvrir son propre player")
    }

    func test_mediaLayer_asksTheProviderWithItsPostMediaIdentity() throws {
        let stub = StubCarrierPlayerProvider(identity: "carrier-1",
                                             player: try Self.detachedPlayer())
        let layer = StoryMediaLayer()
        try Self.configureVideo(layer, postMediaId: "carrier-1", provider: stub)
        XCTAssertEqual(stub.asked, ["carrier-1"])
    }

    func test_theLentPlayerSurvivesTheTeardown() throws {
        let shared = try Self.detachedPlayer()
        let layer = StoryMediaLayer()
        try Self.configureVideo(layer, postMediaId: "carrier-1",
                                provider: StubCarrierPlayerProvider(identity: "carrier-1",
                                                                    player: shared))
        layer.tearDownPlayback()
        XCTAssertNotNil(shared.currentItem,
                        "Un player PRÊTÉ n'est jamais vidé par la fermeture : son item appartient "
                        + "à la surface qui le porte")
    }

    func test_thePrivatePlayerIsEmptiedByTheTeardown() throws {
        let layer = StoryMediaLayer()
        try Self.configureVideo(layer, postMediaId: "carrier-1", provider: nil)
        let own = try XCTUnwrap(layer.avPlayer)
        layer.tearDownPlayback()
        XCTAssertNil(own.currentItem, "Un player privé est bien libéré, comme avant")
    }

    // MARK: - Background layer

    func test_backgroundLayer_playsThroughTheProvidedCarrierPlayer() throws {
        let shared = try Self.detachedPlayer()
        let layer = StoryBackgroundLayer()
        try Self.configureVideoBackground(layer, postMediaId: "bg-1",
                                          provider: StubCarrierPlayerProvider(identity: "bg-1",
                                                                              player: shared))
        XCTAssertTrue(layer.avPlayer === shared,
                      "O16 : le fond de LECTURE joue le player partagé du média porteur")
    }

    func test_backgroundLayer_keepsItsPrivatePlayer_whenTheProviderDeclines() throws {
        let shared = try Self.detachedPlayer()
        let layer = StoryBackgroundLayer()
        try Self.configureVideoBackground(layer, postMediaId: "bg-1",
                                          provider: StubCarrierPlayerProvider(identity: "autre",
                                                                              player: shared))
        XCTAssertNotNil(layer.avPlayer)
        XCTAssertFalse(layer.avPlayer === shared)
    }

    // MARK: - Chaîne complète : contexte de lecture → renderer → couche

    func test_theReaderContextCarriesTheProvider_downToTheForegroundLayer() throws {
        let shared = try Self.detachedPlayer()
        let fileURL = try Self.temporaryVideoURL()
        let media = StoryMediaObject(id: "fg-1", postMediaId: "carrier-1",
                                     kind: .video, aspectRatio: 1.0)
        var effects = StoryEffects()
        effects.mediaObjects = [media]
        let canvas = StoryCanvasUIView(slide: StorySlide(id: "s1", effects: effects), mode: .play)
        canvas.setReaderContext(StoryReaderContext(
            postMediaURLResolver: { _ in fileURL },
            playerProvider: StubCarrierPlayerProvider(identity: "carrier-1", player: shared)
        ))
        canvas.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        canvas.layoutIfNeeded()

        let mediaLayer = try XCTUnwrap(Self.firstMediaLayer(in: canvas.layer),
                                       "La slide porte un média foreground : sa couche doit exister")
        XCTAssertTrue(mediaLayer.avPlayer === shared,
                      "Le fournisseur posé sur le contexte de lecture doit atteindre la couche média")
    }

    /// Le canvas de COMPOSITION n'en reçoit aucun : contexte vide, players privés.
    func test_theCompositionCanvasGetsNoProvider() {
        XCTAssertNil(StoryReaderContext.empty.playerProvider)
        XCTAssertNil(StoryReaderContext(mute: true).playerProvider)
    }

    // MARK: - Fixtures

    private static func temporaryVideoURL() throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("carrier-\(UUID().uuidString).mp4")
        try Data([0x00, 0x00, 0x00, 0x18]).write(to: url)
        return url
    }

    private static func detachedPlayer() throws -> AVPlayer {
        AVPlayer(playerItem: AVPlayerItem(url: try temporaryVideoURL()))
    }

    private static func configureVideo(_ layer: StoryMediaLayer,
                                       postMediaId: String,
                                       provider: (any StoryCarrierPlayerProviding)?) throws {
        let fileURL = try temporaryVideoURL()
        let media = StoryMediaObject(id: "fg-\(postMediaId)", postMediaId: postMediaId,
                                     kind: .video, aspectRatio: 1.0)
        layer.configure(with: media,
                        geometry: CanvasGeometry(renderSize: CGSize(width: 412, height: 732)),
                        mode: .edit,
                        resolver: { _ in fileURL },
                        playerProvider: provider)
    }

    private static func configureVideoBackground(_ layer: StoryBackgroundLayer,
                                                 postMediaId: String,
                                                 provider: (any StoryCarrierPlayerProviding)?) throws {
        let fileURL = try temporaryVideoURL()
        layer.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        layer.configure(kind: .video(postMediaId: postMediaId, looping: false,
                                     mute: true, thumbHash: nil),
                        transform: .identity,
                        geometry: CanvasGeometry(renderSize: CGSize(width: 412, height: 732)),
                        resolver: { _ in fileURL },
                        imageCache: nil,
                        playerProvider: provider)
    }

    private static func firstMediaLayer(in root: CALayer) -> StoryMediaLayer? {
        if let media = root as? StoryMediaLayer { return media }
        for sub in root.sublayers ?? [] {
            if let found = firstMediaLayer(in: sub) { return found }
        }
        return nil
    }
}

/// Fournisseur déterministe : sert SON identité, décline toutes les autres, et
/// consigne ce qu'on lui a demandé.
@MainActor
final class StubCarrierPlayerProvider: StoryCarrierPlayerProviding {
    private let identity: String
    private let stubbed: AVPlayer
    private(set) var asked: [String] = []

    init(identity: String, player: AVPlayer) {
        self.identity = identity
        self.stubbed = player
    }

    func player(for mediaIdentity: String) -> AVPlayer? {
        asked.append(mediaIdentity)
        return mediaIdentity == identity ? stubbed : nil
    }
}
