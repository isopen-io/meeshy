import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// #13415 — une publication non envoyée ne quitte la liste (et l'appareil)
/// que par le geste « Supprimer » ; « Réessayer » la remet en attente.
@MainActor
final class UnsentPublicationsViewModelTests: XCTestCase {

    func test_load_listsWhatTheQueueStillHolds() async {
        let source = FakeSource(publications: [Self.publication("a", state: .failed)])
        let viewModel = UnsentPublicationsViewModel(source: source)

        await viewModel.load()

        XCTAssertEqual(viewModel.publications.map(\.id), ["a"])
        XCTAssertTrue(viewModel.hasLoaded)
    }

    func test_delete_isTheAuthorsGesture_andCancelsTheRow() async {
        let source = FakeSource(publications: [Self.publication("a", state: .failed)])
        let viewModel = UnsentPublicationsViewModel(source: source)
        await viewModel.load()

        await viewModel.delete("a")

        XCTAssertTrue(viewModel.publications.isEmpty)
        let cancelled = await source.cancelled
        XCTAssertEqual(cancelled, ["a"])
    }

    func test_delete_whenTheQueueRefusesTheWrite_putsThePublicationBack() async {
        let source = FakeSource(publications: [Self.publication("a", state: .failed)], cancellation: .failed)
        let viewModel = UnsentPublicationsViewModel(source: source)
        await viewModel.load()

        await viewModel.delete("a")

        XCTAssertEqual(viewModel.publications.map(\.id), ["a"])
    }

    func test_retry_rearmsTheRow_andRereadsTheQueue() async {
        let source = FakeSource(publications: [Self.publication("a", state: .failed)])
        let viewModel = UnsentPublicationsViewModel(source: source)
        await viewModel.load()

        await viewModel.retry("a")

        let retried = await source.retried
        XCTAssertEqual(retried, ["a"])
        XCTAssertEqual(viewModel.publications.first?.state, .waiting)
    }

    static func publication(_ id: String, state: UnsentPublication.State) -> UnsentPublication {
        UnsentPublication(
            draft: RecoveredOfflinePost(clientMutationId: id, content: "texte", visibility: "PUBLIC",
                                        originalLanguage: "fr", type: "POST", moodEmoji: nil, audioUrl: nil,
                                        audioDuration: nil, visibilityUserIds: nil, localMediaURLs: [],
                                        createdAt: Date(timeIntervalSince1970: 1_790_000_000)),
            state: state, lastError: state == .failed ? "415" : nil)
    }

    actor FakeSource: UnsentPublicationsSource {
        private var rows: [UnsentPublication]
        private let cancellation: PublicationCancellation
        private(set) var cancelled: [String] = []
        private(set) var retried: [String] = []

        init(publications: [UnsentPublication], cancellation: PublicationCancellation = .removed) {
            rows = publications
            self.cancellation = cancellation
        }

        func unsentPublications() async -> [UnsentPublication] { rows }

        func retryPublication(clientMutationId: String) async throws {
            retried.append(clientMutationId)
            rows = rows.map { $0.id == clientMutationId ? UnsentPublication(draft: $0.draft, state: .waiting, lastError: nil) : $0 }
        }

        func cancelPendingPublication(clientMutationId: String) async -> PublicationCancellation {
            cancelled.append(clientMutationId)
            if cancellation == .removed { rows.removeAll { $0.id == clientMutationId } }
            return cancellation
        }
    }
}
