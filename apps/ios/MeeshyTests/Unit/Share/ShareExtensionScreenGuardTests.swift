import XCTest

/// **L'extension de partage monte L'ÉCRAN UNIQUE, et rien d'autre** (#10947).
///
/// La planche (`docs/product/partage-unique/planche-partage-unique.html`, ligne
/// « Composant ») dit : même vue SwiftUI dans l'app et dans l'extension. Ces
/// gardes tiennent les deux moitiés de la promesse :
/// - l'ancienne interface de l'extension (pastilles d'initiales, liste maison)
///   ne revient pas ;
/// - les fichiers de l'écran compilés dans l'extension ne parlent à AUCUN
///   singleton de l'app — sans quoi l'extension ne compilerait plus, ou pire,
///   réveillerait sous son plafond mémoire des services qui n'y ont rien à faire.
final class ShareExtensionScreenGuardTests: XCTestCase {

    private var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Share
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
    }

    private func read(_ relativePath: String) throws -> String {
        try String(contentsOf: iosRoot.appendingPathComponent(relativePath), encoding: .utf8)
    }

    /// Les `sources:` du bloc `MeeshyShareExtension` de `project.yml`.
    private func extensionSourcePaths() throws -> [String] {
        let yml = try read("project.yml")
        guard let start = yml.range(of: "\n  MeeshyShareExtension:\n") else { return [] }
        let block = yml[start.upperBound...]
        let end = block.range(of: "\n  MeeshyBroadcastExtension:")?.lowerBound ?? block.endIndex
        return block[..<end]
            .components(separatedBy: "\n")
            .compactMap { line -> String? in
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                guard trimmed.hasPrefix("- path: ") else { return nil }
                return String(trimmed.dropFirst("- path: ".count))
            }
    }

    func test_theExtension_mountsTheSingleShareScreen() throws {
        let controller = ShareSourceCommentStripping.strippingComments(try read("MeeshyShareExtension/ShareViewController.swift"))
        XCTAssertTrue(controller.contains("ShareSheetView(model:"), "L'extension doit monter l'écran unique.")
        XCTAssertTrue(controller.contains("ExtensionShareDirectory(session:"))
        XCTAssertTrue(controller.contains("ExtensionShareDispatcher(shareId:"))
        for retired in ["ShareContentView", "ShareTargetRow", "ForwardPickerModel", "initials", "hexString"] {
            XCTAssertFalse(controller.contains(retired), "« \(retired) » appartient à l'interface retirée de l'extension.")
        }
    }

    func test_projectYml_compilesTheScreen_butNotTheAppServices() throws {
        let paths = try extensionSourcePaths()
        for portable in [
            "ShareSheetView.swift", "ShareSheetView+Actions.swift", "ShareSheetViewModel.swift", "ShareContentZone.swift",
            "ShareIncomingStrip.swift", "ShareRecipient.swift", "ShareRecipientRow.swift", "ShareSendBar.swift",
            "ShareSheetCopy.swift", "ShareDurationRow.swift", "ShareSourcing.swift", "ShareStringsBundle.swift",
            "ShareSubject.swift", "ShareDirectorySnapshot.swift", "ShareRelayHandoff.swift", "EndToEndShareMemory.swift",
        ] {
            XCTAssertTrue(paths.contains("Meeshy/Features/Main/Share/\(portable)"), "\(portable) doit être compilé dans l'extension.")
        }
        for appOnly in ["ShareDispatcher.swift", "ShareRecipientDirectory.swift", "ShareSheetHost+App.swift"] {
            XCTAssertFalse(paths.contains("Meeshy/Features/Main/Share/\(appOnly)"), "\(appOnly) parle aux singletons de l'app.")
        }
    }

    func test_theScreenFilesCompiledIntoTheExtension_nameNoAppSingleton() throws {
        let screenFiles = try extensionSourcePaths().filter { $0.hasPrefix("Meeshy/") }
        XCTAssertFalse(screenFiles.isEmpty)
        for path in screenFiles {
            let code = ShareSourceCommentStripping.strippingComments(try read(path))
            for singleton in ["FeedbackToastManager", "PresenceManager", "LiveShareDispatcher", "LiveShareRecipientDirectory", "AuthManager.shared", "CacheCoordinator", "OfflineQueue.shared"] {
                XCTAssertFalse(code.contains(singleton), "\(path) nomme \(singleton) : l'extension ne l'a pas.")
            }
        }
    }
}
