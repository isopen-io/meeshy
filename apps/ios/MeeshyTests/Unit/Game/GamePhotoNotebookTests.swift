import XCTest
@testable import Meeshy

/// Le carnet de progression (#9382) : sur l'appareil, une entrée par MOMENT, sept
/// jours d'attente, et un disque qui refuse se lit « carnet vide » — jamais une
/// exception qui remonterait jusqu'à l'écran.
@MainActor
final class GamePhotoNotebookTests: XCTestCase {

    private func makeDirectory() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("notebook-\(UUID().uuidString)", isDirectory: true)
    }

    private final class Clock: @unchecked Sendable {
        var now: Date
        init(_ now: Date) { self.now = now }
    }

    private func makeSUT(directory: URL? = nil, clock: Clock = Clock(Date(timeIntervalSince1970: 1_790_000_000))) -> (sut: GamePhotoNotebook, clock: Clock, directory: URL) {
        let dir = directory ?? makeDirectory()
        return (GamePhotoNotebook(directory: dir, now: { clock.now }), clock, dir)
    }

    private let moment = GamePhotoMoments.rank(.voix, division: .ii)
    private func photo(_ mode: PhotoMode = .selfie) -> KeptPhoto {
        KeptPhoto(story: Data("story".utf8), square: Data("square".utf8), mode: mode)
    }

    func test_postpone_leavesTheMomentPendingForSevenDays() async {
        let (sut, clock, _) = makeSUT()
        let ok = await sut.postpone(moment)
        let entries = await sut.list()
        XCTAssertTrue(ok)
        XCTAssertEqual(entries.map(\.status), [.pending])
        XCTAssertEqual(entries.first?.expiresAt, clock.now.addingTimeInterval(7 * 86_400))
    }

    func test_list_purgesAPendingMomentAfterSevenDays() async {
        let (sut, clock, _) = makeSUT()
        _ = await sut.postpone(moment)
        clock.now = clock.now.addingTimeInterval(7 * 86_400 + 1)
        let entries = await sut.list()
        XCTAssertTrue(entries.isEmpty)
    }

    func test_list_aKeptPhotoNeverExpiresByItself() async {
        let (sut, clock, _) = makeSUT()
        _ = await sut.keep(moment, photo: photo())
        clock.now = clock.now.addingTimeInterval(400 * 86_400)
        let entries = await sut.list()
        XCTAssertEqual(entries.map(\.status), [.kept])
    }

    func test_keep_takesThePlaceOfThePendingEntryOfTheSameMoment() async {
        let (sut, _, _) = makeSUT()
        _ = await sut.postpone(moment)
        _ = await sut.keep(moment, photo: photo(.card))
        let entries = await sut.list()
        XCTAssertEqual(entries.count, 1)
        XCTAssertEqual(entries.first?.status, .kept)
        XCTAssertEqual(entries.first?.mode, .card)
    }

    func test_keep_aRetakeReplacesThePreviousPhotoOfTheSameMoment() async {
        let (sut, _, _) = makeSUT()
        _ = await sut.keep(moment, photo: photo(.selfie))
        _ = await sut.keep(moment, photo: photo(.gallery))
        let entries = await sut.list()
        XCTAssertEqual(entries.count, 1)
        XCTAssertEqual(entries.first?.mode, .gallery)
    }

    func test_postpone_doesNotReplaceAKeptPhotoWithAWait() async {
        let (sut, _, _) = makeSUT()
        _ = await sut.keep(moment, photo: photo())
        _ = await sut.postpone(moment)
        let entries = await sut.list()
        XCTAssertEqual(entries.map(\.status), [.kept])
    }

    func test_imageData_returnsTheBytesOfTheKeptFormats() async {
        let (sut, _, _) = makeSUT()
        _ = await sut.keep(moment, photo: photo())
        let entry = await sut.list().first
        let story = await entry.asyncFlatMap { await sut.imageData(for: $0, square: false) }
        let square = await entry.asyncFlatMap { await sut.imageData(for: $0, square: true) }
        XCTAssertEqual(story, Data("story".utf8))
        XCTAssertEqual(square, Data("square".utf8))
    }

    func test_remove_deletesTheEntryAndItsFiles() async {
        let (sut, _, directory) = makeSUT()
        _ = await sut.keep(moment, photo: photo())
        let ok = await sut.remove(momentId: moment.id)
        let entries = await sut.list()
        XCTAssertTrue(ok)
        XCTAssertTrue(entries.isEmpty)
        let files = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        XCTAssertFalse(files.contains { $0.hasSuffix(".jpg") })
    }

    func test_list_mostRecentFirst() async {
        let (sut, clock, _) = makeSUT()
        _ = await sut.keep(GamePhotoMoments.start(), photo: photo())
        clock.now = clock.now.addingTimeInterval(60)
        _ = await sut.keep(moment, photo: photo())
        let entries = await sut.list()
        XCTAssertEqual(entries.map(\.momentId), [moment.id, "start"])
    }

    func test_anUnwritableDirectory_isToldAsNotKept_andReadsAsAnEmptyNotebook() async {
        let (sut, _, _) = makeSUT(directory: URL(fileURLWithPath: "/dev/null/notebook"))
        let kept = await sut.keep(moment, photo: photo())
        let postponed = await sut.postpone(moment)
        let entries = await sut.list()
        XCTAssertFalse(kept)
        XCTAssertFalse(postponed)
        XCTAssertTrue(entries.isEmpty)
    }

    func test_concurrentWrites_neverLoseAnEntry() async {
        let (sut, _, _) = makeSUT()
        let moments = (0..<24).map { GamePhotoMoments.levelHundred(prestige: $0) }
        let kept = photo()

        var results: [Bool] = []
        await withTaskGroup(of: Bool.self) { group in
            for (index, moment) in moments.enumerated() {
                group.addTask { @MainActor in
                    index.isMultiple(of: 2) ? await sut.keep(moment, photo: kept) : await sut.postpone(moment)
                }
            }
            for await written in group { results.append(written) }
        }

        let entries = await sut.list()
        XCTAssertEqual(results.filter { $0 }.count, moments.count)
        XCTAssertEqual(Set(entries.map(\.momentId)), Set(moments.map(\.id)), "aucune écriture n'en défait une autre")
    }

    func test_twoNotebooksOnTheSameDirectory_shareOneSerialDisk() async {
        let directory = makeDirectory()
        let (first, _, _) = makeSUT(directory: directory)
        let (second, _, _) = makeSUT(directory: directory)
        let a = GamePhotoMoments.levelHundred(prestige: 1)
        let b = GamePhotoMoments.levelHundred(prestige: 2)

        let image = photo()
        async let kept = first.keep(a, photo: image)
        async let postponed = second.postpone(b)
        _ = await (kept, postponed)

        let entries = await first.list()
        XCTAssertEqual(Set(entries.map(\.momentId)), Set([a.id, b.id]))
    }

    func test_sanitized_makesASafeFileStem() {
        XCTAssertEqual(GamePhotoNotebook.sanitized("rank:voix:2"), "rank_voix_2")
        XCTAssertEqual(GamePhotoNotebook.sanitized("level-100:0"), "level-100_0")
    }
}

private extension Optional {
    func asyncFlatMap<T>(_ transform: (Wrapped) async -> T?) async -> T? {
        switch self {
        case .some(let value): return await transform(value)
        case .none: return nil
        }
    }
}
