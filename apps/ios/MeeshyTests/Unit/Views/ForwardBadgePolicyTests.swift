import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// Règle produit du badge « Transféré » (spec 2026-08-19, Volet C.1) : le nom
/// de la conversation source s'affiche pour tout GROUPE, jamais pour un
/// tête-à-tête (`direct`, `bot`). Un type inconnu (cache antérieur au champ)
/// garde le statu quo : nom affiché s'il existe.
/// RÈGLE JUMELLE : apps/web/lib/forward-badge.ts (mêmes cas).
@MainActor
final class ForwardBadgePolicyTests: XCTestCase {

    private func ref(name: String? = "Équipe Design", type: String?) -> ForwardReference {
        ForwardReference(
            originalMessageId: "fm1", senderName: "Diana", previewText: "…",
            conversationId: "conv5", conversationName: name, conversationType: type
        )
    }

    func test_groupTypes_showTheName() {
        for type in ["group", "public", "global", "community", "channel", "broadcast"] {
            XCTAssertEqual(
                ForwardBadgePolicy.conversationName(for: ref(type: type)), "Équipe Design",
                "le nom d'un groupe (\(type)) est GARANTI au badge"
            )
        }
    }

    func test_directAndBot_hideTheName() {
        for type in ["direct", "bot"] {
            XCTAssertNil(
                ForwardBadgePolicy.conversationName(for: ref(type: type)),
                "un tête-à-tête (\(type)) reste anonyme — confidentialité"
            )
        }
    }

    func test_unknownType_keepsStatusQuo_nameShown() {
        XCTAssertEqual(ForwardBadgePolicy.conversationName(for: ref(type: nil)), "Équipe Design",
                       "cache antérieur au champ type : comportement historique conservé")
    }

    func test_missingReferenceOrName_yieldsNil() {
        XCTAssertNil(ForwardBadgePolicy.conversationName(for: nil))
        XCTAssertNil(ForwardBadgePolicy.conversationName(for: ref(name: nil, type: "group")))
        XCTAssertNil(ForwardBadgePolicy.conversationName(for: ref(name: "", type: "group")))
    }
}
