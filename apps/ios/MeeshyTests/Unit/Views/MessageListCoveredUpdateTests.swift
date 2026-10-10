import Foundation
import XCTest
@testable import Meeshy

/// **Sous la Rivière et le Résumé, SwiftUI ne remet plus à jour la liste (#3947).**
///
/// La veille posée jusqu'ici arrête le RENDU (`isHidden`), l'HORLOGE (le réveil
/// 4 Hz du suivi de lecture) et le PUITS du data source (`applyToDataSource`).
/// Restait la mise à jour du représentable lui-même : `ConversationView` le
/// reconstruit à chaque passe de son `body`, avec une quarantaine de closures
/// neuves, et SwiftUI rappelait donc `updateUIViewController` à CHAQUE passe —
/// quarante affectations, la pose des encarts, le thème — pour une liste que
/// personne ne voit.
///
/// La mise à jour n'est sautée QUE si rien d'autre que des closures n'a changé
/// sous le pane : un ordre (vidange des accusés au passage en arrière-plan,
/// défilement, saut) doit toujours atteindre le contrôleur, et le réveil
/// remet tout à jour d'un coup.
@MainActor
final class MessageListCoveredUpdateTests: XCTestCase {

    private let store = NSObject()
    private let viewModel = NSObject()

    private func inputs(
        _ mode: ConversationReadingMode,
        flushSeenTrigger: Int = 0,
        scrollToBottomTrigger: Int = 0,
        scrollToMessageId: String? = nil,
        scrollToMessageTrigger: Int = 0,
        isSearchingQuotedMessage: Bool = false,
        bottomInset: CGFloat = 80,
        accentColor: String = "6366F1"
    ) -> MessageListView.CoveredInputs {
        MessageListView.CoveredInputs(
            readingMode: mode,
            store: ObjectIdentifier(store),
            conversationViewModel: ObjectIdentifier(viewModel),
            currentUserId: "moi",
            accentColor: accentColor,
            isDirect: false,
            bottomInset: bottomInset,
            bottomInsetTransition: nil,
            topInset: 59,
            headerBandHeight: 44,
            scrollToBottomTrigger: scrollToBottomTrigger,
            scrollToMessageId: scrollToMessageId,
            scrollToMessageTrigger: scrollToMessageTrigger,
            flushSeenTrigger: flushSeenTrigger,
            isSearchingQuotedMessage: isSearchingQuotedMessage,
            isHeaderExpanded: false,
            overlaidMessageId: nil,
            isSelectionModeActive: false,
            selectedMessageIds: []
        )
    }

    // MARK: - Ce qui saute la mise à jour

    func test_skipsUpdate_coveredTwiceWithOnlyClosuresChanged_skips() {
        XCTAssertTrue(MessageListView.skipsUpdate(from: inputs(.river), to: inputs(.river)))
        XCTAssertTrue(MessageListView.skipsUpdate(from: inputs(.summary), to: inputs(.summary)))
    }

    // MARK: - Ce qui la laisse passer

    /// Un mode RENDU se met à jour comme avant, à chaque passe : la porte ne
    /// change rien hors des deux panes opaques.
    func test_skipsUpdate_renderedMode_neverSkips() {
        for mode in [ConversationReadingMode.bubbles, .script, .focal] {
            XCTAssertFalse(MessageListView.skipsUpdate(from: inputs(mode), to: inputs(mode)),
                           "\(mode) rend le fil : il se met à jour à chaque passe")
        }
    }

    /// L'ENTRÉE sous le pane porte le mode couvert jusqu'au contrôleur — c'est
    /// elle qui pose la veille ; le RÉVEIL porte le mode rendu — c'est lui qui
    /// réapplique `.allItems`. Sauter l'une ou l'autre figerait la liste dans
    /// le mauvais état.
    func test_skipsUpdate_enteringOrLeavingThePane_neverSkips() {
        XCTAssertFalse(MessageListView.skipsUpdate(from: inputs(.bubbles), to: inputs(.river)), "entrée en Rivière")
        XCTAssertFalse(MessageListView.skipsUpdate(from: inputs(.script), to: inputs(.summary)), "entrée en Résumé")
        XCTAssertFalse(MessageListView.skipsUpdate(from: inputs(.river), to: inputs(.script)), "réveil depuis la Rivière")
        XCTAssertFalse(MessageListView.skipsUpdate(from: inputs(.summary), to: inputs(.focal)), "réveil depuis le Résumé")
        XCTAssertFalse(MessageListView.skipsUpdate(from: inputs(.river), to: inputs(.summary)), "d'un pane à l'autre")
    }

    /// Passer en arrière-plan EN Rivière incrémente `flushSeenTrigger` : la
    /// lecture acquise avant la bascule doit partir maintenant, pas au réveil.
    func test_skipsUpdate_coveredWithAFlushOrder_letsItThrough() {
        XCTAssertFalse(MessageListView.skipsUpdate(from: inputs(.river), to: inputs(.river, flushSeenTrigger: 1)))
    }

    func test_skipsUpdate_coveredWithAPositionalOrder_letsItThrough() {
        XCTAssertFalse(MessageListView.skipsUpdate(from: inputs(.river), to: inputs(.river, scrollToBottomTrigger: 1)))
        XCTAssertFalse(MessageListView.skipsUpdate(
            from: inputs(.summary),
            to: inputs(.summary, scrollToMessageId: "m9", scrollToMessageTrigger: 1)
        ))
        XCTAssertFalse(MessageListView.skipsUpdate(from: inputs(.river), to: inputs(.river, isSearchingQuotedMessage: true)))
    }

    /// Une VALEUR qui change sous le pane (le clavier qui monte, le thème) se
    /// pose quand elle change : le réveil ne doit pas rattraper un encart d'un
    /// coup, sous les yeux du lecteur.
    func test_skipsUpdate_coveredWithAValueChange_letsItThrough() {
        XCTAssertFalse(MessageListView.skipsUpdate(from: inputs(.river), to: inputs(.river, bottomInset: 336)))
        XCTAssertFalse(MessageListView.skipsUpdate(from: inputs(.river), to: inputs(.river, accentColor: "F59E0B")))
    }

    // MARK: - Gardes de source

    private func source(_ relative: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(relative))
    }

    /// Le site d'appel DEMANDE la comparaison — sans `.equatable()`, la règle
    /// existe et ne s'exécute nulle part.
    func test_conversationView_mountsTheListBehindTheCoveredGate() throws {
        let code = try source("Meeshy/Features/Main/Views/ConversationView.swift")
        let start = try XCTUnwrap(code.range(of: "MessageListView("), "le pont UIKit a quitté ConversationView")
        let end = try XCTUnwrap(code.range(of: ".ignoresSafeArea(.container, edges: [.top, .bottom])",
                                           range: start.upperBound..<code.endIndex))
        XCTAssertTrue(code[start.lowerBound..<end.lowerBound].contains(").equatable()"),
                      "MessageListView doit être monté derrière `.equatable()` pour que la porte s'applique")
    }

    /// La porte réutilise la loi des modes couverts au lieu de la réécrire.
    func test_coveredGate_reusesTheRendersThreadLaw() throws {
        let code = try source("Meeshy/Features/Main/Views/MessageListView.swift")
        XCTAssertTrue(code.contains("MessageListViewController.rendersThread(old.readingMode)"))
        XCTAssertTrue(code.contains("MessageListViewController.rendersThread(new.readingMode)"))
    }

    /// **Complétude** — toute propriété VALEUR du représentable entre dans
    /// `CoveredInputs`. Une valeur oubliée ne serait plus portée au contrôleur
    /// tant que la liste est couverte : le défaut naîtrait silencieux, au
    /// premier champ ajouté. Seules les closures restent dehors : ce sont elles
    /// qui changent d'identité à chaque passe, et c'est leur rafraîchissement
    /// qui attend le réveil.
    func test_coveredInputs_carryEveryValueInputOfTheRepresentable() throws {
        let code = try source("Meeshy/Features/Main/Views/MessageListView.swift")
        let start = try XCTUnwrap(code.range(of: "struct MessageListView: UIViewControllerRepresentable {"))
        let end = try XCTUnwrap(code.range(of: "func makeCoordinator", range: start.upperBound..<code.endIndex))
        let valueInputs = Self.storedValueProperties(in: String(code[start.upperBound..<end.lowerBound]))
        XCTAssertGreaterThanOrEqual(valueInputs.count, 15, "la garde doit lire les entrées du représentable")

        let gate = try XCTUnwrap(code.range(of: "var coveredInputs: CoveredInputs"))
        let builder = String(code[gate.upperBound...].prefix(2000))
        for name in valueInputs {
            XCTAssertTrue(builder.contains("\(name):"),
                          "`\(name)` n'entre pas dans `CoveredInputs` : sous la Rivière, il ne serait plus posé")
        }
    }

    /// Contre-épreuve de l'extracteur : il voit une valeur, ignore une closure.
    func test_storedValueProperties_seesValues_ignoresClosures() {
        let sample = """
            let store: MessageStore
            var bottomInset: CGFloat = 0
            var onLoadOlder: (@MainActor () async -> Void)?
            var onRetry: ((String) -> Void)?
        """
        XCTAssertEqual(Self.storedValueProperties(in: sample), ["store", "bottomInset"])
    }

    private static func storedValueProperties(in body: String) -> [String] {
        body.components(separatedBy: "\n").compactMap { line in
            guard line.hasPrefix("    let ") || line.hasPrefix("    var ") else { return nil }
            let declaration = line.dropFirst(8)
            guard let colon = declaration.firstIndex(of: ":") else { return nil }
            let name = String(declaration[..<colon])
            let type = declaration[declaration.index(after: colon)...]
            guard !type.contains("->"), !name.contains(" ") else { return nil }
            return name
        }
    }
}
