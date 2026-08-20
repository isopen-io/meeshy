import Testing
import Foundation
@testable import MeeshySDK

/// Le point d'étranglement client (Task B7) : `StoryEffects` est le type que
/// TOUT le fil décode (`APIPost`, `StoryItem`, brouillons). Un blob v3 doit
/// remplir les familles runtime par le pont B2 et garder le document servi en
/// snapshot de LECTURE ; l'encodage, lui, part TOUJOURS du runtime courant.
struct CanvasV3WireDecodingTests {
    private enum FixtureError: Error, CustomStringConvertible {
        case missing(String)

        var description: String {
            switch self {
            case .missing(let path):
                return "Fixture introuvable à \(path) — ajuster deletingLastPathComponent dans fixture(_:)"
            }
        }
    }

    private func fixture(_ name: String) throws -> Data {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // → Story/
            .deletingLastPathComponent() // → Models/
            .deletingLastPathComponent() // → MeeshySDKTests/
            .deletingLastPathComponent() // → Tests/
            .deletingLastPathComponent() // → MeeshySDK/
            .deletingLastPathComponent() // → packages/
            .appendingPathComponent("shared/fixtures/canvas-v3/\(name).json")
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw FixtureError.missing(url.path)
        }
        return try Data(contentsOf: url)
    }

    private func textPayload(_ document: CanvasV3, id: String) -> String? {
        guard let object = document.scenes.first?.objects.first(where: { $0.id == id }),
              case .string(let text)? = object.payload["text"] else { return nil }
        return text
    }

    @Test func v3Wire_fillsTheRuntimeFamilies_andKeepsTheServedDocument() throws {
        let effects = try JSONDecoder().decode(StoryEffects.self, from: fixture("v1-legacy-full.v3"))
        #expect(effects.textObjects.first?.text == "Salut")
        #expect(effects.canvasV3?.sound?.source == .library(soundId: "snd_nuits_ete"))
    }

    @Test func legacyWire_decodesUnchanged_andCarriesNoDocument() throws {
        let effects = try JSONDecoder().decode(StoryEffects.self, from: fixture("v1-legacy-full"))
        #expect(effects.textObjects.first?.text == "Salut")
        #expect(effects.canvasV3 == nil)
    }

    @Test func freshComposition_encodesV3_neverLegacyFamilies() throws {
        var effects = StoryEffects()
        effects.textObjects = [StoryTextObject(id: "t-neuf", text: "Bonjour")]
        let data = try JSONEncoder().encode(effects)
        #expect(String(decoding: data, as: UTF8.self).contains("\"v\":3"))
        let document = try JSONDecoder().decode(CanvasV3.self, from: data)
        #expect(document.v == 3)
        #expect(textPayload(document, id: "t-neuf") == "Bonjour")
    }

    @Test func mutatedRuntime_reEncodesTheEdit_notTheServedDocument() throws {
        var effects = try JSONDecoder().decode(StoryEffects.self, from: fixture("v1-legacy-full.v3"))
        effects.textObjects[0].text = "Edité"
        let document = try JSONDecoder().decode(CanvasV3.self, from: JSONEncoder().encode(effects))
        #expect(textPayload(document, id: "t1") == "Edité")
    }

    @Test func v3Wire_roundTripsWithoutMutation() throws {
        let served = try JSONDecoder().decode(CanvasV3.self, from: fixture("v1-legacy-full.v3"))
        let effects = try JSONDecoder().decode(StoryEffects.self, from: fixture("v1-legacy-full.v3"))
        let reEncoded = try JSONDecoder().decode(CanvasV3.self, from: JSONEncoder().encode(effects))
        #expect(reEncoded == served)
    }
}
