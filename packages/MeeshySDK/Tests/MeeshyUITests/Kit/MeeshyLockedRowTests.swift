import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K37 — la rangée verrouillée lue comme des VALEURS : forme, pointillé, cadenas,
/// geste, ouverture jouée une fois, mots dits, puis les gardes de source. La rangée
/// ne reçoit jamais une donnée protégée : trois textes, un glyphe, un geste.
@Suite("MeeshyLockedRow")
struct MeeshyLockedRowTests {

    private static let file = "K37-MeeshyLockedRow"

    @Test("chaque forme rend le rayon, la hauteur minimale et la place du glyphe du tableau")
    func recipe_forms_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "formes") {
            let name = try #require(row["forme"] as? String)
            let form = try #require(MeeshyLockedRowForm(rawValue: name))
            let recipe = Self.recipe(form: form)
            #expect(recipe.cornerRadius == row["rayon"] as? Double, "\(row)")
            #expect(recipe.minimumHeight == row["hauteurMin"] as? Double, "\(row)")
            #expect(recipe.showsThingGlyph == row["glyphe"] as? Bool, "\(row)")
        }
    }

    @Test("le pointillé fait 1,5 de trait, des tirets de 5 pour 4,4 ; le cadenas 22 (16 en ligne) ; la cible 44")
    func recipe_measures() throws {
        let measures = try #require(try KitAtomVectors.load(Self.file)["mesures"] as? [String: Double])
        let recipe = Self.recipe()
        #expect(recipe.strokeWidth == measures["trait"])
        #expect(recipe.dash == [measures["tiret"], measures["creux"]].compactMap { $0 })
        #expect(recipe.lockSize == measures["cadenas"])
        #expect(Self.recipe(form: .inline).lockSize == measures["cadenasInline"])
        #expect(recipe.actionHeight == measures["cible"])
        #expect(recipe.thingGlyphSize == measures["glypheTuile"])
    }

    @Test("fermé : cadenas et pointillé ; ouvert : trait plein, plus de cadenas, même encombrement")
    func recipe_openAndClosed() throws {
        for row in try KitAtomVectors.rows(Self.file, "etats") {
            let isOpen = try #require(row["ouvert"] as? Bool)
            let recipe = Self.recipe(isOpen: isOpen)
            #expect(recipe.showsLock == row["cadenas"] as? Bool, "\(row)")
            #expect(recipe.isDashed == row["pointille"] as? Bool, "\(row)")
        }
        #expect(Self.recipe(isOpen: true).minimumHeight == Self.recipe(isOpen: false).minimumHeight)
    }

    @Test("le geste est une capsule active ; en cours ou fait, il ne reçoit plus de toucher")
    func recipe_action() throws {
        for row in try KitAtomVectors.rows(Self.file, "geste") {
            let recipe = Self.recipe(hasAction: try #require(row["aGeste"] as? Bool),
                                     isPending: try #require(row["enCours"] as? Bool),
                                     isDone: try #require(row["fait"] as? Bool))
            #expect(recipe.actionIsActive == row["actif"] as? Bool, "\(row)")
        }
        #expect(!Self.recipe(form: .inline, hasAction: true).showsAction)
        #expect(Self.recipe(hasAction: true).showsAction)
        #expect(!Self.recipe(hasAction: false).showsAction)
    }

    @Test("sans onPress la rangée est un texte, avec elle un bouton ; désactivée, ni l'un ni l'autre")
    func recipe_press() {
        #expect(!Self.recipe(isPressable: false).isButton)
        #expect(Self.recipe(isPressable: true).isButton)
        #expect(!Self.recipe(isPressable: true, isEnabled: false).isButton)
        #expect(Self.recipe(isPressable: true, isPressed: true).pressedScale < 1)
        #expect(Self.recipe(isPressable: false, isPressed: true).pressedScale == 1)
    }

    @Test("l'ouverture se joue une seule fois")
    func unlock_playsOnce() throws {
        for row in try KitAtomVectors.rows(Self.file, "ouverture") {
            let step = MeeshyLockedRowRecipe.unlockStep(isUnlocking: try #require(row["enOuverture"] as? Bool),
                                                        hasPlayed: try #require(row["dejaJouee"] as? Bool))
            #expect(step.rawValue == row["etape"] as? String, "\(row)")
        }
    }

    @Test("sous mouvement réduit : fondu de 160 ms, aucun tiret animé ; seule l'ouverture anime les tirets")
    func recipe_reducedMotion() {
        #expect(Self.recipe(isUnlocking: true, reduceMotion: true).unlockFadeMilliseconds == 160)
        #expect(!Self.recipe(isUnlocking: true, reduceMotion: true).animatesDash)
        #expect(Self.recipe(isUnlocking: true, reduceMotion: false).animatesDash)
        #expect(!Self.recipe(isUnlocking: false, reduceMotion: false).animatesDash)
        #expect(Self.recipe(reduceMotion: false).unlockFadeMilliseconds > 160)
    }

    @Test("le nom dit : « Présence, verrouillé, dès Ami » ; ouvert : « Présence, déverrouillé »")
    @MainActor
    func words_areSpoken() throws {
        let fr = try KitAtomVectors.lproj("fr", bundle: .module)
        let locale = Locale(identifier: "fr")
        #expect(MeeshyLockedRowWords.spokenLabel(title: "Présence", requirement: "dès Ami", isOpen: false, bundle: fr, locale: locale)
            == "Présence, verrouillé, dès Ami")
        #expect(MeeshyLockedRowWords.spokenLabel(title: "Présence", requirement: "dès Ami", isOpen: true, bundle: fr, locale: locale)
            == "Présence, déverrouillé")
        #expect(MeeshyLockedRowWords.actionValue(isPending: true, isDone: false, bundle: fr, locale: locale) != nil)
        #expect(MeeshyLockedRowWords.actionValue(isPending: false, isDone: false, bundle: fr, locale: locale) == nil)
    }

    @Test("garde de source : aucune donnée protégée en paramètre, aucun flou, aucun masque, aucun type du domaine")
    func source_holdsNothingBehindTheDashes() throws {
        for file in ["MeeshyLockedRow.swift", "MeeshyLockedRowRecipe.swift"] {
            let source = try KitAtomVectors.code(file)
            for forbidden in [".blur(", ".mask(", ".shadow(", "redacted", "Image(uiImage", "AsyncImage", "URL",
                              ".shared", "MeeshyUser", "MeeshyConversation", "RelationLevel", "ThemeManager", "Color(hex:"] {
                #expect(!source.contains(forbidden), "\(file) contient \(forbidden)")
            }
        }
        let recipeSource = try KitAtomVectors.code("MeeshyLockedRowRecipe.swift")
        #expect(recipeSource.contains("MeeshyLockedRowRecipe"))
    }

    private static func recipe(form: MeeshyLockedRowForm = .row,
                               hasAction: Bool = false,
                               isPending: Bool = false,
                               isDone: Bool = false,
                               isOpen: Bool = false,
                               isPressable: Bool = false,
                               isPressed: Bool = false,
                               isEnabled: Bool = true,
                               isUnlocking: Bool = false,
                               reduceMotion: Bool = false) -> MeeshyLockedRowRecipe {
        MeeshyLockedRowRecipe.resolve(form: form, hasAction: hasAction, isPending: isPending, isDone: isDone,
                                      isOpen: isOpen, isPressable: isPressable, isPressed: isPressed,
                                      isEnabled: isEnabled, isUnlocking: isUnlocking, reduceMotion: reduceMotion)
    }
}
