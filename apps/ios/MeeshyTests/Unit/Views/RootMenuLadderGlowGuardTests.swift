// apps/ios/MeeshyTests/Unit/Views/RootMenuLadderGlowGuardTests.swift

import XCTest
@testable import Meeshy

/// L'échelle de menu (`RootView.menuLadder`) est montée EN PERMANENCE sur
/// l'écran d'accueil — opacité 0 et zIndex −1 quand le menu est fermé, pour
/// que le ressort d'ouverture anime depuis un état existant. Un `onAppear`
/// inconditionnel y démarrait le glow `repeatForever` de `ThemedActionButton`
/// (une OMBRE animée = re-rasterisation par frame) sur six boutons INVISIBLES,
/// en continu, derrière la liste de conversations — chauffe device mesurable
/// sur simple manipulation (audit 2026-08-26). Ces gardes épinglent
/// l'INTENTION : le décor ne respire que quand il est visible.
final class RootMenuLadderGlowGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Unit/Views
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Le site de montage de l'échelle passe la visibilité RÉELLE du menu
    /// comme porte du glow — sans ce câblage, `isGlowEnabled` garde son défaut
    /// `true` et les six ombres retournent respirer dans le vide.
    func test_menuLadder_gatesGlowOnShowMenu() throws {
        let code = AppSourceGuard.stripComments(try source("Meeshy/Features/Main/Views/RootView.swift"))
        XCTAssertTrue(
            code.contains("isGlowEnabled: showMenu"),
            "menuLadder doit passer `isGlowEnabled: showMenu` à ThemedActionButton — l'échelle reste montée menu fermé (opacité 0), seule cette porte arrête les six animations d'ombre repeatForever invisibles"
        )
    }

    /// Le bouton lui-même refuse de démarrer sa respiration quand la porte est
    /// fermée (ou sous Reduce Motion), et l'arrêt passe par une transaction
    /// sans animation — jamais un repeatForever qui survit à l'invisibilité.
    func test_themedActionButton_glowStartsOnlyWhenEnabled() throws {
        let code = AppSourceGuard.stripComments(try source("Meeshy/Features/Main/Views/RootViewComponents.swift"))
        XCTAssertTrue(
            code.contains("guard isGlowEnabled, !reduceMotion else"),
            "ThemedActionButton.syncGlow doit garder le démarrage du glow sur `isGlowEnabled` ET Reduce Motion"
        )
        XCTAssertTrue(
            code.contains("adaptiveOnChange(of: isGlowEnabled)"),
            "l'ouverture/fermeture du menu ne remonte pas les boutons — c'est le changement d'`isGlowEnabled`, pas `onAppear`, qui doit démarrer/arrêter la respiration"
        )
    }
}
