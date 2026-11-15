import XCTest
import UIKit
@testable import Meeshy

/// Le carnet de progression (#9382, v2 #10161) : sur l'appareil, une entrée par MOMENT, une
/// attente sans échéance, la recette de chaque photo, et un disque qui refuse se lit « carnet
/// vide » — jamais une exception qui remonterait jusqu'à l'écran.
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
    private let trophy = GamePhotoMoments.achievement(id: "first_message", title: "Premier message")
    private func photo(_ mode: PhotoMode = .selfie, source: Data? = nil, recipe: NotebookRecipe = NotebookRecipe()) -> KeptPhoto {
        KeptPhoto(story: Data("story".utf8), mode: mode, source: source, recipe: recipe)
    }

    /// L'index tel que l'écrivaient les versions d'avant #10161 : sans recette, avec `expiresAt` et deux images.
    private func writeOldIndex(_ rows: [[String: Any]], in directory: URL) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try JSONSerialization.data(withJSONObject: rows).write(to: directory.appendingPathComponent("index.json"))
    }

    private func encoded(_ emblem: PhotoEmblem) throws -> Any {
        try JSONSerialization.jsonObject(with: JSONEncoder().encode(emblem), options: [.fragmentsAllowed])
    }

    // MARK: - « Plus tard » sans échéance (#10161)

    func test_postpone_aNonDeducibleMoment_waitsWithoutExpiry() async {
        let (sut, _, _) = makeSUT()
        let ok = await sut.postpone(trophy)
        let entries = await sut.list()
        XCTAssertTrue(ok)
        XCTAssertEqual(entries.map(\.status), [.pending])
        XCTAssertNil(entries.first?.expiresAt)
    }

    func test_list_aPendingEntryNeverDisappears_evenOneWrittenWithAPastExpiry() async throws {
        let (sut, clock, directory) = makeSUT()
        try writeOldIndex([[
            "momentId": "achievement:first_message", "emblem": try encoded(.achievement(rarity: nil)), "kicker": "Succès", "title": "Premier message",
            "status": "pending", "createdAt": "2026-01-01T00:00:00Z", "expiresAt": "2026-01-08T00:00:00Z",
        ]], in: directory)
        clock.now = clock.now.addingTimeInterval(400 * 86_400)
        let entries = await sut.list()
        XCTAssertEqual(entries.map(\.momentId), ["achievement:first_message"])
    }

    func test_postpone_aTrackStep_writesNothing_itIsCaughtUpInstead() async {
        let (sut, _, _) = makeSUT()
        let ok = await sut.postpone(moment)
        let entries = await sut.list()
        XCTAssertTrue(ok)
        XCTAssertTrue(entries.isEmpty, "une étape de piste reportée n'apparaît que dans « À rattraper »")
    }

    // MARK: - La recette (#10161)

    func test_keep_aNewEntry_keepsOnlyTheStoryAndItsSource_withItsRecipe() async throws {
        let (sut, _, directory) = makeSUT()
        let recipe = NotebookRecipe(
            frameId: "savane.lion", pose: "crest", message: "Enfin", crop: NotebookCrop(x: 0.1, y: -0.2, zoom: 1.4),
            mirror: true, showFlame: true, showLink: false, momentAt: Date(timeIntervalSince1970: 1_789_000_000)
        )
        let outcome = await sut.keep(moment, photo: photo(.selfie, source: Data("source".utf8), recipe: recipe))
        let listed = await sut.list()
        let entry = try XCTUnwrap(listed.first)
        XCTAssertEqual(outcome, .kept)
        XCTAssertEqual(entry.recipe, recipe)
        XCTAssertNil(entry.squareFile)
        XCTAssertNil(entry.expiresAt)
        XCTAssertEqual(entry.sourceFile, "rank_voix_2-source.jpg")
        let story = await sut.imageData(for: entry, square: false)
        let square = await sut.imageData(for: entry, square: true)
        let source = await sut.sourceData(for: entry)
        XCTAssertEqual(story, Data("story".utf8))
        XCTAssertNil(square)
        XCTAssertEqual(source, Data("source".utf8))
        let files = try FileManager.default.contentsOfDirectory(atPath: directory.path).sorted()
        XCTAssertEqual(files, ["index.json", "rank_voix_2-source.jpg", "rank_voix_2-story.jpg"])
        XCTAssertEqual(entry.retakeChoices, [.samePhoto, .selfie, .card])
    }

    func test_occupiedBytes_sumsTheImagesOfEveryEntry() async {
        let (sut, _, _) = makeSUT()
        _ = await sut.keep(moment, photo: photo(.selfie, source: Data("source".utf8)))
        _ = await sut.keep(trophy, photo: photo(.card))
        let bytes = await sut.occupiedBytes()
        XCTAssertEqual(bytes, Int64("story".utf8.count * 2 + "source".utf8.count))
    }

    func test_keep_aCardAlone_hasNoSource() async throws {
        let (sut, _, _) = makeSUT()
        _ = await sut.keep(moment, photo: photo(.card))
        let listed = await sut.list()
        let entry = try XCTUnwrap(listed.first)
        XCTAssertNil(entry.sourceFile)
        XCTAssertEqual(entry.retakeChoices, [.selfie, .card])
    }

    func test_anOldIndex_isReadAsWritten_andOffersOnlyANewSelfieOrTheCard() async throws {
        let (sut, _, directory) = makeSUT()
        try writeOldIndex([], in: directory)
        try Data("s".utf8).write(to: directory.appendingPathComponent("start-story.jpg"))
        try Data("q".utf8).write(to: directory.appendingPathComponent("start-square.jpg"))
        try writeOldIndex([[
            "momentId": "start", "emblem": try encoded(.start), "kicker": "Départ", "title": "Le départ", "status": "kept",
            "createdAt": "2026-01-01T00:00:00Z", "expiresAt": NSNull(), "mode": "selfie",
            "storyFile": "start-story.jpg", "squareFile": "start-square.jpg",
        ]], in: directory)
        let listed = await sut.list()
        let entry = try XCTUnwrap(listed.first)
        XCTAssertEqual(entry.momentId, "start")
        XCTAssertEqual(entry.recipe, NotebookRecipe())
        XCTAssertEqual(entry.retakeChoices, [.selfie, .card])
        let square = await sut.imageData(for: entry, square: true)
        XCTAssertEqual(square, Data("q".utf8))
    }

    /// Un carnet dont l'écriture de la SOURCE échoue (l'image 9:16 est déjà écrite) : le cas où une écriture
    /// à moitié laisserait une entrée ou un fichier orphelin.
    private func failingSUT(directory: URL, error: Error) -> GamePhotoNotebook {
        GamePhotoNotebook(directory: directory, write: { data, url in
            if url.lastPathComponent.contains("source") { throw error }
            try GamePhotoNotebook.protectedWrite(data, url)
        })
    }

    func test_keep_aRefusedWrite_createsNoEntry_andLeavesNoFile() async throws {
        let directory = makeDirectory()
        let sut = failingSUT(directory: directory, error: CocoaError(.fileWriteNoPermission))
        let outcome = await sut.keep(moment, photo: photo(.selfie, source: Data("source".utf8)))
        let entries = await sut.list()
        XCTAssertEqual(outcome, .unavailable)
        XCTAssertTrue(entries.isEmpty)
        let files = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        XCTAssertEqual(files, [], "ni entrée ni fichier à moitié")
    }

    func test_keep_aFullDisk_isNoSpace_andCreatesNoEntry() async {
        let directory = makeDirectory()
        let sut = failingSUT(directory: directory, error: CocoaError(.fileWriteOutOfSpace))
        let outcome = await sut.keep(moment, photo: photo(.selfie, source: Data("source".utf8)))
        let entries = await sut.list()
        XCTAssertEqual(outcome, .noSpace)
        XCTAssertTrue(entries.isEmpty)
    }

    func test_keep_aRetakeThatFails_leavesThePreviousPhotoIntact() async throws {
        let (sut, _, directory) = makeSUT()
        _ = await sut.keep(moment, photo: KeptPhoto(story: Data("before".utf8), mode: .card))
        let failing = failingSUT(directory: directory, error: CocoaError(.fileWriteOutOfSpace))
        let outcome = await failing.keep(moment, photo: KeptPhoto(story: Data("after".utf8), mode: .selfie, source: Data("source".utf8)))
        let listed = await sut.list()
        let entry = try XCTUnwrap(listed.first)
        let story = await sut.imageData(for: entry, square: false)
        XCTAssertEqual(outcome, .noSpace)
        XCTAssertEqual(entry.mode, .card)
        XCTAssertEqual(story, Data("before".utf8))
    }

    func test_keep_aRetake_replacesTheFilesItRewrites_andDropsTheOldSquare() async throws {
        let (sut, _, directory) = makeSUT()
        try writeOldIndex([[
            "momentId": moment.id, "emblem": try encoded(moment.emblem), "kicker": "k", "title": "t", "status": "kept",
            "createdAt": "2026-01-01T00:00:00Z", "mode": "selfie", "storyFile": "rank_voix_2-story.jpg", "squareFile": "rank_voix_2-square.jpg",
        ]], in: directory)
        try Data("old".utf8).write(to: directory.appendingPathComponent("rank_voix_2-story.jpg"))
        try Data("q".utf8).write(to: directory.appendingPathComponent("rank_voix_2-square.jpg"))
        _ = await sut.keep(moment, photo: photo(.selfie, source: Data("source".utf8)))
        let files = try FileManager.default.contentsOfDirectory(atPath: directory.path).sorted()
        XCTAssertEqual(files, ["index.json", "rank_voix_2-source.jpg", "rank_voix_2-story.jpg"])
        let listed = await sut.list()
        let entry = try XCTUnwrap(listed.first)
        let story = await sut.imageData(for: entry, square: false)
        XCTAssertEqual(story, Data("story".utf8))
    }

    func test_outcome_aFullDisk_isNoSpace() {
        XCTAssertEqual(GamePhotoNotebook.outcome(of: CocoaError(.fileWriteOutOfSpace)), .noSpace)
        XCTAssertEqual(GamePhotoNotebook.outcome(of: POSIXError(.ENOSPC)), .noSpace)
        XCTAssertEqual(GamePhotoNotebook.outcome(of: NSError(domain: NSPOSIXErrorDomain, code: Int(ENOSPC))), .noSpace)
        XCTAssertEqual(GamePhotoNotebook.outcome(of: CocoaError(.fileWriteNoPermission)), .unavailable)
    }

    func test_sourceData_isReducedTo1440Pixels() throws {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 2000, height: 3000), format: {
            let format = UIGraphicsImageRendererFormat()
            format.scale = 1
            return format
        }()).image { context in
            UIColor.red.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 2000, height: 3000))
        }
        let data = try XCTUnwrap(GamePhotoNotebook.sourceData(from: image))
        let reduced = try XCTUnwrap(UIImage(data: data))
        XCTAssertEqual(reduced.size.width * reduced.scale, 960, accuracy: 1)
        XCTAssertEqual(reduced.size.height * reduced.scale, 1440, accuracy: 1)
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
        _ = await sut.postpone(trophy)
        _ = await sut.keep(trophy, photo: photo(.card))
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
        _ = await sut.keep(trophy, photo: photo())
        _ = await sut.postpone(trophy)
        let entries = await sut.list()
        XCTAssertEqual(entries.map(\.status), [.kept])
    }

    func test_remove_deletesTheEntryAndItsFiles() async {
        let (sut, _, directory) = makeSUT()
        _ = await sut.keep(moment, photo: photo(source: Data("source".utf8)))
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
        let postponed = await sut.postpone(trophy)
        let entries = await sut.list()
        XCTAssertEqual(kept, .unavailable)
        XCTAssertFalse(postponed)
        XCTAssertTrue(entries.isEmpty)
    }

    func test_concurrentWrites_neverLoseAnEntry() async {
        let (sut, _, _) = makeSUT()
        let moments = (0..<24).map { GamePhotoMoments.achievement(id: "a\($0)", title: "A\($0)") }
        let kept = photo()

        let writes = moments.enumerated().map { index, moment in
            Task<Bool, Never> { @MainActor in
                if index.isMultiple(of: 2) { return await sut.keep(moment, photo: kept) == .kept }
                return await sut.postpone(moment)
            }
        }
        var results: [Bool] = []
        for write in writes { results.append(await write.value) }

        let entries = await sut.list()
        XCTAssertEqual(results.filter { $0 }.count, moments.count)
        XCTAssertEqual(Set(entries.map(\.momentId)), Set(moments.map(\.id)), "aucune écriture n'en défait une autre")
    }

    func test_twoNotebooksOnTheSameDirectory_shareOneSerialDisk() async {
        let directory = makeDirectory()
        let (first, _, _) = makeSUT(directory: directory)
        let (second, _, _) = makeSUT(directory: directory)
        let a = GamePhotoMoments.achievement(id: "a1", title: "A1")
        let b = GamePhotoMoments.achievement(id: "a2", title: "A2")

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
