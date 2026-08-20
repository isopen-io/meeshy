import XCTest
@testable import Meeshy

/// Le nom PRONONCÉ par le picker de transfert doit être celui qui est AFFICHÉ.
///
/// La rangée rend `conv.displayName` (`userState.customName ?? title ??
/// identifier`), mais ses deux boutons — « Transférer à … » et « Réessayer le
/// transfert à … » — se composaient depuis `conv.title`, replié sur « cette
/// conversation ». Deux défauts distincts en découlaient :
///
/// 1. **Label in Name (WCAG 2.5.3)** : une conversation renommée s'affiche
///    « Maman » et s'annonçait « Groupe famille » — « Appuyer sur Transférer à
///    Maman » ne commandait plus rien sous Voice Control.
/// 2. **Cibles indiscernables** : `title` est nul pour les conversations
///    DIRECTES, l'essentiel d'un picker de transfert. Tous leurs boutons
///    d'envoi annonçaient alors LA MÊME chose — « Transférer à cette
///    conversation » — et VoiceOver ne permettait plus de savoir à qui l'on
///    s'apprêtait à transférer. L'action primaire de l'écran devenait
///    inutilisable à l'oreille.
///
/// La divergence est désormais impossible par construction : la rangée n'a plus
/// qu'une seule entrée de nom. Ces tests verrouillent le contrat et son câblage.
@MainActor
final class ForwardPickerSpokenNameTests: XCTestCase {

    // MARK: - Contrat prononcé

    func test_sendLabel_namesTheConversationItServes() {
        XCTAssertTrue(
            ForwardPickerRow.sendAccessibilityLabel(name: "Alice").contains("Alice"),
            "le libellé d'envoi doit porter le nom affiché de la cible"
        )
    }

    /// La régression du défaut 2 : deux cibles distinctes, deux annonces
    /// distinctes. Avec le repli générique, les deux rendaient la même chaîne.
    func test_sendLabel_distinguishesTwoTargets() {
        XCTAssertNotEqual(
            ForwardPickerRow.sendAccessibilityLabel(name: "Alice"),
            ForwardPickerRow.sendAccessibilityLabel(name: "Bob")
        )
    }

    func test_retryLabel_namesTheConversationItServes() {
        XCTAssertTrue(
            ForwardPickerRow.retrySendAccessibilityLabel(name: "Alice").contains("Alice"),
            "le libellé de réessai doit porter le nom affiché de la cible"
        )
    }

    func test_retryLabel_distinguishesTwoTargets() {
        XCTAssertNotEqual(
            ForwardPickerRow.retrySendAccessibilityLabel(name: "Alice"),
            ForwardPickerRow.retrySendAccessibilityLabel(name: "Bob")
        )
    }

    /// Les deux libellés ne disent pas la même chose : le réessai doit se
    /// reconnaître à l'oreille, sinon un échec est indiscernable d'un état neuf.
    func test_retryLabel_isNotTheSendLabel() {
        XCTAssertNotEqual(
            ForwardPickerRow.sendAccessibilityLabel(name: "Alice"),
            ForwardPickerRow.retrySendAccessibilityLabel(name: "Alice")
        )
    }

    // MARK: - Câblage

    /// `sendAccessibilityLabel` ne vaut que par ce qu'on lui donne : le nom
    /// AFFICHÉ. Le picker ne doit donc alimenter la rangée que depuis
    /// `conv.displayName` — jamais depuis `conv.title`, qui est optionnel et
    /// ignore le renommage local.
    func test_pickerFeedsTheDisplayedNameToTheRow() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Components/ForwardPickerSheet.swift")
        let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))

        XCTAssertTrue(
            code.contains("name: conv.displayName"),
            "la rangée doit recevoir le nom affiché de la conversation"
        )
        XCTAssertFalse(
            code.contains("conv.title"),
            "conv.title ignore le renommage local et est nul pour les conversations directes — il ne nomme aucune cible"
        )
    }
}
