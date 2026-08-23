import XCTest
import MeeshySDK
@testable import Meeshy

/// Q-140/L16-iOS — trou découvert par la recette Q-140 (2026-08-17) : l'aria
/// iOS de la rangée Lentille n'annonçait JAMAIS le pont ✦ même quand il
/// s'affichait. RE-PREUVE avant ce lot (`git show <avant> -- LentilleConversationRow.swift`,
/// ancien :155-160) :
///
/// ```
/// private var accessibilityLabel: String {
///     ThemedConversationRow(
///         conversation: conversation,
///         preferredContentLanguages: preferredContentLanguages
///     ).conversationAccessibilityLabel
/// }
/// ```
///
/// — relais VERBATIM de `ThemedConversationRow.conversationAccessibilityLabel`,
/// un fichier qui n'a même pas connaissance du concept de pont
/// (`conversation.bridge` n'y est jamais lu). Pendant ce temps, la ligne 2
/// VISIBLE (`LentilleConversationRow.line2`, cas `.bridge`, :344-352) rend
/// `LentilleBridgeLine` dès `showsBridge` — exactement le même défaut que
/// V4ter/B1 a corrigé côté web (`LentilleRow.tsx`, commit e55961fa), en
/// miroir : là-bas l'aria retombait sur `lastMessage.content` sous
/// `hasBridge` ; ici elle retombe sur le libellé du rang historique, qui ne
/// sait composer QUE `typing > brouillon > préview` (jamais `pont`).
///
/// RED conceptuel : chacun des témoins `bridgePresent_*` ci-dessous
/// rougissait sur le code d'avant ce lot (le libellé ne contenait ni
/// "Marie" ni le compte du pont, et contenait TOUJOURS la préview
/// "Hello there" qu'il était censé remplacer).
///
/// Nommage — même discipline que `LentilleFlatRowTests` : aucun jeton
/// `Conversation` dans le nom de cette suite PURE (aucun état partagé,
/// `meeshy.sh` ~:1591, phase 1 du gate local).
@MainActor
final class LentilleFlatRowBridgeAriaTests: XCTestCase {

    // MARK: - Fabrique — même patron que `LentilleFlatRowTests`

    private static let pinnedDate = Date(timeIntervalSince1970: 1_700_000_000)

    private func makeConversation(
        type: MeeshyConversation.ConversationType = .group,
        unreadCount: Int = 0,
        bridge: ConversationBridge? = nil,
        lastMessagePreview: String? = "Hello there"
    ) -> MeeshyConversation {
        var conversation = MeeshyConversation(
            id: "conv-1",
            identifier: "conv-1",
            type: type,
            title: "Equipe Produit",
            lastMessageAt: Self.pinnedDate,
            createdAt: Self.pinnedDate,
            updatedAt: Self.pinnedDate,
            unreadCount: unreadCount,
            lastMessagePreview: lastMessagePreview
        )
        conversation.bridge = bridge
        return conversation
    }

    /// **INVARIANT RESTAURÉ le 2026-08-23.** Le lot 2 avait fait annoncer au
    /// rang plat, EN PLUS du libellé hérité, l'effectif qu'il était seul à
    /// afficher. La directive produit « l'information du nombre de membre
    /// disparaît sans magnificence » retire cette bande : l'oreille se tait
    /// avec l'œil, et l'invariant redevient celui d'avant le lot 2 — « pont
    /// absent ⇒ le libellé hérité, caractère pour caractère ».
    ///
    /// Le témoin `.direct` ci-dessous devient donc un CAS PARTICULIER du cas
    /// général : il est conservé parce qu'il nomme la conversation directe
    /// explicitement, pas parce qu'il teste une seconde règle.
    private func expectedFlatRowBaseLabel(_ conversation: MeeshyConversation) -> String {
        ThemedConversationRow(conversation: conversation).conversationAccessibilityLabel
    }

    private func makeFallbackBridge(messageCount: Int = 3, isComplete: Bool? = nil) -> ConversationBridge {
        ConversationBridge(
            kind: .fallback,
            unreadCount: 4,
            suggestedMode: .focal,
            isComplete: isComplete,
            data: ConversationBridgeData(authors: ["Marie"], extraAuthorCount: 0, messageCount: messageCount)
        )
    }

    // MARK: - Pont présent ⇒ annoncé, préview remplacée jamais annoncée

    func test_accessibilityLabel_bridgePresent_announcesBridgeText_notThePreviewItReplaces() {
        let bridge = makeFallbackBridge(messageCount: 3)
        let conversation = makeConversation(unreadCount: 4, bridge: bridge, lastMessagePreview: "Hello there")
        let row = LentilleConversationRow(conversation: conversation)

        let label = row.accessibilityLabel

        XCTAssertTrue(label.contains("Marie"), "Le libellé doit annoncer l'auteur du pont : \(label)")
        XCTAssertTrue(label.contains("3"), "Le libellé doit annoncer le compte du pont : \(label)")
        XCTAssertFalse(
            label.contains("Hello there"),
            "La préview REMPLACÉE par le pont à l'écran ne doit plus être annoncée : \(label)"
        )
    }

    /// Le libellé doit contenir EXACTEMENT ce que `LentilleBridgeLine`
    /// affiche — même résolution, jamais une seconde loi de langue (contrat
    /// §5.2, conséquence 2). Couvre aussi le suffixe de partialité
    /// (`isComplete == false`), composé identiquement des deux côtés.
    func test_accessibilityLabel_bridgePresent_matchesExactLentilleBridgeLineText() {
        let bridge = makeFallbackBridge(messageCount: 3, isComplete: false)
        let conversation = makeConversation(unreadCount: 4, bridge: bridge, lastMessagePreview: "Hello there")
        let row = LentilleConversationRow(conversation: conversation)

        let expectedBridgeText = LentilleBridgeLine.resolveAriaText(bridge: bridge, preferredLanguages: [])
        XCTAssertFalse(expectedBridgeText.isEmpty, "témoin de contrôle : la phrase attendue ne doit pas être vide")
        XCTAssertTrue(
            row.accessibilityLabel.contains(expectedBridgeText),
            "Le libellé doit contenir EXACTEMENT \"\(expectedBridgeText)\" : \(row.accessibilityLabel)"
        )
    }

    // MARK: - Pont absent ⇒ comportement inchangé au caractère près

    func test_accessibilityLabel_bridgeAbsent_isTheHistoricalLabel_characterForCharacter() {
        let conversation = makeConversation(unreadCount: 4, bridge: nil, lastMessagePreview: "Hello there")
        let row = LentilleConversationRow(conversation: conversation)

        XCTAssertEqual(row.accessibilityLabel, expectedFlatRowBaseLabel(conversation))
        XCTAssertTrue(
            row.accessibilityLabel.hasPrefix(ThemedConversationRow(conversation: conversation).conversationAccessibilityLabel),
            "le libellé hérité doit rester le PRÉFIXE exact — l'effectif s'ajoute, il ne réécrit rien"
        )
    }

    /// Le pendant `.direct` : aucun effectif à l'écran ⇒ aucun effectif dans
    /// l'oreille, et le libellé redevient celui du rang historique au
    /// caractère près.
    func test_accessibilityLabel_directConversation_announcesNoEffectif_matchesThemedRowCharacterForCharacter() {
        let conversation = makeConversation(type: .direct, unreadCount: 4, bridge: nil, lastMessagePreview: "Hello there")
        let row = LentilleConversationRow(conversation: conversation)

        XCTAssertEqual(
            row.accessibilityLabel,
            ThemedConversationRow(conversation: conversation).conversationAccessibilityLabel
        )
    }

    /// `showsBridge` exige `unreadCount > 0` (contrat §3.2) — un pont non
    /// nil sur une conversation à zéro non-lu ne doit RIEN changer au
    /// libellé, exactement comme la ligne 2 visible retombe sur la préview
    /// dans ce cas (`Line2Kind.resolve`).
    func test_accessibilityLabel_bridgeConditionUnmet_unreadCountZero_unchanged() {
        let bridge = makeFallbackBridge()
        let conversation = makeConversation(unreadCount: 0, bridge: bridge, lastMessagePreview: "Hello there")
        let row = LentilleConversationRow(conversation: conversation)

        XCTAssertEqual(row.accessibilityLabel, expectedFlatRowBaseLabel(conversation))
    }
}
