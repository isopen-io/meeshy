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

    /// Le cycle complet du bug : un brouillon repris porte une vidéo et un
    /// audio ; les URLs que le composer remet au hand-off doivent rester
    /// lisibles APRÈS `delete(draftId:)` — c'est exactement la fenêtre où la
    /// file app-side (Task asynchrone) fait sa copie write-ahead.
    func test_sessionCopiesOfRestoredMedia_surviveTheDraftDeletionAtPublish() throws {
        let root = makeTempDir()
        let store = makeStore(in: root)
        let videoPayload = Data("fake-mp4-payload".utf8)
        let audioPayload = Data("fake-m4a-payload".utf8)
        let sourceVideo = root.appendingPathComponent("clip.mp4")
        let sourceAudio = root.appendingPathComponent("voice.m4a")
        try videoPayload.write(to: sourceVideo)
        try audioPayload.write(to: sourceAudio)
        store.save(draftId: "repris", slides: [StorySlide(id: "s1")], visibility: "PUBLIC")
        store.saveMedia(draftId: "repris", images: [:],
                        videoURLs: ["v1": sourceVideo], audioURLs: ["a1": sourceAudio])

        // Ce que restoreDraft() fait désormais : loadMedia → copies de session.
        let media = store.loadMedia(draftId: "repris")
        let sessionDir = makeTempDir().appendingPathComponent("session")
        let videos = StoryComposerView.sessionSafeMediaURLs(media.videoURLs, sessionDirectory: sessionDir)
        let audios = StoryComposerView.sessionSafeMediaURLs(media.audioURLs, sessionDirectory: sessionDir)

        // Ce que publishAllSlides() fait après le hand-off accepté.
        store.delete(draftId: "repris")

        let videoURL = try XCTUnwrap(videos["v1"])
        let audioURL = try XCTUnwrap(audios["a1"])
        XCTAssertEqual(
            try Data(contentsOf: videoURL), videoPayload,
            """
            La vidéo remise au hand-off doit survivre à la destruction du \
            brouillon : le write-ahead de la file la copie APRÈS le retour \
            synchrone de publishAllSlides().
            """
        )
        XCTAssertEqual(try Data(contentsOf: audioURL), audioPayload)
        XCTAssertFalse(
            FileManager.default.fileExists(atPath: media.videoURLs["v1"]?.path ?? ""),
            "Pré-condition du scénario : le fichier du magasin, lui, a bien disparu."
        )
    }

    /// Une copie qui échoue (source déjà disparue) retombe sur l'URL d'origine :
    /// dégrader vers le comportement d'avant vaut mieux que perdre la clé.
    func test_sessionSafeMediaURLs_whenTheCopyFails_fallsBackToTheOriginalURL() {
        let root = makeTempDir()
        let missing = root.appendingPathComponent("missing.mp4")

        let result = StoryComposerView.sessionSafeMediaURLs(
            ["v1": missing],
            sessionDirectory: root.appendingPathComponent("session")
        )

        XCTAssertEqual(result["v1"], missing)
    }

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

    /// B1 — `restoreDraft()` ne doit plus verser les URLs du magasin telles
    /// quelles : chaque dictionnaire d'URLs (vidéos, audios) passe par la copie
    /// de session avant de rejoindre le ViewModel.
    func test_restoreDraft_handsSessionCopies_notTheDraftStoreURLs() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView+SyncRestore.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "func restoreDraft()", in: code))

        for direct in ["merge(media.videoURLs", "merge(media.audioURLs"] {
            XCTAssertEqual(
                ComposerSourceGuard.occurrences(of: direct, in: body), 0,
                """
                « \(direct) » verse au ViewModel des URLs qui pointent DANS \
                `meeshy_draft_media/<draftId>/` : `clearCurrentDraft()` les \
                supprime au hand-off de publication AVANT que la file (Task \
                asynchrone app-side) n'ait copié les fichiers — story amputée \
                ET brouillon détruit.
                """
            )
        }
        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "sessionSafeMediaURLs(", in: body), 2,
            """
            Les deux dictionnaires d'URLs restaurés (vidéos, audios) doivent \
            passer par la copie de session : ce sont les seules références \
            par-fichier que le hand-off remet à la file.
            """
        )
    }

    /// I4 — les bitmaps restaurés rejoignent le ViewModel par un chemin qui
    /// bump `loadedImagesVersion`, sinon le canvas ne les peint jamais.
    func test_restoreDraft_mergesBitmapsThroughTheVersionBumpingRoute() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView+SyncRestore.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "func restoreDraft()", in: code))

        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "loadedImages.merge(", in: body), 0,
            """
            Merger `loadedImages` sans bumper `loadedImagesVersion` laisse le \
            `ComposerImageCacheReader` périmé : les images du brouillon repris \
            ne s'affichent jamais (invariant documenté sur `registerLoadedImage`).
            """
        )
        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "mergeRestoredMedia(", in: body), 1,
            "Les médias restaurés rejoignent le ViewModel en UNE passe, version bumpée."
        )
    }
}
