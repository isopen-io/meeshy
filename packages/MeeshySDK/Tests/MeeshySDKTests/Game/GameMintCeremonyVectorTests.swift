import Foundation
import Testing
@testable import MeeshySDK

/// Rejeu iOS du fichier de vecteurs de la CÉRÉMONIE DE LA FRAPPE (#11177) —
/// `packages/shared/fixtures/reading-modes/mint-ceremony.vectors.json`, produit par la loi TypeScript
/// (`packages/shared/utils/game/mint-ceremony.ts`) et rejoué ici sur le miroir Swift (`GameMintCeremony`). Sur
/// divergence, c'est le TS qui a raison : le miroir bouge, jamais le vecteur sans lui.
@Suite("Jeu Meeshy — la cérémonie de la frappe rejouée sur les vecteurs partagés")
struct GameMintCeremonyVectorTests {

    private static var vectorsURL: URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { url.deleteLastPathComponent() }
        return url.appendingPathComponent("shared/fixtures/reading-modes/mint-ceremony.vectors.json")
    }

    private static func loadVectors() throws -> [GameJSON] {
        try GameJSON.parse(Data(contentsOf: vectorsURL))["vectors"].arrayValue
    }

    @Test("le fichier porte ses trois lois, chaque édition et chaque mode — jamais de vert silencieux")
    func fileCarriesEveryLaw() throws {
        let vectors = try Self.loadVectors()
        #expect(vectors.count >= 20)
        let laws = Set(vectors.compactMap { $0["input"]["law"].stringValue })
        #expect(laws == ["mint-ceremony-plan", "mint-ceremony-skip", "mint-refusal-reason"])
        let plans = Set(vectors.compactMap { vector -> String? in
            let input = vector["input"]
            guard input["law"].stringValue == "mint-ceremony-plan" else { return nil }
            return "\(input["edition"].stringValue ?? "")/\(input["mode"].stringValue ?? "")"
        })
        for edition in MeeshEdition.allCases {
            for mode in MintCeremonyMode.allCases {
                #expect(plans.contains("\(edition.rawValue)/\(mode.rawValue)"), "\(edition.rawValue)/\(mode.rawValue) n'est pas rejoué")
            }
        }
    }

    @Test("chaque vecteur rend, sur la loi Swift, exactement la sortie de la loi TypeScript")
    func everyVectorMatches() throws {
        var failures: [String] = []
        for (index, vector) in try Self.loadVectors().enumerated() {
            let label = "#\(index) « \(vector["_label"].stringValue ?? "") »"
            do {
                let actual = try MintCeremonyVectorEvaluator.evaluate(vector["input"])
                if let difference = GameJSON.firstDifference(expected: vector["expected"], actual: actual, tolerance: 0) {
                    failures.append("\(label) — \(difference)")
                }
            } catch {
                failures.append("\(label) — \(error)")
            }
        }
        #expect(failures.isEmpty, "\(failures.count) vecteur(s) divergent :\n\(failures.joined(separator: "\n"))")
    }

    @Test("la frappe arrive en dernier : après le flan, avant la révélation, et le dernier coup est le plus fort")
    func theStrikeComesLast() {
        for edition in MeeshEdition.allCases {
            let plan = GameMintCeremony.plan(edition: edition, mode: .normal)
            let blank = plan.span(.blank)?.toMs ?? .max
            let reveal = plan.span(.reveal)?.fromMs ?? .min
            #expect(plan.strikes.allSatisfy { $0.impactMs > blank && $0.impactMs < reveal })
            #expect(plan.strikes.last?.isFinal == true)
            #expect(plan.strikes.dropLast().allSatisfy { !$0.isFinal })
        }
        #expect(GameMintCeremony.plan(edition: .prism, mode: .normal).strikes.last?.hitters == [.mee, .meo])
    }

    @Test("une réponse tardive garde le marteau levé et décale toute la suite d'autant")
    func aLateAnswerHoldsTheHammer() {
        let onTime = GameMintCeremony.plan(edition: .gold, mode: .normal)
        let late = GameMintCeremony.plan(edition: .gold, mode: .normal, answeredAtMs: 6300)
        #expect(late.span(.hold) == MintCeremonySpan(fromMs: 4750, toMs: 6300))
        #expect(late.endMs - onTime.endMs == 6300 - GameMintCeremony.strikeReadyMs)
    }
}

/// L'évaluateur : pour une entrée `{ law, ... }`, la sortie du miroir Swift, dans la MÊME forme JSON que la loi TS.
enum MintCeremonyVectorEvaluator {

    static func evaluate(_ input: GameJSON) throws -> GameJSON {
        switch input["law"].stringValue {
        case "mint-ceremony-plan":
            return json(try plan(input))
        case "mint-ceremony-skip":
            guard let atMs = input["atMs"].intValue else { throw GameLawVectorError.malformed("`atMs` absent") }
            return .object(["toMs": .int(GameMintCeremony.skip(try plan(input), atMs: Double(atMs)))])
        case "mint-refusal-reason":
            return .object(["reason": .string(GameMintCeremony.refusalReason(code: input["code"].stringValue).rawValue)])
        case let law:
            throw GameLawVectorError.unknownLaw(law ?? "∅")
        }
    }

    private static func plan(_ input: GameJSON) throws -> MintCeremonyPlan {
        guard let edition = input["edition"].stringValue.flatMap(MeeshEdition.init(rawValue:)),
              let mode = input["mode"].stringValue.flatMap(MintCeremonyMode.init(rawValue:)) else {
            throw GameLawVectorError.malformed("`edition` ou `mode` illisible")
        }
        let look = input["look"].stringValue.flatMap(MeeshEdition.init(rawValue:))
        return GameMintCeremony.plan(edition: edition, look: look, mode: mode,
                                     answeredAtMs: input["answeredAtMs"].intValue.map(Double.init),
                                     modest: input["modest"].boolValue ?? false)
    }

    private static func json(_ span: MintCeremonySpan?) -> GameJSON {
        span.map { .object(["fromMs": .int($0.fromMs), "toMs": .int($0.toMs)]) } ?? .null
    }

    private static func json(_ plan: MintCeremonyPlan) -> GameJSON {
        .object([
            "edition": .string(plan.edition.rawValue),
            "mode": .string(plan.mode.rawValue),
            "grand": .bool(plan.grand),
            "particles": .object([
                "weave": .int(plan.particles.weave),
                "dust": .array(plan.particles.dust.map {
                    .object(["from": .string($0.from.rawValue), "material": .string($0.material.rawValue), "count": .int($0.count)])
                }),
                "bursts": .array(plan.particles.bursts.map(GameJSON.int)),
                "puff": .int(plan.particles.puff),
            ]),
            "phases": .object(Dictionary(uniqueKeysWithValues: MintCeremonyPhase.allCases.map { ($0.rawValue, json(plan.span($0))) })),
            "strikes": .array(plan.strikes.map {
                .object(["atMs": .int($0.atMs), "impactMs": .int($0.impactMs),
                         "hitters": .array($0.hitters.map { .string($0.rawValue) }), "final": .bool($0.isFinal)])
            }),
            "refusal": plan.refusal.map {
                .object(["atMs": .int($0.atMs), "rewind": json($0.rewind), "rewindToMs": .int($0.rewindToMs),
                         "shadowIn": json($0.shadowIn), "shadowOut": json($0.shadowOut), "sayMs": .int($0.sayMs)])
            } ?? .null,
            "endMs": .int(plan.endMs),
        ])
    }
}
