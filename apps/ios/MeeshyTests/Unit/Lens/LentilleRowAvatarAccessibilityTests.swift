import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// #15887 — l'avatar d'une ligne est, pour VoiceOver, un BOUTON À PART.
///
/// Il était fondu dans l'élément combiné de la ligne (`.combine`) : VoiceOver
/// lisait « Conversation avec X… » et le double-toucher ouvrait le fil ; le
/// profil, les détails, la story et le menu de l'avatar n'avaient aucun accès
/// non visuel. Désormais un élément frère, posé APRÈS la fusion, dit ce qu'il
/// ouvre (« Voir le profil de X », « Détails de Y »), porte le trait bouton,
/// couvre au moins 44 pt et expose les entrées de son menu en actions. La
/// ligne garde son libellé et son indice.
///
/// Aucun framework d'inspection SwiftUI n'est disponible dans ce bundle : la
/// structure (« hors fusion ») se garde par la source, le contenu par les lois.
@MainActor
final class LentilleRowAvatarAccessibilityTests: XCTestCase {

    // MARK: - Le libellé

    func test_aProfileRoute_saysItOpensThePeerProfile() {
        let label = ConversationAvatarSpeech.label(route: .profile(userId: "u2"), name: "Bob", moodEmoji: nil, isHere: false)
        XCTAssertEqual(label, String(format: String(localized: "conversation.row.avatar.a11y.profile", bundle: .main), "Bob"))
        XCTAssertTrue(label.contains("Bob"))
    }

    func test_aDetailsRoute_saysItShowsTheDetails_lockedOrNot() {
        let expected = String(format: String(localized: "conversation.row.avatar.a11y.details", bundle: .main), "Équipe")
        XCTAssertEqual(ConversationAvatarSpeech.label(route: .info, name: "Équipe", moodEmoji: nil, isHere: false), expected)
        XCTAssertEqual(ConversationAvatarSpeech.label(route: .unlockThenInfo, name: "Équipe", moodEmoji: nil, isHere: false), expected)
    }

    func test_theTwoLabels_differ() {
        XCTAssertNotEqual(
            ConversationAvatarSpeech.label(route: .profile(userId: "u2"), name: "Bob", moodEmoji: nil, isHere: false),
            ConversationAvatarSpeech.label(route: .info, name: "Bob", moodEmoji: nil, isHere: false)
        )
    }

    /// Ce que l'avatar disait de lui-même (#10528, #8892) ne se perd pas en
    /// sortant de la fusion : l'humeur et « dans la conversation » restent.
    func test_theLabel_keepsTheMoodAndTheHerePresence_spokenByTheAvatar() {
        let label = ConversationAvatarSpeech.label(route: .profile(userId: "u2"), name: "Bob", moodEmoji: "😴", isHere: true)
        XCTAssertTrue(label.contains(MeeshyAvatar.spokenName(name: "Bob", moodEmoji: "😴", isHere: true)))
    }

    // MARK: - Le menu de l'avatar

    func test_aDirectThatOpensAProfile_keepsTheProfileEntry() {
        XCTAssertEqual(ConversationAvatarMenu.roles(type: .direct, opensProfile: true, hasShareAction: true), [.conversationInfo, .profile])
    }

    /// Bloqué, compte fermé, anonyme, verrouillé : plus d'entrée « Voir le
    /// profil » qui ne mène nulle part.
    func test_aDirectWithoutAProfile_offersNoDeadProfileEntry() {
        XCTAssertEqual(ConversationAvatarMenu.roles(type: .direct, opensProfile: false, hasShareAction: true), [.conversationInfo])
    }

    func test_aGroup_keepsItsShareLink_andNeverAProfile() {
        XCTAssertEqual(ConversationAvatarMenu.roles(type: .group, opensProfile: true, hasShareAction: true), [.conversationInfo, .shareLink])
        XCTAssertEqual(ConversationAvatarMenu.roles(type: .group, opensProfile: false, hasShareAction: false), [.conversationInfo])
        XCTAssertEqual(ConversationAvatarMenu.roles(type: .community, opensProfile: false, hasShareAction: true), [.conversationInfo])
    }

    // MARK: - Les actions VoiceOver

    func test_everyMenuEntry_isAnAction_plusTheStoryWhenThereIsOne() {
        XCTAssertEqual(
            ConversationAvatarSpeech.actions(roles: [.conversationInfo, .profile], hasStory: true),
            [.menu(.conversationInfo), .menu(.profile), .viewStory]
        )
        XCTAssertEqual(ConversationAvatarSpeech.actions(roles: [.conversationInfo], hasStory: false), [.menu(.conversationInfo)])
    }

    func test_everyAction_hasANameToSpeak() {
        let actions: [ConversationAvatarA11yAction] = [.menu(.conversationInfo), .menu(.profile), .menu(.shareLink), .viewStory]
        XCTAssertTrue(actions.allSatisfy { !$0.name.isEmpty })
        XCTAssertEqual(Set(actions.map(\.name)).count, actions.count)
    }

    // MARK: - La cible

    func test_theProxy_coversAtLeastATouchTarget_onBothRows() {
        XCTAssertGreaterThanOrEqual(ConversationRowMetrics.avatarBandWidth(isLentille: true), MeeshyControlSize.tapTarget)
        XCTAssertGreaterThanOrEqual(ConversationRowMetrics.avatarBandWidth(isLentille: false), MeeshyControlSize.tapTarget)
    }

    // MARK: - Hors fusion (garde de source)

    /// L'élément de l'avatar est posé sur la RACINE de la ligne, après toute la
    /// chaîne d'accessibilité de ses deux branches : un modificateur posé plus
    /// bas (indice, action par défaut « ouvrir ») s'appliquerait sinon à lui.
    func test_theAvatarElement_isASiblingOfTheCombinedRow_neverInsideIt() throws {
        let code = normalizedCode(try source(at: "Meeshy/Features/Main/Views/ConversationListView+Rows.swift"))
        let proxy = try XCTUnwrap(code.range(of: ".overlay(alignment: .leading) { avatarAccessibilityProxy }"))
        for rowModifier in [".accessibilityElement(children: .combine)", ".accessibilityHint(", ".accessibilityAction", ".contextMenu"] {
            let last = try XCTUnwrap(code.range(of: rowModifier, options: .backwards), rowModifier)
            XCTAssertLessThan(last.upperBound, proxy.lowerBound, "\(rowModifier) doit rester sur la ligne, avant l'élément de l'avatar")
        }
        XCTAssertEqual(occurrences(of: "avatarAccessibilityProxy }", in: code), 1, "un seul élément, posé sur la racine des deux branches")
    }

    func test_theProxy_isAButton_thatLetsTouchesThrough_andExposesItsActions() throws {
        let code = normalizedCode(try source(at: "Meeshy/Features/Main/Views/ConversationRowAvatarAccessibility.swift"))
        XCTAssertTrue(code.contains(".allowsHitTesting(false)"), "le doigt atteint l'avatar dessous : story, profil, humeur, menu")
        XCTAssertTrue(code.contains(".accessibilityAddTraits(.isButton)"))
        XCTAssertTrue(code.contains(".accessibilityActions {"))
    }

    /// L'avatar dessiné sort de la fusion de la ligne : son action par défaut
    /// ne s'y fond plus, et VoiceOver ne l'annonce pas deux fois.
    func test_bothRowAvatars_areHiddenFromVoiceOver_theProxySpeaksForThem() throws {
        for path in [
            "Meeshy/Features/Main/Views/ThemedConversationRow.swift",
            "Meeshy/Features/Lens/Row/LentilleConversationRow.swift",
        ] {
            let code = normalizedCode(try source(at: path))
            XCTAssertTrue(code.contains(".accessibilityHidden(true)"), path)
            XCTAssertTrue(code.contains("onTap: avatarRoute.opensProfile ? onViewProfile : onViewConversationInfo"), path)
            XCTAssertFalse(code.contains("onTap: isDirect ? onViewProfile : onViewConversationInfo"), "\(path) : le toucher d'avatar suit la loi, jamais le seul type")
        }
    }

    // MARK: - Outils

    private func source(at relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // .../Unit/Lens
            .deletingLastPathComponent() // .../Unit
            .deletingLastPathComponent() // .../MeeshyTests
            .deletingLastPathComponent() // .../apps/ios
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func normalizedCode(_ source: String) -> String {
        AppSourceGuard.stripComments(source)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }
}
