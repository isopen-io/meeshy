import XCTest
import SwiftUI
@testable import MeeshyUI

/// `UnreadCountBadge` — atome extrait par le lot 2 de la Lentille
/// (2026-08-22) pour que la pastille rouge chiffrée ne soit pas ÉCRITE DEUX
/// FOIS (peau historique `ThemedConversationRow.unreadBadge`, fichier gelé
/// en lecture seule, et peau Lentille).
///
/// Ce qui se teste ici est ce qui peut RÉGRESSER sans qu'aucune vue ne le
/// dise : le portillon (`isVisible`) et la trame (cotes exposées). Le rendu
/// lui-même n'est pas inspectable — aucun framework d'inspection SwiftUI
/// dans ce dépôt — mais les deux appelants passent par CES symboles, donc
/// une dérive s'y verrait.
@MainActor
final class UnreadCountBadgeTests: XCTestCase {

    // MARK: - Portillon — la pastille n'existe pas à zéro

    /// Le point du contrat : l'appelant n'écrit JAMAIS `if unreadCount > 0`.
    /// Si ce portillon s'ouvrait à zéro, chaque rangée lue afficherait un
    /// disque rouge VIDE (`NotificationBadge.displayed(0) == ""`).
    func test_isVisible_isTrueOnlyAboveZero() {
        XCTAssertFalse(UnreadCountBadge.isVisible(count: 0))
        XCTAssertFalse(UnreadCountBadge.isVisible(count: -3), "un décodage optimiste peut produire un négatif — il ne doit pas peindre de pastille")
        XCTAssertTrue(UnreadCountBadge.isVisible(count: 1))
        XCTAssertTrue(UnreadCountBadge.isVisible(count: 4_312))
    }

    /// Cohérence avec le texte rendu : la pastille est visible EXACTEMENT
    /// quand `NotificationBadge.displayed` a quelque chose à dire. Deux
    /// seuils distincts feraient soit un disque vide, soit un chiffre sans
    /// disque.
    func test_visibility_agreesWithTheFormatterItRenders() {
        for count in [-1, 0, 1, 2, 99, 100, 5_000] {
            XCTAssertEqual(
                UnreadCountBadge.isVisible(count: count),
                !NotificationBadge.displayed(count).isEmpty,
                "count = \(count) : la pastille et son texte doivent apparaître ensemble"
            )
        }
    }

    // MARK: - Trame

    /// Plancher CARRÉ : à un chiffre la pastille reste un disque — c'est ce
    /// qui la distingue d'une étiquette (même raison que
    /// `NotificationBadge.minimumSize`, autre pastille, autre usage).
    func test_minimumSize_isSquare() {
        XCTAssertEqual(UnreadCountBadge.minimumSize, 24)
    }

    func test_chrome_reproducesTheHistoricalRowsPaddings() {
        XCTAssertEqual(UnreadCountBadge.horizontalPadding, 7)
        XCTAssertEqual(UnreadCountBadge.verticalPadding, 4)
        XCTAssertEqual(UnreadCountBadge.shadowRadius, 3)
        XCTAssertEqual(UnreadCountBadge.shadowOpacity, 0.25)
    }
}
