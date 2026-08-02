import XCTest
import Combine
@testable import Meeshy
import MeeshySDK
import MeeshyUI

/// S3.2 / S3.3 / S3.4 / S3.6 — la file locale de publication : plusieurs
/// stories s'empilent, une seule monte, un échec ne gèle rien, et l'intent
/// write-ahead reste la propriété d'UN seul producteur à la fois.
///
/// Toute suite qui publie DOIT purger ses fixtures : `MeeshyTests` est hébergé
/// dans `Meeshy.app`, un résidu est visible au lancement suivant.
@MainActor
final class StoryUploadQueueTests: XCTestCase {

    private var sut: StoryViewModel!
    private var mockStoryService: MockStoryService!
    private var mockPostService: MockPostService!
    private var mockSocket: MockSocialSocket!
    private var mockAPI: MockAPIClientForApp!
    private var defaultsSuiteName: String!
    private var defaults: UserDefaults!

    override func setUp() async throws {
        try await super.setUp()
        // `publishStoryInBackground` branche sur le LIVE `NetworkMonitor.shared`
        // (non injecté) : le simulateur peut se déclarer hors-ligne et faire
        // basculer ces tests sur la file offline.
        NetworkMonitor.shared.simulateOnline()
        await withCheckedContinuation { continuation in
            DispatchQueue.main.async { continuation.resume() }
        }
        await StoryPublishQueue.shared.clearAll()

        defaultsSuiteName = "StoryUploadQueueTests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: defaultsSuiteName)
        mockStoryService = MockStoryService()
        mockPostService = MockPostService()
        mockSocket = MockSocialSocket()
        mockAPI = MockAPIClientForApp()
        mockAPI.authToken = "token"
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost())
        sut = StoryViewModel(
            storyService: mockStoryService,
            postService: mockPostService,
            socialSocket: mockSocket,
            api: mockAPI,
            visibilityStore: StoryVisibilityPreferenceStore(defaults: defaults)
        )
    }

    override func tearDown() async throws {
        // Libère les `createStory` volontairement suspendus : sans ça leur
        // boucle d'attente survivrait à la suite entière.
        mockPostService.createStoryHangs = false
        await StoryPublishFixtureCleanup.purge(sut, defaults: defaults)
        defaults.removePersistentDomain(forName: defaultsSuiteName)
        defaults = nil
        defaultsSuiteName = nil
        sut = nil
        mockStoryService = nil
        mockPostService = nil
        mockSocket = nil
        mockAPI = nil
        try await super.tearDown()
    }

    // MARK: - Préparation non drainable (ordre strict)

    func test_publishStoryInBackground_entryIsNotDrainableBeforeItsIntentIsPersisted() async {
        publish()

        // Synchrone après le tap : l'entrée existe pour l'UI mais son intent
        // n'est pas encore durable — la drainer publierait des slides brutes,
        // sans revendication et sans `queueId`.
        XCTAssertEqual(sut.activeUploads.first?.phase, .preparing)
        XCTAssertNil(sut.activeUploads.first?.queueId)
        XCTAssertEqual(mockPostService.createStoryCallCount, 0,
                       "Aucun octet ne part tant que le write-ahead n'est pas posé")
    }

    func test_publishStoryInBackground_uploadsSlidesCarryingThumbHash() async {
        let before = mockPostService.createStoryCallCount
        publish()

        await waitUntil("la story est publiée") { [self] in
            mockPostService.createStoryCallCount > before
        }
        XCTAssertNotNil(mockPostService.lastCreateStoryEffects?.thumbHash,
                        "Les slides envoyées au serveur portent leur thumbHash")
    }

    func test_uploadSucceeds_dequeuesItsWriteAheadIntent() async {
        publish()

        await waitUntil("la file d'upload se vide") { [self] in sut.activeUploads.isEmpty }
        let pending = await StoryPublishQueue.shared.pendingItems
        XCTAssertTrue(pending.isEmpty, "L'intent write-ahead part avec le succès")
    }

    // MARK: - Empilement et drain

    func test_uploadSuccess_startsNextQueuedUpload() async {
        let before = mockPostService.createStoryCallCount
        publish()
        publish()

        await waitUntil("les deux stories sont publiées") { [self] in
            mockPostService.createStoryCallCount - before >= 2
        }
        XCTAssertEqual(mockPostService.createStoryCallCount - before, 2)
    }

    func test_uploadFailure_doesNotBlockNextQueuedUpload() async {
        let before = mockPostService.createStoryCallCount
        mockPostService.createStoryResult = .failure(URLError(.notConnectedToInternet))
        publish()
        await waitUntil("la 1re story échoue") { [self] in
            sut.activeUploads.contains { if case .failed = $0.phase { return true }; return false }
        }

        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost())
        publish()

        await waitUntil("la 2e story publie quand même") { [self] in
            mockPostService.createStoryCallCount - before >= 2
        }
        XCTAssertGreaterThanOrEqual(mockPostService.createStoryCallCount - before, 2)
    }

    func test_cancelUpload_withStackedUploads_removesOnlyTargetedEntry() async {
        mockPostService.createStoryResult = .failure(URLError(.notConnectedToInternet))
        publish()
        publish()
        await waitUntil("les deux entrées sont préparées") { [self] in
            sut.activeUploads.count == 2 && sut.activeUploads.allSatisfy { $0.phase != .preparing }
        }
        let target = sut.activeUploads[1].id

        sut.cancelUpload(id: target)

        XCTAssertEqual(sut.activeUploads.count, 1)
        XCTAssertFalse(sut.activeUploads.contains { $0.id == target })
    }

    func test_cancelUpload_ofRunningUpload_startsNextQueuedUpload() async {
        // Le 1er upload reste en vol (le mock ne rend jamais la main) : c'est
        // LUI que `cancelUpload` doit interrompre avant d'enchaîner. Sans la
        // remise à zéro de `currentUploadId`, la file entière resterait gelée.
        mockPostService.createStoryHangs = true
        let before = mockPostService.createStoryCallCount
        publish()
        await waitUntil("le 1er upload est en vol") { [self] in
            mockPostService.createStoryCallCount - before == 1
        }
        publish()
        await waitUntil("la 2e entrée attend son tour") { [self] in
            sut.activeUploads.count == 2 && sut.activeUploads.contains { $0.phase == .queued }
        }
        guard let running = sut.activeUploads.first?.id else { return XCTFail("Entrée introuvable") }

        mockPostService.createStoryHangs = false
        sut.cancelUpload(id: running)

        await waitUntil("la suivante démarre") { [self] in
            mockPostService.createStoryCallCount - before >= 2
        }
        XCTAssertGreaterThanOrEqual(mockPostService.createStoryCallCount - before, 2)
    }

    func test_cancelUpload_ofRunningUpload_doesNotLetTheCancelledTaskReleaseTheNewSlot() async {
        mockPostService.createStoryHangs = true
        let before = mockPostService.createStoryCallCount
        publish()
        await waitUntil("le 1er upload est en vol") { [self] in
            mockPostService.createStoryCallCount - before == 1
        }
        publish()
        await waitUntil("la 2e entrée attend son tour") { [self] in
            sut.activeUploads.count == 2 && sut.activeUploads.contains { $0.phase == .queued }
        }
        guard let running = sut.activeUploads.first?.id else { return XCTFail("Entrée introuvable") }

        sut.cancelUpload(id: running)
        await waitUntil("la 2e story prend le créneau") { [self] in
            mockPostService.createStoryCallCount - before == 2
        }

        // Le créneau appartient maintenant à la 2e story. Le `catch` de la
        // tâche annulée se déroule APRÈS `cancelUpload` : s'il rendait le
        // créneau, cette 3e publication démarrerait EN PARALLÈLE de la 2e —
        // qui deviendrait au passage inannulable (`uploadTask` écrasé).
        publish()
        await settle()

        XCTAssertEqual(mockPostService.createStoryCallCount - before, 2,
                       "Une tâche annulée ne rend pas un créneau qui ne lui appartient plus")
    }

    func test_retryUpload_failedEntry_returnsItToQueuedAndDrains() async {
        let before = mockPostService.createStoryCallCount
        mockPostService.createStoryResult = .failure(URLError(.timedOut))
        publish()
        await waitUntil("la story échoue") { [self] in
            sut.activeUploads.contains { if case .failed = $0.phase { return true }; return false }
        }
        guard let id = sut.activeUploads.first?.id else { return XCTFail("Entrée introuvable") }

        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost())
        sut.retryUpload(id: id)

        await waitUntil("le retry repasse par la file") { [self] in
            mockPostService.createStoryCallCount - before >= 2
        }
        XCTAssertGreaterThanOrEqual(mockPostService.createStoryCallCount - before, 2)
    }

    // MARK: - Reprise par le drain de fond

    func test_publishSucceededFromQueue_removesMatchingActiveUploadRow() async {
        mockPostService.createStoryResult = .failure(URLError(.timedOut))
        publish()
        await waitUntil("l'entrée porte son queueId") { [self] in
            sut.activeUploads.first?.queueId != nil
        }
        guard let queueId = sut.activeUploads.first?.queueId else { return XCTFail("queueId absent") }

        StoryPublishQueue.shared.publishSucceeded.send(
            StoryPublishSuccess(queueId: queueId, tempStoryId: "pending_x", publishedStoryId: "story-1")
        )

        await waitUntil("l'anneau fantôme disparaît") { [self] in sut.activeUploads.isEmpty }
        XCTAssertTrue(sut.activeUploads.isEmpty)
    }

    func test_publishFailedFromQueue_removesMatchingActiveUploadRow() async {
        mockPostService.createStoryResult = .failure(URLError(.timedOut))
        publish()
        await waitUntil("l'entrée porte son queueId") { [self] in
            sut.activeUploads.first?.queueId != nil
        }
        guard let queueId = sut.activeUploads.first?.queueId else { return XCTFail("queueId absent") }

        StoryPublishQueue.shared.publishFailed.send(
            StoryPublishFailure(queueId: queueId, tempStoryId: "pending_x", reason: .maxRetriesReached)
        )

        await waitUntil("la ligne migre vers l'historique") { [self] in sut.activeUploads.isEmpty }
        XCTAssertTrue(sut.activeUploads.isEmpty)
    }

    // MARK: - Revendication (S3.4)

    func test_uploadFailureBeforeAnyCommit_releasesQueueInFlightMarker() async {
        mockPostService.createStoryResult = .failure(URLError(.notConnectedToInternet))
        publish()

        await waitUntil("la story échoue") { [self] in
            sut.activeUploads.contains { if case .failed = $0.phase { return true }; return false }
        }
        guard let queueId = sut.activeUploads.first?.queueId else { return XCTFail("queueId absent") }
        await waitUntil("la revendication est relâchée") {
            await StoryPublishQueue.shared.isInFlight(queueId) == false
        }
        let claimed = await StoryPublishQueue.shared.isInFlight(queueId)
        XCTAssertFalse(claimed, "Sans slide commise, la queue peut reprendre l'item")
    }

    func test_uploadFailureAfterPartialCommit_keepsQueueClaim() async {
        // Slide 0 réussit, slide 1 échoue : des Posts sont commis côté serveur.
        // La queue republierait TOUT le payload (elle ne porte aucun
        // avancement) → doublons chez les amis. Le VM garde donc la main.
        mockPostService.createStoryResultsQueue = [
            .success(Self.makeStoryAPIPost(id: "slide-0")),
            .failure(URLError(.timedOut)),
        ]
        publish(slides: [StorySlide(), StorySlide()])

        await waitUntil("la story échoue après commit partiel") { [self] in
            sut.activeUploads.contains { if case .failed = $0.phase { return true }; return false }
        }
        guard let upload = sut.activeUploads.first, let queueId = upload.queueId else {
            return XCTFail("queueId absent")
        }
        XCTAssertFalse(upload.publishedPostIds.isEmpty, "Précondition : une slide est bien commise")
        let claimed = await StoryPublishQueue.shared.isInFlight(queueId)
        XCTAssertTrue(claimed, "Une story partiellement commise ne repart JAMAIS par la queue")
    }

    func test_retryUpload_whenQueueAlreadyOwnsItem_doesNotStartASecondUpload() async {
        guard let upload = await failedUploadReleasedToTheQueue() else { return }
        // Le drain de fond revendique l'item entre-temps.
        _ = await StoryPublishQueue.shared.markInFlight(upload.queueId!)

        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost())
        let before = mockPostService.createStoryCallCount
        sut.retryUpload(id: upload.id)
        await settle()

        XCTAssertEqual(mockPostService.createStoryCallCount - before, 0,
                       "Republier en parallèle du drain dupliquerait la story")
    }

    func test_retryUpload_whenQueueOwnsItem_leavesTheRowRetryable() async {
        guard let upload = await failedUploadReleasedToTheQueue() else { return }
        _ = await StoryPublishQueue.shared.markInFlight(upload.queueId!)

        sut.retryUpload(id: upload.id)
        await settle()

        // Laisser la ligne en `.queued` la sortirait de TOUTES les affordances :
        // l'overlay n'expose ses gestes que sur `.failed`, la reprise réseau ne
        // balaie que `.failed`, et le drain ne la prendra jamais (la queue tient
        // la revendication). La story serait bloquée jusqu'à la mort du process.
        guard case .failed = sut.activeUploads.first?.phase else {
            return XCTFail("Une revendication refusée doit rendre la ligne ROUGE, donc re-tapable")
        }
    }

    func test_retryUpload_whileReclaimingTheQueueItem_isNotDrainableByAFreedSlot() async {
        guard let failed = await failedUploadReleasedToTheQueue() else { return }
        mockPostService.createStoryHangs = true
        publish()
        await waitUntil("la nouvelle story occupe le créneau") { [self] in
            sut.activeUploads.contains { Self.isInFlight($0.phase) }
        }
        guard let running = sut.activeUploads.first(where: { Self.isInFlight($0.phase) })?.id else {
            return XCTFail("Créneau introuvable")
        }

        // AUCUN `await` entre les deux appels : la re-revendication lancée par
        // `retryUpload` est encore EN VOL quand le créneau se libère. Une ligne
        // rendue `.queued` avant d'avoir repris sa claim serait démarrée NUE
        // ici — en parallèle du drain de fond qui détient peut-être l'item,
        // donc slides publiées EN DOUBLE chez les amis.
        sut.retryUpload(id: failed.id)
        sut.cancelUpload(id: running)

        XCTAssertEqual(sut.activeUploads.first(where: { $0.id == failed.id })?.phase, .preparing,
                       "Une ligne dont la revendication est en vol n'est JAMAIS drainable")
    }

    func test_retryUpload_afterItsClaimIsReacquired_uploadsExactlyOnce() async {
        guard let failed = await failedUploadReleasedToTheQueue() else { return }
        let before = mockPostService.createStoryCallCount
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost())

        sut.retryUpload(id: failed.id)

        await waitUntil("la ligne repart une fois sa claim reprise") { [self] in
            mockPostService.createStoryCallCount - before >= 1
        }
        await settle()
        XCTAssertEqual(mockPostService.createStoryCallCount - before, 1,
                       "Le détour par `.preparing` ne doit pas dédoubler le départ")
    }

    func test_publishStoryInBackground_secondPublish_staysQueuedWhileFirstUploads() async {
        mockPostService.createStoryHangs = true
        let before = mockPostService.createStoryCallCount
        publish()
        await waitUntil("la 1re story monte") { [self] in
            mockPostService.createStoryCallCount - before == 1
        }
        publish()

        await waitUntil("la 2e entrée a fini sa préparation") { [self] in
            sut.activeUploads.count == 2 && sut.activeUploads.allSatisfy { $0.phase != .preparing }
        }
        XCTAssertEqual(sut.activeUploads.filter { Self.isInFlight($0.phase) }.count, 1,
                       "Le TUS d'une story sature déjà la bande passante : une seule monte")
        XCTAssertTrue(sut.activeUploads.contains { $0.phase == .queued },
                      "La 2e attend son tour, elle n'est ni rejetée ni démarrée en parallèle")
    }

    func test_retryUpload_afterPartialCommit_restartsTheUploadLocally() async {
        // Slide 0 commise, slide 1 en échec : la revendication reste au VM
        // (option A). Le retry ne doit donc PAS re-revendiquer sa propre claim
        // — `markInFlight` la refuserait et figerait la ligne à jamais.
        let before = mockPostService.createStoryCallCount
        mockPostService.createStoryResultsQueue = [
            .success(Self.makeStoryAPIPost(id: "slide-0")),
            .failure(URLError(.timedOut)),
        ]
        publish(slides: [StorySlide(), StorySlide()])
        await waitUntil("la story échoue après commit partiel") { [self] in
            sut.activeUploads.contains { if case .failed = $0.phase { return true }; return false }
        }
        guard let id = sut.activeUploads.first?.id else { return XCTFail("Entrée introuvable") }

        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost())
        sut.retryUpload(id: id)

        await waitUntil("le retry local repart") { [self] in
            mockPostService.createStoryCallCount - before >= 3
        }
        XCTAssertGreaterThanOrEqual(mockPostService.createStoryCallCount - before, 3)
    }

    // MARK: - Chemin hors-ligne (C3)

    func test_enqueueStoryForOfflinePublish_persistsThumbHashesIntoQueuedPayload() async {
        let slide = StorySlide()
        await sut.enqueueStoryForOfflinePublish(
            slides: [slide],
            slideImages: [slide.id: Self.solidImage()],
            loadedImages: [:],
            loadedVideoURLs: [:]
        )

        let pending = await StoryPublishQueue.shared.pendingItems
        guard let payload = pending.first?.slidesPayload else { return XCTFail("Aucun item en file") }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let slides = try? decoder.decode([StorySlide].self, from: payload)
        XCTAssertNotNil(slides?.first?.effects.thumbHash,
                        "Le cas hors-ligne reçoit aussi ses thumbHashes, calculés en aval du persist")
    }

    /// Le nettoyage de fixtures est le seul code de ce lot qui n'aurait aucune
    /// preuve sans ce test — et un nettoyage silencieusement cassé rend les
    /// résidus VISIBLES dans l'app au lancement suivant.
    func test_purge_leavesNoPendingStoryInTheTrayCache() async {
        // `insertOptimisticOfflineStories` garde sur `AuthManager.currentUser`.
        // Sur le simulateur CI fraîchement provisionné il n'existe JAMAIS de
        // session keychain — sans seed, la précondition est structurellement
        // infaisable (le vert local vient de la session que la phase 3 du gate
        // laisse derrière elle). Même idiome seed/restore que
        // StoryViewModelTests.
        let previousUser = AuthManager.shared.currentUser
        defer { AuthManager.shared.currentUser = previousUser }
        AuthManager.shared.currentUser = MeeshyUser(id: "me-id", username: "me", displayName: "Moi")

        let slide = StorySlide()
        await sut.enqueueStoryForOfflinePublish(
            slides: [slide],
            slideImages: [slide.id: Self.solidImage()],
            loadedImages: [:],
            loadedVideoURLs: [:]
        )
        sut.publishStoryInBackground(
            slides: [StorySlide()], slideImages: [:], loadedImages: [:], loadedVideoURLs: [:],
            visibility: PostVisibility.public.rawValue
        )
        XCTAssertFalse(sut.storyGroups.isEmpty, "Précondition : le tray porte la story optimiste")

        await StoryPublishFixtureCleanup.purge(sut, defaults: defaults)

        XCTAssertTrue(sut.storyGroups.isEmpty)
        let pending = await StoryPublishQueue.shared.pendingItems
        XCTAssertTrue(pending.isEmpty)
        XCTAssertNil(defaults.string(forKey: StoryVisibilityPreferenceStore.key),
                     "La préférence d'audience écrite par le test ne survit pas")
    }

    // MARK: - Visibilité mémorisée (C6)

    func test_publishStoryInBackground_remembersChosenVisibility() async {
        publish(visibility: PostVisibility.public.rawValue)
        XCTAssertEqual(sut.lastComposerVisibility, PostVisibility.public.rawValue)
    }

    func test_publishStoryInBackground_exceptVisibility_isNotRemembered() async {
        publish(visibility: PostVisibility.except.rawValue)
        XCTAssertEqual(sut.lastComposerVisibility, PostVisibility.friends.rawValue,
                       "EXCEPT/ONLY ne sont jamais mémorisés (garde-fou confidentialité)")
    }

    func test_updateStoryInBackground_doesNotOverwriteRememberedVisibility() async {
        publish(visibility: PostVisibility.public.rawValue)

        _ = sut.updateStoryInBackground(
            edit: StoryViewModel.StoryEditContext(
                postId: "post-1", originalMediaIds: [],
                originalBackgroundMediaId: nil, hydratedBackgroundImage: nil
            ),
            slides: [StorySlide()],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:],
            visibility: PostVisibility.private.rawValue
        )

        XCTAssertEqual(sut.lastComposerVisibility, PostVisibility.public.rawValue,
                       "Éditer une story ne redéfinit pas le défaut des NOUVELLES stories")
    }

    // MARK: - Helpers

    private func publish(
        slides: [StorySlide] = [StorySlide()],
        slideImages: [UIImage] = [],
        visibility: String = PostVisibility.friends.rawValue
    ) {
        var images: [String: UIImage] = [:]
        for (idx, image) in slideImages.enumerated() where idx < slides.count {
            images[slides[idx].id] = image
        }
        sut.publishStoryInBackground(
            slides: slides,
            slideImages: images,
            loadedImages: [:],
            loadedVideoURLs: [:],
            visibility: visibility
        )
    }

    /// Une entrée en échec dont AUCUNE slide n'a été commise : le VM a donc
    /// relâché sa revendication et la queue est libre de la reprendre.
    private func failedUploadReleasedToTheQueue() async -> StoryViewModel.StoryUploadState? {
        mockPostService.createStoryResult = .failure(URLError(.timedOut))
        publish()
        await waitUntil("la story échoue") { [self] in
            sut.activeUploads.contains { if case .failed = $0.phase { return true }; return false }
        }
        guard let upload = sut.activeUploads.first, let queueId = upload.queueId else {
            XCTFail("Entrée introuvable")
            return nil
        }
        await waitUntil("la revendication est relâchée") {
            await StoryPublishQueue.shared.isInFlight(queueId) == false
        }
        return upload
    }

    /// Une entrée qui DÉTIENT le créneau : `.uploading` (TUS des médias) ou
    /// `.publishing` (POST du Post). Une story sans média saute directement à
    /// `.publishing` — chercher `.uploading` seul raterait le cas courant.
    private static func isInFlight(_ phase: StoryViewModel.StoryUploadState.UploadPhase) -> Bool {
        !phase.isWaiting && !phase.isFailed
    }

    /// Attente par CONDITION (jamais un `Task.sleep` fixe) : les chaînes
    /// persist → revendication → enrichissement → drain sont asynchrones.
    private func waitUntil(
        _ description: String,
        timeout: TimeInterval = 8,
        _ condition: () async -> Bool
    ) async {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if await condition() { return }
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTFail("Condition jamais atteinte : \(description)")
    }

    /// Laisse les Tasks en vol s'exécuter avant d'observer un NON-effet.
    private func settle() async {
        try? await Task.sleep(nanoseconds: 400_000_000)
    }

    /// Une image RÉELLE (non vide) : `StoryOfflineMediaWriter` encode en JPEG et
    /// abandonne l'intent si l'encodage échoue — un `UIImage()` 0×0 ferait
    /// silencieusement échouer le write-ahead.
    private static func solidImage() -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 20, height: 20)).image { ctx in
            UIColor.systemIndigo.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 20, height: 20))
        }
    }

    private static func makeStoryAPIPost(id: String = "story-1") -> APIPost {
        JSONStub.decode("""
        {
            "id": "\(id)",
            "type": "STORY",
            "content": "Story content",
            "createdAt": "2026-01-15T12:00:00.000Z",
            "expiresAt": "2026-01-16T09:00:00.000Z",
            "author": {"id": "author-1", "username": "alice"}
        }
        """)
    }
}
