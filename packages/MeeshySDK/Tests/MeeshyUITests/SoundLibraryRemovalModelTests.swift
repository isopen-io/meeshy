import XCTest
@testable import MeeshySDK
@testable import MeeshyUI

/// #9848 — retirer un son de « Mes sons » : confirmation, mise à jour
/// OPTIMISTE (la ligne part au geste, pas à la réponse), retour arrière à sa
/// place si le serveur refuse.
@MainActor
final class SoundLibraryRemovalModelTests: XCTestCase {

    private func loadedModel(_ service: FakeSoundLibraryService,
                             preview: FakeSoundPreview = FakeSoundPreview()) async -> SoundLibraryPickerModel {
        service.mineResult = SoundPage(sounds: [
            makeSound(id: "a", title: "Pluie"),
            makeSound(id: "b", title: "Vent", postCount: 3),
            makeSound(id: "c", title: "Mer"),
        ], nextCursor: nil)
        let model = SoundLibraryPickerModel(service: service, preview: preview)
        await model.reload()
        return model
    }

    func test_canRemove_onlyOnMySounds() async {
        let model = await loadedModel(FakeSoundLibraryService())
        XCTAssertTrue(model.canRemove)
        model.tab = .trending
        XCTAssertFalse(model.canRemove)
    }

    func test_beginRemove_asksForConfirmationWithoutTouchingTheList() async {
        let service = FakeSoundLibraryService()
        let model = await loadedModel(service)
        model.beginRemove(model.sounds[1])
        XCTAssertEqual(model.removing?.id, "b")
        XCTAssertEqual(model.sounds.map(\.id), ["a", "b", "c"])
        XCTAssertTrue(service.removeCalls.isEmpty)
    }

    func test_confirmRemove_rowLeavesBeforeTheServerAnswers() async {
        let service = FakeSoundLibraryService()
        service.removeResult = SoundRemoval(id: "b", deletedAt: "2026-10-09T20:00:00.000Z", postCount: 3)
        service.removalBlocksUntilReleased = true
        let model = await loadedModel(service)
        let target = model.sounds[1]
        model.beginRemove(target)

        let task = Task { await model.confirmRemove(target) }
        while !service.isRemovalWaiting { await Task.yield() }

        XCTAssertEqual(model.sounds.map(\.id), ["a", "c"], "la ligne part au geste, pas à la réponse")
        XCTAssertNil(model.removing)

        service.releaseRemoval()
        await task.value
        XCTAssertEqual(model.sounds.map(\.id), ["a", "c"])
        XCTAssertEqual(service.removeCalls, ["b"])
        XCTAssertFalse(model.removalFailed)
    }

    func test_confirmRemove_serverRefuses_putsTheRowBackAtItsPlace() async {
        let service = FakeSoundLibraryService()
        service.removeResult = nil
        let model = await loadedModel(service)

        await model.confirmRemove(model.sounds[1])

        XCTAssertEqual(model.sounds.map(\.id), ["a", "b", "c"])
        XCTAssertTrue(model.removalFailed)
    }

    func test_confirmRemove_stopsThePreviewOfTheRemovedSound() async {
        let service = FakeSoundLibraryService()
        service.removeResult = SoundRemoval(id: "a", deletedAt: nil, postCount: 0)
        let preview = FakeSoundPreview()
        preview.readyInstantly = true
        let model = await loadedModel(service, preview: preview)
        model.togglePreview(model.sounds[0])
        XCTAssertEqual(model.previewingId, "a")

        await model.confirmRemove(model.sounds[0])

        XCTAssertNil(model.previewingId)
        XCTAssertGreaterThanOrEqual(preview.stopCount, 1)
    }

    func test_confirmRemove_ofAnotherSound_keepsThePreviewPlaying() async {
        let service = FakeSoundLibraryService()
        service.removeResult = SoundRemoval(id: "c", deletedAt: nil, postCount: 0)
        let preview = FakeSoundPreview()
        preview.readyInstantly = true
        let model = await loadedModel(service, preview: preview)
        model.togglePreview(model.sounds[0])

        await model.confirmRemove(model.sounds[2])

        XCTAssertEqual(model.previewingId, "a")
    }

    func test_removalMessage_saysHowManyPostsStillPlayIt() {
        let unused = SoundLibraryPickerModel.removalMessage(for: makeSound(id: "a", postCount: 0))
        let used = SoundLibraryPickerModel.removalMessage(for: makeSound(id: "b", postCount: 3))
        XCTAssertFalse(unused.isEmpty)
        XCTAssertNotEqual(unused, used, "l'utilisateur doit savoir, avant de confirmer, que des publications le jouent encore")
        XCTAssertTrue(used.contains("3"))
    }
}
