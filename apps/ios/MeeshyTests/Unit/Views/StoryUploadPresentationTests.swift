import XCTest
@testable import Meeshy
import MeeshySDK
import UIKit

/// C5 — plusieurs publications peuvent être empilées : les surfaces d'avatar
/// n'en montrent qu'une, et la règle de choix est explicite.
@MainActor
final class StoryUploadPresentationTests: XCTestCase {

    func test_surfaced_emptyList_returnsNil() {
        XCTAssertNil(StoryUploadPresentation.surfaced(in: []))
    }

    func test_surfaced_singleUploading_returnsItWithZeroStacked() {
        let upload = makeUpload(id: "a", phase: .uploading)
        let surfaced = StoryUploadPresentation.surfaced(in: [upload])

        XCTAssertEqual(surfaced?.upload.id, "a")
        XCTAssertEqual(surfaced?.stackedCount, 0)
    }

    func test_surfaced_failedBehindUploading_prefersFailed() {
        let uploads = [
            makeUpload(id: "a", phase: .uploading),
            makeUpload(id: "b", phase: .failed("boom")),
        ]
        let surfaced = StoryUploadPresentation.surfaced(in: uploads)

        XCTAssertEqual(surfaced?.upload.id, "b", "L'échec porte la seule action utile : réessayer")
    }

    func test_surfaced_stackedCountExcludesSurfacedEntry() {
        let uploads = [
            makeUpload(id: "a", phase: .uploading),
            makeUpload(id: "b", phase: .queued),
            makeUpload(id: "c", phase: .preparing),
        ]
        let surfaced = StoryUploadPresentation.surfaced(in: uploads)

        XCTAssertEqual(surfaced?.upload.id, "a")
        XCTAssertEqual(surfaced?.stackedCount, 2, "La pastille +N ne se compte pas elle-même")
    }

    // MARK: - Règle d'attente (partagée par les deux surfaces d'upload)

    func test_isWaiting_phasesWithoutBytesInFlight_areWaiting() {
        XCTAssertTrue(StoryViewModel.StoryUploadState.UploadPhase.preparing.isWaiting)
        XCTAssertTrue(StoryViewModel.StoryUploadState.UploadPhase.queued.isWaiting)
    }

    func test_isWaiting_phasesWithBytesInFlight_areNotWaiting() {
        XCTAssertFalse(StoryViewModel.StoryUploadState.UploadPhase.uploading.isWaiting)
        XCTAssertFalse(StoryViewModel.StoryUploadState.UploadPhase.publishing.isWaiting)
        XCTAssertFalse(StoryViewModel.StoryUploadState.UploadPhase.failed("boom").isWaiting)
    }

    // MARK: - Libellé VoiceOver de l'anneau

    func test_a11yLabel_uploading_announcesItsPercentage() {
        let label = StoryUploadPresentation.a11yLabel(for: .uploading, progress: 0.42, stackedCount: 0)

        XCTAssertTrue(label.contains("42"), "Un transfert en vol annonce son avancement")
    }

    func test_a11yLabel_failed_announcesNoPercentage() {
        let label = StoryUploadPresentation.a11yLabel(for: .failed("boom"), progress: 0.42, stackedCount: 0)

        XCTAssertFalse(label.contains("42"),
                       "Un pourcentage sur un échec décrirait un transfert qui n'existe plus")
    }

    func test_a11yLabel_waiting_announcesNoPercentage() {
        let label = StoryUploadPresentation.a11yLabel(for: .queued, progress: 0, stackedCount: 0)

        XCTAssertFalse(label.contains("0 %") || label.contains("0%"),
                       "« 0 % » sur une entrée qui n'a rien envoyé se lit comme un transfert bloqué")
    }

    func test_a11yLabel_stackedUploads_appendsTheirCount() {
        let alone = StoryUploadPresentation.a11yLabel(for: .uploading, progress: 0.42, stackedCount: 0)
        let stacked = StoryUploadPresentation.a11yLabel(for: .uploading, progress: 0.42, stackedCount: 3)

        XCTAssertTrue(stacked.hasPrefix(alone), "Le suffixe s'ajoute, il ne remplace rien")
        XCTAssertTrue(stacked.contains("3"), "Le nombre d'entrées empilées est annoncé")
    }

    // MARK: - Helpers

    private func makeUpload(id: String, phase: StoryViewModel.StoryUploadState.UploadPhase)
        -> StoryViewModel.StoryUploadState {
        StoryViewModel.StoryUploadState(
            id: id,
            thumbnailImage: UIImage(),
            progress: 0,
            phase: phase,
            authorId: "me",
            authorName: "Me",
            authorAvatar: nil,
            slides: [StorySlide()],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:],
            loadedAudioURLs: [:],
            originalLanguage: nil,
            visibility: "FRIENDS",
            visibilityUserIds: []
        )
    }
}
