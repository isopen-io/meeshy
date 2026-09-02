import XCTest
@testable import Meeshy

/// Scène de la liste (2026-08-21, directive user) : perspective et carte de
/// focus pendant le défilement seulement, à plat `restDelay` après la pose ;
/// bande de focus au centre, remontée vers la première conversation au repos
/// en haut ; accès rapides en queue de liste et en état vide.
@MainActor
final class LentilleSceneActivityTests: XCTestCase {

    // MARK: - Fondu vers l'identité

    func test_blend_atLevelZero_isIdentity_whateverTheLaw() {
        let law = FocalFocusCurve.Result(alpha: 0.4, scale: 0.9)
        let rest = LentilleSceneActivity.blend(law, level: 0)
        XCTAssertEqual(rest.alpha, 1, accuracy: 0.0001)
        XCTAssertEqual(rest.scale, 1, accuracy: 0.0001)
    }

    func test_blend_atLevelOne_isTheLaw_andLinearBetween() {
        let law = FocalFocusCurve.Result(alpha: 0.4, scale: 0.9)
        XCTAssertEqual(LentilleSceneActivity.blend(law, level: 1), law)
        let half = LentilleSceneActivity.blend(law, level: 0.5)
        XCTAssertEqual(half.alpha, 0.7, accuracy: 0.0001)
        XCTAssertEqual(half.scale, 0.95, accuracy: 0.0001)
        XCTAssertEqual(LentilleSceneActivity.blend(law, level: 3), law, "borné à 1")
        XCTAssertEqual(LentilleSceneActivity.blend(law, level: -1).alpha, 1, accuracy: 0.0001, "borné à 0")
    }

    // MARK: - Signe du relais

    /// Le relais publie le `minY` de la sentinelle (négatif en descendant) ;
    /// la bande et la scène raisonnent en distance parcourue depuis le haut.
    func test_offsetFromTop_flipsTheRelaySign_once_forEveryone() {
        XCTAssertEqual(LentilleFocusBand.offsetFromTop(relayOffset: -120), 120)
        XCTAssertEqual(LentilleFocusBand.offsetFromTop(relayOffset: 0), 0)
        XCTAssertEqual(LentilleFocusBand.offsetFromTop(relayOffset: 40), -40, "rebond au-dessus du haut : négatif, la bande reste bornée au bord haut")
    }

    func test_hosts_convertTheRelayOffset_throughTheSharedHelper() throws {
        let election = try normalized("Meeshy/Features/Main/Lentille/Perspective/LentilleFocusElectionHost.swift")
        XCTAssertEqual(election.components(separatedBy: "LentilleFocusBand.offsetFromTop(relayOffset:").count - 1, 2,
                       "L'élection convertit le relais (amorçage + tick) par l'aide partagée — jamais un signe local.")
        let scene = try normalized("Meeshy/Features/Main/Lentille/Perspective/LentilleSceneActivity.swift")
        XCTAssertTrue(scene.contains("scene.noteScroll(offset: LentilleFocusBand.offsetFromTop(relayOffset: offset))"))
    }

    // MARK: - Activité

    func test_scene_startsFlat_activatesOnTheFirstTick_andKeepsTheOffsetInert() {
        let scene = LentilleSceneActivity()
        XCTAssertEqual(scene.level, 0, "au repos : à plat")
        XCTAssertEqual(scene.offset, 0)
        scene.noteScroll(offset: 42)
        XCTAssertEqual(scene.level, 1, "premier tick : la scène s'active")
        XCTAssertEqual(scene.offset, 42, "l'offset est noté (boîte inerte relue par frame)")
        scene.noteScroll(offset: 84)
        XCTAssertEqual(scene.level, 1)
        XCTAssertEqual(scene.offset, 84)
    }

    func test_scene_flattensBackToZero_andFlattenIsIdempotent() {
        let scene = LentilleSceneActivity()
        scene.noteScroll(offset: 10)
        scene.flatten()
        XCTAssertEqual(scene.level, 0)
        scene.flatten()
        XCTAssertEqual(scene.level, 0)
    }

    func test_scene_flattensOnItsOwn_restDelayAfterTheLastTick() async throws {
        let scene = LentilleSceneActivity()
        scene.noteScroll(offset: 10)
        XCTAssertEqual(scene.level, 1)
        // Juste avant `restDelay` : toujours active.
        try await Task.sleep(for: .seconds(FocalMetrics.Scene.restDelay * 0.5))
        XCTAssertEqual(scene.level, 1, "avant le délai de repos : la scène tient")
        try await Task.sleep(for: .seconds(FocalMetrics.Scene.restDelay * 0.7))
        XCTAssertEqual(scene.level, 0, "après le délai de repos : à plat, sans geste")
    }

    // MARK: - Structure : la liste monte la scène, la carte et les accès rapides

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    }

    private func normalized(_ relativePath: String) throws -> String {
        let raw = try String(contentsOf: Self.iosRoot.appendingPathComponent(relativePath), encoding: .utf8)
        return AppSourceGuard.stripComments(raw)
            .components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
    }

    func test_list_mountsTheSceneHostOnce_behindTheFlag_andSharesTheSceneWithRowsAndCard() throws {
        let code = try normalized("Meeshy/Features/Main/Views/ConversationListView.swift")
        XCTAssertEqual(code.components(separatedBy: "LentilleSceneActivityHost(").count - 1, 1,
                       "UN seul hôte d'activité, abonné au relais existant — jamais un second détecteur.")
        let overlayStart = try XCTUnwrap(code.range(of: "private var lentilleFocusElectionOverlay: some View { if LentilleFeatureFlag.isLentilleListEnabled { LentilleFocusElectionHost("))
        let overlayEnd = try XCTUnwrap(code.range(of: "private var mainContentZStack"))
        let overlay = code[overlayStart.lowerBound..<overlayEnd.lowerBound]
        XCTAssertTrue(overlay.contains("LentilleSceneActivityHost(relay: scrollOffsetRelay, scene: sceneActivity)"),
                      "L'hôte vit derrière le drapeau, dans l'overlay d'élection, à côté de l'élection et de la carte.")
        XCTAssertTrue(code.contains(".environmentObject(sceneActivity)"),
                      "La scène est partagée par l'environnement : rangées (perspective) et hôte de la carte la lisent.")
    }

    func test_perspectiveAndCard_readTheSceneLevel() throws {
        let perspective = try normalized("Meeshy/Features/Main/Lentille/Perspective/LentillePerspective.swift")
        XCTAssertTrue(perspective.contains("@EnvironmentObject private var scene: LentilleSceneActivity"))
        XCTAssertTrue(perspective.contains("level: level, reduceMotion: reduceMotion)"),
                      "La pose de rangée est fondue par le niveau de scène.")
        // 2026-08-23 — la carte de focus a été DISSOUTE : la magnification
        // vit dans la rangée. Le niveau de scène garde exactement le même
        // rôle, au même endroit dans la chaîne : c'est lui qui décide que la
        // magnification n'existe que pendant le défilement. Ce témoin atteste
        // le NOUVEAU porteur plutôt que de disparaître avec l'ancien.
        let gate = try normalized("Meeshy/Features/Main/Lentille/Mode/LentilleMagnification.swift")
        XCTAssertTrue(gate.contains("@ObservedObject var scene: LentilleSceneActivity"))
        XCTAssertTrue(gate.contains("scene.level > 0 && election.electedId == conversationId"),
                      "La magnification n'existe que pendant le défilement : le niveau de scène la porte.")
    }

    func test_quickActions_areTheListTail_andTheEmptyState_behindTheFlag() throws {
        let code = try normalized("Meeshy/Features/Main/Views/ConversationListView.swift")
        // **Le compte voyage jusqu'aux DEUX montages** (directive porteur
        // 2026-09-01). La queue de liste passe le compte RÉEL — c'est lui qui
        // décide des trois grands boutons jusqu'à dix conversations ; l'état
        // vide passe zéro, écrit plutôt que sous-entendu.
        XCTAssertTrue(code.contains("quickActions(isEmptyState: false, conversationCount: conversationViewModel.conversations.count, minHeight: listTailMinHeight)"),
                      "La queue de liste = les accès rapides, hauts d'une demi-région visible, et le "
                          + "compte RÉEL — sans lui, le seuil de démarrage ne pourrait jamais tomber.")
        XCTAssertTrue(code.contains("if LentilleFeatureFlag.isLentilleListEnabled { quickActions(isEmptyState: true, conversationCount: 0) }"),
                      "L'état vide = les mêmes accès rapides.")
        XCTAssertEqual(code.components(separatedBy: "ConversationListQuickActions(").count - 1, 1,
                       "Une seule fabrique, deux montages : zéro divergence entre queue et état vide.")
        for door in ["case .findMembers: router.push(.peopleDiscovery(.discover))", "case .myContacts: router.push(.contacts(.contacts))",
                     "case .myAffiliates: router.push(.affiliate)",
                     "case .newMessage: onNewConversation?()", "case .story: storyViewModel.showStoryComposer = true",
                     "case .mood: showStatusComposer = true", "case .post: router.pendingOpenFeedComposer = true",
                     "case .invite: showCreateAffiliate = true", "case .shortcutLink: showCreateTrackingLink = true"] {
            XCTAssertTrue(code.contains(door), "Chaque accès rapide route vers une porte EXISTANTE : \(door)")
        }
    }

    func test_quickActionsView_exposesTheNineDoors_inOrder_heroesFirst() {
        XCTAssertEqual(
            ConversationListQuickActions.Action.allCases,
            [.findMembers, .myContacts, .myAffiliates, .newMessage, .story, .mood, .post, .invite, .shortcutLink]
        )
        // Tant qu'on DÉMARRE, les trois héros sortent de la grille (gros
        // boutons) ; passé le seuil, tout le monde redevient une tuile.
        //
        // Le paramètre s'appelait `isEmptyState` — il ne le peut plus depuis la
        // directive du 2026-09-01 : ce n'est pas le VIDE qui décide mais le
        // DÉMARRAGE, jusqu'à dix conversations (`ConversationListQuickActions
        // .showsHeroes(conversationCount:)`, éprouvé par
        // `ConversationListHeroThresholdTests`).
        XCTAssertEqual(ConversationListQuickActions.Action.heroes, [.findMembers, .myContacts, .myAffiliates])
        XCTAssertEqual(
            ConversationListQuickActions.Action.tiles(showsHeroes: true),
            [.newMessage, .story, .mood, .post, .invite, .shortcutLink]
        )
        XCTAssertEqual(ConversationListQuickActions.Action.tiles(showsHeroes: false), ConversationListQuickActions.Action.allCases)
        for action in ConversationListQuickActions.Action.allCases {
            XCTAssertFalse(action.title.isEmpty)
            XCTAssertFalse(action.icon.isEmpty)
        }
    }
}
