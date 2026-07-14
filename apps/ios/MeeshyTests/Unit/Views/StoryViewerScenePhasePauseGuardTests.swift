import XCTest
@testable import Meeshy

/// Source-analysis guards pour la pause du timer de story sur `.inactive`
/// (bannière de notification, Control Center, appel entrant, aperçu
/// app-switcher). `StoryCanvasUIView+Lifecycle.swift` gèle déjà le média
/// (vidéo/audio) sur `UIApplication.willResignActiveNotification`, mais avant
/// ce fix rien ne gelait le TIMER (`StoryReaderTimerController`) sur cette
/// même transition — seul `.background` complet était géré, laissant la
/// progress bar avancer (et la story potentiellement se terminer) pendant
/// que l'utilisateur ne regarde plus l'écran.
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

    // MARK: - .inactive gèle le timer

    func test_shouldPauseTimer_containsScenePhaseInactiveCheck() throws {
        let block = try shouldPauseTimerBody()
        XCTAssertTrue(
            block.contains("scenePhase != .active"),
            "shouldPauseTimer doit inclure `scenePhase != .active` — sinon le timer " +
            "continue de tourner pendant qu'une notification/Control Center masque " +
            "l'app (média déjà gelé côté canvas via willResignActiveNotification, " +
            "mais pas le timer)."
        )
    }

    /// Garde contre une régression qui remplacerait l'agrégat existant au lieu
    /// de lui ajouter un terme — les pauses UI (sheets, composer engagé,
    /// overlay commentaires…) doivent continuer de fonctionner.
    func test_shouldPauseTimer_scenePhaseTermIsAdded_existingTermsPreserved() throws {
        let block = try shouldPauseTimerBody()
        for existingTerm in ["isPaused", "isLongPressPaused", "isComposerEngaged", "showCommentsOverlay", "showGroupIntro"] {
            XCTAssertTrue(
                block.contains(existingTerm),
                "shouldPauseTimer a perdu le terme `\(existingTerm)` — l'ajout de " +
                "scenePhase doit ÉTENDRE l'agrégat, pas le remplacer."
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
