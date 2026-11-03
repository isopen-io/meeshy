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

    private func progress(_ percent: Double) -> UploadQueueProgress {
        UploadQueueProgress(
            files: [], totalFiles: 1, completedFiles: 0,
            totalBytes: 100, uploadedBytes: Int64(percent), globalPercentage: percent
        )
    }

    private func file(_ name: String) -> URL {
        URL(fileURLWithPath: "/tmp/\(name)")
    }

    func test_aucunLot_rienNeSeTeleverse() {
        let ledger = ComposerUploadLedger()
        XCTAssertFalse(ledger.isUploading)
        XCTAssertNil(ledger.displayedProgress)
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

    func test_laProgressionAffichee_estCelleDuPlusAncienLotEnVol() {
        var ledger = ComposerUploadLedger()
        let video = UUID(), photo = UUID()
        ledger.begin(video, mediaIds: ["video"])
        ledger.begin(photo, mediaIds: ["photo"])
        ledger.report(progress(80), for: photo)
        XCTAssertEqual(ledger.displayedProgress?.globalPercentage, 80)
        ledger.report(progress(30), for: video)
        XCTAssertEqual(ledger.displayedProgress?.globalPercentage, 30)
        _ = ledger.finish(video)
        XCTAssertEqual(ledger.displayedProgress?.globalPercentage, 80)
    }

    func test_uneProgressionDUnLotTermine_estIgnoree() {
        var ledger = ComposerUploadLedger()
        let video = UUID()
        ledger.begin(video, mediaIds: ["video"])
        _ = ledger.finish(video)
        ledger.report(progress(50), for: video)
        XCTAssertNil(ledger.displayedProgress)
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
}
