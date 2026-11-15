import XCTest
@testable import MeeshySDK

/// #6624 — le vocabulaire des consentements du SDK confronté à
/// `packages/shared/types/consents.ts`, le site unique que la passerelle
/// compile (#4487).
///
/// Chaque miroir a sa panne propre :
/// - une finalité mal écrite fait répondre 400 `UNKNOWN_CONSENT_PURPOSE` ;
/// - une version de politique divergente fait répondre 409 à CHAQUE octroi ;
/// - un parent faux fait croire accordé un ancêtre que le serveur n'a pas posé.
final class ConsentContractTests: XCTestCase {

    func test_purposes_matchSharedConsentPurposes() throws {
        let shared = try SharedConsents.load()

        XCTAssertEqual(ConsentPurpose.allCases.map(\.rawValue), shared.purposes)
    }

    func test_parents_matchSharedConsentParent() throws {
        let shared = try SharedConsents.load()
        XCTAssertEqual(shared.parents.count, 5, "précondition : l'extraction voit les cinq finalités")

        let swiftParents = Dictionary(uniqueKeysWithValues: ConsentPurpose.allCases.map {
            ($0.rawValue, $0.parent?.rawValue ?? "null")
        })

        XCTAssertEqual(swiftParents, shared.parents)
    }

    func test_policyVersion_matchesSharedDefault() throws {
        let shared = try SharedConsents.load()

        XCTAssertEqual(ConsentPolicy.defaultVersion, shared.policyVersion)
    }

    func test_lineage_ofVoiceCloning_isTheWholeVoiceChainDownToDataProcessing() {
        XCTAssertEqual(
            ConsentPurpose.voiceCloning.lineage,
            [.voiceCloning, .voiceProfile, .voiceData, .dataProcessing]
        )
    }
}

private struct SharedConsents {
    let purposes: [String]
    let parents: [String: String]
    let policyVersion: String?

    static func load() throws -> SharedConsents {
        let source = try String(contentsOf: sourceURL, encoding: .utf8)
        let lines = source.components(separatedBy: "\n")
        let purposeBlock = try block(in: lines, from: "export const CONSENT_PURPOSES = [", to: "] as const;")
        let parentBlock = try block(in: lines, from: "export const CONSENT_PARENT", to: "};")
        return SharedConsents(
            purposes: purposeBlock.flatMap { captures(#"'([a-z-]+)'"#, in: $0) },
            parents: Dictionary(uniqueKeysWithValues: parentBlock.compactMap(parentPair)),
            policyVersion: lines.lazy
                .compactMap { captures(#"^export const CONSENT_POLICY_VERSION_DEFAULT = '([^']+)';"#, in: $0).first }
                .first
        )
    }

    private static var sourceURL: URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<6 { url.deleteLastPathComponent() }
        return url.appendingPathComponent("packages/shared/types/consents.ts")
    }

    private static func block(in lines: [String], from start: String, to end: String) throws -> [String] {
        let first = try XCTUnwrap(lines.firstIndex { $0.hasPrefix(start) }, "\(start) introuvable")
        let last = try XCTUnwrap(lines[(first + 1)...].firstIndex { $0.hasPrefix(end) }, "fin de \(start) introuvable")
        return Array(lines[(first + 1)..<last])
    }

    private static func parentPair(_ line: String) -> (String, String)? {
        let parts = captures(#"^\s+'?([a-z-]+)'?\s*:\s*(?:'([a-z-]+)'|(null))"#, in: line)
        guard let key = parts.first, let parent = parts.dropFirst().first else { return nil }
        return (key, parent)
    }

    private static func captures(_ pattern: String, in line: String) -> [String] {
        let regex = try! NSRegularExpression(pattern: pattern)
        let range = NSRange(line.startIndex..., in: line)
        return regex.matches(in: line, range: range).flatMap { match in
            (1..<match.numberOfRanges).compactMap { index in
                Range(match.range(at: index), in: line).map { String(line[$0]) }
            }
        }
    }
}
