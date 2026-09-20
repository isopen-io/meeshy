import XCTest
@testable import Meeshy
import MeeshySDK

/// **Un PDF est un document, et l'onglet « Consulté » doit le contenir.**
///
/// `loadAttachmentStatuses` ne filtre plus sur `hasTimebasedTrack` : la
/// consommation d'une image ou d'un document est chargée comme celle d'un
/// vocal. Reste à savoir QUI l'affiche — la famille de l'onglet était
/// reconnue par `AttachmentKind == .image || == .document`, une paire qui
/// laisse dehors `.pdf`, `.spreadsheet`, `.presentation`, `.archive`,
/// `.text`, `.code` et `.other` : leur statut était chargé puis jeté, sans
/// onglet pour le montrer.
final class MessageViewsDetailImageDocumentStatusesTests: XCTestCase {

    private func attachment(_ id: String, _ mimeType: String) -> MessageAttachment {
        MessageAttachment(id: id, mimeType: mimeType)
    }

    // MARK: - La famille de l'onglet « Consulté »

    func test_viewedFamily_includesImage() {
        let image = attachment("img", "image/jpeg")
        XCTAssertEqual(
            MessageViewsDetailView.viewedFamilyAttachments(in: [image]).map(\.id),
            ["img"]
        )
    }

    /// Le cas qui manquait : `application/pdf` résout en `AttachmentKind.pdf`,
    /// jamais en `.document`.
    func test_viewedFamily_includesPdf() {
        let pdf = attachment("pdf", "application/pdf")
        XCTAssertEqual(
            MessageViewsDetailView.viewedFamilyAttachments(in: [pdf]).map(\.id),
            ["pdf"],
            "un PDF est LE document courant — l'onglet « Consulté » doit le porter"
        )
    }

    func test_viewedFamily_includesEveryNonTimebasedFamily() {
        let mimes = [
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/zip",
            "text/plain",
            "application/json",
            "application/octet-stream"
        ]
        let attachments = mimes.enumerated().map { attachment("a\($0.offset)", $0.element) }
        XCTAssertEqual(
            MessageViewsDetailView.viewedFamilyAttachments(in: attachments).count,
            mimes.count,
            "tout ce qui n'a pas de piste temporelle se consulte"
        )
    }

    func test_viewedFamily_excludesAudioAndVideo() {
        let media = [attachment("aud", "audio/mp4"), attachment("vid", "video/quicktime")]
        XCTAssertTrue(
            MessageViewsDetailView.viewedFamilyAttachments(in: media).isEmpty,
            "un vocal et une vidéo gardent leurs onglets « Écouté » et « Vu »"
        )
    }

    func test_viewedFamily_keepsOnlyTheNonTimebasedOnesOfAMixedMessage() {
        let mixed = [
            attachment("aud", "audio/mpeg"),
            attachment("img", "image/png"),
            attachment("vid", "video/mp4"),
            attachment("pdf", "application/pdf")
        ]
        XCTAssertEqual(
            MessageViewsDetailView.viewedFamilyAttachments(in: mixed).map(\.id),
            ["img", "pdf"]
        )
    }

    // MARK: - Le libellé d'une carte sans consommateur

    func test_emptyConsumptionLabel_distinguishesTheThreeFamilies() {
        let listened = MessageViewsDetailView.emptyConsumptionLabel(for: .listened)
        let watched = MessageViewsDetailView.emptyConsumptionLabel(for: .watched)
        let viewed = MessageViewsDetailView.emptyConsumptionLabel(for: .viewed)
        let downloaded = MessageViewsDetailView.emptyConsumptionLabel(for: .downloaded)

        XCTAssertNotEqual(listened, watched)
        XCTAssertNotEqual(watched, viewed, "une image n'est pas « visionnée »")
        XCTAssertEqual(viewed, downloaded, "image et document partagent « consulté »")
    }

    /// Le libellé sort du catalogue, jamais d'une chaîne écrite en dur : les
    /// deux anciennes (« Pas encore ecoute », « Pas encore visionne ») étaient
    /// du français sans accent servi aux sept langues.
    func test_emptyConsumptionLabel_isAccented() {
        for action in [AttachmentConsumptionResolver.Action.listened, .watched, .viewed] {
            let label = MessageViewsDetailView.emptyConsumptionLabel(for: action)
            XCTAssertFalse(label.isEmpty)
            XCTAssertFalse(
                label.contains("ecoute") || label.contains("visionne "),
                "libellé non localisé : \(label)"
            )
        }
    }
}
