import XCTest

/// LOT-15 — la conformité `Sendable` d'un service est VÉRIFIÉE par le compilateur
/// dès que le service n'a aucun état mutable. `@unchecked Sendable` n'est permis
/// que là où un verrou garde l'état, ou là où l'état mutable est nommé ici.
final class ServicesSendabilityGuardTests: XCTestCase {

    private static let namedUncheckedServices: Set<String> = ["BlockService.swift", "LocationService.swift"]
    private static let lockPrimitive = try! NSRegularExpression(
        pattern: #"OSAllocatedUnfairLock|NSLock|os_unfair_lock|Mutex<"#
    )

    private func packageRoot() throws -> URL {
        var directory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        for _ in 0..<8 {
            if FileManager.default.fileExists(atPath: directory.appendingPathComponent("Package.swift").path) {
                return directory
            }
            directory = directory.deletingLastPathComponent()
        }
        throw NSError(domain: "ServicesSendabilityGuardTests", code: 1, userInfo: [
            NSLocalizedDescriptionKey: "Package.swift introuvable depuis \(#filePath)"
        ])
    }

    private func services() throws -> [(name: String, text: String)] {
        let directory = try packageRoot().appendingPathComponent("Sources/MeeshySDK/Services")
        return try FileManager.default.contentsOfDirectory(atPath: directory.path)
            .filter { $0.hasSuffix(".swift") }
            .sorted()
            .map { ($0, try String(contentsOf: directory.appendingPathComponent($0), encoding: .utf8)) }
    }

    private func holdsLock(_ text: String) -> Bool {
        Self.lockPrimitive.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
    }

    func test_everyUncheckedSendableServiceIsLockedOrNamed() throws {
        let files = try services()
        XCTAssertGreaterThan(files.count, 40, "la garde ne lit plus le dossier Services")
        let offenders = files
            .filter { $0.text.contains("@unchecked Sendable") }
            .filter { !holdsLock($0.text) && !Self.namedUncheckedServices.contains($0.name) }
            .map(\.name)
        XCTAssertEqual(
            offenders, [],
            "`@unchecked Sendable` sans verrou : ces services n'ont pas d'état mutable, ils déclarent `Sendable` " +
            "et le compilateur le vérifie (\(offenders.count) fichiers)."
        )
    }

    func test_theNamedUncheckedServicesStillNeedTheirEscapeHatch() throws {
        let files = try services().filter { Self.namedUncheckedServices.contains($0.name) }
        XCTAssertEqual(files.count, Self.namedUncheckedServices.count)
        for file in files {
            XCTAssertTrue(
                file.text.contains("@unchecked Sendable"),
                "\(file.name) est devenu Sendable vérifié : retirez-le de la liste nommée."
            )
        }
    }

    func test_apiClientProvidingAndPinnedRequestingRefineSendable() throws {
        let source = try String(
            contentsOf: packageRoot().appendingPathComponent("Sources/MeeshySDK/Networking/APIClientProviding.swift"),
            encoding: .utf8
        )
        XCTAssertTrue(source.contains("protocol APIClientProviding: Sendable"))
        XCTAssertTrue(source.contains("protocol PinnedRequesting: Sendable"))
    }
}
