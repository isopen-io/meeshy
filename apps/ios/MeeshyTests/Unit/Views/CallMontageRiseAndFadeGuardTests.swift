import XCTest
@testable import Meeshy

/// #17811 — C1.12 : le Montage (barre et carrousel) monte depuis le bas et y
/// redescend, en transformation + opacité ; « Réduire les animations » le remplace par
/// le fondu court de la couche. Effets garde le fondu de la couche : la loi 17 l'excepte
/// (« Effets emprunte au composer », loi 9). C1.4 : la rangée d'ambiances s'estompe à
/// ses deux bords, avec le même masque que les rangées de l'appel.
@MainActor
final class CallMontageRiseAndFadeGuardTests: XCTestCase {

    private func code(_ path: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
    }

    func test_risesFromBottom_montageWithMotion_rises() {
        XCTAssertTrue(CallModeChromeMotion.risesFromBottom(.montage, reduceMotion: false))
    }

    func test_risesFromBottom_montageUnderReduceMotion_onlyFades() {
        XCTAssertFalse(CallModeChromeMotion.risesFromBottom(.montage, reduceMotion: true))
    }

    func test_risesFromBottom_effects_keepsTheLayerFade() {
        XCTAssertFalse(CallModeChromeMotion.risesFromBottom(.effects, reduceMotion: false))
        XCTAssertFalse(CallModeChromeMotion.risesFromBottom(.effects, reduceMotion: true))
    }

    func test_modeControls_followTheRule_andTheLayerKeepsItsFade() throws {
        let mode = try code("Meeshy/Features/Call/Views/CallView+Mode.swift")
        let from = try XCTUnwrap(mode.range(of: "VStack(spacing: MeeshySpacing.mdPlus) {"))
        let tail = String(mode[from.upperBound...])
        let end = try XCTUnwrap(tail.range(of: "CallModeRecordingOverlay"))
        let controls = String(tail[..<end.lowerBound])
        XCTAssertTrue(
            controls.contains(".transition(CallModeChromeMotion.risesFromBottom(mode, reduceMotion: reduceMotion) ? .move(edge: .bottom).combined(with: .opacity) : .identity)"),
            "La pile des commandes du Montage monte du bas et y redescend ; ailleurs, la couche seule fond"
        )
        let after = String(tail[end.upperBound...])
        let label = try XCTUnwrap(after.range(of: ".accessibilityLabel(CallModeCopy.title(mode))"))
        XCTAssertTrue(String(after[..<label.lowerBound]).contains(".transition(.opacity)"), "La couche du mode garde son fondu")
    }

    func test_moodChips_rowFadesAtBothEdges() throws {
        let chips = try code("Meeshy/Features/Call/Views/CallFrameMoodChips.swift")
        let scroll = try XCTUnwrap(chips.range(of: "ScrollView(.horizontal, showsIndicators: false) {"))
        let after = String(chips[scroll.upperBound...])
        let mask = try XCTUnwrap(
            after.range(of: ".mask { ScrollEdgeFadeMask(axis: .horizontal, start: true, end: true) }"),
            "Une rangée qui défile s'efface en fondu à ses deux bords"
        )
        let disabled = try XCTUnwrap(after.range(of: ".disabled(!isEnabled)"))
        XCTAssertLessThan(mask.lowerBound, disabled.lowerBound, "Le masque se pose sur la ScrollView elle-même, pas sur une puce")
    }

    /// loi 17.9 — la bande de looks défile coupée net sans masque : comme les autres rangées de
    /// l'appel, elle s'efface en fondu à ses deux bords, le masque posé sur la piste elle-même.
    func test_carousel_trackFadesAtBothEdges() throws {
        let carousel = try code("Meeshy/Features/Call/Views/CallModeCarousel.swift")
        let track = try XCTUnwrap(carousel.range(of: ".frame(height: CallModeCarouselRule.trackHeight(itemHeight: itemSize.height))"))
        let mask = try XCTUnwrap(
            carousel.range(of: ".mask { ScrollEdgeFadeMask(axis: .horizontal, start: true, end: true) }"),
            "La bande de looks s'efface en fondu à ses deux bords"
        )
        XCTAssertLessThan(track.upperBound, mask.lowerBound, "Le masque se pose sur la piste cadrée, pas sur une case")
    }

    /// P8.6 (2026-11-14) — UN seul nom, SOUS la case choisie ; les voisines n'en portent pas.
    func test_carousel_writesASingleName_belowTheChosenCell() throws {
        let carousel = try code("Meeshy/Features/Call/Views/CallModeCarousel.swift")
        let nameLine = "Text(browse.isBrowsing ? announcedName : name(centred ?? selection))"
        XCTAssertEqual(carousel.components(separatedBy: nameLine).count - 1, 1, "Un seul nom écrit")
        let name = try XCTUnwrap(carousel.range(of: nameLine))
        let track = try XCTUnwrap(carousel.range(of: "GeometryReader { geo in"))
        XCTAssertGreaterThan(name.lowerBound, track.lowerBound, "Le nom est SOUS la piste, plus au-dessus")
        let hint = try XCTUnwrap(carousel.range(of: "Text(hint)"))
        XCTAssertLessThan(hint.lowerBound, track.lowerBound, "L'indice de geste reste au-dessus de la piste")
    }

    /// loi 17.10 — sous Réduire les animations, le carrousel ne supprime plus l'animation : le
    /// choix de la case et l'indice s'estompent d'un fondu court, sans que la taille glisse.
    func test_carousel_underReduceMotion_fadesInsteadOfSnapping() throws {
        let carousel = try code("Meeshy/Features/Call/Views/CallModeCarousel.swift")
        XCTAssertFalse(carousel.contains(".animation(reduceMotion ? nil : .spring(response: 0.25, dampingFraction: 0.8), value: isSelected)"), "Bascule sèche de la case")
        XCTAssertFalse(carousel.contains(".animation(reduceMotion ? nil : .easeInOut(duration: 0.25), value: hint)"), "Bascule sèche de l'indice")
        XCTAssertTrue(carousel.contains("CallModeCarouselRule.scaleAnimation(reduceMotion: reduceMotion)"))
        XCTAssertTrue(carousel.contains("CallModeCarouselRule.animation(reduceMotion: reduceMotion, full:"))
    }

    /// P8b.1 — le panneau Luminosité · Flou du fond est UN groupe que VoiceOver nomme « Réglages de
    /// mon image » (la légende de la planche), dans les sept langues ; la liste des effets appliqués
    /// n'emprunte pas ce nom.
    func test_settingsPanel_isANamedGroup_forVoiceOver() throws {
        let bar = try code("Meeshy/Features/Call/Views/CallEffectsBar.swift")
        let panel = try XCTUnwrap(bar.range(of: "struct CallEffectsPanel<Content: View>: View {"))
        let applied = try XCTUnwrap(bar.range(of: "struct CallEffectsAppliedPanel"))
        let body = String(bar[panel.lowerBound ..< applied.lowerBound])
        XCTAssertTrue(body.contains(".accessibilityLabel(label)"), "Le groupe porte le nom qu'on lui donne")
        XCTAssertTrue(body.contains("var label = \"\""), "Un nom facultatif : la liste n'a pas celui des réglages")
        let controls = try code("Meeshy/Features/Call/Views/CallModeControls.swift")
        XCTAssertEqual(controls.components(separatedBy: "CallEffectsPanel(label: CallModeCopy.settingsPanel)").count - 1, 2, "Réglages d'Effets et de Montage portent le même nom")
        XCTAssertTrue(controls.contains("smoothingRow"), "La rangée « Force du lissage » est gardée")
        let copy = try code("Meeshy/Features/Call/Views/CallModeCarousel.swift")
        XCTAssertTrue(copy.contains("\"call.mode.effects.settings.panel\""))
        let catalog = try AppSourceGuard.unit("Meeshy/Localizable.xcstrings")
        let from = try XCTUnwrap(catalog.range(of: "\"call.mode.effects.settings.panel\": {"))
        let entry = String(catalog[from.lowerBound...].prefix(1800))
        for value in ["Réglages de mon image", "My image settings", "Ajustes de mi imagen", "Einstellungen für mein Bild", "Impostazioni della mia immagine", "Ajustes da minha imagem", "إعدادات صورتي"] {
            XCTAssertTrue(entry.contains(value), value)
        }
    }
}
