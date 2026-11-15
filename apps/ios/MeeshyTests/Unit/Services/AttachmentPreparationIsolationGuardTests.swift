import XCTest
@testable import Meeshy

/// **Garde source — `populateImage` ne calcule plus le ThumbHash ni
/// n'écrit le JPEG sous isolation MainActor.**
///
/// `AttachmentPreparationService` est une classe `@MainActor` ; avant ce
/// correctif, `populateImage` écrivait les octets JPEG sur disque puis
/// appelait `UIImage.toThumbHash()` (~5-15 ms) directement sur le fil
/// principal. Une sélection multi-photos empile plusieurs `populateImage`
/// en vol : chaque paire écriture+hash bloquait MainActor à son tour,
/// produisant les à-coups observés sur les tuiles du composer.
///
/// Cette garde lit la SOURCE, bornée sur la tranche de la fonction
/// `populateImage` (déclaration jusqu'à la fonction privée suivante) — un
/// déplacement de code ailleurs dans le fichier ne la fait pas pourrir tant
/// que la fonction garde son nom.
final class AttachmentPreparationIsolationGuardTests: XCTestCase {

    private var serviceSource: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Services
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
            .appendingPathComponent("Meeshy/Features/Main/Services/AttachmentPreparationService.swift")
    }

    private func strippedSource() throws -> String {
        AppSourceGuard.stripComments(try String(contentsOf: serviceSource, encoding: .utf8))
    }

    /// Borne la tranche sur la FONCTION — de sa déclaration jusqu'à la
    /// prochaine fonction privée du pipeline image (`runVideoPreparation`,
    /// qui suit `populateImage` dans ce fichier).
    private func populateImageBlock() throws -> String {
        let source = try strippedSource()
        let start = try XCTUnwrap(
            source.range(of: "private func populateImage"),
            "`populateImage` a disparu ou changé de nom — la garde ne vise plus rien."
        )
        let rest = source[start.upperBound...]
        let end = try XCTUnwrap(
            rest.range(of: "private func runVideoPreparation"),
            "Borne de fin introuvable : `runVideoPreparation` a disparu ou changé de nom — relire la fenêtre."
        )
        return String(source[start.lowerBound..<end.lowerBound])
    }

    func test_populateImage_movesWorkToATaskDetached() throws {
        let block = try populateImageBlock()

        XCTAssertTrue(
            block.contains("Task.detached"),
            "`populateImage` n'exécute plus rien dans une `Task.detached` — l'écriture JPEG + le ThumbHash sont revenus sur MainActor."
        )
    }

    /// `toThumbHash()` doit tomber ENTRE l'ouverture de la tâche détachée et
    /// sa résolution (`.value`) — c'est-à-dire dans la fermeture.
    ///
    /// Les deux bornes comptent : sans la borne HAUTE, un `toThumbHash()`
    /// replacé après `.value` — donc de retour sur MainActor, exactement le
    /// défaut visé — laisserait la garde verte.
    func test_populateImage_computesThumbHashInsideTheDetachedTask_notOnMainActor() throws {
        let block = try populateImageBlock()

        let detachedRange = try XCTUnwrap(
            block.range(of: "Task.detached"),
            "`Task.detached` introuvable — la garde précédente aurait dû rougir d'abord."
        )
        let valueRange = try XCTUnwrap(
            block.range(of: ".value"),
            "`.value` (résolution de la tâche détachée) introuvable — la structure attendue a changé."
        )
        let hashRange = try XCTUnwrap(
            block.range(of: "toThumbHash()"),
            "`toThumbHash()` n'apparaît plus dans `populateImage` — le calcul du hash a disparu."
        )

        XCTAssertTrue(
            detachedRange.upperBound < hashRange.lowerBound,
            "`toThumbHash()` doit être appelé DANS la fermeture `Task.detached`, après son ouverture — pas avant, sur MainActor."
        )
        XCTAssertTrue(
            hashRange.upperBound <= valueRange.lowerBound,
            "`toThumbHash()` doit être appelé AVANT `.value` — après, il serait de retour sur MainActor."
        )
    }

    /// Même exigence, mêmes deux bornes, pour l'écriture des octets JPEG :
    /// elle doit voyager avec le hash dans la même tâche détachée, pas
    /// rester une étape synchrone MainActor suivie d'un hash déporté seul.
    func test_populateImage_writesJPEGBytesInsideTheDetachedTask() throws {
        let block = try populateImageBlock()

        let detachedRange = try XCTUnwrap(
            block.range(of: "Task.detached"),
            "`Task.detached` introuvable — la garde précédente aurait dû rougir d'abord."
        )
        let valueRange = try XCTUnwrap(
            block.range(of: ".value"),
            "`.value` (résolution de la tâche détachée) introuvable — la structure attendue a changé."
        )
        let writeRange = try XCTUnwrap(
            block.range(of: "data.write(to:"),
            "L'écriture des octets JPEG (`data.write(to:)`) n'apparaît plus dans `populateImage`."
        )

        XCTAssertTrue(
            detachedRange.upperBound < writeRange.lowerBound,
            "L'écriture JPEG doit avoir lieu DANS la tâche détachée, après l'ouverture de `Task.detached` — pas avant, sur MainActor."
        )
        XCTAssertTrue(
            writeRange.upperBound <= valueRange.lowerBound,
            "L'écriture JPEG doit avoir lieu AVANT `.value` — après, elle serait revenue sur MainActor."
        )
    }

    /// La reprise MainActor (`prep.finish` / `prep.fail`) reste, elle, EN
    /// DEHORS de la tâche détachée — `PreparingAttachment` est
    /// `@MainActor`, et lui écrire depuis la tâche détachée serait une
    /// violation d'isolation.
    func test_populateImage_finishesOnMainActor_outsideTheDetachedTask() throws {
        let block = try populateImageBlock()

        let taskEnd = try XCTUnwrap(
            block.range(of: ".value"),
            "`.value` (résolution de la tâche détachée) introuvable — la structure attendue a changé."
        )
        let finishRange = try XCTUnwrap(
            block.range(of: "prep.finish("),
            "`prep.finish(` n'apparaît plus dans `populateImage`."
        )

        XCTAssertTrue(
            taskEnd.upperBound < finishRange.lowerBound,
            "`prep.finish` doit être appelé APRÈS la résolution (`.value`) de la tâche détachée, sur MainActor."
        )
    }
}
