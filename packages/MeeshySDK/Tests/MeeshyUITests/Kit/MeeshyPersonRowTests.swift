import Testing
import Foundation
@testable import MeeshyUI

/// K39 — la rangée de personne lue comme des VALEURS : tailles, tenues, sélection,
/// la phrase dite.
@Suite("MeeshyPersonRow")
struct MeeshyPersonRowTests {

    private static let file = "K39-MeeshyPersonRow"

    @Test("les tailles suivent les vecteurs : avatar et retrait du filet")
    func sizes_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "tailles") {
            let size = try #require(MeeshyPersonRowSize(rawValue: row["taille"] as? String ?? ""))
            let recipe = MeeshyPersonRowRecipe.resolve(size: size)
            #expect(recipe.avatarSize == row["avatar"] as? Double, "\(row)")
            #expect(recipe.dividerInset == row["retraitFilet"] as? Double, "\(row)")
            #expect(recipe.leadingMargin == 18)
            #expect(recipe.avatarGap == 14)
            #expect(recipe.trailingMargin == 18)
            #expect(recipe.rowHeight >= 44)
        }
    }

    @Test("les tenues suivent les vecteurs : atténuée à 40 %, fantôme en pointillé")
    func outfits_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "tenues") {
            let outfit = try #require(MeeshyPersonRowOutfit(rawValue: row["tenue"] as? String ?? ""))
            let recipe = MeeshyPersonRowRecipe.resolve(outfit: outfit)
            #expect(recipe.avatarOpacity == row["opaciteAvatar"] as? Double, "\(row)")
            #expect(recipe.isAvatarGhost == row["fantome"] as? Bool, "\(row)")
        }
        #expect(MeeshyPersonRowRecipe.resolve(outfit: .muted).trailingOpacity == 1)
    }

    @Test("polices : nom 15/700, ligne 12,5, méta 16 puis 11,5 ; en-tête 56 et 22 ; en ligne 26")
    func fonts_andSpecialSizes() {
        let regular = MeeshyPersonRowRecipe.resolve()
        #expect(regular.titleFontSize == 15)
        #expect(regular.subtitleFontSize == 12.5)
        #expect(regular.metaFontSize == 16)
        #expect(regular.metaDetailFontSize == 11.5)
        #expect(regular.titleAccessorySize == 16)
        let header = MeeshyPersonRowRecipe.resolve(size: .header)
        #expect(header.avatarSize == 56)
        #expect(header.titleFontSize == 22)
        #expect(!header.showsDivider)
        #expect(!header.isPressable)
        #expect(MeeshyPersonRowRecipe.resolve(size: .inline).avatarSize == 26)
    }

    @Test("la sélection : coche multiple, point plein unique, rangée entière touchable")
    func selection() {
        let none = MeeshyPersonRowRecipe.resolve(selection: .none)
        #expect(!none.showsSelectionMark)
        let multiple = MeeshyPersonRowRecipe.resolve(selection: .multiple(true), hasPress: true)
        #expect(multiple.showsSelectionMark)
        #expect(multiple.selectionShape == .check)
        #expect(multiple.isSelected)
        #expect(MeeshyPersonRowRecipe.resolve(selection: .single(false)).selectionShape == .dot)
        #expect(!MeeshyPersonRowRecipe.resolve(selection: .single(false)).isSelected)
    }

    @Test("sans onPress la rangée est un texte : ni voile ni cible ; pressée : voile de 8 %, sans échelle")
    func press() {
        let inert = MeeshyPersonRowRecipe.resolve(hasPress: false, isPressed: true)
        #expect(!inert.isPressable)
        #expect(inert.pressVeil == 0)
        let pressed = MeeshyPersonRowRecipe.resolve(hasPress: true, isPressed: true)
        #expect(pressed.isPressable)
        #expect(pressed.pressVeil == 0.08)
        #expect(pressed.pressScale == 1)
    }

    @Test("très grande police : la méta descend sous la ligne secondaire, l'avatar ne grandit pas")
    func bigText() {
        let big = MeeshyPersonRowRecipe.resolve(textScale: 2)
        #expect(big.metaBelowSubtitle)
        #expect(big.avatarSize == 44)
        #expect(!MeeshyPersonRowRecipe.resolve().metaBelowSubtitle)
    }

    @Test("une seule phrase : les parties vides sont omises, dans l'ordre")
    func spokenLabel() {
        #expect(MeeshyPersonRowRecipe.spokenLabel(parts: ["Léo Marchetti", "Proche", nil, "Alfama", "", "2,4 km"])
                == "Léo Marchetti, Proche, Alfama, 2,4 km")
        #expect(MeeshyPersonRowRecipe.spokenLabel(parts: []) == "")
    }

    @Test("garde de source : aucun type du domaine, aucun singleton, aucune présence dessinée")
    func source_isAgnostic() throws {
        let files = ["MeeshyPersonRow.swift", "MeeshyPersonRowRecipe.swift"]
        try KitAssemblyGuards.assertAgnostic(files)
        for file in files {
            let source = try KitAtomVectors.code(file)
            #expect(!source.contains("PresenceState"), file)
            #expect(!source.contains("isOnline"), file)
        }
    }
}
