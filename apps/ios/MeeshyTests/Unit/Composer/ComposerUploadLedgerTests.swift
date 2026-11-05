import XCTest
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
    /// bulle porte la sienne. Aucune barre globale ne se monte sur le plateau.
    func test_pendingAttachmentsRow_mountsNoGlobalUploadBar() throws {
        let src = try String(contentsOf: URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/ConversationView+ComposerBanners.swift"))
        XCTAssertFalse(src.contains("UploadProgressBar("))
        XCTAssertFalse(src.contains("composerState.uploadProgress"))
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

    func test_accessibilityValue_spellsThePercent() {
        let spoken = MessageUploadProgress.accessibilityValue(percent: 42, locale: Locale(identifier: "fr_FR"))
        XCTAssertTrue(spoken.hasPrefix("42"))
        XCTAssertTrue(spoken.hasSuffix("%"))
    }
}
