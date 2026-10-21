import XCTest
@testable import MeeshySDK

/// IL8 (#11286) — un fichier remis à un lecteur reste protégé de la pression
/// disque pendant la fenêtre du registre, puis cesse de l'être.
final class CacheReadRegistryTests: XCTestCase {

    private let origin = Date(timeIntervalSince1970: 1_000_000)

    func test_recentlyRead_withinWindow_containsTheFile() {
        let registry = CacheReadRegistry(window: 60)
        registry.noteRead("a.mp4", at: origin)
        XCTAssertEqual(registry.recentlyRead(now: origin.addingTimeInterval(59)), ["a.mp4"])
    }

    func test_recentlyRead_pastWindow_forgetsTheFile() {
        let registry = CacheReadRegistry(window: 60)
        registry.noteRead("a.mp4", at: origin)
        XCTAssertTrue(registry.recentlyRead(now: origin.addingTimeInterval(61)).isEmpty)
    }

    func test_noteRead_again_restartsTheWindow() {
        let registry = CacheReadRegistry(window: 60)
        registry.noteRead("a.mp4", at: origin)
        registry.noteRead("a.mp4", at: origin.addingTimeInterval(50))
        XCTAssertEqual(registry.recentlyRead(now: origin.addingTimeInterval(100)), ["a.mp4"])
    }

    func test_noteRead_pastThreshold_dropsReadsOlderThanTheWindow() {
        let registry = CacheReadRegistry(window: 60, pruneThreshold: 2)
        registry.noteRead("old-1.mp4", at: origin)
        registry.noteRead("old-2.mp4", at: origin)
        registry.noteRead("fresh.mp4", at: origin.addingTimeInterval(120))
        XCTAssertEqual(registry.recentlyRead(now: origin.addingTimeInterval(1)), ["fresh.mp4"])
    }
}
