import XCTest
import UIKit
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// #12590 — **le remplacement APPLIQUÉ**, sur de vrais collaborateurs (store, registre de
/// pré-montée, modèle de scène) : un fichier retouché prend la place du média, et rien ne reste
/// de l'ancien. Comme les témoins de la rétraction, chacun observe un EFFET, jamais un texte.
@MainActor
final class ComposerMediaSwapRunTests: XCTestCase {

    private final class MonteurEnVol: ComposerPreUploadProviding, @unchecked Sendable {
        func upload(fileURL: URL, mimeType: String) async throws -> (postMediaId: String, remoteURL: String) {
            try await Task.sleep(nanoseconds: 200_000_000)
            return ("pm", "https://cdn/\(fileURL.lastPathComponent)")
        }
    }

    @MainActor
    private struct Montage {
        let store = ComposerMediaPorterStore()
        let preUploads: ComposerPreUploadRegistry
        let viewModel = StoryComposerViewModel()
        init() {
            preUploads = ComposerPreUploadRegistry(uploader: MonteurEnVol())
            preUploads.adopt = { _, _, _ in true }
        }
    }

    private func jpeg(_ nom: String, width: CGFloat = 40, height: CGFloat = 30) throws -> URL {
        let image = UIGraphicsImageRenderer(size: CGSize(width: width, height: height)).image { context in
            UIColor.systemOrange.setFill()
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(nom)
        try XCTUnwrap(image.jpegData(compressionQuality: 0.9)).write(to: url)
        return url
    }

    /// Une scène avec UN fond image, posé comme le meuble le pose (le document porte sa source).
    private func pose(_ montage: Montage) throws -> (source: URL, objectId: String) {
        let source = try jpeg("swap-run-src-\(UUID().uuidString).jpg")
        let posees = montage.viewModel.applyContentMedia(
            [ComposerContentMedia(sourceURL: source, kind: .image, mimeType: "image/jpeg")])
        let objectId = try XCTUnwrap(posees[source])
        montage.store.porters = ComposerMediaPorters(
            localMedia: [ComposerDocumentMedia(url: source, mimeType: "image/jpeg", durationMs: nil)],
            roleByURL: [source: .background],
            slideIdByMediaURL: [source: montage.viewModel.currentSlide.id],
            objectIdBySource: [source: objectId],
            captions: [source: "légende"],
            altsByObjectId: [objectId: "alt"],
            transcriptions: [:], railPosedURLs: [])
        return (source, objectId)
    }

    private func livraison(_ nouvelId: String) throws -> ComposerReturnedFile {
        let url = try jpeg("\(nouvelId).jpg", width: 60, height: 30)
        let image = try XCTUnwrap(UIImage(contentsOfFile: url.path))
        return ComposerReturnedFile(
            media: ComposerDocumentMediaFactory.media(url: url, declaredMimeType: "image/jpeg"),
            source: .image(image, fileURL: url))
    }

    func test_apply_putsTheRetouchedFileWhereTheMediaWas() throws {
        let montage = Montage()
        let (source, ancien) = try pose(montage)
        let neuf = UUID().uuidString
        let livre = try livraison(neuf)

        let id = ComposerMediaSwapRun.apply(objectId: ancien, delivered: livre, store: montage.store,
                                            preUploads: montage.preUploads, viewModel: montage.viewModel, newObjectId: neuf)

        XCTAssertEqual(id, neuf)
        XCTAssertEqual(montage.viewModel.currentSlide.effects.mediaObjects?.map(\.id), [neuf], "même index, un seul média")
        XCTAssertEqual(montage.store.localMedia.map(\.url), [livre.media.url], "la publication téléverse le fichier retouché")
        XCTAssertNil(montage.store.roleByURL[source])
        XCTAssertEqual(montage.store.roleByURL[livre.media.url], .background)
        XCTAssertEqual(montage.store.slideIdByMediaURL[livre.media.url], montage.viewModel.currentSlide.id)
        XCTAssertEqual(montage.store.objectIdBySource[livre.media.url], neuf)
        XCTAssertEqual(montage.store.captions[livre.media.url], "légende")
        XCTAssertEqual(montage.store.altsByObjectId[neuf], "alt")
        XCTAssertNil(montage.store.altsByObjectId[ancien])
    }

    func test_apply_makesTheSceneTheNewBitmap_andKeepsTheOldOneForUndo() throws {
        let montage = Montage()
        let (_, ancien) = try pose(montage)
        let neuf = UUID().uuidString
        let livre = try livraison(neuf)
        guard case .image(let image, _) = livre.source else { return XCTFail("la livraison est une image") }

        ComposerMediaSwapRun.apply(objectId: ancien, delivered: livre, store: montage.store,
                                   preUploads: montage.preUploads, viewModel: montage.viewModel, newObjectId: neuf)

        XCTAssertTrue(montage.viewModel.loadedImages[neuf] === image)
        XCTAssertNil(montage.viewModel.loadedImages[ancien])
    }

    func test_apply_forgetsTheOldPreUpload() throws {
        let montage = Montage()
        let (source, ancien) = try pose(montage)
        montage.preUploads.begin(url: source, mimeType: "image/jpeg",
                                 fileSize: ComposerPreUploadPolicy.minimumBytes * 4, alreadyRemote: false)
        XCTAssertTrue(montage.preUploads.state(for: source).showsProgress, "fusible : une montée en cours")

        ComposerMediaSwapRun.apply(objectId: ancien, delivered: try livraison("neuf-\(UUID().uuidString)"), store: montage.store,
                                   preUploads: montage.preUploads, viewModel: montage.viewModel)

        XCTAssertFalse(montage.preUploads.state(for: source).showsProgress, "l'ancien fichier ne se monte plus")
        montage.preUploads.stopForPublication()
    }

    func test_apply_toAnUnknownObject_changesNothing() throws {
        let montage = Montage()
        let (source, ancien) = try pose(montage)
        let avant = montage.store.porters

        let id = ComposerMediaSwapRun.apply(objectId: "inconnu", delivered: try livraison(UUID().uuidString), store: montage.store,
                                            preUploads: montage.preUploads, viewModel: montage.viewModel)

        XCTAssertNil(id)
        XCTAssertEqual(montage.store.porters, avant)
        XCTAssertEqual(montage.viewModel.currentSlide.effects.mediaObjects?.map(\.id), [ancien])
        XCTAssertEqual(montage.store.localMedia.map(\.url), [source])
    }
}
