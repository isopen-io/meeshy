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

    @Test("hors réduction, le bloc part 18 pt plus bas, à l'échelle 0,97, sur le ressort rise retardé")
    func step_risesFromBelowOnTheRiseSpring() {
        let step = MeeshyCascadeStep.resolve(rank: 2, reduce: false)
        let expected = MeeshyMotion.animation(.rise, reduce: false)?.delay(MeeshyMotion.delay(index: 2))
        #expect(step.lift == 18)
        #expect(step.startScale == 0.97)
        #expect(step.animation == expected)
    }

    @Test("sous réduction, aucun retard, aucun déplacement, le fondu court de la table", arguments: [0, 1, 3, 9])
    func step_underReducedMotion_hasNeitherDelayNorTravel(rank: Int) {
        let step = MeeshyCascadeStep.resolve(rank: rank, reduce: true)
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
}
