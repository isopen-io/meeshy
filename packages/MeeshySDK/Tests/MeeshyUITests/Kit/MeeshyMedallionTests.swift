import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K45 — le médaillon lu comme des VALEURS : diamètre, glyphe, valeur, décors,
/// repli de forme, état verrouillé, jamais interactif, puis les gardes de source.
@Suite("MeeshyMedallion")
struct MeeshyMedallionTests {

    private static let file = "K45-MeeshyMedallion"

    @Test("diamètre, glyphe à la moitié (14 au moins) et valeur à 44 %")
    func recipe_sizes_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "tailles") {
            let raw = try #require(row["taille"] as? Int)
            let size = try #require(MeeshyMedallionSize(rawValue: raw))
            let recipe = Self.recipe(size: size)
            #expect(recipe.diameter == Double(raw), "\(row)")
            #expect(recipe.glyphSize == row["glyphe"] as? Double, "\(row)")
            let expectedValue = try #require(row["valeur"] as? Double)
            #expect(abs(recipe.valueSize - expectedValue) < 0.0001, "\(row)")
        }
    }

    @Test("le carré arrondi, le halo, le pointillé et le trait barré suivent les vecteurs")
    func recipe_geometry_followsTheVectors() throws {
        let vectors = try KitAtomVectors.load(Self.file)
        let halo = try #require(vectors["halo"] as? [String: Any])
        let dashed = try #require(vectors["pointille"] as? [String: Any])
        let strike = try #require(vectors["barre"] as? [String: Any])
        let squircle = Self.recipe(shape: .squircle, size: .s96)
        #expect(squircle.cornerRadius == 96 * (vectors["rayonCarreArrondi"] as? Double ?? -1))
        #expect(Self.recipe(shape: .disc, size: .s96).cornerRadius == 48)
        let withHalo = Self.recipe(decor: .halo, size: .s96)
        #expect(withHalo.haloThickness == 96 * (halo["epaisseur"] as? Double ?? -1))
        #expect(withHalo.haloOpacity == halo["opacite"] as? Double)
        let ringed = Self.recipe(decor: .dashed, size: .s96)
        #expect(ringed.dashedInset == 96 * (dashed["inset"] as? Double ?? -1))
        #expect(ringed.dashedLineWidth == dashed["trait"] as? Double)
        #expect(ringed.dashedTurnSeconds == (dashed["tourMs"] as? Double ?? -1) / 1000)
        let struck = Self.recipe(decor: .struck, size: .s96)
        #expect(struck.strikeLineWidth == strike["trait"] as? Double)
        #expect(struck.strikeLength == 96 * (strike["longueur"] as? Double ?? -1))
        #expect(struck.strikeAngle == strike["angle"] as? Double)
        #expect(struck.strikeOutline == strike["detourage"] as? Double)
    }

    @Test("les ondes : de 1 à 3, retirées sous mouvement réduit au profit d'un anneau posé")
    func recipe_waves() throws {
        for row in try KitAtomVectors.rows(Self.file, "ondes") {
            let asked = try #require(row["demande"] as? Int)
            let recipe = Self.recipe(decor: .waves(count: asked))
            #expect(recipe.waveCount == row["rendu"] as? Int, "\(row)")
        }
        let still = Self.recipe(decor: .waves(count: 3), reduceMotion: true)
        #expect(still.waveCount == 0)
        #expect(still.showsStillRing)
        #expect(Self.recipe(decor: .waves(count: 2)).animates)
        #expect(!Self.recipe(decor: .waves(count: 2), reduceMotion: true).animates)
        #expect(!Self.recipe(decor: .dashed, reduceMotion: true).animates)
    }

    @Test("le fond doux suit le genre ; solid rend une encre sombre ; current impose solid")
    func recipe_fill() throws {
        let soft = try #require(try KitAtomVectors.load(Self.file)["fondDoux"] as? [String: Double])
        for kind in MeeshyMedallionKind.allCases {
            let recipe = Self.recipe(kind: kind)
            #expect(recipe.softOpacity == soft[kind.rawValue], "\(kind)")
            #expect(recipe.fill == .soft)
            #expect(!recipe.usesDarkInk)
        }
        let solid = Self.recipe(fill: .solid)
        #expect(solid.fill == .solid)
        #expect(solid.usesDarkInk)
        #expect(Self.recipe(state: .current).fill == .solid)
    }

    @Test("verrouillé ignore genre, fond et décor : contour et cadenas")
    func recipe_locked() {
        let locked = Self.recipe(kind: .ok, fill: .solid, decor: .halo, state: .locked)
        #expect(locked.isLocked)
        #expect(locked.fill == .soft)
        #expect(locked.decor == .none)
        #expect(locked.showsLockGlyph)
        #expect(locked.outlineWidth > 0)
        #expect(!Self.recipe().isLocked)
    }

    @Test("une forme que la plateforme ne trace pas rend un disque de même diamètre")
    func recipe_shapeFallback() {
        for shape in [MeeshyMedallionShape.scallop, .blob] {
            let drawn = Self.recipe(shape: shape, size: .s64, supportsShape: true)
            let fallback = Self.recipe(shape: shape, size: .s64, supportsShape: false)
            #expect(drawn.shape == shape)
            #expect(fallback.shape == .disc)
            #expect(fallback.diameter == drawn.diameter)
            #expect(fallback.softOpacity == drawn.softOpacity)
        }
        #expect(MeeshyMedallionRecipe.scallopLobes == 9)
    }

    @Test("une valeur d'un à trois caractères remplace le glyphe")
    func recipe_value() {
        #expect(MeeshyMedallionRecipe.displayedValue("24") == "24")
        #expect(MeeshyMedallionRecipe.displayedValue("12345") == "123")
        #expect(MeeshyMedallionRecipe.displayedValue("") == nil)
        #expect(MeeshyMedallionRecipe.displayedValue(nil) == nil)
    }

    @Test("décoratif par défaut ; nommé, il est une image ; verrouillé, le nom le dit")
    @MainActor
    func words_areSpoken() throws {
        let fr = try KitAtomVectors.lproj("fr", bundle: .module)
        let locale = Locale(identifier: "fr")
        #expect(MeeshyMedallionWords.spokenLabel(label: nil, isLocked: false, bundle: fr, locale: locale) == nil)
        #expect(MeeshyMedallionWords.spokenLabel(label: "Or", isLocked: false, bundle: fr, locale: locale) == "Or")
        #expect(MeeshyMedallionWords.spokenLabel(label: "Or", isLocked: true, bundle: fr, locale: locale) == "Or, verrouillé")
        #expect(MeeshyMedallionWords.rowValue(earned: 3, total: 5, bundle: fr, locale: locale) == "3 sur 5")
    }

    @Test("garde de source : jamais interactif, aucune ombre, aucun flou, aucune couleur en dur")
    func source_isAnInertAtom() throws {
        for file in ["MeeshyMedallion.swift", "MeeshyMedallionRecipe.swift"] {
            let source = try KitAtomVectors.code(file)
            for forbidden in ["Button(", "onTapGesture", "Gesture(", ".shadow(", ".blur(", "Color(hex:",
                              ".shared", "MeeshyUser", "ThemeManager"] {
                #expect(!source.contains(forbidden), "\(file) contient \(forbidden)")
            }
        }
    }

    private static func recipe(kind: MeeshyMedallionKind = .accent,
                               shape: MeeshyMedallionShape = .disc,
                               fill: MeeshyMedallionFill = .soft,
                               decor: MeeshyMedallionDecor = .none,
                               size: MeeshyMedallionSize = .s44,
                               state: MeeshyMedallionState = .normal,
                               reduceMotion: Bool = false,
                               supportsShape: Bool = true) -> MeeshyMedallionRecipe {
        MeeshyMedallionRecipe.resolve(kind: kind, shape: shape, fill: fill, decor: decor, size: size,
                                      state: state, reduceMotion: reduceMotion, supportsShape: supportsShape)
    }
}
