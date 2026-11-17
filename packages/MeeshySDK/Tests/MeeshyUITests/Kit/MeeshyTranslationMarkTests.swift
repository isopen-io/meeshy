import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K51 — la marque de traduction lue comme des VALEURS : le mode déduit, la bascule
/// absente sans geste, les mesures, les mots dits dans la langue de l'interface.
/// La marque annonce ce que l'hôte rend ; elle ne résout rien et ne garde rien.
@Suite("MeeshyTranslationMark")
struct MeeshyTranslationMarkTests {

    private static let file = "K51-MeeshyTranslationMark"

    @Test("le mode se déduit du booléen de l'hôte ; announce se passe explicitement")
    func mode_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "modes") {
            let isOriginal = try #require(row["isShowingOriginal"] as? Bool)
            let explicit = (row["mode"] as? String).flatMap { MeeshyTranslationMarkMode(rawValue: $0) }
            let resolved = MeeshyTranslationMarkRecipe.resolveMode(explicit, isShowingOriginal: isOriginal)
            #expect(resolved.rawValue == row["attendu"] as? String, "\(row)")
        }
    }

    @Test("sans onToggle, en announce et en icon : jamais de bascule, quels que soient les paramètres")
    func toggle_neverPromisedWithoutAGesture() throws {
        for row in try KitAtomVectors.rows(Self.file, "bascule") {
            let density = try #require(MeeshyTranslationMarkDensity(rawValue: kitString(row, "densite")))
            let mode = try #require(MeeshyTranslationMarkMode(rawValue: kitString(row, "mode")))
            let recipe = Self.recipe(density: density, mode: mode, hasToggle: try #require(row["aBascule"] as? Bool))
            #expect(recipe.showsToggle == row["affichee"] as? Bool, "\(row)")
        }
    }

    @Test("le glyphe seul n'écrit aucune mention ; line et legend la portent")
    func mention_followsTheDensity() throws {
        for row in try KitAtomVectors.rows(Self.file, "mention") {
            let density = try #require(MeeshyTranslationMarkDensity(rawValue: kitString(row, "densite")))
            #expect(Self.recipe(density: density).showsMention == row["affichee"] as? Bool, "\(row)")
        }
    }

    @Test("les mesures de la fiche : glyphe 16, texte 12,5 (13 en annonce), graisses, écart 7, cible 44")
    func recipe_measures() throws {
        let measures = try #require(try KitAtomVectors.load(Self.file)["mesures"] as? [String: Double])
        let recipe = Self.recipe()
        #expect(recipe.glyphSize == measures["glyphe"])
        #expect(recipe.textSize == measures["texte"])
        #expect(Self.recipe(mode: .announce).textSize == measures["texteAnnonce"])
        #expect(recipe.mentionWeight == measures["graisseMention"].map(Int.init))
        #expect(recipe.toggleWeight == measures["graisseBascule"].map(Int.init))
        #expect(recipe.separatorSpacing == measures["ecart"])
        #expect(recipe.tapTarget == measures["cible"])
        #expect(recipe.crossfadeMilliseconds == measures["fonduMs"].map(Int.init))
    }

    @Test("l'original atténue le glyphe ; la traduction le laisse à l'accent")
    func recipe_glyphInk() {
        #expect(Self.recipe(mode: .original).glyphIsMuted)
        #expect(!Self.recipe(mode: .translated).glyphIsMuted)
    }

    @Test("à l'appui seule la bascule répond : échelle 0,94, encre à 62 % ; en cours elle s'efface à 50 % et ignore un second toucher")
    func recipe_pressAndPending() throws {
        let measures = try #require(try KitAtomVectors.load(Self.file)["mesures"] as? [String: Double])
        let pressed = Self.recipe(isPressed: true)
        #expect(pressed.toggleScale == measures["pressedScale"])
        #expect(pressed.toggleInkOpacity == measures["pressedInk"])
        #expect(Self.recipe(isPressed: false).toggleScale == 1)
        let pending = Self.recipe(isPending: true)
        #expect(pending.toggleOpacity == measures["pending"])
        #expect(!pending.acceptsToggle)
        #expect(Self.recipe().acceptsToggle)
    }

    @Test("quand la ligne ne tient plus, le point s'en va et la bascule passe dessous")
    func recipe_narrow() throws {
        let measures = try #require(try KitAtomVectors.load(Self.file)["mesures"] as? [String: Double])
        let narrow = try #require(measures["etroit"])
        let wide = Self.recipe(width: narrow + 1)
        #expect(!wide.wrapsToggle)
        #expect(wide.showsSeparator)
        let tight = Self.recipe(width: narrow - 1)
        #expect(tight.wrapsToggle)
        #expect(!tight.showsSeparator)
    }

    @Test("sous mouvement réduit : remplacement sec, aucun fondu")
    func recipe_reducedMotion() {
        #expect(Self.recipe(reduceMotion: true).crossfadeMilliseconds == 0)
    }

    @Test("la mention nomme la langue donnée par l'hôte, sans jamais la recomposer")
    @MainActor
    func words_areSpoken() throws {
        let fr = try KitAtomVectors.lproj("fr", bundle: .module)
        let locale = Locale(identifier: "fr")
        #expect(MeeshyTranslationMarkWords.mention(mode: .translated, languageName: "de l'italien", bundle: fr, locale: locale) == "Traduit de l'italien")
        #expect(MeeshyTranslationMarkWords.mention(mode: .original, languageName: "en italien", bundle: fr, locale: locale) == "Original en italien")
        #expect(MeeshyTranslationMarkWords.mention(mode: .translated, languageName: nil, bundle: fr, locale: locale) == "Traduit")
        #expect(MeeshyTranslationMarkWords.mention(mode: .original, languageName: "", bundle: fr, locale: locale) == "Original")
        #expect(MeeshyTranslationMarkWords.toggle(mode: .translated, bundle: fr, locale: locale) == "Voir l'original")
        #expect(MeeshyTranslationMarkWords.toggle(mode: .original, bundle: fr, locale: locale) == "Voir la traduction")
        #expect(MeeshyTranslationMarkWords.toggleValue(mode: .translated, bundle: fr, locale: locale) == "traduction affichée")
        #expect(MeeshyTranslationMarkWords.toggleValue(mode: .original, bundle: fr, locale: locale) == "original affiché")
    }

    @Test("garde de source : aucun type du domaine, aucun code de langue, aucun résolveur du Prisme, aucun singleton, aucun verre dessiné")
    func source_isAnAgnosticAtom() throws {
        for file in ["MeeshyTranslationMark.swift", "MeeshyTranslationMarkRecipe.swift"] {
            let source = try KitAtomVectors.code(file)
            for forbidden in [".shared", "MeeshyUser", "MeeshyMessage", "ReaderPrism", "preferredLanguages",
                              "resolvePrism", "Locale.current.language", "ThemeManager", "Color(hex:",
                              ".shadow(", ".blur(", "UltraThinMaterial", ".glassEffect"] {
                #expect(!source.contains(forbidden), "\(file) contient \(forbidden)")
            }
        }
    }

    private func kitString(_ row: [String: Any], _ key: String) -> String {
        row[key] as? String ?? ""
    }

    private static func recipe(density: MeeshyTranslationMarkDensity = .line,
                               mode: MeeshyTranslationMarkMode = .translated,
                               hasToggle: Bool = true,
                               isPressed: Bool = false,
                               isPending: Bool = false,
                               width: Double = 390,
                               reduceMotion: Bool = false) -> MeeshyTranslationMarkRecipe {
        MeeshyTranslationMarkRecipe.resolve(density: density, mode: mode, hasToggle: hasToggle, isPressed: isPressed,
                                            isPending: isPending, width: width, reduceMotion: reduceMotion)
    }
}
