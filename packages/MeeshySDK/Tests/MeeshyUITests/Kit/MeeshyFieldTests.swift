import Testing
import Foundation
@testable import MeeshyUI

/// K08 — le champ de feuille, lu comme des VALEURS : la recette par `input`, la
/// loi du plafond (compte, troncature, seuil de 80 %), la visibilité de l'invite,
/// de la croix et du compteur, le ton et le contraste. Les vecteurs partagés
/// (`docs/product/kit/K08-MeeshyField.vectors.json`) sont lus par les trois suites.
@Suite("MeeshyField")
struct MeeshyFieldTests {

    // MARK: - Recette par input

    @Test("chaque input fixe clavier, Retour, correction et majuscule du tableau")
    func recipe_input_fixesKeyboardReturnCorrection() {
        let search = MeeshyFieldRecipe.resolve(input: .search, hasCaption: false, tone: nil, isEnabled: true, increasedContrast: false)
        #expect(search.keyboard == .search)
        #expect(search.returnKey == .search)
        #expect(search.autocorrects == false)
        #expect(search.capitalization == .none)
        #expect(search.lineRange == 1...1)

        let paragraph = MeeshyFieldRecipe.resolve(input: .paragraph, hasCaption: false, tone: nil, isEnabled: true, increasedContrast: false)
        #expect(paragraph.returnKey == .newline)
        #expect(paragraph.capitalization == .sentences)
        #expect(paragraph.lineRange == 3...6)

        let numeric = MeeshyFieldRecipe.resolve(input: .numeric, hasCaption: false, tone: nil, isEnabled: true, increasedContrast: false)
        #expect(numeric.keyboard == .numbersAndPunctuation)
        #expect(numeric.returnKey == .done)
        #expect(numeric.autocorrects == false)
    }

    // MARK: - Visibilité (loi 13)

    @Test("l'invite n'existe que champ vide et sans légende")
    func recipe_prompt_onlyWhenEmptyAndNoCaption() {
        #expect(MeeshyFieldRecipe.showsPrompt(text: "", caption: nil))
        #expect(MeeshyFieldRecipe.showsPrompt(text: "a", caption: nil) == false)
        #expect(MeeshyFieldRecipe.showsPrompt(text: "", caption: "Légende") == false)
    }

    @Test("la croix n'existe que dans search, avec du texte, et cède la place à la roue")
    func recipe_clear_onlySearchWithTextAndNotBusy() {
        #expect(MeeshyFieldRecipe.showsClear(input: .search, text: "a", isBusy: false, isEnabled: true))
        #expect(MeeshyFieldRecipe.showsClear(input: .search, text: "", isBusy: false, isEnabled: true) == false)
        #expect(MeeshyFieldRecipe.showsClear(input: .sentence, text: "a", isBusy: false, isEnabled: true) == false)
        #expect(MeeshyFieldRecipe.showsClear(input: .search, text: "a", isBusy: true, isEnabled: true) == false)
        #expect(MeeshyFieldRecipe.showsClear(input: .search, text: "a", isBusy: false, isEnabled: false) == false)
    }

    @Test("le compteur en ligne n'existe que avec une limite et du texte, jamais en hébergé")
    func recipe_counter_onlyInlineWithLimitAndText() {
        #expect(MeeshyFieldRecipe.showsInlineCounter(limit: 60, text: "a", placement: .inline))
        #expect(MeeshyFieldRecipe.showsInlineCounter(limit: nil, text: "a", placement: .inline) == false)
        #expect(MeeshyFieldRecipe.showsInlineCounter(limit: 60, text: "", placement: .inline) == false)
        #expect(MeeshyFieldRecipe.showsInlineCounter(limit: 60, text: "a", placement: .hosted) == false)
    }

    // MARK: - Loi du plafond

    @Test("le compte se fait en unités UTF-16, un émoji composé vaut sa longueur UTF-16")
    func limit_count_usesUTF16Units() {
        #expect(MeeshyFieldLimit.count("abc") == 3)
        #expect(MeeshyFieldLimit.count("é") == 1)
        #expect(MeeshyFieldLimit.count("👍🏽") == 4)
        #expect(MeeshyFieldLimit.count("") == 0)
    }

    @Test("la troncature coupe au plafond, sur une frontière de graphème, sans jamais le dépasser")
    func limit_truncate_cutsOnGraphemeBoundary() {
        #expect(MeeshyFieldLimit.truncate("abcdef", to: 3) == "abc")
        #expect(MeeshyFieldLimit.truncate("abc", to: 10) == "abc")
        #expect(MeeshyFieldLimit.truncate("a👍🏽b", to: 2) == "a")
        #expect(MeeshyFieldLimit.truncate("a👍🏽b", to: 5) == "a👍🏽")
        #expect(MeeshyFieldLimit.count(MeeshyFieldLimit.truncate("👍🏽👍🏽👍🏽", to: 7)) <= 7)
    }

    @Test("le seuil d'alerte est atteint à 80 %, pas avant")
    func limit_isNear_atEightyPercent() {
        #expect(MeeshyFieldLimit.isNear(count: 80, limit: 100))
        #expect(MeeshyFieldLimit.isNear(count: 79, limit: 100) == false)
        #expect(MeeshyFieldLimit.isNear(count: 100, limit: 100))
    }

    // MARK: - Ton, contraste, désactivé

    @Test("le champ désactivé passe à 40 % et le filet n'apparaît que sous augmenter le contraste")
    func recipe_disabledAndHairline() {
        let off = MeeshyFieldRecipe.resolve(input: .sentence, hasCaption: false, tone: nil, isEnabled: false, increasedContrast: false)
        #expect(off.contentOpacity == 0.4)
        let plain = MeeshyFieldRecipe.resolve(input: .sentence, hasCaption: false, tone: nil, isEnabled: true, increasedContrast: false)
        #expect(plain.hairlineOpacity == nil)
        #expect(plain.contentOpacity == 1)
        let contrast = MeeshyFieldRecipe.resolve(input: .sentence, hasCaption: false, tone: nil, isEnabled: true, increasedContrast: true)
        #expect(contrast.hairlineOpacity == 0.6)
    }

    @Test("le fond vaut l'encre à 8 % et le ton theme prend l'encre du thème")
    func recipe_fillAndTheme() {
        let dark = MeeshyFieldRecipe.resolve(input: .search, hasCaption: false, tone: nil, isEnabled: true, increasedContrast: false)
        #expect(dark.fillOpacity == MeeshyOpacity.subtle)
        #expect(dark.ink == .onMedia)
        let theme = MeeshyFieldRecipe.resolve(input: .search, hasCaption: false, tone: .theme, isEnabled: true, increasedContrast: false)
        #expect(theme.ink == .themeInk)
    }

    @Test("les cibles tactiles font au moins 44 pt")
    func recipe_tapTargets_atLeastMinimum() {
        let recipe = MeeshyFieldRecipe.resolve(input: .search, hasCaption: false, tone: nil, isEnabled: true, increasedContrast: false)
        #expect(recipe.minimumHeight >= MeeshyControlSize.tapTarget)
    }
}
