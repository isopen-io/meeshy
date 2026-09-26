import XCTest
@testable import Meeshy
import MeeshySDK

/// #8142 — VoiceOver annonce une carte de visite par son nom (et son numéro,
/// son compte Meeshy quand ils sont connus), jamais par un nom de fichier.
@MainActor
final class ContactCardAccessibilityTests: XCTestCase {

    private func contactAttachment(originalName: String) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(id: "vcf-\(UUID().uuidString)", fileName: originalName, originalName: originalName,
                                mimeType: "text/vcard", fileSize: 120)
    }

    private let temporaryName = "contact_17E8744F-9AC7-45A6-9D0E-1AE50724FF9B_Collègue Bravo.vcf"

    func test_nameFromFileName_composerTemporaryName_keepsTheAuthorName() {
        XCTAssertEqual(ContactCardName.fromFileName(temporaryName), "Collègue Bravo")
    }

    func test_nameFromFileName_plainName_dropsTheExtension() {
        XCTAssertEqual(ContactCardName.fromFileName("Zoé Sanscompte.vcf"), "Zoé Sanscompte")
    }

    func test_nameFromFileName_nothingHuman_isNil() {
        XCTAssertNil(ContactCardName.fromFileName("contact_80140BD0-1111-2222-3333-444455556666_.vcf"))
        XCTAssertNil(ContactCardName.fromFileName(".vcf"))
    }

    func test_nonMediaAccessibilityParts_contactCard_announcesTheContactNeverTheFile() {
        let parts = MessageAccessibilityLabelComposer.nonMediaAccessibilityParts(
            hasSharedPlace: false,
            nonMedia: [contactAttachment(originalName: temporaryName)]
        )
        XCTAssertEqual(parts.count, 1)
        XCTAssertTrue(parts[0].contains("Collègue Bravo"))
        XCTAssertFalse(parts[0].contains(".vcf"))
        XCTAssertFalse(parts[0].contains("17E8744F"))
        XCTAssertEqual(parts[0], ContactCardView.accessibilityLabel(card: nil, account: nil, fallbackName: "Collègue Bravo"))
    }

    func test_bubbleNonMediaAccessibilityParts_contactCard_isTheSameLaw() {
        let attachment = contactAttachment(originalName: temporaryName)
        XCTAssertEqual(
            BubbleStandardLayout.nonMediaAccessibilityParts(hasSharedPlace: false, nonMedia: [attachment]),
            MessageAccessibilityLabelComposer.nonMediaAccessibilityParts(hasSharedPlace: false, nonMedia: [attachment])
        )
    }

    func test_writeTemporaryFile_keepsTheContactNameAsTheFileName() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let export = ContactCardExporter.Export(data: Data("BEGIN:VCARD".utf8), fileName: "Collègue Bravo.vcf", displayName: "Collègue Bravo")
        let url = try ContactCardExporter.writeTemporaryFile(export, directory: directory)
        XCTAssertEqual(url.lastPathComponent, "Collègue Bravo.vcf",
                       "le nom téléversé devient `originalName` : il porte le nom du contact, rien d'autre")
    }
}
