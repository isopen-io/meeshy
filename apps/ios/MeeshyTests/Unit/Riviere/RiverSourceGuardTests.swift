import XCTest
@testable import Meeshy

/// Gardes source R-133 — la peau `Riviere/View/` (1) ne nomme aucune
/// constante de LOI en dur (garde R15) et (2) ne recalcule/ne CONSTRUIT
/// jamais elle-même une géométrie que seule `RiverLaneResolver` a le droit
/// de produire.
///
/// **Complément à `scripts/check-law-literals.sh`.** Le script couvre déjà
/// `Riviere/**` (hors `Core/**`) pour la liste FIXE de littéraux d'AUTRES
/// lois (focus-curve, scroll-activity, orchestrateur — `900/520/380/0.45/
/// 0.82/…`). Il ne connaît PAS les constantes propres à `river-lanes.ts`
/// (`RIVER_LANE_SILENCE_WINDOW_MS` = 1 800 000, `RIVER_MAX_LANES` = 7,
/// `RIVER_MIN_VOICES` = 3, `RIVER_HEADER_FADE_RANKS` = 2) — ce fichier ferme
/// ce trou pour la seule constante suffisamment DISTINCTIVE pour être
/// grep-able sans faux positif (`1800000`) ; `7`/`3`/`2` sont bannis d'un
/// tour de vis différent, par ABSENCE DE CONSTRUCTION de type de géométrie
/// (ci-dessous), pas par un zéro aveugle sur des entiers omniprésents dans
/// n'importe quel `HStack(spacing:)`.
final class RiverSourceGuardTests: XCTestCase {

    // MARK: - Localisation des sources

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Riviere
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
    }

    private static var viewDirectory: URL {
        iosRoot.appendingPathComponent("Meeshy/Features/Main/Riviere/View")
    }

    /// Tout `.swift` de `Riviere/View/`, DÉCOUVERT au moment du test — jamais
    /// une liste de noms recopiée (leçon 257 : un fichier neuf entre
    /// automatiquement dans le périmètre de la garde).
    private func viewSources() throws -> [(name: String, code: String)] {
        let entries = try FileManager.default.contentsOfDirectory(
            at: Self.viewDirectory,
            includingPropertiesForKeys: nil
        )
        let swiftFiles = entries
            .filter { $0.pathExtension == "swift" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
        return try swiftFiles.map { url in
            (url.lastPathComponent, try String(contentsOf: url, encoding: .utf8))
        }
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }

    // MARK: - Garde d'ensemble (leçon 257)

    func test_guardDiscoversAtLeastOneViewFile_neverSilentlyEmpty() throws {
        let sources = try viewSources()
        XCTAssertFalse(
            sources.isEmpty,
            "RiverSourceGuardTests n'a chargé AUCUN fichier depuis " +
            "`\(Self.viewDirectory.path)` — vérifier `apps/ios/Meeshy/Features/Main/Riviere/View/`. " +
            "Une garde qui charge zéro fichier passe TOUJOURS au vert sans rien vérifier."
        )
    }

    // MARK: - Constante de loi la plus distinctive (silence window)

    func test_silenceWindowLiteral_isAbsent_fromViewFiles() throws {
        for source in try viewSources() {
            let count = occurrences(of: "1800000", in: source.code)
            XCTAssertEqual(
                count, 0,
                "\(source.name) contient « 1800000 » — `RIVER_LANE_SILENCE_WINDOW_MS` " +
                "(constante de loi, `RiverLaneResolver.laneSilenceWindowMs`) : une peau ne doit " +
                "JAMAIS la recopier, la géométrie qui en dépend vient déjà résolue de " +
                "`resolveRiverLanes` (garde R15)."
            )
        }
    }

    // MARK: - Aucune peau ne CONSTRUIT une géométrie — elle la REÇOIT

    /// `RiverGeometry`/`RiverLane`/`RiverBubble`/`RiverLaneSpan`/
    /// `RiverConnector`/`RiverNode` n'ont qu'UN producteur légitime :
    /// `RiverLaneResolver.resolveRiverLanes` (et ses aides). Un appel à leur
    /// initialiseur DANS `View/` serait une géométrie fabriquée à la main,
    /// hors de la loi — exactement ce que le contrat interdit (« la peau
    /// consomme la loi, jamais l'inverse »).
    func test_noSkinFile_constructsRiverGeometryTypesDirectly() throws {
        let forbiddenConstructors = [
            "RiverGeometry(", "RiverLane(", "RiverBubble(",
            "RiverLaneSpan(", "RiverConnector(", "RiverNode(",
        ]
        for source in try viewSources() {
            for constructor in forbiddenConstructors {
                let count = occurrences(of: constructor, in: source.code)
                XCTAssertEqual(
                    count, 0,
                    "\(source.name) contient « \(constructor) » — seule `RiverLaneResolver` a le " +
                    "droit de PRODUIRE une géométrie Rivière ; une peau la REÇOIT et l'affiche, " +
                    "elle ne la construit jamais elle-même."
                )
            }
        }
    }

    // MARK: - Aucun second `PreferenceKey` de cadre concurrent

    /// `RiverBubbleView` publie son cadre via `MessageFramePreferenceKey`
    /// (RÉUTILISÉ, la même primitive que le Fil) — un second `PreferenceKey`
    /// de mesure de cadre dans `Riviere/View/` dupliquerait ce canal.
    /// `HorizontalScrollOffsetKey` (SDK, offset de défilement) reste
    /// autorisé : ce n'est pas un cadre de bulle.
    func test_noSecondFramePreferenceKey_inViewFiles() throws {
        for source in try viewSources() {
            let count = occurrences(of: "PreferenceKey", in: source.code)
            let declaresOwnKey = source.code.contains(": PreferenceKey")
            XCTAssertFalse(
                declaresOwnKey,
                "\(source.name) déclare son PROPRE `PreferenceKey` (\(count) occurrence(s) du " +
                "mot) — `Riviere/View/` doit réutiliser `MessageFramePreferenceKey` (cadre de " +
                "bulle) et `HorizontalScrollOffsetKey` (offset de défilement, SDK), jamais en " +
                "déclarer un troisième."
            )
        }
    }
}
