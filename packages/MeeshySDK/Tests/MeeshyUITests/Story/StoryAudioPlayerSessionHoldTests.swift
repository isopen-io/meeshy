import XCTest

/// La pastille audio du composer de story prenait une prise sur la session
/// audio (`MediaSessionCoordinator.request`) à CHAQUE appui sur lecture, et ne
/// la rendait jamais : le compteur de détenteurs ne retombait plus à zéro, la
/// session restait active et la musique des autres apps restait coupée ou
/// atténuée jusqu'au passage en arrière-plan. Une prise au plus, rendue au
/// démontage.
final class StoryAudioPlayerSessionHoldTests: XCTestCase {

    private static var sourceURL: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Story/StoryAudioPlayerView.swift")
    }

    func test_everySessionRequest_isGuardedAndReleasedOnTeardown() throws {
        let code = try String(contentsOf: Self.sourceURL, encoding: .utf8)

        let requests = code.components(separatedBy: "MediaSessionCoordinator.shared.request(").count - 1
        let releases = code.components(separatedBy: "MediaSessionCoordinator.shared.release()").count - 1
        XCTAssertEqual(requests, 1, "une seule prise de session dans la pastille audio")
        XCTAssertEqual(releases, 1, "la prise de session doit être rendue")

        let teardown = try XCTUnwrap(code.range(of: "private func teardownPlayer() {"))
        let teardownBody = String(code[teardown.upperBound...].prefix(1_600))
        XCTAssertTrue(teardownBody.contains("MediaSessionCoordinator.shared.release()"),
                      "le démontage rend la prise de session")

        let request = try XCTUnwrap(code.range(of: "MediaSessionCoordinator.shared.request("))
        let before = String(code[..<request.lowerBound].suffix(240))
        XCTAssertTrue(before.contains("!holdsPlaybackSession"),
                      "un second appui sur lecture ne reprend pas de prise")
    }
}
