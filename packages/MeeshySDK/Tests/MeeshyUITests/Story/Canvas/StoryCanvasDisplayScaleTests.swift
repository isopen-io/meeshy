import XCTest
import UIKit
@testable import MeeshyUI

final class StoryCanvasDisplayScaleTests: XCTestCase {

    func test_resolved_positiveTrait_wins() {
        XCTAssertEqual(StoryCanvasDisplayScale.resolved(trait: 3, fallback: 2), 3)
    }

    func test_resolved_zeroTrait_usesFallback() {
        XCTAssertEqual(StoryCanvasDisplayScale.resolved(trait: 0, fallback: 2), 2)
    }

    func test_resolved_neverBelowOne() {
        XCTAssertEqual(StoryCanvasDisplayScale.resolved(trait: 0, fallback: 0), 1)
        XCTAssertEqual(StoryCanvasDisplayScale.resolved(trait: -1, fallback: 0.5), 1)
    }

    func test_canvasSources_haveNoUIScreenMain() throws {
        let canvasDirectory = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Story/Canvas")
        let files = try XCTUnwrap(FileManager.default.enumerator(at: canvasDirectory, includingPropertiesForKeys: nil))
            .compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" }
        XCTAssertFalse(files.isEmpty)
        for file in files {
            let offending = try String(contentsOf: file, encoding: .utf8)
                .components(separatedBy: .newlines)
                .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
                .filter { $0.contains("UIScreen.main") }
            XCTAssertTrue(offending.isEmpty, "\(file.lastPathComponent) reads UIScreen.main: \(offending)")
        }
    }

    func test_canvasSources_haveNoFatalErrorOutsideCoderInitializers() throws {
        let canvasDirectory = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Story/Canvas")
        let files = try XCTUnwrap(FileManager.default.enumerator(at: canvasDirectory, includingPropertiesForKeys: nil))
            .compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" }
        for file in files {
            let offending = try String(contentsOf: file, encoding: .utf8)
                .components(separatedBy: .newlines)
                .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
                .filter { $0.contains("fatalError(") && !$0.contains("does not support NSCoder") }
            XCTAssertTrue(offending.isEmpty, "\(file.lastPathComponent) traps: \(offending)")
        }
    }
}
