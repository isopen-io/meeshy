import XCTest
import UIKit
import CoreImage
@testable import Meeshy
@testable import MeeshySDK

/// La mise en file d'une publication copie les médias dans
/// `meeshy_offline_queue/<tempStoryId>/`. Chaque écriture passait par un
/// `try?` nu : un échec (disque plein, source disparue, destination
/// inaccessible) était avalé **et la référence ajoutée quand même**.
///
/// La story partait donc en file avec une référence FANTÔME, l'auteur lisait
/// « publication au retour en ligne », et au drain le contrôle d'existence la
/// faisait échouer DÉFINITIVEMENT en `.missingLocalMedia`. Le travail était
/// perdu longtemps après, sans que rien n'ait alerté au moment où c'était
/// encore réparable.
final class StoryOfflineMediaWriterTests: XCTestCase {

    private var directory: URL!

    override func setUpWithError() throws {
        try super.setUpWithError()
        directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("offline-media-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: directory)
        try super.tearDownWithError()
    }

    // MARK: - Fixtures

    private func image(_ color: UIColor = .red) -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8)).image { ctx in
            color.setFill(); ctx.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
        }
    }

    private func sourceFile(named name: String, bytes: Int = 16) throws -> URL {
        let url = directory.appendingPathComponent("src-\(name)")
        try Data(repeating: 7, count: bytes).write(to: url)
        return url
    }

    // MARK: - Chemin nominal

    func test_persist_writesEveryMediaAndReportsNoFailure() throws {
        let video = try sourceFile(named: "clip.mp4")
        let audio = try sourceFile(named: "voice.m4a")

        let outcome = StoryOfflineMediaWriter.persist(
            images: ["img1": image()], videos: ["vid1": video], audios: ["aud1": audio],
            into: directory)

        XCTAssertTrue(outcome.isComplete)
        XCTAssertEqual(outcome.references.count, 3)
        for reference in outcome.references {
            XCTAssertTrue(FileManager.default.fileExists(atPath: reference.localFilePath),
                          "Référence \(reference.elementId) vers un fichier absent")
        }
    }

    func test_persist_keepsTheSourceExtension() throws {
        let video = try sourceFile(named: "clip.mov")
        let outcome = StoryOfflineMediaWriter.persist(
            images: [:], videos: ["vid1": video], audios: [:], into: directory)
        XCTAssertTrue(outcome.references.first?.localFilePath.hasSuffix("vid1.mov") ?? false,
                      outcome.references.first?.localFilePath ?? "aucune référence")
    }

    func test_persist_fallsBackToADefaultExtension_whenTheSourceHasNone() throws {
        let video = try sourceFile(named: "extensionless")
        let renamed = directory.appendingPathComponent("noext")
        try FileManager.default.moveItem(at: video, to: renamed)

        let outcome = StoryOfflineMediaWriter.persist(
            images: [:], videos: ["vid1": renamed], audios: [:], into: directory)

        XCTAssertTrue(outcome.references.first?.localFilePath.hasSuffix("vid1.mp4") ?? false)
    }

    // MARK: - Le défaut : jamais de référence fantôme

    func test_persist_reportsAFailure_whenTheSourceIsGone() {
        let vanished = directory.appendingPathComponent("never-existed.mp4")

        let outcome = StoryOfflineMediaWriter.persist(
            images: [:], videos: ["vid1": vanished], audios: [:], into: directory)

        XCTAssertFalse(outcome.isComplete)
        XCTAssertEqual(outcome.failedElementIds, ["vid1"])
        XCTAssertTrue(outcome.references.isEmpty,
                      "Une source disparue ne doit produire AUCUNE référence — c'est la référence fantôme qui faisait perdre la story au drain.")
    }

    func test_persist_reportsAFailure_whenTheDestinationCannotBeWritten() {
        let unwritable = URL(fileURLWithPath: "/dev/null/nope")

        let outcome = StoryOfflineMediaWriter.persist(
            images: ["img1": image()], videos: [:], audios: [:], into: unwritable)

        XCTAssertFalse(outcome.isComplete)
        XCTAssertEqual(outcome.failedElementIds, ["img1"])
        XCTAssertTrue(outcome.references.isEmpty)
    }

    /// Un échec partiel doit rester partiel : les médias sains gardent leur
    /// référence, et l'appelant décide au vu de `failedElementIds`.
    func test_persist_separatesTheSurvivorsFromTheCasualties() throws {
        let ok = try sourceFile(named: "ok.mp4")
        let gone = directory.appendingPathComponent("gone.mp4")

        let outcome = StoryOfflineMediaWriter.persist(
            images: [:], videos: ["good": ok, "bad": gone], audios: [:], into: directory)

        XCTAssertEqual(outcome.failedElementIds, ["bad"])
        XCTAssertEqual(outcome.references.map(\.elementId), ["good"])
    }

    // MARK: - Ré-écriture

    /// `copyItem` échoue si la destination existe. Sans purge préalable, un
    /// second passage sur le même dossier laissait la copie PÉRIMÉE en place
    /// et signalait un échec sur un média pourtant valide.
    func test_persist_overwritesAPreviousCopy() throws {
        let first = try sourceFile(named: "v1.mp4", bytes: 16)
        _ = StoryOfflineMediaWriter.persist(images: [:], videos: ["vid1": first],
                                            audios: [:], into: directory)

        let second = try sourceFile(named: "v2.mp4", bytes: 999)
        let outcome = StoryOfflineMediaWriter.persist(images: [:], videos: ["vid1": second],
                                                      audios: [:], into: directory)

        XCTAssertTrue(outcome.isComplete)
        let path = try XCTUnwrap(outcome.references.first?.localFilePath)
        let size = try FileManager.default.attributesOfItem(atPath: path)[.size] as? Int
        XCTAssertEqual(size, 999, "La seconde copie doit écraser la première, pas la conserver.")
    }

    // MARK: - Déterminisme

    func test_persist_producesAStableOrder() throws {
        let a = try sourceFile(named: "a.mp4")
        let b = try sourceFile(named: "b.mp4")
        let images = ["z": image(), "a": image()]

        let first = StoryOfflineMediaWriter.persist(images: images, videos: ["y": a, "b": b],
                                                    audios: [:], into: directory)
        let second = StoryOfflineMediaWriter.persist(images: images, videos: ["y": a, "b": b],
                                                     audios: [:], into: directory)

        XCTAssertEqual(first.references.map(\.elementId), second.references.map(\.elementId))
    }

    func test_persist_onNothingAtAll_succeedsWithNoReference() {
        let outcome = StoryOfflineMediaWriter.persist(images: [:], videos: [:], audios: [:],
                                                      into: directory)
        XCTAssertTrue(outcome.isComplete)
        XCTAssertTrue(outcome.references.isEmpty)
    }

    // MARK: - S3 — l'image d'un sticker traverse la file SANS perdre sa transparence

    /// Un sticker est presque toujours une image détourée. Le JPEG n'a pas de
    /// canal alpha : réencoder un sticker ainsi APLATIT sa transparence, et
    /// c'est ce fichier-là que le drain téléverse ensuite en `PostMedia` — le
    /// lecteur voit alors un rectangle opaque à la place du découpage.
    /// L'appelant nomme donc explicitement les ids à préserver ; aucune
    /// heuristique sur les pixels ne décide à sa place.
    private func transparentImage() -> UIImage {
        let format = UIGraphicsImageRendererFormat.default()
        format.opaque = false
        return UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8), format: format)
            .image { ctx in
                UIColor.red.setFill()
                ctx.fill(CGRect(x: 4, y: 0, width: 4, height: 8))
            }
    }

    private func hasAlphaChannel(atPath path: String) throws -> Bool {
        let reloaded = try XCTUnwrap(UIImage(contentsOfFile: path)?.cgImage)
        switch reloaded.alphaInfo {
        case .none, .noneSkipFirst, .noneSkipLast: return false
        default: return true
        }
    }

    func test_persist_keepsAlphaForTheIdsTheCallerDeclared() throws {
        let outcome = StoryOfflineMediaWriter.persist(
            images: ["sticker-1": transparentImage()], videos: [:], audios: [:],
            into: directory, alphaPreservingIds: ["sticker-1"])

        let path = try XCTUnwrap(outcome.references.first?.localFilePath)
        XCTAssertTrue(path.hasSuffix("sticker-1.png"), path)
        XCTAssertTrue(try hasAlphaChannel(atPath: path),
                      "Le sticker remis en file a perdu sa transparence — il sera téléversé aplati.")
    }

    /// Le pendant POSITIF de la garde ci-dessus : tout ce que l'appelant n'a
    /// pas nommé reste en JPEG. Un PNG systématique ferait enfler le dossier de
    /// file d'un fond de slide plein écran sans rien gagner.
    func test_persist_keepsJpegForEverythingElse() throws {
        let outcome = StoryOfflineMediaWriter.persist(
            images: ["slide-bg-1": image()], videos: [:], audios: [:],
            into: directory, alphaPreservingIds: ["sticker-1"])

        let path = try XCTUnwrap(outcome.references.first?.localFilePath)
        XCTAssertTrue(path.hasSuffix("slide-bg-1.jpg"), path)
    }

    // MARK: - #10495 — une CLÉ n'est jamais un CHEMIN

    /// L'adoption d'une pré-montée (#8540) range l'image AUSSI sous l'adresse
    /// distante (`relayLoadedImage` → `registerLoadedImage(image, for: remoteURL)`).
    /// Le writer nommait le fichier par la clé : `<dossier>/https:/gate…/x.jpg.jpg`,
    /// des dossiers qui n'existent pas, donc `write` levait, et la publication EN
    /// LIGNE affichait « Impossible d'enregistrer les médias » dès qu'une
    /// pré-montée avait fini — c'est-à-dire presque toujours, en Wi-Fi.
    func test_persist_writesAnImageKeyedByItsRemoteAddress() throws {
        let key = "https://gate.meeshy.me/api/v1/attachments/file/2026/10/abc123.jpg"

        let outcome = StoryOfflineMediaWriter.persist(
            images: [key: image()], videos: [:], audios: [:], into: directory)

        XCTAssertTrue(outcome.isComplete, "échecs : \(outcome.failedElementIds)")
        let reference = try XCTUnwrap(outcome.references.first)
        XCTAssertEqual(reference.elementId, key, "le rejeu relit la CLÉ, jamais le nom du fichier")
        let written = URL(fileURLWithPath: reference.localFilePath)
        XCTAssertEqual(written.deletingLastPathComponent().standardizedFileURL.path,
                       directory.standardizedFileURL.path,
                       "le fichier vit DANS le dossier de la publication, jamais dans un sous-chemin tiré de la clé")
        XCTAssertTrue(FileManager.default.fileExists(atPath: reference.localFilePath))
    }

    func test_persist_copiesAVideoWhoseKeyIsNotAFileName() throws {
        let video = try sourceFile(named: "clip.mov")
        let key = "dossier/sous:dossier/clip"

        let outcome = StoryOfflineMediaWriter.persist(
            images: [:], videos: [key: video], audios: [:], into: directory)

        XCTAssertTrue(outcome.isComplete, "échecs : \(outcome.failedElementIds)")
        XCTAssertEqual(outcome.references.map(\.elementId), [key])
        let path = try XCTUnwrap(outcome.references.first?.localFilePath)
        XCTAssertTrue(path.hasSuffix(".mov"), path)
        XCTAssertTrue(FileManager.default.fileExists(atPath: path))
    }

    /// Deux clés distinctes ne partagent jamais un fichier, même quand leur
    /// forme « nettoyée » se ressemblerait.
    func test_persist_neverMergesTwoUnsafeKeysIntoOneFile() throws {
        let outcome = StoryOfflineMediaWriter.persist(
            images: ["a/b": image(.red), "a:b": image(.blue)], videos: [:], audios: [:],
            into: directory)

        XCTAssertTrue(outcome.isComplete)
        XCTAssertEqual(Set(outcome.references.map(\.localFilePath)).count, 2)
    }

    /// Une image sans bitmap CG (adossée à une `CIImage`) : `jpegData` peut la
    /// refuser. Elle est redessinée plutôt que de faire échouer la publication.
    func test_persist_writesAnImageBackedByACIImage() {
        let ciImage = CIImage(color: CIColor(red: 1, green: 0, blue: 0))
            .cropped(to: CGRect(x: 0, y: 0, width: 8, height: 8))

        let outcome = StoryOfflineMediaWriter.persist(
            images: ["ci": UIImage(ciImage: ciImage)], videos: [:], audios: [:], into: directory)

        XCTAssertTrue(outcome.isComplete, "échecs : \(outcome.failedElementIds)")
    }

    /// Une image VIDE n'a rien à redessiner : c'est un échec honnête, nommé.
    func test_persist_reportsAnEmptyImage() {
        let outcome = StoryOfflineMediaWriter.persist(
            images: ["vide": UIImage()], videos: [:], audios: [:], into: directory)

        XCTAssertEqual(outcome.failedElementIds, ["vide"])
    }
}
