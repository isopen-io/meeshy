import XCTest
import Combine
import GRDB
@testable import Meeshy
@testable import MeeshySDK

/// **On compose et envoie d'autres messages pendant qu'une pièce jointe se
/// téléverse** (demande porteur 2026-11-03, #14696).
///
/// Le compositeur refusait tout envoi tant qu'un lot de pièces jointes était en
/// vol (`guard !composerState.isUploading`), et la fin d'un lot nettoyait l'état
/// PARTAGÉ du compositeur : lever la seule garde aurait effacé les fichiers des
/// pièces ajoutées pendant le téléversement. Ces témoins gardent les deux
/// moitiés : plusieurs lots vivent ensemble, et chacun ne retire que le sien.
@MainActor
final class ComposerUploadLedgerTests: XCTestCase {

    private func file(_ name: String) -> URL {
        URL(fileURLWithPath: "/tmp/\(name)")
    }

    func test_aucunLot_rienNeSeTeleverse() {
        let ledger = ComposerUploadLedger()
        XCTAssertFalse(ledger.isUploading)
    }

    func test_unSecondLot_commencePendantQueLePremierSeTeleverse() {
        var ledger = ComposerUploadLedger()
        let video = UUID(), photo = UUID()
        ledger.begin(video, mediaIds: ["video"])
        ledger.begin(photo, mediaIds: ["photo"])
        XCTAssertEqual(ledger.inFlightCount, 2)
    }

    func test_laFinDuPremierLot_laisseLeSecondEnVol() {
        var ledger = ComposerUploadLedger()
        let video = UUID(), photo = UUID()
        ledger.begin(video, mediaIds: ["video"])
        ledger.begin(photo, mediaIds: ["photo"])
        _ = ledger.finish(video)
        XCTAssertTrue(ledger.isUploading)
        XCTAssertEqual(ledger.inFlightCount, 1)
    }

    /// LE témoin de la perte : le lot vidéo finit pendant que l'utilisateur a
    /// déjà joint une photo au compositeur. Le fichier de la photo reste.
    func test_laFinDUnLot_neRetireQueSesPropresFichiers() {
        var ledger = ComposerUploadLedger()
        let video = UUID()
        ledger.begin(video, mediaIds: ["video"])
        let files = ["video": file("video.mov"), "nouvellePhoto": file("photo.jpg")]
        let released = ledger.finish(video)
        XCTAssertEqual(
            ComposerUploadLedger.remaining(files, releasing: released),
            ["nouvellePhoto": file("photo.jpg")]
        )
    }

    func test_unLotTermine_deuxFois_neRetireRienDePlus() {
        var ledger = ComposerUploadLedger()
        let video = UUID()
        ledger.begin(video, mediaIds: ["video"])
        _ = ledger.finish(video)
        XCTAssertTrue(ledger.finish(video).isEmpty)
        XCTAssertFalse(ledger.isUploading)
    }

    /// Le brouillon durable ne se purge que si le compositeur n'a plus rien à
    /// garder : une pièce jointe ajoutée pendant le téléversement y vit.
    func test_leBrouillon_seGardeTantQueLeCompositeurPorteDesPieces() {
        XCTAssertFalse(ComposerUploadLedger.purgesDraft(pendingAttachmentCount: 1, preparingCount: 0))
        XCTAssertFalse(ComposerUploadLedger.purgesDraft(pendingAttachmentCount: 0, preparingCount: 1))
        XCTAssertTrue(ComposerUploadLedger.purgesDraft(pendingAttachmentCount: 0, preparingCount: 0))
    }

    /// Le compositeur réel : la vidéo finit pendant qu'une photo attend déjà
    /// dans le plateau du message suivant — son fichier reste.
    func test_leCompositeur_neRendQueLesFichiersDuLotTermine() {
        var state = ConversationComposerState()
        let video = UUID()
        state.pendingMediaFiles = ["video": file("video.mov")]
        state.uploads.begin(video, mediaIds: ["video"])
        state.pendingMediaFiles["nouvellePhoto"] = file("photo.jpg")
        XCTAssertTrue(state.isUploading)
        _ = state.settleUpload(video)
        XCTAssertEqual(state.pendingMediaFiles, ["nouvellePhoto": file("photo.jpg")])
        XCTAssertFalse(state.isUploading)
    }

    /// Garde de forme : le tap d'envoi ne se refuse plus parce qu'un lot est en
    /// vol. Les doubles taps restent couverts par le compositeur vidé dans le
    /// même tour (texte et plateau), que `SendEligibility` lit aussitôt.
    func test_leTapDEnvoi_neSeRefusePlusPendantUnTeleversement() throws {
        let src = try String(contentsOf: URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift"))
        XCTAssertFalse(src.contains("guard !composerState.isUploading"))
        XCTAssertFalse(src.contains("pendingMediaFiles.removeAll()\n                    composerState.uploadProgress"))
    }

    /// #14702 — la progression ne vit plus au-dessus du compositeur : chaque
    /// bulle porte la sienne. L'ancienne barre globale n'existe plus nulle part
    /// dans l'app (ni déclarée, ni montée), et le plateau n'en lit plus l'état.
    func test_noGlobalUploadBar_isDeclaredOrMountedAnywhereInTheApp() throws {
        let appRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appendingPathComponent("Meeshy")
        let files = try XCTUnwrap(FileManager.default.enumerator(at: appRoot, includingPropertiesForKeys: nil))
            .compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
        XCTAssertGreaterThan(files.count, 100)
        let offenders = try files.filter { try String(contentsOf: $0).contains("UploadProgressBar") }
        XCTAssertEqual(offenders.map(\.lastPathComponent), [])
        let banners = try String(contentsOf: appRoot.appendingPathComponent("Features/Main/Views/ConversationView+ComposerBanners.swift"))
        XCTAssertFalse(banners.contains("composerState.uploadProgress"))
    }
}

/// **Chaque bulle de pièce jointe en cours d'envoi montre sa propre
/// progression** (#14702). Le registre associe un tempId de bulle optimiste à
/// un petit objet observé par la seule pastille de cette bulle : la liste ne
/// se redessine pas à chaque octet, et une bulle ne lit jamais la fraction
/// d'une autre.
@MainActor
final class MessageUploadProgressStoreTests: XCTestCase {

    func test_report_twoBubbles_eachKeepsItsOwnPercent() {
        let store = MessageUploadProgressStore()
        store.begin(["video", "photo"])
        store.report(0.12, for: "video")
        store.report(0.87, for: "photo")
        XCTAssertEqual(store.progress(for: "video")?.percent, 12)
        XCTAssertEqual(store.progress(for: "photo")?.percent, 87)
    }

    func test_begin_beforeAnyReport_hasNoPercentYet() {
        let store = MessageUploadProgressStore()
        store.begin(["video"])
        XCTAssertNotNil(store.progress(for: "video"))
        XCTAssertNil(store.progress(for: "video")?.percent)
    }

    func test_report_unknownTempId_isIgnored() {
        let store = MessageUploadProgressStore()
        store.report(0.5, for: "inconnu")
        XCTAssertNil(store.progress(for: "inconnu"))
    }

    func test_end_removesOnlyThatBubble() {
        let store = MessageUploadProgressStore()
        store.begin(["video", "photo"])
        store.report(0.4, for: "photo")
        store.end(["video"])
        XCTAssertNil(store.progress(for: "video"))
        XCTAssertEqual(store.progress(for: "photo")?.percent, 40)
    }

    /// La fréquence est bornée : une bulle ne republie qu'à chaque point de
    /// pourcentage gagné, jamais à chaque paquet TUS.
    func test_report_subPercentSteps_publishOncePerPercent() {
        let store = MessageUploadProgressStore()
        store.begin(["video"])
        guard let progress = store.progress(for: "video") else { return XCTFail("bulle non inscrite") }
        var publishes = 0
        let watch = progress.objectWillChange.sink { publishes += 1 }
        [0.101, 0.103, 0.105, 0.109, 0.110, 0.115].forEach { store.report($0, for: "video") }
        watch.cancel()
        XCTAssertEqual(publishes, 2)
        XCTAssertEqual(progress.percent, 11)
    }

    func test_report_outOfRangeFraction_isClamped() {
        let store = MessageUploadProgressStore()
        store.begin(["a", "b"])
        store.report(1.7, for: "a")
        store.report(-0.2, for: "b")
        XCTAssertEqual(store.progress(for: "a")?.percent, 100)
        XCTAssertEqual(store.progress(for: "b")?.percent, 0)
    }

    func test_begin_twice_keepsTheSameObservedObject() {
        let store = MessageUploadProgressStore()
        store.begin(["video"])
        let first = store.progress(for: "video")
        store.report(0.3, for: "video")
        store.begin(["video"])
        XCTAssertTrue(first === store.progress(for: "video"))
        XCTAssertEqual(store.progress(for: "video")?.percent, 30)
    }

    /// Le pied de bulle réserve la largeur du plus large pourcentage : 9 % → 10 % → 100 %
    /// ne déplace plus l'heure ni les coches voisines.
    func test_reservedLabel_isTheWidestPercent() {
        let locale = Locale(identifier: "fr_FR")
        XCTAssertEqual(
            MessageUploadProgress.reservedLabel(locale: locale),
            MessageUploadProgress.accessibilityValue(percent: 100, locale: locale)
        )
    }

    func test_accessibilityValue_spellsThePercent() {
        let spoken = MessageUploadProgress.accessibilityValue(percent: 42, locale: Locale(identifier: "fr_FR"))
        XCTAssertTrue(spoken.hasPrefix("42"))
        XCTAssertTrue(spoken.hasSuffix("%"))
    }
}

/// **La progression d'une bulle appartient à l'application, pas au ViewModel** (#16275) :
/// elle survit à la sortie de la conversation, et la reprise par la file durable publie sous
/// le même identifiant que l'envoi en direct.
@MainActor
final class MessageUploadProgressReplayTests: XCTestCase {

    private func makeCollaborators() throws -> ConversationCollaborators {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        return ConversationCollaborators(
            persistence: MessagePersistenceActor(dbWriter: pool),
            syncEngine: ConversationSyncEngine.shared,
            messageService: MockMessageService(),
            regimeLedger: EndToEndRegimeLedger()
        )
    }

    private func tick(sent: Int64, total: Int64) -> UploadQueueProgress {
        UploadQueueProgress(
            files: [], totalFiles: 1, completedFiles: 0, totalBytes: total, uploadedBytes: sent,
            globalPercentage: total > 0 ? Double(sent) / Double(total) * 100 : 0
        )
    }

    private func drainMainQueue() async {
        await withCheckedContinuation { continuation in
            DispatchQueue.main.async { continuation.resume() }
        }
    }

    func test_collaborators_conversationReopened_readsTheRunningProgress() throws {
        let cmid = ClientMessageId.generate()
        let leftConversation = try makeCollaborators()
        leftConversation.uploadProgress.begin([cmid])
        leftConversation.uploadProgress.report(sent: 40, total: 100, for: cmid)

        let reopened = try makeCollaborators()

        XCTAssertEqual(reopened.uploadProgress.progress(for: cmid)?.percent, 40)
        leftConversation.uploadProgress.end([cmid])
    }

    func test_reportBytes_servesThePercentOfTheBubble() {
        let store = MessageUploadProgressStore()
        store.begin(["video"])
        store.report(sent: 25, total: 200, for: "video")
        XCTAssertEqual(store.progress(for: "video")?.percent, 12)
    }

    func test_reportBytes_unknownTotal_keepsTheClock() {
        let store = MessageUploadProgressStore()
        store.begin(["video"])
        store.report(sent: 0, total: 0, for: "video")
        XCTAssertNil(store.progress(for: "video")?.percent)
    }

    /// La cellule d'une bulle en attente se configure AVANT que la file ne la reprenne, et
    /// rien ne la reconfigure ensuite : l'objet qu'elle a reçu est celui que la reprise nourrit.
    func test_progress_pendingBubbleConfiguredBeforeTheReplay_receivesItsTicks() {
        let store = MessageUploadProgressStore()
        let cmid = ClientMessageId.generate()
        let heldByTheCell = store.progress(for: cmid)
        XCTAssertNil(heldByTheCell?.percent)

        store.begin([cmid])
        store.report(sent: 30, total: 100, for: cmid)

        XCTAssertEqual(heldByTheCell?.percent, 30)
    }

    func test_progress_serverMessageId_hasNoObject() {
        XCTAssertNil(MessageUploadProgressStore().progress(for: "507f1f77bcf86cd799439011"))
    }

    /// Le registre vit autant que l'application : une bulle de texte vue une fois n'y reste pas.
    func test_progress_idleObjectNobodyHolds_isNotRetained() {
        let store = MessageUploadProgressStore()
        weak var idle: MessageUploadProgress?
        autoreleasepool { idle = store.progress(for: ClientMessageId.generate()) }
        XCTAssertNil(idle)
    }

    /// Une reprise qui échoue rend l'horloge à la bulle : elle ne reste pas figée à 97 %.
    func test_end_objectStillHeldByTheCell_goesBackToTheClock() {
        let store = MessageUploadProgressStore()
        let cmid = ClientMessageId.generate()
        let heldByTheCell = store.progress(for: cmid)
        store.begin([cmid])
        store.report(sent: 97, total: 100, for: cmid)

        store.end([cmid])

        XCTAssertNil(heldByTheCell?.percent)
    }

    func test_relayWatch_replayTicks_reachTheBubbleOfThatCmid() async {
        let store = MessageUploadProgressStore()
        let relay = ReplayUploadProgressRelay(store: store)
        let cmid = ClientMessageId.generate()
        let heldByTheCell = store.progress(for: cmid)
        let ticks = PassthroughSubject<UploadQueueProgress, Never>()

        relay.watch(ticks.eraseToAnyPublisher(), for: cmid)
        ticks.send(tick(sent: 512, total: 1024))
        await drainMainQueue()

        XCTAssertEqual(heldByTheCell?.percent, 50)
    }

    func test_relayStop_lateTickChangesNothing() async {
        let store = MessageUploadProgressStore()
        let relay = ReplayUploadProgressRelay(store: store)
        let cmid = ClientMessageId.generate()
        let heldByTheCell = store.progress(for: cmid)
        let ticks = PassthroughSubject<UploadQueueProgress, Never>()
        relay.watch(ticks.eraseToAnyPublisher(), for: cmid)
        ticks.send(tick(sent: 10, total: 100))
        await drainMainQueue()

        relay.stop(cmid)
        ticks.send(tick(sent: 90, total: 100))
        await drainMainQueue()

        XCTAssertNil(heldByTheCell?.percent)
    }

    /// Un groupe en échec rejoint la file pendant que le reste de son lot monte encore : la fin
    /// du lot en direct ne fait pas taire la reprise déjà partie.
    func test_relayWatch_liveBatchSettlesDuringTheReplay_keepsPublishing() async {
        let store = MessageUploadProgressStore()
        let relay = ReplayUploadProgressRelay(store: store)
        let cmid = ClientMessageId.generate()
        let heldByTheCell = store.progress(for: cmid)
        let ticks = PassthroughSubject<UploadQueueProgress, Never>()
        store.begin([cmid])
        relay.watch(ticks.eraseToAnyPublisher(), for: cmid)

        store.end([cmid])
        ticks.send(tick(sent: 60, total: 100))
        await drainMainQueue()

        XCTAssertEqual(heldByTheCell?.percent, 60)
        relay.stop(cmid)
    }

    /// Plusieurs pistes montent l'une après l'autre : sans le lot déclaré, la bulle oscillerait
    /// à 100 % à chaque fin de piste.
    func test_relayUploader_declaresTheWholeBatchAndReachesTheBubble() async throws {
        let store = MessageUploadProgressStore()
        let relay = ReplayUploadProgressRelay(store: store)
        let cmid = ClientMessageId.generate()
        let heldByTheCell = store.progress(for: cmid)
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("\(cmid).bin")
        try Data(repeating: 1, count: 2_048).write(to: file)
        addTeardownBlock { try? FileManager.default.removeItem(at: file) }
        let baseURL = try XCTUnwrap(URL(string: "https://staging.meeshy.me"))

        _ = await relay.uploader(baseURL: baseURL, for: cmid, stored: [file.path])
        await drainMainQueue()

        XCTAssertEqual(heldByTheCell?.percent, 0)
        relay.stop(cmid)
    }

    /// Le téléverseur d'un rejeu ne se construit qu'au relais : une troisième branche de
    /// `dispatchSendMessage` qui en créerait un à la main remonterait sans progression.
    func test_replayBranches_buildTheirUploaderThroughTheRelay() throws {
        let source = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/OutboxDispatcher+Messages.swift")
        let text = try String(contentsOf: source, encoding: .utf8)

        XCTAssertFalse(text.contains("TusUploadManager(baseURL:"))
        XCTAssertEqual(text.components(separatedBy: "ReplayUploadProgressRelay.shared.uploader(").count - 1, 1)
        XCTAssertEqual(text.components(separatedBy: "await replayUploader(").count - 1, 2)
    }

    /// Reprise en échec comme reprise réussie : la bulle ne garde pas un anneau sans envoi derrière.
    func test_dispatchSendMessage_replayEnds_relayStops() async throws {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let dispatcher = OutboxDispatcher(messageService: MockMessageService(), persistence: { persistence })
        let cmid = ClientMessageId.generate()
        let heldByTheCell = MessageUploadProgressStore.shared.progress(for: cmid)
        let ticks = PassthroughSubject<UploadQueueProgress, Never>()
        ReplayUploadProgressRelay.shared.watch(ticks.eraseToAnyPublisher(), for: cmid)
        ticks.send(tick(sent: 70, total: 100))
        await drainMainQueue()
        XCTAssertEqual(heldByTheCell?.percent, 70)

        let unreadable = OutboxRecord(
            kind: .sendMessage, conversationId: "conv", clientMessageId: cmid, payload: Data("pas du json".utf8)
        )
        try? await dispatcher.dispatchSendMessageRecordingFailure(unreadable)
        await drainMainQueue()
        await Task.yield()
        await drainMainQueue()

        XCTAssertNil(heldByTheCell?.percent)
    }
}
