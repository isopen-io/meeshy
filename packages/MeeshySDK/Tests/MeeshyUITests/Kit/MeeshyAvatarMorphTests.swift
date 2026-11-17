import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K29 — l'avatar qui voyage : le mode (partagé, piloté, fondu), le trajet, les
/// mesures de l'anneau et de la pastille, la position en vol. Il ne dessine rien.
@Suite("MeeshyAvatarMorph")
struct MeeshyAvatarMorphTests {

    private static let file = "K29-MeeshyAvatarMorph"

    private static func path(_ name: String) -> MeeshyAvatarMorphPath {
        switch name {
        case "arc": return .arc
        case "straight": return .straight
        default: return .auto
        }
    }

    private static func recipe(path: MeeshyAvatarMorphPath = .auto,
                               from: CGPoint = .zero,
                               to: CGPoint = CGPoint(x: 100, y: 200),
                               progress: Double? = nil,
                               reduceMotion: Bool = false,
                               hasScope: Bool = true) -> MeeshyAvatarMorphRecipe {
        MeeshyAvatarMorphRecipe.resolve(
            from: MeeshyAvatarMorphEnd(center: from, diameter: 44),
            to: MeeshyAvatarMorphEnd(center: to, diameter: 112),
            path: path, progress: progress, reduceMotion: reduceMotion, hasScope: hasScope)
    }

    @Test("sans portée ou sous mouvement réduit : fondu ; avec progress : piloté ; sinon partagé")
    func mode_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "mode") {
            let recipe = Self.recipe(progress: row["progress"] as? Double,
                                     reduceMotion: try #require(row["reduit"] as? Bool),
                                     hasScope: try #require(row["portee"] as? Bool))
            #expect(recipe.mode.rawValue == row["mode"] as? String, "\(row)")
        }
    }

    @Test("auto : un arc si le déplacement est en diagonale, une droite sinon ; le choix de l'hôte prime")
    func path_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "trajet") {
            let dx = try #require(row["dx"] as? Double)
            let dy = try #require(row["dy"] as? Double)
            let recipe = Self.recipe(path: Self.path(try #require(row["path"] as? String)),
                                     to: CGPoint(x: dx, y: dy))
            #expect(recipe.resolvedPath.rawValue == row["trajet"] as? String, "\(row)")
        }
    }

    @Test("l'anneau est à 4,5 % de la taille (2 au moins), la pastille à 25 % (14 au moins)")
    func measures_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "mesures") {
            let size = try #require(row["taille"] as? Double)
            #expect(abs(MeeshyAvatarMorphRecipe.ringGap(diameter: size) - (row["anneau"] as? Double ?? -1)) < 0.001, "\(row)")
            #expect(MeeshyAvatarMorphRecipe.badgeDiameter(diameter: size) == row["pastille"] as? Double, "\(row)")
        }
    }

    @Test("la pastille s'efface en vol, sauf si elle voyage ; elle est là avant le départ et après l'arrivée")
    func badge_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "pastille") {
            let progress = try #require(row["avance"] as? Double)
            let travels = try #require(row["voyage"] as? Bool)
            #expect(MeeshyAvatarMorphRecipe.badgeOpacity(progress: progress, travels: travels) == row["opacite"] as? Double, "\(row)")
        }
        #expect(MeeshyAvatarMorphRecipe.ringOpacity(progress: 0.5, travels: false) == 0)
        #expect(MeeshyAvatarMorphRecipe.ringOpacity(progress: 0.5, travels: true) == 1)
    }

    @Test("la position en vol suit la droite, ou l'arc qui passe par ses deux extrémités")
    func position_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "position") {
            let progress = try #require(row["avance"] as? Double)
            let recipe = Self.recipe(path: .straight)
            let point = recipe.position(atProgress: progress)
            #expect(abs(point.x - (row["x"] as? Double ?? -1)) < 0.001 && abs(point.y - (row["y"] as? Double ?? -1)) < 0.001, "\(row)")
        }
        let arc = Self.recipe(path: .arc, to: CGPoint(x: 200, y: 200))
        #expect(arc.position(atProgress: 0) == .zero)
        #expect(arc.position(atProgress: 1) == CGPoint(x: 200, y: 200))
        let middle = arc.position(atProgress: 0.5)
        #expect(abs(middle.x - middle.y) > 1, "l'arc quitte la diagonale")
    }

    @Test("l'échelle de départ rapporte le diamètre de départ à celui d'arrivée ; la durée suit travel")
    func scale_and_duration() {
        let recipe = Self.recipe()
        #expect(abs(recipe.startScale - 44.0 / 112.0) < 0.0001)
        #expect(recipe.endScale == 1)
        #expect(recipe.durationMilliseconds == MeeshyMotionRecipe.resolve(token: .travel).durationMilliseconds)
        #expect(MeeshyAvatarMorphRecipe.badgeLeadMilliseconds == 80)
        #expect(MeeshyAvatarMorphRecipe.badgeLagMilliseconds == 120)
    }

    @Test("les jalons de taille sont 36, 44, 56 et 112")
    func milestones() {
        #expect(MeeshyAvatarMorphSize.bar == 36 && MeeshyAvatarMorphSize.row == 44)
        #expect(MeeshyAvatarMorphSize.pin == 56 && MeeshyAvatarMorphSize.hero == 112)
    }

    @Test("progress est borné de 0 à 1")
    func progress_isClamped() {
        #expect(MeeshyAvatarMorphRecipe.clamped(progress: 2) == 1)
        #expect(MeeshyAvatarMorphRecipe.clamped(progress: -1) == 0)
        #expect(MeeshyAvatarMorphRecipe.clamped(progress: .nan) == 0)
    }

    @Test("garde de source : K29 ne dessine aucun avatar et ne connaît ni personne, ni présence, ni story, ni carte")
    func source_isAnAgnosticAtom() throws {
        try KitAssemblyGuards.assertAgnostic(["MeeshyAvatarMorph.swift", "MeeshyAvatarMorphRecipe.swift"])
        for file in ["MeeshyAvatarMorph.swift", "MeeshyAvatarMorphRecipe.swift"] {
            let source = try KitAtomVectors.code(file)
            for forbidden in ["MeeshyAvatar(", "Story", "PresenceState", "MapKit"] {
                #expect(!source.contains(forbidden), "\(file) contient \(forbidden)")
            }
        }
    }
}
