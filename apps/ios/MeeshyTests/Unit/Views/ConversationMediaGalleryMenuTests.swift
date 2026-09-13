import XCTest
@testable import Meeshy

/// **Le menu ⋯ remplace le bouton d'enregistrement direct** (#6145, directive
/// porteur : « plutôt un menu hamburger … vertical » à droite du couloir haut,
/// avec l'option de partager hors de l'application).
///
/// Le couloir haut portait DEUX boutons d'action directe : la croix, et une
/// flèche descendante qui déclenchait l'enregistrement. La flèche devient un
/// menu, parce qu'un second verbe — partager hors de Meeshy — n'avait aucune
/// place où se poser sans encombrer un couloir de 56 pt.
///
/// Trois choses se vérifient ici, et la troisième est celle qui compte :
///
/// 1. le couloir ne monte plus de bouton d'enregistrement direct ;
/// 2. le menu porte EXACTEMENT deux verbes — il n'y a pas d'entrée
///    « Enregistrer sans la marque », et c'est une conséquence de #6146, pas un
///    oubli : la marque ne se choisit plus, elle se déduit de l'origine du
///    média, et l'offrir là où rien n'est marqué serait un contrôle inerte
///    (loi 4 de la planche) ;
/// 3. **chaque entrée a un TRANSPORT réel.** Un menu dont une ligne ne mène
///    nulle part est pire que le bouton qu'il remplace : le bouton, lui, ne
///    promettait qu'une seule chose et la tenait.
///
/// La note portée sous les verbes ne se rédige pas non plus : elle se DÉDUIT
/// du prédicat de la marque (`MeeshyMediaSaveBranding.stamps`). Une phrase
/// écrite à la main dirait ce que l'auteur croyait, pas ce que
/// l'enregistrement fera — et les deux divergeraient au premier changement de
/// règle, en silence.
@MainActor
final class ConversationMediaGalleryMenuTests: XCTestCase {

    private static let gallery = "Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift"
    private static let catalogPath = "Meeshy/Localizable.xcstrings"

    /// Les sept locales expédiées (`CFBundleLocalizations`), moins aucune : le
    /// catalogue de l'app est écrit en `fr`, qui en fait partie.
    private static let shippedLocales = ["ar", "de", "en", "es", "fr", "it", "pt-BR"]

    // MARK: - Le couloir haut

    func test_topCorridor_mountsTheMenu_andNoLongerADirectSaveButton() throws {
        let corridor = try body(of: "private var controlsOverlay: some View {")

        XCTAssertTrue(
            corridor.contains("overflowMenu"),
            "le couloir haut monte le menu ⋯ à droite, là où vivait la flèche d'enregistrement"
        )
        XCTAssertFalse(
            corridor.contains("requestSaveCurrent()"),
            "l'enregistrement ne se déclenche plus d'un tap sur le couloir — il est devenu "
                + "une ENTRÉE du menu, et un couloir qui garde les deux offre deux chemins "
                + "vers la même action"
        )
    }

    // MARK: - Le glyphe

    func test_theMenuGlyph_isAVerticalEllipsis_inTheSameGlassCircleAsTheCross() throws {
        let glyph = try body(of: "private var overflowGlyph: some View {")

        XCTAssertTrue(
            glyph.contains("Image(systemName: \"ellipsis\")")
                && glyph.contains(".rotationEffect(.degrees(90))"),
            "l'ellipse est VERTICALE — SF Symbols n'en porte pas de glyphe, elle se tourne"
        )
        XCTAssertTrue(
            glyph.contains(".frame(width: 40, height: 40)")
                && glyph.contains("adaptiveGlass(in: Circle()"),
            "même cercle glass 40 pt que la croix — le couloir n'a pas deux grammaires"
        )
        XCTAssertTrue(
            glyph.contains(".frame(width: 44, height: 44)") && glyph.contains(".contentShape("),
            "la cible tactile vaut 44 pt : le verre reste à 40, la zone touchable l'entoure"
        )
    }

    // MARK: - Deux verbes, deux transports

    func test_theMenu_carriesExactlyTwoVerbs_andBothHaveARealTransport() throws {
        let menu = try body(of: "var overflowMenu: some View {")

        XCTAssertEqual(
            menu.components(separatedBy: "Button {").count - 1, 2,
            "deux verbes, pas trois : « Enregistrer sans la marque » n'existe pas (#6146)"
        )
        let saveVerb = try body(of: "private var saveVerb: String {")
        let shareVerb = try body(of: "private var shareVerb: String {")
        XCTAssertTrue(
            saveVerb.contains("media.save.title") && shareVerb.contains("gallery.menu.share"),
            "les deux verbes sont « Enregistrer » et « Partager hors de Meeshy »"
        )
        XCTAssertTrue(
            menu.contains("requestSaveCurrent()") && menu.contains("shareCurrentOutsideMeeshy()"),
            "aucune entrée n'est listée sans chemin — chacune appelle son transport"
        )

        // Le `.accessibilityLabel` du menu LUI-MÊME nomme le glyphe ⋯, pas une
        // entrée : on compte donc entrée par entrée, en découpant sur `Button {`.
        // Un compte global aurait été satisfait par trois libellés posés
        // n'importe où — y compris deux sur le même bouton.
        let entries = menu.components(separatedBy: "Button {").dropFirst()
        XCTAssertEqual(entries.count, 2)
        for entry in entries {
            XCTAssertTrue(
                entry.contains(".accessibilityLabel("),
                "chaque entrée porte son libellé VoiceOver"
            )
        }
    }

    func test_bothTransports_reuseTheExistingSaveFlow_ratherThanReimplementIt() throws {
        let unit = try source()

        XCTAssertTrue(
            unit.contains(".mediaSaveFlow(saveCoordinator)"),
            "le flux d'enregistrement existant reste l'hôte du menu"
        )
        XCTAssertTrue(
            try body(of: "func shareCurrentOutsideMeeshy() {").contains("pick(.share"),
            "partager hors de Meeshy passe par la destination `.share` du coordinateur, "
                + "qui stage le fichier puis présente la share sheet système"
        )
        XCTAssertTrue(
            try body(of: "func requestSaveCurrent() {").contains("saveCoordinator.requestSave("),
            "enregistrer garde la sheet de destinations du composant unifié"
        )
    }

    // MARK: - La note se DÉDUIT

    func test_theBrandingNote_isDeducedFromTheSaveRule_neverWritten() throws {
        let note = try body(of: "var brandingNote: String {")

        XCTAssertTrue(
            note.contains("MeeshyMediaSaveBranding.stamps("),
            "ce que l'enregistrement fera se lit sur le prédicat de la marque, jamais sur "
                + "une phrase recopiée : deux sources divergeraient au premier changement de règle"
        )
    }

    // MARK: - Les clés neuves, dans les sept locales

    func test_theMenuKeys_areTranslatedInEveryShippedLocale() throws {
        let catalog = try JSONSerialization.jsonObject(
            with: try Data(contentsOf: Self.appRoot.appendingPathComponent(Self.catalogPath)))
        guard let strings = (catalog as? [String: Any])?["strings"] as? [String: Any] else {
            return XCTFail("catalogue illisible")
        }

        for key in ["gallery.menu.share", "gallery.menu.more",
                    "gallery.menu.brand.none", "gallery.menu.brand.meeshy"] {
            let localizations = ((strings[key] as? [String: Any])?["localizations"] as? [String: Any]) ?? [:]
            let missing = Self.shippedLocales.filter { localizations[$0] == nil }
            XCTAssertTrue(
                missing.isEmpty,
                "`\(key)` manque dans \(missing.joined(separator: ", ")) — un `defaultValue` "
                    + "est écrit en français, donc une locale sans entrée sert du français"
            )
        }
    }

    // MARK: - Helpers

    private static var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private func source() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.gallery))
    }

    private func body(of anchor: String) throws -> String {
        let code = try source()
        guard let start = code.range(of: anchor) else {
            XCTFail("ancre introuvable dans l'unité de la galerie : \(anchor)")
            return ""
        }
        var depth = 0
        var result = ""
        for character in code[start.lowerBound...] {
            result.append(character)
            if character == "{" { depth += 1 }
            if character == "}" {
                depth -= 1
                if depth == 0 { return result }
            }
        }
        XCTFail("corps non refermé pour \(anchor)")
        return ""
    }
}
