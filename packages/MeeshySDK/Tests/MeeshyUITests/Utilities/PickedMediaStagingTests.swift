import XCTest
@testable import MeeshyUI

/// **Importer une vidéo de la photothèque passe par un fichier** (#9870).
///
/// Le système supprime le fichier qu'il remet à `FileRepresentation` dès que la
/// fermeture rend la main : la copie vers le `tmp` de l'app est la SEULE fenêtre
/// où l'octet existe encore. Ces témoins tiennent la loi pure de cette copie,
/// sans photothèque : c'est elle qui remplace `loadTransferable(type: Data.self)`
/// + `data.write(to:)`, qui faisait traverser deux fois la mémoire à un film 4K.
final class PickedMediaStagingTests: XCTestCase {

    private func makeSandbox() throws -> URL {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("picked-media-staging-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        return directory
    }

    private func makeSource(in sandbox: URL, name: String, bytes: Data = Data("film".utf8)) throws -> URL {
        let url = sandbox.appendingPathComponent(name)
        try bytes.write(to: url)
        return url
    }

    func test_stage_copiesTheBytesSoTheyOutliveTheSource() throws {
        let sandbox = try makeSandbox()
        let source = try makeSource(in: sandbox, name: "IMG_0001.MOV", bytes: Data("hevc-bytes".utf8))
        let destination = sandbox.appendingPathComponent("out", isDirectory: true)

        let staged = try PickedMediaStaging.stage(source, directory: destination)
        try FileManager.default.removeItem(at: source)

        XCTAssertEqual(try Data(contentsOf: staged), Data("hevc-bytes".utf8),
                       "le système supprime la source au retour de la fermeture : la copie doit tenir seule")
        XCTAssertEqual(staged.deletingLastPathComponent().standardizedFileURL, destination.standardizedFileURL)
    }

    func test_stage_keepsTheContainerExtensionInLowercase() throws {
        let sandbox = try makeSandbox()
        let source = try makeSource(in: sandbox, name: "IMG_0002.MOV")

        let staged = try PickedMediaStaging.stage(source, directory: sandbox)

        XCTAssertEqual(staged.pathExtension, "mov", "le conteneur reçu est gardé : .current ne renomme rien en .mp4")
    }

    func test_stage_withoutExtension_usesTheFallback() throws {
        let sandbox = try makeSandbox()
        let source = try makeSource(in: sandbox, name: "opaque")

        let staged = try PickedMediaStaging.stage(source, directory: sandbox, fallbackExtension: "mp4")

        XCTAssertEqual(staged.pathExtension, "mp4")
    }

    func test_stage_twiceFromTheSameSource_givesTwoDistinctFiles() throws {
        let sandbox = try makeSandbox()
        let source = try makeSource(in: sandbox, name: "clip.mov")

        let first = try PickedMediaStaging.stage(source, directory: sandbox)
        let second = try PickedMediaStaging.stage(source, directory: sandbox)

        XCTAssertNotEqual(first, second, "deux imports successifs ne s'écrasent jamais")
        XCTAssertTrue(FileManager.default.fileExists(atPath: first.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: second.path))
    }

    func test_stage_withAStem_namesTheFileAfterIt() throws {
        let sandbox = try makeSandbox()
        let source = try makeSource(in: sandbox, name: "clip.mov")

        let staged = try PickedMediaStaging.stage(source, stem: "obj-42", directory: sandbox)

        XCTAssertEqual(staged.lastPathComponent, "obj-42.mov",
                       "le composer de story aligne l'identifiant de l'objet sur le nom du fichier")
    }

    func test_stage_missingSource_throwsAndLeavesNothingBehind() throws {
        let sandbox = try makeSandbox()
        let destination = sandbox.appendingPathComponent("out", isDirectory: true)
        let absent = sandbox.appendingPathComponent("absent.mov")

        XCTAssertThrowsError(try PickedMediaStaging.stage(absent, directory: destination))

        let leftovers = (try? FileManager.default.contentsOfDirectory(atPath: destination.path)) ?? []
        XCTAssertTrue(leftovers.isEmpty, "un import raté ne laisse aucun fichier à nettoyer")
    }

    func test_discard_removesTheStagedFile_andToleratesAnAbsentOne() throws {
        let sandbox = try makeSandbox()
        let source = try makeSource(in: sandbox, name: "clip.mov")
        let staged = try PickedMediaStaging.stage(source, directory: sandbox)

        PickedMediaStaging.discard(staged)
        PickedMediaStaging.discard(staged)

        XCTAssertFalse(FileManager.default.fileExists(atPath: staged.path))
    }
}
