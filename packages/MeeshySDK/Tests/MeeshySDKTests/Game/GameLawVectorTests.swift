import Foundation
import Testing
@testable import MeeshySDK

/// Rejeu iOS du fichier de vecteurs partagé
/// `packages/shared/fixtures/reading-modes/game.vectors.json` — le CONTRAT
/// cross-plateforme de la loi du Jeu Meeshy (#9373). TS le produit et le rejoue
/// (`packages/shared/__tests__/vectors/game.vectors.test.ts`) ; ce fichier le
/// rejoue sur les résolveurs RÉELS du SDK (`GameLevels`, `GameMint`, `GameGlory`,
/// `GameTreasury`, `GameFlame`, `GameBoosts`, `GameMissions`, `GameChest`,
/// `GameGuide`). Sur divergence, c'est le TS qui a raison : le miroir bouge,
/// jamais le vecteur sans lui.
@Suite("Jeu Meeshy — la loi rejouée sur les vecteurs partagés")
struct GameLawVectorTests {

    /// Le dépôt est clonable n'importe où : la racine se dérive de l'emplacement
    /// de CE fichier (`packages/MeeshySDK/Tests/MeeshySDKTests/Game/…`, soit
    /// **5** composants à retirer pour atteindre `packages/`).
    private static var vectorsURL: URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { url.deleteLastPathComponent() }
        return url.appendingPathComponent("shared/fixtures/reading-modes/game.vectors.json")
    }

    private static func loadVectors() throws -> [GameJSON] {
        let data = try Data(contentsOf: vectorsURL)
        return try GameJSON.parse(data)["vectors"].arrayValue
    }

    @Test("le fichier existe et porte ses vingt lois — jamais de vert silencieux")
    func fileCarriesEveryLaw() throws {
        let vectors = try Self.loadVectors()
        #expect(vectors.count >= 200)
        let laws = Set(vectors.compactMap { $0["input"]["law"].stringValue })
        let expected: Set<String> = [
            "level", "level-record", "mint-price", "mint-preview", "glory-standing", "glory-gain", "treasury",
            "flame-form", "flame-advance", "flame-status", "flame-relight", "tailwind", "prism-hour",
            "mission-objective", "mission-reward", "rng", "missions-draw", "mission-reroll", "chest", "guide",
        ]
        #expect(laws == expected)
    }

    @Test("chaque vecteur rend, sur la loi Swift, exactement la sortie de la loi TypeScript")
    func everyVectorMatches() throws {
        let vectors = try Self.loadVectors()
        var failures: [String] = []
        for (index, vector) in vectors.enumerated() {
            let label = "#\(index) « \(vector["_label"].stringValue ?? "") »"
            do {
                let actual = try GameLawVectorEvaluator.evaluate(vector["input"])
                if let difference = GameJSON.firstDifference(expected: vector["expected"], actual: actual) {
                    failures.append("\(label) — \(difference)")
                }
            } catch {
                failures.append("\(label) — \(error)")
            }
        }
        #expect(failures.isEmpty, "\(failures.count) vecteur(s) divergent :\n\(failures.joined(separator: "\n"))")
    }
}
