import XCTest

final class MeeshyUIConcSweepSourceGuardTests: XCTestCase {

    private static var sources: URL {
        ComposerSourceGuard.packageRoot.appendingPathComponent("Sources/MeeshyUI")
    }

    private func codeLines(_ relativePath: String) throws -> [String] {
        let url = Self.sources.appendingPathComponent(relativePath)
        let text = ComposerSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        return text.components(separatedBy: .newlines).map { $0.trimmingCharacters(in: .whitespaces) }
    }

    private func files(in directory: String, prefix: String) throws -> [String] {
        let dir = Self.sources.appendingPathComponent(directory)
        let names = try FileManager.default.contentsOfDirectory(atPath: dir.path)
            .filter { $0.hasPrefix(prefix) && $0.hasSuffix(".swift") }
        XCTAssertFalse(names.isEmpty, "\(directory)/\(prefix)*")
        return names.map { "\(directory)/\($0)" }
    }

    private func offending(_ path: String, tokens: [String], allowing allowed: Set<String> = []) throws -> [String] {
        try codeLines(path).filter { line in
            !allowed.contains(where: line.contains) && tokens.contains(where: line.contains)
        }
    }

    func test_audioPlaybackManager_carriesNoCleanupHandleNorUnsafe() throws {
        for path in try files(in: "Media", prefix: "AudioPlaybackManager") {
            let hits = try offending(path, tokens: ["CleanupHandle", "nonisolated(unsafe)"])
            XCTAssertTrue(hits.isEmpty, "\(path) : \(hits)")
        }
    }

    func test_storyBackgroundLayer_carriesNoNonisolatedUnsafe() throws {
        for path in try files(in: "Story/Canvas/Layers", prefix: "StoryBackgroundLayer") {
            let hits = try offending(path, tokens: ["nonisolated(unsafe)"])
            XCTAssertTrue(hits.isEmpty, "\(path) : \(hits)")
        }
    }

    func test_storyMediaLayer_keepsOnlyTheWeakBoxUnsafe() throws {
        for path in try files(in: "Story/Canvas/Layers", prefix: "StoryMediaLayer") {
            let hits = try offending(path, tokens: ["nonisolated(unsafe)"], allowing: ["weak var value: StoryMediaLayer?"])
            XCTAssertTrue(hits.isEmpty, "\(path) : \(hits)")
        }
    }

    func test_sweptCanvasAndMediaFiles_carryNoNSLockNorUnsafe() throws {
        let cases: [(String, Set<String>)] = [
            ("Story/Canvas/StoryForegroundVideoFrameSource.swift", []),
            ("Media/Branding/MeeshyVideoWatermarkBaker.swift", ["var image: CIImage?"]),
            ("Story/Canvas/StoryExportEncoder.swift", ["let input = pair.input", "let output = pair.output"]),
        ]
        for (path, allowed) in cases {
            let hits = try offending(path, tokens: ["NSLock()", "nonisolated(unsafe)"], allowing: allowed)
            XCTAssertTrue(hits.isEmpty, "\(path) : \(hits)")
        }
    }
}
