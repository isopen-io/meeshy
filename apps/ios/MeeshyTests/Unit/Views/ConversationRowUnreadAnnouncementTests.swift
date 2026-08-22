import XCTest
import MeeshySDK
@testable import Meeshy

/// Les deux rangées de conversation — `ThemedConversationRow` et
/// `LentilleConversationRow` — posaient, quand `unreadCount > 0` :
///
/// ```swift
/// .accessibilityValue(String(localized: "accessibility.unread_messages", bundle: .main))
/// ```
///
/// **sans `String(format:)`**, alors que la valeur du catalogue contient un
/// `%lld` dans les 7 locales (« %lld messages non lus »). Le spécificateur
/// n'était donc jamais substitué : VoiceOver énonçait la chaîne brute,
/// spécificateur compris, à chaque rangée non lue de la liste.
///
/// Le compte, lui, était déjà annoncé — correctement — par le LIBELLÉ :
/// `conversationAccessibilityLabel` appelle `accessibility.unread_count`, la
/// seule clé de la famille qui porte ses `variations.plural`, et l'appelle
/// bien avec `String(format:)`. La valeur était donc à la fois **cassée** et
/// **redondante**, et `LentilleConversationRow` héritait des deux : son
/// `accessibilityLabel` dérive de celui de `ThemedConversationRow`.
///
/// Le correctif retire la valeur plutôt que de lui passer un argument : la
/// dupliquer proprement ferait entendre deux fois la même information, et
/// `accessibilityValue` est réservé à l'ÉTAT d'un contrôle, pas à une donnée
/// que le nom porte déjà (HIG).
///
/// Les assertions restent **indépendantes de la locale** : le simulateur CI
/// tourne en anglais, le poste de dev souvent en français, et la clé du compte
/// est pluralisée par le catalogue — comparer une chaîne française rendrait ce
/// test vert en local et rouge en CI (piège documenté par `PostStatAccessibility`).
@MainActor
final class ConversationRowUnreadAnnouncementTests: XCTestCase {

    private func makeConversation(unreadCount: Int) -> Conversation {
        var conversation = Conversation(
            identifier: "conv-unread",
            title: "Test Conversation",
            lastMessagePreview: "Salut"
        )
        conversation.userState.unreadCount = unreadCount
        return conversation
    }

    private func label(unreadCount: Int) -> String {
        ThemedConversationRow(
            conversation: makeConversation(unreadCount: unreadCount),
            preferredContentLanguages: ["fr"]
        ).conversationAccessibilityLabel
    }

    // MARK: - L'information n'a pas été perdue avec la valeur retirée

    /// Garde de non-régression du correctif : retirer l'`accessibilityValue`
    /// ne doit pas faire disparaître le compte de l'annonce — il vient du
    /// libellé, et il doit y rester.
    func test_label_stillAnnouncesTheUnreadCount() {
        XCTAssertTrue(
            label(unreadCount: 3).contains("3"),
            "le compte de non-lus doit rester annoncé par le libellé : \(label(unreadCount: 3))"
        )
        XCTAssertTrue(label(unreadCount: 12).contains("12"))
    }

    /// Le segment « non lus » reste CONDITIONNEL : une conversation entièrement
    /// lue ne doit pas s'entendre annoncer un compte que l'écran ne montre pas.
    ///
    /// L'assertion porte sur la différence entre les deux libellés, et non sur
    /// la présence d'un chiffre : le libellé embarque aussi un horodatage
    /// relatif, qui peut lui-même contenir des chiffres.
    func test_label_addsTheUnreadSegmentOnlyWhenThereAreUnread() {
        XCTAssertNotEqual(
            label(unreadCount: 0), label(unreadCount: 4),
            "un compte non nul doit enrichir le libellé"
        )
    }

    // MARK: - Le défaut lui-même : plus aucun spécificateur dans l'annonce

    /// **Régression du défaut principal.** Avant, la rangée annonçait
    /// « %lld messages non lus » — le spécificateur brut, jamais substitué,
    /// lu à voix haute par VoiceOver.
    func test_label_neverLeaksAFormatSpecifier() {
        for count in [0, 1, 2, 3, 11, 199] {
            let value = label(unreadCount: count)
            for specifier in ["%lld", "%d", "%@", "%1$@", "%ld"] {
                XCTAssertFalse(
                    value.contains(specifier),
                    "aucun spécificateur ne doit atteindre VoiceOver (\(specifier), count=\(count)) : \(value)"
                )
            }
        }
    }

    // MARK: - Garde de source : la valeur cassée ne peut pas revenir

    /// La clé `accessibility.unread_messages` a été retirée du catalogue : la
    /// réintroduire au code ferait DÉJÀ rougir
    /// `LocalizationConsistencyTests.test_everyUsedIdentifierKeyResolvesInDevelopmentLanguage`.
    /// Cette garde-ci vise l'autre moitié du défaut — une `accessibilityValue`
    /// de non-lus reposée sur les rangées, avec n'importe quelle clé.
    func test_neitherRowCarriesAnUnreadAccessibilityValue() throws {
        for path in [
            "Meeshy/Features/Main/Views/ThemedConversationRow.swift",
            "Meeshy/Features/Main/Lentille/Row/LentilleConversationRow.swift"
        ] {
            let source = try iosSource(at: path)
            // La forme CITÉE, délibérément : les deux fichiers mentionnent la
            // clé en prose (entre accents graves) pour expliquer le défaut
            // retiré. Chercher le nom nu ferait rougir ce test sur son propre
            // commentaire ; seule une vraie référence de code est un retour.
            XCTAssertFalse(
                source.contains("\"accessibility.unread_messages\""),
                "\(path) : clé retirée du catalogue, elle ne doit plus être référencée en code"
            )
            XCTAssertFalse(
                source.contains(".accessibilityValue(conversation.userState.unreadCount"),
                "\(path) : le compte de non-lus appartient au LIBELLÉ (déjà pluralisé), "
                + "pas à une valeur qui le répéterait"
            )
        }
    }

    private func iosSource(at relativePath: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
        return try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
    }
}
