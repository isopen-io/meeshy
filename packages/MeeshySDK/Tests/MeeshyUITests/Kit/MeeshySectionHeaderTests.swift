import Testing
import Foundation
@testable import MeeshyUI

/// K44 — l'en-tête de section lu comme des VALEURS : formes, compteur, repli.
@Suite("MeeshySectionHeader")
struct MeeshySectionHeaderTests {

    private static let file = "K44-MeeshySectionHeader"

    @Test("les titres suivent les vecteurs : 22, 19 en feuille, 26 en colonne")
    func titles_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "titres") {
            let size = try #require(MeeshySectionHeaderSize(rawValue: row["taille"] as? String ?? ""))
            let recipe = MeeshySectionHeaderRecipe.resolve(form: .title, size: size)
            #expect(recipe.titleFontSize == row["police"] as? Double, "\(row)")
        }
    }

    @Test("le compteur nul ou zéro ne rend ni nombre ni écart")
    func count_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "compteurs") {
            let count = row["compteur"] as? Int
            let recipe = MeeshySectionHeaderRecipe.resolve(count: count)
            #expect(recipe.showsCount == row["affiche"] as? Bool, "\(row)")
            #expect(recipe.countGap == row["ecart"] as? Double, "\(row)")
        }
        #expect(MeeshySectionHeaderRecipe.resolve(count: 6).countFontSize == 16)
    }

    @Test("le chevron de repli : 0° ouvert, 180° fermé ; une ligne repliable se touche en entier")
    func chevron_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "chevron") {
            let open = try #require(row["ouvert"] as? Bool)
            let recipe = MeeshySectionHeaderRecipe.resolve(isCollapsible: true, isExpanded: open)
            #expect(recipe.chevronDegrees == row["degres"] as? Double, "\(row)")
            #expect(recipe.isWholeRowTappable)
        }
        #expect(!MeeshySectionHeaderRecipe.resolve(isCollapsible: false).isWholeRowTappable)
        #expect(!MeeshySectionHeaderRecipe.resolve(isCollapsible: false).showsChevron)
    }

    @Test("la ligne fait 44 au moins ; pressée seulement si repliable : voile de 9 %, échelle 0,985")
    func target_andPress() throws {
        let minimum = try #require(try KitAtomVectors.load(Self.file)["hauteurMin"] as? Double)
        #expect(MeeshySectionHeaderRecipe.resolve().minHeight == minimum)
        let pressed = MeeshySectionHeaderRecipe.resolve(isCollapsible: true, isPressed: true)
        #expect(pressed.pressVeil == 0.09)
        #expect(pressed.pressScale == 0.985)
        let staticRow = MeeshySectionHeaderRecipe.resolve(isCollapsible: false, isPressed: true)
        #expect(staticRow.pressVeil == 0)
        #expect(staticRow.pressScale == 1)
    }

    @Test("les formes : sur-titre 11 en capitales, séparateur de filets, étape de 26 et titre de 19, colonne")
    func forms() {
        let overline = MeeshySectionHeaderRecipe.resolve(form: .overline)
        #expect(overline.titleFontSize == 11)
        #expect(overline.isUppercase)
        let divider = MeeshySectionHeaderRecipe.resolve(form: .divider)
        #expect(divider.showsRules)
        #expect(divider.ruleGap == 12)
        #expect(!MeeshySectionHeaderRecipe.resolve(form: .title).showsRules)
        let step = MeeshySectionHeaderRecipe.resolve(form: .step)
        #expect(step.leadingSize == 26)
        #expect(step.titleFontSize == 19)
        #expect(MeeshySectionHeaderRecipe.resolve(form: .column, size: .column).leadingSize == 44)
        #expect(MeeshySectionHeaderRecipe.resolve(form: .title).leadingSize == 32)
    }

    @Test("l'étape : faite en coche, en cours en aplat, à faire en contour ; le témoin en direct de 8")
    func step_andLive() {
        #expect(MeeshySectionHeaderRecipe.stepAppearance(.done) == .check)
        #expect(MeeshySectionHeaderRecipe.stepAppearance(.current) == .filled)
        #expect(MeeshySectionHeaderRecipe.stepAppearance(.todo) == .outlined)
        let live = MeeshySectionHeaderRecipe.resolve(isLive: true)
        #expect(live.liveDotSize == 8)
        #expect(live.liveDotGap == 10)
        #expect(MeeshySectionHeaderRecipe.resolve().liveDotSize == 0)
    }

    @Test("très grande police : l'accessoire passe sous le titre, rien n'est tronqué")
    func bigText() {
        #expect(MeeshySectionHeaderRecipe.resolve(textScale: 2).accessoryBelowTitle)
        #expect(!MeeshySectionHeaderRecipe.resolve().accessoryBelowTitle)
    }

    @Test("garde de source : aucun type du domaine, aucun singleton, aucun verre dessiné")
    func source_isAgnostic() throws {
        let files = ["MeeshySectionHeader.swift", "MeeshySectionHeaderRecipe.swift"]
        try KitAssemblyGuards.assertAgnostic(files)
        for file in files {
            #expect(!(try KitAtomVectors.code(file)).contains("UIBlurEffect"), "\(file)")
        }
    }

    @Test("la pastille de titre (K41) se dit après le titre et son compte, et rien ne se dit sans elle")
    func titleBadge_isSpokenAfterTheTitleAndItsCount() {
        let withBadge = MeeshySectionHeaderRecipe.spokenTitle(title: "Mes adresses", count: 3, titleBadge: "Nouveau")
        #expect(withBadge == "Mes adresses, 3, Nouveau")
        let withoutCount = MeeshySectionHeaderRecipe.spokenTitle(title: "Mes adresses", count: nil, titleBadge: "Nouveau")
        #expect(withoutCount == "Mes adresses, Nouveau")
        let withoutBadge = MeeshySectionHeaderRecipe.spokenTitle(title: "Mes adresses", count: 3, titleBadge: nil)
        #expect(withoutBadge == "Mes adresses, 3")
        let emptyBadge = MeeshySectionHeaderRecipe.spokenTitle(title: "Mes adresses", count: 0, titleBadge: "")
        #expect(emptyBadge == "Mes adresses")
    }
}
