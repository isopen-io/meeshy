import XCTest
import UIKit
import ImageIO
@testable import Meeshy

final class LiveActivityAvatarStoreTests: XCTestCase {

    private func makeDirectory() throws -> URL {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("LiveActivityAvatarStoreTests-\(UUID().uuidString)", isDirectory: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        return directory
    }

    private func makeStore() throws -> (store: LiveActivityAvatarStore, directory: URL) {
        let directory = try makeDirectory()
        return (LiveActivityAvatarStore(directory: directory), directory)
    }

    private func makePNG(width: CGFloat, height: CGFloat) throws -> Data {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: width, height: height))
        let image = renderer.image { context in
            UIColor.systemIndigo.setFill()
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
        return try XCTUnwrap(image.pngData())
    }

    private func fileNames(in directory: URL) -> [String] {
        ((try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []).sorted()
    }

    func test_writeThenRead_roundTripsAThumbnailNoLargerThanTheCap() throws {
        let (store, _) = try makeStore()

        try store.write(imageData: try makePNG(width: 1024, height: 768), forActivityID: "A1B2-C3")

        let thumbnail = try XCTUnwrap(store.thumbnail(forActivityID: "A1B2-C3"))
        XCTAssertLessThanOrEqual(max(thumbnail.width, thumbnail.height), LiveActivityAvatarStore.maxPixelSize)
        XCTAssertGreaterThan(min(thumbnail.width, thumbnail.height), 0)
    }

    func test_thumbnail_forUnknownActivity_isNil() throws {
        let (store, _) = try makeStore()

        XCTAssertNil(store.thumbnail(forActivityID: "UNKNOWN"))
    }

    func test_activityIDWithPathSeparators_isRejected() throws {
        let (store, directory) = try makeStore()
        let data = try makePNG(width: 64, height: 64)
        let tooLong = String(repeating: "a", count: 65)

        for id in ["../x", "a/b", "", tooLong] {
            XCTAssertNil(store.fileURL(forActivityID: id), id)
            XCTAssertThrowsError(try store.write(imageData: data, forActivityID: id)) { error in
                XCTAssertEqual(error as? LiveActivityAvatarStoreError, .invalidActivityID)
            }
        }
        XCTAssertEqual(fileNames(in: directory), [])
        XCTAssertEqual(fileNames(in: directory.deletingLastPathComponent()).filter { $0 == "x.png" }, [])
    }

    func test_undecodableData_writesNothing() throws {
        let (store, directory) = try makeStore()

        XCTAssertThrowsError(try store.write(imageData: Data("pas une image".utf8), forActivityID: "A")) { error in
            XCTAssertEqual(error as? LiveActivityAvatarStoreError, .undecodableImage)
        }
        XCTAssertEqual(fileNames(in: directory), [])
    }

    func test_writtenFile_isReadableWhileLocked() throws {
        let (store, _) = try makeStore()
        try store.write(imageData: try makePNG(width: 200, height: 200), forActivityID: "A")

        XCTAssertTrue(
            LiveActivityAvatarStore.writingOptions.contains(.completeFileProtectionUntilFirstUserAuthentication),
            "la miniature s'écrit lisible appareil verrouillé"
        )
        XCTAssertFalse(LiveActivityAvatarStore.writingOptions.contains(.completeFileProtection),
                       "jamais `complete` : l'îlot ne pourrait plus la lire écran verrouillé")

        // Le simulateur n'enregistre pas la classe de protection d'un fichier
        // (`DependencyContainerTests` le constate aussi) : l'attribut se relit là
        // où la plateforme le tient — sur l'appareil, il doit être exactement
        // celui que l'écriture déclare.
        let url = try XCTUnwrap(store.fileURL(forActivityID: "A"))
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        if let protection = attributes[.protectionKey] as? FileProtectionType {
            XCTAssertEqual(protection, .completeUntilFirstUserAuthentication)
        }
    }

    func test_removeAllKeeping_deletesOnlyOrphans() throws {
        let (store, _) = try makeStore()
        let data = try makePNG(width: 64, height: 64)
        for id in ["A", "B", "C"] { try store.write(imageData: data, forActivityID: id) }

        store.removeAll(keeping: ["B"])

        XCTAssertNil(store.thumbnail(forActivityID: "A"))
        XCTAssertNotNil(store.thumbnail(forActivityID: "B"))
        XCTAssertNil(store.thumbnail(forActivityID: "C"))
    }

    func test_remove_deletesTheTargetOnly() throws {
        let (store, _) = try makeStore()
        let data = try makePNG(width: 64, height: 64)
        try store.write(imageData: data, forActivityID: "A")
        try store.write(imageData: data, forActivityID: "B")

        store.remove(forActivityID: "A")

        XCTAssertNil(store.thumbnail(forActivityID: "A"))
        XCTAssertNotNil(store.thumbnail(forActivityID: "B"))
    }
}
