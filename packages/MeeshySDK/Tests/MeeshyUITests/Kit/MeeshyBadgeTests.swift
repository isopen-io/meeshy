import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K41 — la pastille lue comme des VALEURS : la loi du compte (portillon,
/// plafond « 99+ », vrai nombre dit), la recette par taille, le sens des genres
/// (un compte à rattraper est err, jamais l'accent), l'état périmé et le
/// toucher, puis les gardes de source.
@Suite("MeeshyBadge")
struct MeeshyBadgeTests {

    private static let file = "K41-MeeshyBadge"

    @Test("portillon et plafond : 0 ou négatif = rien, 100 = « 99+ », le vrai nombre est dit")
    func count_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "compte") {
            let count = try #require(row["compte"] as? Int)
            let cap = try #require(row["cap"] as? Int)
            #expect(MeeshyBadgeCount.text(count, cap: cap) == row["texte"] as? String, "\(row)")
            #expect(MeeshyBadgeCount.spoken(count, cap: cap) == row["dit"] as? Int, "\(row)")
            #expect(MeeshyBadgeCount.isVisible(count) == (row["texte"] as? String != nil), "\(row)")
        }
    }

    @Test("le plafond ne tronque jamais le nombre dit : jamais min(count, 99)")
    func count_neverClampsTheSpokenNumber() {
        #expect(MeeshyBadgeCount.spoken(100, cap: 99) == 100)
        #expect(MeeshyBadgeCount.text(100, cap: 99) == "99+")
    }

    @Test("hauteur, corps et marge des quatre tailles ; un compte garde un plancher carré")
    func recipe_sizes_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "tailles") {
            let raw = try #require(row["taille"] as? Int)
            let size = try #require(MeeshyBadgeSize(rawValue: raw))
            let recipe = Self.recipe(size: size)
            #expect(recipe.height == row["hauteur"] as? Double, "\(row)")
            #expect(recipe.fontSize == row["corps"] as? Double, "\(row)")
            #expect(recipe.horizontalPadding == row["marge"] as? Double, "\(row)")
            #expect(recipe.cornerRadius == recipe.height / 2, "\(row)")
            #expect(recipe.minimumWidth == recipe.height, "\(row)")
        }
    }

    @Test("la teinte est un sens : un compte à rattraper est err, même sur un accent turquoise")
    func recipe_kind_isAMeaning() throws {
        let vectors = try KitAtomVectors.load(Self.file)
        #expect(MeeshyBadgeRecipe.tonalPercent == vectors["teintePourcent"] as? Int)
        let overdue = MeeshyBadgeRecipe.countKind(isOverdue: true)
        #expect(overdue == .err)
        #expect(MeeshyBadgeRecipe.countKind(isOverdue: false) == .neutral)
        for kind in MeeshyBadgeKind.allCases {
            let recipe = Self.recipe(kind: kind)
            #expect(recipe.kind == kind)
            #expect(recipe.usesAmbientAccent == (kind == .accent))
        }
        #expect(Self.recipe(kind: .err, tint: true).usesAmbientAccent == false)
    }

    @Test("surfaces : tonal teinte à 16 %, solid plein, outline filet, glass demandé au verre ; aucun flou hors glass")
    func recipe_surfaces() {
        #expect(Self.recipe(surface: .tonal).fillOpacity == 0.16)
        #expect(Self.recipe(surface: .solid).fillOpacity == 1)
        #expect(Self.recipe(surface: .outline).fillOpacity == 0)
        #expect(Self.recipe(surface: .outline).borderWidth > 0)
        #expect(Self.recipe(surface: .glass).usesGlass)
        for surface in [MeeshyBadgeSurface.tonal, .solid, .outline] {
            #expect(!Self.recipe(surface: surface).usesGlass, "\(surface)")
        }
    }

    @Test("périmé : désaturé à 62 % ; courant : bord d'accent")
    func recipe_staleAndCurrent() throws {
        let vectors = try KitAtomVectors.load(Self.file)
        #expect(Self.recipe(isStale: true).opacity == vectors["perimeeOpacite"] as? Double)
        #expect(Self.recipe(isStale: true).isDesaturated)
        #expect(Self.recipe().opacity == 1)
        #expect(Self.recipe(isCurrent: true).borderWidth > Self.recipe().borderWidth)
    }

    @Test("inerte : un texte sans rôle ; avec onPress : un bouton, cible de 44 sans changer l'encombrement")
    func recipe_interactive() throws {
        let vectors = try KitAtomVectors.load(Self.file)
        let inert = Self.recipe()
        #expect(!inert.isButton)
        #expect(inert.tapHeight == inert.height)
        let live = Self.recipe(isInteractive: true)
        #expect(live.isButton)
        #expect(live.tapHeight == vectors["cibleTactile"] as? Double)
        #expect(live.height == inert.height)
    }

    @Test("multi-ligne : pleine largeur, rayon 14")
    func recipe_multiline() throws {
        let vectors = try KitAtomVectors.load(Self.file)
        let multi = MeeshyBadgeRecipe.resolve(surface: .tonal, kind: .neutral, hasTint: false, size: .s22,
                                              shape: .capsule, isMultiline: true, isCurrent: false,
                                              isStale: false, isInteractive: false, isPressed: false)
        #expect(multi.cornerRadius == vectors["rayonMultiLigne"] as? Double)
        #expect(multi.fillsWidth)
    }

    @Test("garde de source : aucun type du domaine, aucun singleton, aucune couleur en dur")
    func source_isAnAgnosticAtom() throws {
        for file in ["MeeshyBadge.swift", "MeeshyBadgeRecipe.swift"] {
            let source = try KitAtomVectors.code(file)
            for forbidden in ["Color(hex:", "Color(red:", ".shared", "MeeshyUser", "MeeshyConversation",
                              "ThemeManager", "UIVisualEffectView"] {
                #expect(!source.contains(forbidden), "\(file) contient \(forbidden)")
            }
        }
    }

    private static func recipe(surface: MeeshyBadgeSurface = .tonal,
                               kind: MeeshyBadgeKind = .neutral,
                               tint: Bool = false,
                               size: MeeshyBadgeSize = .s22,
                               isCurrent: Bool = false,
                               isStale: Bool = false,
                               isInteractive: Bool = false,
                               isPressed: Bool = false) -> MeeshyBadgeRecipe {
        MeeshyBadgeRecipe.resolve(surface: surface, kind: kind, hasTint: tint, size: size, shape: .capsule,
                                  isMultiline: false, isCurrent: isCurrent, isStale: isStale,
                                  isInteractive: isInteractive, isPressed: isPressed)
    }
}
