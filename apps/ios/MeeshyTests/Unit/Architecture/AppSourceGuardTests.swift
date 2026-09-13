import XCTest
@testable import Meeshy

/// Le stripper partagé des gardes de source — chaque cas ci-dessous est un
/// mode d'échec RÉEL d'un des anciens strippers locaux qu'il remplace.
final class AppSourceGuardTests: XCTestCase {

    func test_trailingLineComment_isRemoved() {
        // Les `codeLines` ne filtraient que les lignes COMMENÇANT par `//` :
        // un commentaire de fin de ligne citant le symbole cherché suffisait
        // à faire passer une garde sur du code qui ne l'applique pas.
        let stripped = AppSourceGuard.stripComments("let x = 1 // symboleRecherché\n")
        XCTAssertFalse(stripped.contains("symboleRecherché"))
        XCTAssertTrue(stripped.contains("let x = 1"))
    }

    func test_urlInStringLiteral_survives() {
        // Le stripper de StoryOverlayWidthPinGuardTests coupait au premier
        // `//` SANS conscience des littéraux : une URL tronquait la ligne et
        // faisait DISPARAÎTRE le code que la garde inspectait.
        let stripped = AppSourceGuard.stripComments(#"let url = "https://gate.meeshy.me" .zIndex(3)"#)
        XCTAssertTrue(stripped.contains(#""https://gate.meeshy.me""#))
        XCTAssertTrue(stripped.contains(".zIndex(3)"))
    }

    func test_multiLineBlockComment_isRemoved() {
        let source = """
        let a = 1
        /* bloc
           citant symboleRecherché
        */ let b = 2
        """
        let stripped = AppSourceGuard.stripComments(source)
        XCTAssertFalse(stripped.contains("symboleRecherché"))
        XCTAssertTrue(stripped.contains("let a = 1"))
        XCTAssertTrue(stripped.contains("let b = 2"))
    }

    func test_escapedQuoteInString_doesNotLeakIntoCodeMode() {
        let stripped = AppSourceGuard.stripComments(#"let s = "guillemet \" // pas un commentaire" + reste"#)
        XCTAssertTrue(stripped.contains("pas un commentaire"))
        XCTAssertTrue(stripped.contains("+ reste"))
    }

    func test_divisionOperator_isNotEatenAsComment() {
        let stripped = AppSourceGuard.stripComments("let ratio = width / height\n")
        XCTAssertTrue(stripped.contains("width / height"))
    }

    func test_lineStructure_isPreserved_forLineOrientedGuards() {
        let source = "let a = 1 // fin\nlet b = 2\n/* bloc\nbloc */\nlet c = 3"
        let lines = AppSourceGuard.strippedLines(source)
        XCTAssertEqual(lines.count, 5, "Les sauts de ligne survivent — les gardes ligne à ligne comptent dessus")
        XCTAssertTrue(lines[4].contains("let c = 3"))
    }

    // MARK: - Compter un IDENTIFIANT, jamais une sous-chaîne

    /// **LE témoin central de `occurrences(ofIdentifier:in:)`** — celui qui
    /// distingue un nom de son PRÉFIXE. C'est le cas réel qui a inversé la garde
    /// du rail des slides : `slideRailSlot` contient `slideRail`, et un comptage
    /// par sous-chaîne en trouvait cinq là où l'identifiant n'apparaît que deux
    /// fois.
    func test_unNomVoisin_neCompteJamaisPourLeNomGarde() {
        let source = """
        let slideRailSlot: AnyView?
        private var slideRail: some View { slideRailSlot }
        var body: some View { slideRail }
        """
        XCTAssertEqual(
            AppSourceGuard.occurrences(ofIdentifier: "slideRail", in: source), 2,
            "`slideRailSlot` n'est pas `slideRail` — trois occurrences de trop feraient rougir une garde juste."
        )
        XCTAssertEqual(
            AppSourceGuard.occurrences(ofIdentifier: "slideRailSlot", in: source), 2,
            "…et le nom voisin se compte pour LUI-MÊME, sur ses deux sites."
        )
    }

    /// Les deux BORNES du mot, séparément — un identifiant ne se poursuit ni à
    /// gauche ni à droite, et se tromper d'un seul côté rendrait la garde à
    /// moitié aveugle.
    func test_lesDeuxBornesDuMot_sontGardees() {
        XCTAssertEqual(AppSourceGuard.occurrences(ofIdentifier: "rail", in: "rail railSuffixe"), 1,
            "Un suffixe prolonge le mot à DROITE.")
        XCTAssertEqual(AppSourceGuard.occurrences(ofIdentifier: "rail", in: "rail prefixeRail_rail"), 1,
            "Un préfixe le prolonge à GAUCHE — et `_` prolonge comme une lettre.")
        XCTAssertEqual(AppSourceGuard.occurrences(ofIdentifier: "rail", in: "rail2 rail"), 1,
            "Un chiffre prolonge aussi.")
    }

    /// La PONCTUATION, elle, ne prolonge pas : c'est ce qui fait qu'un
    /// identifiant se compte dans du code réel, où il est toujours collé à un
    /// point, une parenthèse ou deux-points.
    func test_laPonctuation_neProlongePasUnIdentifiant() {
        let source = "viewModel.slideRail(at: slideRail), [slideRail]"
        XCTAssertEqual(AppSourceGuard.occurrences(ofIdentifier: "slideRail", in: source), 3)
    }

    /// Aux DEUX EXTRÊMES de la source — la boucle lit le caractère d'avant et
    /// celui d'après, et il faut qu'elle survive à leur absence.
    func test_leMotSeul_auxDeuxBoutsDeLaSource() {
        XCTAssertEqual(AppSourceGuard.occurrences(ofIdentifier: "rail", in: "rail"), 1)
        XCTAssertEqual(AppSourceGuard.occurrences(ofIdentifier: "rail", in: "rail rail"), 2)
        XCTAssertEqual(AppSourceGuard.occurrences(ofIdentifier: "rail", in: ""), 0)
    }
}
