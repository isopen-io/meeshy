import XCTest
@testable import Meeshy

/// Les libellés VoiceOver de la grille média du fil.
///
/// La grille annonçait sa POSITION par cinq littéraux gravés sous une SEULE clé
/// (`feed.media.item` : « Media 1 of \(count) » … « Media 5 of \(count) »), en
/// anglais dans les sept locales puisque la clé n'était pas au catalogue.
/// `FeedMediaAccessibility` en fait un seul appel dont la position est un
/// ARGUMENT — d'où ces tests, qui vérifient les deux choses que l'œil ne voit
/// pas sur un diff : que les deux entiers arrivent DANS L'ORDRE, et qu'aucun
/// spécificateur ne survit dans les sept langues expédiées.
///
/// Comme `PostStatAccessibilityTests`, ils injectent bundle ET locale : sans
/// cela le test juge la langue du SIMULATEUR — vert en local (fr), rouge en CI
/// (en).
@MainActor
final class FeedMediaAccessibilityTests: XCTestCase {

    private static let shippedLocales = ["ar", "de", "en", "es", "fr", "it", "pt-BR"]

    /// **Le catalogue s'indexe par LANGUE, sauf quand il s'indexe par
    /// RÉGION.** `pt-BR` expédie `pt-BR.lproj` là où `ar` expédie `ar.lproj` :
    /// chercher la table sur le seul code de langue raterait le premier,
    /// chercher sur le seul identifiant complet raterait un jour le second. On
    /// tente le code tel quel, puis sa langue.
    private func bundle(_ code: String) throws -> Bundle {
        let language = Locale(identifier: code).language.languageCode?.identifier ?? code
        let path = try XCTUnwrap(
            Bundle.main.path(forResource: code, ofType: "lproj")
                ?? Bundle.main.path(forResource: language, ofType: "lproj"),
            "localisation « \(code) » absente du bundle — régression de packaging"
        )
        return try XCTUnwrap(Bundle(path: path))
    }

    // MARK: - La position voyage comme argument

    func test_tileLabel_placesPositionBeforeTotal() throws {
        XCTAssertEqual(
            FeedMediaAccessibility.tileLabel(position: 3, of: 7,
                                             bundle: try bundle("en"),
                                             locale: Locale(identifier: "en")),
            "Media 3 of 7"
        )
        XCTAssertEqual(
            FeedMediaAccessibility.tileLabel(position: 3, of: 7,
                                             bundle: try bundle("fr"),
                                             locale: Locale(identifier: "fr")),
            "Média 3 sur 7"
        )
    }

    /// Chaque tuile dit une position DIFFÉRENTE. C'est l'assertion qui serait
    /// tombée sur le code d'avant une fois la clé entrée au catalogue : les cinq
    /// sites s'y seraient effondrés sur la même phrase.
    func test_tileLabel_distinguishesEveryTileOfTheSameGrid() throws {
        let fr = try bundle("fr")
        let labels = (1...5).map {
            FeedMediaAccessibility.tileLabel(position: $0, of: 5,
                                             bundle: fr, locale: Locale(identifier: "fr"))
        }
        XCTAssertEqual(Set(labels).count, 5, "Cinq tuiles, cinq annonces : \(labels)")
    }

    /// Un spécificateur qui survit est la signature d'un TYPE de placeholder qui
    /// ne correspond pas à l'argument interpolé (`%@` pour un `Int`, par
    /// exemple) — invisible au compilateur, visible par l'utilisateur.
    func test_tileLabel_leavesNoFormatSpecifierInAnyShippedLocale() throws {
        for code in Self.shippedLocales {
            let label = FeedMediaAccessibility.tileLabel(
                position: 2, of: 4,
                bundle: try bundle(code),
                locale: Locale(identifier: code)
            )
            XCTAssertFalse(label.isEmpty, "« \(code) » rend un libellé vide")
            for specifier in ["%@", "%lld", "%1$", "%2$", "%d"] {
                XCTAssertFalse(label.contains(specifier),
                               "« \(code) » laisse « \(specifier) » brut : \(label)")
            }
        }
    }

    // MARK: - Réemploi plutôt qu'une clé anglaise de plus

    /// La tuile « +N » servait `feed.media.moreItems`, absente du catalogue donc
    /// anglaise partout. Elle sert désormais `a11y.post.media.more`, que la
    /// grille jumelle de `PostDetailView` rend déjà dans les sept locales.
    func test_overflowLabel_servesTheSharedTranslatedKey() throws {
        XCTAssertEqual(
            FeedMediaAccessibility.overflowLabel(total: 9,
                                                 bundle: try bundle("en"),
                                                 locale: Locale(identifier: "en")),
            "View all 9 media"
        )
        XCTAssertEqual(
            FeedMediaAccessibility.overflowLabel(total: 9,
                                                 bundle: try bundle("fr"),
                                                 locale: Locale(identifier: "fr")),
            "Voir les 9 médias"
        )
    }

    /// Le média UNIQUE d'un post ouvrait le plein écran sans nom accessible ni
    /// trait de bouton. Il porte la clé que `PostDetailView` sert déjà.
    func test_singleImageLabel_isTranslated() throws {
        XCTAssertEqual(
            FeedMediaAccessibility.singleImageLabel(bundle: try bundle("en"),
                                                    locale: Locale(identifier: "en")),
            "Shared image"
        )
        XCTAssertEqual(
            FeedMediaAccessibility.singleImageLabel(bundle: try bundle("fr"),
                                                    locale: Locale(identifier: "fr")),
            "Image partagée"
        )
    }

    func test_openHint_isTranslated() throws {
        XCTAssertEqual(
            FeedMediaAccessibility.openHint(bundle: try bundle("en"),
                                            locale: Locale(identifier: "en")),
            "Tap to enlarge"
        )
        XCTAssertEqual(
            FeedMediaAccessibility.openHint(bundle: try bundle("fr"),
                                            locale: Locale(identifier: "fr")),
            "Toucher pour agrandir"
        )
    }
}
