import XCTest
import MeeshyUI
@testable import Meeshy

/// #17927 — à hauteur compacte (paysage téléphone ≈ 360 pt, iPhone SE paysage) avec un cadre
/// choisi, la barre ‹ · Réglages · (+) de la famille Effets / Montage reste ENTIÈREMENT visible et
/// touchable (44 pt) : ce qui est au-dessus d'elle (carrousel, ambiances, option « Cadre »,
/// sous-titres) se resserre ou défile, jamais la barre. La règle C1 généralisée (retour au menu de
/// base après un choix) et l'appui long sur (+) ne bougent pas.
@MainActor
final class CallCompactHeightBarGuardTests: XCTestCase {

    private func code(_ path: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
    }

    private func slice(_ source: String, from start: String, to end: String) throws -> String {
        let head = try XCTUnwrap(source.range(of: start), "Introuvable : \(start)")
        let tail = String(source[head.upperBound...])
        let stop = try XCTUnwrap(tail.range(of: end), "Introuvable : \(end)")
        return String(tail[..<stop.lowerBound])
    }

    func test_overflowContainer_fitsWhenTallAndScrollsWhenShort() throws {
        let bar = try code("Meeshy/Features/Call/Views/CallEffectsBar.swift")
        let overflow = try slice(bar, from: "struct CallAboveBarOverflow", to: "/// P8")
        XCTAssertTrue(overflow.contains("ViewThatFits(in: .vertical)"), "Assez de place : le contenu tel quel ; sinon il défile")
        XCTAssertTrue(overflow.contains("ScrollView(.vertical, showsIndicators: false)"), "Faute de hauteur, ce qui est au-dessus de la barre défile")
    }

    func test_effectsControls_theBarStaysOutsideWhatScrolls() throws {
        let controls = try code("Meeshy/Features/Call/Views/CallModeControls.swift")
        let body = try slice(controls, from: "struct CallEffectsModeControls", to: ".onAppear {")
        let overflow = try XCTUnwrap(body.range(of: "CallAboveBarOverflow {"))
        let bar = try XCTUnwrap(body.range(of: "CallEffectsBar("))
        XCTAssertLessThan(overflow.lowerBound, bar.lowerBound)
        let scrolled = String(body[overflow.upperBound..<bar.lowerBound])
        XCTAssertTrue(scrolled.contains("panelOrCarousel"), "Le carrousel et les panneaux sont ce qui se resserre")
        XCTAssertFalse(scrolled.contains("onAddLook"), "(+) ne se pose jamais dans la zone qui défile")
    }

    func test_montageControls_theBarStaysOutsideWhatScrolls() throws {
        let controls = try code("Meeshy/Features/Call/Views/CallModeControls.swift")
        let body = try slice(controls, from: "struct CallMontageModeControls", to: ".task(id: CallCaptureSourceKey")
        let overflow = try XCTUnwrap(body.range(of: "CallAboveBarOverflow {"))
        let bar = try XCTUnwrap(body.range(of: "CallEffectsBar("))
        XCTAssertLessThan(overflow.lowerBound, bar.lowerBound)
        let scrolled = String(body[overflow.upperBound..<bar.lowerBound])
        XCTAssertTrue(scrolled.contains("panelOrCarousel(people: people)"), "Cadre, ambiances et carrousel du Montage défilent au-dessus de la barre")
        XCTAssertFalse(scrolled.contains("onAddLook"), "(+) ne se pose jamais dans la zone qui défile")
    }

    func test_modeLayer_barCarrierKeepsItsHeightBeforeTheCaptions() throws {
        let mode = try code("Meeshy/Features/Call/Views/CallView+Mode.swift")
        let stack = try slice(mode, from: "VStack(spacing: MeeshySpacing.mdPlus) {", to: ".padding(.bottom, Self.chromeBottomInset)")
        let captions = try XCTUnwrap(stack.range(of: "CallAboveBarOverflow {"), "Les sous-titres se resserrent ou défilent au-dessus de la barre")
        let controls = try XCTUnwrap(stack.range(of: "modeControls(mode)"))
        XCTAssertLessThan(captions.lowerBound, controls.lowerBound)
        XCTAssertTrue(stack.contains(".layoutPriority(2)"), "La pile de la barre prend sa hauteur avant tout ce qui est au-dessus")
        XCTAssertTrue(stack.contains(".layoutPriority(1)"), "Les sous-titres passent avant la bande des autres, qui cède en premier")
    }

    func test_barTargets_stayAtLeast44Points() throws {
        XCTAssertGreaterThanOrEqual(MeeshyControlSize.tapTarget, 44)
        let bar = try code("Meeshy/Features/Call/Views/CallEffectsBar.swift")
        XCTAssertTrue(bar.contains("private static var diameter: CGFloat { 44 }"))
        XCTAssertTrue(bar.contains("diameter: MeeshyControlSize.tapTarget"), "(+) garde sa cible de 44 pt")
        XCTAssertTrue(bar.contains(".onLongPressGesture(minimumDuration: CallModeGestureRule.longPressDuration"), "L'appui long sur (+) ouvre la liste des effets appliqués")
    }

    func test_afterChoice_stillReturnsTheBarToItsBaseMenu() throws {
        let controls = try code("Meeshy/Features/Call/Views/CallModeControls.swift")
        XCTAssertEqual(controls.components(separatedBy: "barMode = CallEffectsBarRule.afterChoice").count - 1, 3, "C1 généralisée : trois chemins de choix rendent le menu de base")
    }
}
