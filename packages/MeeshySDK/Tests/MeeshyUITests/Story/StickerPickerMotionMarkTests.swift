import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// #5000 — **la palette dit lesquelles bougent avant qu'on les pose.**
///
/// Le défaut corrigé n'était pas une absence de donnée : le mouvement était
/// déjà DIT à VoiceOver sur la scène (#4825) et déjà DÉCLARÉ par le catalogue
/// (#4821). Il n'était montré ni dit dans la PALETTE, c'est-à-dire au seul
/// moment où le choix se fait.
@MainActor
final class StickerPickerMotionMarkTests: XCTestCase {

    // MARK: - Le défaut a un sujet

    /// Un témoin qui ne servirait à rien si le catalogue était homogène : il
    /// prouve que la grille MÊLE les deux natures, donc qu'il y a bien quelque
    /// chose à distinguer.
    func test_theCatalogue_mixesMovingAndStillTemplates() {
        let tous = StickerTemplateFamily.allCases
            .flatMap { StickerTemplateCatalog.templates(family: $0) }
        XCTAssertFalse(tous.isEmpty, "le catalogue ne peut pas être vide")
        XCTAssertTrue(tous.contains { $0.animation != nil }, "il existe des gabarits animés")
        XCTAssertTrue(tous.contains { $0.animation == nil }, "il en existe d'immobiles")
    }

    /// Et qu'elles se côtoient dans une MÊME famille — donc dans une même
    /// grille, sous les yeux, à quelques points d'écart.
    func test_atLeastOneFamily_showsBothInTheSameGrid() {
        let melangees = StickerTemplateFamily.allCases.filter { famille in
            let gabarits = StickerTemplateCatalog.templates(family: famille)
            return gabarits.contains { $0.animation != nil }
                && gabarits.contains { $0.animation == nil }
        }
        XCTAssertFalse(melangees.isEmpty,
                       "animés et immobiles se côtoient dans au moins une grille")
    }

    // MARK: - Ce que la vignette DIT

    /// Le témoin s'écrit sur le cas que l'ancien code ratait : une vignette
    /// animée dont l'étiquette ne disait rien du mouvement.
    func test_anAnimatedTemplate_saysItsMotion() throws {
        let gabarit = try XCTUnwrap(
            StickerTemplateFamily.allCases
                .flatMap { StickerTemplateCatalog.templates(family: $0) }
                .first { $0.animation != nil },
            "il faut un gabarit animé pour écrire ce témoin")
        let animation = try XCTUnwrap(gabarit.animation)

        let phrase = StoryStickerAccessibility.describing(
            StickerPickerView.accessibilityLabel(for: gabarit, slots: [:]),
            motion: gabarit.animation)

        XCTAssertTrue(phrase.contains(animation.localizedName),
                      "« \(phrase) » doit porter « \(animation.localizedName) »")
    }

    func test_aStillTemplate_saysNothingAboutMotion() throws {
        let gabarit = try XCTUnwrap(
            StickerTemplateFamily.allCases
                .flatMap { StickerTemplateCatalog.templates(family: $0) }
                .first { $0.animation == nil })

        let nu = StickerPickerView.accessibilityLabel(for: gabarit, slots: [:])
        let phrase = StoryStickerAccessibility.describing(nu, motion: gabarit.animation)

        XCTAssertEqual(phrase, nu, "sans mouvement, la phrase ne gagne rien")
    }

    /// La phrase de la palette et celle de la scène viennent du MÊME site : une
    /// décoration posée se dit comme la vignette qui l'a proposée.
    func test_theSheetAndTheScene_speakTheSameWords() throws {
        let gabarit = try XCTUnwrap(
            StickerTemplateFamily.allCases
                .flatMap { StickerTemplateCatalog.templates(family: $0) }
                .first { $0.animation != nil })
        let sticker = StorySticker(id: "s", emoji: gabarit.fallbackEmoji,
                                   templateId: gabarit.id,
                                   animation: gabarit.animation)

        let palette = StoryStickerAccessibility.describing(
            StickerPickerView.accessibilityLabel(for: gabarit, slots: [:]),
            motion: gabarit.animation)

        XCTAssertEqual(StoryStickerAccessibility.description(for: sticker), palette)
    }
}
