import XCTest
import Combine
@testable import Meeshy
@testable import MeeshySDK
@testable import MeeshyUI

// MARK: - StorySaveProgressMapperTests

/// Le bake occupe 0…90 % de l'anneau, l'écriture Photos les 10 % restants.
/// Sans ce découpage l'anneau atteindrait 100 % avant que la vidéo ne soit
/// dans la photothèque — l'utilisateur croirait l'enregistrement terminé.
///
/// `@MainActor` : `StorySaveProgressMapper` vit dans le target `Meeshy`, dont
/// `SWIFT_DEFAULT_ACTOR_ISOLATION` est `MainActor` (SE-0466) — un type non
/// annoté y est donc main-actor-isolé par défaut. Même patron que
/// `StoryExportPreflightTests` (Task 1) pour la même raison.
@MainActor
final class StorySaveProgressMapperTests: XCTestCase {

    func test_bake_zero_isZero() {
        XCTAssertEqual(StorySaveProgressMapper.bake(0), 0, accuracy: 0.0001)
    }

    func test_bake_full_stopsAtBakeShare() {
        XCTAssertEqual(StorySaveProgressMapper.bake(1), 0.9, accuracy: 0.0001)
    }

    func test_bake_half_isHalfOfBakeShare() {
        XCTAssertEqual(StorySaveProgressMapper.bake(0.5), 0.45, accuracy: 0.0001)
    }

    func test_bake_clampsAboveOne() {
        XCTAssertEqual(StorySaveProgressMapper.bake(1.5), 0.9, accuracy: 0.0001)
    }

    func test_bake_clampsBelowZero() {
        XCTAssertEqual(StorySaveProgressMapper.bake(-0.2), 0, accuracy: 0.0001)
    }
}

// MARK: - Doubles

/// Exporteur pilotable : publie une suite de fractions puis rend (ou non) une URL.
/// Distinct de `MockShareExporter` (StoryExportShareViewModelTests) parce que ce
/// service a besoin de scripter la progression, pas seulement le résultat.
@MainActor
final class ScriptedStoryExporter: StoryVideoExportServiceProviding {

    enum Outcome { case success, failure }

    var outcome: Outcome = .success
    /// Fractions publiées via `onProgress` avant de rendre le résultat.
    var progressScript: [Double] = []

    private(set) var prepareCallCount = 0
    private(set) var cleanupCallCount = 0
    private(set) var lastLanguages: [String] = []
    private(set) var lastCleanupURL: URL?
    private(set) var lastBakedURL: URL?
    /// Identité de marque effectivement reçue par le bake — `nil` si le bake
    /// est parti sans interlude (résolution absente ou passée la borne de
    /// `StoryPhotoSaveService.introTimeout`).
    private(set) var lastIntro: StoryExportIntroContent?

    func prepareExport(
        slide: StorySlide,
        languages: [String],
        watermark: StoryExportWatermark?,
        intro: StoryExportIntroContent?,
        onProgress: ((Double) -> Void)?,
        onPhaseChange: ((StoryExportPhase) -> Void)?
    ) async -> URL? {
        prepareCallCount += 1
        lastLanguages = languages
        lastIntro = intro
        for fraction in progressScript { onProgress?(fraction) }

        switch outcome {
        case .success:
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("scripted-save-\(UUID().uuidString).mp4")
            do { try Data().write(to: url) } catch { XCTFail("temp write failed: \(error)") }
            lastBakedURL = url
            return url
        case .failure:
            return nil
        }
    }

    func cleanupExport(at url: URL) {
        cleanupCallCount += 1
        lastCleanupURL = url
        do { try FileManager.default.removeItem(at: url) } catch { /* déjà absent */ }
    }
}

/// Photothèque simulée. `MockPhotoLibrarySaver` (MediaSaveCoordinatorTests) est
/// `private` à son fichier — d'où ce double dédié.
final class StubPhotoSaver: PhotoLibrarySaving, @unchecked Sendable {

    enum Failure: Error { case denied }

    var shouldFail = false
    private(set) var savedVideoURLs: [URL] = []

    func saveImage(_ data: Data) async throws {}

    func saveVideo(at url: URL) async throws {
        savedVideoURLs.append(url)
        if shouldFail { throw Failure.denied }
    }
}

/// Exporteur manuel : suspend `prepareExport` jusqu'à ce que le test appelle
/// `resolve(attempt:)`, et garde les callbacks `onProgress` de CHAQUE
/// tentative individuellement adressables par index. `ScriptedStoryExporter`
/// ne peut pas rejouer un « annuler puis relancer » : ses fractions sont
/// publiées synchrones et son résultat immédiat, donc les deux tentatives ne
/// peuvent jamais coexister en vol. Ce double le permet.
@MainActor
final class ManualStoryExporter: StoryVideoExportServiceProviding {

    private struct PendingCall {
        let onProgress: ((Double) -> Void)?
        let continuation: CheckedContinuation<URL?, Never>
    }

    private var pendingCalls: [PendingCall] = []
    private(set) var cleanupCallCount = 0

    var pendingCount: Int { pendingCalls.count }

    func prepareExport(
        slide: StorySlide,
        languages: [String],
        watermark: StoryExportWatermark?,
        intro: StoryExportIntroContent?,
        onProgress: ((Double) -> Void)?,
        onPhaseChange: ((StoryExportPhase) -> Void)?
    ) async -> URL? {
        await withCheckedContinuation { continuation in
            pendingCalls.append(PendingCall(onProgress: onProgress, continuation: continuation))
        }
    }

    func cleanupExport(at url: URL) {
        cleanupCallCount += 1
    }

    /// Publie une fraction sur la tentative à l'index `attempt` (0 = la
    /// première à avoir appelé `prepareExport`).
    func publishProgress(attempt: Int, _ fraction: Double) {
        pendingCalls[attempt].onProgress?(fraction)
    }

    /// Termine la tentative à l'index `attempt` avec une URL bakée factice.
    @discardableResult
    func resolve(attempt: Int) -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("manual-save-\(UUID().uuidString).mp4")
        do { try Data().write(to: url) } catch { XCTFail("temp write failed: \(error)") }
        pendingCalls[attempt].continuation.resume(returning: url)
        return url
    }
}

/// Photothèque manuelle : suspend `saveVideo(at:)` jusqu'à ce que le test
/// appelle `resolve(attempt:)`, tentatives adressables par index. Nécessaire
/// pour rejouer une tentative périmée AU-DELÀ de `prepareExport`, en pleine
/// écriture Photos, quand une relance arrive pendant cette attente —
/// `StubPhotoSaver` résout immédiatement, donc ne peut jamais laisser deux
/// écritures coexister en vol.
final class ManualPhotoSaver: PhotoLibrarySaving, @unchecked Sendable {

    private struct PendingCall {
        let url: URL
        let continuation: CheckedContinuation<Void, Error>
    }

    private var pendingCalls: [PendingCall] = []
    private(set) var savedVideoURLs: [URL] = []

    var pendingCount: Int { pendingCalls.count }

    func saveImage(_ data: Data) async throws {}

    func saveVideo(at url: URL) async throws {
        try await withCheckedThrowingContinuation { continuation in
            pendingCalls.append(PendingCall(url: url, continuation: continuation))
        }
    }

    /// Termine la tentative à l'index `attempt` avec succès.
    func resolve(attempt: Int) {
        let call = pendingCalls[attempt]
        savedVideoURLs.append(call.url)
        call.continuation.resume()
    }
}

// MARK: - StoryPhotoSaveServiceTests

@MainActor
final class StoryPhotoSaveServiceTests: XCTestCase {

    private func makeSUT() -> (
        sut: StoryPhotoSaveService,
        exporter: ScriptedStoryExporter,
        photos: StubPhotoSaver,
        toasts: MockFeedbackToast
    ) {
        let exporter = ScriptedStoryExporter()
        let photos = StubPhotoSaver()
        let toasts = MockFeedbackToast()
        let sut = StoryPhotoSaveService(
            exporter: exporter,
            photoSaver: photos,
            toasts: toasts,
            preferredLanguages: { ["fr"] },
            intro: { nil }
        )
        return (sut, exporter, photos, toasts)
    }

    private func makeStory(translations: [StoryTranslation]? = nil) -> StoryItem {
        StoryItem(id: "story-\(UUID().uuidString)",
                  content: "Hello",
                  storyEffects: StoryEffects(textObjects: [StoryTextObject(text: "Hello")]),
                  translations: translations)
    }

    /// Draine la file du MainActor jusqu'à ce que le job disparaisse, avec une
    /// borne dure : sans borne, un test rouge tournerait jusqu'au timeout xctest.
    private func waitUntilIdle(_ sut: StoryPhotoSaveService, storyId: String) async {
        for _ in 0..<200 {
            if sut.progress(for: storyId) == nil { return }
            await Task.yield()
        }
        XCTFail("le job n'a jamais été retiré pour \(storyId)")
    }

    /// Draine la file du MainActor jusqu'à ce que `condition` soit vraie —
    /// même borne dure que `waitUntilIdle`, pour synchroniser sur un état
    /// arbitraire observé sur un double plutôt que sur `jobs`.
    private func waitUntil(_ condition: () -> Bool) async {
        for _ in 0..<200 {
            if condition() { return }
            await Task.yield()
        }
        XCTFail("condition jamais vraie après 200 itérations")
    }

    // MARK: Succès

    func test_save_success_writesToPhotosThenClearsJob() async {
        let (sut, exporter, photos, toasts) = makeSUT()
        let story = makeStory()

        sut.save(story: story)
        await waitUntilIdle(sut, storyId: story.id)

        XCTAssertEqual(exporter.prepareCallCount, 1)
        XCTAssertEqual(photos.savedVideoURLs.count, 1)
        XCTAssertNil(sut.progress(for: story.id))
        XCTAssertEqual(toasts.successMessages.count, 1)
        XCTAssertTrue(toasts.errorMessages.isEmpty)
        XCTAssertEqual(exporter.cleanupCallCount, 1, "le MP4 temporaire doit être nettoyé après l'écriture Photos")
    }

    /// La langue gravée est résolue automatiquement (le chemin « Enregistrer »
    /// n'a plus de sheet) : la préférence n'est honorée que si la story la porte.
    func test_save_bakesPreferredLanguageWhenAvailable() async {
        let (sut, exporter, _, _) = makeSUT()
        let story = makeStory(translations: [StoryTranslation(language: "fr", content: "Bonjour")])

        sut.save(story: story)
        await waitUntilIdle(sut, storyId: story.id)

        XCTAssertEqual(exporter.lastLanguages, ["fr"])
    }

    func test_save_bakesOriginalWhenPreferredUnavailable() async {
        let (sut, exporter, _, _) = makeSUT()
        let story = makeStory(translations: [StoryTranslation(language: "de", content: "Hallo")])

        sut.save(story: story)
        await waitUntilIdle(sut, storyId: story.id)

        XCTAssertEqual(exporter.lastLanguages, [], "aucune préférence disponible → texte original")
    }

    // MARK: Progression

    /// Le bake ne doit JAMAIS pousser l'anneau au-delà de 90 % : les 10 %
    /// restants appartiennent à l'écriture Photos.
    func test_save_bakeProgressNeverExceedsBakeShare() async {
        let (sut, exporter, photos, _) = makeSUT()
        exporter.progressScript = [0.25, 0.5, 1.0]
        photos.shouldFail = false
        let story = makeStory()

        var observed: [Double] = []
        let cancellable = sut.$jobs.sink { jobs in
            if let value = jobs[story.id] { observed.append(value) }
        }
        defer { cancellable.cancel() }

        sut.save(story: story)
        await waitUntilIdle(sut, storyId: story.id)

        let duringBake = observed.filter { $0 < 1 }
        XCTAssertFalse(duringBake.isEmpty, "au moins une valeur de progression doit être publiée")
        XCTAssertTrue(duringBake.allSatisfy { $0 <= StorySaveProgressMapper.bakeShare + 0.0001 },
                      "progressions observées : \(observed)")
    }

    // MARK: Échecs

    func test_save_bakeFailure_clearsJobAndShowsError() async {
        let (sut, exporter, photos, toasts) = makeSUT()
        exporter.outcome = .failure
        let story = makeStory()

        sut.save(story: story)
        await waitUntilIdle(sut, storyId: story.id)

        XCTAssertTrue(photos.savedVideoURLs.isEmpty)
        XCTAssertNil(sut.progress(for: story.id))
        XCTAssertEqual(toasts.errorMessages.count, 1)
        XCTAssertTrue(toasts.successMessages.isEmpty)
    }

    func test_save_photosFailure_clearsJobCleansFileAndShowsError() async {
        let (sut, exporter, photos, toasts) = makeSUT()
        photos.shouldFail = true
        let story = makeStory()

        sut.save(story: story)
        await waitUntilIdle(sut, storyId: story.id)

        XCTAssertNil(sut.progress(for: story.id))
        XCTAssertEqual(toasts.errorMessages.count, 1)
        XCTAssertTrue(toasts.successMessages.isEmpty)
        XCTAssertEqual(exporter.cleanupCallCount, 1,
                       "un échec Photos ne doit pas laisser le MP4 temporaire derrière lui")
    }

    // MARK: Idempotence et annulation

    func test_save_twiceForSameStory_startsOnlyOneExport() async {
        let (sut, exporter, _, _) = makeSUT()
        let story = makeStory()

        sut.save(story: story)
        sut.save(story: story)
        await waitUntilIdle(sut, storyId: story.id)

        XCTAssertEqual(exporter.prepareCallCount, 1)
    }

    func test_cancel_clearsJobImmediately() async {
        let (sut, _, _, toasts) = makeSUT()
        let story = makeStory()

        sut.save(story: story)
        XCTAssertNotNil(sut.progress(for: story.id), "le job doit exister dès l'appel à save")

        sut.cancel(storyId: story.id)

        XCTAssertNil(sut.progress(for: story.id))
        XCTAssertEqual(toasts.successMessages.count, 1, "l'annulation est confirmée par un toast")
    }

    func test_cancel_unknownStory_isNoOp() {
        let (sut, _, _, toasts) = makeSUT()
        sut.cancel(storyId: "inexistante")
        XCTAssertTrue(toasts.successMessages.isEmpty)
        XCTAssertTrue(toasts.errorMessages.isEmpty)
    }

    // MARK: Résolution d'identité bornée (Finding 1)

    /// Sans borne, une résolution d'identité lente (avatar/fond non caché,
    /// réseau jusqu'à ~60 s) laisserait l'anneau figé à 0 % pendant toute
    /// cette attente — AVANT même que le bake ne démarre. `introTimeout`
    /// borne cette attente : le bake démarre SANS interlude de marque plutôt
    /// que de bloquer.
    ///
    /// Constantes et seuil alignés sur `BackgroundTransitionCoordinatorTests.
    /// test_runBounded_slowOperation_returnsAtBudgetNotOperationDuration`
    /// (bound 0.1s / opération lente 3s / seuil 1.5s) — même famille de test
    /// (course borne-vs-opération-lente) sur le même host bruyant, valeurs
    /// déjà éprouvées plutôt qu'inventées pour ce fichier. Diagnostic qui a
    /// mené à cet alignement (round 3, suite à un échec déterministe 4/4
    /// signalé en revue) : avec les constantes précédentes
    /// (`introTimeout: 50ms`, intro lente `400ms`, seuil `0.3s`), 4 exécutions
    /// isolées de ce test ont mesuré 0.437s / 1.222s / 1.254s / 1.461s — dans
    /// LES 4 cas `exporter.lastIntro` restait `nil` (la course était
    /// correctement coupée par le timeout, prouvé par la seule assertion
    /// déterministe et non chronométrée) ; seul le seuil absolu de 0.3s,
    /// beaucoup trop proche du plancher de bruit d'ordonnancement du host
    /// (jusqu'à ~1,5s même dans le cas correct, dominant largement l'écart de
    /// 350ms entre `introTimeout` et l'intro lente), échouait. Conclusion :
    /// le mécanisme est correct (Hypothèse 1 réfutée) ; la mesure était
    /// fragile parce que la marge entre borne et opération lente (8×) et le
    /// seuil (6× la borne) étaient trop serrés pour ce host — élargie ici à
    /// 30×/15× comme le fait déjà `BackgroundTransitionCoordinatorTests`.
    func test_save_introSlowerThanTimeout_bakesWithoutIntroWithoutBlocking() async {
        let exporter = ScriptedStoryExporter()
        let photos = StubPhotoSaver()
        let toasts = MockFeedbackToast()
        let sut = StoryPhotoSaveService(
            exporter: exporter,
            photoSaver: photos,
            toasts: toasts,
            preferredLanguages: { [] },
            introTimeout: .milliseconds(100),
            intro: {
                try? await Task.sleep(for: .seconds(3))
                return StoryExportIntroContent(displayName: "Late", username: "late", accentColorHex: "FFFFFF")
            }
        )
        let story = makeStory()
        let start = Date()

        sut.save(story: story)
        await waitUntilIdle(sut, storyId: story.id)

        let elapsed = Date().timeIntervalSince(start)
        XCTAssertLessThan(elapsed, 1.5, "doit revenir près de la borne de 0.1s, jamais attendre les 3s de l'intro")
        // Assertion déterministe, immune au bruit d'ordonnancement : avec
        // `introTimeout` (0.1s) très inférieur au sommeil de l'intro (3s), la
        // seule façon d'observer `lastIntro == nil` est que la course ait été
        // coupée par le timeout — l'intro, livrée à elle seule, ne renvoie
        // jamais nil. C'est la preuve primaire ; `elapsed` n'est qu'un signal
        // de soutien, volontairement peu discriminant sous contention.
        XCTAssertNil(exporter.lastIntro, "passé le délai, le bake démarre sans interlude de marque")
        XCTAssertEqual(exporter.prepareCallCount, 1)
    }

    /// L'inverse : une résolution d'identité rapide doit toujours être
    /// utilisée — la borne ne doit jamais faire perdre une résolution qui
    /// arrive à temps.
    func test_save_introFasterThanTimeout_isUsedForBrandedIntro() async {
        let exporter = ScriptedStoryExporter()
        let photos = StubPhotoSaver()
        let toasts = MockFeedbackToast()
        let expected = StoryExportIntroContent(displayName: "Fast", username: "fast", accentColorHex: "112233")
        let sut = StoryPhotoSaveService(
            exporter: exporter,
            photoSaver: photos,
            toasts: toasts,
            preferredLanguages: { [] },
            introTimeout: .seconds(2),
            intro: { expected }
        )
        let story = makeStory()

        sut.save(story: story)
        await waitUntilIdle(sut, storyId: story.id)

        XCTAssertEqual(exporter.lastIntro?.username, "fast")
    }

    // MARK: Nettoyage après annulation (Finding 2)

    /// `test_cancel_clearsJobImmediately` ne peut pas vérifier le nettoyage
    /// du MP4 : il ne draine jamais le `Task` du bake abandonné. Celui-ci
    /// continue de tourner après `cancel()` (`AVAssetWriter` ignore
    /// `Task.isCancelled`) et doit nettoyer son MP4 une fois qu'il ressort du
    /// bake — sur les 4 sorties possibles (succès, échec bake, échec Photos,
    /// annulation), seule celle-ci n'était couverte par aucun test.
    func test_cancel_duringBake_cleansUpMP4OnceTheAbandonedTaskUnwinds() async {
        let (sut, exporter, _, toasts) = makeSUT()
        let story = makeStory()

        sut.save(story: story)
        sut.cancel(storyId: story.id)
        XCTAssertNil(sut.progress(for: story.id), "le job doit disparaître dès l'appel à cancel")

        await waitUntil { exporter.cleanupCallCount > 0 }

        XCTAssertEqual(exporter.cleanupCallCount, 1,
                       "le MP4 baké après l'annulation doit être nettoyé, pas laissé sur disque")
        XCTAssertEqual(exporter.lastCleanupURL, exporter.lastBakedURL)
        XCTAssertEqual(toasts.successMessages.count, 1, "un seul toast : celui de l'annulation")
        XCTAssertTrue(toasts.errorMessages.isEmpty)
    }

    // MARK: Annuler puis relancer (Finding 3)

    /// Reproduit « annuler puis relancer immédiatement » sur la même story :
    /// la tentative annulée (A) continue de baker en tâche de fond pendant
    /// que la tentative relancée (B) progresse. Une fraction périmée de A ne
    /// doit JAMAIS écraser la progression réelle de B, et les deux MP4
    /// (le périmé de A, celui de B) doivent être nettoyés — un seul écrit
    /// dans Photos.
    func test_cancelThenRelaunch_staleProgressFromAbandonedAttemptIsIgnored() async {
        let manual = ManualStoryExporter()
        let photos = StubPhotoSaver()
        let toasts = MockFeedbackToast()
        let sut = StoryPhotoSaveService(
            exporter: manual,
            photoSaver: photos,
            toasts: toasts,
            preferredLanguages: { [] },
            intro: { nil }
        )
        let story = makeStory()

        sut.save(story: story)
        await waitUntil { manual.pendingCount >= 1 }

        sut.cancel(storyId: story.id)
        sut.save(story: story)
        await waitUntil { manual.pendingCount >= 2 }

        manual.publishProgress(attempt: 0, 0.9)
        await Task.yield()
        XCTAssertEqual(sut.progress(for: story.id) ?? -1, 0, accuracy: 0.0001,
                       "la fraction périmée de la tentative annulée ne doit pas s'appliquer")

        manual.publishProgress(attempt: 1, 0.5)
        await Task.yield()
        XCTAssertEqual(sut.progress(for: story.id) ?? -1, StorySaveProgressMapper.bake(0.5), accuracy: 0.0001,
                       "la fraction réelle de la tentative courante doit s'appliquer")

        manual.resolve(attempt: 0)
        manual.resolve(attempt: 1)
        await waitUntilIdle(sut, storyId: story.id)

        XCTAssertEqual(photos.savedVideoURLs.count, 1, "une seule écriture Photos : celle de la tentative courante")
        XCTAssertEqual(manual.cleanupCallCount, 2, "le MP4 périmé ET celui de la tentative courante doivent être nettoyés")
        XCTAssertEqual(toasts.successMessages.count, 2, "un toast d'annulation + un toast de succès")
    }

    /// Fenêtre manquante de la 1ère correction (régression Critical relevée en
    /// revue) : la tentative périmée n'est PAS bloquée dans `prepareExport`
    /// mais PLUS LOIN, en pleine écriture Photos, quand la relance arrive.
    /// `ScriptedStoryExporter` bake instantanément pour que A atteigne
    /// `photoSaver.saveVideo` avant que le test n'annule ; `ManualPhotoSaver`
    /// suspend cette écriture jusqu'à résolution manuelle, ce qui laisse le
    /// temps à B de démarrer ET de terminer AVANT que l'écriture Photos
    /// périmée de A ne ressorte.
    ///
    /// Ce que le fix garantit : quand A ressort, sa `finish()` ne peut plus
    /// supprimer la RÉFÉRENCE DE B (jobs/tasks), et A ne poste ni toast ni
    /// résurrection de `jobs[storyId]`. Ce que le fix NE peut PAS garantir :
    /// empêcher l'écriture Photos physique de A, déjà en vol au moment de
    /// l'annulation — `PHPhotoLibrary`/`AVAssetWriter` ne s'interrompent pas
    /// en cours de route (même constat déjà documenté pour le MP4 temporaire
    /// sur le chemin d'annulation). Si `isCurrent` dépendait encore de
    /// `jobs[storyId] != nil` (round précédent), A aurait en plus écrasé la
    /// progression de B puis fait disparaître sa RÉFÉRENCE — B se serait cru
    /// périmé à tort et aurait jeté son propre MP4 sans jamais écrire dans
    /// Photos, en silence.
    func test_cancelThenRelaunch_staleAttemptBeyondPrepareExport_duringPhotosWrite_isIgnored() async {
        let exporterA = ScriptedStoryExporter()
        let manualPhotos = ManualPhotoSaver()
        let toasts = MockFeedbackToast()
        let sut = StoryPhotoSaveService(
            exporter: exporterA,
            photoSaver: manualPhotos,
            toasts: toasts,
            preferredLanguages: { [] },
            intro: { nil }
        )
        let story = makeStory()

        // Tentative A : bake instantané (ScriptedStoryExporter), suspendue
        // dans l'écriture Photos.
        sut.save(story: story)
        await waitUntil { manualPhotos.pendingCount >= 1 }
        XCTAssertEqual(sut.progress(for: story.id) ?? -1, StorySaveProgressMapper.bakeShare, accuracy: 0.0001,
                       "A doit être au palier de 90% en attendant Photos")

        // Annulation puis relance IMMÉDIATE pendant que A attend encore.
        sut.cancel(storyId: story.id)
        sut.save(story: story)
        await waitUntil { manualPhotos.pendingCount >= 2 }

        // B, elle aussi instantanée jusqu'à Photos, atteint le même palier —
        // rien de A ne doit avoir laissé de trace dans `jobs[storyId]`.
        XCTAssertEqual(sut.progress(for: story.id) ?? -1, StorySaveProgressMapper.bakeShare, accuracy: 0.0001,
                       "B doit être à son propre palier de 90%, non perturbé par A")

        // B se termine EN PREMIER (écriture Photos réelle, plus rapide que
        // l'attente de A dans ce scénario).
        manualPhotos.resolve(attempt: 1)
        await waitUntilIdle(sut, storyId: story.id)

        XCTAssertEqual(manualPhotos.savedVideoURLs.count, 1, "seule B doit avoir écrit dans Photos à ce stade")
        XCTAssertEqual(toasts.successMessages.count, 2, "toast d'annulation + toast de succès de B")
        XCTAssertTrue(toasts.errorMessages.isEmpty)

        // A ressort ENSUITE, après que B a déjà terminé et libéré jobs/tasks
        // pour cette story — c'est exactement la fenêtre que la régression
        // laissait passer. `resolve(attempt: 0)` simule l'écriture Photos
        // RÉELLE de A qui aboutit (comme le MP4 d'un bake annulé peut arriver
        // après coup — `AVAssetWriter`/`PHPhotoLibrary` ne s'interrompent pas
        // en cours de route, commentaire déjà présent sur le chemin
        // d'annulation) : `manualPhotos.savedVideoURLs` passe donc bien à 2,
        // ce n'est PAS ce qui est gardé. Ce qui DOIT rester intact, c'est
        // l'état APPLICATIF que `save()` expose : aucun toast, aucune
        // résurrection de `jobs[storyId]` pour une tentative qui n'est plus
        // la tentative courante.
        manualPhotos.resolve(attempt: 0)
        await waitUntil { exporterA.cleanupCallCount >= 2 }

        XCTAssertEqual(manualPhotos.savedVideoURLs.count, 2,
                       "l'écriture Photos physique de A a bien lieu (irréversible, comme un MP4 baké après annulation) — ce n'est pas ce que le fix garde")
        XCTAssertEqual(toasts.successMessages.count, 2, "A ne doit poster AUCUN toast supplémentaire malgré son écriture Photos réelle")
        XCTAssertTrue(toasts.errorMessages.isEmpty)
        XCTAssertNil(sut.progress(for: story.id),
                     "A ne doit pas ressusciter jobs[storyId] après que B a déjà fini et nettoyé")
    }
}
