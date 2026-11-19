import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K27 — la bannière vivante lue comme des VALEURS : la parallaxe plafonnée, les
/// arrêts du dégradé par thème, le repli, la loi du capteur, la teinte voisine,
/// puis les gardes de source.
@Suite("MeeshyLivingBanner")
struct MeeshyLivingBannerTests {

    private static let file = "K27-MeeshyLivingBanner"

    @Test("la parallaxe suit les vecteurs : ±15° donnent ±12 px et ±6 px à contresens, puis plafonne")
    func parallax_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "parallaxe") {
            let degrees = try #require(row["degres"] as? Double)
            let shift = MeeshyLivingBannerRecipe.parallax(tiltDegrees: degrees)
            #expect(abs(shift.near - (row["proche"] as? Double ?? .nan)) < 0.0001, "\(row)")
            #expect(abs(shift.far - (row["lointaine"] as? Double ?? .nan)) < 0.0001, "\(row)")
        }
        #expect(MeeshyLivingBannerRecipe.parallax(tiltDegrees: .nan).near == 0)
    }

    @Test("les arrêts et les opacités des orbes suivent les vecteurs, en sombre comme en clair")
    func stops_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "arrets") {
            let isDark = row["theme"] as? String == "sombre"
            let recipe = Self.recipe(isDark: isDark)
            #expect(recipe.stopShares == (row["parts"] as? [Double]), "\(row)")
            #expect(recipe.near.opacity == row["proche"] as? Double, "\(row)")
            #expect(recipe.far.opacity == row["lointaine"] as? Double, "\(row)")
        }
    }

    @Test("le repli ramène la hauteur à la barre ; l'orbe lointaine et le fondu disparaissent")
    func collapse_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "repli") {
            let collapse = try #require(row["collapse"] as? Double)
            let recipe = Self.recipe(collapse: collapse)
            #expect(abs(recipe.height - (row["hauteur"] as? Double ?? .nan)) < 0.0001, "\(row)")
            #expect(abs(recipe.fadeOpacity - (row["fondu"] as? Double ?? .nan)) < 0.0001, "\(row)")
        }
        let folded = Self.recipe(collapse: 1)
        #expect(folded.far.opacity == 0)
        #expect(Self.recipe(height: MeeshyLivingBannerHeight.card, collapse: 1).height == MeeshyLivingBannerHeight.bar)
        #expect(Self.recipe(height: 60, collapse: 1).height == 60)
    }

    @Test("le fondu couvre 38 % de la hauteur et n'existe qu'en banner et veil")
    func fade_share() {
        #expect(abs(Self.recipe().fadeHeight - 318 * 0.38) < 0.0001)
        #expect(Self.recipe(mode: .banner).showsFade)
        #expect(Self.recipe(mode: .veil).showsFade)
        #expect(!Self.recipe(mode: .ambient).showsFade)
        #expect(!Self.recipe(mode: .fill).showsFade)
    }

    @Test("le mode fill n'a qu'une orbe et ne lit aucun capteur")
    func fill_hasOneOrb() {
        let fill = Self.recipe(mode: .fill)
        #expect(fill.far.diameter == 0)
        #expect(!fill.usesSensor)
    }

    @Test("une image efface les orbes à 12 % et pose un voile de 42 %")
    func image_fadesTheOrbs() {
        let withImage = Self.recipe(hasImage: true)
        #expect(withImage.imageVeil == 0.42)
        #expect(withImage.near.opacity == 0.12)
        #expect(withImage.far.opacity == 0.12)
        #expect(Self.recipe().imageVeil == 0)
    }

    @Test("le capteur ne tourne que si motion = on, visible, non atténué, sans mouvement réduit")
    func sensor_law() {
        #expect(MeeshyLivingBannerRecipe.shouldRunSensor(motion: .on, isVisible: true, isMuted: false, reduceMotion: false))
        #expect(!MeeshyLivingBannerRecipe.shouldRunSensor(motion: .reduced, isVisible: true, isMuted: false, reduceMotion: false))
        #expect(!MeeshyLivingBannerRecipe.shouldRunSensor(motion: .off, isVisible: true, isMuted: false, reduceMotion: false))
        #expect(!MeeshyLivingBannerRecipe.shouldRunSensor(motion: .on, isVisible: false, isMuted: false, reduceMotion: false))
        #expect(!MeeshyLivingBannerRecipe.shouldRunSensor(motion: .on, isVisible: true, isMuted: true, reduceMotion: false))
        #expect(!MeeshyLivingBannerRecipe.shouldRunSensor(motion: .on, isVisible: true, isMuted: false, reduceMotion: true))
        #expect(Self.recipe().usesSensor)
        #expect(!Self.recipe(systemReduceMotion: true).usesSensor)
        #expect(!Self.recipe(isVisible: false).usesSensor)
    }

    @Test("atténuée : désaturée, orbes et capteur figés")
    func muted_isFrozen() {
        let muted = Self.recipe(isMuted: true)
        #expect(muted.isDesaturated)
        #expect(!muted.floats)
        #expect(!muted.usesSensor)
    }

    @Test("motion off : rien ne flotte ; reduced : flotte sans capteur")
    func motion_modes() {
        #expect(!Self.recipe(motion: .off).floats)
        let reduced = Self.recipe(motion: .reduced)
        #expect(reduced.floats)
        #expect(!reduced.usesSensor)
    }

    @Test("la teinte voisine de l'orbe lointaine est décalée de 30° sur la roue")
    func neighbouringHue() {
        let red = MeeshyKitRGB(red: 1, green: 0, blue: 0)
        let shifted = red.hueShifted(by: -30)
        #expect(abs(shifted.red - 1) < 0.0001)
        #expect(abs(shifted.green - 0) < 0.0001)
        #expect(abs(shifted.blue - 0.5) < 0.0001)
        #expect(MeeshyKitRGB.white.hueShifted(by: 40) == MeeshyKitRGB.white)
    }

    @Test("garde de source : aucun type du domaine, aucun singleton, aucun chargement d'image")
    func source_isAnAgnosticDecoration() throws {
        for file in ["MeeshyLivingBanner.swift", "MeeshyLivingBannerRecipe.swift"] {
            let source = try KitAtomVectors.code(file)
            for forbidden in [".shared", "MeeshyUser", "MeeshyConversation", "ThemeManager", "AsyncImage",
                              "URLSession", "Color(hex:"] {
                #expect(!source.contains(forbidden), "\(file) contient \(forbidden)")
            }
        }
    }

    private static func recipe(mode: MeeshyLivingBannerMode = .banner,
                               isDark: Bool = true,
                               hasImage: Bool = false,
                               isMuted: Bool = false,
                               motion: MeeshyLivingBannerMotion = .on,
                               height: Double = MeeshyLivingBannerHeight.hero,
                               collapse: Double = 0,
                               isVisible: Bool = true,
                               systemReduceMotion: Bool = false) -> MeeshyLivingBannerRecipe {
        MeeshyLivingBannerRecipe.resolve(
            mode: mode, isDark: isDark, hasImage: hasImage, isMuted: isMuted, motion: motion, height: height,
            collapse: collapse, isVisible: isVisible, systemReduceMotion: systemReduceMotion
        )
    }
}
