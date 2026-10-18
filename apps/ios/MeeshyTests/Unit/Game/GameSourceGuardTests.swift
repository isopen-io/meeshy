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

    // MARK: - Aucun jeton de parrainage sans geste (#7742)

    /// L'ouverture du déroulé LIT le jeton qui existe ; seul « Partager » en CRÉE un. Un témoin de COMPORTEMENT
    /// le tient (`GamePhotoSessionTests`) ; celui-ci tient la SOURCE : ni la vue ni la lecture d'ouverture ne
    /// nomment la création.
    func test_openingThePhotoFlowNeverReachesTheTokenCreation() throws {
        let photo = iosRoot.appendingPathComponent("Meeshy/Features/Main/Game/Photo")
        let session = try String(contentsOf: photo.appendingPathComponent("GamePhotoSession.swift"), encoding: .utf8)
        let opening = try XCTUnwrap(session.components(separatedBy: "func prepareReferral()").dropFirst().first?
            .components(separatedBy: "func prepareShare()").first)
        XCTAssertFalse(opening.contains("shareableLink"), "prepareReferral s'exécute à l'ouverture : il ne crée aucun jeton")
        XCTAssertTrue(opening.contains("existingLink"))

        let view = try String(contentsOf: photo.appendingPathComponent("GamePhotoFlowView.swift"), encoding: .utf8)
        XCTAssertFalse(view.contains("shareableLink"), "la vue ne parle qu'à la session")
        XCTAssertTrue(view.contains("prepareShare()"), "« Partager » crée le jeton, puis ouvre la feuille")
    }

    // MARK: - Le cadre est le déclencheur (#10284)

    /// Directive porteur 2026-10-12 : « le cadre sont les bouton d'enregistrement ». Le déroulé du jeu ne
    /// porte AUCUN cercle d'enregistrement à côté du cadre : la case du cadre déclenche, la scène prend hors cadre.
    func test_thePhotoFlowHasNoRecordCircleBesideTheFrame() throws {
        let photo = iosRoot.appendingPathComponent("Meeshy/Features/Main/Game/Photo")
        let view = try String(contentsOf: photo.appendingPathComponent("GamePhotoFlowView.swift"), encoding: .utf8)
        XCTAssertFalse(view.contains("game.photo.shutter"), "plus de déclencheur rond à côté du cadre")
        XCTAssertFalse(view.contains("session.shutter("), "la prise passe par la table des gestes")
        XCTAssertTrue(view.contains("game.photo.frame_trigger"), "la case du cadre est le déclencheur")
        XCTAssertTrue(view.contains("on: .chosenThumbnail"), "la case du cadre lit la table des gestes du composer")
        XCTAssertTrue(view.contains("on: .scene"), "la scène prend hors cadre")
    }

    // MARK: - Le déroulé plein écran noir se dessine en apparence sombre (#10294)

    /// Le déroulé dessine sur fond noir : un contrôle système (sélecteur de format, interrupteurs) qui suivrait
    /// l'apparence CLAIRE de l'appareil y poserait un texte sombre sur du noir. Le schéma sombre est imposé à
    /// TOUT le déroulé, à sa racine — jamais contrôle par contrôle, qu'un ajout oublierait.
    func test_thePhotoFlowForcesTheDarkAppearanceAtItsRoot() throws {
        let photo = iosRoot.appendingPathComponent("Meeshy/Features/Main/Game/Photo")
        let view = try String(contentsOf: photo.appendingPathComponent("GamePhotoFlowView.swift"), encoding: .utf8)
        let body = try XCTUnwrap(view.components(separatedBy: "var body: some View {").dropFirst().first?
            .components(separatedBy: "private var closeButton").first)
        XCTAssertTrue(body.contains(".environment(\\.colorScheme, .dark)"),
                      "le corps du déroulé impose l'apparence sombre à tout ce qu'il contient")
        XCTAssertFalse(view.contains(".preferredColorScheme("),
                       "l'apparence se fixe pour le déroulé seul, jamais pour la fenêtre qui le présente")
    }

    // MARK: - La note de caméra refusée ne recouvre pas le cadre (#10295)

    /// La note de refus était posée au centre de l'aperçu, PAR-DESSUS le titre et la date du cadre du moment :
    /// les deux textes se chevauchaient. Elle vit désormais HORS du cadre, sous lui, et la scène ne la porte plus.
    func test_theCameraFailureNoteLivesOutsideTheFrame() throws {
        let photo = iosRoot.appendingPathComponent("Meeshy/Features/Main/Game/Photo")
        let view = try String(contentsOf: photo.appendingPathComponent("GamePhotoFlowView.swift"), encoding: .utf8)
        let camera = try XCTUnwrap(view.components(separatedBy: "private func camera(_ phase: PhotoCameraPhase)").dropFirst().first?
            .components(separatedBy: "private func sideGlyph").first)
        let scene = try XCTUnwrap(camera.components(separatedBy: "framed { size in").dropFirst().first?
            .components(separatedBy: ".accessibilityIdentifier(\"game.photo.scene\")").first)
        XCTAssertFalse(scene.contains("failureNote("), "la note ne se pose plus sur le cadre du moment")
        let belowTheFrame = try XCTUnwrap(camera.components(separatedBy: ".accessibilityIdentifier(\"game.photo.scene\")").dropFirst().first?
            .components(separatedBy: "HStack(alignment: .top").first)
        XCTAssertTrue(belowTheFrame.contains("failureNote("), "la note se dit sous le cadre, avant la bande des déclencheurs")
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
        "game.constellation.title", "game.constellation.kind.halo",
        "game.chest.reward.points", "game.meeshes.one",
        "game.meeshes.other",
        "game.actions.one", "game.actions.other", "game.tier.constellation", "game.rank.oracle",
        "game.guide.speaker.mee", "game.guide.speaker.meo", "game.mission.progress", "game.photo.format.story", "game.photo.trophy.mission",
        "game.photo.title.prestige", "game.mint.row.badges", "game.material.bronze",
        "game.concept.points.name", "game.concept.meesh.name", "game.concept.prestige.name", "game.concept.badges.name",
        "game.concept.atlas.name", "game.concept.card.a11y", "game.concept.ratio", "game.concept.value.factor",
        "game.concept.fact.zone",
        // Les paliers ouverts au-delà de 100 (#9688) : des noms d'astronomie que l'anglais écrit comme le français.
        "game.tier.pulsar", "game.tier.quasar", "game.tier.supernova", "game.tier.cosmos",
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
                } else if let forms = ((content as? [String: Any])?["variations"] as? [String: Any])?["plural"] as? [String: Any],
                          let other = (forms["other"] as? [String: Any])?["stringUnit"] as? [String: Any],
                          let text = other["value"] as? String {
                    // Une clé aux variations plurielles (#10846) : sa forme « other » la représente.
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

    /// Les clés aux variations PLURIELLES (#10846) : la variation se choisit sur un ENTIER (`%lld`) — le seul cas où un
    /// entier nu est légitime, `String(localized:)` le formatant déjà selon la langue.
    private func pluralKeys() throws -> Set<String> {
        let data = try Data(contentsOf: iosRoot.appendingPathComponent("Meeshy/Localizable.xcstrings"))
        let strings = ((try JSONSerialization.jsonObject(with: data) as? [String: Any])?["strings"] as? [String: Any]) ?? [:]
        return Set(strings.compactMap { key, value in
            let localizations = ((value as? [String: Any])?["localizations"] as? [String: Any]) ?? [:]
            return localizations.values.contains { (($0 as? [String: Any])?["variations"] as? [String: Any])?["plural"] != nil } ? key : nil
        })
    }

    func test_everyTranslationKeepsThePlaceholdersOfTheSource() throws {
        let plural = try pluralKeys()
        for (key, perLocale) in try gameCatalogEntries() {
            let source = perLocale["fr"] ?? ""
            let expected = source.components(separatedBy: "%@").count
            let expectedIntegers = source.components(separatedBy: "%lld").count
            for locale in locales {
                let text = perLocale[locale] ?? ""
                XCTAssertEqual(text.components(separatedBy: "%@").count, expected, "\(key) [\(locale)] : les %@ ne correspondent pas à la source")
                if plural.contains(key) {
                    XCTAssertEqual(text.components(separatedBy: "%lld").count, expectedIntegers, "\(key) [\(locale)] : les %lld ne correspondent pas à la source")
                } else {
                    XCTAssertFalse(text.contains("%lld") || text.contains("%d"), "\(key) [\(locale)] : un entier nu dans un trou de chaîne")
                }
            }
        }
    }
}
