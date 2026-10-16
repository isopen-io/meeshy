import XCTest
@testable import Meeshy

/// La langue de l'interface se choisit dans les Réglages (directive user
/// 2026-07-29 : le picker avait disparu). Ce choix est PROPRE à l'affichage :
/// il ne touche pas aux langues de traduction du profil.
///
/// Tant qu'aucun choix n'est posé, l'interface suit la langue principale de
/// l'utilisateur — le comportement en place depuis le 2026-07-25. Ce repli est
/// le point délicat : `AppearancePreferences.interfaceLanguage` vaut « en » par
/// défaut pour tout le monde, si bien que faire primer cette préférence telle
/// quelle aurait basculé en anglais l'interface de chaque utilisateur qui n'y a
/// jamais touché. D'où un choix explicite, distinct du défaut, et un repli
/// quand il est absent.
final class UILanguageOverrideResolutionTests: XCTestCase {

    func test_noExplicitChoice_followsThePrimaryLanguage() {
        XCTAssertEqual(UILanguageOverride.resolvedCode(explicit: nil, fallback: "fr"), "fr")
    }

    func test_anExplicitChoiceWinsOverThePrimaryLanguage() {
        XCTAssertEqual(UILanguageOverride.resolvedCode(explicit: "de", fallback: "fr"), "de")
    }

    /// « Automatique » est un choix, pas une langue : il rend la main au repli.
    func test_theAutomaticSentinelFallsBack() {
        XCTAssertEqual(UILanguageOverride.resolvedCode(explicit: UILanguageOverride.automaticCode,
                                                       fallback: "es"), "es")
    }

    func test_anEmptyExplicitChoiceFallsBack() {
        XCTAssertEqual(UILanguageOverride.resolvedCode(explicit: "", fallback: "it"), "it")
    }

    /// Une langue qu'on ne sait pas afficher ne doit jamais être retenue : le
    /// repli reprend la main plutôt que de livrer un panachage.
    func test_anUnsupportedExplicitChoiceFallsBack() {
        XCTAssertEqual(UILanguageOverride.resolvedCode(explicit: "ja", fallback: "fr"), "fr")
    }

    func test_bothUnsupported_resolvesToNothing() {
        XCTAssertNil(UILanguageOverride.resolvedCode(explicit: "ja", fallback: "ko"))
    }

    /// Le portugais est livré en pt-BR seul : toute variante y est ramenée,
    /// comme le fait déjà `normalized`.
    func test_portugueseVariantsResolveToTheDeliveredOne() {
        XCTAssertEqual(UILanguageOverride.resolvedCode(explicit: "pt", fallback: nil), "pt-BR")
    }

    /// Le picker des Réglages ne propose que des langues réellement livrées —
    /// la liste des choix ne peut pas s'écarter de ce que l'app sait afficher.
    func test_everyOfferedChoiceIsASupportedUICode() {
        for code in UILanguageOverride.selectableCodes {
            XCTAssertNotNil(UILanguageOverride.normalized(code),
                            "\(code) est proposé aux Réglages mais n'est pas affichable")
        }
    }

    // MARK: - Une session, une langue (#10804)

    private func code(_ path: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
    }

    /// `AppleLanguages` écrit dans `MeeshyApp.init()` arrivait APRÈS que
    /// UIKit eut figé la localisation du bundle, mais AVANT que `Locale.current`
    /// et les vues système (sélecteur de photos) ne la relisent : la session
    /// d'après la connexion affichait une interface anglaise avec des dates et
    /// des « Annuler » français. L'override s'écrit désormais avant
    /// `UIApplicationMain`, dans le point d'entrée du processus — bundle, locale
    /// et vues système lisent alors la même langue dès la première image.
    func test_theOverrideIsWrittenBeforeTheApplicationStarts() throws {
        let launch = try code("Meeshy/MeeshyLaunch.swift")
        XCTAssertTrue(launch.contains("@main"))
        let apply = try XCTUnwrap(launch.range(of: "UILanguageOverride.applyIfNeeded()"))
        let start = try XCTUnwrap(launch.range(of: "MeeshyApp.main()"))
        XCTAssertLessThan(apply.lowerBound, start.lowerBound)
        let app = try code("Meeshy/MeeshyApp.swift")
        XCTAssertFalse(app.contains("@main"), "le point d'entrée est MeeshyLaunch")
        XCTAssertFalse(app.contains("UILanguageOverride.applyIfNeeded()"),
                       "écrit dans init(), l'override panache la session")
    }

    /// Écrit en cours de session, `AppleLanguages` bascule `Locale.current` et
    /// les vues système sans toucher au bundle : le choix des Réglages attend
    /// le relancement, comme l'alerte le dit déjà.
    func test_noScreenRewritesTheLanguageDuringASession() throws {
        let settings = try code("Meeshy/Features/Main/Views/SettingsView.swift")
        XCTAssertFalse(settings.contains("UILanguageOverride.applyIfNeeded()"))
        XCTAssertTrue(settings.contains("UILanguageOverride.explicitChoice = code"))
    }
}

