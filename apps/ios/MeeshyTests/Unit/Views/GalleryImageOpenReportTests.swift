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

/// #7362 — le PARCOURS réel de la galerie du fil : ouvrir sur une image,
/// glisser, fermer. C'est la suite de passages que `ConversationMediaGalleryView`
/// rejoue (`.onAppear`, `handlePageChange`, `.onDisappear` →
/// `trackImageOpen`) ; le témoin la rejoue sur la MÊME valeur.
@MainActor
final class GalleryImageViewSessionTests: XCTestCase {

    private let t0 = Date(timeIntervalSince1970: 1_000)

    private func image(_ id: String) -> MessageAttachment {
        MessageAttachment(id: id, mimeType: "image/jpeg", uploadedBy: "u-1")
    }

    private func video(_ id: String) -> MessageAttachment {
        MessageAttachment(id: id, mimeType: "video/mp4", uploadedBy: "u-1")
    }

    func test_openSwipeClose_reportsEachReceivedImageItLeaves() {
        var session = GalleryImageViewSession()
        let a = image("a"), b = image("b")

        XCTAssertNil(session.move(leaving: nil, leavingIsMine: nil, entering: a, reportsConsumption: true, now: t0))
        let first = session.move(leaving: a, leavingIsMine: false, entering: b, reportsConsumption: true, now: t0.addingTimeInterval(2))
        let last = session.move(leaving: b, leavingIsMine: false, entering: nil, reportsConsumption: true, now: t0.addingTimeInterval(3))

        XCTAssertEqual(first, GalleryImageOpenReport.Report(attachmentId: "a", durationMs: 2000))
        XCTAssertEqual(last, GalleryImageOpenReport.Report(attachmentId: "b", durationMs: 1000))
        XCTAssertEqual(last?.body.action, "viewed")
        XCTAssertEqual(last?.body.durationMs, 1000)
    }

    func test_closingOnTheOpeningImage_reportsIt() {
        var session = GalleryImageViewSession()
        let a = image("a")
        _ = session.move(leaving: nil, leavingIsMine: nil, entering: a, reportsConsumption: true, now: t0)
        let report = session.move(leaving: a, leavingIsMine: false, entering: nil, reportsConsumption: true, now: t0.addingTimeInterval(1))
        XCTAssertEqual(report?.attachmentId, "a")
    }

    func test_ownImage_isNeverReported() {
        var session = GalleryImageViewSession()
        let a = image("a")
        _ = session.move(leaving: nil, leavingIsMine: nil, entering: a, reportsConsumption: true, now: t0)
        XCTAssertNil(session.move(leaving: a, leavingIsMine: true, entering: nil, reportsConsumption: true, now: t0.addingTimeInterval(5)))
    }

    func test_imageReachedAfterAVideo_isTimedFromItsOwnArrival() {
        var session = GalleryImageViewSession()
        let v = video("v"), a = image("a")
        _ = session.move(leaving: nil, leavingIsMine: nil, entering: v, reportsConsumption: true, now: t0)
        XCTAssertNil(session.move(leaving: v, leavingIsMine: false, entering: a, reportsConsumption: true, now: t0.addingTimeInterval(10)))
        let report = session.move(leaving: a, leavingIsMine: false, entering: nil, reportsConsumption: true, now: t0.addingTimeInterval(11))
        XCTAssertEqual(report?.durationMs, 1000)
    }

    func test_postOrCommentGallery_reportsNothing() {
        var session = GalleryImageViewSession()
        let a = image("a")
        _ = session.move(leaving: nil, leavingIsMine: nil, entering: a, reportsConsumption: false, now: t0)
        XCTAssertNil(session.move(leaving: a, leavingIsMine: false, entering: nil, reportsConsumption: false, now: t0.addingTimeInterval(5)))
    }
}

/// Garde de CÂBLAGE, en complément du parcours ci-dessus : les trois passages
/// (apparition, changement de page, fermeture) appellent la session.
@MainActor
final class GalleryImageOpenReportWiringTests: XCTestCase {

    private static let gallery = "Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift"

    func test_appearPageChangeAndDismiss_allDriveTheSession() throws {
        let source = try AppSourceGuard.unit(Self.gallery)
        XCTAssertTrue(source.contains("trackImageOpen(leaving: nil, entering: currentPageID)"))
        XCTAssertTrue(source.contains("trackImageOpen(leaving: oldID, entering: newID)"))
        XCTAssertTrue(source.contains(".onDisappear { trackImageOpen(leaving: currentPageID, entering: nil) }"))
    }
}
