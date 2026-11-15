import XCTest
@testable import Meeshy

/// **Les composants partagés de l'app répondent au toucher et suivent
/// « Réduire les animations »** (#18302).
///
/// Le panneau des mentions, la pastille de synchronisation, la feuille
/// « Ajouter un membre », la note du son de fond et le panneau des effets
/// changeaient d'état d'un coup, ou glissaient en ressort littéral sans chemin
/// réduit. Leur câblage se lit dans leurs sources, commentaires et chaînes
/// masqués.
final class SharedComponentsMotionWiringTests: XCTestCase {

    private static let components = "Meeshy/Features/Main/Components/"

    private func code(_ name: String) throws -> String {
        let source = try AppSourceGuard.unit(Self.components + name)
        XCTAssertFalse(source.isEmpty, "source vide : chemin faux")
        return DeclarationBodyScanner.mask(source)
            .components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
    }

    private func animationValues(in code: String) -> [String] {
        code.components(separatedBy: ".meeshyAnimation(").dropFirst().compactMap { call in
            call.range(of: "value:").map { String(call[$0.upperBound...].prefix(60)) }
        }
    }

    private func assertAnimates(_ code: String, on value: String, _ what: String,
                                file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(animationValues(in: code).contains { $0.hasPrefix(" " + value) },
                      "\(what) : aucune .meeshyAnimation liée à \(value)", file: file, line: line)
    }

    private func assertNoRawMotion(_ code: String, _ name: String,
                                   file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertFalse(code.contains(".animation(.spring("), "\(name) garde un ressort brut", file: file, line: line)
        XCTAssertFalse(code.contains("withAnimation(.easeOut("), "\(name) garde un withAnimation brut", file: file, line: line)
    }

    // MARK: - Le panneau des mentions

    func test_mentionPanel_slidesOnlyWithMotion_andFadesUnderReduceMotion() throws {
        let code = try code("MentionSuggestionPanel.swift")
        assertNoRawMotion(code, "MentionSuggestionPanel")
        XCTAssertTrue(code.contains(".meeshyTransition(.move(edge: .bottom).combined(with: .opacity))"),
                      "le panneau ne glisse que hors réduction")
        XCTAssertTrue(code.contains(".meeshyAnimation(MeeshyAnimation.springDefault, reduced: MeeshyMotion.reducedFade,"),
                      "le panneau suit le jeton springDefault, et un fondu court sous réduction")
    }

    // MARK: - La pastille de synchronisation

    func test_syncPill_readsBothHalvesOfReduceMotion() throws {
        let code = try code("SyncPill.swift")
        XCTAssertTrue(code.contains("@Environment(\\.meeshyForceReduceMotion)"),
                      "la pastille lit aussi la préférence de l'app")
        XCTAssertTrue(code.contains("MeeshyMotion.shouldReduce(system:"))
    }

    func test_syncPill_appearsWithoutScaleUnderReduceMotion_onTokens() throws {
        let code = try code("SyncPill.swift")
        assertNoRawMotion(code, "SyncPill")
        XCTAssertTrue(code.contains(".meeshyTransition(.opacity.combined(with: .scale(scale: 0.85)))"),
                      "l'échelle d'entrée tombe sous réduction")
        assertAnimates(code, on: "isVisible)", "l'entrée et la sortie de la pastille")
    }

    func test_syncPill_labelRotation_isAnimatedOnTheVisibleEntry() throws {
        let code = try code("SyncPill.swift")
        assertAnimates(code, on: "visibleEntry?.id)", "le changement de libellé de la pastille")
        XCTAssertTrue(code.contains(".meeshyTransition(.opacity.combined(with: .move(edge: .top)))"),
                      "le libellé ne glisse que hors réduction")
    }

    func test_syncPillPlacement_followsTheChromeByAnOffset_onTokens() throws {
        let code = try code("SyncPillPlacement.swift")
        XCTAssertFalse(code.contains(".spring(response:"), "la courbe d'accostage est un jeton")
        XCTAssertFalse(code.contains(".padding(.bottom, SyncPillPlacement.bottomPadding"),
                       "la hauteur du chrome ne s'anime pas par un padding")
        XCTAssertTrue(code.contains(".offset(y: -SyncPillPlacement.bottomPadding("),
                      "la pastille suit le chrome par une translation")
        assertAnimates(code, on: "dock.claims.height)", "l'accostage de la pastille")
    }

    // MARK: - La feuille « Ajouter un membre »

    func test_addParticipantSheet_fadesBetweenItsStates() throws {
        let code = try code("AddParticipantSheet.swift")
        assertAnimates(code, on: "isSearching)", "le squelette de recherche")
        assertAnimates(code, on: "searchResults.isEmpty)", "la liste de résultats")
        assertAnimates(code, on: "errorMessage)", "le message d'erreur")
        assertAnimates(code, on: "searchQuery.isEmpty)", "le bouton d'effacement")
        assertAnimates(code, on: "isAdding)", "le bouton Ajouter qui devient indicateur")
        assertAnimates(code, on: "isMember)", "le badge Membre")
        XCTAssertGreaterThanOrEqual(code.components(separatedBy: ".transition(.opacity)").count - 1, 8,
                                    "chaque branche montée sous condition porte son fondu")
    }

    // MARK: - La note du son de fond

    func test_backgroundSoundNote_fadesItsSlash() throws {
        let code = try code("BackgroundSoundBadge.swift")
        XCTAssertTrue(code.contains(".meeshyAnimation(.easeInOut(duration: MeeshyGlassRecipe.toneFadeDuration), value: isMuted)"),
                      "la barre de la note passe par le fondu de ton de 200 ms")
    }

    // MARK: - Le panneau des effets

    func test_effectsPicker_usesTheFastSpringToken() throws {
        let code = try code("EffectsPickerView.swift")
        assertNoRawMotion(code, "EffectsPickerView")
        assertAnimates(code, on: "isSelected)", "la capsule d'effet")
        assertAnimates(code, on: "hasPanelEffect)", "« Tout effacer »")
    }
}
