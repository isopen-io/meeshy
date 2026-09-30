import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// #8848 — la création en cours du meuble se sauvegarde seule et revient à la
/// réouverture, sous le seul compte qui l'a écrite.
///
/// Cause de la régression : le 2026-09-01 (a7136904dc, 7d51e2bbc1), story, réel
/// et post ont quitté l'atelier du SDK — qui s'autosauvegardait dans
/// `StoryDraftStore` — pour le meuble, qui n'avait aucune sauvegarde.
@MainActor
final class ComposerAutosaveTests: XCTestCase {

    // MARK: - Fabriques

    private func makeTempDirectory() -> URL {
        let dossier = FileManager.default.temporaryDirectory
            .appendingPathComponent("autosave-tests-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: dossier, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: dossier) }
        return dossier
    }

    private func makeStore() -> ComposerAutosaveStore {
        let racine = makeTempDirectory()
        return ComposerAutosaveStore(root: racine.appendingPathComponent("drafts"),
                                     sessionRoot: racine.appendingPathComponent("session"))
    }

    private func makeAccount(_ userId: String = "u1",
                             origin: String = "https://gate.meeshy.me") -> ComposerAutosaveAccount {
        ComposerAutosaveAccount(userId: userId, serverOrigin: origin)!
    }

    private func makeMediaFile(named nom: String = "photo.jpg", in dossier: URL) -> URL {
        let url = dossier.appendingPathComponent(nom)
        try? Data([0xFF, 0xD8, 0xFF, 0x01]).write(to: url)
        return url
    }

    private func makeImage() -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4)).image { contexte in
            UIColor.gray.setFill()
            contexte.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
        }
    }

    private func makeState(text: String = "Bonjour",
                           format: ComposerFormat = .story,
                           media: URL? = nil,
                           image: UIImage? = nil) -> ComposerAutosaveState {
        var slide = StorySlide(id: "s1")
        slide.content = text.isEmpty ? nil : text
        let porters: ComposerMediaPorters = media.map { url in
            ComposerMediaPorters(
                localMedia: [ComposerDocumentMedia(url: url, mimeType: "image/jpeg", durationMs: nil)],
                roleByURL: [url: .background],
                slideIdByMediaURL: [url: "s1"],
                objectIdBySource: [url: "obj-1"],
                captions: [url: "Une légende"],
                altsByObjectId: ["obj-1": "Un chat"],
                transcriptions: [:],
                railPosedURLs: [url])
        } ?? .empty
        return ComposerAutosaveState(
            format: format, text: text, background: "#123456",
            visibility: PostVisibility.friends.rawValue, visibilityUserIds: [],
            language: "fr", location: nil,
            references: [ComposerReference(username: "alice", userId: "a1", display: .inline)],
            editingPostId: nil, slides: [slide], currentSlideIndex: 0, porters: porters,
            images: image.map { ["obj-1": $0] } ?? [:], slideImages: [:],
            videos: [:], audios: [:], stickerAnimations: [:])
    }

    // MARK: - Aller-retour

    func test_save_thenLoad_restoresTextFormatAudienceAndReferences() throws {
        let store = makeStore()
        let compte = makeAccount()

        store.save(ComposerAutosaveCodec.write(from: makeState(format: .reel)), account: compte, slot: .creation)
        let relu = try XCTUnwrap(store.load(account: compte, slot: .creation))
        let etat = try XCTUnwrap(ComposerAutosaveCodec.state(from: relu))

        XCTAssertEqual(etat.format, .reel)
        XCTAssertEqual(etat.text, "Bonjour")
        XCTAssertEqual(etat.background, "#123456")
        XCTAssertEqual(etat.visibility, PostVisibility.friends.rawValue)
        XCTAssertEqual(etat.references.map(\.username), ["alice"])
        XCTAssertEqual(etat.slides.first?.content, "Bonjour")
    }

    func test_save_thenLoad_mediaSurvivesThePurgeOfItsSourceFile() throws {
        let store = makeStore()
        let compte = makeAccount()
        let source = makeMediaFile(in: makeTempDirectory())

        store.save(ComposerAutosaveCodec.write(from: makeState(media: source, image: makeImage())),
                   account: compte, slot: .creation)
        store.waitForPendingWrites()
        try FileManager.default.removeItem(at: source)
        let relu = try XCTUnwrap(store.load(account: compte, slot: .creation))
        let etat = try XCTUnwrap(ComposerAutosaveCodec.state(from: relu))

        let media = try XCTUnwrap(etat.porters.localMedia.first)
        XCTAssertTrue(FileManager.default.fileExists(atPath: media.url.path))
        XCTAssertNotEqual(media.url, source)
        XCTAssertEqual(etat.porters.roleByURL[media.url], .background)
        XCTAssertEqual(etat.porters.slideIdByMediaURL[media.url], "s1")
        XCTAssertEqual(etat.porters.objectIdBySource[media.url], "obj-1")
        XCTAssertEqual(etat.porters.captions[media.url], "Une légende")
        XCTAssertEqual(etat.porters.railPosedURLs, [media.url])
        XCTAssertNotNil(etat.images["obj-1"])
    }

    /// Le serveur balaie à 24 h un média pré-monté qu'aucune publication ne
    /// cite : un brouillon relu le lendemain ne doit pas publier son identifiant.
    func test_save_preUploadedObject_becomesLocalAgainAndKeepsItsFile() throws {
        let store = makeStore()
        let compte = makeAccount()
        let local = makeMediaFile(named: "clip.mp4", in: makeTempDirectory())
        var etat = makeState()
        etat.slides[0].effects.mediaObjects = [
            StoryMediaObject(id: "obj-9", postMediaId: "pm-1", mediaURL: "https://cdn.meeshy.me/pm-1.mp4",
                             mediaType: "video", aspectRatio: nil)
        ]
        etat.adoptedLocalMedia = ["pm-1": local]

        store.save(ComposerAutosaveCodec.write(from: etat), account: compte, slot: .creation)
        store.waitForPendingWrites()
        try FileManager.default.removeItem(at: local)
        let relu = try XCTUnwrap(ComposerAutosaveCodec.state(from: XCTUnwrap(store.load(account: compte, slot: .creation))))

        let objet = try XCTUnwrap(relu.slides.first?.effects.mediaObjects?.first)
        XCTAssertEqual(objet.postMediaId, "")
        let url = try XCTUnwrap(objet.mediaURL.flatMap(URL.init(string:)))
        XCTAssertTrue(url.isFileURL)
        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path))
    }

    func test_save_localSceneObject_pointsToTheDraftCopy() throws {
        let store = makeStore()
        let compte = makeAccount()
        let local = makeMediaFile(named: "son.m4a", in: makeTempDirectory())
        var etat = makeState()
        etat.slides[0].effects.mediaObjects = [
            StoryMediaObject(id: "obj-3", mediaURL: local.absoluteString, mediaType: "image", aspectRatio: 1)
        ]

        store.save(ComposerAutosaveCodec.write(from: etat), account: compte, slot: .creation)
        let relu = try XCTUnwrap(ComposerAutosaveCodec.state(from: XCTUnwrap(store.load(account: compte, slot: .creation))))

        let url = try XCTUnwrap(relu.slides.first?.effects.mediaObjects?.first?.mediaURL.flatMap(URL.init(string:)))
        XCTAssertNotEqual(url, local)
        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path))
    }

    func test_load_afterDelete_returnsNil() {
        let store = makeStore()
        let compte = makeAccount()
        store.save(ComposerAutosaveCodec.write(from: makeState()), account: compte, slot: .creation)

        store.delete(account: compte, slot: .creation)

        XCTAssertNil(store.load(account: compte, slot: .creation))
        XCTAssertFalse(store.hasDraft(account: compte, slot: .creation))
    }

    func test_load_underAnotherAccount_returnsNil() {
        let store = makeStore()
        store.save(ComposerAutosaveCodec.write(from: makeState()), account: makeAccount("u1"), slot: .creation)

        XCTAssertNil(store.load(account: makeAccount("u2"), slot: .creation))
        XCTAssertNotNil(store.load(account: makeAccount("u1"), slot: .creation))
    }

    func test_load_underAnotherEnvironment_returnsNil() {
        let store = makeStore()
        store.save(ComposerAutosaveCodec.write(from: makeState()),
                   account: makeAccount("u1", origin: "https://staging.meeshy.me"), slot: .creation)

        XCTAssertNil(store.load(account: makeAccount("u1", origin: "https://gate.meeshy.me"), slot: .creation))
    }

    func test_deleteAll_removesEveryAccountsDraft() {
        let store = makeStore()
        store.save(ComposerAutosaveCodec.write(from: makeState()), account: makeAccount("u1"), slot: .creation)
        store.save(ComposerAutosaveCodec.write(from: makeState()), account: makeAccount("u2"), slot: .creation)

        store.deleteAll()

        XCTAssertFalse(store.hasDraft(account: makeAccount("u1"), slot: .creation))
        XCTAssertFalse(store.hasDraft(account: makeAccount("u2"), slot: .creation))
    }

    func test_account_withoutUser_isNil() {
        XCTAssertNil(ComposerAutosaveAccount(userId: nil, serverOrigin: "https://gate.meeshy.me"))
        XCTAssertNil(ComposerAutosaveAccount(userId: "  ", serverOrigin: "https://gate.meeshy.me"))
    }

    // MARK: - Contenu

    func test_hasContent_withOnlyAPaletteBackground_isFalse() {
        XCTAssertFalse(makeState(text: "").hasContent)
    }

    func test_hasContent_withText_isTrue() {
        XCTAssertTrue(makeState(text: "Salut").hasContent)
    }

    // MARK: - Contrôleur

    private func makeController(store: MockComposerAutosaveStore) -> ComposerAutosaveController {
        ComposerAutosaveController(store: store, debounceNanoseconds: 10_000_000)
    }

    func test_bind_restoringOpeningWithStoredDraft_returnsItAndOwnsIt() {
        let mock = MockComposerAutosaveStore()
        mock.loadResult = ComposerAutosaveRestored(
            snapshot: ComposerAutosaveCodec.write(from: makeState()).snapshot,
            urlByFile: [:], bitmapByFile: [:], blobByFile: [:])
        let sut = makeController(store: mock)

        let restored = sut.bind(account: makeAccount(), opening: .restores)

        XCTAssertNotNil(restored)
        XCTAssertTrue(sut.ownsStoredDraft)
    }

    func test_bind_withoutAccount_neverReads() {
        let mock = MockComposerAutosaveStore()
        let sut = makeController(store: mock)

        XCTAssertNil(sut.bind(account: nil, opening: .restores))
        XCTAssertEqual(mock.loadCallCount, 0)
    }

    func test_bind_disabledOpening_neverReadsNorWrites() {
        let mock = MockComposerAutosaveStore()
        let sut = makeController(store: mock)

        XCTAssertNil(sut.bind(account: makeAccount(), opening: .disabled))
        sut.flushNow { self.makeState() }

        XCTAssertEqual(mock.loadCallCount, 0)
        XCTAssertEqual(mock.saveCallCount, 0)
    }

    func test_flushNow_withContent_saves() {
        let mock = MockComposerAutosaveStore()
        let sut = makeController(store: mock)
        _ = sut.bind(account: makeAccount(), opening: .restores)

        sut.flushNow { self.makeState(text: "Salut") }

        XCTAssertEqual(mock.saveCallCount, 1)
        XCTAssertEqual(mock.lastSaved?.snapshot.text, "Salut")
    }

    func test_flushNow_seededSessionWithStoredDraft_neverOverwritesIt() {
        let mock = MockComposerAutosaveStore()
        mock.hasDraftResult = true
        let sut = makeController(store: mock)
        _ = sut.bind(account: makeAccount(), opening: .preservesStoredDraft)

        sut.flushNow { self.makeState(text: "Autre chose") }

        XCTAssertEqual(mock.loadCallCount, 0)
        XCTAssertEqual(mock.saveCallCount, 0)
    }

    func test_flushNow_emptyCompositionOfAPristineSession_deletesNothing() {
        let mock = MockComposerAutosaveStore()
        let sut = makeController(store: mock)
        _ = sut.bind(account: makeAccount(), opening: .restores)

        sut.flushNow { self.makeState(text: "") }

        XCTAssertEqual(mock.deleteCallCount, 0)
        XCTAssertEqual(mock.saveCallCount, 0)
    }

    func test_flushNow_emptiedAfterWriting_deletesTheDraft() {
        let mock = MockComposerAutosaveStore()
        let sut = makeController(store: mock)
        _ = sut.bind(account: makeAccount(), opening: .restores)
        sut.flushNow { self.makeState(text: "Salut") }

        sut.flushNow { self.makeState(text: "") }

        XCTAssertEqual(mock.deleteCallCount, 1)
        XCTAssertFalse(sut.ownsStoredDraft)
    }

    func test_discard_afterPublication_deletesAndStopsEveryLaterWrite() {
        let mock = MockComposerAutosaveStore()
        let sut = makeController(store: mock)
        _ = sut.bind(account: makeAccount(), opening: .restores)
        sut.flushNow { self.makeState(text: "Salut") }

        sut.discard()
        sut.flushNow { self.makeState(text: "Salut") }

        XCTAssertEqual(mock.deleteCallCount, 1)
        XCTAssertEqual(mock.saveCallCount, 1)
    }

    func test_schedule_writesOnceAfterTheLull() async {
        let mock = MockComposerAutosaveStore()
        let sut = makeController(store: mock)
        _ = sut.bind(account: makeAccount(), opening: .restores)

        sut.schedule { self.makeState(text: "a") }
        sut.schedule { self.makeState(text: "ab") }
        sut.schedule { self.makeState(text: "abc") }
        try? await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertEqual(mock.saveCallCount, 1)
        XCTAssertEqual(mock.lastSaved?.snapshot.text, "abc")
    }

    func test_deinit_withPendingWrite_releasesTheController() {
        let mock = MockComposerAutosaveStore()
        weak var faible: ComposerAutosaveController?
        do {
            let sut = ComposerAutosaveController(store: mock, debounceNanoseconds: 60_000_000_000)
            _ = sut.bind(account: makeAccount(), opening: .restores)
            sut.schedule { self.makeState() }
            faible = sut
        }
        XCTAssertNil(faible)
    }

    // MARK: - Ouverture

    func test_decide_blankDoor_restores() {
        XCTAssertEqual(ComposerAutosaveOpening.decide(opensOnAtelier: false, isHydrated: false,
                                                      resumesDraft: false, isSeeded: false,
                                                      opensOnMood: false), .restores)
    }

    func test_decide_seededDoor_preservesTheStoredDraft() {
        XCTAssertEqual(ComposerAutosaveOpening.decide(opensOnAtelier: false, isHydrated: false,
                                                      resumesDraft: false, isSeeded: true,
                                                      opensOnMood: false), .preservesStoredDraft)
    }

    func test_decide_atelierOrEditOrResume_isDisabled() {
        XCTAssertEqual(ComposerAutosaveOpening.decide(opensOnAtelier: true, isHydrated: false,
                                                      resumesDraft: false, isSeeded: false,
                                                      opensOnMood: false), .disabled)
        XCTAssertEqual(ComposerAutosaveOpening.decide(opensOnAtelier: false, isHydrated: true,
                                                      resumesDraft: false, isSeeded: false,
                                                      opensOnMood: false), .disabled)
        XCTAssertEqual(ComposerAutosaveOpening.decide(opensOnAtelier: false, isHydrated: false,
                                                      resumesDraft: true, isSeeded: false,
                                                      opensOnMood: false), .disabled)
    }

    // MARK: - Édition

    private func makeSummary(id: String, postId: String?, updatedAt: TimeInterval,
                             pending: Date? = nil) -> StoryDraftSummary {
        StoryDraftSummary(id: id, updatedAt: Date(timeIntervalSince1970: updatedAt), slideCount: 1,
                          title: nil, coverFileURL: nil, backgroundHex: nil, thumbHash: nil,
                          pendingPublishAt: pending, editingPostId: postId)
    }

    func test_draftId_editingAPostWithTwoDrafts_picksTheMostRecent() {
        let drafts = [makeSummary(id: "ancien", postId: "p1", updatedAt: 10),
                      makeSummary(id: "recent", postId: "p1", updatedAt: 20),
                      makeSummary(id: "autre", postId: "p2", updatedAt: 30)]

        XCTAssertEqual(ComposerEditDraftResumption.draftId(editingPostId: "p1", drafts: drafts), "recent")
    }

    func test_draftId_draftFrozenForPublication_isNotResumed() {
        let drafts = [makeSummary(id: "gele", postId: "p1", updatedAt: 10, pending: Date())]

        XCTAssertNil(ComposerEditDraftResumption.draftId(editingPostId: "p1", drafts: drafts))
    }

    func test_draftId_creationDraft_isNeverTakenForAnEdit() {
        let drafts = [makeSummary(id: "creation", postId: nil, updatedAt: 10)]

        XCTAssertNil(ComposerEditDraftResumption.draftId(editingPostId: "p1", drafts: drafts))
    }
}
