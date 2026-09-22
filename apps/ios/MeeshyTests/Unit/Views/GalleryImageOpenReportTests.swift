import XCTest
import MeeshySDK
@testable import Meeshy

/// #7362 — ouvrir une image REÇUE depuis la galerie du fil doit remonter sa
/// consommation ("viewed") pour que l'onglet « Ouvert » de « Vu par »
/// s'alimente. Le chemin qui savait déjà le faire (`ImageViewerView`,
/// packages/MeeshySDK/Sources/MeeshyUI/Media/ImageViewerView.swift:342-356)
/// est MORT en pratique : une image de message réel route par
/// `visualAttachments` → la galerie plein écran, jamais par
/// `BubbleAttachmentView.case .image`. `GalleryImageOpenReport` est la même
/// règle (seuil 500 ms, jamais sa propre pièce), reprise pour le chemin
/// RÉEL — voir `GalleryImageOpenReportWiringTests` pour la preuve de câblage.
@MainActor
final class GalleryImageOpenReportTests: XCTestCase {

    private func makeAttachment(id: String = "att-1", mimeType: String = "image/jpeg") -> MessageAttachment {
        MessageAttachment(id: id, mimeType: mimeType, uploadedBy: "u-1")
    }

    func test_video_neverReports_evenLongEnoughAndNotMine() {
        let att = makeAttachment(mimeType: "video/mp4")
        let start = Date(timeIntervalSince1970: 0)
        let now = start.addingTimeInterval(5)
        XCTAssertNil(GalleryImageOpenReport.report(for: att, isMine: false, viewStart: start, now: now))
    }

    func test_ownImage_neverReports_evenLongEnough() {
        let att = makeAttachment()
        let start = Date(timeIntervalSince1970: 0)
        let now = start.addingTimeInterval(5)
        XCTAssertNil(GalleryImageOpenReport.report(for: att, isMine: true, viewStart: start, now: now))
    }

    func test_belowThreshold_reportsNothing() {
        let att = makeAttachment()
        let start = Date(timeIntervalSince1970: 0)
        let now = start.addingTimeInterval(0.499)
        XCTAssertNil(GalleryImageOpenReport.report(for: att, isMine: false, viewStart: start, now: now))
    }

    func test_atThreshold_reports() {
        let att = makeAttachment(id: "att-42")
        let start = Date(timeIntervalSince1970: 0)
        let now = start.addingTimeInterval(0.5)
        let report = GalleryImageOpenReport.report(for: att, isMine: false, viewStart: start, now: now)
        XCTAssertEqual(report?.attachmentId, "att-42")
        XCTAssertEqual(report?.durationMs, 500)
    }

    func test_noViewStart_reportsNothing() {
        let att = makeAttachment()
        XCTAssertNil(GalleryImageOpenReport.report(for: att, isMine: false, viewStart: nil, now: Date()))
    }

    func test_noAttachment_reportsNothing() {
        XCTAssertNil(GalleryImageOpenReport.report(for: nil, isMine: false, viewStart: Date(timeIntervalSince1970: 0), now: Date()))
    }

    func test_unknownOwnership_reportsNothing() {
        // `isMine` absent (map inconnue) ⇒ prudence : on ne reporte QUE ce
        // qu'on sait être une pièce reçue, jamais par défaut.
        let att = makeAttachment()
        let start = Date(timeIntervalSince1970: 0)
        let now = start.addingTimeInterval(5)
        XCTAssertNil(GalleryImageOpenReport.report(for: att, isMine: nil, viewStart: start, now: now))
    }
}

/// Garde de CÂBLAGE : la règle ci-dessus peut être juste et n'être appelée par
/// personne — c'était exactement le défaut #7362 (`ImageViewerView` la posait
/// déjà sur un chemin mort).
@MainActor
final class GalleryImageOpenReportWiringTests: XCTestCase {

    private static let gallery = "Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift"

    func test_handlePageChange_asksTheRuleAndReports() throws {
        let source = try AppSourceGuard.unit(Self.gallery)
        XCTAssertTrue(source.contains("GalleryImageOpenReport.report("),
                       "handlePageChange doit demander la règle en quittant une page")
        XCTAssertTrue(source.contains("AttachmentStatusReporter.report(attachmentId:"),
                       "le rapport résolu doit partir via l'entonnoir unique")
    }

    func test_galleryDismiss_flushesTheLastActivePage() throws {
        let source = try AppSourceGuard.unit(Self.gallery)
        XCTAssertTrue(source.contains(".onDisappear"),
                       "la fermeture de la galerie doit remonter le visionnage de la DERNIÈRE page — pas seulement les transitions entre pages")
    }
}
