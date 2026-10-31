import XCTest
@testable import Meeshy

/// **L'arbre UNIQUE des niveaux d'édition** (#13974, grammaire d'édition § 1,
/// lot I-E1) : iOS rejoue `packages/shared/design/composer-edit-tree.json`, le
/// fichier qu'Android décode aussi. Ce témoin DÉCODE le fichier partagé et
/// exige la valeur compilée, champ pour champ ; puis il interroge la loi du
/// niveau « Fond » qui en est tirée.
@MainActor
final class ComposerEditTreeTests: XCTestCase {

    private static var repoRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    }

    private func sharedTree() throws -> ComposerEditTree {
        let data = try Data(contentsOf: Self.repoRoot.appendingPathComponent(
            "packages/shared/design/composer-edit-tree.json"))
        return try JSONDecoder().decode(ComposerEditTree.self, from: data)
    }

    // MARK: - Une seule source

    func test_theCompiledTree_isTheSharedFile_fieldForField() throws {
        XCTAssertEqual(try sharedTree(), ComposerEditTree.shared)
    }

    func test_theSelectionLevel_isTheBarOfAPlacedObject_inItsOrder() {
        let niveau = ComposerEditTree.shared.level(.selection)
        XCTAssertEqual(niveau?.entries.map(\.id), ComposerSelectionAction.allCases.map(\.rawValue))
        XCTAssertEqual(niveau?.entries.map(\.sfSymbol), ComposerSelectionAction.allCases.map(\.symbol))
    }

    /// Chaque mot de l'arbre existe au catalogue, en sept langues, et son
    /// français est celui que le fichier partagé écrit.
    func test_everyWordOfTheTree_isInTheCatalog_inSevenLanguages() throws {
        let data = try Data(contentsOf: Self.repoRoot.appendingPathComponent("apps/ios/Meeshy/Localizable.xcstrings"))
        let catalogue = try XCTUnwrap(
            (try JSONSerialization.jsonObject(with: data) as? [String: Any])?["strings"] as? [String: Any])
        let entrees = ComposerEditTree.shared.levels.flatMap { niveau in
            niveau.entries.flatMap { [($0.labelKey, $0.label)] + $0.choices.map { ($0.labelKey, $0.label) } }
                + [(niveau.titleKey, niveau.title)]
        }
        for (cle, francais) in entrees {
            let langues = (catalogue[cle] as? [String: Any])?["localizations"] as? [String: Any]
            XCTAssertEqual(langues?.count, 7, cle)
            let fr = ((langues?["fr"] as? [String: Any])?["stringUnit"] as? [String: Any])?["value"] as? String
            XCTAssertEqual(fr, francais, cle)
        }
    }

    // MARK: - N0 « Fond »

    func test_background_servesModifyReplacePutOnSceneRemove_neverDuplicateNorTime() {
        XCTAssertEqual(ComposerBackgroundEdit.served(isLocked: false, removable: true),
                       [.modify, .replace, .putOnScene, .remove])
        let ids = ComposerEditTree.shared.level(.backgroundMedia)?.entries.map(\.id) ?? []
        XCTAssertFalse(ids.contains("duplicate"), "un fond dupliqué serait un second fond")
        XCTAssertFalse(ids.contains("time"), "le fond dure toute la diapo")
    }

    func test_background_lockedOrNotRemovable_servesOnlyWhatItAdmits() {
        XCTAssertEqual(ComposerBackgroundEdit.served(isLocked: true, removable: true), [.remove])
        XCTAssertEqual(ComposerBackgroundEdit.served(isLocked: false, removable: false),
                       [.modify, .replace, .putOnScene])
    }

    func test_background_onlyRemoveDestroys_andItAsksForConfirmation() {
        XCTAssertEqual(ComposerBackgroundEditAction.allCases.filter(ComposerBackgroundEdit.isDestructive), [.remove])
        XCTAssertEqual(ComposerBackgroundEditAction.allCases.filter { ComposerBackgroundEdit.confirms($0) }, [.remove])
        XCTAssertEqual(ComposerBackgroundEdit.entry(.replace)?.opens, .sheet)
        XCTAssertEqual(ComposerBackgroundEdit.entry(.modify)?.opens, .level)
    }

    func test_replace_offersLibraryCameraFiles_theCameraOnlyWhenTheFormatTakesPhotos() {
        XCTAssertEqual(ComposerBackgroundEdit.sources(cameraTakesPhotos: true), [.photoLibrary, .camera, .files])
        XCTAssertEqual(ComposerBackgroundEdit.sources(cameraTakesPhotos: false), [.photoLibrary, .files])
        XCTAssertEqual(ComposerBackgroundSource.allCases.map(\.intake), [.photoLibrary, .camera, .files])
    }

    /// L'ORDRE vient du fichier : un arbre dont le niveau « Fond » est
    /// réordonné se sert réordonné.
    func test_theOrderIsReadFromTheTree_neverWrittenInTheLaw() throws {
        let fond = try XCTUnwrap(ComposerEditTree.shared.level(.backgroundMedia))
        let inverse = ComposerEditTree(version: 1, levels: [
            ComposerEditTree.Level(id: fond.id, titleKey: fond.titleKey, title: fond.title,
                                   entries: fond.entries.reversed())])
        XCTAssertEqual(ComposerBackgroundEdit.served(isLocked: false, removable: true, tree: inverse),
                       [.remove, .putOnScene, .replace, .modify])
    }

    // MARK: - Le rail

    func test_theBackgroundLevel_railsItsEntries_andRemoveIsRed() {
        let entrees = ComposerEditRailItems.items(for: .background, actions: [.modify, .duplicate],
                                                  backgroundActions: [.modify, .replace, .putOnScene, .remove],
                                                  sections: [], extras: [], keyframes: false)
        XCTAssertEqual(entrees, [.background(.modify), .background(.replace), .background(.putOnScene),
                                 .background(.remove)])
        XCTAssertEqual(entrees.filter(\.isDestructive), [.background(.remove)])
        XCTAssertEqual(Set(entrees.map(\.identifier)).count, 4)
        XCTAssertEqual(ComposerEditRailCopy.label(.background(.putOnScene)), ComposerEditTreeCopy.label(.putOnScene))
        XCTAssertEqual(ComposerEditRailCopy.symbol(.background(.replace)), "arrow.triangle.2.circlepath")
    }
}
