import XCTest
@testable import Meeshy

/// #8695 — « Le traitement de la prise photo doit être unique et réutilisé
/// partout ! » (porteur, 2026-09-29).
///
/// Le traitement vit dans `PhotoCaptureProcessor` (MeeshySDK). Cette garde
/// balaie l'app, ses extensions et le SDK : tout fichier qui PREND une photo
/// (sortie photo AVFoundation, octets d'un `AVCapturePhoto`) ou qui ENREGISTRE
/// une capture d'appel doit passer par lui, et aucun autre fichier ne peut
/// réécrire sa chaîne de réduction de bruit ou de netteté.
final class PhotoCaptureProcessingGuardTests: XCTestCase {

    private static let captureMarkers = ["AVCapturePhotoOutput(", "fileDataRepresentation()"]
    private static let processorName = "PhotoCaptureProcessor"

    /// Les filtres de la chaîne légère. Hors du service, seuls deux fichiers
    /// ont le droit de les nommer : le pipeline VIDÉO d'appel (trames en
    /// direct, pas une prise photo) et l'éditeur d'image, dont les filtres sont
    /// choisis par l'utilisateur.
    private static let enhancementFilters = ["\"CINoiseReduction\"", "\"CISharpenLuminance\"", ".noiseReduction()", ".sharpenLuminance()"]
    private static let enhancementHosts: Set<String> = [
        "PhotoCaptureProcessor.swift",
        "VideoFilterPipeline.swift",
        "ImageFilterEngine.swift",
    ]

    private func repoRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private func swiftSources() -> [URL] {
        let root = repoRoot()
        return [
            "apps/ios/Meeshy",
            "apps/ios/MeeshyShareExtension",
            "apps/ios/MeeshyNotificationExtension",
            "apps/ios/MeeshyNotificationContentExtension",
            "apps/ios/MeeshyWidgets",
            "apps/ios/MeeshyBroadcastExtension",
            "packages/MeeshySDK/Sources",
        ]
        .map { root.appendingPathComponent($0) }
        .flatMap { dir -> [URL] in
            guard let walker = FileManager.default.enumerator(at: dir, includingPropertiesForKeys: nil) else { return [] }
            return walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
        }
    }

    private func code(of url: URL) -> String? {
        guard let raw = try? String(contentsOf: url, encoding: .utf8) else { return nil }
        return AppSourceGuard.stripComments(raw)
    }

    func test_swiftSources_scanFindsTheSdkService() {
        let names = swiftSources().map(\.lastPathComponent)
        XCTAssertTrue(names.contains("PhotoCaptureProcessor.swift"), "Le balayage doit voir le SDK, sinon la garde ne garde rien.")
        XCTAssertTrue(names.contains("CameraModel.swift"))
    }

    func test_photoCaptureSites_allGoThroughTheSingleProcessor() {
        let offenders = swiftSources().compactMap { url -> String? in
            guard let code = code(of: url),
                  Self.captureMarkers.contains(where: code.contains),
                  !code.contains(Self.processorName) else { return nil }
            return url.lastPathComponent
        }
        XCTAssertEqual(offenders, [], "Une prise photo qui n'appelle pas \(Self.processorName) envoie une photo non traitée.")
    }

    func test_photoCaptureSites_existAndAreCounted() {
        let sites = swiftSources().filter { url in
            code(of: url).map { code in Self.captureMarkers.contains(where: code.contains) } ?? false
        }
        XCTAssertEqual(sites.map(\.lastPathComponent), ["CameraModel.swift"],
                       "Un NOUVEAU site de prise photo : le brancher sur \(Self.processorName), puis mettre cette liste à jour.")
    }

    func test_cameraDelegate_publishesTheProcessedPhoto() throws {
        let url = try XCTUnwrap(swiftSources().first { $0.lastPathComponent == "CameraModel.swift" })
        let code = try XCTUnwrap(code(of: url))
        let start = try XCTUnwrap(code.range(of: "didFinishProcessingPhoto"))
        let body = String(code[start.upperBound...].prefix(1500))
        XCTAssertTrue(body.contains("process(encoded:"), "Le délégué photo doit traiter les octets avant de les publier.")
    }

    func test_callCaptureSaver_encodesThroughTheSingleProcessor() throws {
        let url = try XCTUnwrap(swiftSources().first { $0.lastPathComponent == "CallCaptureController.swift" })
        let code = try XCTUnwrap(code(of: url))
        let start = try XCTUnwrap(code.range(of: "func save(_ image: CGImage) async -> Bool {"))
        let body = String(code[start.upperBound...].prefix(600))
        XCTAssertTrue(body.contains("process(image:"), "Une capture d'appel s'enregistre traitée, comme toute prise photo.")
    }

    func test_enhancementChain_hasNoSecondImplementation() {
        let offenders = swiftSources().compactMap { url -> String? in
            guard !Self.enhancementHosts.contains(url.lastPathComponent),
                  let code = code(of: url),
                  Self.enhancementFilters.contains(where: code.contains) else { return nil }
            return url.lastPathComponent
        }
        XCTAssertEqual(offenders, [], "Réduction de bruit / netteté réécrites hors de \(Self.processorName) : appeler le service.")
    }
}
