import XCTest
@testable import Meeshy

/// Port fidèle du patron `try?` → `do/catch` + logging établi aux runs #12/#13
/// de la routine dette iOS (`CameraView.swift`, `MediaSessionCoordinator.swift`).
/// `discardStagingDirectory` avalait silencieusement TOUT échec de
/// `FileManager.removeItem` — y compris un vrai échec (permissions, volume en
/// lecture seule), pas seulement le cas nominal « dossier déjà réclamé ».
///
/// Aucun seam pour forcer un échec réel de `FileManager` en test unitaire
/// portable (confirmé en lisant les suites existantes) — cette garde de
/// source verrouille mécaniquement l'absence de `try?` et l'usage du helper
/// SDK partagé `removeItemLogging`, qui distingue déjà les deux cas
/// (`packages/MeeshySDK/Sources/MeeshySDK/Core/FileManagerLogging.swift`).
final class MediaSaveCoordinatorTryOptionalLoggingSourceGuardTests: XCTestCase {

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Services
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Services/MediaSaveCoordinator.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_discardStagingDirectory_neverUsesTryOptional() throws {
        let stripped = AppSourceGuard.stripComments(try source())
        XCTAssertFalse(
            stripped.contains("try?"),
            "discardStagingDirectory ne doit plus avaler silencieusement un échec réel de removeItem"
        )
    }

    func test_discardStagingDirectory_logsThroughTheSharedFileManagerHelper() throws {
        let stripped = AppSourceGuard.stripComments(try source())
        XCTAssertTrue(
            stripped.contains("removeItemLogging"),
            "doit distinguer 'déjà réclamé' d'un vrai échec via le helper SDK partagé, pas un do/catch réécrit à la main"
        )
    }
}
