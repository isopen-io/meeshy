import XCTest
import Combine
@testable import MeeshySDK

final class ConcSweepConcurrencyTests: XCTestCase {

    func test_storeSubjects_concurrentSubjectForSameId_returnsOneInstanceAndSeedsOnce() async {
        let subjects = ConversationStoreSubjects()
        let seeds = Locked(0)
        let conversation = MeeshyConversation(id: "conc-a", identifier: "conc-a", type: .direct)
        let instances = await withTaskGroup(of: ObjectIdentifier?.self, returning: Set<ObjectIdentifier>.self) { group in
            for _ in 0..<200 {
                group.addTask {
                    subjects.subject(for: "conc-a", initial: {
                        seeds.mutate { $0 += 1 }
                        return conversation
                    }).map { ObjectIdentifier($0) }
                }
            }
            return await group.reduce(into: Set<ObjectIdentifier>()) { if let id = $1 { $0.insert(id) } }
        }
        XCTAssertEqual(instances.count, 1)
        XCTAssertEqual(seeds.read { $0 }, 1)
    }

    func test_photoRegistry_concurrentRecords_keepEverySignatureFindable() async throws {
        let suiteName = "conc-sweep-registry-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let registry = PhotoLibraryMediaRegistry(defaults: defaults)
        let signatures = (0..<500).map { PhotoLibraryMediaSignature(data: Data("photo-\($0)".utf8)) }
        await withTaskGroup(of: Void.self) { group in
            for (index, signature) in signatures.enumerated() {
                group.addTask { registry.record(signature, localIdentifier: "id-\(index)") }
            }
        }
        for (index, signature) in signatures.enumerated() {
            XCTAssertEqual(registry.localIdentifier(for: signature), "id-\(index)")
        }
    }

    func test_cancellationRelay_attachAndCancelRaceAlwaysCancelsTheTask() async {
        let session = URLSession(configuration: .ephemeral)
        defer { session.invalidateAndCancel() }
        let url = URL(string: "https://127.0.0.1:9/never")!
        for _ in 0..<50 {
            let relay = MediaFileDownloader.CancellationRelay()
            nonisolated(unsafe) let task = session.downloadTask(with: url)
            await withTaskGroup(of: Void.self) { group in
                group.addTask { relay.attach(task) }
                group.addTask { relay.cancel() }
            }
            XCTAssertTrue(task.state == .canceling || task.state == .completed)
        }
    }
}
