import Foundation
import Testing
@testable import MeeshySDK

/// Rejeu iOS des vecteurs de l'ÉDITION DESSINÉE d'une Meesh (#11483) —
/// `packages/shared/fixtures/reading-modes/meesh-display-edition.vectors.json`, produit par la loi TypeScript
/// (`meeshEdition` et `meeshDisplayEdition`, `packages/shared/utils/game/mint.ts`) et rejoué ici sur le miroir Swift
/// (`GameMint.edition(forNumber:)` et `GameMint.displayEdition(forNumber:)`). Le même fichier porte la cérémonie d'une
/// pièce dont la loi et le dessin diffèrent (`mint-ceremony-plan` avec `look`), rejouée sur `GameMintCeremony` par
/// l'évaluateur de la cérémonie. Sur divergence, c'est le TS qui a raison.
///
/// Le porteur, le 2026-10-21 : « Le n° 247 dessiné en or ». La LOI décide de la frappe ; le DESSIN est la plus haute
/// édition atteinte. Une valeur illisible s'écrit en chaîne (`"NaN"`, `"Infinity"`) : le miroir la relit en nombre et la
/// tronque comme `sanitizeCount` avant de la passer à la loi Swift, qui prend un entier.
@Suite("Jeu Meeshy — l'édition dessinée d'une Meesh rejouée sur les vecteurs partagés")
struct GameMeeshDisplayEditionVectorTests {

    private static var vectorsURL: URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { url.deleteLastPathComponent() }
        return url.appendingPathComponent("shared/fixtures/reading-modes/meesh-display-edition.vectors.json")
    }

    private static func loadVectors() throws -> [GameJSON] {
        try GameJSON.parse(Data(contentsOf: vectorsURL))["vectors"].arrayValue
    }

    /// `sanitizeCount` côté TS : un nombre illisible vaut 0, un nombre lisible se tronque vers zéro.
    private static func number(_ json: GameJSON) -> Int? {
        let raw: Double?
        switch json {
        case .number(let value): raw = value
        case .string(let text): raw = Double(text)
        default: raw = nil
        }
        guard let raw else { return nil }
        guard raw.isFinite else { return 0 }
        return Int(raw.rounded(.towardZero))
    }

    @Test("le fichier rejoue l'argent, l'or, le prisme, les valeurs illisibles et la cérémonie dessinée — jamais de vert silencieux")
    func fileCoversEveryEdition() throws {
        let vectors = try Self.loadVectors()
        #expect(vectors.count >= 20)
        #expect(Set(vectors.compactMap { $0["input"]["law"].stringValue }) == ["meesh-display-edition", "mint-ceremony-plan"])
        let drawn = Set(vectors.compactMap { $0["expected"]["displayEdition"].stringValue })
        #expect(drawn == Set(MeeshEdition.allCases.map(\.rawValue)))
        let looks = vectors.filter { $0["input"]["law"].stringValue == "mint-ceremony-plan" }.compactMap { $0["input"]["look"].stringValue }
        #expect(!looks.isEmpty, "aucune cérémonie dessinée n'est rejouée")
    }

    private static func evaluate(_ input: GameJSON) throws -> GameJSON {
        guard input["law"].stringValue == "meesh-display-edition" else { return try MintCeremonyVectorEvaluator.evaluate(input) }
        guard let n = number(input["n"]) else { throw GameLawVectorError.malformed("`n` illisible") }
        return .object([
            "edition": .string(GameMint.edition(forNumber: n).rawValue),
            "displayEdition": .string(GameMint.displayEdition(forNumber: n).rawValue),
        ])
    }

    @Test("chaque vecteur rend, sur le miroir Swift, la loi et le dessin de la loi TypeScript")
    func everyVectorMatches() throws {
        var failures: [String] = []
        for (index, vector) in try Self.loadVectors().enumerated() {
            let label = "#\(index) « \(vector["_label"].stringValue ?? "") »"
            do {
                let actual = try Self.evaluate(vector["input"])
                if let difference = GameJSON.firstDifference(expected: vector["expected"], actual: actual, tolerance: 0) {
                    failures.append("\(label) — \(difference)")
                }
            } catch {
                failures.append("\(label) — \(error)")
            }
        }
        #expect(failures.isEmpty, "\(failures.count) vecteur(s) divergent :\n\(failures.joined(separator: "\n"))")
    }

    @Test("le n° 247 se dessine en or, sa loi reste l'argent ; le dessin n'est jamais plus bas que la loi")
    func drawnEditionNeverFallsBelowTheLaw() {
        #expect(GameMint.edition(forNumber: 247) == .silver)
        #expect(GameMint.displayEdition(forNumber: 247) == .gold)
        let order: [MeeshEdition: Int] = [.silver: 0, .gold: 1, .prism: 2]
        for n in 0...3000 {
            #expect((order[GameMint.displayEdition(forNumber: n)] ?? 0) >= (order[GameMint.edition(forNumber: n)] ?? 0))
        }
    }
}
