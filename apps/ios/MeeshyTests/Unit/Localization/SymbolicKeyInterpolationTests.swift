import XCTest
@testable import Meeshy

/// LE SPÉCIFICATEUR QUI ATTEINT L'UTILISATEUR (#6463).
///
/// Relevé à la recette : VoiceOver annonce « Vers le niveau %lld ». Le site
/// écrit `String(localized: "<clé symbolique>", defaultValue: "… \(n) …")`,
/// et le catalogue porte `"Vers le niveau %lld"`.
///
/// Ce fichier ne corrige rien : il MESURE. Avant de toucher aux 143 sites de
/// la même forme relevés dans le dépôt, il faut établir ce que l'API rend
/// réellement — une correction de masse fondée sur une hypothèse serait pire
/// que le défaut.
final class SymbolicKeyInterpolationTests: XCTestCase {

    /// Le cas EXACT de l'issue, tel que `ProgressionComponents.swift:109` l'écrit.
    func test_symbolicKey_withInterpolatedDefault_substitutesTheArgument() {
        let niveau = 6
        let rendu = String(
            localized: "progression.a11y.bar.level",
            defaultValue: "Vers le niveau \(niveau)",
            bundle: .main
        )
        XCTAssertFalse(rendu.contains("%lld"),
                       "le spécificateur ne doit JAMAIS atteindre un lecteur — rendu : « \(rendu) »")
        XCTAssertTrue(rendu.contains("6"), "le niveau doit apparaître — rendu : « \(rendu) »")
    }

    /// LE TÉMOIN QUI DISCRIMINE — sans lui les deux précédents sont sans valeur.
    ///
    /// Si le catalogue n'était PAS trouvé, le `defaultValue` servirait et
    /// rendrait lui aussi « … 6 » : les deux assertions ci-dessus passeraient
    /// pour un motif ÉTRANGER à ce qu'elles affirment. On donne donc un
    /// `defaultValue` qui ne ressemble à AUCUNE valeur du catalogue : ce qui
    /// sort dit lequel des deux chemins a été pris.
    func test_theCatalogIsActuallyConsulted_notTheDefaultValue() {
        let rendu = String(
            localized: "progression.a11y.bar.level",
            defaultValue: "ZZZ \(6)",
            bundle: .main
        )
        XCTAssertFalse(rendu.hasPrefix("ZZZ"),
                       "le catalogue n'est PAS consulté : les autres témoins de ce fichier ne mesurent rien — rendu : « \(rendu) »")
        XCTAssertTrue(rendu.contains("6"), "et l'argument doit survivre à la substitution — rendu : « \(rendu) »")
    }

    /// La même forme avec `%@`, l'autre moitié des 143 sites.
    func test_symbolicKey_withStringArgument_substitutesToo() {
        let rendu = String(
            localized: "story.viewer.a11y.profileOf",
            defaultValue: "Profil de \("Awa")",
            bundle: .main
        )
        XCTAssertFalse(rendu.contains("%@"), "rendu : « \(rendu) »")
        XCTAssertTrue(rendu.contains("Awa"), "rendu : « \(rendu) »")
    }
}
