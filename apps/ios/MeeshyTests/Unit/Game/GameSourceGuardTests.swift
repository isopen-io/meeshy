import XCTest

/// Les gardes de SOURCE du jeu (#9379, #9381, #9382, #9383) — ce qu'aucun test de
/// comportement ne voit parce que c'est une ABSENCE ou une dépendance de fichier.
final class GameSourceGuardTests: XCTestCase {

    private var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Game
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // ios
    }

    private func swiftFiles(under relative: String) throws -> [URL] {
        let base = iosRoot.appendingPathComponent(relative)
        guard let walker = FileManager.default.enumerator(at: base, includingPropertiesForKeys: nil) else { return [] }
        return walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    // MARK: - Aucune image n'est envoyée au serveur

    /// « La photo reste sur l'appareil tant qu'on ne la partage pas. » — le déroulé photo
    /// n'a aucun chemin vers le réseau : ni client d'API, ni session, ni téléversement.
    func test_thePhotoFlowNeverTouchesTheNetwork() throws {
        let forbidden = ["URLSession", "APIClient", "TusUpload", "upload(", "MediaUpload", "StoryUpload", "multipart",
                         "AffiliateService", "CacheCoordinator"]
        let files = try swiftFiles(under: "Meeshy/Features/Main/Game/Photo")
        XCTAssertGreaterThan(files.count, 6, "le balayage ne voit presque rien : le dossier a bougé")
        for file in files {
            let text = try String(contentsOf: file, encoding: .utf8)
            for word in forbidden {
                XCTAssertFalse(text.contains(word), "\(file.lastPathComponent) touche au réseau (« \(word) ») : aucune image ne part au serveur")
            }
        }
    }

    // MARK: - Les clés d'usage et la fréquence d'images

    private func infoPlist() throws -> [String: Any] {
        let data = try Data(contentsOf: iosRoot.appendingPathComponent("Meeshy/Info.plist"))
        return (try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any]) ?? [:]
    }

    func test_theCameraAndPhotoAddUsageKeysAreDeclared() throws {
        let plist = try infoPlist()
        XCTAssertFalse((plist["NSCameraUsageDescription"] as? String ?? "").isEmpty, "le selfie demande la caméra")
        XCTAssertFalse((plist["NSPhotoLibraryAddUsageDescription"] as? String ?? "").isEmpty, "« Enregistrer » écrit dans Photos (ajout seul)")
    }

    func test_theGalleryFallbackNeedsNoLibraryReadPermission() throws {
        let text = try swiftFiles(under: "Meeshy/Features/Main/Game/Photo")
            .map { try String(contentsOf: $0, encoding: .utf8) }
            .joined()
        XCTAssertTrue(text.contains("PhotosPicker"), "le repli galerie passe par PhotosPicker, hors processus")
        XCTAssertFalse(text.contains("ensurePhotoLibraryRead"), "le repli galerie ne demande aucune autorisation de lecture")
    }

    /// Sans cette clé, un iPhone ProMotion plafonne les animations d'une app à 60 images
    /// par seconde — les chorégraphies visent 120.
    func test_theAppAsksForProMotionFrameRates() throws {
        XCTAssertEqual(try infoPlist()["CADisableMinimumFrameDurationOnPhone"] as? Bool, true)
    }

    // MARK: - Rien d'animé hors écran

    /// Une chorégraphie se lit par `TimelineView` (qui se suspend hors écran) et se met en
    /// pause (`paused:`) au repos : aucune minuterie, aucun lien d'affichage laissé vivant.
    func test_theChoreographiesLeaveNoTimerNorDisplayLinkRunning() throws {
        for file in try swiftFiles(under: "Meeshy/Features/Main/Game/Choreography") {
            let text = try String(contentsOf: file, encoding: .utf8)
            for word in ["Timer.scheduledTimer", "CADisplayLink", "Timer.publish"] {
                XCTAssertFalse(text.contains(word), "\(file.lastPathComponent) : « \(word) » tourne hors écran")
            }
        }
        let clock = try String(contentsOf: iosRoot.appendingPathComponent("Meeshy/Features/Main/Game/Choreography/ChoreographyClock.swift"), encoding: .utf8)
        XCTAssertTrue(clock.contains("paused: !running"))
    }

    /// Les shaders se compilent AVANT la célébration, jamais pendant : la brique du SDK sait
    /// le faire (`GameShaders.precompile`) ; l'app doit l'appeler à l'ouverture de l'écran.
    func test_theShadersArePrecompiledWhenProgressionOpens() throws {
        let text = try String(contentsOf: iosRoot.appendingPathComponent("Meeshy/Features/Main/Views/ProgressionView.swift"), encoding: .utf8)
        XCTAssertTrue(text.contains("GameShaders.precompile()"))
    }

    /// CoreHaptics appelle `resetHandler` sur SA file. Une fermeture écrite dans une classe
    /// `@MainActor` hérite de cet isolement en Swift 6, et le contrôle d'exécuteur inséré
    /// à son entrée fait planter l'app au premier redémarrage du moteur (services média
    /// réinitialisés). `@Sendable` la détache ; elle ne revient au `MainActor` que par sa tâche.
    func test_theHapticEngineResetHandlerIsNotIsolatedToTheMainActor() throws {
        let text = try String(contentsOf: iosRoot.appendingPathComponent("Meeshy/Features/Main/Game/Choreography/GameHaptics.swift"), encoding: .utf8)
        XCTAssertTrue(text.contains("resetHandler = { @Sendable"), "le gestionnaire de réinitialisation tourne hors du fil principal")
    }

    // MARK: - Sept langues, traduites et non recopiées

    private let locales = ["fr", "en", "es", "de", "it", "pt-BR", "ar"]

    /// Les seules clés dont l'anglais est légitimement identique au français.
    private let sameInEnglish: Set<String> = [
        "game.chest.reward.points", "game.points.one", "game.points.other", "game.meeshes.one", "game.meeshes.other",
        "game.actions.one", "game.actions.other", "game.tier.constellation", "game.rank.oracle",
        "game.guide.speaker.mee", "game.guide.speaker.meo", "game.mission.progress", "game.photo.format.story",
        "game.photo.title.prestige", "game.mint.row.badges", "game.material.bronze",
    ]

    private func gameCatalogEntries() throws -> [String: [String: String]] {
        let data = try Data(contentsOf: iosRoot.appendingPathComponent("Meeshy/Localizable.xcstrings"))
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let strings = root["strings"] as? [String: Any] else { return [:] }
        var table: [String: [String: String]] = [:]
        for (key, value) in strings where key.hasPrefix("game.") || key == "onboarding.recap.game" {
            guard let localizations = (value as? [String: Any])?["localizations"] as? [String: Any] else { continue }
            var perLocale: [String: String] = [:]
            for (locale, content) in localizations {
                if let unit = (content as? [String: Any])?["stringUnit"] as? [String: Any], let text = unit["value"] as? String {
                    perLocale[locale] = text
                }
            }
            table[key] = perLocale
        }
        return table
    }

    func test_everyGameKeyIsTranslatedInTheSevenLanguages() throws {
        let table = try gameCatalogEntries()
        XCTAssertGreaterThan(table.count, 300, "le jeu a plus de trois cents clés")
        for (key, perLocale) in table {
            for locale in locales {
                XCTAssertFalse((perLocale[locale] ?? "").isEmpty, "\(key) : pas de \(locale)")
            }
        }
    }

    func test_theEnglishIsTranslated_notCopiedFromTheFrench() throws {
        for (key, perLocale) in try gameCatalogEntries() where !sameInEnglish.contains(key) {
            XCTAssertNotEqual(perLocale["en"], perLocale["fr"], "\(key) : l'anglais est le français recopié")
        }
    }

    func test_everyTranslationKeepsThePlaceholdersOfTheSource() throws {
        for (key, perLocale) in try gameCatalogEntries() {
            let source = perLocale["fr"] ?? ""
            let expected = source.components(separatedBy: "%@").count
            for locale in locales {
                let text = perLocale[locale] ?? ""
                XCTAssertEqual(text.components(separatedBy: "%@").count, expected, "\(key) [\(locale)] : les %@ ne correspondent pas à la source")
                XCTAssertFalse(text.contains("%lld") || text.contains("%d"), "\(key) [\(locale)] : un entier nu dans un trou de chaîne")
            }
        }
    }
}
