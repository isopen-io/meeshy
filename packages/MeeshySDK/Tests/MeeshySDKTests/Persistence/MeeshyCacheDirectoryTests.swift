import XCTest
@testable import MeeshySDK

final class MeeshyCacheDirectoryTests: XCTestCase {
    func test_ensured_createsTheMeeshyCacheDirectory() {
        let directory = MeeshyCacheDirectory.ensured()
        var isDirectory: ObjCBool = false
        XCTAssertTrue(FileManager.default.fileExists(atPath: directory.path, isDirectory: &isDirectory))
        XCTAssertTrue(isDirectory.boolValue)
        XCTAssertEqual(directory.lastPathComponent, "meeshy_cache")
    }

    func test_url_matchesEnsuredLocation() {
        XCTAssertEqual(MeeshyCacheDirectory.url, MeeshyCacheDirectory.ensured())
    }
}
