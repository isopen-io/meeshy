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

    /// #6922 — un brouillon relu ne rend pas en mémoire ce que la pose ne prend
    /// plus : ses photos reviennent à la taille publiée.
    func test_load_restoresBitmapsAtTheWorkingSize() throws {
        let store = makeStore()
        let compte = makeAccount()
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let grande = UIGraphicsImageRenderer(size: CGSize(width: 4000, height: 1000), format: format)
            .image { contexte in
                UIColor.gray.setFill()
                contexte.fill(CGRect(x: 0, y: 0, width: 4000, height: 1000))
            }

        store.save(ComposerAutosaveCodec.write(from: makeState(image: grande)), account: compte, slot: .creation)
        let relu = try XCTUnwrap(store.load(account: compte, slot: .creation))
        let etat = try XCTUnwrap(ComposerAutosaveCodec.state(from: relu))

        let image = try XCTUnwrap(etat.images["obj-1"])
        XCTAssertEqual(image.size.width * image.scale, SceneImageDownsampling.workingMaxPixelSize)
        XCTAssertEqual(image.size.height * image.scale, 512)
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

    // MARK: - La disposition choisie (#9419)

    /// #9419 — « Publish as › Post › Défilement continu » armé, puis l'app
    /// tuée : le brouillon revenait sans disposition, et le menu ne cochait
    /// plus rien.
    func test_save_thenLoad_restoresThePublishChoiceAndItsLayout() throws {
        let store = makeStore()
        let compte = makeAccount()
        var etat = makeState(format: .post)
        etat.publishChoice = ComposerPublishChoice(format: .post, layout: .reel)

        store.save(ComposerAutosaveCodec.write(from: etat), account: compte, slot: .creation)
        let relu = try XCTUnwrap(ComposerAutosaveCodec.state(from: XCTUnwrap(store.load(account: compte, slot: .creation))))

        XCTAssertEqual(relu.publishChoice, ComposerPublishChoice(format: .post, layout: .reel))
    }

    func test_save_thenLoad_withoutPublishChoice_restoresNone() throws {
        let store = makeStore()
        let compte = makeAccount()

        store.save(ComposerAutosaveCodec.write(from: makeState(format: .post)), account: compte, slot: .creation)
        let relu = try XCTUnwrap(ComposerAutosaveCodec.state(from: XCTUnwrap(store.load(account: compte, slot: .creation))))

        XCTAssertNil(relu.publishChoice)
    }

    /// Rétrocompatibilité : un `snapshot.json` écrit avant #9419 n'a aucune clé
    /// de disposition, et se relit toujours — sans choix armé.
    func test_decode_snapshotWrittenBeforeTheLayoutKey_stillDecodesWithoutChoice() throws {
        var etat = makeState(format: .post)
        etat.publishChoice = ComposerPublishChoice(format: .post, layout: .hero)
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let json = try encoder.encode(ComposerAutosaveCodec.write(from: etat).snapshot)
        var objet = try XCTUnwrap(JSONSerialization.jsonObject(with: json) as? [String: Any])
        XCTAssertNotNil(objet["publishChoice"], "La disposition doit faire partie de l'instantané écrit.")
        objet.removeValue(forKey: "publishChoice")
        let ancien = try JSONSerialization.data(withJSONObject: objet)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let snapshot = try decoder.decode(ComposerAutosaveSnapshot.self, from: ancien)
        let relu = try XCTUnwrap(ComposerAutosaveCodec.state(from: ComposerAutosaveRestored(
            snapshot: snapshot, urlByFile: [:], bitmapByFile: [:], blobByFile: [:])))

        XCTAssertNil(relu.publishChoice)
        XCTAssertEqual(relu.text, "Bonjour")
    }

    /// Une disposition inconnue de cette version (écrite par une version
    /// future) ne fait pas tomber le brouillon : le format reste, la
    /// disposition retombe sur le repli.
    func test_state_unknownLayoutCode_keepsTheFormatWithoutLayout() throws {
        var snapshot = ComposerAutosaveCodec.write(from: makeState(format: .post)).snapshot
        snapshot.publishChoice = .init(format: "post", layout: "spiral")

        let relu = try XCTUnwrap(ComposerAutosaveCodec.state(from: ComposerAutosaveRestored(
            snapshot: snapshot, urlByFile: [:], bitmapByFile: [:], blobByFile: [:])))

        XCTAssertEqual(relu.publishChoice, ComposerPublishChoice(format: .post, layout: nil))
    }

    // MARK: - Une copie par image (#9420)

    private func makeStoreAndRoot() -> (ComposerAutosaveStore, URL) {
        let racine = makeTempDirectory()
        let drafts = racine.appendingPathComponent("drafts")
        return (ComposerAutosaveStore(root: drafts, sessionRoot: racine.appendingPathComponent("session")), drafts)
    }

    private func mediaDirectory(root: URL, account: ComposerAutosaveAccount) -> URL {
        root.appendingPathComponent(account.directoryName, isDirectory: true)
            .appendingPathComponent(ComposerAutosaveSlot.creation.directoryName, isDirectory: true)
            .appendingPathComponent("media", isDirectory: true)
    }

    private func mediaFiles(root: URL, account: ComposerAutosaveAccount) -> [String] {
        ((try? FileManager.default.contentsOfDirectory(
            atPath: mediaDirectory(root: root, account: account).path)) ?? []).sorted()
    }

    private func makeJPEGFile(named nom: String, in dossier: URL) -> URL {
        let url = dossier.appendingPathComponent(nom)
        try? makeImage().jpegData(compressionQuality: 0.9)?.write(to: url)
        return url
    }

    /// Trois photos posées depuis la photothèque, PRÉ-MONTÉES : chaque bitmap
    /// est rangé sous l'id de l'objet, son `postMediaId` et son adresse
    /// distante (`relayLoadedImage`) — trois clés, UNE image.
    private func makeThreeImageState(in dossier: URL, crop: MediaCropRect? = nil) -> ComposerAutosaveState {
        var etat = makeState(format: .post)
        let fichiers = (0..<3).map { makeJPEGFile(named: "photo-\($0).jpg", in: dossier) }
        etat.porters = ComposerMediaPorters(
            localMedia: fichiers.map { ComposerDocumentMedia(url: $0, mimeType: "image/jpeg", durationMs: nil) },
            roleByURL: [:], slideIdByMediaURL: [:],
            objectIdBySource: Dictionary(uniqueKeysWithValues: fichiers.enumerated().map { ($1, "obj-\($0)") }),
            captions: [:], altsByObjectId: [:], transcriptions: [:], railPosedURLs: [])
        etat.slides = (0..<3).map { index in
            var slide = StorySlide(id: "s\(index)")
            var objet = StoryMediaObject(id: "obj-\(index)", postMediaId: "pm-\(index)",
                                         mediaURL: "https://cdn.meeshy.me/pm-\(index).jpg",
                                         mediaType: "image", aspectRatio: 1)
            objet.crop = crop
            slide.effects.mediaObjects = [objet]
            return slide
        }
        etat.adoptedLocalMedia = fichiers.enumerated().reduce(into: [:]) { carte, entree in
            carte["pm-\(entree.offset)"] = entree.element
            carte["https://cdn.meeshy.me/pm-\(entree.offset).jpg"] = entree.element
        }
        etat.images = (0..<3).reduce(into: [:]) { carte, index in
            let image = makeImage()
            carte["obj-\(index)"] = image
            carte["pm-\(index)"] = image
            carte["https://cdn.meeshy.me/pm-\(index).jpg"] = image
        }
        return etat
    }

    func test_save_threeImagesRepeatedly_writesExactlyThreeMediaFiles() {
        let (store, racine) = makeStoreAndRoot()
        let compte = makeAccount()
        let etat = makeThreeImageState(in: makeTempDirectory())

        (1...4).forEach { _ in
            store.save(ComposerAutosaveCodec.write(from: etat), account: compte, slot: .creation)
        }
        store.waitForPendingWrites()

        let fichiers = mediaFiles(root: racine, account: compte)
        XCTAssertEqual(fichiers.count, 3, "Une image de scène = UN fichier dans le brouillon : \(fichiers)")
    }

    func test_load_threeImages_everyAliasKeyGetsItsImageBack() throws {
        let (store, _) = makeStoreAndRoot()
        let compte = makeAccount()

        store.save(ComposerAutosaveCodec.write(from: makeThreeImageState(in: makeTempDirectory())),
                   account: compte, slot: .creation)
        let relu = try XCTUnwrap(ComposerAutosaveCodec.state(from: XCTUnwrap(store.load(account: compte, slot: .creation))))

        for index in 0..<3 {
            let image = try XCTUnwrap(relu.images["obj-\(index)"])
            XCTAssertTrue(relu.images["pm-\(index)"] === image)
            XCTAssertTrue(relu.images["https://cdn.meeshy.me/pm-\(index).jpg"] === image)
        }
    }

    /// Un bitmap RECADRÉ n'est pas son fichier source : il garde sa propre
    /// copie — une seule pour ses trois clés.
    func test_save_croppedImages_keepOneBitmapEachBesideTheirSource() {
        let (store, racine) = makeStoreAndRoot()
        let compte = makeAccount()
        let etat = makeThreeImageState(in: makeTempDirectory(),
                                       crop: MediaCropRect(x: 0, y: 0, width: 0.5, height: 0.5))

        store.save(ComposerAutosaveCodec.write(from: etat), account: compte, slot: .creation)
        store.save(ComposerAutosaveCodec.write(from: etat), account: compte, slot: .creation)
        store.waitForPendingWrites()

        XCTAssertEqual(mediaFiles(root: racine, account: compte).count, 6)
    }

    /// Les copies laissées par une version antérieure (une par clé) sont
    /// balayées à la sauvegarde suivante.
    func test_save_orphanCopiesFromAnEarlierSave_areSwept() throws {
        let (store, racine) = makeStoreAndRoot()
        let compte = makeAccount()
        let etat = makeThreeImageState(in: makeTempDirectory())
        store.save(ComposerAutosaveCodec.write(from: etat), account: compte, slot: .creation)
        store.waitForPendingWrites()
        try Data([0x01]).write(to: mediaDirectory(root: racine, account: compte)
            .appendingPathComponent("i-deadbeef.jpg"))

        store.save(ComposerAutosaveCodec.write(from: etat), account: compte, slot: .creation)
        store.waitForPendingWrites()

        let fichiers = mediaFiles(root: racine, account: compte)
        XCTAssertFalse(fichiers.contains("i-deadbeef.jpg"))
        XCTAssertEqual(fichiers.count, 3)
    }

    // MARK: - Une photo, deux adresses (#9420, réouverture)

    /// Le chemin RÉEL de l'import : la pièce jointe du document garde le
    /// fichier du sélecteur (`localMedia`, `objectIdBySource`…), et la pose
    /// (`applyContentMedia`) le COPIE sous `tmp/<objectId>.jpg` pour l'objet de
    /// scène (`mediaURL`, ou `adoptedLocalMedia` une fois pré-monté). Deux
    /// adresses, les mêmes octets.
    private func makeImportedThreeImageState(preUploaded: Bool) -> ComposerAutosaveState {
        let selecteur = makeTempDirectory()
        let pose = makeTempDirectory()
        var etat = makeState(format: .post)
        let sources = (0..<3).map { makeJPEGFile(named: "photo-\($0).jpg", in: selecteur) }
        let copies = sources.enumerated().map { index, source -> URL in
            let copie = pose.appendingPathComponent("obj-\(index).jpg")
            try? FileManager.default.copyItem(at: source, to: copie)
            return copie
        }
        etat.porters = ComposerMediaPorters(
            localMedia: sources.map { ComposerDocumentMedia(url: $0, mimeType: "image/jpeg", durationMs: nil) },
            roleByURL: Dictionary(uniqueKeysWithValues: sources.map { ($0, ComposerMediaRole.background) }),
            slideIdByMediaURL: Dictionary(uniqueKeysWithValues: sources.enumerated().map { ($1, "s\($0)") }),
            objectIdBySource: Dictionary(uniqueKeysWithValues: sources.enumerated().map { ($1, "obj-\($0)") }),
            captions: Dictionary(uniqueKeysWithValues: sources.enumerated().map { ($1, "Légende \($0)") }),
            altsByObjectId: [:], transcriptions: [:], railPosedURLs: [])
        etat.slides = (0..<3).map { index in
            var slide = StorySlide(id: "s\(index)")
            slide.effects.mediaObjects = [preUploaded
                ? StoryMediaObject(id: "obj-\(index)", postMediaId: "pm-\(index)",
                                   mediaURL: "https://cdn.meeshy.me/pm-\(index).jpg",
                                   mediaType: "image", aspectRatio: 1)
                : StoryMediaObject(id: "obj-\(index)", mediaURL: copies[index].absoluteString,
                                   mediaType: "image", aspectRatio: 1)]
            return slide
        }
        etat.adoptedLocalMedia = preUploaded
            ? copies.enumerated().reduce(into: [:]) { carte, entree in
                carte["pm-\(entree.offset)"] = entree.element
                carte["https://cdn.meeshy.me/pm-\(entree.offset).jpg"] = entree.element
            }
            : [:]
        etat.images = (0..<3).reduce(into: [:]) { carte, index in
            let image = makeImage()
            carte["obj-\(index)"] = image
            if preUploaded {
                carte["pm-\(index)"] = image
                carte["https://cdn.meeshy.me/pm-\(index).jpg"] = image
            }
        }
        return etat
    }

    func test_save_importedPhotosPreUploaded_writeOneFileEachDespiteTheirSceneCopy() {
        let (store, racine) = makeStoreAndRoot()
        let compte = makeAccount()
        let etat = makeImportedThreeImageState(preUploaded: true)

        (1...3).forEach { _ in
            store.save(ComposerAutosaveCodec.write(from: etat), account: compte, slot: .creation)
        }
        store.waitForPendingWrites()

        let fichiers = mediaFiles(root: racine, account: compte)
        XCTAssertEqual(fichiers.count, 3, "Une photo = UN fichier, quelle que soit son adresse : \(fichiers)")
    }

    func test_save_importedPhotosStillLocal_writeOneFileEachDespiteTheirSceneCopy() {
        let (store, racine) = makeStoreAndRoot()
        let compte = makeAccount()

        store.save(ComposerAutosaveCodec.write(from: makeImportedThreeImageState(preUploaded: false)),
                   account: compte, slot: .creation)
        store.waitForPendingWrites()

        let fichiers = mediaFiles(root: racine, account: compte)
        XCTAssertEqual(fichiers.count, 3, "Une photo = UN fichier, quelle que soit son adresse : \(fichiers)")
    }

    /// Relu, chaque porteur et chaque objet de scène retrouve un fichier — et
    /// la sauvegarde suivante n'en écrit pas un de plus.
    func test_load_dedupedPhotos_everyPorterAndSceneObjectGetsItsFile() throws {
        let (store, racine) = makeStoreAndRoot()
        let compte = makeAccount()
        store.save(ComposerAutosaveCodec.write(from: makeImportedThreeImageState(preUploaded: false)),
                   account: compte, slot: .creation)

        let relu = try XCTUnwrap(ComposerAutosaveCodec.state(from: XCTUnwrap(store.load(account: compte, slot: .creation))))

        XCTAssertEqual(relu.porters.localMedia.count, 3)
        for media in relu.porters.localMedia {
            XCTAssertTrue(FileManager.default.fileExists(atPath: media.url.path))
            XCTAssertNotNil(relu.porters.objectIdBySource[media.url])
            XCTAssertNotNil(relu.porters.captions[media.url])
        }
        let objets = relu.slides.flatMap { $0.effects.mediaObjects ?? [] }
        XCTAssertEqual(objets.count, 3)
        for objet in objets {
            let url = try XCTUnwrap(objet.mediaURL.flatMap(URL.init(string:)))
            XCTAssertTrue(url.isFileURL)
            XCTAssertTrue(FileManager.default.fileExists(atPath: url.path), "objet \(objet.id) sans fichier")
            XCTAssertNotNil(relu.images[objet.id])
        }

        store.save(ComposerAutosaveCodec.write(from: relu), account: compte, slot: .creation)
        store.waitForPendingWrites()
        XCTAssertEqual(mediaFiles(root: racine, account: compte).count, 3)
    }

    /// Rétrocompatibilité : un brouillon écrit avant ce correctif tient DEUX
    /// fichiers par photo et ne déclare aucun alias. Il se relit, et la
    /// sauvegarde suivante balaie les doublons.
    func test_save_draftWithTwoFilesPerPhoto_isReadAndSweptToOneEach() throws {
        let (store, racine) = makeStoreAndRoot()
        let compte = makeAccount()
        var ancien = makeImportedThreeImageState(preUploaded: false)
        let pont = ancien.porters.objectIdBySource
        ancien.porters.objectIdBySource = [:]
        store.save(ComposerAutosaveCodec.write(from: ancien), account: compte, slot: .creation)
        store.waitForPendingWrites()
        XCTAssertEqual(mediaFiles(root: racine, account: compte).count, 6,
                       "le brouillon d'avant : deux fichiers par photo")

        var relu = try XCTUnwrap(ComposerAutosaveCodec.state(from: XCTUnwrap(store.load(account: compte, slot: .creation))))
        let sourceParLegende = Dictionary(uniqueKeysWithValues: relu.porters.localMedia.compactMap { media in
            relu.porters.captions[media.url].map { ($0, media.url) }
        })
        relu.porters.objectIdBySource = pont.reduce(into: [:]) { carte, entree in
            guard let legende = ancien.porters.captions[entree.key],
                  let url = sourceParLegende[legende] else { return }
            carte[url] = entree.value
        }
        XCTAssertEqual(relu.porters.objectIdBySource.count, 3)

        store.save(ComposerAutosaveCodec.write(from: relu), account: compte, slot: .creation)
        store.waitForPendingWrites()

        XCTAssertEqual(mediaFiles(root: racine, account: compte).count, 3)
        let reluEncore = try XCTUnwrap(ComposerAutosaveCodec.state(from: XCTUnwrap(store.load(account: compte, slot: .creation))))
        for objet in reluEncore.slides.flatMap({ $0.effects.mediaObjects ?? [] }) {
            let url = try XCTUnwrap(objet.mediaURL.flatMap(URL.init(string:)))
            XCTAssertTrue(FileManager.default.fileExists(atPath: url.path))
        }
    }

    /// « Tout effacer » vide le dossier, médias compris.
    func test_deleteAll_afterSavingImages_leavesNoMediaFile() {
        let (store, racine) = makeStoreAndRoot()
        let compte = makeAccount()
        store.save(ComposerAutosaveCodec.write(from: makeThreeImageState(in: makeTempDirectory())),
                   account: compte, slot: .creation)

        store.deleteAll()
        store.waitForPendingWrites()

        XCTAssertFalse(FileManager.default.fileExists(atPath: racine.path))
    }
}
