import XCTest
@testable import Meeshy

/// Garde de STRUCTURE sur le mux de rang (contrat LWS-7, workshop I-067) —
/// aucun framework d'inspection SwiftUI n'est disponible dans ce bundle,
/// donc un test de rendu ne pourrait pas distinguer « `ThemedConversationRow`
/// choisi parce que le drapeau vaut `false` » de « `ThemedConversationRow`
/// choisi par accident » ; la garde de source, sur du code normalisé
/// (commentaires retirés, espaces réduits), est le témoin honnête pour une
/// FORME de code — exactement le patron de `StickySectionStructureTests`.
///
/// Critère de la tâche : « drapeau OFF ⇒ chemin historique ». Vérifie aussi
/// que le mux reste ISOLÉ dans `rowCore` — `SwipeableRow`, les deux chemins
/// de menu contextuel OS et le portillon `.equatable()` de
/// `ConversationRowItem` (`extension ConversationRowItem: @MainActor
/// Equatable`) sont INCHANGÉS autour de ce point.
///
/// Suite complète : I-068.
final class LentilleRowMuxSourceGuardTests: XCTestCase {

    private func rowsSource() throws -> String {
        try source(at: "Meeshy/Features/Main/Views/ConversationListView+Rows.swift")
    }

    private func source(at relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // .../Unit/Lentille
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

    // MARK: - Le mux existe, gardé par LE drapeau Lentille

    func test_rowCore_isGatedByLentilleFeatureFlag() throws {
        let code = normalizedCode(try rowsSource())
        XCTAssertTrue(
            code.contains("private var rowCore: some View { if LentilleFeatureFlag.isLentilleListEnabled {"),
            "rowCore doit brancher sur LentilleFeatureFlag.isLentilleListEnabled — mux I-067"
        )
    }

    /// `@ViewBuilder` est NÉCESSAIRE : les deux branches produisent des
    /// `EquatableView<…>` de types concrets différents.
    func test_rowCore_isViewBuilder() throws {
        let code = normalizedCode(try rowsSource())
        XCTAssertTrue(
            code.contains("@ViewBuilder private var rowCore: some View"),
            "rowCore doit porter @ViewBuilder pour unifier LentilleConversationRow et ThemedConversationRow sous some View"
        )
    }

    // MARK: - Drapeau OFF ⇒ chemin historique, bit-à-bit identique

    /// Le critère explicite de la tâche. La construction `ThemedConversationRow`
    /// sous la branche `else` doit reprendre EXACTEMENT les mêmes arguments
    /// qu'avant ce lot (mêmes noms, même ordre) — un argument oublié ou
    /// substitué serait un changement de comportement silencieux drapeau
    /// éteint.
    func test_rowCore_offBranch_buildsThemedConversationRow_withUnchangedArguments() throws {
        let code = normalizedCode(try rowsSource())
        let expectedCall = """
        } else { ThemedConversationRow( conversation: conversation, community: community, availableWidth: rowWidth, isDragging: isDragging, presenceState: presenceState, onViewStory: onViewStory, onViewProfile: onViewProfile, onViewConversationInfo: onViewConversationInfo, onMoodBadgeTap: onMoodBadgeTap, onCreateShareLink: onCreateShareLink, isDark: isDark, storyRingState: storyRingState, moodStatus: moodStatus, typingUsername: typingUsername, isSelected: isSelected, draftSummary: draftSummary, preferredContentLanguages: preferredContentLanguages ) .equatable() }
        """
        .split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.joined(separator: " ")

        XCTAssertTrue(
            code.contains(expectedCall),
            "La branche OFF doit construire ThemedConversationRow avec EXACTEMENT les mêmes arguments qu'avant I-067 (rang historique inchangé)"
        )
    }

    /// La branche ON doit passer les MÊMES entrées que la branche OFF —
    /// « MÊMES entrées que ThemedConversationRow » (contrat §LWS-7) vérifié
    /// au site d'appel : aucun argument n'est ajouté ni retiré entre les
    /// deux constructions.
    /// **2026-08-23 — un argument de plus, et un seul.** La branche ON passe
    /// désormais par `LentilleMagnifiableRow`, l'enveloppe minuscule qui
    /// s'abonne à l'élection et à la scène, et la rangée reçoit un
    /// `magnification:` supplémentaire. Le jeu d'arguments RESTE celui de
    /// `ThemedConversationRow` — c'est ce que ce témoin protège : que la
    /// branche ON n'oublie ni le brouillon, ni la saisie en cours, ni l'anneau
    /// story, ni le mood. La magnification s'AJOUTE, elle ne remplace rien.
    func test_rowCore_onBranch_buildsLentilleConversationRow_withSameArgumentSet() throws {
        let code = normalizedCode(try rowsSource())
        let expectedCall = """
        LentilleConversationRow( conversation: conversation, community: community, availableWidth: rowWidth, isDragging: isDragging, presenceState: presenceState, onViewStory: onViewStory, onViewProfile: onViewProfile, onViewConversationInfo: onViewConversationInfo, onMoodBadgeTap: onMoodBadgeTap, onCreateShareLink: onCreateShareLink, isDark: isDark, storyRingState: storyRingState, moodStatus: moodStatus, typingUsername: typingUsername, isSelected: isSelected, draftSummary: draftSummary, preferredContentLanguages: preferredContentLanguages, magnification: context )
        """
        .split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.joined(separator: " ")

        XCTAssertTrue(
            code.contains(expectedCall),
            "La branche ON doit construire LentilleConversationRow avec le MÊME jeu d'arguments que " +
            "ThemedConversationRow, plus la magnification."
        )
        XCTAssertTrue(
            code.contains("if LentilleFeatureFlag.isLentilleListEnabled { LentilleMagnifiableRow( election: focusElection, scene: sceneActivity, conversationId: conversation.id, magnification: magnification )"),
            "… et elle passe par le portillon d'élection, qui décide si `context` est nil ou non."
        )
    }

    // MARK: - Rien d'autre dans le fichier ne bouge

    func test_swipeableRow_singleSite_unchanged() throws {
        let code = normalizedCode(try rowsSource())
        XCTAssertEqual(
            occurrences(of: "SwipeableRow(", in: code), 1,
            "Un seul site SwipeableRow — le mux ne doit pas dupliquer le conteneur de swipe"
        )
    }

    func test_conversationRowItem_equatable_gate_stillPresent_unchanged() throws {
        let code = normalizedCode(try rowsSource())
        XCTAssertTrue(
            code.contains("extension ConversationRowItem: @MainActor Equatable {"),
            "Le portillon .equatable() de ConversationRowItem doit rester INCHANGÉ autour du mux (contrat §LWS-7)"
        )
        XCTAssertEqual(
            occurrences(of: "extension ConversationRowItem: @MainActor Equatable {", in: code), 1
        )
    }

    func test_rowPressBounceModifier_stillPresent_unchanged() throws {
        let code = normalizedCode(try rowsSource())
        XCTAssertTrue(
            code.contains("struct RowPressBounceModifier: ViewModifier {"),
            "Le fallback iOS < 26 (RowPressBounceModifier) reste inchangé autour du mux"
        )
    }

    /// UNE occurrence de `.equatable()` attendue dans `rowCore` depuis le
    /// 2026-08-23 : celle de la branche OFF (`ThemedConversationRow`). La
    /// branche ON n'a pas PERDU son portillon — elle l'a DÉPLACÉ d'un cran,
    /// dans `LentilleMagnifiableRow.body`, qui est précisément l'endroit où
    /// il doit vivre : c'est là que l'abonnement à l'élection provoque la
    /// ré-évaluation, et c'est donc là que le portillon doit décider. Posé
    /// ici, il n'aurait rien gardé — le body de `rowCore` ne se ré-évalue pas
    /// à l'élection.
    ///
    /// Le témoin vérifie donc les DEUX moitiés : un `.equatable()` ici, un
    /// dans l'enveloppe. Sans la seconde assertion, supprimer le portillon de
    /// l'enveloppe passerait au vert.
    func test_rowCore_hasExactlyTwoEquatableCalls() throws {
        let code = normalizedCode(try rowsSource())
        guard let rowCoreStart = code.range(of: "@ViewBuilder private var rowCore: some View {") else {
            XCTFail("rowCore introuvable")
            return
        }
        // Isole le corps de `rowCore` jusqu'à la déclaration suivante
        // (`enum ConversationRowMetrics`, immédiatement après la fermeture
        // de `ConversationRowItem`). Un commentaire `// MARK:` ne peut PAS
        // servir de borne ici : `AppSourceGuard.stripComments` le retire
        // avant que ce test ne voie le texte normalisé.
        guard let sectionEnd = code.range(of: "enum ConversationRowMetrics {", range: rowCoreStart.upperBound..<code.endIndex) else {
            XCTFail("marqueur de fin de section introuvable après rowCore")
            return
        }
        let rowCoreBody = String(code[rowCoreStart.upperBound..<sectionEnd.lowerBound])
        XCTAssertEqual(
            occurrences(of: ".equatable()", in: rowCoreBody), 1,
            "rowCore doit contenir EXACTEMENT un .equatable() — celui de la branche OFF ; " +
            "celui de la branche ON vit dans LentilleMagnifiableRow (voir ci-dessous)."
        )

        let gate = normalizedCode(try source(at: "Meeshy/Features/Main/Lentille/Mode/LentilleMagnification.swift"))
        XCTAssertTrue(
            gate.contains("row(isMagnified ? magnification : nil) .equatable()"),
            "La branche ON garde son portillon, un cran plus bas, là où l'élection le ré-évalue."
        )
    }
}
