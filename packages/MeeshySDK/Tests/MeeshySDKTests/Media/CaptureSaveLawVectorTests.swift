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
        let savesOriginal: Bool
        let expected: CaptureDestination
    }

    private enum Step: Decodable {
        case save
        case saveFailed(SavedVersion)
        case frame(String?)
        case format(String)

        private enum CodingKeys: String, CodingKey { case op, frameId, format }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            switch try container.decode(String.self, forKey: .op) {
            case "save": self = .save
            case "saveFailed":
                self = .saveFailed(SavedVersion(frameId: try container.decodeIfPresent(String.self, forKey: .frameId),
                                                format: try container.decode(String.self, forKey: .format)))
            case "frame": self = .frame(try container.decodeIfPresent(String.self, forKey: .frameId))
            case "format": self = .format(try container.decode(String.self, forKey: .format))
            case let other:
                throw DecodingError.dataCorruptedError(forKey: .op, in: container, debugDescription: "étape inconnue « \(other) »")
            }
        }

        func apply(to state: TakeSaveState) -> TakeSaveState {
            switch self {
            case .save: return CaptureSaveLaw.applySaved(state)
            case .saveFailed(let version): return CaptureSaveLaw.applySaveFailed(state, version: version)
            case .frame(let frameId): return CaptureSaveLaw.applyFrameChange(state, frameId: frameId)
            case .format(let format): return CaptureSaveLaw.applyFormatChange(state, format: format)
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

    @Test("une prise par la zone cadre part en galerie ; hors cadre, elle reste dans l'app sauf si le réglage demande l'original")
    func destinationsMatch() throws {
        let vectors = try Self.load()
        let couverts = Set(vectors.destinations.map { "\($0.zone.rawValue):\($0.savesOriginal)" })
        #expect(couverts == Set(CaptureZone.allCases.flatMap { ["\($0.rawValue):false", "\($0.rawValue):true"] }))
        for destination in vectors.destinations {
            #expect(CaptureSaveLaw.destination(for: destination.zone, savesOriginal: destination.savesOriginal) == destination.expected,
                    "zone \(destination.zone), original \(destination.savesOriginal)")
        }
    }

    @Test("par défaut, l'original d'une prise hors cadre reste dans l'app (#10284) ; le réglage activé l'envoie en galerie")
    func outsideFollowsTheSetting() {
        #expect(CaptureSaveLaw.destination(for: .outside) == .outside)
        #expect(CaptureSaveLaw.destination(for: .outside, savesOriginal: true) == .frame)
        #expect(CaptureSaveLaw.destination(for: .frame, savesOriginal: false) == .frame)
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

    @Test("réenregistrer avec le même cadre et le même format n'empile pas de doublon")
    func savingTwiceKeepsOneMark() {
        let start = CaptureSaveLaw.beginTake(.outside(frameId: nil, format: "story"))
        #expect(CaptureSaveLaw.applySaved(CaptureSaveLaw.applySaved(start)).savedWith == [SavedVersion(frameId: nil, format: "story")])
    }

    @Test("#10296 : story enregistrée, carré enregistré, retour à la story — deux versions, aucun doublon")
    func eachFormatIsAVersion() {
        let story = CaptureSaveLaw.beginTake(.frame(frameId: "or-royal", format: "story"))
        let carre = CaptureSaveLaw.applyFormatChange(story, format: "square")
        #expect(CaptureSaveLaw.saveButtonVisible(carre))
        let retour = CaptureSaveLaw.applySaved(CaptureSaveLaw.applyFormatChange(CaptureSaveLaw.applySaved(carre), format: "story"))
        #expect(!CaptureSaveLaw.saveButtonVisible(retour))
        #expect(retour.savedWith == [SavedVersion(frameId: "or-royal", format: "story"), SavedVersion(frameId: "or-royal", format: "square")])
    }
}
