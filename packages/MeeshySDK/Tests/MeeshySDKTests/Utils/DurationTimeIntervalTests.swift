import Testing
import Foundation
@testable import MeeshySDK

/// #20726 — une `Duration` se lit en secondes par UNE source, `Duration.timeInterval`
/// (`Sources/MeeshyCore/Utils/Duration+TimeInterval.swift`). La conversion était écrite
/// trois fois : l'horloge monotone des appels, le temps du retrait de la pilule (K10)
/// et le délai de repos du défilement.
@Suite("Duration.timeInterval")
struct DurationTimeIntervalTests {

    @Test("zéro vaut zéro")
    func zero() {
        #expect(Duration.zero.timeInterval == 0)
    }

    @Test("une seconde et demie vaut 1,5")
    func secondsAndFraction() {
        #expect(Duration.milliseconds(1500).timeInterval == 1.5)
        #expect(Duration(secondsComponent: 2, attosecondsComponent: 500_000_000_000_000_000).timeInterval == 2.5)
    }

    @Test("un intervalle négatif reste négatif : −50 ms vaut −0,05")
    func negative() {
        #expect(abs(Duration.milliseconds(-50).timeInterval + 0.05) < 1e-12)
        #expect(Duration.seconds(-3).timeInterval == -3)
    }

    @Test("les attosecondes comptent")
    func attoseconds() {
        #expect(Duration(secondsComponent: 0, attosecondsComponent: 1).timeInterval == 1e-18)
        #expect(Duration.nanoseconds(1).timeInterval == 1e-9)
    }

    // MARK: - Une seule source

    private static let sourceUnique = "packages/MeeshySDK/Sources/MeeshyCore/Utils/Duration+TimeInterval.swift"

    private static let racines = [
        "packages/MeeshySDK/Sources",
        "apps/ios/Meeshy",
        "apps/ios/MeeshyBroadcastExtension",
        "apps/ios/MeeshyNotificationContentExtension",
        "apps/ios/MeeshyNotificationExtension",
        "apps/ios/MeeshyShareExtension",
        "apps/ios/MeeshyWidgets",
    ]

    @Test("aucune lecture d'attosecondes hors de la source unique, dans le SDK comme dans l'app")
    func source_noAttosecondsOutsideTheSource() throws {
        let fichiers = Self.racines.flatMap(Self.sourcesSwift(under:))
        #expect(fichiers.count > 100, "la garde doit balayer les sources réelles")
        let trouvees = fichiers
            .filter { $0.chemin != Self.sourceUnique }
            .flatMap { fichier in
                Self.codeLines(fichier.source)
                    .filter { $0.contains("attoseconds") }
                    .map { "\(fichier.chemin): \($0)" }
            }
        #expect(trouvees == [], "une Duration se lit par Duration.timeInterval")
        let source = try Self.code(Self.sourceUnique)
        #expect(source.contains("var timeInterval: TimeInterval"))
    }

    @Test("les trois anciens sites appellent la source unique")
    func source_theThreeSitesCallTheSource() throws {
        let horloge = try Self.code("apps/ios/Meeshy/Features/Call/Services/CallCollaborators/CallLiveClock.swift")
        #expect(horloge.contains("origin.duration(to: ContinuousClock.now).timeInterval"))

        let presence = try Self.code("packages/MeeshySDK/Sources/MeeshyUI/Kit/MeeshyGlassPillPresenceRule.swift")
        #expect(presence.contains("stowedAt.duration(to: now).timeInterval"))

        let defilement = try Self.code("packages/MeeshySDK/Sources/MeeshyUI/Primitives/ScrollMotionVisibility.swift")
        #expect(defilement.contains("settleDelay.timeInterval"))
        #expect(!defilement.contains("func seconds("))
    }

    // MARK: - Aides

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private static func codeLines(_ source: String) -> [String] {
        source
            .components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.hasPrefix("//") }
    }

    private static func code(_ chemin: String) throws -> String {
        let url = repositoryRoot.appendingPathComponent(chemin)
        return codeLines(try String(contentsOf: url, encoding: .utf8)).joined(separator: "\n")
    }

    private static func sourcesSwift(under racine: String) -> [(chemin: String, source: String)] {
        let base = repositoryRoot.standardizedFileURL.path
        let dossier = repositoryRoot.appendingPathComponent(racine)
        guard let enumerateur = FileManager.default.enumerator(at: dossier, includingPropertiesForKeys: nil) else {
            return []
        }
        return enumerateur
            .compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" }
            .compactMap { url in
                guard let source = try? String(contentsOf: url, encoding: .utf8) else { return nil }
                return (String(url.standardizedFileURL.path.dropFirst(base.count + 1)), source)
            }
    }
}
