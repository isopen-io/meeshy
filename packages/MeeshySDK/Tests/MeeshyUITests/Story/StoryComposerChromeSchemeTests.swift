import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// Captures user 2026-07-20 : boutons glass du composer inexploitables sur un
/// fond média sombre. Le scheme du chrome était calculé depuis `backgroundColor`
/// (pastel aléatoire clair) + `hasBackgroundImage` (chemin legacy uniquement) —
/// un média de fond MODERNE (`mediaObjects` avec `isBackground == true`, chip
/// Background) restait invisible du calcul et laissait le chrome en `.light`
/// sur un letterbox blur sombre. Même règle que le reader :
/// `effects.hasVisualBackgroundMedia` force `.dark`.
@MainActor
final class StoryComposerChromeSchemeTests: XCTestCase {

    func test_canvasChromeScheme_lightBackgroundNoMedia_isLight() {
        let vm = StoryComposerViewModel()
        vm.backgroundColor = "#EEF2FF"

        XCTAssertEqual(vm.canvasChromeScheme, .light)
    }

    func test_canvasChromeScheme_darkBackgroundNoMedia_isDark() {
        let vm = StoryComposerViewModel()
        vm.backgroundColor = "#0B1220"

        XCTAssertEqual(vm.canvasChromeScheme, .dark)
    }

    func test_canvasChromeScheme_backgroundMediaObject_forcesDark() {
        let vm = StoryComposerViewModel()
        vm.backgroundColor = "#EEF2FF"
        var effects = vm.currentEffects
        effects.mediaObjects = [StoryMediaObject(aspectRatio: 16.0 / 9.0, isBackground: true)]
        vm.currentEffects = effects

        XCTAssertEqual(vm.canvasChromeScheme, .dark,
                       "Un média de fond (chip Background) impose le chrome sombre, peu importe le pastel auto")
    }

    func test_canvasChromeScheme_foregroundMediaOnly_followsBackgroundColor() {
        let vm = StoryComposerViewModel()
        vm.backgroundColor = "#EEF2FF"
        var effects = vm.currentEffects
        effects.mediaObjects = [StoryMediaObject(aspectRatio: 1.0, isBackground: false)]
        vm.currentEffects = effects

        XCTAssertEqual(vm.canvasChromeScheme, .light,
                       "Un média foreground ne couvre pas le canvas : le fond couleur reste la référence")
    }

    func test_canvasChromeScheme_legacyBackgroundImageFlag_forcesDark() {
        let vm = StoryComposerViewModel()
        vm.backgroundColor = "#EEF2FF"
        vm.hasBackgroundImage = true

        XCTAssertEqual(vm.canvasChromeScheme, .dark)
    }
}
