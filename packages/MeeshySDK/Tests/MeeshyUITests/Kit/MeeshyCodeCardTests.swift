import Testing
import Foundation
@testable import MeeshyUI

/// K31 — la carte de code lue comme des VALEURS : l'inclinaison bornée, les côtés,
/// la teinte à 4,5:1 sur la plaque, la matrice de l'encodeur UNIQUE.
@Suite("MeeshyCodeCard")
struct MeeshyCodeCardTests {

    private static let file = "K31-MeeshyCodeCard"

    @Test("l'inclinaison suit les vecteurs : reflet, plaque et pastille, puis plafonne")
    func tilt_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "inclinaisons") {
            let yaw = try #require(row["lacet"] as? Double)
            let motion = MeeshyCodeCardRecipe.motion(yaw: yaw, pitch: 0)
            let close: (Double, Double) -> Bool = { KitAssemblyGuards.close($0, $1) }
            #expect(close(motion.reflectionPosition, row["reflet"] as? Double ?? .nan), "\(row)")
            #expect(close(motion.plateShift, row["plaque"] as? Double ?? .nan), "\(row)")
            #expect(close(motion.centerShift, row["pastille"] as? Double ?? .nan), "\(row)")
        }
        #expect(MeeshyCodeCardRecipe.motion(yaw: 0, pitch: 40).pitch == 6)
        #expect(MeeshyCodeCardRecipe.motion(yaw: .nan, pitch: .nan).yaw == 0)
    }

    @Test("les trois côtés sont 72, 160 et 220 ; la carte mesure le côté + 98")
    func sides() throws {
        for row in try KitAtomVectors.rows(Self.file, "cotes") {
            let size = try #require(MeeshyCodeCardSize(rawValue: row["taille"] as? String ?? ""))
            #expect(size.side == row["cote"] as? Double, "\(row)")
        }
        let wide = try #require(try KitAtomVectors.load(Self.file)["largeurCarte"] as? [String: Any])
        let recipe = MeeshyCodeCardRecipe.resolve(style: .glass, size: .large)
        #expect(recipe.cardWidth == wide["largeur"] as? Double)
    }

    @Test("mini et plain forcent l'inclinaison à rien : zéro partout, ni verre ni reflet")
    func miniAndPlain_areFlat() {
        let mini = MeeshyCodeCardRecipe.resolve(style: .glass, size: .mini, tilt: .device)
        #expect(mini.tilt == .none)
        #expect(!mini.hasReflection)
        #expect(!mini.hasCenter)
        #expect(!mini.hasCaption)
        let plain = MeeshyCodeCardRecipe.resolve(style: .plain, size: .large, tilt: .device)
        #expect(plain.tilt == .none)
        #expect(!plain.isGlass)
        #expect(!plain.hasReflection)
        let glass = MeeshyCodeCardRecipe.resolve(style: .glass, size: .large, tilt: .device)
        #expect(glass.tilt == .device)
        #expect(glass.isGlass)
        #expect(glass.hasReflection)
    }

    @Test("la pastille est absente sous 120 et couvre 25 % du côté ; sans mouvement, tout est à plat")
    func center_andReducedMotion() {
        #expect(MeeshyCodeCardRecipe.centerSide(forSide: 220) == 55)
        #expect(MeeshyCodeCardRecipe.centerSide(forSide: 72) == 0)
        #expect(MeeshyCodeCardRecipe.resolve(style: .glass, size: .large, reduceMotion: true).tilt == .none)
        #expect(MeeshyCodeCardRecipe.resolve(style: .glass, size: .large, isReady: false).showsSkeleton)
    }

    @Test("toute teinte servie atteint 4,5:1 sur la plaque ; la plaque et l'encre ne changent pas")
    func tint_holdsContrast() {
        for hex in ["FBBF24", "34D399", "818CF8", "FFFFFF", "000000"] {
            let tint = MeeshyKitRGB(hex: hex) ?? .black
            let served = MeeshyCodeCardRecipe.servedTint(tint, style: .glass)
            #expect(MeeshyKitRGB.contrast(served, MeeshyCodeCardRecipe.plateColor(style: .glass)) >= 4.5, "\(hex)")
        }
        #expect(MeeshyCodeCardRecipe.plateColor(style: .glass) == MeeshyKitRGB(hex: "F5F3FF"))
        #expect(MeeshyCodeCardRecipe.inkColor(style: .glass) == MeeshyKitRGB(hex: "1B1140"))
    }

    @Test("la matrice vient de l'encodeur unique : un texte entre, un carré sort ; le texte vide ne rend rien")
    func matrix_comesFromTheSingleEncoder() {
        let matrix = MeeshyCodeMatrix.modules(for: "https://meeshy.me/@aissa")
        #expect(matrix != nil)
        #expect(matrix?.size == (matrix?.modules.count ?? -1))
        #expect(matrix?.modules.allSatisfy { $0.count == matrix?.size } == true)
        #expect(MeeshyCodeMatrix.modules(for: "") == nil)
        #expect(MeeshyCodeCardRecipe.quietModules == 4)
    }

    @Test("garde de source : un seul encodeur, aucun type du domaine, aucune lecture du payload")
    func source_isAgnostic() throws {
        let files = ["MeeshyCodeCard.swift", "MeeshyCodeCardRecipe.swift", "MeeshyCodeMatrix.swift"]
        try KitAssemblyGuards.assertAgnostic(files)
        for file in files {
            let source = try KitAtomVectors.code(file)
            #expect(!source.contains("CIQRCodeGenerator"), "\(file)")
            #expect(!source.contains("UIBlurEffect"), "\(file)")
            #expect(!source.contains("print("), "\(file)")
        }
    }
}
