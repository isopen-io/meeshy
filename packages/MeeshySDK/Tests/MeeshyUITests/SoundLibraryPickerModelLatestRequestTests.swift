import XCTest
import Combine
@testable import MeeshySDK
@testable import MeeshyUI

private final class GatedSoundLibraryService: SoundLibraryServiceProviding, @unchecked Sendable {
    private let lock = NSLock()
    private var gate: CheckedContinuation<Void, Never>?
    private var mineStarted = false

    var hasMineStarted: Bool { lock.withLock { mineStarted } }

    func releaseMine() { lock.withLock { gate }?.resume() }

    func mySounds(query: String?, cursor: Date?, limit: Int) async throws -> SoundPage {
        await withCheckedContinuation { continuation in
            lock.withLock {
                mineStarted = true
                gate = continuation
            }
        }
        return SoundPage(sounds: [makeSound(id: "mine")], nextCursor: nil)
    }

    func trendingSounds(query: String?, limit: Int) async throws -> [APISound] { [makeSound(id: "trend")] }
    func rename(soundId: String, title: String) async throws -> APISound { throw URLError(.badServerResponse) }
    func posts(soundId: String, cursor: Date?, limit: Int) async throws -> SoundPostPage { SoundPostPage(posts: [], nextCursor: nil) }
    func remove(soundId: String) async throws -> SoundRemoval { throw URLError(.badServerResponse) }
}

@MainActor
final class SoundLibraryPickerModelLatestRequestTests: XCTestCase {

    private func waitUntil(_ condition: @MainActor () -> Bool) async {
        let deadline = ContinuousClock.now + .seconds(3)
        while !condition(), ContinuousClock.now < deadline {
            _ = await cancellableSleep(for: .milliseconds(10))
        }
    }

    func test_slowQueryThenTabChange_endsOnTheLatestSubmittedRequest() async {
        let service = GatedSoundLibraryService()
        let model = SoundLibraryPickerModel(service: service)

        model.query = "a"
        await waitUntil { service.hasMineStarted }
        model.tab = .trending
        _ = await cancellableSleep(for: .milliseconds(50))
        service.releaseMine()
        await waitUntil { model.sounds.first?.id == "trend" }
        _ = await cancellableSleep(for: .milliseconds(100))

        XCTAssertEqual(model.sounds.first?.id, "trend")
    }
}
