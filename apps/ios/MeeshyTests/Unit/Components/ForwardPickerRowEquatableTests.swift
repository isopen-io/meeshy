import SwiftUI
import XCTest
@testable import Meeshy

/// La rangée du picker de transfert est passée sous portillon `.equatable()`
/// (doctrine « Zero Unnecessary Re-render ») : le `@State model` vit dans le
/// parent, donc UN changement d'état — une cible qui passe `sending` → `sent`,
/// et l'envoi groupé en enchaîne autant qu'il y a de cibles — réévaluait le
/// corps de TOUTES les lignes matérialisées.
///
/// Un portillon ne vaut que par son `==`. Deux façons de le rendre inopérant
/// sans que rien ne rougisse : y faire entrer les closures (recréées à chaque
/// passe du parent ⇒ jamais égales, portillon mort), ou en sortir une valeur
/// AFFICHÉE (⇒ ligne figée). Les deux se testent ici.
@MainActor
final class ForwardPickerRowEquatableTests: XCTestCase {

    private func row(
        id: String = "6a0000000000000000000001",
        name: String = "Équipe produit",
        memberCount: Int = 3,
        moodEmoji: String? = nil,
        accentHex: String = "#6366F1",
        isDark: Bool = false,
        state: ForwardPickerModel.TargetState = .idle,
        onTap: @escaping () -> Void = {},
        onSend: @escaping () -> Void = {}
    ) -> ForwardPickerRow {
        ForwardPickerRow(
            id: id,
            name: name,
            typeLabel: "group",
            memberCount: memberCount,
            avatarURL: nil,
            avatarAccentHex: "#4338CA",
            favoriteEmoji: nil,
            moodEmoji: moodEmoji,
            accentHex: accentHex,
            isDark: isDark,
            state: state,
            a11yName: name,
            onTap: onTap,
            onSend: onSend,
            onMoodTap: nil
        )
    }

    func test_row_ignoresClosures_soTheEquatableGateActuallyGates() {
        XCTAssertEqual(
            row(onTap: {}, onSend: {}),
            row(onTap: {}, onSend: {}),
            "Deux closures distinctes ne sont jamais égales : les faire entrer dans `==` rendrait le portillon inopérant"
        )
    }

    func test_row_differs_whenItsOwnStateChanges() {
        XCTAssertNotEqual(row(state: .idle), row(state: .selected))
        XCTAssertNotEqual(row(state: .sending), row(state: .sent))
        XCTAssertNotEqual(
            row(state: .failed("Un message à vue unique ne peut pas être transféré")),
            row(state: .failed("Le transfert a échoué")),
            "la raison d'échec est AFFICHÉE sous la ligne — deux raisons différentes ne sont pas la même ligne"
        )
    }

    /// `isDark` ne sert qu'à la comparaison — sans lui, un basculement de thème
    /// laisserait la rangée figée dans les couleurs de l'ancien mode.
    func test_row_differs_whenThemeFlips() {
        XCTAssertNotEqual(row(isDark: false), row(isDark: true))
    }

    func test_row_differs_whenDisplayedValuesChange() {
        XCTAssertNotEqual(row(id: "6a0000000000000000000001"), row(id: "6a0000000000000000000002"))
        XCTAssertNotEqual(row(name: "Alice"), row(name: "Bob"))
        XCTAssertNotEqual(row(memberCount: 3), row(memberCount: 4))
        XCTAssertNotEqual(row(moodEmoji: nil), row(moodEmoji: "🎉"))
        XCTAssertNotEqual(row(accentHex: "#6366F1"), row(accentHex: "#4338CA"))
    }
}
