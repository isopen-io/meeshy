import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K36 — l'épingle de personne lue comme des VALEURS : tailles, disque de flou,
/// onde, pointe, grappe et légende, puis les gardes de source (aucune carte,
/// aucune coordonnée, aucune personne dans une signature).
@Suite("MeeshyMapPin")
struct MeeshyMapPinTests {

    private static let file = "K36-MeeshyMapPin"

    private static func precision(_ name: String, radius: Double) -> MeeshyMapPinPrecision {
        switch name {
        case "area": return .area(radius: radius)
        case "wide": return .wide(radius: radius)
        default: return .exact
        }
    }

    private static func kind(_ name: String) -> MeeshyMapPinKind {
        name == "own" ? .own : .other
    }

    private static func recipe(kind: MeeshyMapPinKind = .other,
                               precision: MeeshyMapPinPrecision = .exact,
                               isLive: Bool = false,
                               isSelected: Bool = false,
                               isStale: Bool = false,
                               isPressed: Bool = false,
                               reduceMotion: Bool = false) -> MeeshyMapPinRecipe {
        MeeshyMapPinRecipe.resolve(kind: kind, precision: precision, isLive: isLive, isSelected: isSelected,
                                   isStale: isStale, isPressed: isPressed, reduceMotion: reduceMotion)
    }

    @Test("le disque de flou n'est dessiné qu'à partir d'un rayon de 32 ; son diamètre vaut deux fois le rayon")
    func disc_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "disque") {
            let name = try #require(row["precision"] as? String)
            let radius = try #require(row["rayon"] as? Double)
            let recipe = Self.recipe(precision: Self.precision(name, radius: radius))
            #expect(recipe.showsDisc == (row["dessine"] as? Bool), "\(row)")
            #expect(recipe.discDiameter == (row["diametre"] as? Double), "\(row)")
        }
    }

    @Test("contenu de 48, 56 sélectionnée, 38 pour la mienne ; liseré de 3, 2,5 pour la mienne")
    func sizes_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "tailles") {
            let name = try #require(row["genre"] as? String)
            let selected = try #require(row["selectionnee"] as? Bool)
            let recipe = Self.recipe(kind: Self.kind(name), isSelected: selected)
            #expect(recipe.contentDiameter == (row["contenu"] as? Double), "\(row)")
            #expect(recipe.rimWidth == (row["liseré"] as? Double), "\(row)")
        }
    }

    @Test("la zone de toucher fait 44 au moins, même pour une épingle de 38")
    func hitTarget_isAtLeast44() {
        #expect(Self.recipe(kind: .own).hitTarget == 44)
        #expect(Self.recipe(isSelected: true).hitTarget == 56)
    }

    @Test("l'onde tourne tant que isLive, jamais périmée ; la mienne en a une permanente ; ghost n'en a pas")
    func wave_rules() {
        #expect(!Self.recipe().showsWave)
        #expect(Self.recipe(isLive: true).showsWave)
        #expect(!Self.recipe(isLive: true, isStale: true).showsWave)
        let own = Self.recipe(kind: .own)
        #expect(own.showsWave && own.waveIsPermanent)
        #expect(!Self.recipe(kind: .ghost, isLive: true).showsWave)
        #expect(!Self.recipe(isLive: true).waveIsPermanent)
    }

    @Test("la pointe n'existe qu'en précision exacte, blanche quand l'épingle est sélectionnée")
    func tip_rules() {
        #expect(Self.recipe().showsTip)
        #expect(!Self.recipe(precision: .area(radius: 53)).showsTip)
        #expect(!Self.recipe(kind: .own).showsTip)
        #expect(!Self.recipe(kind: .ghost).showsTip)
        #expect(Self.recipe(isSelected: true).tipIsWhite)
        #expect(!Self.recipe().tipIsWhite)
    }

    @Test("sélectionnée : anneau et disque renforcé à 28 % ; périmée : disque en pointillé, contenu grisé")
    func selectedAndStale() {
        let selected = Self.recipe(precision: .area(radius: 53), isSelected: true)
        #expect(selected.showsSelectionRing)
        #expect(selected.discOpacity == 0.28)
        #expect(Self.recipe(precision: .area(radius: 53)).discOpacity == 0.18)
        #expect(!Self.recipe(precision: .area(radius: 53)).showsSelectionRing)
        let stale = Self.recipe(precision: .wide(radius: 86), isStale: true)
        #expect(stale.discIsDashed)
        #expect(stale.isGrayed)
        #expect(!Self.recipe().isGrayed)
    }

    @Test("ni la mienne ni ghost ne dessinent de disque")
    func ownAndGhost_haveNoDisc() {
        #expect(!Self.recipe(kind: .own, precision: .wide(radius: 86)).showsDisc)
        #expect(!Self.recipe(kind: .ghost, precision: .wide(radius: 86)).showsDisc)
    }

    @Test("doigt posé : échelle de 0,94, aussi sous mouvement réduit")
    func pressed_scale() {
        #expect(Self.recipe(isPressed: true).pressScale == 0.94)
        #expect(Self.recipe(isPressed: true, reduceMotion: true).pressScale == 0.94)
        #expect(Self.recipe().pressScale == 1)
    }

    @Test("la grappe dit son compte : rien sous 2, « 99+ » au-delà de 99, trois contenus au plus")
    func cluster_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "grappe") {
            let count = try #require(row["compte"] as? Int)
            #expect(MeeshyMapPinRecipe.clusterCountText(count) == row["texte"] as? String, "\(row)")
            #expect(MeeshyMapPinRecipe.clusterContentCount(count) == row["contenus"] as? Int, "\(row)")
        }
    }

    @Test("la légende est un mot : vide ⇒ rien, coupée à 18 caractères")
    func caption_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "legende") {
            let text = try #require(row["texte"] as? String)
            #expect(MeeshyMapPinRecipe.caption(text) == row["attendu"] as? String, "\(row)")
        }
        #expect(MeeshyMapPinRecipe.caption(nil) == nil)
    }

    @Test("garde de source : l'épingle ne connaît ni la carte, ni les coordonnées, ni une personne")
    func source_isAnAgnosticAtom() throws {
        try KitAssemblyGuards.assertAgnostic(["MeeshyMapPin.swift", "MeeshyMapPinRecipe.swift"])
        for file in ["MeeshyMapPin.swift", "MeeshyMapPinRecipe.swift"] {
            let source = try KitAtomVectors.code(file)
            for forbidden in ["import MapKit", "CLLocation", "MKCoordinate", "latitude", "longitude", "MeeshyCircle"] {
                #expect(!source.contains(forbidden), "\(file) contient \(forbidden)")
            }
        }
    }

    @Test("le point de présence mesure 14, cerclé de 2 ; mon épingle et le point sont des pièces agnostiques du kit")
    func parts_areKitPieces() throws {
        #expect(MeeshyMapPinPartsRecipe.presenceDotDiameter == 14)
        #expect(MeeshyMapPinPartsRecipe.presenceRimWidth == 2)
        try KitAssemblyGuards.assertAgnostic(["MeeshyMapPinParts.swift"])
        let source = try KitAtomVectors.code("MeeshyMapPinParts.swift")
        #expect(!source.contains("PresenceState"), "la loi de présence reste chez l'hôte")
    }

    @Test("garde de source (loi 12) : les cartes posent « moi » et la présence par les pièces du kit, sans les redessiner")
    func sites_useTheKitPieces() throws {
        let sites = [
            "apps/ios/Meeshy/Features/SharedLocation/Map/LocationMapPinsLayer.swift",
            "apps/ios/Meeshy/Features/SharedLocation/Map/ShareMyLocationSheet.swift",
        ]
        for path in sites {
            let code = try String(contentsOf: KitAtomVectors.repositoryRoot.appendingPathComponent(path), encoding: .utf8)
            #expect(code.contains("MeeshyMapPinOwnContent()"), "\(path) ne pose pas MeeshyMapPinOwnContent")
            #expect(!code.contains("Image(systemName: \"person.fill\")"), "\(path) redessine mon épingle")
        }
        let layer = try String(contentsOf: KitAtomVectors.repositoryRoot
            .appendingPathComponent(sites[0]), encoding: .utf8)
        #expect(layer.contains("MeeshyMapPinPresenceDot(color:"), "le point de présence vient du kit")
    }
}
