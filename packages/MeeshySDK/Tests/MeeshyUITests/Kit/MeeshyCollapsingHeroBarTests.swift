import Testing
import Foundation
@testable import MeeshyUI

/// K28 et le profil : la barre autonome d'un écran poussé (`bar`) et la capsule de titre
/// (`capsule`). Mesures lues dans les vecteurs K28 partagés.
@Suite("MeeshyCollapsingHero — barre et capsule")
struct MeeshyCollapsingHeroBarTests {
    private static let file = "K28-MeeshyCollapsingHero.vectors.json"

    @Test("trois variantes : le héros, la barre, la capsule")
    func variants_followTheVectors() throws {
        let names = try #require(try KitEvolutionVectors.json(Self.file)["variantes"] as? [String])
        #expect(MeeshyCollapsingHeroVariant.allCases.map(\.rawValue) == names)
    }

    @Test("la barre : rangée 44, marge 16, écart 12, titre 17 en ligne ou 20 en grand, nue ou de verre")
    func bar_measures() throws {
        let row = try KitEvolutionVectors.object(Self.file, "barre")
        #expect(MeeshyHeroBarRecipe.rowHeight == row["rangee"] as? Double)
        #expect(MeeshyHeroBarRecipe.horizontalInset == row["marge"] as? Double)
        #expect(MeeshyHeroBarRecipe.gap == row["ecart"] as? Double)
        #expect(MeeshyHeroBarRecipe.verticalInset == row["vertical"] as? Double)
        #expect(MeeshyHeroBarRecipe.subtitleSize == row["sousTitre"] as? Double)
        #expect(MeeshyHeroBarRecipe.titleSize(.inline) == row["titreEnLigne"] as? Double)
        #expect(MeeshyHeroBarRecipe.titleSize(.large) == row["grandTitre"] as? Double)
        #expect(MeeshyHeroBarSurface.allCases.map(\.rawValue) == row["surfaces"] as? [String])
        #expect(MeeshyHeroBarTitleStyle.allCases.map(\.rawValue) == row["titres"] as? [String])
        #expect(MeeshyHeroBarRecipe.rowHeight >= 44)
    }

    @Test("le grand titre est seul ; le titre en ligne porte son sous-titre s'il en a un")
    func bar_subtitle_followsTheStyle() throws {
        for row in try KitEvolutionVectors.rows(Self.file, "barreSousTitre") {
            let style = try #require(MeeshyHeroBarTitleStyle(rawValue: try #require(row["titre"] as? String)))
            let hasSubtitle = try #require(row["sousTitre"] as? Bool)
            #expect(MeeshyHeroBarRecipe.showsSubtitle(style, hasSubtitle: hasSubtitle) == row["montre"] as? Bool, "\(row)")
        }
    }

    @Test("la capsule : 44 de haut, 12 au début, 16 à la fin, 8 entre la marque et le titre de 16")
    func capsule_measures() throws {
        let row = try KitEvolutionVectors.object(Self.file, "capsule")
        #expect(MeeshyHeroBarRecipe.capsuleHeight == row["hauteur"] as? Double)
        #expect(MeeshyHeroBarRecipe.capsuleLeadingInset == row["debut"] as? Double)
        #expect(MeeshyHeroBarRecipe.capsuleTrailingInset == row["fin"] as? Double)
        #expect(MeeshyHeroBarRecipe.capsuleGap == row["ecart"] as? Double)
        #expect(MeeshyHeroBarRecipe.capsuleTitleSize == row["titre"] as? Double)
    }

    @Test("la capsule à deux lignes : 56 de haut, titre 19, sous-titre 12,5 ; ajustée ou pleine largeur")
    func capsule_twoLines_measures() throws {
        let row = try KitEvolutionVectors.object(Self.file, "capsuleDeuxLignes")
        #expect(MeeshyHeroBarRecipe.capsuleMinHeight(hasSubtitle: true) == row["hauteur"] as? Double)
        #expect(MeeshyHeroBarRecipe.capsuleTitleFontSize(hasSubtitle: true) == row["titre"] as? Double)
        #expect(MeeshyHeroBarRecipe.capsuleSubtitleSize == row["sousTitre"] as? Double)
        #expect(MeeshyHeroCapsuleWidth.allCases.map(\.rawValue) == row["largeurs"] as? [String])
        #expect(MeeshyHeroBarRecipe.capsuleMinHeight(hasSubtitle: false) == MeeshyHeroBarRecipe.capsuleHeight)
        #expect(MeeshyHeroBarRecipe.capsuleTitleFontSize(hasSubtitle: false) == MeeshyHeroBarRecipe.capsuleTitleSize)
        #expect(MeeshyHeroBarRecipe.capsuleMinHeight(hasSubtitle: true) >= 44)
        let twoLines = MeeshyHeroBarRecipe.capsuleInsets(hasSubtitle: true)
        #expect(twoLines.leading == row["debut"] as? Double)
        #expect(twoLines.trailing == row["fin"] as? Double)
        let oneLine = MeeshyHeroBarRecipe.capsuleInsets(hasSubtitle: false)
        let capsule = try KitEvolutionVectors.object(Self.file, "capsule")
        #expect(oneLine.leading == capsule["debut"] as? Double)
        #expect(oneLine.trailing == capsule["fin"] as? Double)
    }

    @Test("l'encre de la capsule suit le ton de son verre : un verre sombre porte l'encre claire, même en apparence claire")
    func capsule_ink_followsTheGlassTone() throws {
        for row in try KitEvolutionVectors.rows(Self.file, "capsuleEncre") {
            let toneName = try #require(row["ton"] as? String)
            let tone = try #require(MeeshyGlassTone(rawValue: toneName))
            let appearanceIsDark = try #require(row["apparenceSombre"] as? Bool)
            let inkIsDark = MeeshyHeroBarRecipe.capsuleInkIsDark(tone: tone, appearanceIsDark: appearanceIsDark)
            #expect(inkIsDark == row["encreClaire"] as? Bool, "\(row)")
        }
    }

    @Test("la capsule pleine passe avant les espaces qui centrent le titre ; ajustée, elle ne réclame rien")
    func capsule_fill_takesThePlaceBetweenTheCommands() throws {
        #expect(MeeshyHeroBarRecipe.capsuleLayoutPriority(.fill) > 0)
        #expect(MeeshyHeroBarRecipe.capsuleLayoutPriority(.fit) == 0)
        let code = try KitEvolutionVectors.code("MeeshyCollapsingHeroBar.swift")
        let priorities = code.components(separatedBy: ".layoutPriority(MeeshyHeroBarRecipe.capsuleLayoutPriority(width))").count - 1
        #expect(priorities == 2, "chaque forme de la capsule (bouton ou en-tête) porte sa priorité")
        #expect(code.contains("MeeshyHeroBarRecipe.capsuleInsets(hasSubtitle: hasSubtitle)"))
        #expect(code.contains("textSecondary(isDark: inkIsDark)"))
        #expect(code.contains("textPrimary(isDark: inkIsDark)"))
    }

    @Test("la capsule se lit d'un bloc : titre, étiquette, sous-titre ; une partie vide se tait")
    func capsule_spoken_followsTheVectors() throws {
        for row in try KitEvolutionVectors.rows(Self.file, "capsuleLue") {
            let title = try #require(row["titre"] as? String)
            let spoken = MeeshyHeroBarRecipe.capsuleSpoken(title: title,
                                                           badge: row["etiquette"] as? String,
                                                           subtitle: row["sousTitre"] as? String)
            #expect(spoken == row["lu"] as? String, "\(row)")
        }
    }

    @Test("la capsule pose son sous-titre et son étiquette par le kit")
    func source_capsuleCarriesSubtitleAndBadgeFromTheKit() throws {
        let code = try KitEvolutionVectors.code("MeeshyCollapsingHeroBar.swift")
        #expect(code.contains("MeeshyBadge(.label("))
        #expect(code.contains("MeeshyHeroBarRecipe.capsuleSubtitleSize"))
        #expect(code.contains("MeeshyHeroBarRecipe.capsuleSpoken("))
    }

    @Test("la barre et la capsule sont faites du kit : verre K01, titre en en-tête, aucune couleur en dur ni barre système")
    func source_barIsMadeOfTheKit() throws {
        let code = try KitEvolutionVectors.code("MeeshyCollapsingHeroBar.swift")
        #expect(code.contains(".meeshyGlass(in: Capsule()"))
        #expect(code.contains("MeeshyCollapsingHeroBarShape("))
        #expect(code.contains(".accessibilityAddTraits(.isHeader)"))
        for word in ["Color(hex:", "Color.white", "Color.black", ".navigationTitle(", "ToolbarItem", ".toolbar"] {
            #expect(!code.contains(word), "MeeshyCollapsingHeroBar.swift contient \(word)")
        }
    }
}
