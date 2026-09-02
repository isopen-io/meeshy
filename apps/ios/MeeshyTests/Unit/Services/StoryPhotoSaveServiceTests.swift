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
    /// Index `postMediaId → adresse` des stickers image reçu par le bake (#4852).
    private(set) var lastStickerImageSources: [String: String] = [:]

    func prepareExport(
        slide: StorySlide,
        languages: [String],
        watermark: StoryExportWatermark?,
        intro: StoryExportIntroContent?,
        stickerImageSources: [String: String],
        onProgress: ((Double) -> Void)?,
        onPhaseChange: ((StoryExportPhase) -> Void)?
    ) async -> URL? {
        prepareCallCount += 1
        lastLanguages = languages
        lastIntro = intro
        lastStickerImageSources = stickerImageSources
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
    private(set) var lastCleanupURL: URL?
    private(set) var lastBakedURL: URL?
    /// Index `postMediaId → adresse` des stickers image reçu par le bake (#4852).
    private(set) var lastStickerImageSources: [String: String] = [:]

    var pendingCount: Int { pendingCalls.count }

    func prepareExport(
        slide: StorySlide,
        languages: [String],
        watermark: StoryExportWatermark?,
        intro: StoryExportIntroContent?,
        stickerImageSources: [String: String],
        onProgress: ((Double) -> Void)?,
        onPhaseChange: ((StoryExportPhase) -> Void)?
    ) async -> URL? {
        lastStickerImageSources = stickerImageSources
        return await withCheckedContinuation { continuation in
            pendingCalls.append(PendingCall(onProgress: onProgress, continuation: continuation))
        }
    }

    func cleanupExport(at url: URL) {
        cleanupCallCount += 1
        lastCleanupURL = url
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
        lastBakedURL = url
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

/// Résolution d'identité pilotable : `resolve()` suspend jusqu'à ce que le
/// test appelle `release(_:)`.
///
/// `introTimeout` couvre déjà « la résolution ne revient JAMAIS » ; ce double
/// couvre le cas complémentaire, celui que la revue a exhibé : la résolution
/// FINIT par arriver (installation fraîche, jusqu'à 4 s) et l'utilisateur tape
/// l'anneau à 0 % pendant ce temps. Il donne aussi un point de synchronisation
/// déterministe (`waitUntilSuspended()`) — aucune assertion temporelle,
/// aucune attente à l'aveugle.
@MainActor
final class ManualIntroResolver {

    private var pending: CheckedContinuation<StoryExportIntroContent?, Never>?
    private var suspensionWaiter: CheckedContinuation<Void, Never>?
    private var releasedValue: StoryExportIntroContent?
    private var hasReleased = false
    private(set) var isSuspended = false

    /// À injecter en `intro:` / `introProvider:`.
    func resolve() async -> StoryExportIntroContent? {
        if hasReleased { return releasedValue }
        return await withCheckedContinuation { continuation in
            pending = continuation
            isSuspended = true
            suspensionWaiter?.resume()
            suspensionWaiter = nil
        }
    }

    /// Suspend le TEST jusqu'à ce que la résolution soit réellement en cours.
    func waitUntilSuspended() async {
        if isSuspended { return }
        await withCheckedContinuation { suspensionWaiter = $0 }
    }

    func release(_ content: StoryExportIntroContent? = nil) {
        hasReleased = true
        releasedValue = content
        isSuspended = false
        pending?.resume(returning: content)
        pending = nil
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
    ///
    /// Convient à TOUS les tests dont les doubles résolvent sans timer réel
    /// (`ScriptedStoryExporter`/`StubPhotoSaver` immédiats, ou continuations
    /// manuelles résolues depuis le test) : `Task.yield()` suffit à dérouler
    /// la chaîne d'`await` jusqu'au bout, quel que soit le temps réel écoulé.
    /// NE convient PAS à un test qui fait courir un VRAI `Task.sleep` (le
    /// timeout d'intro) — voir `waitUntilIdleRealTime`.
    private func waitUntilIdle(_ sut: StoryPhotoSaveService, storyId: String) async {
        for _ in 0..<200 {
            if sut.progress(for: storyId) == nil { return }
            await Task.yield()
        }
        XCTFail("le job n'a jamais été retiré pour \(storyId)")
    }

    /// Variante temps réel de `waitUntilIdle`, pour un test dont la
    /// progression dépend d'un VRAI timer (`Task.sleep`).
    ///
    /// `Task.yield()` ne garantit AUCUN temps réel écoulé — il rend juste la
    /// main à l'ordonnanceur. Sous faible contention (rien d'autre à
    /// exécuter), 200 itérations peuvent s'épuiser en quelques microsecondes,
    /// bien avant qu'un timer de 100ms n'ait eu la moindre chance de se
    /// déclencher — diagnostiqué round 3 : `test_save_introSlowerThanTimeout_…`
    /// échouait avec `waitUntilIdle` par « le job n'a jamais été retiré »
    /// quand la suite tournait sans contention externe (0,1s de bruit
    /// insuffisant pour épuiser 200 yields), alors qu'il passait la même
    /// assertion de contenu en isolation sous forte contention (où 200 yields
    /// prenaient naturellement plus d'une seconde). Cette variante dort
    /// RÉELLEMENT entre les vérifications (`Task.sleep`, pas `Task.yield()`)
    /// et borne sur le temps réel écoulé (`ContinuousClock`), pas sur un
    /// nombre d'itérations — fiable quelle que soit la contention du host.
    private func waitUntilIdleRealTime(
        _ sut: StoryPhotoSaveService, storyId: String,
        pollInterval: Duration = .milliseconds(10),
        maxWait: Duration = .seconds(5)
    ) async {
        let clock = ContinuousClock()
        let deadline = clock.now.advanced(by: maxWait)
        while clock.now < deadline {
            if sut.progress(for: storyId) == nil { return }
            try? await Task.sleep(for: pollInterval)
        }
        XCTFail("le job n'a jamais été retiré pour \(storyId) après \(maxWait)")
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

    /// #4852 — un sticker IMAGE ne porte que le `postMediaId` de son média ;
    /// c'est ce service, seul à tenir la slide ET `story.media`, qui apparie
    /// les deux et remet l'index au bake. Sans lui, Photos recevait 🖼️.
    func test_save_pairsStickerImagesWithStoryMedia_andThreadsThemToExporter() async {
        let (sut, exporter, _, _) = makeSUT()
        let effects = StoryEffects(stickerObjects: [StorySticker(emoji: "", postMediaId: "pm-sticker"),
                                                    StorySticker(emoji: "🔥")])
        let story = StoryItem(id: "story-\(UUID().uuidString)",
                              content: "Hello",
                              media: [FeedMedia(id: "pm-sticker", type: .image,
                                                url: "https://cdn.meeshy.test/sticker.png")],
                              storyEffects: effects)

        sut.save(story: story)
        await waitUntilIdle(sut, storyId: story.id)

        XCTAssertEqual(exporter.prepareCallCount, 1)
        XCTAssertEqual(exporter.lastStickerImageSources,
                       ["pm-sticker": "https://cdn.meeshy.test/sticker.png"])
    }

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
        // `waitUntilIdleRealTime`, PAS `waitUntilIdle` : ce test fait courir
        // un VRAI `Task.sleep` (le timeout de 0.1s) — voir la doc du helper.
        await waitUntilIdleRealTime(sut, storyId: story.id)

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

    // MARK: Annulation PENDANT la résolution d'identité (revue finale round 2, item 3)

    /// Draine la file du MainActor un nombre BORNÉ de fois — assez pour
    /// qu'une tentative déjà reprise atteigne (ou non) son exporteur.
    /// Pas d'assertion temporelle : que des `Task.yield()`.
    private func drainMainActorQueue() async {
        for _ in 0..<200 { await Task.yield() }
    }

    private func makeManualIntroSUT() -> (
        sut: StoryPhotoSaveService,
        exporter: ScriptedStoryExporter,
        photos: StubPhotoSaver,
        toasts: MockFeedbackToast,
        resolver: ManualIntroResolver
    ) {
        let exporter = ScriptedStoryExporter()
        let photos = StubPhotoSaver()
        let toasts = MockFeedbackToast()
        let resolver = ManualIntroResolver()
        let sut = StoryPhotoSaveService(
            exporter: exporter,
            photoSaver: photos,
            toasts: toasts,
            preferredLanguages: { [] },
            // Assez large pour que la borne ne gagne JAMAIS la course : ce
            // test-ci porte sur l'annulation, pas sur le timeout.
            introTimeout: .seconds(5),
            intro: { await resolver.resolve() }
        )
        return (sut, exporter, photos, toasts, resolver)
    }

    /// **Contrôle positif du drain** utilisé par le test suivant : sans
    /// annulation, la MÊME séquence (résolution suspendue puis relâchée, même
    /// borne de drain) voit le bake partir ET la vidéo atterrir. Sans lui,
    /// l'assertion négative du test d'après serait décorative — un drain trop
    /// court la rendrait verte quoi qu'il arrive.
    func test_save_identityResolvedLate_thenReleased_runsTheWholeSave() async {
        let (sut, exporter, photos, toasts, resolver) = makeManualIntroSUT()
        let story = makeStory()

        sut.save(story: story)
        await resolver.waitUntilSuspended()
        XCTAssertEqual(exporter.prepareCallCount, 0,
                       "le bake ne doit pas démarrer tant que l'identité se résout")

        resolver.release()
        await drainMainActorQueue()

        XCTAssertEqual(exporter.prepareCallCount, 1)
        XCTAssertEqual(photos.savedVideoURLs.count, 1)
        XCTAssertEqual(toasts.successMessages.count, 1)
    }

    /// « Mes stories » → ⋯ → Enregistrer sur une installation fraîche :
    /// l'identité n'est pas en cache, la résolution court (jusqu'à 4 s),
    /// l'anneau affiche 0 % et l'utilisateur le tape tout de suite.
    ///
    /// `cancel()` avançait bien la génération et rendait la main — mais la
    /// `Task` restait bloquée dans la résolution (qui n'observe pas
    /// l'annulation), puis DÉMARRAIT QUAND MÊME un bake complet de 10 à 60 s :
    /// appareil qui chauffe, et un MP4 que la garde `isCurrent` d'après-bake
    /// jetait à l'arrivée.
    func test_save_cancelledDuringIdentityResolution_neverStartsTheBake() async {
        let (sut, exporter, photos, toasts, resolver) = makeManualIntroSUT()
        let story = makeStory()

        sut.save(story: story)
        await resolver.waitUntilSuspended()

        sut.cancel(storyId: story.id)
        XCTAssertNil(sut.progress(for: story.id), "le job doit disparaître dès l'appel à cancel")

        resolver.release()
        await drainMainActorQueue()

        XCTAssertEqual(exporter.prepareCallCount, 0,
                       """
                       Annulée AVANT le bake, la tentative ne doit jamais en démarrer un : \
                       10 à 60 s de calcul et de chauffe pour un MP4 que `isCurrent` jettera.
                       """)
        XCTAssertTrue(photos.savedVideoURLs.isEmpty, "rien ne doit atterrir dans la photothèque")
        XCTAssertEqual(exporter.cleanupCallCount, 0, "aucun MP4 produit, donc rien à nettoyer")
        XCTAssertEqual(toasts.successMessages.count, 1, "un seul toast : celui de l'annulation")
        XCTAssertTrue(toasts.errorMessages.isEmpty)
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
    ///
    /// Revue finale round 2 (item 3) : ce test annulait AVANT que la `Task`
    /// n'ait seulement démarré, donc avant le bake — et s'appuyait sur le
    /// fait qu'un bake partait quand même. C'est exactement le gâchis que la
    /// garde d'après-résolution supprime désormais (cf.
    /// `test_save_cancelledDuringIdentityResolution_neverStartsTheBake`). Le
    /// scénario visé ici — annuler PENDANT le bake — reste entier : il exige
    /// juste un exporteur suspendu (`ManualStoryExporter`) pour que
    /// l'annulation tombe réellement au milieu du bake, plutôt qu'avant lui.
    func test_cancel_duringBake_cleansUpMP4OnceTheAbandonedTaskUnwinds() async {
        let exporter = ManualStoryExporter()
        let photos = StubPhotoSaver()
        let toasts = MockFeedbackToast()
        let sut = StoryPhotoSaveService(
            exporter: exporter,
            photoSaver: photos,
            toasts: toasts,
            preferredLanguages: { [] },
            intro: { nil }
        )
        let story = makeStory()

        sut.save(story: story)
        // Le bake a RÉELLEMENT démarré : c'est la condition du scénario.
        await waitUntil { exporter.pendingCount == 1 }

        sut.cancel(storyId: story.id)
        XCTAssertNil(sut.progress(for: story.id), "le job doit disparaître dès l'appel à cancel")

        // Le bake abandonné finit par rendre son MP4, bien après l'annulation.
        exporter.resolve(attempt: 0)
        await waitUntil { exporter.cleanupCallCount > 0 }

        XCTAssertEqual(exporter.cleanupCallCount, 1,
                       "le MP4 baké après l'annulation doit être nettoyé, pas laissé sur disque")
        XCTAssertEqual(exporter.lastCleanupURL, exporter.lastBakedURL)
        XCTAssertTrue(photos.savedVideoURLs.isEmpty, "rien ne doit atterrir dans Photos après une annulation")
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

    // MARK: L'écriture Photos n'est pas annulable (revue finale, item 3)

    /// Ce test décrivait auparavant le comportement SUBI : annuler pendant
    /// l'écriture Photos affichait « Export annulé », l'écriture aboutissait
    /// quand même, une relance en écrivait une seconde — et il assertait
    /// `savedVideoURLs.count == 2`, c'est-à-dire le doublon invisible lui-même.
    ///
    /// `PHPhotoLibrary.performChanges` n'est pas annulable : le mot « annulé »
    /// ne peut PAS être rendu vrai à ce stade. Plutôt que d'inventer un
    /// troisième message pour un état sur lequel l'utilisateur n'a aucune
    /// prise, l'annulation devient IMPOSSIBLE dès que cette écriture démarre —
    /// les deux surfaces désactivent alors l'anneau
    /// (`StoryPhotoSaveService.isCancellable(storyId:)`).
    ///
    /// Le contrat « taper l'anneau annule » reste tenu sur tout le bake
    /// (`0…bakeShare`), couvert par
    /// `test_cancel_duringBake_cleansUpMP4OnceTheAbandonedTaskUnwinds` et
    /// `test_cancelThenRelaunch_staleProgressFromAbandonedAttemptIsIgnored`.
    func test_cancel_duringPhotosWrite_isRefused_andWritesExactlyOneVideo() async {
        let exporter = ScriptedStoryExporter()
        let manualPhotos = ManualPhotoSaver()
        let toasts = MockFeedbackToast()
        let sut = StoryPhotoSaveService(
            exporter: exporter,
            photoSaver: manualPhotos,
            toasts: toasts,
            preferredLanguages: { [] },
            intro: { nil }
        )
        let story = makeStory()

        // Bake instantané (`ScriptedStoryExporter`), puis suspension dans
        // l'écriture Photos (`ManualPhotoSaver`) : exactement l'instant où
        // l'utilisateur voit 90 % et s'impatiente.
        sut.save(story: story)
        await waitUntil { manualPhotos.pendingCount >= 1 }
        XCTAssertEqual(sut.progress(for: story.id) ?? -1, StorySaveProgressMapper.bakeShare, accuracy: 0.0001,
                       "le palier de 90 % marque le début de l'écriture Photos")
        XCTAssertFalse(sut.isCancellable(storyId: story.id),
                       "l'écriture Photos a commencé : l'anneau ne doit plus être annulable")

        // Le tap sur l'anneau (et l'action VoiceOver) sont désactivés par
        // `isCancellable`; on appelle quand même `cancel` pour prouver que le
        // service lui-même refuse, et ne se contente pas d'une garde d'UI.
        sut.cancel(storyId: story.id)

        XCTAssertTrue(toasts.successMessages.isEmpty,
                      "aucun « Export annulé » ne doit être affiché sur une écriture qui aboutira")
        XCTAssertEqual(sut.progress(for: story.id) ?? -1, StorySaveProgressMapper.bakeShare, accuracy: 0.0001,
                       "le job reste en vol : rien n'a été annulé")

        // Relance pendant que l'écriture est encore suspendue : ignorée, le
        // job de la story est toujours en vol (garde d'idempotence de `save`).
        sut.save(story: story)
        XCTAssertEqual(manualPhotos.pendingCount, 1,
                       "aucune seconde écriture Photos ne doit être lancée")

        manualPhotos.resolve(attempt: 0)
        await waitUntilIdle(sut, storyId: story.id)

        XCTAssertEqual(manualPhotos.savedVideoURLs.count, 1,
                       "UNE seule vidéo dans la photothèque — plus de doublon invisible")
        XCTAssertEqual(toasts.successMessages.count, 1,
                       "un unique toast, et c'est celui du succès réel")
        XCTAssertTrue(toasts.errorMessages.isEmpty)
        XCTAssertNil(sut.progress(for: story.id))
        XCTAssertFalse(sut.isCancellable(storyId: story.id),
                       "job terminé : plus rien à annuler")
        XCTAssertEqual(exporter.cleanupCallCount, 1, "le MP4 temporaire doit être nettoyé")
    }

    /// Le pendant : pendant le BAKE, l'anneau reste annulable — le contrat
    /// « taper l'anneau annule » n'est pas cassé, il est juste borné à l'étape
    /// réversible.
    func test_isCancellable_isTrueDuringBake_andFalseWithoutJob() async {
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

        XCTAssertFalse(sut.isCancellable(storyId: story.id), "aucun job en vol")

        sut.save(story: story)
        await waitUntil { manual.pendingCount >= 1 }
        XCTAssertTrue(sut.isCancellable(storyId: story.id),
                      "pendant le bake, l'anneau doit rester annulable")

        sut.cancel(storyId: story.id)
        XCTAssertNil(sut.progress(for: story.id), "le job doit disparaître dès l'appel à cancel")
        XCTAssertEqual(toasts.successMessages.count, 1, "l'annulation pendant le bake dit bien la vérité")
        XCTAssertFalse(sut.isCancellable(storyId: story.id), "plus de job : plus rien à annuler")

        // Draine le bake abandonné — `ManualStoryExporter` suspend sur une
        // `CheckedContinuation` : la laisser pendante en fin de test la ferait
        // fuiter. Le Task ressort périmé et nettoie son MP4 sans rien publier.
        manual.resolve(attempt: 0)
        await waitUntil { manual.cleanupCallCount >= 1 }
        XCTAssertEqual(toasts.successMessages.count, 1, "le bake abandonné ne poste aucun toast supplémentaire")
    }
}
