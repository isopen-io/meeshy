import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K26 — mouvement 08 « Entrées en cascade » APPLIQUÉ (#19625, planche
/// `Sys-Mouvement` § 08) : à l'arrivée sur une face, ses blocs montent l'un après
/// l'autre, 80 ms d'écart par rang, rang borné à 3, sur le ressort `rise` ; sous
/// « Réduire les animations », ni retard ni déplacement, le fondu court de la table.
@Suite("MeeshyCascade — les entrées en cascade")
struct MeeshyCascadeTests {

    @Test("chaque rang part 80 ms après le précédent, borné au rang 3", arguments: [
        (-2, 0), (0, 0), (1, 80), (2, 160), (3, 240), (7, 240),
    ])
    func step_delaysEachRankByEightyMilliseconds(rank: Int, milliseconds: Int) {
        let step = MeeshyCascadeStep.resolve(rank: rank, reduce: false)
        #expect(step.delayMilliseconds == milliseconds)
        #expect(step.delay == Double(milliseconds) / 1000)
    }

    private static let file = "K26-MeeshyMotion"

    @Test("hors réduction, le bloc part de la montée de la table K26, sur le ressort rise retardé")
    func step_risesFromBelowOnTheRiseSpring() throws {
        let rise = try #require(try KitAtomVectors.load(Self.file)["cascadeMontee"] as? [String: Any])
        let lift = try #require(rise["decalagePt"] as? Double)
        let scale = try #require(rise["echelleDepart"] as? Double)
        let step = MeeshyCascadeStep.resolve(rank: 2, reduce: false)
        let expected = MeeshyMotion.animation(.rise, reduce: false)?.delay(MeeshyMotion.delay(index: 2))
        #expect(step.entrance == .rise)
        #expect(step.lift == lift)
        #expect(step.startScale == scale)
        #expect(step.animation == expected)
    }

    @Test("au-delà du rang 3, le bloc se fond sans bouger : l'œil ne suit jamais cinq choses à la fois", arguments: [4, 9])
    func step_beyondTheLastRank_fadesInPlace(rank: Int) {
        let step = MeeshyCascadeStep.resolve(rank: rank, reduce: false)
        let expected = MeeshyMotion.animation(.rise, reduce: true)?.delay(MeeshyMotion.delay(index: rank))
        #expect(step.entrance == .fade)
        #expect(step.lift == 0)
        #expect(step.startScale == 1)
        #expect(step.animation == expected)
    }

    // MARK: - La fenêtre d'arrivée de la face

    @Test("la fenêtre d'arrivée d'une face suit la table K26 et tient sous le plafond")
    func arrivalWindow_followsTheTable() throws {
        let window = try #require(try KitAtomVectors.load(Self.file)["cascadeFenetreMs"] as? Int)
        #expect(MeeshyCascadeStep.arrivalWindowMilliseconds == window)
        #expect(window <= MeeshyMotionRecipe.nonLoopCeilingMilliseconds)
    }

    @Test("un bloc inséré après l'arrivée de sa face : dans la fenêtre il monte, après il est là tout de suite")
    func step_followsTheArrivalVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "cascadeArrivee") {
            let rank = try #require(row["rang"] as? Int)
            let elapsed = row["ecouleMs"] as? Int
            let entrance = try #require(row["entree"] as? String)
            let delay = try #require(row["retardMs"] as? Int)
            let step = MeeshyCascadeStep.resolve(rank: rank, reduce: false, elapsedSinceArrival: elapsed)
            #expect("\(step.entrance)" == entrance, "\(row)")
            #expect(step.delayMilliseconds == delay, "\(row)")
        }
    }

    @Test("hors de la fenêtre ou sans face arrivée, le bloc est au repos sans animation", arguments: [Optional(601), Optional(90_000), nil])
    func step_outsideTheWindow_isImmediate(elapsed: Int?) {
        let step = MeeshyCascadeStep.resolve(rank: 1, reduce: false, elapsedSinceArrival: elapsed)
        #expect(step.isImmediate)
        #expect(step.lift == 0)
        #expect(step.startScale == 1)
        #expect(step.animation == nil)
    }

    @Test("la règle de la fenêtre : un bloc apparu pendant l'arrivée monte, jamais après ni sans face")
    func shouldRise_onlyDuringTheArrival() {
        let origin = Date(timeIntervalSince1970: 1_000)
        let during = origin.addingTimeInterval(0.2)
        let after = origin.addingTimeInterval(5)
        #expect(MeeshyCascadeStep.shouldRise(appearedAt: origin, faceOrigin: origin))
        #expect(MeeshyCascadeStep.shouldRise(appearedAt: during, faceOrigin: origin))
        #expect(!MeeshyCascadeStep.shouldRise(appearedAt: after, faceOrigin: origin))
        #expect(!MeeshyCascadeStep.shouldRise(appearedAt: during, faceOrigin: nil))
    }

    @Test("sous réduction, aucun retard, aucun déplacement, le fondu court de la table", arguments: [0, 1, 3, 9])
    func step_underReducedMotion_hasNeitherDelayNorTravel(rank: Int) {
        let step = MeeshyCascadeStep.resolve(rank: rank, reduce: true)
        #expect(step.entrance == .reduced)
        #expect(step.delayMilliseconds == 0)
        #expect(step.lift == 0)
        #expect(step.startScale == 1)
        #expect(step.animation == MeeshyMotion.animation(.rise, reduce: true))
    }

    @Test("une cascade entière tient sous le plafond de 600 ms")
    func cascade_staysUnderTheCeiling() {
        let last = MeeshyCascadeStep.resolve(rank: MeeshyMotionRecipe.cascadeMaxRank, reduce: false)
        let total = last.delayMilliseconds + MeeshyMotionRecipe.resolve(token: .rise).durationMilliseconds
        #expect(total <= MeeshyMotionRecipe.nonLoopCeilingMilliseconds)
    }

    // MARK: - La garde des faces (loi 12)

    private static let faces = [
        "apps/ios/Meeshy/Features/Profile/Views/ProfileView.swift",
        "apps/ios/Meeshy/Features/Profile/Faces/ProfileLinksFace.swift",
        "apps/ios/Meeshy/Features/Profile/Faces/ProfileActionsFace.swift",
        "packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet+DetailsTab.swift",
        "packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet+LinksFace.swift",
        "packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet+ActionsFace.swift",
    ]

    @Test("garde de source : chaque face, chez moi comme chez l'autre, monte ses blocs en cascade")
    func faces_riseTheirBlocksInCascade() throws {
        for path in Self.faces {
            let code = try String(contentsOf: KitAtomVectors.repositoryRoot.appendingPathComponent(path), encoding: .utf8)
            #expect(code.contains(".meeshyCascade(rank:"), "\(path) ne monte pas ses blocs en cascade")
        }
    }

    @Test("garde de source : chaque face pose sa fenêtre d'arrivée, qui borne la cascade de ses blocs")
    func faces_declareTheirArrival() throws {
        for path in Self.faces {
            let code = try String(contentsOf: KitAtomVectors.repositoryRoot.appendingPathComponent(path), encoding: .utf8)
            #expect(code.contains(".meeshyCascadeFace()"), "\(path) ne pose pas meeshyCascadeFace()")
        }
    }

    @Test("garde de source : dans chaque face, un rang qui se déplace (0 à 3) ne sert qu'à un seul bloc")
    func faces_moveOneBlockPerRank() throws {
        for path in Self.faces {
            let code = try String(contentsOf: KitAtomVectors.repositoryRoot.appendingPathComponent(path), encoding: .utf8)
            for rank in 0...MeeshyMotionRecipe.cascadeMaxRank {
                let uses = code.components(separatedBy: ".meeshyCascade(rank: \(rank))").count - 1
                #expect(uses <= 1, "\(path) déplace \(uses) blocs au rang \(rank)")
            }
        }
    }
}
