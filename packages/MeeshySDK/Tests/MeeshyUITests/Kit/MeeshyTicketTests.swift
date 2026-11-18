import Testing
import Foundation
@testable import MeeshyUI

/// K30 — le billet à encoches lu comme des VALEURS : coupe par taille, états,
/// retournement, encre choisie au contraste, forme découpée.
@Suite("MeeshyTicket")
struct MeeshyTicketTests {

    private static let file = "K30-MeeshyTicket"

    @Test("la coupe suit les vecteurs : 125, 77 et 61")
    func cut_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "coupes") {
            let size = try #require(MeeshyTicketSize(rawValue: row["taille"] as? String ?? ""))
            #expect(MeeshyTicketRecipe.resolve(size: size).cut == row["coupe"] as? Double, "\(row)")
        }
    }

    @Test("l'encre de la pastille tient 4,5:1 sur les quatre teintes")
    func ink_followsTheVectorsAndHoldsContrast() throws {
        for row in try KitAtomVectors.rows(Self.file, "encres") {
            let hex = try #require(row["teinte"] as? String)
            let tint = try #require(MeeshyKitRGB(hex: hex))
            let ink = MeeshyTicketRecipe.ink(onTint: tint)
            let expected = row["encre"] as? String
            #expect((ink == MeeshyKitRGB.white ? "blanche" : "sombre") == expected, "\(row)")
            #expect(MeeshyKitRGB.contrast(ink, tint) >= 4.5, "\(row)")
        }
    }

    @Test("une seule forme : rayon 22, encoches de 18, pointillé de 1,5")
    func shape_isOneCutout() {
        let recipe = MeeshyTicketRecipe.resolve(size: .row)
        #expect(recipe.cornerRadius == 22)
        #expect(recipe.notchDiameter == 18)
        #expect(recipe.dashLineWidth == 1.5)
        #expect(recipe.dashPattern == [6, 4])
        #expect(recipe.cutMargin == 16)
    }

    @Test("le code est en chasse fixe : 20, 12 et 11,5 selon la taille")
    func code_fontSizes() {
        #expect(MeeshyTicketRecipe.resolve(size: .hero).codeFontSize == 20)
        #expect(MeeshyTicketRecipe.resolve(size: .row).codeFontSize == 12)
        #expect(MeeshyTicketRecipe.resolve(size: .compact).codeFontSize == 11.5)
    }

    @Test("les états : pressé 0,97, soulevé 1,03 penché de 2,5°, sélectionné 2 px, survolé monte de 4")
    func states() {
        #expect(MeeshyTicketRecipe.resolve(size: .row, isPressed: true).scale == 0.97)
        let dragging = MeeshyTicketRecipe.resolve(size: .row, isDragging: true)
        #expect(dragging.scale == 1.03)
        #expect(dragging.tilt == 2.5)
        #expect(MeeshyTicketRecipe.resolve(size: .row, isSelected: true).borderWidth == 2)
        #expect(MeeshyTicketRecipe.resolve(size: .row, isHovered: true).lift == 4)
        #expect(MeeshyTicketRecipe.resolve(size: .row).lift == 0)
    }

    @Test("les genres : fantôme sans fond, barré, chargement sans contenu")
    func kinds() {
        #expect(MeeshyTicketRecipe.resolve(size: .row, kind: .ghost).fill == .none)
        #expect(MeeshyTicketRecipe.resolve(size: .row, kind: .ghost).isBorderDashed)
        #expect(MeeshyTicketRecipe.resolve(size: .row, kind: .struck).isStruck)
        #expect(!MeeshyTicketRecipe.resolve(size: .row).isStruck)
        #expect(!MeeshyTicketRecipe.resolve(size: .row, kind: .loading).showsContent)
        #expect(MeeshyTicketRecipe.resolve(size: .row).fill == .raised)
        #expect(MeeshyTicketRecipe.resolve(size: .row, isPressed: true).fill == .field)
    }

    @Test("le retournement : rotation, ou fondu de 160 ms sous mouvement réduit")
    func flip() {
        let normal = MeeshyTicketRecipe.resolve(size: .hero, isFlipped: true)
        #expect(normal.flipRotation == 180)
        #expect(normal.showsBack)
        #expect(!normal.flipCrossfades)
        let reduced = MeeshyTicketRecipe.resolve(size: .hero, isFlipped: true, reduceMotion: true)
        #expect(reduced.flipRotation == 0)
        #expect(reduced.flipCrossfades)
        #expect(MeeshyTicketRecipe.flipCrossfadeMilliseconds == 160)
        #expect(!MeeshyTicketRecipe.resolve(size: .hero).showsBack)
    }

    @Test("les encoches sont centrées sur la coupe à toute largeur")
    func notches_areCenteredOnTheCut() {
        for width in [150.0, 240, 393, 800] {
            let notches = MeeshyTicketShape.notchCenters(width: width, height: 120, cut: 77)
            #expect(notches.leading.y == 77)
            #expect(notches.trailing.y == 77)
            #expect(notches.leading.x == 0)
            #expect(Double(notches.trailing.x) == width)
        }
    }

    @Test("garde de source : aucun type du domaine, aucun singleton, aucun verre dessiné")
    func source_isAgnostic() throws {
        let files = ["MeeshyTicket.swift", "MeeshyTicketRecipe.swift", "MeeshyTicketShape.swift"]
        try KitAssemblyGuards.assertAgnostic(files)
        for file in files {
            #expect(!(try KitAtomVectors.code(file)).contains("UIBlurEffect"), "\(file)")
        }
    }

    @Test("la pastille de titre (K41) se dit après le nom du billet, qu'il soit passé ou composé")
    func titleBadge_isSpokenAfterTheTicketName() {
        let composed = MeeshyTicketRecipe.spokenName(label: nil, title: "Mon lien de profil", code: "meeshy.me/@aissa",
                                                     figure: nil, statusLabel: nil, titleBadge: "Nouveau")
        #expect(composed == "Mon lien de profil, meeshy.me/@aissa, Nouveau")
        let given = MeeshyTicketRecipe.spokenName(label: "Mon lien de profil, meeshy.me/@aissa", title: "x", code: "y",
                                                  figure: "3", statusLabel: nil, titleBadge: "Nouveau")
        #expect(given == "Mon lien de profil, meeshy.me/@aissa, Nouveau")
        let bare = MeeshyTicketRecipe.spokenName(label: nil, title: "Site", code: "", figure: "12",
                                                 statusLabel: "Masquée", titleBadge: nil)
        #expect(bare == "Site, 12, Masquée")
    }
}
