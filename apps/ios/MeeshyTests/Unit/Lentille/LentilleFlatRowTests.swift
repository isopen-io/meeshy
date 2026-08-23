import XCTest
import MeeshySDK
@testable import Meeshy

/// Tests MINIMAUX embarqués de `LentilleConversationRow` (contrat LWS-7,
/// workshop I-065). Les suites COMPLÈTES (`LentilleRowEquatableTests`,
/// `LentilleRowPrismeTests`, `LentilleRowSourceGuardTests`,
/// `LentilleSkeletonGeometryTests` — noms cités par le contrat §LWS-7)
/// arrivent avec I-068 : ce fichier couvre les trois critères que la tâche
/// I-065 demande d'embarquer dès ce commit — précédence de ligne 2, `==`
/// étendu au champ `bridge`, absence de badge chiffré — sans préempter les
/// fichiers nommés par le contrat.
///
/// Nommage — même règle que `LentilleMetricsTests`/`BridgeFingerprintTests` :
/// aucun jeton `FINAL_PHASE_CLASS_PATTERN` (`meeshy.sh` ~:1591, qui inclut
/// `Conversation`) dans le nom de cette suite PURE (aucun état partagé,
/// aucun singleton touché) — `LentilleFlatRowTests`, pas
/// `LentilleConversationRowTests`, pour rester en phase 1 du gate local.
@MainActor
final class LentilleFlatRowTests: XCTestCase {

    // MARK: - Fabrique

    /// Date FIXE — `MeeshyConversation.init` défaute `lastMessageAt` à
    /// `Date()`, replié dans `renderFingerprint` : deux instances construites
    /// séparément sans épinglage diffèrent toujours, et un
    /// `XCTAssertNotEqual` entre elles ne prouverait rien (même piège que
    /// `BridgeFingerprintTests`).
    private static let pinnedDate = Date(timeIntervalSince1970: 1_700_000_000)

    private func makeConversation(
        id: String = "conv-1",
        unreadCount: Int = 0,
        bridge: ConversationBridge? = nil,
        isMuted: Bool = false
    ) -> MeeshyConversation {
        var conversation = MeeshyConversation(
            id: id,
            identifier: id,
            type: .group,
            title: "Equipe Produit",
            lastMessageAt: Self.pinnedDate,
            createdAt: Self.pinnedDate,
            updatedAt: Self.pinnedDate,
            unreadCount: unreadCount,
            lastMessagePreview: "Hello",
            isMuted: isMuted
        )
        conversation.bridge = bridge
        return conversation
    }

    private func makeFallbackBridge(unreadCount: Int = 4) -> ConversationBridge {
        ConversationBridge(
            kind: .fallback,
            unreadCount: unreadCount,
            suggestedMode: .focal,
            data: ConversationBridgeData(authors: ["Marie"], extraAuthorCount: 0, messageCount: 3)
        )
    }

    // MARK: - Précédence de ligne 2 (contrat §LWS-7 : typing > brouillon > pont > préview)
    // behaviour-matrix:L02 — précédence typing > brouillon > pont > préview,
    // couverte par les quatre témoins ci-dessous.

    func test_line2Kind_typing_beatsEverything() {
        XCTAssertEqual(
            LentilleConversationRow.Line2Kind.resolve(hasTyping: true, hasDraft: true, showsBridge: true),
            .typing
        )
    }

    func test_line2Kind_draft_beatsBridgeAndPreview() {
        XCTAssertEqual(
            LentilleConversationRow.Line2Kind.resolve(hasTyping: false, hasDraft: true, showsBridge: true),
            .draft
        )
    }

    func test_line2Kind_bridge_beatsPreview() {
        XCTAssertEqual(
            LentilleConversationRow.Line2Kind.resolve(hasTyping: false, hasDraft: false, showsBridge: true),
            .bridge
        )
    }

    func test_line2Kind_preview_whenNothingElse() {
        XCTAssertEqual(
            LentilleConversationRow.Line2Kind.resolve(hasTyping: false, hasDraft: false, showsBridge: false),
            .preview
        )
    }

    // MARK: - Pont ✦ — condition d'apparition (contrat §3.2/§LWS-7)

    func test_showsBridge_requiresBothUnreadCountAndBridge() {
        let bridge = makeFallbackBridge()
        XCTAssertTrue(LentilleConversationRow.showsBridge(unreadCount: 4, bridge: bridge))
        XCTAssertFalse(LentilleConversationRow.showsBridge(unreadCount: 0, bridge: bridge), "unreadCount == 0 ⇒ jamais de pont, même si bridge != nil")
        XCTAssertFalse(LentilleConversationRow.showsBridge(unreadCount: 4, bridge: nil), "bridge == nil ⇒ jamais de pont, même si unreadCount > 0")
        XCTAssertFalse(LentilleConversationRow.showsBridge(unreadCount: 0, bridge: nil))
    }

    // MARK: - `==` — COPIÉ depuis `ThemedConversationRow.==` puis ÉTENDU au bridge

    /// Le critère explicite de la tâche : « deux valeurs de pont ⇒ non
    /// égaux ». `renderFingerprint` (SDK, C-029) replie déjà `bridge` en
    /// entier, donc les deux mécanismes (fingerprint ET comparaison directe)
    /// s'accordent ici — ce que ce témoin verrouille est le RÉSULTAT exigé
    /// par le contrat, pas l'isolation de l'un par rapport à l'autre (la
    /// suite complète I-068, `LentilleRowEquatableTests`, creuse cette
    /// distinction).
    func test_equatable_differentBridgeValues_areNotEqual() {
        let a = LentilleConversationRow(
            conversation: makeConversation(unreadCount: 4, bridge: makeFallbackBridge(unreadCount: 4))
        )
        let b = LentilleConversationRow(
            conversation: makeConversation(unreadCount: 4, bridge: makeFallbackBridge(unreadCount: 7))
        )
        XCTAssertNotEqual(a, b)
        XCTAssertNotEqual(a.conversation.bridge, b.conversation.bridge, "témoin de contrôle : les deux ponts doivent bien différer")
    }

    /// Pendant non-discriminant : deux rangs construits avec les MÊMES
    /// entrées (même conversation, même pont) sont égaux — sans ce témoin,
    /// le précédent serait vacuoirement vert (portillon « toujours faux »).
    func test_equatable_identicalInputs_areEqual() {
        let conversation = makeConversation(unreadCount: 4, bridge: makeFallbackBridge(unreadCount: 4))
        let a = LentilleConversationRow(conversation: conversation)
        let b = LentilleConversationRow(conversation: conversation)
        XCTAssertEqual(a, b)
    }

    /// Un pont qui APPARAÎT (nil → non-nil) sur une conversation par ailleurs
    /// identique doit rouvrir le portillon — le cas qu'une comparaison
    /// sous-large (oubliant `bridge`) laisserait passer.
    func test_equatable_bridgeAppears_areNotEqual() {
        let withoutBridge = LentilleConversationRow(conversation: makeConversation(unreadCount: 4))
        let withBridge = LentilleConversationRow(
            conversation: makeConversation(unreadCount: 4, bridge: makeFallbackBridge(unreadCount: 4))
        )
        XCTAssertNotEqual(withoutBridge, withBridge)
    }

    // MARK: - Sourdine — opacité dérivée de la métrique (contrat §4.3, pas un littéral)

    func test_rowOpacity_muted_usesMetricNotLiteral() {
        XCTAssertEqual(
            LentilleConversationRow.rowOpacity(isMuted: true, isDragging: false),
            LentilleMetrics.Muted.opacity
        )
    }

    func test_rowOpacity_unmuted_notDragging_isFullyOpaque() {
        XCTAssertEqual(LentilleConversationRow.rowOpacity(isMuted: false, isDragging: false), 1.0)
    }

    // MARK: - Aucun badge chiffré (garde source, contrat §LWS-7)
    // behaviour-matrix:L06 — « le badge rouge 99+ (unreadBadgeBackground) …
    // sont supprimés » : ce témoin verrouille le RETRAIT du badge. Le point
    // accent 8 px et le pont ✦ qui le remplacent sont verrouillés par
    // LentilleMetricsTests.test_unreadDot_size et
    // LentilleRowSourceGuardTests.test_bridgeLine_unreadDot_usesMetric_notALiteral.
    // Le second volet de L06 (« le timestamp rouge sur non-lu … supprimé,
    // l'heure reste tertiaire ») est, lui aussi, fermé (REV-3/V3ter) et
    // verrouillé VERT par
    // LentilleRowBehaviourAnchorTests.test_L06_timestampColor_isTertiary_neverErrorOnUnread.

    /// **SUPERSÉDÉ le 2026-08-22** (décision produit : « mettre le chip rouge
    /// si messages non lus » sur les rangées non magnifiées) — voir la note
    /// détaillée de `LentilleRowSourceGuardTests
    /// .test_unreadBadge_livesOnlyInTheRow_andIsAlwaysSemanticRed`. Ce qui
    /// reste vrai, et que ce témoin continue de garder : ni le pont ✦ ni le
    /// squelette ne portent de badge.
    func test_sourceGuard_neitherBridgeNorSkeleton_carriesAnUnreadBadge() throws {
        for relativePath in [
            "Meeshy/Features/Main/Lentille/Row/LentilleBridgeLine.swift",
            "Meeshy/Features/Main/Lentille/Row/LentilleSkeletonRow.swift",
        ] {
            let source = try readSource(relativePath)
            XCTAssertFalse(
                source.contains("unreadBadgeBackground"),
                "\(relativePath) ne compte rien : le pont porte son point accent, le squelette est un placeholder"
            )
        }
    }

    // MARK: - Aiguille

    private func readSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // .../Unit/Lentille
            .deletingLastPathComponent() // .../Unit
            .deletingLastPathComponent() // .../MeeshyTests
            .deletingLastPathComponent() // .../apps/ios
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }
}
