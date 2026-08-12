import XCTest
import SwiftUI
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Captures user 2026-07-20 : boutons glass du composer inexploitables sur un
/// fond média sombre. Le scheme du chrome était calculé depuis `backgroundColor`
/// (pastel aléatoire clair) + `hasBackgroundImage` (chemin legacy uniquement) —
/// un média de fond MODERNE (`mediaObjects` avec `isBackground == true`, chip
/// Background) restait invisible du calcul et laissait le chrome en `.light`
/// sur un letterbox blur sombre. 2e vague (même jour) : le `.dark` forfaitaire
/// inversait le problème sur un média CLAIR (capture d'écran blanche) — le
/// scheme suit désormais la luminance RÉELLE du bitmap de fond quand elle est
/// mesurable, et retombe sur `.dark` (convention viewer) sinon.
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

    // MARK: - Luminance du bitmap de fond (capture user 2026-07-20, 2e vague :
    // capture d'écran BLANCHE posée en Background → chrome blanc invisible.
    // Le scheme doit suivre la luminance RÉELLE du bitmap, pas un `.dark`
    // forfaitaire.)

    private func solidImage(_ color: UIColor) -> UIImage {
        let size = CGSize(width: 12, height: 12)
        return UIGraphicsImageRenderer(size: size).image { ctx in
            color.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
        }
    }

    func test_canvasChromeScheme_brightBackgroundMediaBitmap_isLight() {
        let vm = StoryComposerViewModel()
        vm.backgroundColor = "#0B1220"
        var effects = vm.currentEffects
        let media = StoryMediaObject(aspectRatio: 16.0 / 9.0, isBackground: true)
        effects.mediaObjects = [media]
        vm.currentEffects = effects
        vm.loadedImages[media.id] = solidImage(.white)

        XCTAssertEqual(vm.canvasChromeScheme, .light,
                       "Un média de fond CLAIR (capture Library blanche) exige un chrome sombre")
    }

    func test_canvasChromeScheme_darkBackgroundMediaBitmap_staysDark() {
        let vm = StoryComposerViewModel()
        vm.backgroundColor = "#EEF2FF"
        var effects = vm.currentEffects
        let media = StoryMediaObject(aspectRatio: 16.0 / 9.0, isBackground: true)
        effects.mediaObjects = [media]
        vm.currentEffects = effects
        vm.loadedImages[media.id] = solidImage(.black)

        XCTAssertEqual(vm.canvasChromeScheme, .dark)
    }

    func test_canvasChromeScheme_legacyBrightBitmap_isLight() {
        let vm = StoryComposerViewModel()
        vm.backgroundColor = "#0B1220"
        vm.hasBackgroundImage = true
        vm.slideImages[vm.currentSlide.id] = solidImage(.white)

        XCTAssertEqual(vm.canvasChromeScheme, .light)
    }

    func test_canvasChromeScheme_luminanceCache_followsBitmapReplacement() {
        let vm = StoryComposerViewModel()
        vm.backgroundColor = "#0B1220"
        vm.hasBackgroundImage = true
        vm.slideImages[vm.currentSlide.id] = solidImage(.white)
        XCTAssertEqual(vm.canvasChromeScheme, .light)

        // Remplacement du bitmap (nouveau fond choisi) : le cache par identité
        // d'image doit se rafraîchir, pas resservir l'ancienne luminance.
        vm.slideImages[vm.currentSlide.id] = solidImage(.black)
        XCTAssertEqual(vm.canvasChromeScheme, .dark)
    }
}
