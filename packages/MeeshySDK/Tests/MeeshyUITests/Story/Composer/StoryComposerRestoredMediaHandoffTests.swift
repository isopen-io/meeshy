import XCTest
import UIKit
@testable import MeeshySDK
@testable import MeeshyUI

/// B1 (audit 2026-08-02) — publier un brouillon repris supprimait ses médias
/// avant qu'ils soient lus.
///
/// La chaîne, maillon par maillon : `restoreDraft()` versait dans
/// `loadedVideoURLs`/`loadedAudioURLs` les URLs REMISES PAR LE MAGASIN — des
/// fichiers DANS `meeshy_draft_media/<draftId>/`. Au tap « Publier »,
/// `publishAllSlides()` remet ces URLs au hand-off (synchrone), puis détruit le
/// brouillon (`clearCurrentDraft()` → `delete(draftId:)` → suppression du
/// répertoire). Or le write-ahead de la file app-side (copie des médias vers
/// `meeshy_offline_queue/`) court dans une `Task` qui ne démarre qu'APRÈS ce
/// retour synchrone : les sources étaient déjà supprimées, la persistance
/// échouait (`missingLocalMedia`) et la story ET son brouillon étaient perdus.
///
/// Contrat retenu : le composer ne remet au hand-off QUE des URLs qui survivent
/// à la destruction du brouillon — des copies de SESSION (clone APFS, quasi
/// gratuit) faites au moment de la restauration.
///
/// I4 (même audit) — les bitmaps restaurés étaient invisibles : `restoreDraft()`
/// mergait `loadedImages` sans bumper `loadedImagesVersion`, le cookie que
/// `StoryComposerCanvasView` compare pour reconstruire son
/// `ComposerImageCacheReader` (même invariant que `registerLoadedImage` :
/// « Toute nouvelle écriture dans loadedImages DOIT passer par ici »).
@MainActor
final class StoryComposerRestoredMediaHandoffTests: XCTestCase {

    private func makeTempDir() -> URL {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("RestoredMediaHandoff-\(UUID().uuidString)")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: dir) }
        return dir
    }

    private func makeStore(in root: URL) -> StoryDraftStore {
        StoryDraftStore(
            dbPath: root.appendingPathComponent("drafts.sqlite").path,
            mediaDirectory: root.appendingPathComponent("media")
        )
    }

    // MARK: - B1 : le contrat de survie au hand-off

    // MARK: - I4 : les bitmaps restaurés deviennent visibles

    func test_mergeRestoredMedia_withBitmaps_bumpsLoadedImagesVersion() {
        let viewModel = StoryComposerViewModel()
        let before = viewModel.loadedImagesVersion

        viewModel.mergeRestoredMedia(
            images: ["e1": UIImage()],
            videoURLs: [:],
            audioURLs: [:]
        )

        XCTAssertNotEqual(
            viewModel.loadedImagesVersion, before,
            """
            Sans bump, le `ComposerImageCacheReader` du canvas reste périmé et \
            les photos du brouillon repris ne s'affichent jamais.
            """
        )
        XCTAssertNotNil(viewModel.loadedImages["e1"])
    }

    func test_mergeRestoredMedia_withoutBitmaps_leavesTheVersionUntouched() {
        let viewModel = StoryComposerViewModel()
        let before = viewModel.loadedImagesVersion
        let url = URL(fileURLWithPath: "/tmp/whatever.mp4")

        viewModel.mergeRestoredMedia(images: [:], videoURLs: ["v": url], audioURLs: [:])

        XCTAssertEqual(viewModel.loadedImagesVersion, before,
                       "Pas de bitmap, pas de rebuild : le cookie ne bouge que pour les images.")
        XCTAssertEqual(viewModel.loadedVideoURLs["v"], url)
    }

    // MARK: - Gardes de câblage (restoreDraft)

}
