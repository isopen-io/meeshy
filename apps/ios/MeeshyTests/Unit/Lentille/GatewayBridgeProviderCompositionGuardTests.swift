import XCTest
@testable import Meeshy

/// Garde de STRUCTURE pour la bascule d'injection P7 (G-124).
///
/// Trois lois, verrouillées sur du code normalisé (`AppSourceGuard
/// .stripComments`, même patron que `LentilleRowMuxSourceGuardTests`) :
/// 1. **Peau muette** — aucun fichier de `Lentille/Row/`, `Lentille/Mode/`,
///    `Lentille/Chrome/` (découverte DYNAMIQUE, leçon 257 — jamais une liste
///    recopiée) ne nomme `GatewayBridgeProvider` ni `LocalBridgeProvider` :
///    l'en-tête de `LentilleProviders.swift` l'exige explicitement
///    (« l'injection vit au point de composition, jamais dans les vues »).
/// 2. **Composition root parle** — `ConversationListViewModel.swift` nomme
///    `GatewayBridgeProvider` ET l'alimente derrière
///    `LentilleFeatureFlag.isLentilleListEnabled` (R19 : câblage sous
///    drapeau).
/// 3. **Préférence serveur, même discipline** — le point de composition du
///    volet « préférence serveur » (`MeeshyApp.swift`) branche
///    `onReadingModePreferenceChanged` derrière
///    `LentilleFeatureFlag.isReadingModesEnabled`.
final class GatewayBridgeProviderCompositionGuardTests: XCTestCase {

    // MARK: - Localisation

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Lentille
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
    }

    private func source(at relativePath: String) throws -> String {
        try String(contentsOf: Self.iosRoot.appendingPathComponent(relativePath), encoding: .utf8)
    }

    private func normalizedCode(_ source: String) -> String {
        AppSourceGuard.stripComments(source)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    /// Tout `.swift` d'un dossier de peau donné — découvert au moment du
    /// test, jamais recopié à la main (même discipline que
    /// `LentilleRowSourceGuardTests.rowSources`).
    private func swiftSources(inDirectory relativePath: String) throws -> [(name: String, code: String)] {
        let dir = Self.iosRoot.appendingPathComponent(relativePath)
        let entries = try FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
        let swiftFiles = entries
            .filter { $0.pathExtension == "swift" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
        return try swiftFiles.map { url in
            (url.lastPathComponent, try String(contentsOf: url, encoding: .utf8))
        }
    }

    private static let skinDirectories = [
        "Meeshy/Features/Main/Lentille/Row",
        "Meeshy/Features/Main/Lentille/Mode",
        "Meeshy/Features/Main/Lentille/Chrome",
    ]

    private static let forbiddenProviderNames = ["GatewayBridgeProvider", "LocalBridgeProvider"]

    // MARK: - 1. Peau muette

    func test_skinDirectories_areNonEmpty_soThisGuardActuallyCoversFiles() throws {
        for directory in Self.skinDirectories {
            let sources = try swiftSources(inDirectory: directory)
            XCTAssertFalse(
                sources.isEmpty,
                "\(directory) n'a livré AUCUN fichier .swift — la garde ci-dessous ne couvrirait rien " +
                "(leçon 257 : une découverte dynamique doit prouver qu'elle a trouvé quelque chose)."
            )
        }
    }

    func test_noSkinFile_namesLocalOrGatewayBridgeProvider() throws {
        for directory in Self.skinDirectories {
            for (name, code) in try swiftSources(inDirectory: directory) {
                let normalized = normalizedCode(code)
                for forbidden in Self.forbiddenProviderNames {
                    XCTAssertFalse(
                        normalized.contains(forbidden),
                        "\(directory)/\(name) nomme \(forbidden) — l'en-tête de LentilleProviders.swift " +
                        "interdit explicitement ce nom dans un fichier de peau (Lentille/Row, Lentille/Mode, " +
                        "Lentille/Chrome) : l'injection vit au point de composition, jamais dans les vues."
                    )
                }
            }
        }
    }

    // MARK: - 2. Composition root — ConversationListViewModel

    private func viewModelSource() throws -> String {
        try source(at: "Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift")
    }

    func test_conversationListViewModel_namesGatewayBridgeProvider() throws {
        let code = normalizedCode(try viewModelSource())
        XCTAssertTrue(
            code.contains("let gatewayBridgeProvider = GatewayBridgeProvider()"),
            "Le point de composition (ConversationListViewModel) doit construire GatewayBridgeProvider — " +
            "c'est l'injection que R-c réclame."
        )
    }

    /// Le câblage doit vivre DANS le `didSet` de `conversations`, DERRIÈRE
    /// `LentilleFeatureFlag.isLentilleListEnabled` — même garde que
    /// `LentilleRowMuxSourceGuardTests.test_rowCore_isGatedByLentilleFeatureFlag`,
    /// adaptée à ce site d'appel.
    func test_conversationListViewModel_feedsGatewayBridgeProvider_behindTheLentilleFlag() throws {
        let code = normalizedCode(try viewModelSource())
        XCTAssertTrue(
            code.contains(
                "didSet { _convIdIndex = nil if LentilleFeatureFlag.isLentilleListEnabled { " +
                "gatewayBridgeProvider.noteBridges(from: conversations) } }"
            ),
            "gatewayBridgeProvider.noteBridges(from:) doit être appelé dans le didSet de `conversations`, " +
            "gardé par LentilleFeatureFlag.isLentilleListEnabled — câblage sous drapeau (R19)."
        )
    }

    /// `noteBridges` ne doit apparaître qu'UNE fois dans ce fichier — un
    /// second site d'appel diviserait la source de vérité de « qui nourrit
    /// le registre ».
    func test_conversationListViewModel_callsNoteBridges_exactlyOnce() throws {
        let code = normalizedCode(try viewModelSource())
        let count = code.components(separatedBy: "gatewayBridgeProvider.noteBridges(from:").count - 1
        XCTAssertEqual(count, 1, "noteBridges(from:) doit avoir un site d'appel UNIQUE dans le composition root")
    }

    // MARK: - 3. Composition root — préférence serveur (MeeshyApp.swift)

    private func appSource() throws -> String {
        try source(at: "Meeshy/MeeshyApp.swift")
    }

    func test_meeshyApp_wiresOnReadingModePreferenceChanged() throws {
        let code = normalizedCode(try appSource())
        XCTAssertTrue(
            code.contains("ConversationStoreSocketBridge.shared.activate( onReadingModePreferenceChanged:"),
            "MeeshyApp doit brancher onReadingModePreferenceChanged sur l'activation du bridge socket (G-124, volet préférence serveur)."
        )
    }

    func test_meeshyApp_readingModeWrite_isGatedByReadingModesFlag() throws {
        let code = normalizedCode(try appSource())
        XCTAssertTrue(
            code.contains("guard LentilleFeatureFlag.isReadingModesEnabled, let value = ReadingModePreference(rawValue: rawReadingMode) else { return }"),
            "L'écriture de la préférence reçue par socket doit être gardée par " +
            "LentilleFeatureFlag.isReadingModesEnabled — même drapeau que ses trois autres points d'entrée."
        )
    }

    func test_meeshyApp_readingModeWrite_targetsTheSharedScopedStore() throws {
        let code = normalizedCode(try appSource())
        XCTAssertTrue(
            code.contains("await LentilleReadingModePreferenceCenter.shared.set("),
            "L'écriture doit passer par LentilleReadingModePreferenceCenter.shared — LE magasin scopé partagé " +
            "des trois autres points d'entrée (encoche, sous-menu, fil ouvert), jamais un second magasin."
        )
    }

    // MARK: - GatewayBridgeProvider lui-même conforme au protocole

    func test_gatewayBridgeProvider_conformsToConversationBridgeProviding() throws {
        let code = normalizedCode(try source(
            at: "Meeshy/Features/Main/Lentille/Core/GatewayBridgeProvider.swift"
        ))
        XCTAssertTrue(
            code.contains("final class GatewayBridgeProvider: ConversationBridgeProviding"),
            "GatewayBridgeProvider doit conformer explicitement à ConversationBridgeProviding (LWS-2bis)."
        )
    }
}
