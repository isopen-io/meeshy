import XCTest
import MeeshySDK
@testable import Meeshy

/// Rejeu iOS du fichier de vecteurs partagé
/// `packages/shared/fixtures/reading-modes/engagement-progress.vectors.json` —
/// le CONTRAT cross-plateforme de la loi de progression des streaks & badges
/// (#5547 web, #5698 iOS). TS le rejoue
/// (`packages/shared/__tests__/vectors/engagement-progress.vectors.test.ts`)
/// sur `resolveEngagementProgress` ; ce fichier le rejoue sur
/// `EngagementProgressResolver.resolve`, l'API RÉELLE que `ProgressionViewModel`
/// consomme — jamais une réimplémentation locale.
///
/// `expected` est une PROJECTION de la progression (niveau et sa barre, série
/// et sa barre, compte de badges, état vide, succès débloqués, et par axe non
/// vide le nombre de badges, le prochain palier et la barre) — exactement ce
/// que les deux écrans PEIGNENT. Les fractions se comparent à 1e-4, comme le
/// harnais TS.
///
/// Le dossier `packages/shared/fixtures/` est câblé au bundle de tests
/// (`project.yml`, `MeeshyTests.resources`, `type: folder`) : le fichier y
/// entre par la même référence de dossier que `prism-preview.vectors.json`.
final class EngagementProgressVectorTests: XCTestCase {

    private static let tolerance = 0.0001

    private struct AxisExpectation: Decodable {
        let reachedCount: Int
        let nextThreshold: Int?
        let progress: Double
    }

    private struct Expectation: Decodable {
        let level: Int
        let levelNext: Int?
        let levelProgress: Double
        let streakNext: Int?
        let streakProgress: Double
        let streakReached: Int
        let badgesEarned: Int
        let isEmpty: Bool
        let achievements: [String]
        let axes: [String: AxisExpectation]
    }

    private struct VectorCase: Decodable {
        let label: String?
        let input: APIEngagementProgress
        let expected: Expectation

        enum CodingKeys: String, CodingKey {
            case label = "_label"
            case input
            case expected
        }
    }

    private struct VectorFile: Decodable {
        let vectors: [VectorCase]
    }

    private static func loadCases() -> [VectorCase] {
        guard let url = Bundle(for: EngagementProgressVectorTests.self).url(
            forResource: "engagement-progress.vectors",
            withExtension: "json",
            subdirectory: "fixtures/reading-modes"
        ) else {
            XCTFail("""
                engagement-progress.vectors.json introuvable dans le bundle de tests sous \
                fixtures/reading-modes/. Vérifier la ressource `../../packages/shared/fixtures` \
                (type: folder) dans project.yml, puis `xcodegen generate`.
                """)
            return []
        }
        do {
            let file = try JSONDecoder().decode(VectorFile.self, from: Data(contentsOf: url))
            guard !file.vectors.isEmpty else {
                XCTFail("engagement-progress.vectors.json contient ZÉRO cas — jamais de vert silencieux (leçon 257)")
                return []
            }
            return file.vectors
        } catch {
            XCTFail("engagement-progress.vectors.json présent mais illisible : \(error)")
            return []
        }
    }

    private func closeEnough(_ a: Double, _ b: Double) -> Bool {
        abs(a - b) <= Self.tolerance
    }

    func test_resolver_matchesAllSharedVectors() {
        let cases = Self.loadCases()
        XCTAssertFalse(cases.isEmpty)

        for (index, vector) in cases.enumerated() {
            let name = "case \(index) — \(vector.label ?? "")"
            let progress = EngagementProgressResolver.resolve(vector.input)
            let expected = vector.expected

            XCTAssertEqual(progress.level.level, expected.level, "\(name) : niveau")
            XCTAssertEqual(progress.level.scale.nextThreshold, expected.levelNext, "\(name) : prochain palier de niveau")
            XCTAssertTrue(closeEnough(progress.level.scale.progress, expected.levelProgress), "\(name) : barre de niveau \(progress.level.scale.progress) ≠ \(expected.levelProgress)")
            XCTAssertEqual(progress.streak.scale.nextThreshold, expected.streakNext, "\(name) : prochain jalon de série")
            XCTAssertTrue(closeEnough(progress.streak.scale.progress, expected.streakProgress), "\(name) : barre de série \(progress.streak.scale.progress) ≠ \(expected.streakProgress)")
            XCTAssertEqual(progress.streak.scale.reachedCount, expected.streakReached, "\(name) : jalons de série atteints")
            XCTAssertEqual(progress.badgesEarned, expected.badgesEarned, "\(name) : badges obtenus")
            XCTAssertEqual(progress.isEmpty, expected.isEmpty, "\(name) : état vide")
            XCTAssertEqual(progress.achievements.filter(\.unlocked).map(\.key.rawValue), expected.achievements, "\(name) : succès débloqués")

            let projectedAxes = progress.axes.filter { $0.scale.value > 0 || $0.scale.reachedCount > 0 }
            XCTAssertEqual(Set(projectedAxes.map(\.id)), Set(expected.axes.keys), "\(name) : axes non vides")
            for axis in projectedAxes {
                guard let axisExpected = expected.axes[axis.id] else { continue }
                XCTAssertEqual(axis.scale.reachedCount, axisExpected.reachedCount, "\(name) · \(axis.id) : badges")
                XCTAssertEqual(axis.scale.nextThreshold, axisExpected.nextThreshold, "\(name) · \(axis.id) : prochain palier")
                XCTAssertTrue(closeEnough(axis.scale.progress, axisExpected.progress), "\(name) · \(axis.id) : barre \(axis.scale.progress) ≠ \(axisExpected.progress)")
            }
        }
    }
}
