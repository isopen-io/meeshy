import XCTest
@testable import MeeshySDK

/// Témoins du parseur vCard (#8101) — les formes que les carnets exportent
/// réellement, en 2.1, 3.0 et 4.0.
final class VCardParserTests: XCTestCase {

    private func card(_ lines: [String], separator: String = "\r\n") -> VCard? {
        VCardParser.parse(lines.joined(separator: separator))
    }

    // MARK: - 3.0 nominal (CNContactVCardSerialization)

    func test_parse_appleVCard30_readsEveryField() throws {
        let parsed = try XCTUnwrap(card([
            "BEGIN:VCARD",
            "VERSION:3.0",
            "PRODID:-//Apple Inc.//iPhone OS 26.0//EN",
            "N:Dupont;Jean;Marc;Dr;Jr",
            "FN:Jean Dupont",
            "ORG:Meeshy;Produit;",
            "TITLE:Designer",
            "item1.TEL;type=CELL;type=VOICE;type=pref:+33 6 12 34 56 78",
            "TEL;type=WORK;type=VOICE:01 23 45 67 89",
            "item2.EMAIL;type=INTERNET;type=HOME:jean@example.com",
            "item2.X-ABLabel:_$!<Home>!$_",
            "ADR;type=HOME:;Bât. B;12 rue de la Paix;Paris;IDF;75002;France",
            "URL:https://meeshy.me",
            "BDAY;value=date:1990-05-12",
            "NOTE:Rencontré au salon\\, stand 4\\nRappeler lundi",
            "END:VCARD",
        ]))

        XCTAssertEqual(parsed.displayName, "Jean Dupont")
        XCTAssertEqual(parsed.name, VCardName(family: "Dupont", given: "Jean", additional: "Marc", prefix: "Dr", suffix: "Jr"))
        XCTAssertEqual(parsed.organization, "Meeshy, Produit")
        XCTAssertEqual(parsed.title, "Designer")
        XCTAssertEqual(parsed.phones.map(\.value), ["+33 6 12 34 56 78", "01 23 45 67 89"])
        XCTAssertEqual(parsed.phones[0].types, ["cell", "voice", "pref"])
        XCTAssertEqual(parsed.emails, [VCardEntry(value: "jean@example.com", types: ["internet", "home"], label: "home")])
        XCTAssertEqual(parsed.addresses.first?.street, "12 rue de la Paix")
        XCTAssertEqual(parsed.addresses.first?.formatted, "12 rue de la Paix\nBât. B\n75002 Paris\nIDF\nFrance")
        XCTAssertEqual(parsed.urls.map(\.value), ["https://meeshy.me"])
        XCTAssertEqual(parsed.birthday, "1990-05-12")
        XCTAssertEqual(parsed.birthdayComponents, DateComponents(year: 1990, month: 5, day: 12))
        XCTAssertEqual(parsed.note, "Rencontré au salon, stand 4\nRappeler lundi")
    }

    func test_parse_labels_matchTheSharedContractKeys() throws {
        let parsed = try XCTUnwrap(card([
            "BEGIN:VCARD", "VERSION:3.0", "FN:Awa Diallo",
            "item1.TEL;type=CELL;type=VOICE;type=pref:+33 6 12 34 56 78",
            "item1.X-ABLabel:_$!<Mobile>!$_",
            "TEL;type=HOME;type=VOICE:01 23 45 67 89",
            "item2.EMAIL;type=INTERNET;type=pref:awa@example.com",
            "item2.X-ABLabel:Perso",
            "EMAIL;type=INTERNET;type=WORK:awa.diallo@meeshy.me",
            "TEL;TYPE=FAX,WORK:0100",
            "END:VCARD",
        ]))
        XCTAssertEqual(parsed.phones.map(\.labelKey), ["mobile", "home", "fax"])
        XCTAssertEqual(parsed.emails.map(\.labelKey), ["Perso", "work"])
    }

    func test_parse_duplicateOrEmptyValues_areDropped() throws {
        let parsed = try XCTUnwrap(card([
            "BEGIN:VCARD", "FN:A", "TEL:", "TEL:+33600000000", "TEL;TYPE=CELL:+33600000000",
            "EMAIL:a@b.c", "EMAIL:A@B.C", "END:VCARD",
        ], separator: "\n"))
        XCTAssertEqual(parsed.phones, [VCardEntry(value: "+33600000000")])
        XCTAssertEqual(parsed.emails.count, 1)
    }

    func test_parse_preferredPhone_isPrimaryEvenWhenNotFirst() throws {
        let parsed = try XCTUnwrap(card([
            "BEGIN:VCARD", "VERSION:3.0", "FN:A",
            "TEL;TYPE=WORK:111", "TEL;TYPE=CELL,PREF:222",
            "END:VCARD",
        ]))
        XCTAssertEqual(parsed.primaryPhone?.value, "222")
    }

    // MARK: - Pliage

    func test_parse_foldedLine_isUnfolded() throws {
        let parsed = try XCTUnwrap(card([
            "BEGIN:VCARD", "VERSION:3.0",
            "FN:Jean-Baptiste de la Tour",
            "NOTE:Une note tr",
            " ès longue qui dépasse",
            "\t soixante-quinze octets",
            "END:VCARD",
        ]))
        XCTAssertEqual(parsed.note, "Une note très longue qui dépasse soixante-quinze octets")
    }

    func test_parse_lfOnlyLineEndings_areAccepted() throws {
        let parsed = try XCTUnwrap(card(["BEGIN:VCARD", "VERSION:3.0", "FN:Léa", "TEL:+33600000000", "END:VCARD"], separator: "\n"))
        XCTAssertEqual(parsed.displayName, "Léa")
        XCTAssertEqual(parsed.primaryPhone?.value, "+33600000000")
    }

    // MARK: - 2.1 (Android, anciens Nokia)

    func test_parse_vcard21QuotedPrintableUtf8_decodesAccents() throws {
        let parsed = try XCTUnwrap(card([
            "BEGIN:VCARD", "VERSION:2.1",
            "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:M=C3=BCller;J=C3=BCrgen;;;",
            "FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:J=C3=BCrgen M=C3=BCller",
            "TEL;CELL;PREF:+49 170 1234567",
            "END:VCARD",
        ]))
        XCTAssertEqual(parsed.displayName, "Jürgen Müller")
        XCTAssertEqual(parsed.name?.family, "Müller")
        XCTAssertEqual(parsed.phones.first?.types, ["cell", "pref"])
    }

    func test_parse_vcard21QuotedPrintableSoftBreak_joinsContinuation() throws {
        let parsed = try XCTUnwrap(card([
            "BEGIN:VCARD", "VERSION:2.1", "FN:Zoé",
            "NOTE;ENCODING=QUOTED-PRINTABLE;CHARSET=UTF-8:Premi=C3=A8re ligne=0D=0A=",
            "Deuxi=C3=A8me ligne",
            "END:VCARD",
        ]))
        XCTAssertEqual(parsed.note, "Première ligne\r\nDeuxième ligne")
    }

    func test_parse_vcard21Latin1Charset_decodesWithDeclaredCharset() throws {
        let parsed = try XCTUnwrap(card([
            "BEGIN:VCARD", "VERSION:2.1",
            "FN;CHARSET=ISO-8859-1;QUOTED-PRINTABLE:Ren=E9e",
            "END:VCARD",
        ]))
        XCTAssertEqual(parsed.displayName, "Renée")
    }

    // MARK: - 4.0

    func test_parse_vcard40TelUriAndPrefParam_stripsSchemeAndMarksPreferred() throws {
        let parsed = try XCTUnwrap(card([
            "BEGIN:VCARD", "VERSION:4.0", "FN:Ana",
            "TEL;VALUE=uri;PREF=1;TYPE=\"voice,cell\":tel:+34-600-000-000",
            "EMAIL;TYPE=work:mailto:ana@example.es",
            "BDAY:--0412",
            "END:VCARD",
        ]))
        XCTAssertEqual(parsed.phones, [VCardEntry(value: "+34-600-000-000", types: ["voice", "cell", "pref"])])
        XCTAssertEqual(parsed.emails.first?.value, "ana@example.es")
        XCTAssertEqual(parsed.birthdayComponents, DateComponents(month: 4, day: 12))
    }

    // MARK: - Nom de repli, binaire, rejet

    func test_parse_withoutFN_composesDisplayNameFromN() throws {
        let parsed = try XCTUnwrap(card(["BEGIN:VCARD", "VERSION:3.0", "N:Martin;Claire;;;", "END:VCARD"]))
        XCTAssertEqual(parsed.displayName, "Claire Martin")
    }

    func test_parse_withoutAnyName_fallsBackToFirstPhone() throws {
        let parsed = try XCTUnwrap(card(["BEGIN:VCARD", "VERSION:3.0", "TEL:+221770000000", "END:VCARD"]))
        XCTAssertEqual(parsed.displayName, "+221770000000")
    }

    func test_parse_photoBase64_isIgnored() throws {
        let parsed = try XCTUnwrap(card([
            "BEGIN:VCARD", "VERSION:3.0", "FN:Photo",
            "PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQSkZJRgABAQAAAQABAAD",
            " /2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U",
            "TEL:1",
            "END:VCARD",
        ]))
        XCTAssertEqual(parsed.displayName, "Photo")
        XCTAssertEqual(parsed.phones.map(\.value), ["1"])
    }

    func test_parse_textWithoutVCard_returnsNil() {
        XCTAssertNil(VCardParser.parse("Bonjour, ceci n'est pas une carte"))
    }

    func test_parse_emptyCard_returnsNil() {
        XCTAssertNil(card(["BEGIN:VCARD", "VERSION:3.0", "END:VCARD"]))
    }

    func test_parse_multipleCards_returnsTheFirst() throws {
        let parsed = try XCTUnwrap(card([
            "BEGIN:VCARD", "VERSION:3.0", "FN:Premier", "END:VCARD",
            "BEGIN:VCARD", "VERSION:3.0", "FN:Second", "END:VCARD",
        ]))
        XCTAssertEqual(parsed.displayName, "Premier")
    }

    func test_parse_latin1Data_isDecodedWhenNotUtf8() throws {
        let data = try XCTUnwrap("BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Hélène\r\nEND:VCARD\r\n".data(using: .isoLatin1))
        XCTAssertEqual(VCardParser.parse(data)?.displayName, "Hélène")
    }

    // MARK: - Écriture (aller-retour)

    func test_write_roundTrip_parsesBackToTheSameCard() throws {
        let original = VCard(
            formattedName: "Jean; Dupont, fils",
            name: VCardName(family: "Dupont", given: "Jean"),
            phones: [VCardEntry(value: "+33 6 12 34 56 78", types: ["cell", "pref"])],
            emails: [VCardEntry(value: "jean@example.com", types: ["internet", "home"])],
            addresses: [VCardAddress(street: "12 rue de la Paix", locality: "Paris", postalCode: "75002", country: "France", types: ["home"])],
            organization: "Meeshy",
            title: "Designer",
            urls: [VCardEntry(value: "https://meeshy.me")],
            birthday: "1990-05-12",
            note: "Ligne 1\nLigne 2 — accentuée éèà, avec virgule"
        )

        let written = VCardWriter.write(original)
        let parsed = try XCTUnwrap(VCardParser.parse(written))

        XCTAssertTrue(written.hasPrefix("BEGIN:VCARD\r\nVERSION:3.0\r\n"))
        XCTAssertEqual(parsed, original)
    }

    func test_write_longLine_isFoldedAt75OctetsWithoutSplittingACharacter() throws {
        let note = String(repeating: "é", count: 120)
        let written = VCardWriter.write(VCard(formattedName: "X", note: note))

        for line in written.components(separatedBy: "\r\n") {
            XCTAssertLessThanOrEqual(line.utf8.count, 75)
        }
        XCTAssertEqual(VCardParser.parse(written)?.note, note)
    }
}
