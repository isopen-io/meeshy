import XCTest
import MeeshyUI
@testable import Meeshy

/// **Dix-sept boutons qui portaient tous le même nom.**
///
/// Chaque pastille de la bande de couleurs s'annonçait « Arrière-plan » — le
/// nom du GROUPE, répété dix-sept fois. Un lecteur de VoiceOver parcourant la
/// bande entendait dix-sept fois la même phrase, sans jamais savoir où il en
/// était ni ce qui distinguait une pastille de la suivante.
///
/// Le nom est désormais POSITIONNEL, pour la raison qui a fait choisir la
/// position sur la barre d'étapes de l'inscription (242i) : une couleur n'a pas
/// de nom court dans le dépôt, et la position est précisément l'information que
/// le lecteur cherche pour se repérer dans une bande.
@MainActor
final class BackgroundColorPaletteTests: XCTestCase {

    /// **`bundle` et `locale` vont par PAIRE** : le bundle choisit la TABLE, le
    /// locale applique ses règles à cette table. Fixer le seul locale rend un
    /// gabarit anglais sur un simulateur anglais, quelle que soit la langue
    /// demandée.
    private func inLocale(_ code: String,
                          _ make: (Bundle, Locale) -> String) throws -> String {
        let locale = Locale(identifier: code)
        let language = locale.language.languageCode?.identifier ?? code
        let path = try XCTUnwrap(
            Bundle.main.path(forResource: language, ofType: "lproj"),
            "localisation « \(language) » absente du bundle — régression de packaging"
        )
        return make(try XCTUnwrap(Bundle(path: path)), locale)
    }

    private func label(_ index: Int, of total: Int, in code: String) throws -> String {
        try inLocale(code) {
            BackgroundColorPalette.positionLabel(index: index, total: total, bundle: $0, locale: $1)
        }
    }

    // MARK: - Le nom dit OÙ l'on est

    func test_positionLabel_estUnRangHumain_pasUnIndex() throws {
        XCTAssertEqual(try label(0, of: 17, in: "fr"), "Couleur 1 sur 17")
        XCTAssertEqual(try label(16, of: 17, in: "fr"), "Couleur 17 sur 17")
    }

    func test_positionLabel_estTraduitDansLesLocalesDuCatalogue() throws {
        XCTAssertEqual(try label(2, of: 17, in: "en"), "Color 3 of 17")
        XCTAssertEqual(try label(2, of: 17, in: "es"), "Color 3 de 17")
        XCTAssertEqual(try label(2, of: 17, in: "de"), "Farbe 3 von 17")
        XCTAssertEqual(try label(2, of: 17, in: "it"), "Colore 3 di 17")
    }

    /// L'arabe s'écrit en chiffres arabo-indiens, et un rang de couleur n'y fait
    /// pas exception. Les deux nombres passent par `LocalizedNumber.exact` — sans
    /// quoi la phrase mêlerait deux systèmes de chiffres.
    ///
    /// `ar_SA` et non `ar` : une locale NUE se fait compléter par la région de
    /// l'APPAREIL et rend des chiffres latins sur un simulateur américain. La
    /// table, elle, se cherche sur la seule LANGUE (`ar.lproj`) — c'est ce que
    /// fait `inLocale`.
    func test_positionLabel_ecritSesNombresDansLeSystemeDuLecteur() throws {
        let arabic = try label(2, of: 17, in: "ar_SA")
        XCTAssertTrue(arabic.contains("٣"), "rang en chiffres arabo-indiens — obtenu « \(arabic) »")
        XCTAssertTrue(arabic.contains("١٧"), "total en chiffres arabo-indiens — obtenu « \(arabic) »")
        XCTAssertFalse(arabic.contains("3"), "aucun chiffre latin ne doit subsister")
    }

    // MARK: - La cible n'est pas le dessin

    func test_laCibleTactileDepasseLeDessin() {
        XCTAssertEqual(BackgroundColorPalette.hitSide, 44,
                       "minimum HIG — la bande peut l'héberger, elle mesurait déjà 44 pt de haut")
        XCTAssertLessThan(BackgroundColorPalette.swatchDiameter, BackgroundColorPalette.hitSide,
                          "le dessin reste plus petit que la cible : c'est tout le principe")
    }
}
