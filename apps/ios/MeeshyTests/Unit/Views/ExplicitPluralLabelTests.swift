import XCTest
@testable import Meeshy

/// Régression du markup AGA inline (`^[…](inflect: true)`) : sans entrée
/// String Catalog, la résolution `String(localized:)` retombe sur
/// `defaultValue`, et ce chemin de repli ne résout PAS le markup au runtime
/// sur iOS 18.x — la chaîne brute fuirait dans l'UI visible ET dans VoiceOver.
/// Les labels comptés doivent donc résoudre le pluriel explicitement.
/// Même contrat que `PostStatAccessibilityTests`.
///
/// **La table ET la règle sont fixées (#5599, 2026-09-13).** Ce témoin
/// appelait `labelText(remaining:)` / `sendAttemptCountLabel(_:)` sans rien
/// fixer, et attendait l'anglais : il jugait donc la langue du SIMULATEUR.
/// Depuis `7373df1f97` (2026-08-31, le `defaultValue` passe au français), il
/// rougissait sur un simulateur francophone alors que le produit servait
/// exactement ce qu'il doit — « Voir 1 réponse de plus », « 0 tentative » (le
/// français range 0 dans le singulier). Les deux fonctions prennent désormais
/// `bundle` et `locale`, et chaque témoin nomme sa langue.
///
/// `@MainActor` : les types testés vivent dans le target app, isolé
/// main-actor-par-défaut (Swift 6.2).
@MainActor
final class ExplicitPluralLabelTests: XCTestCase {

    /// La table `<code>.lproj` du bundle de l'app, et la règle de pluriel de
    /// la même langue — jamais l'une sans l'autre.
    private func localized(_ code: String) throws -> (bundle: Bundle, locale: Locale) {
        let path = try XCTUnwrap(
            Bundle.main.path(forResource: code, ofType: "lproj"),
            "\(code).lproj absent du bundle de l'app"
        )
        return (try XCTUnwrap(Bundle(path: path)), Locale(identifier: code))
    }

    // MARK: - LoadMoreRepliesCell (texte visible + accessibilityLabel)

    func test_loadMoreRepliesLabelText_singularForOne() throws {
        let en = try localized("en")
        XCTAssertEqual(LoadMoreRepliesCell.labelText(remaining: 1, bundle: en.bundle, locale: en.locale),
                       "View 1 more reply")
    }

    func test_loadMoreRepliesLabelText_pluralForMany() throws {
        let en = try localized("en")
        XCTAssertEqual(LoadMoreRepliesCell.labelText(remaining: 3, bundle: en.bundle, locale: en.locale),
                       "View 3 more replies")
    }

    func test_loadMoreRepliesLabelText_frenchAgreesInTheSingular() throws {
        let fr = try localized("fr")
        XCTAssertEqual(LoadMoreRepliesCell.labelText(remaining: 1, bundle: fr.bundle, locale: fr.locale),
                       "Voir 1 réponse de plus")
    }

    // MARK: - MessageViewsDetailView (compteur de tentatives d'envoi)

    func test_sendAttemptCountLabel_singularForOne() throws {
        let en = try localized("en")
        XCTAssertEqual(MessageViewsDetailView.sendAttemptCountLabel(1, bundle: en.bundle, locale: en.locale),
                       "1 attempt")
    }

    func test_sendAttemptCountLabel_pluralForMany() throws {
        let en = try localized("en")
        XCTAssertEqual(MessageViewsDetailView.sendAttemptCountLabel(5, bundle: en.bundle, locale: en.locale),
                       "5 attempts")
    }

    func test_sendAttemptCountLabel_pluralForZero() throws {
        let en = try localized("en")
        XCTAssertEqual(MessageViewsDetailView.sendAttemptCountLabel(0, bundle: en.bundle, locale: en.locale),
                       "0 attempts")
    }

    /// Le français range 0 dans le SINGULIER : c'est la règle de la locale
    /// qui décide, jamais le code.
    func test_sendAttemptCountLabel_frenchPutsZeroInTheSingular() throws {
        let fr = try localized("fr")
        XCTAssertEqual(MessageViewsDetailView.sendAttemptCountLabel(0, bundle: fr.bundle, locale: fr.locale),
                       "0 tentative")
    }
}
