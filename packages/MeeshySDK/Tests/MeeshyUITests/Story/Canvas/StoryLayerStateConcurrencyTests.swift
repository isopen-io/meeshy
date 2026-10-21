import XCTest
import UIKit
@testable import MeeshyUI

final class StoryLayerStateConcurrencyTests: XCTestCase {

    private struct TaggedLoader: StoryMediaImageLoading {
        let tag: Int
        func image(for urlString: String) async -> UIImage? { nil }
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
        nonisolated(unsafe) let layer = StoryBackgroundLayer()
        let candidates = (0..<8).map { (0...$0).map { "h\($0)" } }
        let layers = (0..<8).map { _ in CALayer() }
        nonisolated(unsafe) let writtenLayers = layers
        let torn = await withTaskGroup(of: Bool.self, returning: Int.self) { group in
            for index in 0..<500 {
                group.addTask {
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
        XCTAssertTrue(writtenLayers.contains { $0 === layer.contentLayer })
    }

    func test_mediaLayer_concurrentAccessNeverReturnsATornValue() async {
        nonisolated(unsafe) let layer = StoryMediaLayer()
        let objects = (0..<8).map { _ in NSObject() }
        nonisolated(unsafe) let identities = objects
        let torn = await withTaskGroup(of: Bool.self, returning: Int.self) { group in
            for index in 0..<500 {
                group.addTask {
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
