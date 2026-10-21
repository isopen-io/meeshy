import XCTest
import Foundation

final class LicensesMatchResolvedDependenciesGuardTests: XCTestCase {

    func test_chaqueLicenceGitHubDeLicensesViewNommeUneDependanceResolue() throws {
        let root = repoRoot()
        let view = try String(
            contentsOf: root.appendingPathComponent("apps/ios/Meeshy/Features/Main/Views/LicensesView.swift"),
            encoding: .utf8
        )
        let resolved = try String(
            contentsOf: root.appendingPathComponent(
                "apps/ios/Meeshy.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved"
            ),
            encoding: .utf8
        )
        let identities = Self.resolvedIdentities(in: resolved)
        XCTAssertGreaterThan(identities.count, 5, "Package.resolved ne livre plus aucune identité : le détecteur ne mesure plus rien")
        let orphans = Self.licensedRepositories(in: view).filter { !identities.contains($0) }
        XCTAssertTrue(
            orphans.isEmpty,
            "LicensesView crédite des dépendances absentes de Package.resolved : \(orphans.joined(separator: ", "))"
        )
    }

    func test_leDetecteurSignaleUneLicenceAbsenteEtLaisseUnePresente() {
        let view = """
        OpenSourceLicense(name: "A", url: "https://github.com/acme/Gone")
        OpenSourceLicense(name: "B", url: "https://github.com/acme/Here.git")
        OpenSourceLicense(name: "C", url: "https://webrtc.org")
        """
        let resolved = """
        { "identity" : "here" }
        """
        let identities = Self.resolvedIdentities(in: resolved)
        let orphans = Self.licensedRepositories(in: view).filter { !identities.contains($0) }
        XCTAssertEqual(orphans, ["gone"])
    }

    private static func resolvedIdentities(in resolved: String) -> Set<String> {
        Set(captures(of: #""identity"\s*:\s*"([^"]+)""#, in: resolved))
    }

    private static func licensedRepositories(in source: String) -> [String] {
        captures(of: #"url:\s*"https://github\.com/[^/"]+/([^/"]+)""#, in: source).map { name in
            let lowered = name.lowercased()
            return lowered.hasSuffix(".git") ? String(lowered.dropLast(4)) : lowered
        }
    }

    private static func captures(of pattern: String, in text: String) -> [String] {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        let range = NSRange(text.startIndex..., in: text)
        return regex.matches(in: text, range: range).compactMap { match in
            Range(match.range(at: 1), in: text).map { String(text[$0]) }
        }
    }

    private func repoRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }
}
