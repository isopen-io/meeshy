import XCTest
import MeeshySDK
@testable import Meeshy

/// #7365 — la fiche « Vu par » (`MessageViewsDetailView.deliveryStatusLevel`)
/// lisait `message.deliveryStatus` BRUT, qui vaut `.read` dès qu'UN
/// destinataire sur N a lu (`readCount > 0`, `MessageRecord+ToMessage.swift`).
/// Le badge affichait donc « Lu » (vert) pour 1 lecteur sur 10.
///
/// `DeliveryStatusResolver` existe déjà (SDK, testé) et applique la règle
/// tout-ou-rien pour un groupe. `MessageViewsReadStatusRules.deliveryStatusLevel`
/// est le site qui le branche à la fiche — testable sans monter SwiftUI,
/// même patron que `shouldFetch`/`showsSpinner` dans ce même fichier de
/// règles pures.
@MainActor
final class MessageViewsReadStatusRulesDeliveryLevelTests: XCTestCase {

    /// Le témoin du critère de fin : 1 lecteur sur 10 dans un groupe ne doit
    /// JAMAIS produire le niveau 3 (« Lu »).
    func test_deliveryStatusLevel_oneReaderOfTen_isNotRead() {
        let message = makeMessage(deliveryStatus: .read, readCount: 1, recipientCount: 10)

        let level = MessageViewsReadStatusRules.deliveryStatusLevel(for: message)

        XCTAssertNotEqual(level, 3, "1 lecteur sur 10 ne doit pas afficher « Lu ».")
    }

    /// Symétrique positif : les 10 destinataires ont lu ⇒ « Lu ».
    func test_deliveryStatusLevel_allTenRead_isRead() {
        let message = makeMessage(deliveryStatus: .read, readCount: 10, recipientCount: 10)

        XCTAssertEqual(MessageViewsReadStatusRules.deliveryStatusLevel(for: message), 3)
    }

    /// Un groupe où 3 des 10 destinataires ont reçu (aucun n'a lu) affiche
    /// « Distribué », pas « Envoyé » ni « Lu ».
    func test_deliveryStatusLevel_partialGroupDelivery_isDelivered() {
        let message = makeMessage(deliveryStatus: .delivered, deliveredCount: 10, readCount: 0, recipientCount: 10)

        XCTAssertEqual(MessageViewsReadStatusRules.deliveryStatusLevel(for: message), 2)
    }

    /// Conversation directe (`recipientCount <= 1`) : le statut brut reste
    /// fiable tel quel — pas de dégradation.
    func test_deliveryStatusLevel_directConversation_trustsStoredStatus() {
        let message = makeMessage(deliveryStatus: .read, readCount: 1, recipientCount: 1)

        XCTAssertEqual(MessageViewsReadStatusRules.deliveryStatusLevel(for: message), 3)
    }

    /// Échec d'envoi : niveau -1, indépendant des compteurs.
    func test_deliveryStatusLevel_failed_isMinusOne() {
        let message = makeMessage(deliveryStatus: .failed, readCount: 0, recipientCount: 10)

        XCTAssertEqual(MessageViewsReadStatusRules.deliveryStatusLevel(for: message), -1)
    }

    // MARK: - Helpers

    private func makeMessage(
        deliveryStatus: MeeshyMessage.DeliveryStatus,
        deliveredCount: Int = 0,
        readCount: Int,
        recipientCount: Int
    ) -> MeeshyMessage {
        MeeshyMessage(
            conversationId: "c1",
            content: "Salut",
            deliveryStatus: deliveryStatus,
            isMe: true,
            deliveredCount: deliveredCount,
            readCount: readCount,
            recipientCount: recipientCount
        )
    }
}
