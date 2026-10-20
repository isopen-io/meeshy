import XCTest
@testable import Meeshy

final class AnchoredPickerWiringGuardTests: XCTestCase {

    private static let appRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()

    private func code(_ relativePath: String) throws -> String {
        let url = Self.appRoot.appendingPathComponent(relativePath)
        let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        XCTAssertFalse(source.isEmpty, relativePath)
        return source
    }

    private func swiftFiles(under relativePath: String) -> [URL] {
        let base = Self.appRoot.appendingPathComponent(relativePath)
        let enumerator = FileManager.default.enumerator(at: base, includingPropertiesForKeys: nil)
        return (enumerator?.allObjects as? [URL] ?? []).filter { $0.pathExtension == "swift" }
    }

    func test_pickers_areAnchoredToTheirButton() throws {
        let wired: [(path: String, removed: String)] = [
            ("Meeshy/Features/Main/Views/AudioPostComposerView+Transcription.swift", ".sheet(isPresented: $showLanguagePicker)"),
            ("Meeshy/Features/Main/Components/MessageDetail/MessageReactionsDetailView.swift", ".sheet(isPresented: $showFullEmojiPicker)"),
            ("Meeshy/Features/Main/Composer/MeeshyComposerHost+Socle.swift", ".sheet(item: $audiencePickerMode)"),
        ]
        for site in wired {
            let source = try code(site.path)
            XCTAssertTrue(source.contains(".anchoredPicker("), site.path)
            XCTAssertFalse(source.contains(site.removed), site.path)
        }
    }

    func test_lentilleFilter_staysANativeMenu() {
        for file in swiftFiles(under: "Meeshy/Features/Main/Lentille/Mode") {
            let source = AppSourceGuard.stripComments((try? String(contentsOf: file, encoding: .utf8)) ?? "")
            XCTAssertFalse(source.contains(".anchoredPicker("), file.lastPathComponent)
            XCTAssertFalse(source.contains(".popover("), file.lastPathComponent)
        }
    }

    func test_noAppFile_presentsAPopoverByHand() {
        let files = swiftFiles(under: "Meeshy")
        XCTAssertFalse(files.isEmpty)
        for file in files {
            let source = AppSourceGuard.stripComments((try? String(contentsOf: file, encoding: .utf8)) ?? "")
            XCTAssertFalse(source.contains(".popover("), file.path)
        }
    }

    func test_deadPopoverAdaptationTwin_isGone() throws {
        let source = try code("Meeshy/Features/Main/Views/ProgressionMeeshEntry.swift")
        XCTAssertFalse(source.contains("presentationCompactAdaptationPopoverIfAvailable"))
    }
}
