import XCTest
@testable import Meeshy
import MeeshySDK

/// **Toucher une entrée de la pastille mène TOUJOURS quelque part** (#15741).
///
/// Avant la loi, deux `switch source` jumeaux (`RootView`, `iPadRootView+Navigation`)
/// répondaient « rien » pour une conversation hors cache, pour une story et pour
/// une source inconnue : le doigt touchait, rien ne bougeait, et la rotation ne
/// avançait même pas. La décision vit désormais dans `SyncPillDestination` — une
/// loi PURE que les deux racines appliquent — et la pastille avance quand la
/// racine n'a RIEN ouvert.
final class SyncPillDestinationTests: XCTestCase {

    func test_resolve_conversationInCache_opensItWithAnchor() {
        XCTAssertEqual(
            SyncPillDestination.resolve(source: .conversation(id: "c1", messageId: "m1"),
                                        knownConversationIds: ["c1"], currentUserId: "u1"),
            .openConversation(id: "c1", highlightMessageId: "m1"))
    }

    func test_resolve_conversationInCacheWithoutAnchor_keepsNilAnchor() {
        XCTAssertEqual(
            SyncPillDestination.resolve(source: .conversation(id: "c1", messageId: nil),
                                        knownConversationIds: ["c1"], currentUserId: "u1"),
            .openConversation(id: "c1", highlightMessageId: nil))
    }

    func test_resolve_conversationNotInCache_opensById() {
        XCTAssertEqual(
            SyncPillDestination.resolve(source: .conversation(id: "c2", messageId: "m2"),
                                        knownConversationIds: ["c1"], currentUserId: "u1"),
            .openConversationById(id: "c2", highlightMessageId: "m2"))
    }

    func test_resolve_emptyConversationId_returnsNone() {
        XCTAssertEqual(
            SyncPillDestination.resolve(source: .conversation(id: "", messageId: "m1"),
                                        knownConversationIds: ["c1"], currentUserId: "u1"),
            .none)
    }

    func test_resolve_post_opensPost() {
        XCTAssertEqual(
            SyncPillDestination.resolve(source: .post(id: "p1"),
                                        knownConversationIds: [], currentUserId: "u1"),
            .openPost(id: "p1"))
    }

    func test_resolve_story_opensOwnStories() {
        XCTAssertEqual(
            SyncPillDestination.resolve(source: .story(id: "s1"),
                                        knownConversationIds: [], currentUserId: "u1"),
            .openOwnStories(userId: "u1"))
    }

    func test_resolve_storyWithoutCurrentUser_returnsNone() {
        XCTAssertEqual(
            SyncPillDestination.resolve(source: .story(id: "s1"),
                                        knownConversationIds: [], currentUserId: nil),
            .none)
        XCTAssertEqual(
            SyncPillDestination.resolve(source: .story(id: "s1"),
                                        knownConversationIds: [], currentUserId: ""),
            .none)
    }

    func test_resolve_unknown_returnsNone() {
        XCTAssertEqual(
            SyncPillDestination.resolve(source: .unknown,
                                        knownConversationIds: ["c1"], currentUserId: "u1"),
            .none)
    }
}

/// Les deux racines appliquent LA loi, et la pastille avance quand le toucher
/// ne mène nulle part — sans quoi la loi serait juste et le toucher resterait mort.
@MainActor
final class SyncPillDestinationWiringTests: XCTestCase {

    private static let hotes = [
        "Meeshy/Features/Main/Views/RootView.swift",
        "Meeshy/Features/Main/Views/iPadRootView+Navigation.swift"
    ]

    private func corps(ofHandlerIn path: String) throws -> String {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
        guard let start = code.range(of: "func handleSyncPillTap(_ source: OutboxUIItem.Source)") else {
            XCTFail("\(path) : handleSyncPillTap introuvable — le témoin ne mesure plus rien")
            return ""
        }
        return String(code[start.lowerBound...])
    }

    func test_lesDeuxRacinesAppliquentLaLoi() throws {
        for hote in Self.hotes {
            let corps = try corps(ofHandlerIn: hote)
            XCTAssertTrue(corps.contains("SyncPillDestination.resolve("),
                          "\(hote) : la décision doit sortir de la loi unique")
            XCTAssertTrue(corps.hasPrefix("func handleSyncPillTap(_ source: OutboxUIItem.Source) -> Bool"),
                          "\(hote) : le handler doit dire s'il a ouvert quelque chose")
        }
    }

    func test_plusDeSwitchSurLaSourceNiDeNoOpDansLesRacines() throws {
        for hote in Self.hotes {
            let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(hote))
            XCTAssertFalse(code.contains("switch source"), "\(hote) : le switch jumeau est revenu")
            XCTAssertFalse(code.contains("not yet supported"), "\(hote) : la story est de nouveau un no-op")
            XCTAssertFalse(code.contains("not in cache, skipping"),
                           "\(hote) : une conversation hors cache est de nouveau abandonnée")
        }
    }

    func test_laPastilleAvanceQuandLeToucherNeMeneNullePart() throws {
        let pastille = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Components/SyncPill.swift"))
        XCTAssertTrue(pastille.contains("guard let onTap, onTap(source) else { return rotator.advance() }"),
                      "Un toucher que la racine n'honore pas doit au moins avancer la rotation.")
    }
}

/// Une entrée dont la source est `.unknown` n'a AUCUNE destination : elle ne
/// doit pas promettre à VoiceOver « ouvrir l'emplacement de l'opération » pour
/// ne faire, au toucher, qu'avancer la rotation. L'indice et l'action lisent la
/// même règle (`tapOutcome`) : la rendre honnête rend les deux honnêtes.
@MainActor
final class SyncPillUnknownSourceTapTests: XCTestCase {

    private func entree(source: OutboxUIItem.Source?) -> SyncPillEntry {
        SyncPillEntry(id: "e", label: "Story en cours d'envoi", iconName: nil, dotStyle: .error,
                      source: source, showsActivityDots: false)
    }

    func test_tapOutcome_unknownSource_advancesWithoutPromisingANavigation() {
        XCTAssertEqual(entree(source: .unknown).tapOutcome, .advance)
    }

    func test_tapOutcome_storySource_stillNavigates() {
        XCTAssertEqual(entree(source: .story(id: "s1")).tapOutcome, .navigate(.story(id: "s1")))
    }
}
