import XCTest
@testable import MeeshySDK

/// #6624 — accorder la traduction vocale rendait la catégorie `application`
/// INENREGISTRABLE.
///
/// `ApplicationPreferences` encodait les cinq horodatages de consentement dès
/// qu'ils étaient posés, et le bloc part EN ENTIER comme corps de
/// `PATCH /me/preferences/application`. La passerelle déclare ces cinq clés
/// `z.never(...)` depuis #4180 : la requête entière tombe en 400, et le thème,
/// la langue d'interface ou tout autre réglage de la catégorie ne partent plus.
/// Mesuré en production : trois 400 isolés le 14/09, aucun 200 sur 72 h.
///
/// Le témoin de CONTRAT lit le schéma partagé plutôt qu'une liste recopiée —
/// une liste écrite ici divergerait de l'original le jour où l'un des deux
/// bouge, et la divergence reviendrait en silence. Il confronte les DEUX
/// refus de la frontière : une clé `z.never`, et une clé que le schéma ne
/// déclare pas du tout (`.strict()` dans `submittedFrom`, #4589).
final class ApplicationPreferencesWireContractTests: XCTestCase {

    // MARK: - Encodage

    func test_encode_withEveryLegacyConsentTimestampSet_sendsNoneOfThem() throws {
        let keys = try encodedKeys(of: Self.preferencesCarryingEveryLegacyConsent())

        XCTAssertTrue(
            keys.isDisjoint(with: Self.legacyConsentKeys),
            "clés de consentement encore encodées : \(keys.intersection(Self.legacyConsentKeys).sorted())"
        )
    }

    func test_encode_keepsTheOrdinaryApplicationPreferences() throws {
        let keys = try encodedKeys(of: Self.preferencesCarryingEveryLegacyConsent())

        XCTAssertTrue(keys.isSuperset(of: ["theme", "interfaceLanguage", "telemetryEnabled", "extras"]))
    }

    func test_decode_legacyConsentKeysStillServedByTheGateway_remainReadable() throws {
        let served = Data("""
        {"theme":"dark","voiceProfileConsentAt":"2026-01-01T00:00:00.000Z","voiceCloningEnabledAt":"2026-01-02T00:00:00.000Z"}
        """.utf8)

        let decoded = try JSONDecoder().decode(ApplicationPreferences.self, from: served)

        XCTAssertEqual(decoded.theme, .dark)
        XCTAssertEqual(decoded.voiceProfileConsentAt, "2026-01-01T00:00:00.000Z")
        XCTAssertEqual(decoded.voiceCloningEnabledAt, "2026-01-02T00:00:00.000Z")
    }

    // MARK: - Contrat avec le schéma partagé

    func test_contract_sharedSchemaStillRefusesExactlyTheFiveLegacyConsentKeys() throws {
        let schema = try SharedApplicationSchema.load()

        XCTAssertEqual(schema.refusedKeys, Self.legacyConsentKeys)
    }

    func test_contract_everyEncodedKeyIsAcceptedByTheStrictSharedSchema() throws {
        let schema = try SharedApplicationSchema.load()
        XCTAssertGreaterThan(schema.acceptedKeys.count, 10, "précondition : l'extraction voit le schéma")

        let keys = try encodedKeys(of: Self.preferencesCarryingEveryLegacyConsent())

        XCTAssertEqual(
            keys.subtracting(schema.acceptedKeys), [],
            "clés que PATCH /me/preferences/application refuse en 400 pour la catégorie ENTIÈRE"
        )
    }

    // MARK: - Fabriques

    private static let legacyConsentKeys: Set<String> = [
        "dataProcessingConsentAt", "voiceDataConsentAt", "voiceProfileConsentAt",
        "voiceCloningConsentAt", "voiceCloningEnabledAt",
    ]

    private static func preferencesCarryingEveryLegacyConsent() -> ApplicationPreferences {
        ApplicationPreferences(
            theme: .dark,
            dataProcessingConsentAt: "2026-09-14T15:47:48.000Z",
            voiceDataConsentAt: "2026-09-14T15:47:48.000Z",
            voiceProfileConsentAt: "2026-09-14T15:47:48.000Z",
            voiceCloningConsentAt: "2026-09-14T15:47:48.000Z",
            voiceCloningEnabledAt: "2026-09-14T15:47:48.000Z",
            extras: ["sonde": .string("6624")]
        )
    }

    private func encodedKeys(of preferences: ApplicationPreferences) throws -> Set<String> {
        let data = try JSONEncoder().encode(preferences)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        return Set(object.keys)
    }
}

/// Lecture de `packages/shared/types/preferences/application.ts` — la source
/// que la passerelle compile, pas une copie.
private struct SharedApplicationSchema {
    let acceptedKeys: Set<String>
    let refusedKeys: Set<String>

    static func load() throws -> SharedApplicationSchema {
        let source = try String(contentsOf: schemaURL, encoding: .utf8)
        let block = try objectBlock(of: "ApplicationPreferenceSchema", in: source)
        let declared = topLevelKeys(in: block, matching: #"^  ([A-Za-z]+)\s*:\s*z\."#)
        let refused = topLevelKeys(in: block, matching: #"^  ([A-Za-z]+)\s*:\s*z\.never\("#)
        return SharedApplicationSchema(acceptedKeys: declared.subtracting(refused), refusedKeys: refused)
    }

    private static var schemaURL: URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<6 { url.deleteLastPathComponent() }
        return url.appendingPathComponent("packages/shared/types/preferences/application.ts")
    }

    private static func objectBlock(of name: String, in source: String) throws -> [String] {
        let lines = source.components(separatedBy: "\n")
        let start = try XCTUnwrap(
            lines.firstIndex { $0.hasPrefix("export const \(name) = z.object({") },
            "\(name) introuvable dans le schéma partagé"
        )
        let end = try XCTUnwrap(
            lines[(start + 1)...].firstIndex { $0.hasPrefix("});") },
            "fin de \(name) introuvable"
        )
        return Array(lines[(start + 1)..<end])
    }

    private static func topLevelKeys(in block: [String], matching pattern: String) -> Set<String> {
        let regex = try! NSRegularExpression(pattern: pattern)
        return Set(block.compactMap { line in
            let range = NSRange(line.startIndex..., in: line)
            guard let match = regex.firstMatch(in: line, range: range),
                  let key = Range(match.range(at: 1), in: line) else { return nil }
            return String(line[key])
        })
    }
}
