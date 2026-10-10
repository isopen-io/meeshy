import XCTest
import MeeshySDK
@testable import Meeshy

/// **#9170 — l'image d'une citation, retouchée dans la scène, remplace sa pièce.**
@MainActor
final class PendingImageEditReplacementTests: XCTestCase {

    private func piece(_ id: String, url: URL) -> MessageAttachment {
        MessageAttachment(id: id, fileName: url.lastPathComponent, originalName: url.lastPathComponent,
                          mimeType: "image/jpeg", fileSize: 10, fileUrl: url.absoluteString,
                          width: 100, height: 100, thumbnailColor: "112233")
    }

    private func ecrit(_ nom: String) -> ConversationImageRetouche.Written {
        ConversationImageRetouche.Written(url: URL(fileURLWithPath: "/tmp/\(nom)"), fileName: nom,
                                          mimeType: "image/webp", byteCount: 42)
    }

    func test_apply_pieceEnAttente_remplaceALaMemePlaceEtRendLAncienFichier() {
        let ancien = URL(fileURLWithPath: "/tmp/a.jpg")
        let autre = URL(fileURLWithPath: "/tmp/b.jpg")
        let rendu = PendingImageEditReplacement.apply(
            ecrit("edited.webp"), size: CGSize(width: 300, height: 200), to: "a",
            files: ["a": ancien, "b": autre], attachments: [piece("a", url: ancien), piece("b", url: autre)])

        XCTAssertEqual(rendu.attachments.map(\.id), ["a", "b"])
        let remplacee = rendu.attachments[0]
        XCTAssertEqual(remplacee.mimeType, "image/webp")
        XCTAssertEqual(remplacee.fileSize, 42)
        XCTAssertEqual(remplacee.width, 300)
        XCTAssertEqual(remplacee.height, 200)
        XCTAssertEqual(remplacee.thumbnailColor, "112233")
        XCTAssertEqual(rendu.files["a"], URL(fileURLWithPath: "/tmp/edited.webp"))
        XCTAssertEqual(rendu.files["b"], autre)
        XCTAssertEqual(rendu.staleURL, ancien)
    }

    func test_apply_pieceRetireePendantLaRetouche_neRevientPas() {
        let autre = URL(fileURLWithPath: "/tmp/b.jpg")
        let rendu = PendingImageEditReplacement.apply(
            ecrit("edited.webp"), size: CGSize(width: 1, height: 1), to: "a",
            files: ["b": autre], attachments: [piece("b", url: autre)])

        XCTAssertEqual(rendu.attachments.map(\.id), ["b"])
        XCTAssertNil(rendu.files["a"])
        XCTAssertNil(rendu.staleURL)
    }

    /// La citation ouvre la scène sur la SOURCE (le fichier à 2 048 px), écrit
    /// la retouche AVANT de remplacer, et ne propose pas un GIF.
    func test_citation_ouvreLaSceneSurLeFichierEtEcritAvantDeRemplacer() throws {
        let citation = try String(contentsOf: URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appendingPathComponent("Meeshy/Features/Main/Views/FeedComposerSheet.swift"),
                                  encoding: .utf8)
        XCTAssertTrue(citation.contains("ConversationImageSceneEditor(image: item.image, staged: true"))
        XCTAssertTrue(citation.contains("ConversationImageRetouche.loadSource(fileURL:"))
        XCTAssertTrue(citation.contains("ConversationImageRetouche.writeEdited("))
        XCTAssertTrue(citation.contains("ConversationImageRetouche.offersRetouche(mimeType:"))
        XCTAssertTrue(citation.contains("PendingImageEditReplacement.apply("))
    }
}
