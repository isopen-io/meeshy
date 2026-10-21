import XCTest

final class MainQueueTimerSourceGuardTests: XCTestCase {

    private static let debt: [String: Int] = [
        "Primitives/EmojiReactionPicker.swift": 1,
        "Media/DocumentViewerView.swift": 0,
        "Media/ImageViewerView.swift": 0,
        "Media/MeeshyVideoPlayer+FullscreenSave.swift": 0,
        "Story/TimelineExportFlow.swift": 0,
        "Utilities/TextAnalyzer.swift": 0,
    ]

    func test_migratedMeeshyUISources_holdNoMoreMainQueueTimersThanTheirDebt() throws {
        for (relativePath, ceiling) in Self.debt.sorted(by: { $0.key < $1.key }) {
            let code = try Self.sourceWithoutComments("Sources/MeeshyUI/\(relativePath)")
            XCTAssertLessThanOrEqual(
                Self.mainQueueTimerCount(in: code), ceiling,
                "\(relativePath) : une temporisation du fil principal passe par DelayedUI (tâche annulable), pas par DispatchQueue.main."
            )
        }
    }

    func test_counter_countsAsyncAndAsyncAfter_andIgnoresComments() {
        let sample = """
        // DispatchQueue.main.async { ancien }
        DispatchQueue.main.async { a() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { b() }
        """
        let code = ComposerSourceGuard.stripComments(sample)
        XCTAssertEqual(Self.mainQueueTimerCount(in: code), 2)
    }

    private static func mainQueueTimerCount(in code: String) -> Int {
        code.components(separatedBy: "DispatchQueue.main.async").count - 1
    }

    private static func sourceWithoutComments(_ relativePath: String) throws -> String {
        ComposerSourceGuard.stripComments(
            try String(
                contentsOf: ComposerSourceGuard.packageRoot.appendingPathComponent(relativePath),
                encoding: .utf8
            )
        )
    }
}
