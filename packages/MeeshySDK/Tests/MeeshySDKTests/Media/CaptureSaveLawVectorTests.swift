import Foundation
import Testing
@testable import MeeshySDK

/// Rejeu iOS de `packages/shared/fixtures/capture-save/capture-save.vectors.json`,
/// la loi d'enregistrement d'une prise (#10284) : le MÊME fichier que vitest
/// rejoue, lu, jamais copié. Sur divergence, le TS a raison.
@Suite("Capture — la loi d'enregistrement d'une prise rejouée sur les vecteurs partagés")
struct CaptureSaveLawVectorTests {

    private struct Destination: Decodable {
        let zone: CaptureZone
        let expected: CaptureDestination
    }

    private enum Step: Decodable {
        case save
        case saveFailed(String?)
        case frame(String?)

        private enum CodingKeys: String, CodingKey { case op, frameId }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            switch try container.decode(String.self, forKey: .op) {
            case "save": self = .save
            case "saveFailed": self = .saveFailed(try container.decodeIfPresent(String.self, forKey: .frameId))
            case "frame": self = .frame(try container.decodeIfPresent(String.self, forKey: .frameId))
            case let other:
                throw DecodingError.dataCorruptedError(forKey: .op, in: container, debugDescription: "étape inconnue « \(other) »")
            }
        }

        func apply(to state: TakeSaveState) -> TakeSaveState {
            switch self {
            case .save: return CaptureSaveLaw.applySaved(state)
            case .saveFailed(let frameId): return CaptureSaveLaw.applySaveFailed(state, frameId: frameId)
            case .frame(let frameId): return CaptureSaveLaw.applyFrameChange(state, frameId: frameId)
            }
        }
    }

    private struct Sequence: Decodable {
        let name: String
        let origin: CaptureOrigin
        let steps: [Step]
        let visible: [Bool]
    }

    private struct Vectors: Decodable {
        let destinations: [Destination]
        let sequences: [Sequence]
    }

    /// `packages/MeeshySDK/Tests/MeeshySDKTests/Media/…` : **5** composants à retirer pour atteindre `packages/`.
    private static var vectorsURL: URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { url.deleteLastPathComponent() }
        return url.appendingPathComponent("shared/fixtures/capture-save/capture-save.vectors.json")
    }

    private static func load() throws -> Vectors {
        try JSONDecoder().decode(Vectors.self, from: Data(contentsOf: vectorsURL))
    }

    @Test("une prise par la zone cadre part en galerie puis en retouche, hors cadre elle reste dans l'app")
    func destinationsMatch() throws {
        let vectors = try Self.load()
        #expect(Set(vectors.destinations.map(\.zone)) == Set(CaptureZone.allCases))
        for destination in vectors.destinations {
            #expect(CaptureSaveLaw.destination(for: destination.zone) == destination.expected, "zone \(destination.zone)")
        }
    }

    @Test("le bouton Enregistrer de la retouche suit, étape par étape, la loi TypeScript")
    func sequencesMatch() throws {
        let vectors = try Self.load()
        #expect(vectors.sequences.count >= 10)
        let failures = vectors.sequences.compactMap { sequence -> String? in
            let states = sequence.steps.reduce([CaptureSaveLaw.beginTake(sequence.origin)]) { states, step in
                states + [step.apply(to: states[states.count - 1])]
            }
            let visible = states.map(CaptureSaveLaw.saveButtonVisible)
            return visible == sequence.visible ? nil : "« \(sequence.name) » attendu \(sequence.visible), obtenu \(visible)"
        }
        #expect(failures.isEmpty, "\(failures.count) séquence(s) divergente(s) :\n\(failures.joined(separator: "\n"))")
    }

    @Test("réenregistrer avec le même cadre n'empile pas de doublon")
    func savingTwiceKeepsOneMark() {
        let start = CaptureSaveLaw.beginTake(.outside(frameId: nil))
        #expect(CaptureSaveLaw.applySaved(CaptureSaveLaw.applySaved(start)).savedWith == [nil])
    }
}
