import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K23 — le survol au pointeur (iPad-Split) : la recette en VALEURS lue depuis
/// les vecteurs de parité, ses états (repos, survolé, éteint, « réduire les
/// animations »), puis les gardes de source qui prouvent que K02, K32 et K40
/// l'appliquent par l'unique entrée du kit, sans la redessiner.
@Suite("MeeshySelectionFeedback — survol au pointeur")
struct MeeshySelectionFeedbackHoverTests {

    @Test("la recette du survol : soulèvement 1,08, anneau 7 pt à 20 %, ombre 14/34 à 50 %, fondu 150/100 ms")
    func recipe_followsTheVectors() throws {
        let recipe = try kitRequired(try Self.hover()["recette"] as? [String: Any])
        let ring = try kitRequired(recipe["anneau"] as? [String: Double])
        let shadow = try kitRequired(recipe["ombre"] as? [String: Double])
        let fade = try kitRequired(recipe["fondu"] as? [String: Double])
        let scale = try kitRequired(recipe["echelle"] as? Double)
        #expect(abs(Double(MeeshyPointerLiftRecipe.liftScale) - scale) < 1e-9)
        #expect(Double(MeeshyPointerLiftRecipe.ringWidth) == ring["epaisseur"])
        #expect(MeeshyPointerLiftRecipe.ringOpacity == ring["opacite"])
        #expect(Double(MeeshyPointerLiftRecipe.shadowBlur) == shadow["flou"])
        #expect(Double(MeeshyPointerLiftRecipe.shadowRadius) == shadow["rayon"])
        #expect(Double(MeeshyPointerLiftRecipe.shadowOffsetY) == shadow["decalageY"])
        #expect(MeeshyPointerLiftRecipe.shadowOpacity == shadow["opacite"])
        #expect(MeeshyPointerLiftRecipe.fadeIn == fade["apparition"])
        #expect(MeeshyPointerLiftRecipe.fadeOut == fade["retrait"])
    }

    @Test("le rayon SwiftUI de l'ombre est la moitié du flou de la planche")
    func recipe_shadowRadius_isHalfTheBlur() {
        #expect(MeeshyPointerLiftRecipe.shadowRadius * 2 == MeeshyPointerLiftRecipe.shadowBlur)
    }

    @Test("chaque état des vecteurs : échelle, anneau, ombre, aimantation et animation")
    func paint_followsTheVectors() throws {
        let rows = try kitRequired(try Self.hover()["etats"] as? [[String: Any]])
        #expect(rows.count >= 6)
        for row in rows {
            let name = try kitRequired(row["nom"] as? String)
            let isHovered = try kitRequired(row["survole"] as? Bool)
            let isEnabled = try kitRequired(row["actif"] as? Bool)
            let reduce = try kitRequired(row["reduit"] as? Bool)
            let expected = try kitRequired(row["attendu"] as? [String: Any])
            let paint = MeeshyPointerLiftRecipe.paint(isHovered: isHovered, isEnabled: isEnabled, reduceMotion: reduce)
            let scale = try kitRequired(expected["echelle"] as? Double)
            let ring = try kitRequired(expected["anneau"] as? Double)
            let shadow = try kitRequired(expected["ombre"] as? Double)
            let magnet = try kitRequired(expected["aimante"] as? Bool)
            let animated = try kitRequired(expected["anime"] as? Bool)
            #expect(abs(Double(paint.scale) - scale) < 1e-9, "\(name)")
            #expect(abs(paint.ringOpacity - ring) < 1e-9, "\(name)")
            #expect(abs(paint.shadowOpacity - shadow) < 1e-9, "\(name)")
            #expect(paint.magnetizes == magnet, "\(name)")
            let fade = MeeshyPointerLiftRecipe.fade(appearing: isHovered, reduceMotion: reduce)
            #expect((fade != nil) == animated, "\(name)")
        }
    }

    @Test("« réduire les animations » : rien ne bouge, ni soulèvement, ni ombre, ni fondu — l'anneau seul dit le survol")
    func paint_reducedMotion_staysStill() {
        let paint = MeeshyPointerLiftRecipe.paint(isHovered: true, isEnabled: true, reduceMotion: true)
        #expect(paint.scale == 1)
        #expect(paint.shadowOpacity == 0)
        #expect(paint.ringOpacity == MeeshyPointerLiftRecipe.ringOpacity)
        #expect(!paint.magnetizes)
        #expect(MeeshyPointerLiftRecipe.fade(appearing: true, reduceMotion: true) == nil)
        #expect(MeeshyPointerLiftRecipe.fade(appearing: false, reduceMotion: true) == nil)
    }

    @Test("le fondu : 150 ms à l'apparition, 100 ms au retrait")
    func fade_followsTheSheet() {
        #expect(MeeshyPointerLiftRecipe.fade(appearing: true, reduceMotion: false) == .easeOut(duration: 0.15))
        #expect(MeeshyPointerLiftRecipe.fade(appearing: false, reduceMotion: false) == .easeOut(duration: 0.1))
    }

    @Test("un bouton éteint ne se soulève pas et n'aimante pas le pointeur")
    func paint_disabled_paintsNothing() {
        let paint = MeeshyPointerLiftRecipe.paint(isHovered: true, isEnabled: false, reduceMotion: false)
        #expect(paint == MeeshyPointerLiftRecipe.paint(isHovered: false, isEnabled: false, reduceMotion: false))
        #expect(paint.scale == 1 && paint.ringOpacity == 0 && paint.shadowOpacity == 0 && !paint.magnetizes)
    }

    @Test("les trois commandes que nomment les vecteurs appliquent la recette par l'unique entrée du kit")
    func source_commandsApplyTheRecipe() throws {
        let named = try kitRequired(try Self.hover()["appliquentLaRecette"] as? [String])
        #expect(named == ["K02", "K32", "K40"])
        let glass = try KitAtomVectors.code("MeeshyGlassButton.swift")
        #expect(glass.contains(".meeshyPointerLift(in: Circle()"))
        let button = try KitAtomVectors.code("MeeshyButton.swift")
        #expect(button.contains(".meeshyPointerLift(in: Capsule()"))
        let labeled = try KitAtomVectors.code("MeeshyLabeledAction.swift")
        #expect(labeled.contains(".meeshyPointerLift(in: Circle()"))
        #expect(labeled.contains(".meeshyPointerMagnet(in:"))
    }

    @Test("aucune commande ne redessine le survol : ni hoverEffect, ni soulèvement, ni ombre de survol sur place")
    func source_commandsDoNotRedrawTheHover() throws {
        for file in ["MeeshyGlassButton.swift", "MeeshyButton.swift", "MeeshyLabeledAction.swift"] {
            let code = try KitAtomVectors.code(file)
            for word in [".hoverEffect(", "1.08", "contentShape(.hoverEffect"] {
                #expect(!code.contains(word), "\(file) contient \(word)")
            }
        }
    }

    @Test("la recette aimante par le système (highlight sur la forme) et lit les deux moitiés de « réduire les animations »")
    func source_magnetAndReduceMotion() throws {
        let code = try KitAtomVectors.code("MeeshySelectionFeedbackHover.swift")
        #expect(code.contains("contentShape(.hoverEffect, shape)"))
        #expect(code.contains(".hoverEffect(.highlight)"))
        #expect(code.contains("hoverEffectDisabled("))
        #expect(code.contains("accessibilityReduceMotion"))
        #expect(code.contains("meeshyForceReduceMotion"))
        #expect(code.contains("MeeshyMotion.shouldReduce("))
        #expect(code.contains(".allowsHitTesting(false)"))
        for word in ["Color(hex:", "Color(red:", "Color.white", "Color.black", "UIColor", ".frame(", "GeometryReader", "Timer"] {
            #expect(!code.contains(word), "MeeshySelectionFeedbackHover.swift contient \(word)")
        }
    }

    // MARK: - Aides

    private static func hover() throws -> [String: Any] {
        try kitRequired(try KitAtomVectors.load("K23-MeeshySelectionFeedback")["survol"] as? [String: Any])
    }
}
