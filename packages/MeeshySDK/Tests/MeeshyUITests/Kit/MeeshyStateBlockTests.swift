import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K38 — le bloc d'état : une erreur a toujours une sortie, un vide plein écran
/// aussi, le genre fixe la teinte et l'annonce, la forme compacte tient dans une rangée.
@Suite("MeeshyStateBlock")
struct MeeshyStateBlockTests {

    private static let file = "K38-MeeshyStateBlock"

    private static func kind(_ name: String) -> MeeshyStateBlockKind {
        switch name {
        case "error": return .error
        case "denied": return .denied
        case "offline": return .offline
        case "success": return .success
        default: return .empty
        }
    }

    private static func recipe(kind: MeeshyStateBlockKind = .empty,
                               size: MeeshyStateBlockSize = .regular,
                               hasPrimary: Bool = true,
                               hasSecondary: Bool = false,
                               hasMessage: Bool = true,
                               isPending: Bool = false,
                               isOverContent: Bool = false,
                               isDark: Bool = true,
                               reduceTransparency: Bool = false) -> MeeshyStateBlockRecipe? {
        MeeshyStateBlockRecipe.resolve(kind: kind, size: size, hasPrimary: hasPrimary, hasSecondary: hasSecondary,
                                       hasMessage: hasMessage, isPending: isPending, isOverContent: isOverContent,
                                       isDark: isDark, reduceTransparency: reduceTransparency)
    }

    @Test("la recette refuse de se résoudre sans la sortie que le genre exige")
    func refusal_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "refus") {
            let name = try #require(row["genre"] as? String)
            let size: MeeshyStateBlockSize = (row["taille"] as? String) == "compact" ? .compact : .regular
            let hasPrimary = try #require(row["primaire"] as? Bool)
            let resolved = Self.recipe(kind: Self.kind(name), size: size, hasPrimary: hasPrimary) != nil
            #expect(resolved == (row["resolu"] as? Bool), "\(row)")
        }
    }

    @Test("chaque genre fixe sa teinte ; error et offline sont dits à l'apparition")
    func kinds_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "genres") {
            let name = try #require(row["genre"] as? String)
            let recipe = try #require(Self.recipe(kind: Self.kind(name)))
            #expect(recipe.tone.rawValue == row["ton"] as? String, "\(row)")
            #expect(recipe.announcesOnAppear == (row["annonce"] as? Bool), "\(row)")
        }
    }

    @Test("le halo n'existe qu'en regular, en thème sombre, sans réduire la transparence")
    func halo_rules() throws {
        #expect(try #require(Self.recipe()).showsHalo)
        #expect(try !#require(Self.recipe(size: .compact, hasPrimary: false)).showsHalo)
        #expect(try !#require(Self.recipe(isDark: false)).showsHalo)
        #expect(try !#require(Self.recipe(reduceTransparency: true)).showsHalo)
    }

    @Test("posée sur un contenu estompé, l'erreur perd son fantôme et garde sa sortie")
    func overContent_dropsTheArt() throws {
        let over = try #require(Self.recipe(kind: .error, isOverContent: true))
        #expect(!over.showsArt)
        #expect(!over.showsHalo)
        #expect(over.showsPrimary)
        #expect(try #require(Self.recipe(kind: .error)).showsArt)
    }

    @Test("la compacte est une rangée de 60 sans image ni halo ni phrase")
    func compact_isARow() throws {
        let compact = try #require(Self.recipe(size: .compact, hasPrimary: false))
        #expect(compact.rowHeight == 60)
        #expect(!compact.showsArt)
        #expect(!compact.showsHalo)
        #expect(!compact.showsMessage)
        #expect(try #require(Self.recipe()).rowHeight == nil)
    }

    @Test("sans sortie principale, le lien prend sa place ; la phrase est facultative")
    func secondary_promotion() throws {
        let alone = try #require(Self.recipe(kind: .denied, hasPrimary: false, hasSecondary: true))
        #expect(alone.secondaryIsPromoted)
        #expect(alone.showsPrimary == false)
        let both = try #require(Self.recipe(kind: .denied, hasPrimary: true, hasSecondary: true))
        #expect(!both.secondaryIsPromoted && both.showsSecondary && both.showsPrimary)
        #expect(try !#require(Self.recipe(hasMessage: false)).showsMessage)
    }

    @Test("la sortie principale fait 50, la seconde 44 ; en attente, la principale ne répond plus")
    func actions_metrics() throws {
        let recipe = try #require(Self.recipe(isPending: true))
        #expect(recipe.primaryHeight == 50)
        #expect(recipe.secondaryHeight == 44)
        #expect(recipe.primaryIsEnabled == false)
        #expect(try #require(Self.recipe()).primaryIsEnabled)
    }

    @Test("le nombre de fantômes est borné de 1 à 4")
    func ghostCount_isClamped() {
        #expect(MeeshyStateBlockRecipe.ghostCount(0) == 1)
        #expect(MeeshyStateBlockRecipe.ghostCount(3) == 3)
        #expect(MeeshyStateBlockRecipe.ghostCount(9) == 4)
    }

    @Test("garde de source : le bloc ne sait ni lien, ni fiche, ni permission, ni réseau")
    func source_isAnAgnosticAtom() throws {
        try KitAssemblyGuards.assertAgnostic(["MeeshyStateBlock.swift", "MeeshyStateBlockRecipe.swift"])
    }
}
