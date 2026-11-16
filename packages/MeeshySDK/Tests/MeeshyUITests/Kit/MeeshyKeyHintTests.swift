import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K55 — la touche de raccourci lue comme des VALEURS : la loi des glyphes
/// selon la machine, la voix, la présence sans trace, les mesures, la légende
/// (jamais de filet en tête ni en fin), puis les gardes de source.
@Suite("MeeshyKeyHint")
struct MeeshyKeyHintTests {

    private static let file = "K55-MeeshyKeyHint"

    @Test("primary rend la boucle de Commande sur Apple et « Ctrl » ailleurs, depuis la même entrée")
    func glyphs_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "glyphes") {
            let keys = try (row["touches"] as? [String] ?? []).map(Self.key)
            let platform = try #require(MeeshyKeyPlatform(rawValue: try #require(row["plateforme"] as? String)))
            let rtl = row["rtl"] as? Bool ?? false
            let glyphs = MeeshyKeyHintRule.glyphs(keys: keys, platform: platform, isRightToLeft: rtl)
            #expect(glyphs == row["glyphes"] as? [String], "\(row)")
        }
    }

    @Test("la voix dit « Commande M » ; le nom de la touche vient de la langue")
    @MainActor
    func spoken_followsTheVectors() throws {
        let fr = try KitAtomVectors.lproj("fr", bundle: .module)
        let locale = Locale(identifier: "fr")
        for row in try KitAtomVectors.rows(Self.file, "glyphes") {
            let keys = try (row["touches"] as? [String] ?? []).map(Self.key)
            let platform = try #require(MeeshyKeyPlatform(rawValue: try #require(row["plateforme"] as? String)))
            let rtl = row["rtl"] as? Bool ?? false
            let spoken = MeeshyKeyHintRule.spoken(keys: keys, platform: platform, isRightToLeft: rtl,
                                                  bundle: fr, locale: locale)
            #expect(spoken == row["dit"] as? String, "\(row)")
        }
        let prefixed = MeeshyKeyHintRule.spokenWithPrefix(keys: [.primary, .character("m")], platform: .apple,
                                                          prefix: nil, bundle: fr, locale: locale)
        #expect(prefixed == "raccourci : Commande M")
        #expect(MeeshyKeyHintRule.spokenWithPrefix(keys: [.escape], platform: .other, prefix: "shortcut",
                                                   bundle: fr, locale: locale) == "shortcut : Échap")
    }

    @Test("sans clavier ou hôte désactivé : rien n'est rendu")
    func presence_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "presence") {
            let shown = MeeshyKeyHintRule.isShown(hasKeyboard: row["clavier"] as? Bool ?? false,
                                                  isEnabled: row["actif"] as? Bool ?? false)
            #expect(shown == row["montre"] as? Bool, "\(row)")
        }
        #expect(!MeeshyKeyHintRule.isShown(hasKeyboard: true, isEnabled: true, keys: []))
        #expect(MeeshyKeyHintRule.isShown(hasKeyboard: true, isEnabled: true, keys: [.character("k")]))
        #expect(MeeshyKeyHintRule.maximumKeys == 3)
        #expect(MeeshyKeyHintRule.limited([.shift, .primary, .option, .character("z")]).count == 3)
    }

    @Test("mesures de la touche : 26 et 20, lèvre, caractère, écart")
    func recipe_measures_followTheVectors() throws {
        let measures = try #require(try KitAtomVectors.load(Self.file)["mesures"] as? [String: [String: Double]])
        for (name, size) in [("regular", MeeshyKeyHintSize.regular), ("compact", .compact)] {
            let expected = try #require(measures[name])
            let recipe = Self.recipe(size: size)
            #expect(recipe.side == expected["cote"], name)
            #expect(recipe.cornerRadius == expected["rayon"], name)
            #expect(recipe.lipWidth == expected["levre"], name)
            #expect(recipe.characterSize == expected["caractere"], name)
            #expect(recipe.combinationGap == expected["ecart"], name)
            #expect(recipe.minimumWidth == recipe.side, name)
        }
    }

    @Test("enfoncé : la teinte change, la touche ne bouge pas sous mouvement réduit, la lèvre reste")
    func recipe_pressed() {
        let rest = Self.recipe()
        let pressed = Self.recipe(isPressed: true)
        #expect(pressed.isPressed && !rest.isPressed)
        #expect(pressed.lipWidth == rest.lipWidth)
        #expect(pressed.pressOffset > 0)
        #expect(Self.recipe(isPressed: true, reduceMotion: true).pressOffset == 0)
        #expect(rest.pressOffset == 0)
    }

    @Test("la touche ne reçoit ni toucher, ni survol, ni focus : elle est muette pour la voix")
    func recipe_inert() {
        let recipe = Self.recipe()
        #expect(!recipe.isHittable)
        #expect(recipe.isHiddenFromVoiceOver)
    }

    @Test("la légende : filet entre deux groupes seulement, jamais en tête ni en fin, une paire ne se coupe pas")
    func legend_followsTheVectors() throws {
        let legend = try #require(try KitAtomVectors.load(Self.file)["legende"] as? [String: Any])
        let rule = try #require(legend["filet"] as? [String: Double])
        let bar = try #require(legend["barre"] as? [String: Double])
        #expect(MeeshyKeyLegendLaw.pairSpacing == legend["ecartPaire"] as? Double)
        #expect(MeeshyKeyLegendLaw.ruleWidth == rule["largeur"])
        #expect(MeeshyKeyLegendLaw.ruleHeight == rule["hauteur"])
        #expect(MeeshyKeyLegendLaw.groupSpacing == legend["ecartGroupe"] as? Double)
        #expect(MeeshyKeyLegendLaw.barHeight == bar["hauteur"])
        #expect(MeeshyKeyLegendLaw.barCornerRadius == bar["rayon"])

        let items = [
            MeeshyKeyLegendItem(id: "a", combos: [[.primary, .character("m")]], title: "Carte", startsGroup: true),
            MeeshyKeyLegendItem(id: "b", combos: [[.character("1")], [.character("2")]], title: "Écrire"),
            MeeshyKeyLegendItem(id: "c", combos: [[.escape]], title: "Fermer", startsGroup: true),
        ]
        let elements = MeeshyKeyLegendLaw.elements(items)
        #expect(elements.map(\.id) == ["a", "b", "rule-c", "c"])
        #expect(elements.first?.isRule == false)
        #expect(elements.last?.isRule == false)
        #expect(MeeshyKeyLegendLaw.elements([]).isEmpty)
        #expect(!MeeshyKeyLegendLaw.rendersContainer(itemCount: 0))
        #expect(MeeshyKeyLegendLaw.rendersContainer(itemCount: 2))
    }

    @Test("garde de source : aucun écouteur de clavier, aucun type du domaine, aucun verre dessiné, aucune couleur en dur")
    func source_isAnAgnosticAtom() throws {
        for file in ["MeeshyKeyHint.swift", "MeeshyKeyHintRecipe.swift"] {
            let source = try KitAtomVectors.code(file)
            for forbidden in ["keyboardShortcut", "onKeyPress", "UIKeyCommand", "NotificationCenter",
                              "UIVisualEffectView", ".ultraThinMaterial", "Color(hex:", ".shared",
                              "MeeshyUser", "MeeshyConversation", "ThemeManager"] {
                #expect(!source.contains(forbidden), "\(file) contient \(forbidden)")
            }
        }
    }

    private static func key(_ name: String) throws -> MeeshyKey {
        switch name {
        case "primary": return .primary
        case "shift": return .shift
        case "option": return .option
        case "control": return .control
        case "enter": return .enter
        case "escape": return .escape
        case "space": return .space
        case "tab": return .tab
        case "delete": return .delete
        case "up": return .up
        case "down": return .down
        case "left": return .left
        case "right": return .right
        default: return .character(name)
        }
    }

    private static func recipe(size: MeeshyKeyHintSize = .regular,
                               isPressed: Bool = false,
                               reduceMotion: Bool = false) -> MeeshyKeyHintRecipe {
        MeeshyKeyHintRecipe.resolve(size: size, isPressed: isPressed, reduceMotion: reduceMotion)
    }
}
