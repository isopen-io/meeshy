import XCTest
@testable import MeeshySDK

final class PhotoLibraryManagerTests: XCTestCase {

    // MARK: - Singleton

    func test_shared_returnsSameInstance() {
        let a = PhotoLibraryManager.shared
        let b = PhotoLibraryManager.shared
        XCTAssertTrue(a === b)
    }

    // MARK: - isAuthorized

    func test_isAuthorized_returnsBool() {
        // In test/simulator environment, authorization is typically not granted,
        // but the property must be accessible without crashing.
        let _ = PhotoLibraryManager.shared.isAuthorized
    }

    // MARK: - saveImage with invalid data

    func test_saveImage_invalidData_returnsFalse() async {
        let garbage = Data([0x00, 0x01, 0x02])
        let result = await PhotoLibraryManager.shared.saveImage(garbage)
        XCTAssertFalse(result)
    }
}
