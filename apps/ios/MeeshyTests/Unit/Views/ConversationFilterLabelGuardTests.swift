import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **#4550 — le libellé d'un filtre n'est pas son identité.**
///
/// Les deux rangées de puces passaient `filter.rawValue` comme titre. Le
/// défaut ne se voyait pas en relisant les vues — un `rawValue` français se lit
/// comme un libellé — et aucune garde ne pouvait l'attraper : les cliquets de
/// localisation inspectent les `String(localized:)` d'un fichier, et il n'y en
/// avait aucun. Ce qui rendait le défaut invisible, c'est qu'il n'était PAS
/// écrit là où on cherche des chaînes d'affichage.
///
/// Trois familles, dont un fusible. Le fusible n'est pas décoratif : la moitié
/// des témoins ci-dessous sont négatifs, et un négatif sur une lecture vide
/// passe au vert sans qu'aucune assertion ne puisse le dire.
final class ConversationFilterLabelGuardTests: XCTestCase {

    private static let row = "Meeshy/Features/Main/Views/ConversationListView.swift"
    private static let panel = "Meeshy/Features/Main/Views/ConversationListView+Overlays.swift"

    private func source(_ path: String) throws -> String {
        try MyStoriesSourceCorpus.text(of: path)
    }

    // MARK: - 1. Aucune des deux rangées ne montre l'identité

    func test_neitherChipRow_showsTheRawValueAsATitle() throws {
        for path in [Self.row, Self.panel] {
            XCTAssertFalse(
                try source(path).contains("title: filter.rawValue"),
                "\(path) affiche l'IDENTITÉ du filtre. Un `rawValue` sert d'`id`, se compare " +
                "et se journalise ; servi comme libellé, il fige les neuf étiquettes en " +
                "français sur les sept locales livrées, et interdit à « Privée » de " +
                "retrouver son accent sans que l'identité du cas change au passage."
            )
            XCTAssertTrue(
                try source(path).contains("title: filter.displayName"),
                "\(path) doit consommer la propriété de PRÉSENTATION — c'est elle, et non " +
                "une garde, qui rend le libellé traduisible."
            )
        }
    }

    // MARK: - 2. La présentation couvre les neuf cas, sans repli

    /// Un `default:` rendrait un dixième cas silencieusement traduisible « plus
    /// tard » — c'est-à-dire jamais. Le témoin porte sur la forme parce que le
    /// compilateur, lui, ne dit rien d'un `switch` complété par un repli.
    func test_theDisplayName_enumeratesEveryCase_withNoFallback() throws {
        let label = try source("Meeshy/Features/Main/Models/ConversationFilterLabel.swift")

        XCTAssertFalse(
            label.contains("default:"),
            "Un repli dans le `switch` du libellé : le cas suivant partirait sans clé, et " +
            "aucun cliquet ne le verrait puisque le fichier resterait « entièrement localisé »."
        )
        XCTAssertEqual(
            label.components(separatedBy: "String(localized: \"conversation.filter.").count - 1,
            ConversationFilter.allCases.count,
            "Une clé par cas de l'énumération — ni plus (une clé morte), ni moins (un cas muet)."
        )
    }

    // MARK: - 3. Le libellé DIFFÈRE de l'identité là où l'identité est fautive

    /// Le témoin de COMPORTEMENT, et le seul qui tombe si quelqu'un « corrige »
    /// le défaut en accentuant le `rawValue`. Il tient dans toutes les locales :
    /// « Privée », « Private », « Privat » — aucune n'est « Privee ».
    func test_thePriveeLabel_isNeverTheUnaccentedIdentity() {
        XCTAssertEqual(ConversationFilter.privee.rawValue, "Privee",
                       "Le `rawValue` est l'identité et ne bouge pas — c'est ce qui rend le " +
                       "libellé libre de s'écrire correctement.")
        XCTAssertNotEqual(ConversationFilter.privee.displayName, "Privee",
                          "Le libellé lu par l'utilisateur ne peut pas être l'identité non accentuée.")
    }

    func test_everyFilter_hasANonEmptyLabel() {
        for filter in ConversationFilter.allCases {
            XCTAssertFalse(filter.displayName.isEmpty,
                           "Le filtre \(filter.rawValue) n'a aucun libellé à montrer.")
        }
    }

    /// Fusible de lecture : deux des témoins ci-dessus sont négatifs.
    func test_theGuardActuallyReadsItsSources() throws {
        XCTAssertGreaterThan(try source(Self.row).count, 20_000)
        XCTAssertGreaterThan(try source(Self.panel).count, 20_000)
        XCTAssertGreaterThan(
            try source("Meeshy/Features/Main/Models/ConversationFilterLabel.swift").count, 1_000)
    }
}
