import CoreImage
import XCTest
@testable import Meeshy

/// **Ce que la bande repeint, et ce qu'elle laisse** (#9351, revue 9351b I1 · I2 · I7) :
/// le coût GPU de la bande est une règle, et la règle a ses témoins.
@MainActor
final class ComposerLookStripPaintingTests: XCTestCase {

    private static let places = ComposerLookStripGeometry.minimumSlots

    private static func tile(_ index: Int, look: ComposerPhotoLook = ComposerPhotoLook()) -> ComposerLookStripTile {
        ComposerLookStripTile(index: index, look: look,
                              rect: CGRect(x: CGFloat(index) * ComposerLookStripRule.pitch, y: 0,
                                           width: ComposerLookStripRule.cellSize.width,
                                           height: ComposerLookStripRule.cellSize.height))
    }

    private static func painted(_ tiles: [ComposerLookStripTile], complete: Bool = true) -> [Int: ComposerLookStripSlot] {
        Dictionary(uniqueKeysWithValues: tiles.map { tuile in
            (ComposerLookStripGeometry.slot(of: tuile.index, slots: places),
             ComposerLookStripSlot(index: tuile.index, look: tuile.look, complete: complete))
        })
    }

    func test_tilesToPaint_live_repaintsEveryCell() {
        let cases = (3...9).map { Self.tile($0) }
        let peintes = ComposerLookStripPaintRule.tilesToPaint(cases, painted: Self.painted(cases), slots: Self.places,
                                                              live: true, scenesReady: [])
        XCTAssertEqual(peintes.map(\.index), Array(3...9), "une trame vivante repeint toutes les cases")
    }

    func test_tilesToPaint_nothingChanged_paintsNothing() {
        let cases = (3...9).map { Self.tile($0) }
        let peintes = ComposerLookStripPaintRule.tilesToPaint(cases, painted: Self.painted(cases), slots: Self.places,
                                                              live: false, scenesReady: [])
        XCTAssertTrue(peintes.isEmpty, "rien ne change, rien ne se peint : une case figée garde son image")
    }

    func test_tilesToPaint_windowSlidesOneCell_paintsOnlyTheNewCell() {
        let avant = (3...9).map { Self.tile($0) }
        let apres = (4...10).map { Self.tile($0) }
        let peintes = ComposerLookStripPaintRule.tilesToPaint(apres, painted: Self.painted(avant), slots: Self.places,
                                                              live: false, scenesReady: [])
        XCTAssertEqual(peintes.map(\.index), [10], "au défilement, seule la case neuve se peint")
    }

    func test_tilesToPaint_lookChanged_repaintsThatCell() {
        let avant = (3...5).map { Self.tile($0) }
        let apres = [Self.tile(3), Self.tile(4, look: ComposerPhotoLook(filter: .warm)), Self.tile(5)]
        let peintes = ComposerLookStripPaintRule.tilesToPaint(apres, painted: Self.painted(avant), slots: Self.places,
                                                              live: false, scenesReady: [])
        XCTAssertEqual(peintes.map(\.index), [4])
    }

    func test_tilesToPaint_sceneArrives_repaintsOnlyTheFramedCellsItServes() {
        let cases = (3...5).map { Self.tile($0) }
        let enAttente = Self.painted(cases, complete: false)
        XCTAssertTrue(ComposerLookStripPaintRule.tilesToPaint(cases, painted: enAttente, slots: Self.places,
                                                              live: false, scenesReady: []).isEmpty,
                      "un cadre qui cuit encore ne fait pas repeindre sa case à chaque dessin")
        let peintes = ComposerLookStripPaintRule.tilesToPaint(cases, painted: enAttente, slots: Self.places,
                                                              live: false, scenesReady: [4])
        XCTAssertEqual(peintes.map(\.index), [4], "la scène prête repeint sa seule case")
    }

    func test_tilesToPaint_whileRecording_paintsTheChosenCellAlone() {
        let indices = ComposerLookStripRule.paintedIndices(visible: 2...8, count: 30, cells: 8, chosen: 5,
                                                           recording: true)
        let peintes = ComposerLookStripPaintRule.tilesToPaint(indices.map { Self.tile($0) }, painted: [:],
                                                              slots: Self.places, live: true, scenesReady: [])
        XCTAssertEqual(peintes.map(\.index), [5], "en prise, la seule case choisie vit")
    }

    func test_needsFrame_aCellWithoutImage_asksForOne() {
        let cases = (3...5).map { Self.tile($0) }
        XCTAssertTrue(ComposerLookStripPaintRule.needsFrame(cases, painted: [:], slots: Self.places))
        XCTAssertFalse(ComposerLookStripPaintRule.needsFrame(cases, painted: Self.painted(cases), slots: Self.places))
    }

    func test_mayRequestFrame_boundsTheRequestsOfACellThatNeverPaints() {
        XCTAssertTrue(ComposerLookStripPaintRule.mayRequestFrame(needsFrame: true, sent: 0, fps: 0),
                      "figée, une case sans image obtient tout de même une trame")
        XCTAssertFalse(ComposerLookStripPaintRule.mayRequestFrame(needsFrame: true, sent: 1, fps: 0))
        XCTAssertTrue(ComposerLookStripPaintRule.mayRequestFrame(needsFrame: true, sent: 11, fps: 12))
        XCTAssertFalse(ComposerLookStripPaintRule.mayRequestFrame(needsFrame: true, sent: 12, fps: 12),
                       "un rendu qui échoue sans cesse ne réclame pas une trame par trame de l'objectif")
        XCTAssertFalse(ComposerLookStripPaintRule.mayRequestFrame(needsFrame: false, sent: 0, fps: 12))
    }

    func test_frameGate_frozen_letsOneRequestedFrameThrough() {
        let porte = ComposerLookStripFrameGate(fps: 0)
        XCTAssertEqual(porte.admit(presentedAt: 1), .refused, "figée, la bande ne prend aucune trame")
        porte.requestFrame()
        XCTAssertEqual(porte.admit(presentedAt: 1.1), .requested, "une case sans image en obtient une, même figée")
        XCTAssertEqual(porte.admit(presentedAt: 1.2), .refused, "une seule")
    }

    func test_frameGate_live_admitsAtItsPace() {
        let porte = ComposerLookStripFrameGate(fps: 12)
        XCTAssertEqual(porte.admit(presentedAt: 1), .paced)
        XCTAssertEqual(porte.admit(presentedAt: 1.01), .refused)
    }

    func test_scenes_aFrameThatNeverBakes_isPreparedOnce_andNeverRedraws() {
        let cache = MockComposerLookSceneProvider()
        let scenes = ComposerLookStripScenes(provider: cache)
        let cle = ComposerLookSceneKey(look: ComposerPhotoLook(), canvas: ComposerLookPainter.thumbnailCanvas,
                                       date: Date(timeIntervalSince1970: 0),
                                       person: ComposerPhotoLookPerson.author(id: nil, displayName: nil, username: nil))
        let redessins = MainActorCounter()
        (0..<5).forEach { _ in _ = scenes.scene(for: cle) { redessins.value += 1 } }
        XCTAssertEqual(cache.prepareCount, 1, "une clé ne se cuit qu'une fois, même quand la cuisson rend nil")
        cache.readies.forEach { $0() }
        XCTAssertEqual(redessins.value, 0, "une cuisson ratée ne redemande aucun dessin")
        scenes.reset()
        _ = scenes.scene(for: cle) {}
        XCTAssertEqual(cache.prepareCount, 2, "un cache périmé redemande sa cuisson")
    }

    func test_scenes_aSceneEvictedAfterBaking_isBakedAgain() {
        let cache = MockComposerLookSceneProvider()
        let scenes = ComposerLookStripScenes(provider: cache)
        let cle = Self.key()
        _ = scenes.scene(for: cle) {}
        cache.scene = Self.bakedScene()
        cache.readies.forEach { $0() }
        XCTAssertNotNil(scenes.scene(for: cle) {}, "la scène cuite est servie")
        cache.scene = nil
        _ = scenes.scene(for: cle) {}
        XCTAssertEqual(cache.prepareCount, 2, "une scène évincée du cache partagé se recuit : la case retrouve son cadre")
    }

    func test_scenes_aFailedBake_isRetriedAfterAGrowingDelay_aBoundedNumberOfTimes() {
        let cache = MockComposerLookSceneProvider()
        let horloge = MainActorClock()
        let scenes = ComposerLookStripScenes(provider: cache, now: { horloge.now })
        let cle = Self.key()
        _ = scenes.scene(for: cle) {}
        cache.readies.forEach { $0() }
        _ = scenes.scene(for: cle) {}
        XCTAssertEqual(cache.prepareCount, 1, "un échec ne se recuit pas aussitôt : aucune boucle")
        (1...10).forEach { _ in
            horloge.now = horloge.now.addingTimeInterval(60)
            _ = scenes.scene(for: cle) {}
            cache.readies.last?()
        }
        XCTAssertEqual(cache.prepareCount, 1 + ComposerLookStripScenes.maxRetries,
                       "un échec se réessaie, un nombre borné de fois")
    }

    private static func key() -> ComposerLookSceneKey {
        ComposerLookSceneKey(look: ComposerPhotoLook(), canvas: ComposerLookPainter.thumbnailCanvas,
                             date: Date(timeIntervalSince1970: 0),
                             person: ComposerPhotoLookPerson.author(id: nil, displayName: nil, username: nil))
    }

    private static func bakedScene() -> CallLiveFrameScene {
        CallLiveFrameScene(inputs: CallLiveFrameLayerInputs(frameId: "t", people: [],
                                                            texts: ComposerPhotoLookSource.texts(at: Date()),
                                                            size: CGSize(width: 1, height: 1)),
                           backdrop: CIImage.empty(), overlay: CIImage.empty(), slots: [])
    }
}

/// Une horloge que le témoin avance à la main.
@MainActor
final class MainActorClock {
    var now = Date(timeIntervalSince1970: 1_000)
    nonisolated deinit {}
}

/// Un compteur que les fermetures du fil principal peuvent capturer.
@MainActor
final class MainActorCounter {
    var value = 0
    nonisolated deinit {}
}

/// Un cache de scènes qui ne cuit que ce que le témoin y pose, et compte ses demandes.
final class MockComposerLookSceneProvider: ComposerLookSceneProviding, @unchecked Sendable {
    var scene: CallLiveFrameScene?
    private(set) var prepareCount = 0
    private(set) var readies: [@MainActor @Sendable () -> Void] = []

    nonisolated deinit {}

    func cached(_ key: ComposerLookSceneKey) -> CallLiveFrameScene? { scene }

    func prepare(_ key: ComposerLookSceneKey, ready: @escaping @MainActor @Sendable () -> Void) {
        prepareCount += 1
        readies.append(ready)
    }

    func purge() {}
}
