import XCTest
@testable import MeeshySDK

/// Guards against `#file` used as a default argument value in test helpers.
///
/// Swift 6 changes what `#file` expands to for code compiled in the Swift 6
/// language mode: it now yields a synthesized "file ID" (`Module/File.swift`)
/// instead of the full absolute path that `#filePath` still provides. Test
/// helpers that forward `file: StaticString = #file` into `XCTAssert*`/
/// `XCTFail` lose the ability to point Xcode's failure navigator at the
/// correct source line once that helper's containing target adopts Swift 6
/// mode — the failure gets attributed to whatever file ID resolution finds,
/// which is not guaranteed to be openable in the editor.
///
/// `#filePath` is unaffected by the language mode and keeps pointing at the
/// real file, so it is the only literal that belongs in these helper
/// signatures. This guard walks every `.swift` file under `Tests/` (both
/// `MeeshySDKTests` and `MeeshyUITests`) and fails if any of them still uses
/// bare `#file` — new test helpers copy-pasted from an old one are the most
/// likely source of regression.
final class Swift6TestFileArgSourceGuardTests: XCTestCase {

    private func testsRootURL() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // MeeshySDKTests/
            .deletingLastPathComponent() // Tests/
    }

    func test_noTestHelperUsesFileInsteadOfFilePath() throws {
        let root = testsRootURL()
        let fileManager = FileManager.default
        guard let enumerator = fileManager.enumerator(at: root, includingPropertiesForKeys: nil) else {
            XCTFail("Could not enumerate Tests directory at \(root.path)")
            return
        }

        // `\b` after `#file` matches a word/non-word transition. Between
        // "file" and "Path" in `#filePath` both characters are word
        // characters, so there is no boundary there and `#filePath` never
        // matches — only bare `#file` followed by `,`, `)`, whitespace, etc.
        let regex = try NSRegularExpression(pattern: "#file\\b")
        let thisFileName = URL(fileURLWithPath: #filePath).lastPathComponent

        var violations: [String] = []
        for case let fileURL as URL in enumerator where fileURL.pathExtension == "swift" {
            // This guard's own doc comment mentions `#file` in prose — skip self.
            guard fileURL.lastPathComponent != thisFileName else { continue }
            let contents = try String(contentsOf: fileURL, encoding: .utf8)
            let range = NSRange(contents.startIndex..<contents.endIndex, in: contents)
            if regex.firstMatch(in: contents, range: range) != nil {
                violations.append(fileURL.lastPathComponent)
            }
        }

        XCTAssertTrue(
            violations.isEmpty,
            "Test helper(s) default to `#file` instead of `#filePath`, which breaks Xcode's " +
            "failure-location mapping under Swift 6 language mode: \(violations.sorted())"
        )
    }
}
