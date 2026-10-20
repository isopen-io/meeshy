import XCTest

final class WidgetSourceGuardTests: XCTestCase {

    private let ios = ProjectManifest.iosDirectory()
    private let consumersOfSharedFiles = ["Meeshy", "MeeshyTests"]

    private var widgetsDirectory: URL {
        ios.appendingPathComponent("MeeshyWidgets", isDirectory: true)
    }

    private func widgetFiles() throws -> [(name: String, code: String)] {
        try FileManager.default
            .contentsOfDirectory(at: widgetsDirectory, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "swift" }
            .map { (name: $0.lastPathComponent, code: AppSourceGuard.stripComments(try String(contentsOf: $0, encoding: .utf8))) }
    }

    private func occurrences(of pattern: String, in code: String) throws -> Int {
        let regex = try NSRegularExpression(pattern: pattern)
        return regex.numberOfMatches(in: code, range: NSRange(code.startIndex..., in: code))
    }

    func test_widgetsTarget_hasNoAsyncImage_noForegroundColor_noForceUnwrappedURL() throws {
        let forbidden = [
            "AsyncImage\\(": "une extension de widgets ne fait pas de réseau : l'image vient du conteneur App Group",
            "\\.foregroundColor\\(": "foregroundStyle est l'API courante, et le seul plancher du widget (17.0) la porte",
            "URL\\(string:[^\\n]*\\)!": "un lien profond se construit par WidgetDeepLink, jamais par force-unwrap",
            "date\\(byAdding:[^\\n]*\\)!": "la planification passe par WidgetRefreshSchedule",
        ]
        for file in try widgetFiles() {
            for (pattern, reason) in forbidden {
                let count = try occurrences(of: pattern, in: file.code)
                XCTAssertEqual(count, 0, "\(file.name) contient \(count) × « \(pattern) » — \(reason)")
            }
        }
    }

    func test_widgetExclusiveFiles_carryNoAvailabilityBelowTheirFloor() throws {
        let manifest = try ProjectManifest.load(from: ios)
        let shared = manifest.swiftPaths(inDirectory: "MeeshyWidgets", listedBy: consumersOfSharedFiles)
        let exclusive = try widgetFiles().filter { !shared.contains("MeeshyWidgets/\($0.name)") }
        XCTAssertFalse(exclusive.isEmpty)

        let belowFloor = "(?:@available|#available)\\(iOS 16\\.|(?:@available|#available)\\(iOS 17\\.0"
        for file in exclusive {
            let count = try occurrences(of: belowFloor, in: file.code)
            XCTAssertEqual(count, 0, "\(file.name) n'est compilé que dans MeeshyWidgets (plancher 17.0) : \(count) garde(s) de disponibilité inutile(s)")
        }
    }
}
