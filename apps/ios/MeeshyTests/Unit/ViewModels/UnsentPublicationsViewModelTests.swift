import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// #13415 — une publication non envoyée ne quitte la liste (et l'appareil)
/// que par le geste « Supprimer » ; « Réessayer » la remet en attente.
@MainActor
final class UnsentPublicationsViewModelTests: XCTestCase {

    func test_load_listsWhatTheQueueStillHolds() async {
        let source = FakeSource(publications: [Self.publication("a", state: .failed)])
        let viewModel = UnsentPublicationsViewModel(source: source, drafts: FakeDrafts())

        await viewModel.load()

        XCTAssertEqual(viewModel.publications.map(\.id), ["a"])
        XCTAssertTrue(viewModel.hasLoaded)
    }

    func test_delete_isTheAuthorsGesture_andCancelsTheRow() async {
        let source = FakeSource(publications: [Self.publication("a", state: .failed)])
        let viewModel = UnsentPublicationsViewModel(source: source, drafts: FakeDrafts())
        await viewModel.load()

        await viewModel.delete("a")

        XCTAssertTrue(viewModel.publications.isEmpty)
        let cancelled = await source.cancelled
        XCTAssertEqual(cancelled, ["a"])
    }

    func test_delete_whenTheQueueRefusesTheWrite_putsThePublicationBack() async {
        let source = FakeSource(publications: [Self.publication("a", state: .failed)], cancellation: .failed)
        let viewModel = UnsentPublicationsViewModel(source: source, drafts: FakeDrafts())
        await viewModel.load()

        await viewModel.delete("a")

        XCTAssertEqual(viewModel.publications.map(\.id), ["a"])
    }

    func test_retry_rearmsTheRow_andRereadsTheQueue() async {
        let source = FakeSource(publications: [Self.publication("a", state: .failed)])
        let viewModel = UnsentPublicationsViewModel(source: source, drafts: FakeDrafts())
        await viewModel.load()

        await viewModel.retry("a")

        let retried = await source.retried
        XCTAssertEqual(retried, ["a"])
        XCTAssertEqual(viewModel.publications.first?.state, .waiting)
    }

    func test_load_discardsTheKeptDraftOfAPublicationWhoseRowIsGone() async {
        let source = FakeSource(publications: [Self.publication("a", state: .failed)])
        let drafts = FakeDrafts(parked: ["a", "confirmed"])
        let viewModel = UnsentPublicationsViewModel(source: source, drafts: drafts)

        await viewModel.load()

        XCTAssertEqual(drafts.discarded, ["confirmed"], "le serveur a confirmé : son brouillon part, celui de « a » reste")
        XCTAssertTrue(viewModel.canReopen("a"))
    }

    func test_delete_alsoDiscardsItsKeptDraft() async {
        let source = FakeSource(publications: [Self.publication("a", state: .failed)])
        let drafts = FakeDrafts(parked: ["a"])
        let viewModel = UnsentPublicationsViewModel(source: source, drafts: drafts)
        await viewModel.load()

        await viewModel.delete("a")

        XCTAssertEqual(drafts.discarded, ["a"])
    }

    func test_reopen_withdrawsTheRow_andHandsItsDraftToTheComposer() async {
        let source = FakeSource(publications: [Self.publication("a", state: .failed)])
        let drafts = FakeDrafts(parked: ["a"])
        let viewModel = UnsentPublicationsViewModel(source: source, drafts: drafts)
        await viewModel.load()

        let outcome = await viewModel.reopen("a")

        XCTAssertEqual(outcome, .reopened)
        XCTAssertEqual(drafts.reopened, ["a"])
        let cancelled = await source.cancelled
        XCTAssertEqual(cancelled, ["a"])
        XCTAssertTrue(viewModel.publications.isEmpty)
    }

    func test_reopen_neverOverwritesADraftAlreadyInTheComposer() async {
        let source = FakeSource(publications: [Self.publication("a", state: .failed)])
        let drafts = FakeDrafts(parked: ["a"], composerIsFree: false)
        let viewModel = UnsentPublicationsViewModel(source: source, drafts: drafts)
        await viewModel.load()

        let outcome = await viewModel.reopen("a")

        XCTAssertEqual(outcome, .composerBusy)
        XCTAssertTrue(drafts.reopened.isEmpty)
        let cancelled = await source.cancelled
        XCTAssertTrue(cancelled.isEmpty, "la publication reste en file")
    }

    func test_reopen_ofAPublicationLeavingRightNow_keepsItsDraftAndRow() async {
        let source = FakeSource(publications: [Self.publication("a", state: .sending)], cancellation: .cancelRequested)
        let drafts = FakeDrafts(parked: ["a"])
        let viewModel = UnsentPublicationsViewModel(source: source, drafts: drafts)
        await viewModel.load()

        let outcome = await viewModel.reopen("a")

        XCTAssertEqual(outcome, .alreadySending)
        XCTAssertTrue(drafts.reopened.isEmpty)
    }

    @MainActor
    final class FakeDrafts: UnsentPublicationDrafts {
        var parked: Set<String>
        let composerIsFree: Bool
        private(set) var discarded: [String] = []
        private(set) var reopened: [String] = []

        init(parked: Set<String> = [], composerIsFree: Bool = true) {
            self.parked = parked
            self.composerIsFree = composerIsFree
        }

        func parkedPublicationIds() -> Set<String> { parked }
        func discardDraft(of publicationId: String) {
            discarded.append(publicationId)
            parked.remove(publicationId)
        }
        func canReopen() -> Bool { composerIsFree }
        func reopen(_ publicationId: String) {
            reopened.append(publicationId)
            parked.remove(publicationId)
        }
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
