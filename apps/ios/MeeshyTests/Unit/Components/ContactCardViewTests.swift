import XCTest
import Contacts
@testable import Meeshy
import MeeshySDK

/// Témoins de la carte de visite partagée (#8101) : reconnaître une vCard,
/// choisir les actions selon la relation, lister TOUS les champs de la fiche,
/// écrire la pièce jointe à l'envoi, et dire la carte à VoiceOver.
@MainActor
final class ContactCardViewTests: XCTestCase {

    private func makeCard() -> VCard {
        VCard(
            formattedName: "Awa Diallo",
            phones: [VCardEntry(value: "+33 6 12 34 56 78", types: ["cell"]), VCardEntry(value: "01 23", types: ["home"])],
            emails: [VCardEntry(value: "awa@example.com", label: "Perso")],
            addresses: [VCardAddress(street: "12 rue de la Paix", locality: "Paris", postalCode: "75002", types: ["work"])],
            organization: "Meeshy",
            title: "Directrice",
            urls: [VCardEntry(value: "https://meeshy.me")],
            birthday: "1990-01-15",
            note: "Appeler le matin"
        )
    }

    private func makeAccount(relation: ContactRelation = .none) -> PublicContactAccount {
        PublicContactAccount(userId: "u1", displayName: "Awa D.", username: "awa", relation: relation)
    }

    // MARK: - Reconnaissance

    func test_isContactCard_vcardMimeOrVcfExtension_isRecognized() {
        XCTAssertTrue(ContactCardMime.isContactCard(mimeType: "text/vcard", fileName: "x"))
        XCTAssertTrue(ContactCardMime.isContactCard(mimeType: "text/x-vcard; charset=utf-8", fileName: "x"))
        XCTAssertTrue(ContactCardMime.isContactCard(mimeType: "application/octet-stream", fileName: "Awa.VCF"))
        XCTAssertFalse(ContactCardMime.isContactCard(mimeType: "application/pdf", fileName: "a.vcf"))
        XCTAssertFalse(ContactCardMime.isContactCard(mimeType: "text/plain", fileName: "notes.txt"))
    }

    func test_isContactCard_onAttachment_usesOriginalName() {
        let attachment = MessageAttachment(fileName: "abc123", originalName: "Awa.vcf", mimeType: "application/octet-stream")
        XCTAssertTrue(attachment.isContactCard)
    }

    // MARK: - Actions selon la relation

    func test_resolveActions_self_offersNothing() {
        XCTAssertEqual(ContactAccountActions.resolve(relation: .current, pendingReceivedRequestId: nil), .none)
    }

    func test_resolveActions_friend_offersWriteOnly() {
        XCTAssertEqual(ContactAccountActions.resolve(relation: .friend, pendingReceivedRequestId: nil), ContactAccountActions(connect: nil, canWrite: true))
    }

    func test_resolveActions_requestSent_showsPendingStateNotAButton() {
        XCTAssertEqual(ContactAccountActions.resolve(relation: .requestSent, pendingReceivedRequestId: nil).connect, .pending)
    }

    func test_resolveActions_none_offersConnectAndWrite() {
        XCTAssertEqual(ContactAccountActions.resolve(relation: .none, pendingReceivedRequestId: nil), ContactAccountActions(connect: .connect, canWrite: true))
    }

    func test_resolveActions_requestReceivedWithKnownRequest_offersAccept() {
        XCTAssertEqual(ContactAccountActions.resolve(relation: .requestReceived, pendingReceivedRequestId: "r9").connect, .accept(requestId: "r9"))
        XCTAssertEqual(ContactAccountActions.resolve(relation: .requestReceived, pendingReceivedRequestId: nil).connect, .connect)
    }

    // MARK: - Champs de la fiche

    func test_fields_listEveryVCardFieldInOrder() {
        let fields = ContactCardField.fields(for: makeCard(), birthdayFormatter: { _ in "15 janvier 1990" })
        XCTAssertEqual(fields.map(\.kind), [.phone, .phone, .email, .address, .organization, .title, .url, .birthday, .note])
        XCTAssertEqual(fields.map(\.value), [
            "+33 6 12 34 56 78", "01 23", "awa@example.com", "12 rue de la Paix\n75002 Paris",
            "Meeshy", "Directrice", "https://meeshy.me", "15 janvier 1990", "Appeler le matin",
        ])
        XCTAssertEqual(Set(fields.map(\.id)).count, fields.count)
    }

    func test_fields_authorFreeLabel_isKeptVerbatim() {
        let email = ContactCardField.fields(for: makeCard()).first { $0.kind == .email }
        XCTAssertEqual(email?.label, "Perso")
    }

    func test_fields_unparsableBirthday_showsRawValue() {
        let fields = ContactCardField.fields(for: VCard(formattedName: "X", birthday: "vers 1990"))
        XCTAssertEqual(fields.first { $0.kind == .birthday }?.value, "vers 1990")
    }

    // MARK: - Envoi

    func test_export_contact_writesVCardCarryingTheAuthorsName() throws {
        let contact = CNMutableContact()
        contact.givenName = "Awa"
        contact.familyName = "Diallo"
        contact.phoneNumbers = [CNLabeledValue(label: CNLabelPhoneNumberMobile, value: CNPhoneNumber(stringValue: "+33 6 12 34 56 78"))]
        contact.emailAddresses = [CNLabeledValue(label: CNLabelWork, value: "awa@example.com" as NSString)]

        let export = try XCTUnwrap(ContactCardExporter.export(contact))
        let parsed = try XCTUnwrap(VCardParser.parse(export.data))

        XCTAssertEqual(parsed.displayName, "Awa Diallo")
        XCTAssertEqual(parsed.primaryPhone?.value, "+33 6 12 34 56 78")
        XCTAssertEqual(parsed.emails.first?.value, "awa@example.com")
        XCTAssertEqual(export.fileName, "Awa Diallo.vcf")
        XCTAssertTrue(String(decoding: export.data, as: UTF8.self).contains("VERSION:3.0"))
    }

    func test_export_contactWithPhoto_neverShipsThePhoto() throws {
        let contact = CNMutableContact()
        contact.givenName = "Photo"
        contact.imageData = Data(repeating: 0xFF, count: 2048)
        let export = try XCTUnwrap(ContactCardExporter.export(contact))
        XCTAssertFalse(String(decoding: export.data, as: UTF8.self).contains("PHOTO"))
    }

    func test_export_emptyContact_returnsNil() {
        XCTAssertNil(ContactCardExporter.export(CNMutableContact()))
    }

    func test_fileName_stripsPathCharacters() {
        XCTAssertEqual(ContactCardExporter.fileName(for: "A/B:C"), "A B C.vcf")
        XCTAssertEqual(ContactCardExporter.fileName(for: "  "), "contact.vcf")
    }

    func test_writeTemporaryFile_producesAVcfThatTheBubbleRecognizes() throws {
        let contact = CNMutableContact()
        contact.givenName = "Léa"
        let export = try XCTUnwrap(ContactCardExporter.export(contact))
        let url = try ContactCardExporter.writeTemporaryFile(export)
        defer { try? FileManager.default.removeItem(at: url) }

        XCTAssertEqual(url.pathExtension, "vcf")
        XCTAssertEqual(try Data(contentsOf: url), export.data)
        XCTAssertTrue(ContactCardMime.isContactCard(mimeType: ContactCardMime.mimeType, fileName: url.lastPathComponent))
    }

    // MARK: - Accessibilité

    func test_accessibilityLabel_includesNameFirstPhoneAndMeeshyAccount() {
        let label = ContactCardView.accessibilityLabel(card: makeCard(), account: makeAccount(), fallbackName: "x.vcf")
        XCTAssertTrue(label.contains("Awa Diallo"))
        XCTAssertTrue(label.contains("+33 6 12 34 56 78"))
        XCTAssertTrue(label.contains("@awa"))
    }

    func test_accessibilityLabel_unreadCard_fallsBackToFileName() {
        let label = ContactCardView.accessibilityLabel(card: nil, account: nil, fallbackName: "Awa.vcf")
        XCTAssertTrue(label.contains("Awa.vcf"))
    }
}
