import XCTest
import MeeshySDK

final class SDKLocalizedBundleGuardTests: XCTestCase {

    private static var sourcesRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources")
    }

    static func unbundledCalls(in source: String) -> [Int] {
        let marker = "String(localized:"
        let lines = source.components(separatedBy: "\n")
        let isCode = lines.map { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
        let code = zip(lines, isCode).map { $1 ? $0 : "" }.joined(separator: "\n")
        var offenders: [Int] = []
        var searchStart = code.startIndex
        while let hit = code.range(of: marker, range: searchStart..<code.endIndex) {
            searchStart = hit.upperBound
            var depth = 1
            var cursor = hit.upperBound
            while cursor < code.endIndex, depth > 0 {
                if code[cursor] == "(" { depth += 1 }
                if code[cursor] == ")" { depth -= 1 }
                cursor = code.index(after: cursor)
            }
            let call = String(code[hit.upperBound..<cursor])
            guard !call.contains("bundle:") else { continue }
            let line = code[code.startIndex..<hit.lowerBound].filter { $0 == "\n" }.count + 1
            offenders.append(line)
        }
        return offenders
    }

    func test_aucunStringLocalizedDuSDKNeSePasseDeBundle() throws {
        let enumerator = try XCTUnwrap(FileManager.default.enumerator(at: Self.sourcesRoot, includingPropertiesForKeys: nil))
        let files = enumerator.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
        XCTAssertGreaterThan(files.count, 0, "le balayage ne voit aucun fichier")
        let offenders = try files.flatMap { url -> [String] in
            let text = try String(contentsOf: url, encoding: .utf8)
            return Self.unbundledCalls(in: text).map { "\(url.lastPathComponent):\($0)" }
        }
        XCTAssertEqual(offenders, [], "String(localized:) sans bundle: dans le SDK (le SDK n'a pas de Bundle.module : nommer .main ou .module)")
    }

    func test_leScannerVoitLAppelRepartiEtIgnoreLeCommentaire() {
        let sample = """
        /// String(localized: "doc.mention", defaultValue: "x")
        let a = String(localized: "k.one", defaultValue: "x")
        let b = String(localized: "k.two",
                       defaultValue: "y")
        let c = String(localized: "k.three",
                       defaultValue: "z",
                       bundle: .main)
        """
        XCTAssertEqual(Self.unbundledCalls(in: sample), [2, 3])
    }

    func test_shortLabel_horsCatalogue_rendLaValeurParDefaut() {
        XCTAssertEqual(AutoDownloadPolicy.always.shortLabel, "Toujours")
        XCTAssertEqual(AutoDownloadPolicy.wifiAndGoodCellular.shortLabel, "Wi-Fi + bon cellulaire")
        XCTAssertEqual(AutoDownloadPolicy.wifiOnly.shortLabel, "Wi-Fi uniquement")
        XCTAssertEqual(AutoDownloadPolicy.never.shortLabel, "Jamais")
    }
}
