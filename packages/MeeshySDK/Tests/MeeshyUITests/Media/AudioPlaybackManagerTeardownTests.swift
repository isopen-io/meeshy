import XCTest
@testable import MeeshyUI

final class AudioPlaybackManagerTeardownTests: XCTestCase {

    private final class Parcel: @unchecked Sendable {
        var manager: AudioPlaybackManager?
        init(_ manager: AudioPlaybackManager) { self.manager = manager }
    }

    @MainActor
    private func makeParcels(_ count: Int) -> [Parcel] {
        (0..<count).map { _ in Parcel(AudioPlaybackManager(registerWithCoordinator: false)) }
    }

    @MainActor
    func test_managersReleasedOffMain_neitherCrashNorDoubleFree() async {
        let parcels = makeParcels(64)
        await withTaskGroup(of: Void.self) { group in
            for parcel in parcels {
                group.addTask { parcel.manager = nil }
            }
        }
        XCTAssertTrue(parcels.allSatisfy { $0.manager == nil })
    }

    func test_deinit_releasesTheCoordinatorSessionOnlyWhenOneWasHeld() throws {
        let url = ComposerSourceGuard.packageRoot
            .appendingPathComponent("Sources/MeeshyUI/Media/AudioPlaybackManager.swift")
        let code = ComposerSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        let deinitBody = try XCTUnwrap(code.components(separatedBy: "nonisolated deinit {").dropFirst().first)
        XCTAssertTrue(deinitBody.contains("teardown.releaseNow"))
        XCTAssertTrue(deinitBody.contains("if resources.sessionRequested"))
        XCTAssertTrue(deinitBody.contains("MediaSessionCoordinator.shared.release()"))
    }
}
