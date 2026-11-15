import XCTest
@testable import Meeshy

final class RootAuthObservationGuardTests: XCTestCase {

    private static let appFolder = "Meeshy/App"

    private func rootSources() throws -> [(name: String, code: String)] {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let folder = root.appendingPathComponent(Self.appFolder)
        let appFiles = ((try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)) ?? [])
            .filter { $0.pathExtension == "swift" }
        let urls = AppSourceGuard.unitURLs("Meeshy/MeeshyApp.swift") + appFiles.sorted { $0.lastPathComponent < $1.lastPathComponent }
        return try urls.map { ($0.lastPathComponent, AppSourceGuard.stripComments(try String(contentsOf: $0, encoding: .utf8))) }
    }

    private func bodyOfMeeshyApp() throws -> String {
        let app = try XCTUnwrap(try rootSources().first { $0.name == "MeeshyApp.swift" }).code
        let start = try XCTUnwrap(app.range(of: "var body: some Scene {"))
        let end = try XCTUnwrap(app.range(of: "@SceneBuilder", range: start.upperBound..<app.endIndex))
        return String(app[start.upperBound..<end.lowerBound])
    }

    func test_sourcesAreNonEmpty() throws {
        let sources = try rootSources()
        XCTAssertTrue(sources.contains { $0.name == "MeeshyApp.swift" })
        let gate = try XCTUnwrap(sources.first { $0.name == "AppRootGate.swift" }, "AppRootGate.swift est introuvable")
        XCTAssertFalse(gate.code.isEmpty)
        XCTAssertGreaterThan(try bodyOfMeeshyApp().split(separator: "\n").count, 20)
    }

    func test_appRootGate_isTheOnlyAuthManagerObserver() throws {
        let observer = try NSRegularExpression(
            pattern: #"@(StateObject|ObservedObject|EnvironmentObject)\s+(private\s+)?var\s+\w+\s*(:\s*AuthManager\b|=\s*AuthManager\b)"#
        )
        let holders = try rootSources().flatMap { source -> [String] in
            let range = NSRange(source.code.startIndex..., in: source.code)
            return Array(repeating: source.name, count: observer.numberOfMatches(in: source.code, range: range))
        }
        XCTAssertEqual(holders, ["AppRootGate.swift"], "un seul observateur d'AuthManager à la racine, et c'est la porte")
    }

    func test_meeshyAppBody_readsNoAuthStateWhileRendering() throws {
        let body = try bodyOfMeeshyApp()
        XCTAssertFalse(body.contains("authManager"), "le body ne lit aucune propriété d'AuthManager : la porte les projette")
        let withoutInjection = body.replacingOccurrences(of: ".environmentObject(AuthManager.shared)", with: "")
        XCTAssertFalse(withoutInjection.contains("AuthManager.shared"), "seule l'injection d'environnement nomme AuthManager dans le body")
    }

    func test_rootFiles_neverSubscribeToAuthManagerPublishersOutsideTheLifecycleHook() throws {
        let allowed = "AuthManager.shared.$isAuthenticated.eraseToAnyPublisher()"
        for source in try rootSources() {
            let code = source.code.replacingOccurrences(of: allowed, with: "")
            XCTAssertFalse(code.contains("AuthManager.shared.$"), source.name)
            XCTAssertFalse(code.contains("authManager.$"), source.name)
            XCTAssertFalse(code.contains("objectWillChange"), source.name)
        }
    }

    func test_meeshyAppBody_fitsIn150Lines() throws {
        let lines = try bodyOfMeeshyApp().split(separator: "\n", omittingEmptySubsequences: false).count
        XCTAssertLessThanOrEqual(lines, 150, "le body de MeeshyApp tient en 150 lignes (hors commentaires) : \(lines)")
    }
}
