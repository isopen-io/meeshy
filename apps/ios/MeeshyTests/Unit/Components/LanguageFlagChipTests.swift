import XCTest
import MeeshyUI
@testable import Meeshy

/// **Le vocabulaire de la puce de langue — huit copies devenues une.**
///
/// Ce que la puce dit à VoiceOver n'est pas décoratif : c'est le SEUL canal par
/// lequel un lecteur non voyant apprend (a) ce que l'appui fera et (b) quelle
/// langue il lit en ce moment. Les huit copies soldées ici en servaient trois
/// versions — le nom de la langue seul (« Français », qui ressemble à une
/// étiquette et non à une action), un drapeau nu (que VoiceOver prononce
/// « drapeau de la France », c'est-à-dire un PAYS) et rien du tout.
@MainActor
final class LanguageFlagChipTests: XCTestCase {

    /// **`bundle` et `locale` vont par PAIRE** — idiome
    /// `InteractiveProgressBarAccessibilityTests` : le bundle choisit la TABLE,
    /// le locale applique ses règles à cette table. Fixer le seul locale rend un
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

    // MARK: - Le drapeau

    func test_flag_forAKnownLanguage_isItsEmoji() {
        XCTAssertEqual(LanguageFlagChip.flag(for: "fr"), "🇫🇷")
        XCTAssertEqual(LanguageFlagChip.flag(for: "FR"), "🇫🇷")
    }

    /// Deux des huit copies repliaient sur `"?"` pour une langue hors catalogue.
    /// Un code se lit et se reconnaît ; un point d'interrogation ne dit rien.
    func test_flag_forAnUnknownLanguage_isItsCodeInCapitals() {
        XCTAssertEqual(LanguageFlagChip.flag(for: "xx"), "XX")
    }

    /// `FeedComment.originalLanguage` est optionnel : la puce peut recevoir une
    /// chaîne vide. C'est le seul cas où il n'y a RIEN à nommer.
    func test_flag_forNoLanguageAtAll_fallsBackToTheQuestionMark() {
        XCTAssertEqual(LanguageFlagChip.flag(for: ""), "?")
        XCTAssertEqual(LanguageFlagChip.flag(for: "   "), "?")
    }

    // MARK: - Le nom du contrôle

    func test_spokenLabel_namesTheActionAndTheLanguage() throws {
        XCTAssertEqual(try inLocale("fr") { LanguageFlagChip.spokenLabel(for: "en", bundle: $0, locale: $1) },
                       "Afficher en English")
        XCTAssertEqual(try inLocale("en") { LanguageFlagChip.spokenLabel(for: "fr", bundle: $0, locale: $1) },
                       "Show in Français")
    }

    /// Le nom de la langue est son nom NATIF (`LanguageDisplay`), pas une
    /// traduction : « Show in Français » est ce que le dépôt sert depuis
    /// toujours sur les surfaces conformes, et un lecteur reconnaît « Deutsch »
    /// dans n'importe quelle interface.
    func test_spokenLabel_keepsTheNativeLanguageName() throws {
        XCTAssertEqual(try inLocale("de") { LanguageFlagChip.spokenLabel(for: "de", bundle: $0, locale: $1) },
                       "Auf Deutsch anzeigen")
    }

    func test_spokenLabel_forAnUnknownLanguage_fallsBackToItsCode() throws {
        XCTAssertEqual(try inLocale("fr") { LanguageFlagChip.spokenLabel(for: "xx", bundle: $0, locale: $1) },
                       "Afficher en XX")
    }

    // MARK: - Une paire de drapeaux ne dit qu'UNE chose

    /// L'aperçu d'un commentaire traduit montre deux drapeaux et une pastille.
    /// Lus un par un, VoiceOver annonçait deux PAYS — « drapeau du Royaume-Uni,
    /// drapeau de la France ». Ils forment une seule information, et s'annoncent
    /// donc en une phrase.
    func test_translationSummary_ditLaLangueSourceEtLaCible() throws {
        let fr = try inLocale("fr") {
            LanguageFlagChip.translationSummary(from: "en", to: "fr", bundle: $0, locale: $1)
        }
        XCTAssertEqual(fr, "Traduit de English vers Français", "obtenu « \(fr) »")

        let en = try inLocale("en") {
            LanguageFlagChip.translationSummary(from: "de", to: "es", bundle: $0, locale: $1)
        }
        XCTAssertEqual(en, "Translated from Deutsch to Español", "obtenu « \(en) »")
    }

    /// Le nom parlé et le drapeau écrit partagent leur repli : une langue hors
    /// catalogue s'annonce par son code, jamais par un point d'interrogation.
    func test_translationSummary_replieSurLeCodeDUneLangueInconnue() throws {
        let rendered = try inLocale("fr") {
            LanguageFlagChip.translationSummary(from: "xx", to: "fr", bundle: $0, locale: $1)
        }
        XCTAssertEqual(rendered, "Traduit de XX vers Français", "obtenu « \(rendered) »")
    }

    /// Le piège d'`InterpolatedLocalizationSubstitutionTests` (idiome 242i) —
    /// la seule négation qui vaille : un placeholder mal apparié ferait entendre
    /// « Traduit de %1$@ vers %2$@ ».
    func test_translationSummary_substitueLesDeuxLangues() throws {
        for code in ["fr", "en", "ar_SA"] {
            let rendered = try inLocale(code) {
                LanguageFlagChip.translationSummary(from: "en", to: "fr", bundle: $0, locale: $1)
            }
            for specifier in ["%@", "%lld", "%1$", "%2$"] {
                XCTAssertFalse(
                    rendered.contains(specifier),
                    "« \(specifier) » survit brut dans « \(rendered) » (\(code))."
                )
            }
        }
    }

    // MARK: - L'état lu

    /// `pt-BR` est volontairement absent : le banc cherche la table sur la seule
    /// LANGUE (`pt`), et le catalogue ne porte que la variante brésilienne.
    func test_shownValue_isTranslatedInEveryLocaleOfTheCatalogue() throws {
        let expected = ["fr": "Affichée", "en": "Shown", "es": "Mostrada",
                        "de": "Angezeigt", "it": "Visualizzata", "ar": "المعروضة"]
        for (code, value) in expected {
            XCTAssertEqual(try inLocale(code) { LanguageFlagChip.shownValue(bundle: $0, locale: $1) },
                           value, "locale \(code)")
        }
    }

    // MARK: - La cible tactile

    /// La HIG demande 44 pt. Les deux registres qui s'en écartent le font parce
    /// que leur rangée ne peut pas l'héberger — jamais par omission — et aucun
    /// ne descend sous les 22 pt que le pied de bulle établit.
    func test_hitSide_honoursTheHIGWhereTheRowCanHostIt() {
        XCTAssertEqual(LanguageFlagChip.Metrics.standard.hitSide, 44)
        XCTAssertEqual(LanguageFlagChip.Metrics.overlay.hitSide, 32)
        XCTAssertEqual(LanguageFlagChip.Metrics.compact.hitSide, 22)
    }

    /// La taille du drapeau reste un indicateur d'état APPARIÉ au soulignement :
    /// la puce active est servie par le style le plus grand des deux.
    func test_flagFont_growsWithTheActiveState() {
        for metrics in [LanguageFlagChip.Metrics.standard, .compact, .overlay] {
            XCTAssertNotEqual(metrics.flagFont(isActive: true),
                              metrics.flagFont(isActive: false),
                              "registre \(metrics)")
        }
    }

    func test_standardAndCompact_shareTheSameScalingTypography() {
        XCTAssertEqual(LanguageFlagChip.Metrics.standard.flagFont(isActive: true),
                       LanguageFlagChip.Metrics.compact.flagFont(isActive: true))
    }
}
