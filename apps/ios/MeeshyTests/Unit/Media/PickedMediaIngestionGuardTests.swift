import XCTest

/// **Une vidéo de la photothèque entre par un FICHIER, jamais par `Data`** (#9870).
///
/// `loadTransferable(type: Data.self)` suivi de `data.write(to:)` faisait traverser
/// deux fois la mémoire à un film 4K, sur le fil principal, avec le transcodage
/// HEVC -> H.264 que le système applique au choix `.automatic`. Le site unique est
/// `PickedMedia` (MeeshyUI/Utilities/PickedMedia.swift) ; ces gardes tiennent ce que
/// aucun test de comportement ne voit parce que c'est une ABSENCE de source.
final class PickedMediaIngestionGuardTests: XCTestCase {

    private var repoRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Media
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // ios
            .deletingLastPathComponent()   // apps
            .deletingLastPathComponent()   // racine
    }

    private var scannedRoots: [URL] {
        [repoRoot.appendingPathComponent("apps/ios/Meeshy"),
         repoRoot.appendingPathComponent("packages/MeeshySDK/Sources")]
    }

    private func sources() throws -> [(name: String, code: String)] {
        let files = scannedRoots.flatMap { root -> [URL] in
            guard let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil) else { return [] }
            return walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
        }
        return try files.map { file in
            let text = try String(contentsOf: file, encoding: .utf8)
            // Le retrait des commentaires est coûteux : seuls les fichiers qui nomment un
            // des motifs gardés le subissent.
            let concerned = text.contains("loadTransferable") || text.contains("hotosPicker(")
                || text.contains("FileRepresentation")
            return (file.lastPathComponent, concerned ? AppSourceGuard.stripComments(text) : "")
        }
    }

    /// Les arguments (entre parenthèses équilibrées) de chaque appel à `needle`.
    private func argumentLists(of needle: String, in code: String) -> [String] {
        var lists: [String] = []
        var cursor = code.startIndex
        while let hit = code.range(of: needle, range: cursor..<code.endIndex) {
            var depth = 1
            var end = hit.upperBound
            while end < code.endIndex, depth > 0 {
                if code[end] == "(" { depth += 1 }
                if code[end] == ")" { depth -= 1 }
                end = code.index(after: end)
            }
            lists.append(String(code[hit.upperBound..<end]))
            cursor = end
        }
        return lists
    }

    func test_noPickedItemIsLoadedAsData() throws {
        let all = try sources()
        XCTAssertGreaterThan(all.count, 1000, "le balayage ne voit presque rien : un dossier a bougé")
        let offenders = all.filter { $0.code.contains("loadTransferable(type: Data.self)") }.map(\.name)
        XCTAssertTrue(offenders.isEmpty,
                      "un élément du sélecteur se charge par PickedMedia (fichier pour une vidéo), jamais par Data : \(offenders.sorted())")
    }

    func test_everyVideoCapablePickerKeepsTheCurrentEncoding() throws {
        var videoPickers = 0
        var missing: [String] = []
        for source in try sources() {
            for needle in ["PhotosPicker(", ".photosPicker("] {
                for arguments in argumentLists(of: needle, in: source.code) where arguments.contains(".videos") {
                    videoPickers += 1
                    if !arguments.contains("preferredItemEncoding: .current") { missing.append(source.name) }
                }
            }
        }
        XCTAssertGreaterThanOrEqual(videoPickers, 10, "le balayage ne voit presque aucun sélecteur vidéo : la garde est aveugle")
        XCTAssertTrue(missing.isEmpty,
                      ".automatic laisse le système transcoder HEVC -> H.264 avant de livrer : \(missing.sorted())")
    }

    func test_oneFileDeclaresTheMediaImportRepresentation() throws {
        let declaring = try sources().filter {
            $0.code.contains("FileRepresentation(importedContentType")
        }.map(\.name)
        XCTAssertEqual(declaring, ["PickedMedia.swift"],
                       "UN site d'ingestion : une seconde représentation d'import serait une jumelle qui dérive")
    }
}
