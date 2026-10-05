import XCTest

/// Le mode vitrine n'existe PAS dans l'app publiée (#8855).
final class VitrineSourceGuardTests: XCTestCase {
    private var depot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    }

    func test_everyVitrineSource_isWrappedInDebug() throws {
        let dossier = depot.appendingPathComponent("apps/ios/Meeshy/Features/Vitrine")
        let fichiers = try FileManager.default.contentsOfDirectory(at: dossier, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "swift" }
        XCTAssertFalse(fichiers.isEmpty)
        for fichier in fichiers {
            let lignes = try String(contentsOf: fichier, encoding: .utf8)
                .components(separatedBy: .newlines)
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
            XCTAssertEqual(lignes.first, "#if DEBUG", "\(fichier.lastPathComponent) ne commence pas par #if DEBUG")
            XCTAssertEqual(lignes.last, "#endif", "\(fichier.lastPathComponent) ne finit pas par #endif")
        }
    }

    /// Hors de son dossier, la vitrine ne vit que dans des blocs `#if DEBUG`.
    func test_everyVitrineReference_outsideItsFolder_isInsideADebugBlock() throws {
        let fichiers = [
            "apps/ios/Meeshy/MeeshyApp.swift",
            "apps/ios/Meeshy/Features/Main/Components/SyncPill.swift",
            "apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift",
            "apps/ios/Meeshy/Features/Main/Views/ProgressionView.swift",
            "apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift",
            "apps/ios/Meeshy/Features/Main/Export/MessageCardExportSheet.swift",
            "packages/MeeshySDK/Sources/MeeshySDK/Services/ShareLinkService.swift",
            "packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine+Vitrine.swift",
            "packages/MeeshySDK/Sources/MeeshySDK/Configuration/MeeshyConfig.swift",
            "packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/JoinFlowViewModel.swift",
        ]
        for chemin in fichiers {
            var pile: [Bool] = []
            var references = 0
            let lignes = try String(contentsOf: depot.appendingPathComponent(chemin), encoding: .utf8)
                .components(separatedBy: .newlines)
                .map { $0.trimmingCharacters(in: .whitespaces) }
            for ligne in lignes {
                if ligne.hasPrefix("#if") { pile.append(ligne == "#if DEBUG"); continue }
                if ligne.hasPrefix("#else") || ligne.hasPrefix("#elseif") { if !pile.isEmpty { pile[pile.count - 1] = false }; continue }
                if ligne.hasPrefix("#endif") { _ = pile.popLast(); continue }
                guard ["Vitrine", "debugLinkInfoOverride", "debugWebOriginOverride", "debugOnPreviewShown"].contains(where: { ligne.contains($0) }) else { continue }
                references += 1
                XCTAssertTrue(pile.contains(true), "\(chemin) : « \(ligne) » vit hors d'un bloc #if DEBUG")
            }
            XCTAssertGreaterThan(references, 0, "\(chemin) ne mentionne plus la vitrine : retirer ce fichier de la garde.")
        }
    }
}
