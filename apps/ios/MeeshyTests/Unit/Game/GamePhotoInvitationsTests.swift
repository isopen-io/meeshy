import XCTest
import MeeshySDK
@testable import Meeshy

/// La file des invitations à immortaliser, côté app (#20775, tranche iOS de #20643) : miroir de
/// `createPhotoAlerts` (`apps/web/src/lib/game-photo/alerts.ts`), témoins tirés de `alerts.test.ts`.
@MainActor
final class GamePhotoInvitationsTests: XCTestCase {

    private static let now = Date(timeIntervalSince1970: 1_792_670_400)

    @MainActor
    private final class Memories: PhotoAlertMemoryStoring {
        nonisolated deinit {}

        var stored: [String: PhotoAlertMemory] = [:]
        var refuses = false

        func memory(for userId: String) -> PhotoAlertMemory {
            stored[userId] ?? .empty
        }

        @discardableResult
        func store(_ memory: PhotoAlertMemory, for userId: String) -> Bool {
            guard !refuses else { return false }
            stored[userId] = memory
            return true
        }
    }

    @MainActor
    private final class Acknowledgements {
        nonisolated deinit {}

        var calls: [[String]] = []
    }

    private struct SUT {
        let invitations: GamePhotoInvitations
        let memories: Memories
        let notebook: MockGamePhotoNotebook
        let acknowledgements: Acknowledgements
    }

    private func makeSUT(sessionStartedAt: Date? = GamePhotoInvitationsTests.now.addingTimeInterval(-3600),
                         memories: Memories = Memories()) -> SUT {
        let notebook = MockGamePhotoNotebook()
        let acknowledgements = Acknowledgements()
        let invitations = GamePhotoInvitations(
            memories: memories,
            notebook: { _ in notebook },
            acknowledge: { acknowledgements.calls.append($0) },
            now: { GamePhotoInvitationsTests.now },
            sessionStartedAt: sessionStartedAt
        )
        return SUT(invitations: invitations, memories: memories, notebook: notebook, acknowledgements: acknowledgements)
    }

    private func flame(_ days: Int) -> PhotoCatchUpStanding {
        PhotoCatchUpStanding(flameRecord: days)
    }

    private func photo(invitations: PhotoInvitationsSetting = .every, moments: [GamePhotoMomentRow] = []) -> GamePhotoBlock {
        GamePhotoBlock(atmosphere: nil, invitations: invitations, baselineAt: nil, baseline: nil,
                       treasuryPeakTier: nil, moments: moments)
    }

    /// Une Flamme de 6 jours posée, puis une Flamme de 7 constatée : l'invitation attend un geste.
    private func pendingSevenDays(_ sut: SUT) async -> PendingPhotoInvitation? {
        await sut.invitations.observe(userId: "u1", standing: flame(6), photo: nil)
        await sut.invitations.observe(userId: "u1", standing: flame(7), photo: nil)
        return sut.invitations.pending
    }

    // MARK: - Les lectures du jeu

    func test_observe_firstReadOfAnAccount_setsTheBaselineWithoutInvitation() async {
        let sut = makeSUT()

        let outcome = await sut.invitations.observe(userId: "u1", standing: flame(30), photo: nil)

        XCTAssertEqual(outcome, .baseline)
        XCTAssertNil(sut.invitations.pending)
        XCTAssertEqual(sut.memories.stored["u1"]?.standing, flame(30))
    }

    func test_observe_aStepReachedSinceTheBaseline_holdsTheInvitationAndAdvancesTheStanding() async {
        let sut = makeSUT()

        await sut.invitations.observe(userId: "u1", standing: flame(6), photo: nil)
        let outcome = await sut.invitations.observe(userId: "u1", standing: flame(7), photo: nil)

        XCTAssertEqual(outcome, .alert)
        XCTAssertEqual(sut.invitations.pending?.announce.id, "flame:7")
        XCTAssertEqual(sut.invitations.pending?.propose.id, "flame:7")
        XCTAssertEqual(sut.invitations.pending?.userId, "u1")
        XCTAssertEqual(sut.memories.stored["u1"]?.standing, flame(7))
    }

    func test_observe_whileAnInvitationWaits_theNextOneWaitsWithoutAdvancingTheStanding() async {
        let sut = makeSUT()
        _ = await pendingSevenDays(sut)

        let outcome = await sut.invitations.observe(userId: "u1", standing: flame(30), photo: nil)

        XCTAssertEqual(outcome, .busy)
        XCTAssertEqual(sut.invitations.pending?.announce.id, "flame:7")
        XCTAssertEqual(sut.memories.stored["u1"]?.standing, flame(7))
    }

    func test_observe_aStepTheNotebookAlreadyKnows_invitesNothing() async {
        let sut = makeSUT()
        let seven = GamePhotoInvitations.moment("flame:7", standing: flame(7))
        XCTAssertNotNil(seven)
        if let seven { _ = await sut.notebook.postpone(seven) }

        await sut.invitations.observe(userId: "u1", standing: flame(6), photo: nil)
        let outcome = await sut.invitations.observe(userId: "u1", standing: flame(7), photo: nil)

        XCTAssertEqual(outcome, .none)
        XCTAssertNil(sut.invitations.pending)
        XCTAssertEqual(sut.memories.stored["u1"]?.standing, flame(7), "la situation avance quand même")
    }

    func test_observe_aStepPresentedOnAnotherDevice_invitesNothing() async {
        let sut = makeSUT()
        let served = photo(moments: [GamePhotoMomentRow(stepId: "flame:7", detectedAt: nil, presentedAt: "2026-10-22T10:00:00Z",
                                                        notifiedAt: nil, keptAt: nil)])

        await sut.invitations.observe(userId: "u1", standing: flame(6), photo: served)
        let outcome = await sut.invitations.observe(userId: "u1", standing: flame(7), photo: served)

        XCTAssertEqual(outcome, .none)
        XCTAssertNil(sut.invitations.pending)
    }

    func test_observe_settingNever_invitesNothingButAdvances() async {
        let sut = makeSUT()
        let never = photo(invitations: .never)

        await sut.invitations.observe(userId: "u1", standing: flame(6), photo: never)
        let outcome = await sut.invitations.observe(userId: "u1", standing: flame(7), photo: never)

        XCTAssertEqual(outcome, .none)
        XCTAssertEqual(sut.memories.stored["u1"]?.standing, flame(7))
    }

    func test_observe_duringTheSessionGrace_waitsWithoutTouchingTheMemory() async {
        let sut = makeSUT(sessionStartedAt: GamePhotoInvitationsTests.now)
        await sut.invitations.observe(userId: "u1", standing: flame(6), photo: nil)

        let outcome = await sut.invitations.observe(userId: "u1", standing: flame(7), photo: nil)

        XCTAssertEqual(outcome, .wait)
        XCTAssertNil(sut.invitations.pending)
        XCTAssertEqual(sut.memories.stored["u1"]?.standing, flame(6))
    }

    func test_observe_eachAccountHasItsOwnMemory() async {
        let sut = makeSUT()
        await sut.invitations.observe(userId: "u1", standing: flame(6), photo: nil)

        let outcome = await sut.invitations.observe(userId: "u2", standing: flame(7), photo: nil)

        XCTAssertEqual(outcome, .baseline, "un autre compte de l'appareil commence par sa propre ligne de base")
        XCTAssertNil(sut.invitations.pending)
    }

    func test_observe_whenTheDiskRefuses_theMemoryHoldsForTheSession() async {
        let memories = Memories()
        memories.refuses = true
        let sut = makeSUT(memories: memories)

        await sut.invitations.observe(userId: "u1", standing: flame(6), photo: nil)
        let outcome = await sut.invitations.observe(userId: "u1", standing: flame(7), photo: nil)

        XCTAssertEqual(outcome, .alert)
        XCTAssertNil(memories.stored["u1"])
    }

    // MARK: - Les gestes

    func test_displayed_acknowledgesOnce_andCountsForThePacing() async throws {
        let sut = makeSUT()
        let waiting = await pendingSevenDays(sut)
        let invitation = try XCTUnwrap(waiting)

        sut.invitations.displayed(invitation)
        sut.invitations.displayed(invitation)

        XCTAssertEqual(sut.acknowledgements.calls, [["flame:7"]])
        XCTAssertEqual(sut.memories.stored["u1"]?.shown.count, 1)
        XCTAssertTrue(sut.invitations.hasNotice, "la pastille du carnet s'allume")
    }

    func test_displayed_anInvitationNoLongerWaiting_acknowledgesNothing() async throws {
        let sut = makeSUT()
        let waiting = await pendingSevenDays(sut)
        let invitation = try XCTUnwrap(waiting)
        _ = sut.invitations.consume()

        sut.invitations.displayed(invitation)

        XCTAssertTrue(sut.acknowledgements.calls.isEmpty)
    }

    func test_consume_returnsTheInvitationAndFreesTheQueue() async throws {
        let sut = makeSUT()
        let waiting = await pendingSevenDays(sut)
        let invitation = try XCTUnwrap(waiting)

        XCTAssertEqual(sut.invitations.consume(), invitation)
        XCTAssertNil(sut.invitations.pending)
        XCTAssertNil(sut.invitations.consume())
    }

    func test_later_freesTheQueueAndPostponesTheProposedMoment() async {
        let sut = makeSUT()
        let waiting = await pendingSevenDays(sut)
        XCTAssertNotNil(waiting)

        await sut.invitations.later()?.value

        XCTAssertNil(sut.invitations.pending)
        XCTAssertEqual(sut.notebook.postponed.map(\.id), ["flame:7"])
    }

    func test_carnetVisited_turnsTheNoticeOff() async throws {
        let sut = makeSUT()
        let waiting = await pendingSevenDays(sut)
        let invitation = try XCTUnwrap(waiting)
        sut.invitations.displayed(invitation)

        sut.invitations.carnetVisited(userId: "u1")

        XCTAssertFalse(sut.invitations.hasNotice)
        XCTAssertEqual(sut.memories.stored["u1"]?.noticed, [])
    }

    // MARK: - La mémoire sur disque

    func test_memoryFile_livesInTheAccountGameFolder_andReadsBack() throws {
        let base = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: base) }
        let file = GamePhotoAlertMemoryFile(base: base)
        let memory = PhotoAlertMemory(standing: flame(7), shown: [PhotoAlertPacing.Shown(at: 1, dayKey: "2026-10-22")],
                                      noticed: ["flame:7"])

        XCTAssertTrue(file.store(memory, for: "u1"))

        XCTAssertEqual(GamePhotoAlertMemoryFile(base: base).memory(for: "u1"), memory)
        XCTAssertEqual(file.url(for: "u1").deletingLastPathComponent().standardizedFileURL,
                       GamePhotoNotebook.accountFolder(userId: "u1", base: base).standardizedFileURL,
                       "la mémoire part avec le dossier du jeu du compte")
        XCTAssertEqual(file.memory(for: "u2"), .empty)
    }

    func test_memoryFile_unreadable_readsAsEmpty() throws {
        let base = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: base) }
        let file = GamePhotoAlertMemoryFile(base: base)
        let url = file.url(for: "u1")
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("pas du json".utf8).write(to: url)

        XCTAssertEqual(file.memory(for: "u1"), .empty)
    }
}
