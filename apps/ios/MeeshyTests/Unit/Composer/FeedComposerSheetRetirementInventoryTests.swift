import XCTest
@testable import Meeshy

/// **T3.5 — le retrait de `FeedComposerSheet` : le STOP et son inventaire.**
///
/// Le livrable est un inventaire EXÉCUTABLE et un STOP écrit — **PAS un
/// retrait.** Patron : 4.8 (`StatusComposerView`, code mort retenu par des
/// suites qui l'épinglent par chemin) et 7.8 (`EditParityInventoryTests`, qui
/// assère le SET des noms tenus, jamais le compte).
///
/// La double preuve qu'exigerait un retrait n'est PAS obtenue par ces lots :
/// - **appelants recâblés** : le PLEIN composer du fil (T3.1) seul. L'overlay
///   inline iPad (T3.4) est DESCOPÉ — nommé + gardé par T3.3, pas migré. Les
///   deux CITATIONS restent, condition de levée **7.5** (un écrivain durable du
///   repost, §A.4).
/// - **capacités tenues** : cinq manquent au meuble et vivent encore SUR la
///   feuille — progression, références, dépôt, éditeur d'image, son emprunté.
///   Les retirer avec la feuille les retirerait à l'utilisateur.
final class FeedComposerSheetRetirementInventoryTests: XCTestCase {

    private static let iosRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()   // .../Unit/Composer
        .deletingLastPathComponent()   // .../Unit
        .deletingLastPathComponent()   // .../MeeshyTests
        .deletingLastPathComponent()   // .../apps/ios

    private func source(_ relativePath: String) throws -> String {
        try String(contentsOf: Self.iosRoot.appendingPathComponent(relativePath), encoding: .utf8)
    }

    private func compact(_ text: String) -> String {
        AppSourceGuard.stripComments(text)
            .components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// **Preuve 1 — le SET des fichiers qui montent encore la feuille**, dérivé
    /// de la source, jamais un compte. Deux citations : `RootViewComponents`
    /// (fil) et `FeedView` (iPad). Recâbler l'une sur le meuble la ferait
    /// disparaître d'ici (elle serait REFUSÉE en silence) ; en ajouter un
    /// troisième site casserait aussi ce SET.
    func test_leSetDesFichiersMontantLaFeuille_estLesDeuxCitations() throws {
        let appRoot = Self.iosRoot.appendingPathComponent("Meeshy")
        let fm = FileManager.default
        var monteurs: Set<String> = []
        if let it = fm.enumerator(at: appRoot, includingPropertiesForKeys: nil) {
            for case let url as URL in it where url.pathExtension == "swift" {
                let code = compact((try? String(contentsOf: url, encoding: .utf8)) ?? "")
                if code.contains("FeedComposerSheet(") { monteurs.insert(url.lastPathComponent) }
            }
        }
        XCTAssertEqual(
            monteurs, ["RootViewComponents.swift", "FeedView.swift"],
            "Seules les DEUX citations montent encore `FeedComposerSheet(`. Le plein composer du fil est "
                + "passé au meuble (T3.1) ; l'overlay iPad (T3.4) est descopé. Si ce SET rétrécit, une "
                + "citation a été recâblée sur une porte qui la refuse (levée 7.5) ; s'il grandit, un "
                + "nouveau montage est apparu. Ni l'un ni l'autre n'est une mise à jour d'inventaire."
        )
    }

    /// **Preuve 2 — le SET des capacités NON MIGRÉES**, chacune ancrée SUR la
    /// feuille (sa référence). Si une ancre disparaît de la feuille, soit la
    /// capacité a été migrée — la déplacer hors de cet inventaire, dans le même
    /// commit — soit elle a été PERDUE, et c'est une régression, pas une mise à
    /// jour d'inventaire.
    func test_leSetDesCapacitesNonMigrees_estOpposableAuRetrait() throws {
        let feuille = try source("Meeshy/Features/Main/Views/FeedView+Attachments.swift")
        // guard-foul : la feuille est la RÉFÉRENCE — si on la lit vide, l'inventaire
        // mesure une parité avec un fantôme.
        XCTAssertTrue(feuille.contains("struct FeedComposerSheet"), "FeedView+Attachments introuvable ou vide")

        let capacites: [(nom: String, ancre: String)] = [
            ("progression",       "uploadProgress"),
            ("références",         "feedDeclaredReferences"),
            ("dépôt",              "TusUploadManager("),
            ("éditeur d'image",    "MeeshyImageEditorView("),
            ("son emprunté",       "publishBorrowedSoundPost")
        ]
        for capacite in capacites {
            XCTAssertTrue(
                feuille.contains(capacite.ancre),
                "« \(capacite.nom) » : la feuille ne porte plus `\(capacite.ancre)`. Si le meuble l'a "
                    + "reprise, la retirer de cet inventaire ICI, dans le même commit ; sinon c'est une "
                    + "régression que retirerait aussi la feuille."
            )
        }
        XCTAssertEqual(
            Set(capacites.map(\.nom)),
            ["progression", "références", "dépôt", "éditeur d'image", "son emprunté"],
            "Cinq capacités manquent encore au meuble et vivent SUR la feuille. Le retrait reste INTERDIT "
                + "tant qu'elles ne sont pas migrées ; ce test dit LESQUELLES, pour qu'un lot suivant sache "
                + "quoi lever plutôt que de recompter."
        )
    }
}
