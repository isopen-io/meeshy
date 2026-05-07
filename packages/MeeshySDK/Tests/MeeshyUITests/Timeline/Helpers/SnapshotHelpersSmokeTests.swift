import XCTest
import SwiftUI
import SnapshotTesting
@testable import MeeshyUI

/// Sanity test for the helpers introduced in Task 38. Asserts that
/// `SnapshotHelpers.deviceSize(for:)` returns the documented sizes and that
/// `SnapshotHelpers.snapshotDirectory` resolves to a non-empty path.
final class SnapshotHelpersSmokeTests: XCTestCase {

    func test_deviceSize_iPhone16Pro_isPortrait390x844() {
        let size = SnapshotHelpers.deviceSize(for: .iPhone16Pro)
        XCTAssertEqual(size.width, 390, accuracy: 0.001)
        XCTAssertEqual(size.height, 844, accuracy: 0.001)
    }

    func test_deviceSize_iPadPro11Landscape_is1194x834() {
        let size = SnapshotHelpers.deviceSize(for: .iPadPro11Landscape)
        XCTAssertEqual(size.width, 1194, accuracy: 0.001)
        XCTAssertEqual(size.height, 834, accuracy: 0.001)
    }

    func test_snapshotDirectory_endsWithUnderscoreSnapshotsUnderscore() {
        // The directory MUST be the conventional `__Snapshots__` subfolder
        // adjacent to the calling test file. We validate the suffix only
        // because the absolute path is filesystem-dependent.
        let dir = SnapshotHelpers.snapshotDirectory(testFile: #filePath)
        XCTAssertTrue(dir.hasSuffix("/__Snapshots__"),
                      "Expected helpers to anchor on __Snapshots__, got \(dir)")
    }
}
