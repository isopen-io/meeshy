import XCTest
@testable import MeeshyUI

/// **Ouvrir l'aperçu du composer n'écrit plus rien sur le disque** (#7008).
///
/// `StoryReaderRepresentable.makeUIView` encodait chaque image préchargée en
/// PNG et l'écrivait dans `temporaryDirectory`, **synchronement, sur le thread
/// principal** : 100-300 ms par image 1080×1920, soit 0,5 à 2 s de gel visible
/// à l'ouverture de l'aperçu. Les fichiers `story-preview-<UUID>.png` n'étaient
/// ensuite supprimés par personne — aucun autre site du dépôt ne connaissait
/// même leur préfixe.
///
/// Deux questions distinctes, donc deux familles de témoins :
/// 1. **le site ne réécrit pas** — garde de SOURCE sur tous les `makeUIView`
///    du dépôt, parce qu'un aperçu ne se mesure pas depuis un test unitaire et
///    que la régression se réintroduit exactement là où elle vivait ;
/// 2. **ce qui est déjà posé s'en va** — le balayage efface ce que les
///    versions antérieures ont laissé, et RIEN d'autre.
final class StoryPreviewNoDiskEncodingTests: XCTestCase {

    // MARK: - 1. Aucun `makeUIView` du dépôt n'encode ni n'écrit

    /// La garde balaie les DEUX arbres de sources Swift écrits à la main.
    /// Restreindre au SDK laisserait l'app libre de rejouer le motif, et c'est
    /// une `UIViewRepresentable` de l'app qui en hébergerait la prochaine
    /// occurrence aussi naturellement.
    func test_aucunMakeUIViewDuDepotNEncodeNiNEcritSurLeDisque() throws {
        let racines = [
            Self.repoRoot.appendingPathComponent("apps/ios/Meeshy"),
            Self.repoRoot.appendingPathComponent("packages/MeeshySDK/Sources"),
        ]

        var fichiersVus = 0
        var corpsVus = 0

        for racine in racines {
            let enumerator = try XCTUnwrap(
                FileManager.default.enumerator(at: racine, includingPropertiesForKeys: nil),
                "impossible d'énumérer \(racine.path) — l'arbre a-t-il bougé ?"
            )
            for case let url as URL in enumerator where url.pathExtension == "swift" {
                let source = try String(contentsOf: url, encoding: .utf8)
                guard source.contains("func makeUIView") else { continue }
                fichiersVus += 1
                for corps in Self.corpsDesFonctions(nommees: "makeUIView", dans: source) {
                    corpsVus += 1
                    for interdit in ["pngData()", "jpegData(", "write(to:"] {
                        XCTAssertFalse(
                            corps.contains(interdit),
                            """
                            `\(url.lastPathComponent)` encode ou écrit dans un `makeUIView` \
                            (`\(interdit)`). `makeUIView` tourne sur le thread PRINCIPAL, au \
                            montage de la vue : tout octet encodé ou posé là se paie en images \
                            perdues. Passer les bitmaps en mémoire (cf. \
                            `PreloadedImageCacheReader`), ou encoder dans une `Task.detached` \
                            AVANT le montage.
                            """
                        )
                    }
                }
            }
        }

        XCTAssertGreaterThan(fichiersVus, 0, "aucun fichier à `makeUIView` trouvé — la garde ne mesurerait rien")
        XCTAssertGreaterThan(corpsVus, 0, "aucun corps de `makeUIView` extrait — l'analyseur ne lit rien")
    }

    // MARK: - 2. Le balayage efface les résidus, et EUX SEULS

    func test_sweep_effaceLesApercusResiduels() throws {
        let dossier = try Self.dossierTemporaireIsole()
        defer { try? FileManager.default.removeItem(at: dossier) }

        let residu = dossier.appendingPathComponent("\(StoryPreviewTempSweeper.filePrefix)ABC.png")
        try Data("png".utf8).write(to: residu)

        let efface = StoryPreviewTempSweeper.sweep(in: dossier)

        XCTAssertEqual(efface, 1)
        XCTAssertFalse(FileManager.default.fileExists(atPath: residu.path))
    }

    /// Le versant qui compte autant : une purge qui emporterait un voisin
    /// serait pire que l'absence de purge. Le dossier temporaire est PARTAGÉ —
    /// l'export de story, l'éditeur audio et les sessions vidéo y écrivent.
    func test_sweep_neTouchePasAuxFichiersDesAutres() throws {
        let dossier = try Self.dossierTemporaireIsole()
        defer { try? FileManager.default.removeItem(at: dossier) }

        let voisin = dossier.appendingPathComponent("story-export-final.mp4")
        try Data("mp4".utf8).write(to: voisin)
        let residu = dossier.appendingPathComponent("\(StoryPreviewTempSweeper.filePrefix)XYZ.png")
        try Data("png".utf8).write(to: residu)

        XCTAssertEqual(StoryPreviewTempSweeper.sweep(in: dossier), 1)
        XCTAssertTrue(
            FileManager.default.fileExists(atPath: voisin.path),
            "le balayage a emporté un fichier qui ne lui appartient pas"
        )
    }

    func test_sweep_surUnDossierAbsent_neJetteRien() {
        let inexistant = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-sweeper-absent-\(UUID().uuidString)")
        XCTAssertEqual(StoryPreviewTempSweeper.sweep(in: inexistant), 0)
    }

    // MARK: - Helpers

    private static func dossierTemporaireIsole() throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-sweeper-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    private static var repoRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Reader
            .deletingLastPathComponent()   // Story
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK
            .deletingLastPathComponent()   // packages
            .deletingLastPathComponent()   // racine du dépôt
    }

    /// Rend le corps de chaque `func <nom>` de la source, apparié sur les
    /// ACCOLADES et non sur l'indentation : un corps qui imbrique une fermeture
    /// doit être lu entièrement, ou la garde mesure autre chose que ce qu'elle
    /// nomme. Les commentaires sont retirés d'abord — un doc-comment qui cite
    /// `pngData()` (celui-ci le fait) ne doit pas faire rougir la garde.
    private static func corpsDesFonctions(nommees nom: String, dans source: String) -> [String] {
        let code = ComposerSourceGuard.stripComments(source)
        let chars = Array(code)
        let motif = Array("func \(nom)")
        var corps: [String] = []
        var index = 0

        while index + motif.count <= chars.count {
            guard Array(chars[index..<(index + motif.count)]) == motif else {
                index += 1
                continue
            }
            var open = index + motif.count
            while open < chars.count, chars[open] != "{" { open += 1 }
            guard open < chars.count else { break }

            var depth = 0
            var cursor = open
            var body = ""
            while cursor < chars.count {
                if chars[cursor] == "{" { depth += 1 }
                if chars[cursor] == "}" {
                    depth -= 1
                    if depth == 0 { break }
                }
                if depth >= 1, cursor != open { body.append(chars[cursor]) }
                cursor += 1
            }
            corps.append(body)
            index = cursor + 1
        }
        return corps
    }
}
