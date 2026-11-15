import XCTest

/// **Un seul extracteur de forme d'onde (#9886).** Quatre fichiers se disaient
/// chacun « la » forme d'onde, avec deux échelles et deux caches. Cette garde
/// interdit le RETOUR d'un second site de lecture audio pour mesurer une onde.
final class WaveformSingleExtractorGuardTests: XCTestCase {

    private static var racineDuPaquet: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Audio
            .deletingLastPathComponent() // MeeshySDKTests
            .deletingLastPathComponent() // Tests
            .deletingLastPathComponent() // MeeshySDK
    }

    private func sources(under subpath: String) throws -> [(name: String, code: String)] {
        let base = Self.racineDuPaquet.appendingPathComponent(subpath)
        guard let walker = FileManager.default.enumerator(at: base, includingPropertiesForKeys: nil) else {
            XCTFail("dossier introuvable : \(base.path)")
            return []
        }
        return try walker.compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" }
            .map { ($0.lastPathComponent, try String(contentsOf: $0, encoding: .utf8)) }
    }

    func test_theScanSeesTheSources() throws {
        XCTAssertTrue(try sources(under: "Sources/MeeshySDK/Audio").contains { $0.name == "WaveformCache.swift" })
    }

    func test_theDeprecatedGeneratorIsGone() throws {
        let all = try sources(under: "Sources")
        XCTAssertFalse(all.contains { $0.name == "WaveformGenerator.swift" })
        XCTAssertFalse(all.contains { $0.code.contains("WaveformGenerator") }, "plus aucun appelant du reliquat")
    }

    func test_noSecondRMSLoop_remains() throws {
        let offenders = try sources(under: "Sources").filter { $0.code.contains("computeRMSBuckets") }
        XCTAssertTrue(offenders.isEmpty, "une seconde boucle RMS : \(offenders.map(\.name))")
    }

    func test_onlyTheExtractorOpensAudioToMeasureAWave() throws {
        let readers = try sources(under: "Sources")
            .filter { $0.name.lowercased().contains("waveform") }
            .filter { $0.code.contains("AVAudioFile(forReading") || $0.code.contains("AVAssetReader(") }
            .map(\.name)

        XCTAssertEqual(readers, ["WaveformExtractor.swift"])
    }

    func test_theMeasureIsVectorised() throws {
        let math = try XCTUnwrap(try sources(under: "Sources/MeeshySDK/Audio").first { $0.name == "WaveformMath.swift" })
        XCTAssertTrue(math.code.contains("vDSP_rmsqv"))
    }
}
