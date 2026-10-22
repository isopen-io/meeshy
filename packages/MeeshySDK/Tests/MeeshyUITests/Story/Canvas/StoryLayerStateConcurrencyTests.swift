import XCTest
import UIKit
@testable import MeeshyUI

final class StoryLayerStateConcurrencyTests: XCTestCase {

    private struct TaggedLoader: StoryMediaImageLoading {
        let tag: Int
        func image(for urlString: String) async -> UIImage? { nil }
    }

    /// `StoryBackgroundLayer`/`StoryMediaLayer` synchronisent déjà leur état via
    /// un verrou interne (`Locked(uncheckedState:)`) — c'est exactement ce que ce
    /// test vérifie. `nonisolated(unsafe)` sur le `let` local ne suffit pas pour le
    /// vérificateur de paramètres `sending` de `addTask` : il juge l'appartenance
    /// Sendable de la VALEUR capturée, pas l'annotation de la liaison locale. Même
    /// boîte que `StoryMediaLayerWeakBox` (StoryMediaLayer.swift), sans son souci
    /// de `deinit` synthétisé : ceci est un `struct`, pas une `class`.
    private struct UncheckedSendableBox<Value>: @unchecked Sendable {
        let value: Value
    }

    func test_backgroundLayer_freshLayerKeepsItsDefaults() {
        let layer = StoryBackgroundLayer()
        guard case .solidColor(let color) = layer.kind else { return XCTFail("kind par défaut inattendu") }
        XCTAssertEqual(color, .black)
        XCTAssertTrue(layer.letterboxFillHashes.isEmpty)
        XCTAssertFalse(layer.isLetterboxFillSuppressed)
        XCTAssertNil(layer.contentLayer)
        XCTAssertEqual(layer.transform3D, BackgroundTransform())
    }

    func test_mediaLayer_freshLayerKeepsItsDefaults() {
        let layer = StoryMediaLayer()
        XCTAssertNil(layer.currentTrimBounds)
        XCTAssertNil(layer.currentLoadTask)
        XCTAssertNil(layer.appliedVideoLook)
        XCTAssertNil(layer.media)
        XCTAssertTrue(layer.imageLoader is DiskCacheImageLoader)
    }

    func test_backgroundLayer_concurrentAccessNeverReturnsATornValue() async {
        let layer = StoryBackgroundLayer()
        let layerBox = UncheckedSendableBox(value: layer)
        let candidates = (0..<8).map { (0...$0).map { "h\($0)" } }
        let layers = (0..<8).map { _ in CALayer() }
        let writtenLayersBox = UncheckedSendableBox(value: layers)
        let torn = await withTaskGroup(of: Bool.self, returning: Int.self) { group in
            for index in 0..<500 {
                group.addTask {
                    let layer = layerBox.value
                    let writtenLayers = writtenLayersBox.value
                    let pick = index % 8
                    if index.isMultiple(of: 2) {
                        layer.letterboxFillHashes = candidates[pick]
                        layer.isLetterboxFillSuppressed = pick.isMultiple(of: 2)
                        layer.contentLayer = writtenLayers[pick]
                        layer.backgroundVideoLookTask = Task {}
                        return true
                    }
                    let hashes = layer.letterboxFillHashes
                    let content = layer.contentLayer
                    _ = layer.isLetterboxFillSuppressed
                    _ = layer.backgroundVideoLookTask
                    let hashesValid = hashes.isEmpty || candidates.contains(hashes)
                    let contentValid = content == nil || writtenLayers.contains { $0 === content }
                    return hashesValid && contentValid
                }
            }
            return await group.reduce(0) { $0 + ($1 ? 0 : 1) }
        }
        XCTAssertEqual(torn, 0)
        XCTAssertTrue(candidates.contains(layer.letterboxFillHashes))
        XCTAssertTrue(layers.contains { $0 === layer.contentLayer })
    }

    func test_mediaLayer_concurrentAccessNeverReturnsATornValue() async {
        let layer = StoryMediaLayer()
        let layerBox = UncheckedSendableBox(value: layer)
        let objects = (0..<8).map { _ in NSObject() }
        let identitiesBox = UncheckedSendableBox(value: objects)
        let torn = await withTaskGroup(of: Bool.self, returning: Int.self) { group in
            for index in 0..<500 {
                group.addTask {
                    let layer = layerBox.value
                    let identities = identitiesBox.value
                    let pick = index % 8
                    if index.isMultiple(of: 2) {
                        layer.imageLoader = TaggedLoader(tag: pick)
                        layer.currentLoadTask = Task {}
                        layer.appliedVideoLook = (item: ObjectIdentifier(identities[pick]), signature: "s\(pick)")
                        return true
                    }
                    _ = layer.currentLoadTask
                    let look = layer.appliedVideoLook
                    let lookValid = look == nil || look?.signature == "s\(identities.firstIndex { ObjectIdentifier($0) == look?.item } ?? -1)"
                    let loaderValid = layer.imageLoader is DiskCacheImageLoader || (layer.imageLoader as? TaggedLoader).map { (0..<8).contains($0.tag) } == true
                    return lookValid && loaderValid
                }
            }
            return await group.reduce(0) { $0 + ($1 ? 0 : 1) }
        }
        XCTAssertEqual(torn, 0)
        let finalLook = layer.appliedVideoLook
        XCTAssertNotNil(finalLook)
        XCTAssertTrue(layer.imageLoader is TaggedLoader)
    }
}
