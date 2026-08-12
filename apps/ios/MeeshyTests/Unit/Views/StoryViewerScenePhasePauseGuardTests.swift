import XCTest
@testable import Meeshy

/// Source-analysis guards pour `shouldPauseTimer` et le cycle de vie
/// `.inactive` du lecteur de stories.
///
/// Historique : une première version de ce fix ajoutait `scenePhase != .active`
/// à `shouldPauseTimer` pour geler le timer pendant un pull-down de
/// Notification Center / Control Center. Revert directive user 2026-07-14 :
/// la lecture (média + progress bar) ne doit JAMAIS être coupée par un simple
/// peek `.inactive` — exactement comme une vidéo en PIP ou une app de musique
/// en arrière-plan. Seul le vrai `.background` (déjà géré séparément, dismiss
/// complet du viewer) doit couper. Ces tests gardent contre la réintroduction
/// du terme `scenePhase` dans `shouldPauseTimer`.
///
/// `shouldPauseTimer` (agrégateur unique routé vers `slideTimer.setPaused`)
/// et `scenePhase` sont couplés à `@State`/`@Environment` sur `StoryViewerView`
/// — non instanciables proprement en test (même limite documentée dans
/// `StoryViewerReactionFlowTests.swift`). Pattern déjà établi dans ce repo
/// pour ce cas : garde par analyse de source, cf.
/// `ConversationMenuSystemDesignGuardTests.swift`.
@MainActor
final class StoryViewerScenePhasePauseGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Isole le corps de `shouldPauseTimer` (entre l'accolade ouvrante et la
    /// fermeture correspondante) pour ne pas matcher `scenePhase`/`isPaused`
    /// ailleurs dans le fichier.
    private func shouldPauseTimerBody() throws -> String {
        let contentSource = try source("Meeshy/Features/Main/Views/StoryViewerView+Content.swift")
        guard let declRange = contentSource.range(of: "var shouldPauseTimer: Bool {") else {
            XCTFail("shouldPauseTimer introuvable dans StoryViewerView+Content.swift")
            return ""
        }
        guard let closeRange = contentSource.range(of: "\n    }", range: declRange.upperBound..<contentSource.endIndex) else {
            XCTFail("Fermeture de shouldPauseTimer introuvable")
            return ""
        }
        return String(contentSource[declRange.upperBound..<closeRange.lowerBound])
    }

    // MARK: - .inactive ne doit JAMAIS geler le timer

    /// Régression : `scenePhase != .active` a été retiré de `shouldPauseTimer`
    /// (directive user 2026-07-14) — un pull-down de Notification Center /
    /// Control Center ne doit plus couper la lecture. Ne pas réintroduire ce
    /// terme dans cet agrégat.
    func test_shouldPauseTimer_doesNotContainScenePhaseCheck() throws {
        let block = try shouldPauseTimerBody()
        XCTAssertFalse(
            block.contains("scenePhase != .active"),
            "shouldPauseTimer ne doit PAS inclure `scenePhase != .active` — un " +
            "peek Notification Center / Control Center doit laisser le média et " +
            "la progress bar continuer sans coupure (comme une vidéo en PIP)."
        )
    }

    /// Garde contre une régression qui retirerait un des autres termes de
    /// l'agrégat — les pauses UI (sheets, composer engagé, overlay
    /// commentaires…) doivent continuer de fonctionner.
    func test_shouldPauseTimer_existingTermsPreserved() throws {
        let block = try shouldPauseTimerBody()
        for existingTerm in ["isPaused", "isLongPressPaused", "isComposerEngaged", "showCommentsOverlay", "showGroupIntro"] {
            XCTAssertTrue(
                block.contains(existingTerm),
                "shouldPauseTimer a perdu le terme `\(existingTerm)`."
            )
        }
    }

    // MARK: - Pré-requis : scenePhase accessible cross-file

    /// `@Environment(\.scenePhase)` est déclaré sur `StoryViewerView` (fichier
    /// principal) mais lu depuis `shouldPauseTimer` dans le fichier
    /// d'extension `StoryViewerView+Content.swift`. Un `private var` ne
    /// compile PAS depuis un fichier frère — piège déjà documenté dans
    /// `apps/ios/CLAUDE.md` § « Piège accès cross-file » (précédent :
    /// `composerFocusTrigger`). Ce test catch l'erreur AVANT le build.
    func test_scenePhase_isNotPrivate() throws {
        let viewerSource = try source("Meeshy/Features/Main/Views/StoryViewerView.swift")
        XCTAssertFalse(
            viewerSource.contains("private var scenePhase"),
            "@Environment(\\.scenePhase) ne doit pas être `private` — il est lu " +
            "depuis StoryViewerView+Content.swift (fichier d'extension frère), " +
            "qui ne peut pas accéder à une propriété private du fichier principal."
        )
        XCTAssertTrue(
            viewerSource.contains("@Environment(\\.scenePhase)"),
            "@Environment(\\.scenePhase) doit rester déclaré sur StoryViewerView."
        )
    }
}
